import { clearTokens, getAccessToken } from './api';
import { wsClient, type ConnectionState } from './WebSocketClient';

// connectRealtime — gọi từ AuthScene sau khi login/register/restore-session
// thành công. Idempotent: nếu đã open thì no-op.
//
// Behavior:
//   - getToken: WSClient lazy đọc token mỗi lần mở connection (auto-reconnect
//     dùng token mới sau refresh). Trả null → client không connect, gọi
//     onAuthFailed.
//   - onSessionReplaced: BE đẩy close 4010 → user đang login nơi khác. Clear
//     tokens local + redirect AuthScene + show toast.
//   - onAuthFailed: token hết hạn / character không tồn tại → redirect login.
export function connectRealtime(opts: {
    onSessionReplaced: () => void;
    onAuthFailed: () => void;
    onStateChanged?: (state: ConnectionState) => void;
}): void {
    wsClient.connect({
        getToken: () => getAccessToken(),
        onSessionReplaced: () => {
            clearTokens();
            opts.onSessionReplaced();
        },
        onAuthFailed: () => {
            clearTokens();
            opts.onAuthFailed();
        },
        onStateChanged: opts.onStateChanged,
    });
}

// disconnectRealtime — gọi từ logout flow (SettingsModal). Cleanup chủ động.
export function disconnectRealtime(): void {
    wsClient.disconnect();
}

// Re-export singleton + types để code khác dùng đường ngắn.
export { wsClient } from './WebSocketClient';
export type { ConnectionState } from './WebSocketClient';
