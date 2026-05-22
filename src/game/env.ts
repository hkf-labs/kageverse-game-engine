/** Poll POST /combat-tick (quái phản đòn). Mặc định bật; `VITE_COMBAT_TICK_ENABLED=false` để tắt. */
export function isCombatTickEnabled(): boolean {
    const v = import.meta.env.VITE_COMBAT_TICK_ENABLED;
    if (v === undefined || v === '') return true;
    if (v === 'false' || v === '0') return false;
    return v === 'true' || v === '1';
}
