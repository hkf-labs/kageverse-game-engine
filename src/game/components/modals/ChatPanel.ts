import { t } from '../../../i18n';
import { wsClient } from '../../../network/WebSocketClient';
import {
    CHAT_ERROR_CODES,
    type ChatChannel,
    type ChatHistoryPayload,
    type ChatMessagePayload,
    type ErrorPayload,
} from '../../../network/protocol/events';
import { getCurrentCharacter } from '../../playerSession';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

// Số message giữ trong buffer cho từng tab. Vượt → drop oldest. Tránh
// memory leak khi player chat 1 ngày dài. UI scroll mượt với 200.
const MAX_BUFFER_PER_TAB = 200;

// Limit fetch history mỗi lần. Server cap 100; FE 50 đủ cho 1 lần fetch.
const HISTORY_FETCH_LIMIT = 50;

// Throttle cooldown FE-side (chỉ disable nút send tạm thời) — thực tế
// rate-limit do server enforce. FE feedback nhanh để UX không trống trải.
const SEND_DEBOUNCE_MS = 200;

type Tab = 'current' | 'world';

export class ChatPanel extends BaseModal {
    private inputEl?: HTMLInputElement;
    private messagesEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private tabCurrentEl?: HTMLDivElement;
    private tabWorldEl?: HTMLDivElement;

    private activeTab: Tab = 'current';
    private buffers: Record<Tab, ChatMessagePayload[]> = {
        current: [],
        world: [],
    };
    private worldHistoryFetched = false;
    private rtUnsubs: Array<() => void> = [];
    private lastSendAt = 0;

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-chat',
            size: 'lg',
            layer: 'chat',
            withStatus: false,
            withTitle: false,
            onClose: () => this.toggle(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Backdrop nhạt hơn modal thường — chat overlay user vẫn có thể nhìn
        // được map phía sau, không cần dim hẳn.
        shell.overlay.style.background = 'rgba(0,0,0,0.35)';
        // Override panel size — chat compact hơn modal chuẩn (height fixed).
        Object.assign(shell.panel.style, {
            width: 'min(700px, 75vw)',
            height: 'min(360px, 55vh)',
            maxHeight: 'min(360px, 55vh)',
            background: 'rgba(26,18,8,0.96)',
        });

        // Header: 2 tabs (Hiện tại / Thế giới) thay cho title.
        const tabCurrent = document.createElement('div');
        tabCurrent.id = 'tab-current';
        tabCurrent.style.cssText = `flex:1;text-align:center;padding:8px 0;cursor:pointer;font-size:13px;font-weight:bold;color:${MODAL_COLORS.title};background:#6b3a14;border-bottom:2px solid ${MODAL_COLORS.title};`;
        tabCurrent.textContent = t('chat.tab_current');
        tabCurrent.addEventListener('click', () => this.setActiveTab('current'));

        const tabWorld = document.createElement('div');
        tabWorld.id = 'tab-world';
        tabWorld.style.cssText = `flex:1;text-align:center;padding:8px 0;cursor:pointer;font-size:13px;font-weight:bold;color:${MODAL_COLORS.text};background:transparent;border-bottom:2px solid transparent;`;
        tabWorld.textContent = t('chat.tab_world');
        tabWorld.addEventListener('click', () => this.setActiveTab('world'));

        const closeBtn = document.createElement('div');
        closeBtn.style.cssText = `width:36px;text-align:center;cursor:pointer;font-size:18px;font-weight:bold;color:${MODAL_COLORS.closeBtn};padding:8px 0;flex-shrink:0;`;
        closeBtn.innerHTML = '&#10005;';
        closeBtn.addEventListener('click', () => this.toggle());

        // Shell chưa render close button (withCloseButton chưa set false →
        // thực ra default true). Nhưng vì withTitle:false đã loại title, ta
        // remove mọi child hiện có rồi append tabs + close manually.
        shell.headerEl.innerHTML = '';
        shell.headerEl.append(tabCurrent, tabWorld, closeBtn);
        this.tabCurrentEl = tabCurrent;
        this.tabWorldEl = tabWorld;

        // Body content — messages list + status + input row.
        const messages = document.createElement('div');
        messages.id = 'chat-messages';
        messages.style.cssText = 'flex:1;overflow-y:auto;padding:10px 12px;font-size:13px;line-height:1.5;';
        shell.body.appendChild(messages);
        this.messagesEl = messages;

        const status = document.createElement('div');
        status.id = 'chat-status';
        status.style.cssText = `display:none;padding:4px 12px;font-size:11px;color:${MODAL_COLORS.statusError};background:rgba(80,20,20,0.4);`;
        shell.body.appendChild(status);
        this.statusEl = status;

        const inputRow = document.createElement('div');
        inputRow.style.cssText = `display:flex;gap:8px;padding:8px 10px;border-top:2px solid ${MODAL_COLORS.divider};background:rgba(45,26,10,0.8);flex-shrink:0;`;

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 256;
        input.placeholder = t('chat.input_placeholder');
        input.style.cssText = `flex:1;height:34px;border-radius:6px;border:2px solid ${MODAL_COLORS.divider};background:#fff5e0;padding:0 10px;font-family:system-ui,sans-serif;font-size:14px;color:${MODAL_COLORS.panelBgTop};outline:none;box-sizing:border-box;`;
        input.addEventListener('focus', () => this.scene.input.keyboard?.disableGlobalCapture());
        input.addEventListener('blur', () => this.scene.input.keyboard?.enableGlobalCapture());
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); this.handleSend(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.toggle(); }
        });
        this.inputEl = input;

        const sendBtn = document.createElement('button');
        sendBtn.style.cssText = `width:70px;height:34px;border-radius:6px;border:2px solid ${MODAL_COLORS.border};background:#6b3a14;color:${MODAL_COLORS.title};font-size:14px;font-weight:bold;font-family:system-ui,sans-serif;cursor:pointer;`;
        sendBtn.textContent = t('chat.btn_send');
        sendBtn.addEventListener('click', () => this.handleSend());

        inputRow.append(input, sendBtn);
        shell.body.appendChild(inputRow);

        shell.panel.addEventListener('keydown', (e) => e.stopPropagation());
        shell.panel.addEventListener('keyup', (e) => e.stopPropagation());

        // Subscribe error → hiển thị status (rate-limit, text too long...).
        // chat_message / chat_history routed từ BaseMapScene qua appendMessage
        // / applyHistory để bubble cũng được trigger. Nhưng error event
        // không cần bubble → subscribe trực tiếp ở đây.
        this.rtUnsubs.push(
            wsClient.events.on('error', (p) => this.handleErrorEvent(p)),
        );

        // Re-render text static (tabs + send button + sender tag mỗi message)
        // khi user đổi locale runtime. Input placeholder không tự dịch — set
        // lại qua attribute. Re-render messages list để [Hệ Thống] đổi theo.
        shell.registerLocaleSync(() => {
            if (this.tabCurrentEl) this.tabCurrentEl.textContent = t('chat.tab_current');
            if (this.tabWorldEl) this.tabWorldEl.textContent = t('chat.tab_world');
            const sendBtnEl = shell.body.querySelector<HTMLButtonElement>('button');
            if (sendBtnEl) sendBtnEl.textContent = t('chat.btn_send');
            if (this.inputEl) this.inputEl.placeholder = t('chat.input_placeholder');
            this.renderActiveTab();
        });
    }

    protected teardownShell(): void {
        for (const u of this.rtUnsubs) {
            try { u(); } catch { /* ignore */ }
        }
        this.rtUnsubs = [];
        super.teardownShell();
        this.inputEl = undefined;
        this.messagesEl = undefined;
        this.statusEl = undefined;
        this.tabCurrentEl = undefined;
        this.tabWorldEl = undefined;
    }

    toggle(): void {
        const willShow = !this.visible;
        if (willShow) this.ensureShell();
        this.visible = willShow;

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
            this.clearStatus();
            this.teardownShell();
        }
    }

    isFocused(): boolean {
        return this.visible || (!!this.shell && this.shell.panel.contains(document.activeElement));
    }

    /** ←/→ chuyển tab Hiện tại ↔ Thế giới. ↑/↓ no-op (messages scroll bằng
     * chuột / wheel, không cần phím). Lưu ý: arrow này chỉ tới được khi input
     * NOT focused — keydown trong input đã stopPropagation. User Tab khỏi input
     * để dùng tab nav. */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (direction === 'left') this.setActiveTab('current');
        else if (direction === 'right') this.setActiveTab('world');
    }

    /** Enter trên panel (input không focus) = focus lại input để gõ. */
    confirm(): void {
        if (!this.visible) return;
        this.inputEl?.focus();
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
        this.activeTab = tab;
        if (this.tabCurrentEl && this.tabWorldEl) {
            const isWorld = tab === 'world';
            this.tabWorldEl.style.color = isWorld ? MODAL_COLORS.title : MODAL_COLORS.text;
            this.tabWorldEl.style.background = isWorld ? '#6b3a14' : 'transparent';
            this.tabWorldEl.style.borderBottom = isWorld ? `2px solid ${MODAL_COLORS.title}` : '2px solid transparent';
            this.tabCurrentEl.style.color = !isWorld ? MODAL_COLORS.title : MODAL_COLORS.text;
            this.tabCurrentEl.style.background = !isWorld ? '#6b3a14' : 'transparent';
            this.tabCurrentEl.style.borderBottom = !isWorld ? `2px solid ${MODAL_COLORS.title}` : '2px solid transparent';
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

        const senderColor = isSystem ? '#9affff' : (isOwn ? '#9affb4' : MODAL_COLORS.title);
        const senderTag = isSystem
            ? t('chat.system_sender')
            : `[${escapeHtml(m.sender_display_name)}${m.sender_level ? ` Lv${m.sender_level}` : ''}]`;
        div.innerHTML =
            `<span style="color:${senderColor};font-weight:bold;">${escapeHtml(senderTag)}</span> ` +
            `<span style="color:${MODAL_COLORS.text};">${escapeHtml(m.text)}</span>`;
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
        case CHAT_ERROR_CODES.RATE_LIMITED:    return t('chat.error_rate_limited');
        case CHAT_ERROR_CODES.TEXT_TOO_LONG:   return t('chat.error_text_too_long');
        case CHAT_ERROR_CODES.EMPTY_TEXT:      return t('chat.error_empty_text');
        case CHAT_ERROR_CODES.INVALID_TEXT:    return t('chat.error_invalid_text');
        case CHAT_ERROR_CODES.NOT_IN_MAP:      return t('chat.error_not_in_map');
        case CHAT_ERROR_CODES.INVALID_CHANNEL: return t('chat.error_invalid_channel');
        case CHAT_ERROR_CODES.MISSING_SCOPE:   return t('chat.error_missing_scope');
        case CHAT_ERROR_CODES.REPOSITORY:      return t('chat.error_repository');
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
