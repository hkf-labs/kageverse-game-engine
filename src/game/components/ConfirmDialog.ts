import * as Phaser from 'phaser';
import { t } from '../../i18n';
import type { GameComponent } from './types';

export interface ConfirmDialogOpenParams {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Color cho confirm button — default red (irreversible action). Pass green
     * cho action thuận chiều. */
    confirmColor?: 'red' | 'green' | 'amber';
    onConfirm: () => void;
    onCancel?: () => void;
}

/**
 * Modal confirm 2-button — generic dialog cho mọi irreversible action.
 * Dùng cho Bái Sư (set_class) và các quest có confirm_warning_key.
 *
 * Single-instance per scene; replace nội dung khi mở liên tục.
 * DOM overlay (kageverse-overlay tag) — Phaser scene.shutdown auto cleanup
 * mọi overlay tagged.
 */
export class ConfirmDialog implements GameComponent {
    private scene: Phaser.Scene;
    private overlay?: HTMLDivElement;
    private rootEl?: HTMLDivElement;
    private currentOnCancel?: () => void;
    private visible = false;
    private cancelBtnEl?: HTMLButtonElement;
    private confirmBtnEl?: HTMLButtonElement;
    /** 0 = cancel (default — irreversible action ưu tiên an toàn), 1 = confirm. */
    private focusedButton: 0 | 1 = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
        this.overlay.classList.add('kageverse-overlay', 'kageverse-overlay-confirm');
        Object.assign(this.overlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.55)',
            zIndex: '300', display: 'none',
        });
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.dismiss();
        });
        parent.style.position = 'relative';
        parent.appendChild(this.overlay);
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
        this.rootEl = undefined;
        this.currentOnCancel = undefined;
        this.visible = false;
    }

    open(params: ConfirmDialogOpenParams): void {
        if (!this.overlay) return;
        // Replace content nếu đang mở.
        if (this.rootEl) {
            this.rootEl.remove();
            this.rootEl = undefined;
        }
        this.currentOnCancel = params.onCancel;

        const root = document.createElement('div');
        this.rootEl = root;
        Object.assign(root.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(480px, 80vw)',
            background: 'rgba(26,18,8,0.97)',
            border: '3px solid #e29e4a',
            borderRadius: '14px',
            padding: '0',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 6px 32px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
        });

        const confirmColor = params.confirmColor ?? 'red';
        const confirmStyle = CONFIRM_BTN_STYLES[confirmColor];

        const titleEl = document.createElement('div');
        Object.assign(titleEl.style, {
            padding: '14px 18px',
            background: '#4d2d13',
            borderBottom: '2px solid #e29e4a',
            borderRadius: '12px 12px 0 0',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#ffea7a',
            letterSpacing: '0.5px',
        });
        titleEl.textContent = params.title;

        const msgEl = document.createElement('div');
        Object.assign(msgEl.style, {
            padding: '18px 20px',
            fontSize: '14px',
            color: '#ffe4c4',
            lineHeight: '1.55',
            whiteSpace: 'pre-wrap',
        });
        msgEl.textContent = params.message;

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '10px',
            padding: '12px 18px 18px',
            justifyContent: 'flex-end',
        });

        const cancelBtn = this.makeButton(
            params.cancelLabel ?? t('confirm.btn_cancel'),
            '#2a1808',
            '#ffe4c4',
            () => this.dismiss(),
        );
        const confirmBtn = this.makeButton(
            params.confirmLabel ?? t('confirm.btn_confirm'),
            confirmStyle.bg,
            confirmStyle.color,
            () => {
                this.close();
                params.onConfirm();
            },
        );
        btnRow.append(cancelBtn, confirmBtn);
        this.cancelBtnEl = cancelBtn;
        this.confirmBtnEl = confirmBtn;
        this.focusedButton = 0;

        root.append(titleEl, msgEl, btnRow);
        this.overlay.appendChild(root);
        this.overlay.style.display = 'block';
        this.visible = true;
        this.renderFocus();
    }

    isOpen(): boolean { return this.visible; }

    /** ←/→ chuyển button; ↑/↓ no-op (chỉ 1 row). */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (direction === 'left' && this.focusedButton === 1) {
            this.focusedButton = 0;
            this.renderFocus();
        } else if (direction === 'right' && this.focusedButton === 0) {
            this.focusedButton = 1;
            this.renderFocus();
        }
    }

    confirm(): void {
        if (!this.visible) return;
        const btn = this.focusedButton === 0 ? this.cancelBtnEl : this.confirmBtnEl;
        btn?.click();
    }

    /** ESC = cancel. */
    cancel(): void {
        if (!this.visible) return;
        this.dismiss();
    }

    private renderFocus(): void {
        const btns: [HTMLButtonElement | undefined, HTMLButtonElement | undefined] = [this.cancelBtnEl, this.confirmBtnEl];
        btns.forEach((btn, idx) => {
            if (!btn) return;
            if (idx === this.focusedButton) {
                btn.style.outline = '2px solid #ffea7a';
                btn.style.outlineOffset = '2px';
                btn.style.boxShadow = '0 0 10px rgba(255,234,122,0.7)';
            } else {
                btn.style.outline = '';
                btn.style.outlineOffset = '';
                btn.style.boxShadow = '';
            }
        });
    }

    /** Close + run cancel callback nếu có. */
    private dismiss(): void {
        const cb = this.currentOnCancel;
        this.close();
        cb?.();
    }

    private close(): void {
        this.visible = false;
        this.currentOnCancel = undefined;
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.rootEl) {
            this.rootEl.remove();
            this.rootEl = undefined;
        }
    }

    private makeButton(label: string, bg: string, color: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        Object.assign(btn.style, {
            minWidth: '90px',
            height: '36px',
            padding: '0 14px',
            border: '2px solid #e29e4a',
            borderRadius: '6px',
            background: bg,
            color: color,
            fontSize: '13px',
            fontWeight: 'bold',
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.3px',
        });
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        return btn;
    }
}

const CONFIRM_BTN_STYLES: Record<'red' | 'green' | 'amber', { bg: string; color: string }> = {
    red: { bg: '#7a2a1a', color: '#ffb0a0' },
    green: { bg: '#2a4a1a', color: '#bdf0a0' },
    amber: { bg: '#6b3a14', color: '#ffea7a' },
};
