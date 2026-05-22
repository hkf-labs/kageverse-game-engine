import { WOODEN_SWORD_TEMPLATE_ID } from './itemIcon';

/** Trang bị có thể cường hoá (+N) trên UI — Kiếm Gỗ loại trừ. */
export function canDisplayEquipmentUpgrade(itemTemplateId: string | null | undefined): boolean {
    if (!itemTemplateId) return false;
    return itemTemplateId !== WOODEN_SWORD_TEMPLATE_ID;
}

/** Badge +N trên ô lưới. Chỉ trang bị được cường hoá; Kiếm Gỗ → ''. */
export function buildEquipmentUpgradeBadgeHtml(
    upgradeLevel: number,
    itemTemplateId?: string | null,
): string {
    if (!canDisplayEquipmentUpgrade(itemTemplateId)) return '';
    const lv = Math.max(0, Math.floor(upgradeLevel));
    const color = lv > 0 ? '#ffd070' : '#9a9080';
    return [
        `<div style="position:absolute;left:2px;top:0;font-size:10px;font-weight:bold;`,
        `color:${color};line-height:1;text-shadow:0 0 3px #000,1px 1px 0 #000;`,
        `pointer-events:none;">+${lv}</div>`,
    ].join('');
}

/** Dòng +N trong modal Xem chi tiết. */
export function buildEquipmentUpgradeDetailHtml(
    upgradeLevel: number,
    itemTemplateId?: string | null,
    extraStyle = '',
): string {
    if (!canDisplayEquipmentUpgrade(itemTemplateId)) return '';
    const lv = Math.max(0, Math.floor(upgradeLevel));
    const color = lv > 0 ? '#ffd070' : '#9a9080';
    return `<div style="color:${color};font-size:13px;font-weight:bold;${extraStyle}">+${lv}</div>`;
}
