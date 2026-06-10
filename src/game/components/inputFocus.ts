import type { ActionMenu } from './ActionMenu';
import type { ModalItemMenu } from './modals/ModalItemMenu';
import type { SoftKeySlot } from './modals/softKeys';

/**
 * Thứ tự ưu tiên input (cao hơn = “đè” và nhận mọi phím chức năng).
 *
 * Quy tắc: chỉ **một** `InputFocusTarget` active — layer cao nhất trong các
 * UI đang mở. F1 / Enter / F2 / ←→↑↓ / ESC chỉ tác động target đó.
 *
 * 1. Menu chức năng (F1) / NPC — ActionMenu Phaser
 * 2. Modal HTML (túi, shop, …) — grid + action bar Sử dụng/Xem/Vứt
 * 3. Menu con từ item trong modal (Bùa Dịch Chuyển) — ModalItemMenu DOM
 * 4. Confirm / cinematic — trên modal thường
 */
export const INPUT_LAYER = {
    actionMenu: 100,
    modal: 200,
    modalItemMenu: 300,
    blockingDialog: 250,
    cinematic: 350,
    confirm: 400,
} as const;

export type NavDirection = 'left' | 'right' | 'up' | 'down';

export interface InputFocusTarget {
    readonly layer: number;
    navigate(direction: NavDirection): void;
    confirm(): void;
    /** F1 / Enter / F2 — target tự map (vd action bar hoặc ← chọn / →). */
    softKey(slot: SoftKeySlot): boolean;
    /** ESC hoặc back khi softKey phải không xử lý — đóng overlay hoặc UI hiện tại. */
    cancel(): boolean;
}

export function pickTopInputTarget(targets: InputFocusTarget[]): InputFocusTarget | null {
    if (targets.length === 0) return null;
    return targets.reduce((top, t) => (t.layer >= top.layer ? t : top));
}

export function createModalItemMenuInputTarget(
    menu: ModalItemMenu,
    onDismiss: () => boolean,
): InputFocusTarget {
    return {
        layer: INPUT_LAYER.modalItemMenu,
        navigate: (d) => menu.navigate(d),
        confirm: () => menu.confirm(),
        softKey: (slot) => {
            if (slot === 'left') menu.navigate('left');
            else if (slot === 'right') menu.navigate('right');
            else if (slot === 'center') menu.confirm();
            return true;
        },
        cancel: () => onDismiss(),
    };
}

export type KeyboardModalLike = {
    navigate(direction: NavDirection): void;
    confirm(): void;
    triggerSoftKey?: (slot: SoftKeySlot) => boolean;
};

export function createKeyboardModalTarget(
    layer: number,
    handler: KeyboardModalLike,
    onCancel: () => boolean,
): InputFocusTarget {
    return {
        layer,
        navigate: (d) => handler.navigate(d),
        confirm: () => handler.confirm(),
        softKey: (slot) => handler.triggerSoftKey?.(slot) ?? false,
        cancel: () => onCancel(),
    };
}

export type ActionMenuInputContext = {
    menu: ActionMenu;
    onCloseMenu: () => void;
};

/** NPC dialog / shop slot — Phaser ActionMenu. (Menu chức năng F1 cũ đã thay
 * bằng QuickMenuBar — FEAT-UI-002.) */
export function createActionMenuInputTarget(ctx: ActionMenuInputContext): InputFocusTarget {
    const { menu, onCloseMenu } = ctx;
    return {
        layer: INPUT_LAYER.actionMenu,
        navigate: (d) => {
            if (d === 'left') menu.navigate('left');
            else if (d === 'right') menu.navigate('right');
        },
        confirm: () => menu.confirm(),
        softKey: (slot) => {
            if (slot === 'left') {
                menu.navigate('left');
                return true;
            }
            if (slot === 'center') {
                menu.confirm();
                return true;
            }
            if (slot === 'right') {
                onCloseMenu();
                return true;
            }
            return false;
        },
        cancel: () => {
            onCloseMenu();
            return true;
        },
    };
}
