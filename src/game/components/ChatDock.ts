import type * as Phaser from 'phaser';
import { onLocaleChange, t } from '../../i18n';
import { wsClient } from '../../network/WebSocketClient';
import {
    CHAT_ERROR_CODES,
    type ChatChannel,
    type ChatHistoryPayload,
    type ChatMessagePayload,
    type ErrorPayload,
} from '../../network/protocol/events';
import { getCurrentCharacter } from '../playerSession';
import { MODAL_COLORS, MODAL_Z_INDEX } from './modals/theme';
import type { GameComponent } from './types';

// Max messages kept per tab. Older ones are dropped so a day-long session
// can't grow the buffer unbounded; 200 still scrolls smoothly.
const MAX_BUFFER_PER_TAB = 200;

// History fetch size. Server caps at 100; 50 fills the dock plenty.
const HISTORY_FETCH_LIMIT = 50;

// FE-side send debounce (guards double-click / double-Enter on one tick).
// Real rate-limiting is enforced by the server (map 2s, world 15s).
const SEND_DEBOUNCE_MS = 200;

// Anchor the dock near the bottom edge of the viewport.
const DOCK_BOTTOM_PX = 16;

// Fixed message-strip heights. These never change with content, so a transient
// status line (e.g. rate-limit warning) can't resize the dock — the status is
// an absolute overlay, not part of the flex flow.
const COMPACT_MSG_HEIGHT = '72px';
const EXPANDED_MSG_HEIGHT = '200px';
// Height of the input row (5px padding × 2 + 30px input) — the status overlay
// sits just above it.
const INPUT_ROW_HEIGHT_PX = 40;

// Width clamp keeps the dock clear of the mobile D-pad cluster (x <= 172)
// and the attack-button cluster (x >= width-172).
const DOCK_WIDTH_CSS = 'min(440px, calc(100vw - 344px))';
const DOCK_MIN_WIDTH_PX = 240;

const COLLAPSED_STORAGE_KEY = 'kageverse_chat_dock_collapsed';

type Tab = 'current' | 'world';
type DockState = 'collapsed' | 'compact' | 'expanded';

// Module-level so chat survives map transitions: each scene builds a fresh
// ChatDock DOM, but the message buffers and the once-per-session history
// fetch flag live here.
const buffers: Record<Tab, ChatMessagePayload[]> = {
    current: [],
    world: [],
};
let worldHistoryFetched = false;

function loadCollapsedPref(): boolean {
    try { return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'; } catch { return false; }
}

function saveCollapsedPref(collapsed: boolean): void {
    try { localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Always-visible chat dock at the bottom-center of the screen, above the
 * skill hotbar (FEAT-CHAT-002). Replaces the modal ChatPanel.
 *
 * Deliberately NOT a BaseModal and NOT an InputFocusTarget: the dock never
 * blocks gameplay by being visible. Movement keys are suppressed only while
 * the text input is focused (input stops propagation + Phaser global capture
 * is disabled), so it can't steal keys from gameplay or from real modals.
 *
 * States: collapsed (input row only, persisted preference) / compact
 * (translucent strip with the newest messages) / expanded (tabs + scrollable
 * history, entered while the input is focused).
 */
export class ChatDock implements GameComponent {
    private readonly scene: Phaser.Scene;

    private root?: HTMLDivElement;
    private panel?: HTMLDivElement;
    private headerEl?: HTMLDivElement;
    private tabCurrentEl?: HTMLDivElement;
    private tabWorldEl?: HTMLDivElement;
    private messagesEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private inputEl?: HTMLInputElement;
    private sendBtnEl?: HTMLButtonElement;
    private maxBtnEl?: HTMLDivElement;
    private arrowEl?: HTMLDivElement;

    private state: DockState = 'compact';
    private maximized = false;
    private collapsedPref = false;
    private activeTab: Tab = 'current';
    private lastSendAt = 0;
    private blurTimer?: number;
    private statusTimer?: number;
    private unsubs: Array<() => void> = [];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.collapsedPref = loadCollapsedPref();
        this.state = this.collapsedPref ? 'collapsed' : 'compact';

        this.buildDom(parent);

        // Clicking the game world doesn't blur the input on its own — Phaser
        // calls preventDefault() on canvas pointer events, so the input keeps
        // focus and the dock would stay expanded. Blur it explicitly on any
        // pointerdown outside the dock so it shrinks back.
        const onOutsidePointerDown = (e: PointerEvent): void => {
            if (!this.root) return;
            // Only react when the dock is currently "open" (focused or maximized).
            if (!this.isFocused() && !this.maximized) return;
            if (this.root.contains(e.target as Node)) return;
            // Clicking outside also exits the maximized panel.
            this.maximized = false;
            // Blur (if focused) lets handleInputBlur shrink the dock; otherwise
            // shrink it directly so an un-focused maximized panel still closes.
            if (this.isFocused()) this.inputEl?.blur();
            else this.setState(this.collapsedPref ? 'collapsed' : 'compact');
        };
        document.addEventListener('pointerdown', onOutsidePointerDown, true);

        this.unsubs.push(
            wsClient.events.on('error', (p) => this.handleErrorEvent(p)),
            onLocaleChange(() => this.syncLocaleTexts()),
            () => document.removeEventListener('pointerdown', onOutsidePointerDown, true),
        );

        // Fetch world history once per session so the compact strip is
        // populated right after login (not lazily on first interaction).
        if (!worldHistoryFetched) {
            worldHistoryFetched = true;
            wsClient.send({ t: 'chat_history_req', p: { channel: 'world', limit: HISTORY_FETCH_LIMIT } });
        }

        this.applyState();
        this.renderActiveTab();
    }

    destroy(): void {
        for (const u of this.unsubs) {
            try { u(); } catch { /* ignore */ }
        }
        this.unsubs = [];
        if (this.blurTimer !== undefined) window.clearTimeout(this.blurTimer);
        if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
        // Guard against leaving the scene (portal) while the input is focused —
        // global capture must come back on or keyboard input dies on the next map.
        this.scene.input.keyboard?.enableGlobalCapture();
        this.root?.remove();
        this.root = undefined;
        this.panel = undefined;
        this.headerEl = undefined;
        this.tabCurrentEl = undefined;
        this.tabWorldEl = undefined;
        this.messagesEl = undefined;
        this.statusEl = undefined;
        this.inputEl = undefined;
        this.sendBtnEl = undefined;
        this.maxBtnEl = undefined;
        this.arrowEl = undefined;
    }

    /** Hide with the rest of the map UI while a real modal is open. */
    setVisible(visible: boolean): void {
        if (!this.root) return;
        if (!visible && this.isFocused()) this.inputEl?.blur();
        this.root.style.display = visible ? 'flex' : 'none';
    }

    isFocused(): boolean {
        return !!this.inputEl && document.activeElement === this.inputEl;
    }

    /**
     * Append one message to its tab buffer + render when that tab is active.
     * Called from BaseMapScene's realtime listener (which also triggers the
     * sprite bubble). The server echoes the sender, so own messages arrive
     * here exactly once — no local echo needed.
     */
    appendMessage(p: ChatMessagePayload): void {
        const tab = tabForChannel(p.channel);
        const buf = buffers[tab];
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
     * Apply a chat_history reply — prepend into the tab buffer, deduped by
     * server id (live chat_message may have landed while the fetch ran).
     * Server returns desc by id → reverse to display old → new.
     */
    applyHistory(p: ChatHistoryPayload): void {
        const tab = tabForChannel(p.channel);
        const ascending = [...p.messages].reverse();
        const existingIds = new Set(buffers[tab].filter((m) => m.id).map((m) => m.id));
        const merged = ascending.filter((m) => !m.id || !existingIds.has(m.id));
        buffers[tab] = [...merged, ...buffers[tab]];
        if (buffers[tab].length > MAX_BUFFER_PER_TAB) {
            buffers[tab].splice(0, buffers[tab].length - MAX_BUFFER_PER_TAB);
        }
        if (this.activeTab === tab) this.renderActiveTab();
    }

    // ---- DOM ---------------------------------------------------------------

    private buildDom(parent: HTMLElement): void {
        const root = document.createElement('div');
        // `kageverse-overlay` keeps the dock covered by BaseMapScene's
        // defensive overlay purge on scene create.
        root.className = 'kageverse-overlay kageverse-chat-dock';
        root.style.cssText = [
            'position:absolute',
            'left:50%',
            `bottom:${DOCK_BOTTOM_PX}px`,
            'transform:translateX(-50%)',
            `width:${DOCK_WIDTH_CSS}`,
            `min-width:${DOCK_MIN_WIDTH_PX}px`,
            `z-index:${MODAL_Z_INDEX.chat}`,
            'pointer-events:none',
            'display:flex',
            'flex-direction:column',
            'font-family:system-ui,sans-serif',
        ].join(';');

        const panel = document.createElement('div');
        // position:relative anchors the absolute status overlay below.
        panel.style.cssText = 'position:relative;pointer-events:auto;display:flex;flex-direction:column;border-radius:8px;overflow:hidden;';
        // Keep any key pressed while interacting with the dock away from Phaser.
        panel.addEventListener('keydown', (e) => e.stopPropagation());
        panel.addEventListener('keyup', (e) => e.stopPropagation());

        // Header — tabs, shown only in the expanded state.
        const header = document.createElement('div');
        header.style.cssText = 'display:none;align-items:center;flex-shrink:0;';

        const tabCurrent = document.createElement('div');
        tabCurrent.style.cssText = 'flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:12px;font-weight:bold;';
        tabCurrent.addEventListener('mousedown', (e) => e.preventDefault());
        tabCurrent.addEventListener('click', () => this.setActiveTab('current'));

        const tabWorld = document.createElement('div');
        tabWorld.style.cssText = 'flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:12px;font-weight:bold;';
        tabWorld.addEventListener('mousedown', (e) => e.preventDefault());
        tabWorld.addEventListener('click', () => this.setActiveTab('world'));

        header.append(tabCurrent, tabWorld);

        // Messages strip — clicking it focuses the input (which expands).
        const messages = document.createElement('div');
        messages.style.cssText = 'padding:6px 10px;font-size:12px;line-height:1.5;text-shadow:0 1px 2px #000;cursor:pointer;';
        messages.addEventListener('click', () => {
            if (this.state !== 'expanded') this.inputEl?.focus();
        });

        // Absolute overlay just above the input row — appears on top of the
        // message strip without resizing the dock.
        const status = document.createElement('div');
        status.style.cssText = `display:none;position:absolute;left:0;right:0;bottom:${INPUT_ROW_HEIGHT_PX}px;padding:3px 10px;font-size:11px;color:${MODAL_COLORS.statusError};background:rgba(80,20,20,0.92);z-index:1;`;

        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;gap:6px;padding:5px 6px;align-items:center;flex-shrink:0;';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 256;
        input.style.cssText = `flex:1;min-width:0;height:30px;border-radius:6px;border:1px solid ${MODAL_COLORS.divider};background:rgba(255,245,224,0.92);padding:0 8px;font-family:system-ui,sans-serif;font-size:13px;color:${MODAL_COLORS.panelBgTop};outline:none;box-sizing:border-box;`;
        input.addEventListener('focus', () => this.handleInputFocus());
        input.addEventListener('blur', () => this.handleInputBlur());
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); this.handleSend(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.inputEl?.blur(); }
        });

        const sendBtn = document.createElement('button');
        sendBtn.style.cssText = `width:56px;height:30px;border-radius:6px;border:1px solid ${MODAL_COLORS.border};background:#6b3a14;color:${MODAL_COLORS.title};font-size:12px;font-weight:bold;font-family:system-ui,sans-serif;cursor:pointer;flex-shrink:0;`;
        // preventDefault on mousedown so clicking Send doesn't blur the input
        // (the blur handler would collapse the dock before the click lands).
        sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
        sendBtn.addEventListener('click', () => this.handleSend());

        const maxBtn = document.createElement('div');
        maxBtn.style.cssText = `width:26px;height:30px;line-height:30px;text-align:center;cursor:pointer;font-size:14px;color:${MODAL_COLORS.title};user-select:none;flex-shrink:0;`;
        maxBtn.addEventListener('mousedown', (e) => e.preventDefault());
        maxBtn.addEventListener('click', () => this.toggleMaximized());

        const arrow = document.createElement('div');
        arrow.style.cssText = `width:26px;height:30px;line-height:30px;text-align:center;cursor:pointer;font-size:13px;color:${MODAL_COLORS.title};user-select:none;flex-shrink:0;`;
        arrow.addEventListener('mousedown', (e) => e.preventDefault());
        arrow.addEventListener('click', () => this.toggleCollapsed());

        inputRow.append(input, sendBtn, maxBtn, arrow);
        panel.append(header, messages, status, inputRow);
        root.appendChild(panel);
        parent.appendChild(root);

        this.root = root;
        this.panel = panel;
        this.headerEl = header;
        this.tabCurrentEl = tabCurrent;
        this.tabWorldEl = tabWorld;
        this.messagesEl = messages;
        this.statusEl = status;
        this.inputEl = input;
        this.sendBtnEl = sendBtn;
        this.maxBtnEl = maxBtn;
        this.arrowEl = arrow;

        this.syncLocaleTexts();
        this.syncTabStyles();
    }

    // ---- State machine -----------------------------------------------------

    private setState(state: DockState): void {
        this.state = state;
        this.applyState();
    }

    private applyState(): void {
        if (!this.panel || !this.headerEl || !this.messagesEl || !this.sendBtnEl || !this.root) return;
        const collapsed = this.state === 'collapsed';
        const expanded = this.state === 'expanded';

        // Root layout: maximized blows the dock up to a near-fullscreen panel;
        // otherwise it stays the compact bottom-anchored strip.
        if (this.maximized) {
            this.root.style.top = '24px';
            this.root.style.bottom = '24px';
            this.root.style.width = 'min(900px, calc(100vw - 48px))';
            this.panel.style.height = '100%';
        } else {
            this.root.style.top = 'auto';
            this.root.style.bottom = `${DOCK_BOTTOM_PX}px`;
            this.root.style.width = DOCK_WIDTH_CSS;
            this.panel.style.height = 'auto';
        }

        // Header (tabs) shows in expanded or maximized.
        this.headerEl.style.display = (expanded || this.maximized) ? 'flex' : 'none';
        this.messagesEl.style.display = collapsed ? 'none' : 'block';
        if (this.maximized) {
            // Fill the tall panel; let the message strip absorb the free space.
            this.messagesEl.style.flex = '1';
            this.messagesEl.style.height = 'auto';
            this.messagesEl.style.overflowY = 'auto';
        } else {
            this.messagesEl.style.flex = '0 0 auto';
            this.messagesEl.style.height = expanded ? EXPANDED_MSG_HEIGHT : COMPACT_MSG_HEIGHT;
            this.messagesEl.style.overflowY = expanded ? 'auto' : 'hidden';
        }
        this.sendBtnEl.style.display = collapsed ? 'none' : 'block';
        if (this.maxBtnEl) this.maxBtnEl.style.display = collapsed ? 'none' : 'block';

        // Input is a solid cream field when the dock is open (expanded/maximized)
        // but transparent in the resting compact/collapsed strip so the white box
        // doesn't sit on the game world.
        if (this.inputEl) {
            const open = expanded || this.maximized;
            this.inputEl.style.background = open ? 'rgba(255,245,224,0.92)' : 'transparent';
            this.inputEl.style.color = open ? MODAL_COLORS.panelBgTop : MODAL_COLORS.text;
            this.inputEl.style.borderColor = open ? MODAL_COLORS.divider : 'rgba(255,255,255,0.28)';
        }
        // The collapse arrow is meaningless while maximized — the restore
        // (maximize) button handles getting back.
        if (this.arrowEl) this.arrowEl.style.display = this.maximized ? 'none' : 'block';

        if (expanded || this.maximized) {
            this.panel.style.background = 'rgba(26,18,8,0.92)';
            this.panel.style.border = `2px solid ${MODAL_COLORS.border}`;
        } else {
            this.panel.style.background = 'rgba(0,0,0,0.28)';
            this.panel.style.border = 'none';
        }

        this.updateArrow();
        this.updateMaxBtn();
        this.scrollToBottom();
    }

    private toggleCollapsed(): void {
        this.collapsedPref = this.state !== 'collapsed';
        saveCollapsedPref(this.collapsedPref);
        if (this.collapsedPref) {
            if (this.isFocused()) this.inputEl?.blur();
            this.setState('collapsed');
        } else {
            this.setState('compact');
        }
    }

    private toggleMaximized(): void {
        this.maximized = !this.maximized;
        if (this.maximized) {
            this.setState('expanded');
        } else {
            // Restore to whatever the focus/collapse state implies.
            this.setState(this.isFocused() ? 'expanded' : (this.collapsedPref ? 'collapsed' : 'compact'));
        }
    }

    private updateMaxBtn(): void {
        if (!this.maxBtnEl) return;
        this.maxBtnEl.textContent = this.maximized ? '❐' : '⛶';
        const label = this.maximized ? t('chat.restore') : t('chat.maximize');
        this.maxBtnEl.title = label;
        this.maxBtnEl.setAttribute('aria-label', label);
    }

    private updateArrow(): void {
        if (!this.arrowEl) return;
        const collapsed = this.state === 'collapsed';
        this.arrowEl.textContent = collapsed ? '▴' : '▾';
        const label = collapsed ? t('chat.expand') : t('chat.collapse');
        this.arrowEl.title = label;
        this.arrowEl.setAttribute('aria-label', label);
    }

    // ---- Input focus -------------------------------------------------------

    private handleInputFocus(): void {
        if (this.blurTimer !== undefined) window.clearTimeout(this.blurTimer);
        this.scene.input.keyboard?.disableGlobalCapture();
        // A movement key held down right now would never deliver its keyup to
        // Phaser once capture is off — reset so the character doesn't drift.
        this.scene.input.keyboard?.resetKeys();
        this.setState('expanded');
    }

    private handleInputBlur(): void {
        this.scene.input.keyboard?.enableGlobalCapture();
        // Defer: a click on tabs/Send keeps focus inside the dock (mousedown
        // preventDefault) but other focus moves should shrink it back.
        if (this.blurTimer !== undefined) window.clearTimeout(this.blurTimer);
        this.blurTimer = window.setTimeout(() => {
            this.blurTimer = undefined;
            if (this.root && this.root.contains(document.activeElement)) return;
            // Stay expanded while maximized — blurring the input shouldn't
            // shrink the message strip inside the big panel.
            if (this.maximized) { this.setState('expanded'); return; }
            this.setState(this.collapsedPref ? 'collapsed' : 'compact');
        }, 0);
    }

    // ---- Tabs & rendering ----------------------------------------------------

    private setActiveTab(tab: Tab): void {
        this.activeTab = tab;
        this.syncTabStyles();
        this.renderActiveTab();
    }

    private syncTabStyles(): void {
        if (!this.tabCurrentEl || !this.tabWorldEl) return;
        const style = (el: HTMLDivElement, active: boolean): void => {
            el.style.color = active ? MODAL_COLORS.title : MODAL_COLORS.text;
            el.style.background = active ? '#6b3a14' : 'transparent';
            el.style.borderBottom = active ? `2px solid ${MODAL_COLORS.title}` : '2px solid transparent';
        };
        style(this.tabCurrentEl, this.activeTab === 'current');
        style(this.tabWorldEl, this.activeTab === 'world');
    }

    private renderActiveTab(): void {
        if (!this.messagesEl) return;
        this.messagesEl.innerHTML = '';
        for (const m of buffers[this.activeTab]) {
            this.appendToDom(m);
        }
        this.scrollToBottom();
    }

    private appendToDom(m: ChatMessagePayload): void {
        if (!this.messagesEl) return;
        const div = document.createElement('div');
        div.style.marginBottom = '4px';
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
        // Works for overflow:hidden too — programmatic scroll is still allowed,
        // which is how the compact strip pins to the newest messages.
        if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // ---- Send & errors -------------------------------------------------------

    private handleSend(): void {
        const msg = this.inputEl?.value.trim();
        if (!msg) return;

        const now = performance.now();
        if (now - this.lastSendAt < SEND_DEBOUNCE_MS) return;
        this.lastSendAt = now;

        const channel = channelForTab(this.activeTab);
        wsClient.send({ t: 'chat_send', p: { channel, text: msg } });
        this.clearStatus();
        if (this.inputEl) {
            this.inputEl.value = '';
            this.inputEl.focus();
        }
    }

    private handleErrorEvent(p: ErrorPayload): void {
        if (!p) return;
        // Only chat-originated errors — don't surface unrelated failures here.
        if (p.request_event !== 'chat_send' && p.request_event !== 'chat_history_req') return;
        this.showStatus(chatErrorMessage(p.code) ?? p.msg_key);
    }

    private showStatus(text: string): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.style.display = 'block';
        if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
        this.statusTimer = window.setTimeout(() => {
            this.statusTimer = undefined;
            this.clearStatus();
        }, 3000);
    }

    private clearStatus(): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.style.display = 'none';
    }

    // ---- Locale --------------------------------------------------------------

    private syncLocaleTexts(): void {
        if (this.tabCurrentEl) this.tabCurrentEl.textContent = t('chat.tab_current');
        if (this.tabWorldEl) this.tabWorldEl.textContent = t('chat.tab_world');
        if (this.sendBtnEl) this.sendBtnEl.textContent = t('chat.btn_send');
        if (this.inputEl) this.inputEl.placeholder = t('chat.input_placeholder');
        this.updateArrow();
        this.updateMaxBtn();
        // Re-render so the [System] sender tag follows the locale.
        this.renderActiveTab();
    }
}

function tabForChannel(channel: ChatChannel): Tab {
    return channel === 'world' ? 'world' : 'current';
}

function channelForTab(tab: Tab): ChatChannel {
    return tab === 'world' ? 'world' : 'map';
}

// Maps chat error codes to localized text; undefined → caller falls back to
// the raw msg_key.
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

// escapeHtml — XSS guard for user-supplied text (display_name + message text).
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
