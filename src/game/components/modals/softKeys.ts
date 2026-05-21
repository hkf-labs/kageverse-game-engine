/**
 * Phím tắt kiểu J2ME: F1 trái / Enter giữa / F2 phải.
 *
 * Routing: `BaseMapScene.routeBlockedInput` + `inputFocus.ts` — chỉ UI có
 * **layer cao nhất** nhận phím (menu chức năng → modal → menu item → confirm).
 */
export type SoftKeySlot = 'left' | 'center' | 'right';

export interface KeyboardModalHandler {
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void;
    confirm(): void;
    /** Trả true nếu modal đã xử lý (không bubble ra map / menu). */
    triggerSoftKey?(slot: SoftKeySlot): boolean;
}

export type ActionBarSlot = 'left' | 'center' | 'right';

export function clickActionBarSlot(
    actions: ReadonlyArray<{ slot: ActionBarSlot }>,
    buttons: HTMLButtonElement[],
    slot: SoftKeySlot,
): boolean {
    const idx = actions.findIndex((a) => a.slot === slot);
    if (idx < 0) return false;
    const btn = buttons[idx];
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
}
