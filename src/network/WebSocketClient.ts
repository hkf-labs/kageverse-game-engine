import { EventDispatcher } from './EventDispatcher';
import {
    REALTIME_CLOSE_CODES,
    type ClientEvent,
    type ServerEvent,
    type ServerEventType,
} from './protocol/events';

const WS_BASE_URL =
    (import.meta.env.VITE_WS_BASE_URL as string | undefined) ||
    deriveWSBase((import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8080/api/v1');

function deriveWSBase(apiBase: string): string {
    // VITE_API_BASE_URL example: http://localhost:8080/api/v1 → ws://localhost:8080
    try {
        const url = new URL(apiBase);
        const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${url.host}`;
    } catch {
        return 'ws://localhost:8080';
    }
}

const PING_INTERVAL_MS = 25_000; // app-level ping; WS protocol ping cũng 54s ở BE
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 8_000]; // cap 8s, infinite

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export type CloseReason =
    | { kind: 'auth_failed' }
    | { kind: 'session_replaced' }
    | { kind: 'server_shutdown' }
    | { kind: 'manual' }
    | { kind: 'network' };

export type WSClientCallbacks = {
    /** Tokens + reauth ở app layer — client gọi mỗi lần mở connection để lấy token mới. */
    getToken: () => string | null;
    /** Notify app khi BE đẩy session_replaced (close 4010). App phải clear tokens + redirect login. */
    onSessionReplaced?: () => void;
    /** Notify khi auth fail ở handshake (close 4001 / non-101). App redirect login. */
    onAuthFailed?: () => void;
    /** Notify state change cho UI hiển thị "Reconnecting..." badge nếu cần. */
    onStateChanged?: (state: ConnectionState) => void;
};

// WSClient là singleton phục vụ toàn app. Reuse 1 connection xuyên suốt
// session login → game scenes. Disconnect chỉ khi logout hoặc server kick.
//
// Auto-reconnect 1→2→4→8s cap (infinite) trừ khi close code là auth_failed
// hoặc session_replaced — cả hai cần app intervene (re-login).
export class WSClient {
    public readonly events = new EventDispatcher();

    private socket: WebSocket | null = null;
    private state: ConnectionState = 'idle';
    private callbacks: WSClientCallbacks | null = null;
    private pingTimer: number | null = null;
    private reconnectTimer: number | null = null;
    private reconnectAttempts = 0;
    private manualClose = false;
    private outboundQueue: ClientEvent[] = [];

    /** Lazy connect — gọi sau login thành công. Idempotent: nếu đã open, no-op. */
    connect(callbacks: WSClientCallbacks): void {
        this.callbacks = callbacks;
        this.manualClose = false;
        if (this.state === 'open' || this.state === 'connecting') return;
        this.openSocket();
    }

    /** Disconnect chủ động (logout). Không reconnect. */
    disconnect(): void {
        this.manualClose = true;
        this.clearReconnectTimer();
        this.clearPingTimer();
        this.outboundQueue = [];
        if (this.socket) {
            try {
                this.socket.close(1000, 'client_logout');
            } catch {
                // ignore
            }
            this.socket = null;
        }
        this.setState('closed');
        this.events.clear();
    }

    /** Send 1 message — queue nếu chưa open. */
    send(evt: ClientEvent): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(evt));
            } catch (err) {
                console.error('[realtime] send failed', err);
            }
            return;
        }
        // Pending — queue, sẽ flush khi onopen.
        this.outboundQueue.push(evt);
    }

    getState(): ConnectionState { return this.state; }

    private openSocket(): void {
        if (!this.callbacks) return;
        const token = this.callbacks.getToken();
        if (!token) {
            // No token → app sẽ redirect login từ trên.
            this.setState('closed');
            this.callbacks.onAuthFailed?.();
            return;
        }

        this.setState(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
        const url = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`;

        let socket: WebSocket;
        try {
            socket = new WebSocket(url);
        } catch (err) {
            console.error('[realtime] WS construct failed', err);
            this.scheduleReconnect();
            return;
        }
        this.socket = socket;

        socket.onopen = () => {
            this.reconnectAttempts = 0;
            this.setState('open');
            this.flushQueue();
            this.startPingTimer();
        };

        socket.onmessage = (msg) => {
            this.handleRawMessage(msg.data);
        };

        socket.onerror = (e) => {
            // Note: WebSocket error event không có code/reason — đợi onclose
            // mới biết chi tiết.
            console.warn('[realtime] WS error', e);
        };

        socket.onclose = (e) => {
            this.clearPingTimer();
            this.socket = null;
            const reason = classifyClose(e.code);
            switch (reason.kind) {
                case 'session_replaced':
                    this.setState('closed');
                    this.callbacks?.onSessionReplaced?.();
                    break;
                case 'auth_failed':
                    this.setState('closed');
                    this.callbacks?.onAuthFailed?.();
                    break;
                case 'manual':
                    this.setState('closed');
                    break;
                case 'server_shutdown':
                case 'network':
                default:
                    if (this.manualClose) {
                        this.setState('closed');
                    } else {
                        this.scheduleReconnect();
                    }
                    break;
            }
        };
    }

    private handleRawMessage(raw: unknown): void {
        if (typeof raw !== 'string') return;
        let parsed: ServerEvent;
        try {
            parsed = JSON.parse(raw) as ServerEvent;
        } catch (err) {
            console.warn('[realtime] non-JSON message', err);
            return;
        }
        if (!parsed || typeof parsed.t !== 'string') return;
        // pong handled inline (không spam dispatcher).
        if (parsed.t === 'pong') return;
        if (!isKnownServerEventType(parsed.t)) {
            console.warn('[realtime] unknown event type', parsed.t);
            return;
        }
        this.events.dispatch(parsed);
    }

    private flushQueue(): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        const pending = this.outboundQueue;
        this.outboundQueue = [];
        for (const evt of pending) {
            try {
                this.socket.send(JSON.stringify(evt));
            } catch (err) {
                console.error('[realtime] flush send failed', err);
            }
        }
    }

    private startPingTimer(): void {
        this.clearPingTimer();
        this.pingTimer = window.setInterval(() => {
            this.send({ t: 'ping', p: {} });
        }, PING_INTERVAL_MS);
    }

    private clearPingTimer(): void {
        if (this.pingTimer !== null) {
            window.clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private scheduleReconnect(): void {
        this.clearReconnectTimer();
        const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)];
        this.reconnectAttempts += 1;
        this.setState('reconnecting');
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.openSocket();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private setState(s: ConnectionState): void {
        if (this.state === s) return;
        this.state = s;
        this.callbacks?.onStateChanged?.(s);
    }
}

function classifyClose(code: number): CloseReason {
    if (code === REALTIME_CLOSE_CODES.AUTH_FAILED) return { kind: 'auth_failed' };
    if (code === REALTIME_CLOSE_CODES.SESSION_REPLACED) return { kind: 'session_replaced' };
    if (code === REALTIME_CLOSE_CODES.SERVER_SHUTDOWN) return { kind: 'server_shutdown' };
    if (code === 1000) return { kind: 'manual' };
    return { kind: 'network' };
}

function isKnownServerEventType(t: string): t is ServerEventType {
    switch (t as ServerEventType) {
        case 'char_stats':
        case 'char_level_up':
        case 'snapshot_position':
        case 'map_snapshot':
        case 'player_joined':
        case 'player_moved':
        case 'player_left':
        case 'chat_message':
        case 'chat_history':
        case 'pong':
        case 'error':
            return true;
    }
    return false;
}

// Singleton instance — toàn app dùng chung.
export const wsClient = new WSClient();
