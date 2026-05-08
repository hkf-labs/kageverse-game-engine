import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

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

const CONFIRM_BTN_STYLES: Record<'red' | 'green' | 'amber', { bg: string; color: string }> = {
    red: { bg: '#7a2a1a', color: '#ffb0a0' },
    green: { bg: '#2a4a1a', color: '#bdf0a0' },
    amber: { bg: '#6b3a14', color: '#ffea7a' },
};

/**
 * Modal confirm 2-button — generic dialog cho mọi irreversible action.
 * Dùng cho Bái Sư (set_class) và các quest có confirm_warning_key.
 *
 * Single-instance per scene; teardown overlay khi đóng. Mỗi lần `open()` rebuild
 * shell từ đầu để đổi title + message + button styles theo params.
 */
export class ConfirmDialog extends BaseModal {
    private currentOnCancel?: () => void;
    private cancelBtnEl?: HTMLButtonElement;
    private confirmBtnEl?: HTMLButtonElement;
    /** 0 = cancel (default — irreversible action ưu tiên an toàn), 1 = confirm. */
    private focusedButton: 0 | 1 = 0;
    /** Params hiện tại — buildShellOptions/populateShell đọc state từ đây. */
    private pendingParams?: ConfirmDialogOpenParams;

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        const p = this.pendingParams;
        return {
            overlayClassName: 'kageverse-overlay-confirm',
            size: 'sm',
            layer: 'confirm',
            withStatus: false,
            // Không có nút ✕ — confirm dialog dùng Cancel button thay thế để
            // user phải lựa chọn rõ ràng giữa 2 hành động.
            withCloseButton: false,
            title: p?.title ?? '',
            onClose: () => this.dismiss(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        const p = this.pendingParams;
        if (!p) return;

        // Message body
        const msgEl = document.createElement('div');
        Object.assign(msgEl.style, {
            padding: '18px 20px',
            fontSize: '14px',
            color: MODAL_COLORS.text,
            lineHeight: '1.55',
            whiteSpace: 'pre-wrap',
        });
        msgEl.textContent = p.message;

        // Button row
        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '10px',
            padding: '12px 18px 18px',
            justifyContent: 'flex-end',
        });

        const confirmStyle = CONFIRM_BTN_STYLES[p.confirmColor ?? 'red'];

        this.cancelBtnEl = this.makeButton(
            p.cancelLabel ?? t('confirm.btn_cancel'),
            MODAL_COLORS.panelBgTop,
            MODAL_COLORS.text,
            () => this.dismiss(),
        );
        this.confirmBtnEl = this.makeButton(
            p.confirmLabel ?? t('confirm.btn_confirm'),
            confirmStyle.bg,
            confirmStyle.color,
            () => {
                const onConfirm = p.onConfirm;
                this.teardownShell();
                onConfirm();
            },
        );
        btnRow.append(this.cancelBtnEl, this.confirmBtnEl);

        shell.body.append(msgEl, btnRow);
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.cancelBtnEl = undefined;
        this.confirmBtnEl = undefined;
        this.currentOnCancel = undefined;
        this.pendingParams = undefined;
    }

    open(params: ConfirmDialogOpenParams): void {
        // Replace dialog cũ — single-instance behavior, đồng thời force rebuild
        // để title + message + button styles đổi theo params mới.
        this.teardownShell();
        this.pendingParams = params;
        this.currentOnCancel = params.onCancel;
        const shell = this.ensureShell();
        if (!shell) return;
        this.focusedButton = 0;
        this.visible = true;
        this.renderFocus();
    }

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
                btn.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
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
        this.teardownShell();
        cb?.();
    }

    private makeButton(label: string, bg: string, color: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        Object.assign(btn.style, {
            minWidth: '90px',
            height: '36px',
            padding: '0 14px',
            border: `2px solid ${MODAL_COLORS.border}`,
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
