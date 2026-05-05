import * as Phaser from 'phaser';
import { t } from '../../i18n';
import { wsClient } from '../../network/WebSocketClient';
import {
    CHAT_ERROR_CODES,
    type ChatChannel,
    type ChatHistoryPayload,
    type ChatMessagePayload,
    type ErrorPayload,
} from '../../network/protocol/events';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';

// Số message giữ trong buffer cho từng tab. Vượt → drop oldest. Tránh
// memory leak khi player chat 1 ngày dài. UI scroll mượt với 200.
const MAX_BUFFER_PER_TAB = 200;

// Limit fetch history mỗi lần. Server cap 100; FE 50 đủ cho 1 lần fetch.
const HISTORY_FETCH_LIMIT = 50;

// Throttle cooldown FE-side (chỉ disable nút send tạm thời) — thực tế
// rate-limit do server enforce. FE feedback nhanh để UX không trống trải.
const SEND_DEBOUNCE_MS = 200;

type Tab = 'current' | 'world';

export class ChatPanel implements GameComponent {
    private overlay?: HTMLDivElement;
    private rootEl?: HTMLDivElement;
    private inputEl?: HTMLInputElement;
    private messagesEl?: HTMLDivElement;
    private sendBtn?: HTMLButtonElement;
    private statusEl?: HTMLDivElement;
    private visible = false;
    private scene: Phaser.Scene;

    private activeTab: Tab = 'current';
    private buffers: Record<Tab, ChatMessagePayload[]> = {
        current: [],
        world: [],
    };
    private worldHistoryFetched = false;
    private rtUnsubs: Array<() => void> = [];
    private lastSendAt = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
        this.overlay.classList.add('kageverse-overlay', 'kageverse-overlay-chat');
        Object.assign(this.overlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.35)',
            zIndex: '100', display: 'none',
        });
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.toggle();
        });
        parent.style.position = 'relative';
        parent.appendChild(this.overlay);

        const root = document.createElement('div');
        this.rootEl = root;
        Object.assign(root.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(700px, 75vw)',
            height: 'min(360px, 55vh)',
            background: 'rgba(26,18,8,0.96)',
            border: '3px solid #e29e4a',
            borderRadius: '14px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'system-ui, sans-serif',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        });

        root.innerHTML = [
            `<div style="display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;">`,
            `<div id="tab-current" style="flex:1;text-align:center;padding:8px 0;cursor:pointer;font-size:13px;font-weight:bold;color:#ffea7a;background:#6b3a14;border-bottom:2px solid #ffea7a;">Hiện tại</div>`,
            `<div id="tab-world" style="flex:1;text-align:center;padding:8px 0;cursor:pointer;font-size:13px;font-weight:bold;color:#ffe4c4;background:transparent;border-bottom:2px solid transparent;">Thế giới</div>`,
            `<div id="chat-close" style="width:36px;text-align:center;cursor:pointer;font-size:18px;font-weight:bold;color:#ff8a8a;padding:8px 0;flex-shrink:0;">&#10005;</div>`,
            `</div>`,
            `<div id="chat-messages" style="flex:1;overflow-y:auto;padding:10px 12px;font-size:13px;line-height:1.5;"></div>`,
            `<div id="chat-status" style="display:none;padding:4px 12px;font-size:11px;color:#ff8a8a;background:rgba(80,20,20,0.4);"></div>`,
            `<div style="display:flex;gap:8px;padding:8px 10px;border-top:2px solid #4d2d13;background:rgba(45,26,10,0.8);flex-shrink:0;">`,
            `<input id="chat-input" type="text" maxlength="256" placeholder="${t('chat.input_placeholder')}" style="flex:1;height:34px;border-radius:6px;border:2px solid #4d2d13;background:#fff5e0;padding:0 10px;font-family:system-ui,sans-serif;font-size:14px;color:#2a1808;outline:none;box-sizing:border-box;" />`,
            `<button id="chat-send" style="width:70px;height:34px;border-radius:6px;border:2px solid #e29e4a;background:#6b3a14;color:#ffea7a;font-size:14px;font-weight:bold;font-family:system-ui,sans-serif;cursor:pointer;">Gửi</button>`,
            `</div>`,
        ].join('');

        this.overlay.appendChild(root);

        this.inputEl = root.querySelector('#chat-input') as HTMLInputElement;
        this.messagesEl = root.querySelector('#chat-messages') as HTMLDivElement;
        this.sendBtn = root.querySelector('#chat-send') as HTMLButtonElement;
        this.statusEl = root.querySelector('#chat-status') as HTMLDivElement;
        const tabCurrent = root.querySelector('#tab-current') as HTMLDivElement;
        const tabWorld = root.querySelector('#tab-world') as HTMLDivElement;
        const closeBtn = root.querySelector('#chat-close') as HTMLDivElement;

        tabCurrent.addEventListener('click', () => this.setActiveTab('current'));
        tabWorld.addEventListener('click', () => this.setActiveTab('world'));
        closeBtn.addEventListener('click', () => this.toggle());
        this.sendBtn.addEventListener('click', () => this.handleSend());

        this.inputEl.addEventListener('focus', () => this.scene.input.keyboard?.disableGlobalCapture());
        this.inputEl.addEventListener('blur', () => this.scene.input.keyboard?.enableGlobalCapture());
        this.inputEl.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); this.handleSend(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.toggle(); }
        });
        root.addEventListener('keydown', (e) => e.stopPropagation());
        root.addEventListener('keyup', (e) => e.stopPropagation());

        // Subscribe error → hiển thị status (rate-limit, text too long...).
        // chat_message / chat_history routed từ BaseMapScene qua appendMessage
        // / applyHistory để bubble cũng được trigger. Nhưng error event
        // không cần bubble → subscribe trực tiếp ở đây.
        this.rtUnsubs.push(
            wsClient.events.on('error', (p) => this.handleErrorEvent(p)),
        );
    }

    destroy(): void {
        for (const u of this.rtUnsubs) {
            try { u(); } catch { /* ignore */ }
        }
        this.rtUnsubs = [];
        this.overlay?.remove();
        this.overlay = undefined;
        this.rootEl = undefined;
        this.inputEl = undefined;
        this.messagesEl = undefined;
        this.sendBtn = undefined;
        this.statusEl = undefined;
    }

    toggle(): void {
        if (!this.overlay) return;
        const willShow = !this.visible;
        this.visible = willShow;
        this.overlay.style.display = willShow ? 'block' : 'none';

        if (willShow) {
            // Lazy-fetch world history lần đầu mở panel — tránh tốn DB khi
            // player không bao giờ mở chat.
            if (!this.worldHistoryFetched) {
                this.worldHistoryFetched = true;
                wsClient.send({ t: 'chat_history_req', p: { channel: 'world', limit: HISTORY_FETCH_LIMIT } });
            }
            this.renderActiveTab();
            setTimeout(() => this.inputEl?.focus(), 30);
        } else {
            this.inputEl?.blur();
            this.scene.input.keyboard?.enableGlobalCapture();
            if (this.inputEl) this.inputEl.value = '';
            this.clearStatus();
        }
    }

    isOpen(): boolean { return this.visible; }

    isFocused(): boolean {
        return this.visible || (!!this.rootEl && this.rootEl.contains(document.activeElement));
    }

    /**
     * Append 1 message vào buffer + render nếu đang ở tab tương ứng.
     * BaseMapScene gọi từ realtime listener. Echo cả sender (BE đẩy về cả
     * sender) → message của chính mình cũng vào buffer 1 lần ở đây, không
     * cần local-echo.
     */
    appendMessage(p: ChatMessagePayload): void {
        const tab = this.tabForChannel(p.channel);
        const buf = this.buffers[tab];
        buf.push(p);
        if (buf.length > MAX_BUFFER_PER_TAB) {
            buf.splice(0, buf.length - MAX_BUFFER_PER_TAB);
        }
        if (this.activeTab === tab && this.messagesEl) {
            this.appendToDom(p);
            this.scrollToBottom();
        }
    }

    /**
     * Apply chat_history reply — replace world buffer, prepend nếu pagination.
     * MVP: replace toàn bộ (chỉ fetch lần đầu mở panel).
     * Server trả desc theo id → reverse để hiển thị cũ → mới.
     */
    applyHistory(p: ChatHistoryPayload): void {
        const tab = this.tabForChannel(p.channel);
        const ascending = [...p.messages].reverse();
        // Nếu tab đã có message gần đây (chat_message tới trong lúc fetch),
        // dedupe theo id (server BIGSERIAL unique).
        const existingIds = new Set(this.buffers[tab].filter((m) => m.id).map((m) => m.id));
        const merged = ascending.filter((m) => !m.id || !existingIds.has(m.id));
        this.buffers[tab] = [...merged, ...this.buffers[tab]];
        if (this.buffers[tab].length > MAX_BUFFER_PER_TAB) {
            this.buffers[tab].splice(0, this.buffers[tab].length - MAX_BUFFER_PER_TAB);
        }
        if (this.activeTab === tab) this.renderActiveTab();
    }

    private setActiveTab(tab: Tab): void {
        if (!this.rootEl) return;
        this.activeTab = tab;
        const tabWorld = this.rootEl.querySelector('#tab-world') as HTMLDivElement | null;
        const tabCurrent = this.rootEl.querySelector('#tab-current') as HTMLDivElement | null;
        if (tabWorld && tabCurrent) {
            const isWorld = tab === 'world';
            tabWorld.style.color = isWorld ? '#ffea7a' : '#ffe4c4';
            tabWorld.style.background = isWorld ? '#6b3a14' : 'transparent';
            tabWorld.style.borderBottom = isWorld ? '2px solid #ffea7a' : '2px solid transparent';
            tabCurrent.style.color = !isWorld ? '#ffea7a' : '#ffe4c4';
            tabCurrent.style.background = !isWorld ? '#6b3a14' : 'transparent';
            tabCurrent.style.borderBottom = !isWorld ? '2px solid #ffea7a' : '2px solid transparent';
        }
        this.renderActiveTab();
    }

    private renderActiveTab(): void {
        if (!this.messagesEl) return;
        const buf = this.buffers[this.activeTab];
        this.messagesEl.innerHTML = '';
        for (const m of buf) {
            this.appendToDom(m);
        }
        this.scrollToBottom();
    }

    private appendToDom(m: ChatMessagePayload): void {
        if (!this.messagesEl) return;
        const div = document.createElement('div');
        div.style.marginBottom = '8px';
        const ownID = getCurrentCharacter()?.id;
        const isOwn = !!ownID && m.sender_character_id === ownID;
        const isSystem = m.kind === 'system';

        const senderColor = isSystem ? '#9affff' : (isOwn ? '#9affb4' : '#ffea7a');
        const senderTag = isSystem
            ? '[Hệ Thống]'
            : `[${escapeHtml(m.sender_display_name)}${m.sender_level ? ` Lv${m.sender_level}` : ''}]`;
        div.innerHTML =
            `<span style="color:${senderColor};font-weight:bold;">${escapeHtml(senderTag)}</span> ` +
            `<span style="color:#ffe4c4;">${escapeHtml(m.text)}</span>`;
        this.messagesEl.appendChild(div);
    }

    private scrollToBottom(): void {
        if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private tabForChannel(channel: ChatChannel): Tab {
        return channel === 'world' ? 'world' : 'current';
    }

    private channelForTab(tab: Tab): ChatChannel {
        return tab === 'world' ? 'world' : 'map';
    }

    private handleSend(): void {
        const msg = this.inputEl?.value.trim();
        if (!msg) return;

        // FE-side debounce nhẹ — tránh double-click + hai lần Enter trùng
        // tick. Server enforce rate-limit thực sự (map 2s, world 15s).
        const now = performance.now();
        if (now - this.lastSendAt < SEND_DEBOUNCE_MS) return;
        this.lastSendAt = now;

        const channel = this.channelForTab(this.activeTab);
        wsClient.send({ t: 'chat_send', p: { channel, text: msg } });
        this.clearStatus();
        if (this.inputEl) {
            this.inputEl.value = '';
            this.inputEl.focus();
        }
    }

    private handleErrorEvent(p: ErrorPayload): void {
        if (!p) return;
        // Chỉ care error có request_event là chat — tránh hiển thị error
        // không liên quan (vd join_map fail).
        if (p.request_event !== 'chat_send' && p.request_event !== 'chat_history_req') return;
        const text = chatErrorMessage(p.code) ?? p.msg_key;
        this.showStatus(text);
    }

    private showStatus(text: string): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.style.display = 'block';
        // Auto-clear sau 3s — đủ để player đọc, không che mãi.
        setTimeout(() => this.clearStatus(), 3000);
    }

    private clearStatus(): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.style.display = 'none';
    }
}

// chatErrorMessage map error code → text VI ngắn. Trả undefined nếu không
// thuộc range chat (caller fallback msg_key).
function chatErrorMessage(code: number): string | undefined {
    switch (code) {
        case CHAT_ERROR_CODES.RATE_LIMITED:
            return 'Bạn nhắn quá nhanh, đợi chút nhé.';
        case CHAT_ERROR_CODES.TEXT_TOO_LONG:
            return 'Tin nhắn quá dài (tối đa 256 ký tự).';
        case CHAT_ERROR_CODES.EMPTY_TEXT:
            return 'Tin nhắn không được rỗng.';
        case CHAT_ERROR_CODES.INVALID_TEXT:
            return 'Tin nhắn chứa ký tự không hợp lệ.';
        case CHAT_ERROR_CODES.NOT_IN_MAP:
            return 'Bạn cần vào map trước khi chat.';
        case CHAT_ERROR_CODES.INVALID_CHANNEL:
            return 'Kênh chat không hợp lệ.';
        case CHAT_ERROR_CODES.MISSING_SCOPE:
            return 'Thiếu thông tin nhóm/guild để gửi.';
        case CHAT_ERROR_CODES.REPOSITORY:
            return 'Lưu chat thất bại, thử lại sau.';
    }
    return undefined;
}

// escapeHtml — chống XSS khi render text user-supplied (display_name + text).
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
