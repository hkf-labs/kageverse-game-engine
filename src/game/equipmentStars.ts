import { t } from '../i18n';
import { WOODEN_SWORD_TEMPLATE_ID } from './itemIcon';

/** Sao trang bị tối đa theo `docs/business/equipment/stars.md`. */
export const MAX_EQUIPMENT_STAR_TIER = 5;

const STAR_ID_RE = /_star(\d+)$/;

/**
 * Đọc cấp Sao từ `item_template_id` (vd `weapon_sword_star3` → 3).
 * Kiếm Gỗ / đồ không có hậu tố `_starN` → null.
 */
export function parseEquipmentStarLevel(itemTemplateId: string | null | undefined): number | null {
    if (!itemTemplateId || itemTemplateId === WOODEN_SWORD_TEMPLATE_ID) return null;
    const m = itemTemplateId.match(STAR_ID_RE);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_EQUIPMENT_STAR_TIER) return null;
    return n;
}

/** Chỉ hiện đúng N sao đầy (★1 → `★`, ★3 → `★★★`), không pad tới 5. */
export function buildEquipmentStarGlyphs(stars: number): string {
    const n = Math.min(Math.max(1, Math.floor(stars)), MAX_EQUIPMENT_STAR_TIER);
    return '★'.repeat(n);
}

/**
 * Hàng Sao trong modal Xem chi tiết (glyph + nhãn "Sao N").
 * Trả '' nếu item không có tier Sao.
 */
export function buildEquipmentStarDetailHtml(
    itemTemplateId: string | null | undefined,
    extraStyle = '',
): string {
    const stars = parseEquipmentStarLevel(itemTemplateId);
    if (stars == null) return '';
    const glyphs = buildEquipmentStarGlyphs(stars);
    return [
        `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;${extraStyle}">`,
        `  <span style="color:#ffd070;letter-spacing:1px;font-size:15px;line-height:1;`,
        `    text-shadow:0 0 6px rgba(255,208,112,0.4);">${glyphs}</span>`,
        `  <span style="font-size:12px;font-weight:bold;color:#d4af37;">`,
        t('equipment.star_level', { n: stars }),
        `</span>`,
        `</div>`,
    ].join('');
}

/**
 * Badge Sao trên ô lưới 56×56 — góc dưới-trái (không đè +N cường hoá góc trên-trái).
 */
export function buildEquipmentStarBadgeHtml(itemTemplateId: string | null | undefined): string {
    const stars = parseEquipmentStarLevel(itemTemplateId);
    if (stars == null) return '';
    return [
        `<div style="position:absolute;left:2px;bottom:1px;font-size:9px;font-weight:bold;`,
        `line-height:1;color:#ffd070;letter-spacing:-0.5px;`,
        `text-shadow:0 0 3px #000,1px 1px 0 #000;pointer-events:none;">`,
        buildEquipmentStarGlyphs(stars),
        `</div>`,
    ].join('');
}

/** Một dòng Sao cho tooltip native (title). */
export function formatEquipmentStarTooltipLine(itemTemplateId: string | null | undefined): string {
    const stars = parseEquipmentStarLevel(itemTemplateId);
    if (stars == null) return '';
    return `${t('equipment.star_level', { n: stars })} (${buildEquipmentStarGlyphs(stars)})`;
}
