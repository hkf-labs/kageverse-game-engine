import { UPGRADE_STONE_TEMPLATE_ID } from '../network/lootDrop';

/** sprite_key seed DB cho Đá Cường Hoá. */
const UPGRADE_STONE_SPRITE_KEY = 'sprite_material_upgrade_stone_lv1';

const UPGRADE_STONE_ASSET_URL = '/assets/game/items/upgrade_stone.png';

/**
 * URL icon hiển thị trong UI DOM (túi đồ, shop, ...).
 * Trả null → fallback emoji theo item_type.
 */
export function resolveItemIconUrl(spriteKey: string, itemTemplateId?: string): string | null {
    if (
        spriteKey === UPGRADE_STONE_SPRITE_KEY ||
        itemTemplateId === UPGRADE_STONE_TEMPLATE_ID
    ) {
        return UPGRADE_STONE_ASSET_URL;
    }
    return null;
}

/** HTML icon ô túi đồ — img nếu có asset, không thì emoji. */
export function inventorySlotIconHtml(iconUrl: string | null, iconText: string): string {
    if (iconUrl) {
        return `<img src="${iconUrl}" alt="" draggable="false" style="width:40px;height:40px;object-fit:contain;pointer-events:none;user-select:none;" />`;
    }
    return `<div style="font-size:24px;line-height:1;">${iconText}</div>`;
}
