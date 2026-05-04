import * as Phaser from 'phaser';
import { t } from '../../i18n';
import type { GameComponent } from './types';

export class ChatPanel implements GameComponent {
    private overlay?: HTMLDivElement;
    private rootEl?: HTMLDivElement;
    private inputEl?: HTMLInputElement;
    private messagesEl?: HTMLDivElement;
    private visible = false;
    private scene: Phaser.Scene;

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

        const mockWorldMessages = [
            { sender: 'HệThống', text: 'Chào mừng đến với Kageverse!' },
            { sender: 'NinjaX', text: 'Có ai muốn tổ đội farm boss không?' },
            { sender: 'ShadowKage', text: 'Bán kiếm lv30, inbox giá' },
            { sender: 'HệThống', text: 'Sự kiện x2 EXP đang diễn ra!' },
            { sender: 'KuroNinja', text: 'Map mới khó quá, cần buff' },
        ];
        const mockCurrentMessages = [
            { sender: 'Trưởng Làng', text: 'Hãy giúp ta tiêu diệt lũ quái ngoài rìa làng.' },
            { sender: 'Thợ Rèn', text: 'Mang nguyên liệu đến, ta sẽ rèn vũ khí cho ngươi.' },
            { sender: 'Y Sĩ', text: 'Nếu bị thương hãy quay lại đây.' },
        ];

        const buildMessages = (msgs: { sender: string; text: string }[]) =>
            msgs.map(m =>
                `<div style="margin-bottom:8px;">` +
                `<span style="color:#ffea7a;font-weight:bold;">[${m.sender}]</span> ` +
                `<span style="color:#ffe4c4;">${m.text}</span></div>`
            ).join('');

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
            `<div id="chat-messages" style="flex:1;overflow-y:auto;padding:10px 12px;font-size:13px;line-height:1.5;">${buildMessages(mockCurrentMessages)}</div>`,
            `<div style="display:flex;gap:8px;padding:8px 10px;border-top:2px solid #4d2d13;background:rgba(45,26,10,0.8);flex-shrink:0;">`,
            `<input id="chat-input" type="text" placeholder="${t('chat.input_placeholder')}" style="flex:1;height:34px;border-radius:6px;border:2px solid #4d2d13;background:#fff5e0;padding:0 10px;font-family:system-ui,sans-serif;font-size:14px;color:#2a1808;outline:none;box-sizing:border-box;" />`,
            `<button id="chat-send" style="width:70px;height:34px;border-radius:6px;border:2px solid #e29e4a;background:#6b3a14;color:#ffea7a;font-size:14px;font-weight:bold;font-family:system-ui,sans-serif;cursor:pointer;">Gửi</button>`,
            `</div>`,
        ].join('');

        this.overlay.appendChild(root);

        this.inputEl = root.querySelector('#chat-input') as HTMLInputElement;
        this.messagesEl = root.querySelector('#chat-messages') as HTMLDivElement;
        const tabCurrent = root.querySelector('#tab-current') as HTMLDivElement;
        const tabWorld = root.querySelector('#tab-world') as HTMLDivElement;
        const closeBtn = root.querySelector('#chat-close') as HTMLDivElement;
        const sendBtn = root.querySelector('#chat-send') as HTMLButtonElement;

        const setActiveTab = (tab: 'world' | 'current') => {
            const isWorld = tab === 'world';
            tabWorld.style.color = isWorld ? '#ffea7a' : '#ffe4c4';
            tabWorld.style.background = isWorld ? '#6b3a14' : 'transparent';
            tabWorld.style.borderBottom = isWorld ? '2px solid #ffea7a' : '2px solid transparent';
            tabCurrent.style.color = !isWorld ? '#ffea7a' : '#ffe4c4';
            tabCurrent.style.background = !isWorld ? '#6b3a14' : 'transparent';
            tabCurrent.style.borderBottom = !isWorld ? '2px solid #ffea7a' : '2px solid transparent';
            if (this.messagesEl) {
                this.messagesEl.innerHTML = buildMessages(isWorld ? mockWorldMessages : mockCurrentMessages);
                this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
            }
        };

        tabCurrent.addEventListener('click', () => setActiveTab('current'));
        tabWorld.addEventListener('click', () => setActiveTab('world'));
        closeBtn.addEventListener('click', () => this.toggle());
        sendBtn.addEventListener('click', () => this.handleSend());

        this.inputEl.addEventListener('focus', () => this.scene.input.keyboard?.disableGlobalCapture());
        this.inputEl.addEventListener('blur', () => this.scene.input.keyboard?.enableGlobalCapture());
        this.inputEl.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); this.handleSend(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.toggle(); }
        });
        root.addEventListener('keydown', (e) => e.stopPropagation());
        root.addEventListener('keyup', (e) => e.stopPropagation());
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
        this.rootEl = undefined;
        this.inputEl = undefined;
        this.messagesEl = undefined;
    }

    toggle(): void {
        if (!this.overlay) return;
        const willShow = !this.visible;
        this.visible = willShow;
        this.overlay.style.display = willShow ? 'block' : 'none';

        if (willShow) {
            setTimeout(() => this.inputEl?.focus(), 30);
        } else {
            this.inputEl?.blur();
            this.scene.input.keyboard?.enableGlobalCapture();
            if (this.inputEl) this.inputEl.value = '';
        }
    }

    isOpen(): boolean { return this.visible; }

    isFocused(): boolean {
        return this.visible || (!!this.rootEl && this.rootEl.contains(document.activeElement));
    }

    private handleSend(): void {
        const msg = this.inputEl?.value.trim();
        console.log('[Chat] send:', msg);
        if (!msg) return;
        if (this.messagesEl) {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            div.innerHTML =
                `<span style="color:#9affb4;font-weight:bold;">[Bạn]</span> ` +
                `<span style="color:#ffe4c4;">${msg}</span>`;
            this.messagesEl.appendChild(div);
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
        if (this.inputEl) {
            this.inputEl.value = '';
            this.inputEl.focus();
        }
    }
}
