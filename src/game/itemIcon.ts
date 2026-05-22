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

/** Bùa Dịch Chuyển — `sprite_teleport_charm` / `consumable_teleport_charm`. */
const TELEPORT_CHARM_SPRITE_KEY = 'sprite_teleport_charm';
const TELEPORT_CHARM_TEMPLATE_ID = 'consumable_teleport_charm';
const TELEPORT_CHARM_ASSET_URL = '/assets/game/items/teleport_charm.png';

const WEAPON_ICON_DIR = '/assets/game/items/weapons/';

/** Bí kíp kỹ năng — `public/assets/game/items/skill_books/{template_id}.png` (mock tạm, đổi file theo phái sau). */
const SKILL_BOOK_ICON_DIR = '/assets/game/items/skill_books/';

function resolveSkillBookIconUrl(spriteKey: string, itemTemplateId?: string): string | null {
    if (itemTemplateId?.startsWith('skill_book_')) {
        return `${SKILL_BOOK_ICON_DIR}${itemTemplateId}.png`;
    }
    if (spriteKey.startsWith('sprite_skill_book_')) {
        return `${SKILL_BOOK_ICON_DIR}${spriteKey.slice('sprite_'.length)}.png`;
    }
    return null;
}

/** Kiếm Gỗ (Q1) — không có Sao / không cường hoá Hoshi. */
export const WOODEN_SWORD_TEMPLATE_ID = 'weapon_wooden_sword_starter';
const WOODEN_SWORD_SPRITE_KEY = 'sprite_weapon_wooden_sword';
const WOODEN_SWORD_ASSET_URL = `${WEAPON_ICON_DIR}weapon_wooden_sword_starter.png`;

/** Vũ khí ★ / faction — file `public/assets/game/items/weapons/{id}.webp`. */
function resolveWeaponIconUrl(spriteKey: string, itemTemplateId?: string): string | null {
    if (
        itemTemplateId === WOODEN_SWORD_TEMPLATE_ID ||
        spriteKey === WOODEN_SWORD_SPRITE_KEY
    ) {
        return WOODEN_SWORD_ASSET_URL;
    }
    if (itemTemplateId?.startsWith('weapon_')) {
        return `${WEAPON_ICON_DIR}${itemTemplateId}.webp`;
    }
    if (spriteKey.startsWith('sprite_weapon_')) {
        return `${WEAPON_ICON_DIR}${spriteKey.slice('sprite_'.length)}.webp`;
    }
    return null;
}

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
    if (
        spriteKey === TELEPORT_CHARM_SPRITE_KEY ||
        itemTemplateId === TELEPORT_CHARM_TEMPLATE_ID
    ) {
        return TELEPORT_CHARM_ASSET_URL;
    }
    const skillBookUrl = resolveSkillBookIconUrl(spriteKey, itemTemplateId);
    if (skillBookUrl) return skillBookUrl;
    const weaponUrl = resolveWeaponIconUrl(spriteKey, itemTemplateId);
    if (weaponUrl) return weaponUrl;
    return null;
}

/** HTML icon ô túi đồ — img nếu có asset, không thì emoji. */
export function inventorySlotIconHtml(iconUrl: string | null, iconText: string): string {
    if (iconUrl) {
        return `<img src="${iconUrl}" alt="" draggable="false" style="width:40px;height:40px;object-fit:contain;pointer-events:none;user-select:none;" />`;
    }
    return `<div style="font-size:24px;line-height:1;">${iconText}</div>`;
}
