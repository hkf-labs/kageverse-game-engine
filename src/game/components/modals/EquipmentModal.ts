import * as Phaser from 'phaser';
import {
    inventoryAPI,
    type CharacterStatsSnapshot,
    type EquippedItemDTO,
    type InventoryItemDTO,
} from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS, MODAL_SIZES, MODAL_Z_INDEX } from './theme';

type ActionSlot = 'left' | 'center' | 'right';

interface ActionDef {
    key: string;
    slot: ActionSlot;
    label: string;
    palette: string;
    onClick: () => void;
}

// 16 ô tổng = 10 active (5 trái + 5 phải) + 6 dưới khoá.
// MVP BE chỉ support 7 slot (main_hand/shirt/pants/shoes/hat/ring/cloak); 3 slot
// còn lại trên cột phải (scroll/ninjutsu/costume) khoá tạm cho post-MVP.
type SlotKey =
    | 'hat' | 'cloak' | 'shirt' | 'pants' | 'shoes'
    | 'main_hand' | 'ring' | 'scroll' | 'ninjutsu' | 'support_costume'
    | `future_${number}`;

interface SlotDef {
    key: SlotKey;
    labelKey: string; // i18n key resolved via t() at render time.
    icon: string;
    locked: boolean; // true = ô khoá vĩnh viễn (post-MVP); active=false để bỏ qua API.
    beSlotId?: string; // slot id BE biết (nếu khác key, hoặc null cho ô khoá).
}

const LEFT_COL: SlotDef[] = [
    { key: 'hat',   labelKey: 'equipment.slot_hat',    icon: '🪖', locked: false, beSlotId: 'hat' },
    { key: 'cloak', labelKey: 'equipment.slot_cloak',  icon: '🧥', locked: false, beSlotId: 'cloak' },
    { key: 'shirt', labelKey: 'equipment.slot_shirt',  icon: '👕', locked: false, beSlotId: 'shirt' },
    { key: 'pants', labelKey: 'equipment.slot_pants',  icon: '👖', locked: false, beSlotId: 'pants' },
    { key: 'shoes', labelKey: 'equipment.slot_shoes',  icon: '👟', locked: false, beSlotId: 'shoes' },
];

const RIGHT_COL: SlotDef[] = [
    { key: 'main_hand',       labelKey: 'equipment.slot_main_hand',       icon: '⚔️', locked: false, beSlotId: 'main_hand' },
    { key: 'ring',            labelKey: 'equipment.slot_ring',            icon: '💍', locked: false, beSlotId: 'ring' },
    { key: 'scroll',          labelKey: 'equipment.slot_scroll',          icon: '📜', locked: true },
    { key: 'ninjutsu',        labelKey: 'equipment.slot_ninjutsu',        icon: '🌀', locked: true },
    { key: 'support_costume', labelKey: 'equipment.slot_support_costume', icon: '🎽', locked: true },
];

const BOTTOM_ROW: SlotDef[] = Array.from({ length: 6 }, (_, i) => ({
    key: `future_${i}` as SlotKey,
    labelKey: 'equipment.slot_future',
    icon: '',
    locked: true,
}));

const PLACEHOLDER_FEMALE = 'assets/game/characters/ninja-full-body-female.png';
const PLACEHOLDER_MALE = 'assets/game/characters/ninja-full-body-male.png';

// Stat key → i18n key (rolled_stats keys khớp `equipment-system.md`).
const STAT_KEY: Record<string, string> = {
    attack: 'equipment.stat_attack',
    min_attack: 'equipment.stat_min_attack',
    max_attack: 'equipment.stat_max_attack',
    defense: 'equipment.stat_defense',
    max_hp: 'equipment.stat_max_hp',
    max_mp: 'equipment.stat_max_mp',
    crit_rate: 'equipment.stat_crit_rate',
    accuracy: 'equipment.stat_accuracy',
    dodge: 'equipment.stat_dodge',
};

function statLabel(key: string): string {
    const i18nKey = STAT_KEY[key];
    return i18nKey ? t(i18nKey) : key;
}

export class EquipmentModal extends BaseModal {
    private slotsByKey = new Map<SlotKey, HTMLDivElement>();
    private statsEl?: HTMLDivElement;
    private equipped = new Map<string, EquippedItemDTO>(); // be slot id → item
    private loading = false;
    private actionInFlight = false;
    /** 2D nav coords trên grid (LEFT_COL | RIGHT_COL) × 5 row. col=0 left, col=1 right. */
    private focusedRow = 0;
    private focusedCol = 0;
    /** Slot đang được chọn → action bar render Xem/Tháo cho item đang mặc.
     * null = chưa chọn slot (hoặc chọn slot trống) → bar trống. */
    private selectedSlotKey: SlotKey | null = null;
    /** Vùng focus điều hướng — 'grid' = ô slot, 'actions' = nút action bar. */
    private focusZone: 'grid' | 'actions' = 'grid';
    private focusedAction = 0;
    /** Action bar overlay (Tháo + Xem) — pattern giống InventoryModal: sibling
     * panel trong shell.overlay, absolute đáy màn hình. */
    private actionBarEl?: HTMLDivElement;
    private actionButtons: HTMLButtonElement[] = [];
    /** Sub-modal "Xem chi tiết" item — overlay riêng z-index=tooltip. */
    private detailOverlayEl?: HTMLDivElement;
    private detailPanelEl?: HTMLDivElement;
    private detailOpen = false;
    private onStatsChanged?: (stats: CharacterStatsSnapshot) => void;
    private onEquipmentChanged?: () => void;

    constructor(
        scene: Phaser.Scene,
        callbacks?: {
            onStatsChanged?: (stats: CharacterStatsSnapshot) => void;
            onEquipmentChanged?: () => void;
        },
    ) {
        super(scene);
        this.onStatsChanged = callbacks?.onStatsChanged;
        this.onEquipmentChanged = callbacks?.onEquipmentChanged;
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-equipment',
            size: 'md',
            layer: 'modal',
            withStatus: true,
            title: t('equipment.title'),
            onClose: () => this.toggle(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Body — 3 columns (left slots / character preview / right slots) +
        // bottom row (6 future locked).
        const body = document.createElement('div');
        body.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:14px;background:rgba(0,0,0,0.25);align-items:center;';

        const leftCol = this.buildColumn(LEFT_COL, 'left');
        const rightCol = this.buildColumn(RIGHT_COL, 'right');

        const center = document.createElement('div');
        center.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;';
        const charImg = document.createElement('img');
        const gender = getCurrentCharacter()?.gender;
        charImg.src = gender === 'female' ? PLACEHOLDER_FEMALE : PLACEHOLDER_MALE;
        charImg.alt = 'character';
        charImg.style.cssText = 'width:96px;height:auto;image-rendering:pixelated;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));';
        center.appendChild(charImg);
        // Stat tổng (placeholder — wire khi BE expose endpoint stats aggregated).
        this.statsEl = document.createElement('div');
        this.statsEl.style.cssText = `margin-top:14px;padding:8px 12px;background:rgba(45,26,10,0.6);border:1px solid ${MODAL_COLORS.divider};border-radius:6px;font-size:11px;color:#ffd070;text-align:center;line-height:1.6;min-width:140px;`;
        this.statsEl.innerHTML = `<div style="color:#888;font-style:italic;">${escapeHtml(t('equipment.stats_placeholder'))}</div>`;
        center.appendChild(this.statsEl);

        body.append(leftCol, center, rightCol);
        shell.body.appendChild(body);

        // Bottom row — 6 future locked slots.
        const bottom = document.createElement('div');
        bottom.style.cssText = `display:flex;justify-content:center;gap:8px;padding:10px 14px 14px;background:rgba(0,0,0,0.35);border-top:2px solid ${MODAL_COLORS.divider};`;
        for (const def of BOTTOM_ROW) bottom.appendChild(this.buildSlotCell(def));
        shell.body.appendChild(bottom);

        // Action bar — sibling của panel trong overlay, absolute đáy màn hình.
        // Share zoom với panel để cụm Tháo/Xem shrink theo viewport.
        const bar = document.createElement('div');
        Object.assign(bar.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '16px',
            height: '44px',
            pointerEvents: 'none',
        });
        shell.overlay.appendChild(bar);
        shell.applyZoomTo(bar);
        this.actionBarEl = bar;

        // Re-render mọi text khi locale đổi runtime.
        shell.registerLocaleSync(() => {
            this.shell?.setTitle(t('equipment.title'));
            this.renderSlots();
            this.renderStatsSummary();
            this.renderActionBar();
            if (this.detailOpen) this.renderDetailModalContent();
        });
    }

    private buildColumn(defs: SlotDef[], side: 'left' | 'right'): HTMLDivElement {
        const col = document.createElement('div');
        col.style.cssText = `display:flex;flex-direction:column;gap:8px;align-items:${side === 'left' ? 'flex-end' : 'flex-start'};`;
        for (const def of defs) col.appendChild(this.buildSlotCell(def));
        return col;
    }

    private buildSlotCell(def: SlotDef): HTMLDivElement {
        const cell = document.createElement('div');
        const baseColor = def.locked ? '#3a2a1a' : '#d4af37';
        Object.assign(cell.style, {
            width: '60px', height: '60px',
            border: `2px solid ${baseColor}`,
            borderRadius: '6px',
            background: def.locked ? 'rgba(20,12,4,0.4)' : 'rgba(20,12,4,0.6)',
            position: 'relative',
            cursor: def.locked ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', userSelect: 'none',
            transition: 'border-color 0.1s, box-shadow 0.1s',
            opacity: def.locked ? '0.55' : '1',
        });
        cell.title = t(def.labelKey);

        if (def.locked) {
            cell.innerHTML = `<div style="font-size:22px;color:#666;">🔒</div>`;
        } else {
            // Default: show icon + small label tag.
            cell.innerHTML =
                `<div data-icon style="font-size:24px;opacity:0.45;">${def.icon}</div>`
                + `<div style="position:absolute;left:0;right:0;bottom:-1px;font-size:9px;text-align:center;color:#a07040;background:rgba(0,0,0,0.4);padding:1px 0;border-bottom-left-radius:4px;border-bottom-right-radius:4px;">${escapeHtml(t(def.labelKey))}</div>`;
            cell.addEventListener('mouseenter', () => {
                cell.style.borderColor = '#ffd070';
                cell.style.boxShadow = '0 0 8px rgba(255,234,122,0.4)';
            });
            cell.addEventListener('mouseleave', () => {
                cell.style.borderColor = baseColor;
                cell.style.boxShadow = 'none';
            });
            cell.addEventListener('click', () => this.handleSlotClick(def));
        }

        this.slotsByKey.set(def.key, cell);
        return cell;
    }

    toggle(): void {
        const willShow = !this.visible;
        if (willShow) this.ensureShell();
        this.visible = willShow;
        if (willShow) {
            this.focusedRow = 0;
            this.focusedCol = 0;
            this.selectedSlotKey = null;
            this.focusZone = 'grid';
            this.focusedAction = 0;
            this.renderFocus();
            this.renderActionBar();
            void this.refresh();
        } else {
            this.teardownShell();
        }
    }

    /** ↑/↓/←/→ điều hướng. Trên grid 5×2 hoặc trên action bar (Tháo/Xem) khi
     * focusZone='actions'. Từ row cuối ↓ sang actions (nếu bar có nút); ↑ trên
     * actions quay về grid. Slot locked vẫn focus được nhưng Enter no-op. */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (this.focusZone === 'actions') return this.navActions(direction);

        let row = this.focusedRow;
        let col = this.focusedCol;
        switch (direction) {
            case 'left':  col = Math.max(0, col - 1); break;
            case 'right': col = Math.min(1, col + 1); break;
            case 'up':    row = Math.max(0, row - 1); break;
            case 'down':
                if (row === 4 && this.actionButtons.length > 0) {
                    this.focusZone = 'actions';
                    this.focusedAction = 0;
                    this.renderActionFocus();
                    return;
                }
                row = Math.min(4, row + 1);
                break;
        }
        if (row === this.focusedRow && col === this.focusedCol) return;
        this.focusedRow = row;
        this.focusedCol = col;
        this.renderFocus();
    }

    private navActions(direction: 'left' | 'right' | 'up' | 'down'): void {
        switch (direction) {
            case 'left':
                if (this.focusedAction > 0) {
                    this.focusedAction -= 1;
                    this.renderActionFocus();
                }
                return;
            case 'right':
                if (this.focusedAction < this.actionButtons.length - 1) {
                    this.focusedAction += 1;
                    this.renderActionFocus();
                }
                return;
            case 'up':
                this.focusZone = 'grid';
                this.renderActionFocus();
                this.renderFocus();
                return;
            case 'down':
                return;
        }
    }

    /** Enter — actions zone: click nút focus; grid: click slot (mở action bar). */
    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone === 'actions') {
            const btn = this.actionButtons[this.focusedAction];
            if (btn && !btn.disabled) btn.click();
            return;
        }
        const def = this.getFocusedDef();
        if (!def || def.locked) return;
        this.handleSlotClick(def);
    }

    private getFocusedDef(): SlotDef | null {
        const column = this.focusedCol === 0 ? LEFT_COL : RIGHT_COL;
        return column[this.focusedRow] ?? null;
    }

    private renderFocus(): void {
        const cols: SlotDef[][] = [LEFT_COL, RIGHT_COL];
        cols.forEach((column, ci) => {
            column.forEach((def, ri) => {
                const cell = this.slotsByKey.get(def.key);
                if (!cell) return;
                const focused = ci === this.focusedCol && ri === this.focusedRow;
                if (focused) {
                    cell.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
                    cell.style.outlineOffset = '2px';
                    cell.style.boxShadow = '0 0 10px rgba(255,234,122,0.7)';
                } else {
                    cell.style.outline = '';
                    cell.style.outlineOffset = '';
                    // Giữ box-shadow gốc để hover effect không bị clobber
                    if (!cell.matches(':hover')) cell.style.boxShadow = '';
                }
            });
        });
    }

    open(): void {
        if (!this.visible) this.toggle();
    }

    close(): void {
        if (this.visible) this.toggle();
    }

    /** Refresh từ BE — gọi sau equip/unequip ở nơi khác (vd InventoryModal). */
    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('equipment.error_no_character'), 'error');
            return;
        }
        if (this.loading) return;
        this.loading = true;
        this.shell?.setStatus(t('equipment.loading'), 'muted');
        try {
            const res = await inventoryAPI.listEquipped(character.id);
            this.equipped.clear();
            for (const it of res.items) this.equipped.set(it.slot, it);
            this.renderSlots();
            this.renderStatsSummary();
            this.shell?.setStatus('', 'muted');
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('equipment.error_load');
            this.shell?.setStatus(msg, 'error');
        } finally {
            this.loading = false;
        }
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.slotsByKey.clear();
        this.statsEl = undefined;
        this.actionBarEl = undefined;
        this.actionButtons = [];
        this.selectedSlotKey = null;
        this.focusZone = 'grid';
        this.closeDetailModal();
    }

    private renderSlots(): void {
        const allActive = [...LEFT_COL, ...RIGHT_COL];
        for (const def of allActive) {
            if (def.locked || !def.beSlotId) continue;
            const cell = this.slotsByKey.get(def.key);
            if (!cell) continue;
            const equipped = this.equipped.get(def.beSlotId);
            this.paintCell(cell, def, equipped);
        }
    }

    private paintCell(cell: HTMLDivElement, def: SlotDef, equipped?: EquippedItemDTO): void {
        const slotLabel = t(def.labelKey);
        if (!equipped) {
            // Slot trống — icon mờ + label
            cell.innerHTML =
                `<div data-icon style="font-size:24px;opacity:0.45;">${def.icon}</div>`
                + `<div style="position:absolute;left:0;right:0;bottom:-1px;font-size:9px;text-align:center;color:#a07040;background:rgba(0,0,0,0.4);padding:1px 0;border-bottom-left-radius:4px;border-bottom-right-radius:4px;">${escapeHtml(slotLabel)}</div>`;
            cell.title = t('equipment.tooltip_empty', { slot: slotLabel });
            cell.style.borderColor = '#d4af37';
            return;
        }
        const item = equipped.item;
        const upgradeBadge = item.upgrade_level > 0
            ? `<div style="position:absolute;left:2px;top:0;font-size:10px;font-weight:bold;color:${MODAL_COLORS.title};text-shadow:0 0 3px #000,1px 1px 0 #000;">+${item.upgrade_level}</div>`
            : '';
        const boundBadge = item.is_bound
            ? `<div style="position:absolute;right:2px;top:0;font-size:9px;color:${MODAL_COLORS.statusError};text-shadow:0 0 3px #000;">🔒</div>`
            : '';
        cell.innerHTML =
            `<div style="font-size:24px;">${def.icon}</div>`
            + upgradeBadge + boundBadge
            + `<div style="position:absolute;left:0;right:0;bottom:-1px;font-size:9px;text-align:center;color:${MODAL_COLORS.title};background:rgba(0,0,0,0.6);padding:1px 0;font-weight:bold;border-bottom-left-radius:4px;border-bottom-right-radius:4px;">${escapeHtml(slotLabel)}</div>`;
        cell.title = formatItemTooltip(slotLabel, item);
        cell.style.borderColor = MODAL_COLORS.borderAccent;
    }

    private renderStatsSummary(): void {
        if (!this.statsEl) return;
        // Cộng dồn rolled_stats từ mọi item đang equipped.
        const totals: Record<string, number> = {};
        for (const eq of this.equipped.values()) {
            const stats = eq.item.rolled_stats ?? eq.item.base_stats;
            if (!stats) continue;
            for (const [k, v] of Object.entries(stats)) totals[k] = (totals[k] ?? 0) + v;
        }
        const entries = Object.entries(totals).filter(([, v]) => v !== 0);
        if (entries.length === 0) {
            this.statsEl.innerHTML = `<div style="color:#888;font-style:italic;">${escapeHtml(t('equipment.stats_empty'))}</div>`;
            return;
        }
        this.statsEl.innerHTML = entries
            .map(([k, v]) => {
                const sign = v > 0 ? '+' : '';
                return `<div>${escapeHtml(statLabel(k))}: <span style="color:${MODAL_COLORS.statusOk};font-weight:bold;">${sign}${v}</span></div>`;
            })
            .join('');
    }

    private handleSlotClick(def: SlotDef): void {
        if (!def.beSlotId) return;
        // Sync keyboard focus về slot vừa click — nếu không, outline khung sáng
        // sẽ ở slot cũ (mặc định 0,0) trong khi action bar render theo slot mới.
        this.syncFocusToSlot(def.key);
        const equipped = this.equipped.get(def.beSlotId);
        if (!equipped) {
            // Ô trống — hint trên status footer + clear selection.
            this.shell?.setStatus(t('equipment.empty_hint', { slot: t(def.labelKey) }), 'muted');
            this.setSelectedSlot(null);
            return;
        }
        // Có item — chọn slot này để action bar Tháo/Xem render. Click cùng
        // slot lần 2 vẫn giữ selection (idempotent), không deselect.
        this.shell?.setStatus('', 'muted');
        this.setSelectedSlot(def.key);
    }

    private setSelectedSlot(key: SlotKey | null): void {
        if (this.selectedSlotKey === key) return;
        this.selectedSlotKey = key;
        // Đổi item → sub-modal Xem (nếu mở) refresh content; nếu mất item → đóng.
        this.renderActionBar();
        if (this.detailOpen) this.renderDetailModalContent();
    }

    private findSlotDef(key: SlotKey): SlotDef | null {
        for (const def of LEFT_COL) if (def.key === key) return def;
        for (const def of RIGHT_COL) if (def.key === key) return def;
        return null;
    }

    private syncFocusToSlot(key: SlotKey): void {
        const leftIdx = LEFT_COL.findIndex((d) => d.key === key);
        if (leftIdx >= 0) {
            this.focusedRow = leftIdx;
            this.focusedCol = 0;
            this.focusZone = 'grid';
            this.renderFocus();
            return;
        }
        const rightIdx = RIGHT_COL.findIndex((d) => d.key === key);
        if (rightIdx >= 0) {
            this.focusedRow = rightIdx;
            this.focusedCol = 1;
            this.focusZone = 'grid';
            this.renderFocus();
        }
    }

    /** Tập hợp action cho slot đang chọn. Empty → mảng rỗng (bar không render). */
    private collectActions(): ActionDef[] {
        if (!this.selectedSlotKey) return [];
        const def = this.findSlotDef(this.selectedSlotKey);
        if (!def?.beSlotId) return [];
        const equipped = this.equipped.get(def.beSlotId);
        if (!equipped) return [];

        // equipped check pass → biết slot có item, handleUnequip không cần
        // tham số equipped (refetch từ this.equipped trong handler).
        void equipped;
        return [
            {
                key: 'unequip',
                slot: 'left',
                label: t('inventory.btn_unequip'),
                palette: 'border:2px solid #7a6a2a;background:#3a3014;color:#ffd070;',
                onClick: () => void this.handleUnequip(def),
            },
            {
                key: 'view',
                slot: 'center',
                label: this.detailOpen ? t('inventory.btn_close_detail') : t('inventory.btn_view'),
                palette: 'border:2px solid #3a5a7a;background:#1a2a3a;color:#a0c8e0;',
                onClick: () => this.toggleDetailModal(),
            },
        ];
    }

    private renderActionBar(): void {
        if (!this.actionBarEl) return;
        this.actionBarEl.innerHTML = '';
        this.actionButtons = [];

        const actions = this.collectActions();
        if (actions.length === 0) {
            if (this.focusZone === 'actions') this.focusZone = 'grid';
            return;
        }
        if (this.focusedAction >= actions.length) this.focusedAction = 0;

        const SLOT_POS: Record<ActionSlot, Partial<Pick<CSSStyleDeclaration, 'left' | 'right' | 'transform'>>> = {
            left: { left: '24px' },
            center: { left: '50%', transform: 'translateX(-50%)' },
            right: { right: '24px' },
        };

        const disabled = this.actionInFlight;
        actions.forEach((a) => {
            const btn = document.createElement('button');
            btn.textContent = a.label;
            // View read-only — không bị disable bởi actionInFlight.
            const isMutating = a.key !== 'view';
            const btnDisabled = disabled && isMutating;
            btn.disabled = btnDisabled;
            const pos = SLOT_POS[a.slot];
            Object.assign(btn.style, {
                position: 'absolute',
                bottom: '0',
                left: pos.left ?? '',
                right: pos.right ?? '',
                transform: pos.transform ?? '',
                minWidth: '92px',
                height: '36px',
                padding: '0 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: btnDisabled ? 'not-allowed' : 'pointer',
                fontFamily: 'system-ui, sans-serif',
                pointerEvents: 'auto',
                opacity: btnDisabled ? '0.5' : '1',
                boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
            });
            btn.style.cssText += a.palette;
            btn.addEventListener('click', a.onClick);
            this.actionBarEl!.appendChild(btn);
            this.actionButtons.push(btn);
        });

        this.renderActionFocus();
    }

    private renderActionFocus(): void {
        const focused = this.focusZone === 'actions';
        this.actionButtons.forEach((btn, idx) => {
            if (focused && this.focusedAction === idx) {
                btn.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
                btn.style.outlineOffset = '2px';
                btn.style.boxShadow = '0 0 12px rgba(255,234,122,0.7), 0 4px 12px rgba(0,0,0,0.5)';
            } else {
                btn.style.outline = '';
                btn.style.outlineOffset = '';
                btn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.5)';
            }
        });
    }

    private toggleDetailModal(): void {
        if (this.detailOpen) this.closeDetailModal();
        else this.openDetailModal();
    }

    private openDetailModal(): void {
        if (this.detailOpen) return;
        if (!this.selectedSlotKey) return;
        const def = this.findSlotDef(this.selectedSlotKey);
        if (!def?.beSlotId || !this.equipped.has(def.beSlotId)) return;
        this.ensureDetailModalDOM();
        this.detailOpen = true;
        this.renderDetailModalContent();
        this.renderActionBar();
    }

    private closeDetailModal(): void {
        if (this.detailOverlayEl) {
            this.detailOverlayEl.remove();
            this.detailOverlayEl = undefined;
            this.detailPanelEl = undefined;
        }
        if (!this.detailOpen) return;
        this.detailOpen = false;
        if (this.actionBarEl) this.renderActionBar();
    }

    private ensureDetailModalDOM(): void {
        if (this.detailOverlayEl) return;
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        const overlay = document.createElement('div');
        overlay.classList.add('kageverse-overlay-equipment-detail');
        Object.assign(overlay.style, {
            position: 'absolute',
            inset: '0',
            background: 'transparent',
            zIndex: String(MODAL_Z_INDEX.tooltip),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontFamily: 'system-ui, sans-serif',
        });

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            width: '300px',
            maxHeight: '60vh',
            background: `linear-gradient(180deg, ${MODAL_COLORS.panelBgTop} 0%, ${MODAL_COLORS.panelBgBottom} 100%)`,
            border: `${MODAL_SIZES.borderWidth} solid ${MODAL_COLORS.border}`,
            borderRadius: MODAL_SIZES.borderRadius,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            color: MODAL_COLORS.text,
            padding: '14px 16px',
            overflow: 'auto',
            pointerEvents: 'auto',
            fontSize: '13px',
            lineHeight: '1.5',
        });
        overlay.appendChild(panel);
        parent.appendChild(overlay);

        this.detailOverlayEl = overlay;
        this.detailPanelEl = panel;
        this.shell?.applyZoomTo(panel);
    }

    private renderDetailModalContent(): void {
        if (!this.detailPanelEl) return;
        if (!this.selectedSlotKey) {
            this.closeDetailModal();
            return;
        }
        const def = this.findSlotDef(this.selectedSlotKey);
        const equipped = def?.beSlotId ? this.equipped.get(def.beSlotId) : undefined;
        if (!def || !equipped) {
            this.closeDetailModal();
            return;
        }
        const item = equipped.item;
        const wrap = 'word-break:break-word;white-space:normal;';
        const upgradeRow = item.upgrade_level > 0
            ? `<div style="color:${MODAL_COLORS.title};font-size:13px;font-weight:bold;${wrap}">+${item.upgrade_level}</div>`
            : '';
        const boundRow = item.is_bound
            ? `<div style="color:${MODAL_COLORS.statusError};font-size:12px;${wrap}">${escapeHtml(t('inventory.bound_badge'))}</div>`
            : '';
        const stats = item.rolled_stats ?? item.base_stats;
        const statRows = stats
            ? Object.entries(stats)
                .filter(([, v]) => v !== 0)
                .map(([k, v]) => {
                    const sign = v > 0 ? '+' : '';
                    return `<div style="${wrap}">${escapeHtml(statLabel(k))}: <span style="color:${MODAL_COLORS.statusOk};font-weight:bold;">${sign}${v}</span></div>`;
                })
                .join('')
            : '';
        this.detailPanelEl.innerHTML = [
            `<div style="display:flex;flex-direction:column;gap:6px;">`,
            `  <div style="font-size:15px;font-weight:bold;color:${MODAL_COLORS.title};${wrap}">${escapeHtml(t(item.name_key))}</div>`,
            upgradeRow,
            `  <div style="font-size:12px;color:#d4af37;${wrap}">[${escapeHtml(t(def.labelKey))}]</div>`,
            boundRow,
            statRows ? `<div style="margin-top:4px;font-size:12px;color:${MODAL_COLORS.text};display:flex;flex-direction:column;gap:3px;">${statRows}</div>` : '',
            `</div>`,
        ].join('');
    }

    private async handleUnequip(def: SlotDef): Promise<void> {
        if (this.actionInFlight || !def.beSlotId) return;
        const character = getCurrentCharacter();
        if (!character) return;

        const slotLabel = t(def.labelKey);
        this.actionInFlight = true;
        this.renderActionBar();
        this.shell?.setStatus(t('equipment.unequipping'), 'muted');
        try {
            await inventoryAPI.unequip(character.id, def.beSlotId);
            this.shell?.setStatus(t('equipment.unequipped', { slot: slotLabel }), 'ok');
            // Item rời slot → đóng sub-modal Xem + clear selection.
            this.setSelectedSlot(null);
            this.closeDetailModal();
            await this.refresh();
            // equip_item objective state có thể thay đổi (vd Q3 require equip
            // weapon — unequip khiến progress reset). Báo scene refresh.
            this.onEquipmentChanged?.();
            // BE tự cập nhật stat character → fetch lại HUD nếu callback có.
            if (this.onStatsChanged) {
                const { charactersAPI } = await import('../../../network/api');
                const list = await charactersAPI.list();
                const c = list.characters.find((x) => x.id === character.id);
                if (c) this.onStatsChanged({
                    current_hp: c.current_hp, max_hp: c.max_hp,
                    current_mp: c.current_mp, max_mp: c.max_mp,
                    hp_potion_cd_until: null,
                    mp_potion_cd_until: null,
                });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('equipment.error_unequip');
            this.shell?.setStatus(msg, 'error');
        } finally {
            this.actionInFlight = false;
            this.renderActionBar();
        }
    }
}

function formatItemTooltip(slotLabel: string, item: InventoryItemDTO): string {
    const parts = [`${slotLabel}: ${item.name_key}`];
    if (item.upgrade_level > 0) parts.push(`+${item.upgrade_level}`);
    if (item.is_bound) parts.push(t('equipment.tooltip_locked'));
    const stats = item.rolled_stats ?? item.base_stats;
    if (stats) {
        for (const [k, v] of Object.entries(stats)) {
            const sign = v > 0 ? '+' : '';
            parts.push(`${statLabel(k)}: ${sign}${v}`);
        }
    }
    return parts.join('\n');
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
