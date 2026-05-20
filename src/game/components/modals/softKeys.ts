/**
 * Phím tắt kiểu J2ME / emulator JAR: thanh action đáy màn hình map 1-1 với
 *   - F1 (soft trái)  → nút slot `left`  (vd Sử dụng / Trang bị / Mua)
 *   - Enter (soft giữa) → nút slot `center` (vd Xem)
 *   - F2 (soft phải)   → nút slot `right` (vd Vứt); nếu không có nút → Back scene
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
