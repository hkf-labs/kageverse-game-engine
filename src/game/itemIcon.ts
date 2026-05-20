import {
    MATERIAL_BEETLE_CARAPACE_ID,
    MATERIAL_HERB_FLOWER_ID,
    MATERIAL_TURTLE_SHELL_ID,
    UPGRADE_STONE_TEMPLATE_ID,
} from '../network/lootDrop';

/** sprite_key seed DB cho Đá Cường Hoá. */
const UPGRADE_STONE_SPRITE_KEY = 'sprite_material_upgrade_stone_lv1';

const UPGRADE_STONE_ASSET_URL = '/assets/game/items/upgrade_stone.png';
/** Q5 — trùng `item_templates.id` + file trong `public/assets/game/items/`. */
const BEETLE_CARAPACE_ASSET_URL = '/assets/game/items/material_beetle_carapace.png';
const TURTLE_SHELL_ASSET_URL = '/assets/game/items/material_turtle_shell.png';
const HERB_FLOWER_ASSET_URL = '/assets/game/items/material_herb_flower.png';

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
    if (itemTemplateId === MATERIAL_BEETLE_CARAPACE_ID) {
        return BEETLE_CARAPACE_ASSET_URL;
    }
    if (itemTemplateId === MATERIAL_TURTLE_SHELL_ID) {
        return TURTLE_SHELL_ASSET_URL;
    }
    if (itemTemplateId === MATERIAL_HERB_FLOWER_ID) {
        return HERB_FLOWER_ASSET_URL;
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
