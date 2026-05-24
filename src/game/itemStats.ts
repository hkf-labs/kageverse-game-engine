import { t } from '../i18n';

/** Một dòng chỉ số hiển thị (nhãn + giá trị đã format). */
export type ItemStatLine = { label: string; value: string };

/**
 * Cặp min/max trên template.base_stats → một dòng UI.
 * Khớp `equipmentStatRanges` BE (`internal/modules/inventory/domain/roll.go`).
 */
const EQUIPMENT_STAT_ROWS: Array<{
    minKey: string;
    maxKey: string;
    rolledKey: string;
    labelKey: string;
    percent?: boolean;
}> = [
    { minKey: 'atk_min', maxKey: 'atk_max', rolledKey: 'atk_bonus', labelKey: 'equipment.stat_attack' },
    { minKey: 'accuracy_min', maxKey: 'accuracy_max', rolledKey: 'accuracy_bonus', labelKey: 'equipment.stat_accuracy' },
    { minKey: 'mp_min', maxKey: 'mp_max', rolledKey: 'mp_bonus', labelKey: 'equipment.stat_mp' },
    { minKey: 'power_min', maxKey: 'power_max', rolledKey: 'power_bonus', labelKey: 'equipment.stat_power', percent: true },
    { minKey: 'def_min', maxKey: 'def_max', rolledKey: 'def_bonus', labelKey: 'equipment.stat_defense' },
    { minKey: 'hp_min', maxKey: 'hp_max', rolledKey: 'hp_bonus', labelKey: 'equipment.stat_max_hp' },
    { minKey: 'crit_rate_min', maxKey: 'crit_rate_max', rolledKey: 'crit_rate_bonus', labelKey: 'equipment.stat_crit_rate', percent: true },
    { minKey: 'crit_damage_min', maxKey: 'crit_damage_max', rolledKey: 'crit_damage_bonus', labelKey: 'equipment.stat_crit_damage', percent: true },
];

function hasRolledValues(rolled: Record<string, number> | null | undefined): boolean {
    return rolled != null && Object.keys(rolled).length > 0;
}

function formatRolledValue(v: number, percent?: boolean): string {
    const sign = v > 0 ? '+' : '';
    const suffix = percent ? '%' : '';
    return `${sign}${v}${suffix}`;
}

function formatRangeValue(min: number, max: number, percent?: boolean): string {
    const suffix = percent ? '%' : '';
    if (min === max) return `${min}${suffix}`;
    return `${min} – ${max}${suffix}`;
}

export type EquipmentStatDisplayOptions = {
    /** Vũ khí chưa roll (`rolled_stats` rỗng) → không hiện chỉ số (Túi / Trang bị). */
    subType?: string | null;
};

/**
 * Sinh danh sách chỉ số trang bị để hiển thị tooltip / modal Xem chi tiết.
 * - Đã roll (`rolled_stats` non-empty): flat bonus (atk_bonus, power_bonus, …).
 * - Chưa roll: dải min–max từ `base_stats` (trừ `sub_type=weapon` — chờ equip/roll).
 */
export function buildEquipmentStatLines(
    baseStats: Record<string, number> | null | undefined,
    rolledStats: Record<string, number> | null | undefined,
    options?: EquipmentStatDisplayOptions,
): ItemStatLine[] {
    const lines: ItemStatLine[] = [];
    const base = baseStats ?? {};
    const rolled = rolledStats;

    // Vũ khí chưa roll (sub_type=weapon, rolled_stats rỗng) → ẩn dải chỉ số
    // vì chỉ số thực chỉ xác định sau khi equip/roll. Các sub_type khác vẫn
    // hiện dải base_stats để người chơi biết trang bị sẽ có chỉ số gì.
    if (options?.subType === 'weapon' && !hasRolledValues(rolled)) {
        return lines;
    }

    if (hasRolledValues(rolled)) {
        for (const row of EQUIPMENT_STAT_ROWS) {
            const v = rolled![row.rolledKey];
            if (v === undefined) continue;
            lines.push({
                label: t(row.labelKey),
                value: formatRolledValue(v, row.percent),
            });
        }
        return lines;
    }

    for (const row of EQUIPMENT_STAT_ROWS) {
        const maxV = base[row.maxKey];
        if (maxV === undefined || maxV < 0) continue;
        const minV = base[row.minKey] ?? 0;
        lines.push({
            label: t(row.labelKey),
            value: formatRangeValue(minV, maxV, row.percent),
        });
    }

    return lines;
}

/** Nối các dòng stat thành chuỗi tooltip (xuống dòng). */
export function formatEquipmentStatTooltip(
    baseStats: Record<string, number> | null | undefined,
    rolledStats: Record<string, number> | null | undefined,
    subType?: string | null,
): string {
    return buildEquipmentStatLines(baseStats, rolledStats, { subType })
        .map((line) => `${line.label}: ${line.value}`)
        .join('\n');
}
