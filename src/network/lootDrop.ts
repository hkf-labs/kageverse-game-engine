import type { LootDropDTO, LootKind } from './api';

/** Khớp domain.LootLifetimeDuration trên BE (15s). Fallback nếu thiếu expires_at. */
export const LOOT_LIFETIME_MS = 15_000;

/** item_templates.id — Đá Cường Hoá (một loại duy nhất). */
export const UPGRADE_STONE_TEMPLATE_ID = 'material_upgrade_stone_lv1';

/** Phaser texture keys cho loot trên mặt đất (preload ở BaseMapScene). */
export const LOOT_SPRITE_YEN = 'item_yen';
export const LOOT_SPRITE_UPGRADE_STONE = 'item_upgrade_stone';

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

/** Chuẩn hoá drop từ BE — expires_at bắt buộc; thiếu thì suy từ anchor + 15s. */
export function normalizeLootDrop(raw: unknown, anchorMs = Date.now()): LootDropDTO | null {
    if (!isRecord(raw)) return null;
    const dropId = typeof raw.drop_id === 'string' ? raw.drop_id : '';
    const kindRaw = raw.kind;
    const kind: LootKind | null =
        kindRaw === 'yen' || kindRaw === 'item' ? kindRaw : null;
    if (!dropId || !kind) return null;

    let expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at : '';
    if (!expiresAt) {
        expiresAt = new Date(anchorMs + LOOT_LIFETIME_MS).toISOString();
        console.warn('[loot] drop missing expires_at, client fallback', dropId);
    }

    return {
        drop_id: dropId,
        kind,
        pos_x: Number(raw.pos_x) || 0,
        pos_y: Number(raw.pos_y) || 0,
        owner_character_id:
            typeof raw.owner_character_id === 'string' ? raw.owner_character_id : undefined,
        owner_lock_expires_at:
            typeof raw.owner_lock_expires_at === 'string' ? raw.owner_lock_expires_at : undefined,
        expires_at: expiresAt,
        quest_template_id:
            typeof raw.quest_template_id === 'string' ? raw.quest_template_id : undefined,
        yen_amount: typeof raw.yen_amount === 'number' ? raw.yen_amount : undefined,
        item_template_id:
            typeof raw.item_template_id === 'string' ? raw.item_template_id : undefined,
        qty: typeof raw.qty === 'number' ? raw.qty : undefined,
    };
}

export function normalizeLootDrops(raw: unknown, anchorMs = Date.now()): LootDropDTO[] {
    if (!Array.isArray(raw)) return [];
    const out: LootDropDTO[] = [];
    for (const item of raw) {
        const d = normalizeLootDrop(item, anchorMs);
        if (d) out.push(d);
    }
    return out;
}

export function lootDropExpiresAtMs(dto: LootDropDTO): number {
    return Date.parse(dto.expires_at);
}

export function isLootDropExpired(dto: LootDropDTO, nowMs = Date.now()): boolean {
    const ms = lootDropExpiresAtMs(dto);
    return Number.isFinite(ms) && nowMs >= ms;
}

/** Khớp BE usecase.yenPickupRangePx — nhặt drop theo trục X (raw coords). */
export const LOOT_PICKUP_RANGE_RAW_PX = 160;

/** Player (screen X) có đủ gần drop (raw pos_x) để nhặt. */
export function isPlayerInLootPickupRange(
    dropRawX: number,
    playerScreenX: number,
    scaleFactor: number,
): boolean {
    if (scaleFactor <= 0) return false;
    const playerRawX = playerScreenX / scaleFactor;
    return Math.abs(playerRawX - dropRawX) <= LOOT_PICKUP_RANGE_RAW_PX;
}
