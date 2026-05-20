/** Loại đối tượng world có thể auto-select (gần nhất trong tầm). */
export type WorldTargetKind = 'loot' | 'monster' | 'npc' | 'remote_player';

export type WorldTargetCandidate = {
    kind: WorldTargetKind;
    distSq: number;
};

/** Tầm tương tác nhân vật khác (screen px, 2D). */
export const REMOTE_PLAYER_SELECT_RANGE_PX = 80;

/**
 * Auto-select chỉ mục tiêu ngang hoặc phía trên player (screen Y nhỏ hơn).
 * Đối tượng nằm dưới nhân vật (targetY > playerY) → phải click chuột.
 */
export function canAutoSelectVertically(playerY: number, targetAnchorY: number): boolean {
    return targetAnchorY <= playerY;
}
