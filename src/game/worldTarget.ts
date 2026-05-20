/** Loại đối tượng world có thể auto-select (gần nhất trong tầm). */
export type WorldTargetKind = 'loot' | 'monster' | 'npc' | 'remote_player';

export type WorldTargetCandidate = {
    kind: WorldTargetKind;
    distSq: number;
};

/** Tầm tương tác nhân vật khác (screen px, 2D). */
export const REMOTE_PLAYER_SELECT_RANGE_PX = 80;

/**
 * Quái / loot / remote player: chỉ auto-select ngang hoặc phía trên (chân player).
 * Mục tiêu thấp hơn trên màn hình → click tay.
 */
export function canAutoSelectVertically(playerY: number, targetAnchorY: number): boolean {
    return targetAnchorY <= playerY;
}

/** NPC dưới player một đoạn vẫn auto-select nếu còn trong tầm 2D. */
export const NPC_AUTO_SELECT_BELOW_MAX_PX = 140;
/** NPC cao quá trên player (screen Y nhỏ hơn nhiều) → không auto-select. */
export const NPC_AUTO_SELECT_ABOVE_MAX_PX = 110;

/**
 * Auto-select NPC theo chân (sprite origin bottom).
 * Chặn chỉ khi lệch Y quá lớn; gần ngang / hơi dưới / hơi trên vẫn OK.
 */
export function canAutoSelectNpcVertically(playerY: number, npcFootY: number): boolean {
    const dy = npcFootY - playerY;
    if (dy > NPC_AUTO_SELECT_BELOW_MAX_PX) return false;
    if (dy < -NPC_AUTO_SELECT_ABOVE_MAX_PX) return false;
    return true;
}
