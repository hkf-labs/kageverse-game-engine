import * as Phaser from 'phaser';
import {
    charactersAPI,
    equipmentUpgradeAPI,
    inventoryAPI,
    type EnchantStatBonus,
    type InventoryItemDTO,
} from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

// MVP Hoshi cường hoá. Q13 yêu cầu cường hoá 3 category (weapon/jewelry/apparel)
// nên modal MVP focus path Upgrade — Extract defer.
//
// Cost table mirror BE (equipmentupgrade/domain/upgrade.go costPerLevel). Cap
// theo character level: <20 = +4, 20-29 = +8.
//
// Stone item: material_upgrade_stone_lv1 (Đá Cường Hoá).

type Category = 'weapon' | 'jewelry' | 'apparel';

interface UpgradeCost {
    stones: number;
    yen: number;
}

const COST_TABLE: Record<Category, UpgradeCost[]> = {
    apparel: [
        { stones: 1, yen: 100 }, { stones: 1, yen: 200 }, { stones: 2, yen: 400 }, { stones: 3, yen: 800 },
        { stones: 4, yen: 1600 }, { stones: 5, yen: 3200 }, { stones: 6, yen: 6400 }, { stones: 7, yen: 12800 },
    ],
    jewelry: [
        { stones: 2, yen: 200 }, { stones: 2, yen: 400 }, { stones: 3, yen: 800 }, { stones: 4, yen: 1600 },
        { stones: 5, yen: 3200 }, { stones: 6, yen: 6400 }, { stones: 7, yen: 12800 }, { stones: 8, yen: 25600 },
    ],
    weapon: [
        { stones: 3, yen: 500 }, { stones: 3, yen: 1000 }, { stones: 4, yen: 2000 }, { stones: 5, yen: 4000 },
        { stones: 6, yen: 8000 }, { stones: 7, yen: 16000 }, { stones: 8, yen: 32000 }, { stones: 9, yen: 64000 },
    ],
};

const STONE_TEMPLATE_ID = 'material_upgrade_stone_lv1';

// Category → i18n key. Resolve qua t() lazy mỗi render → tự re-render khi locale đổi.
const CATEGORY_KEY: Record<Category, string> = {
    weapon: 'hoshi.category_weapon',
    jewelry: 'hoshi.category_jewelry',
    apparel: 'hoshi.category_apparel',
};

function capForLevel(level: number): number {
    if (level < 20) return 4;
    if (level < 30) return 8;
    return 8;
}

function nextCost(category: Category, currentLevel: number): UpgradeCost | null {
    const idx = currentLevel; // đập từ +N → +(N+1) ⇒ index = N
    return COST_TABLE[category][idx] ?? null;
}

// Ước lượng bonus delta cho 1 level theo equippedSlot (mirror BE
// ComputeEnchantBonus). Item chưa equipped → bonus delta 0 (BE cũng vậy).
function bonusForLevel(category: Category, equippedSlot: string | null, level: number): EnchantStatBonus {
    const z: EnchantStatBonus = { atk: 0, def: 0, hp: 0, mp: 0 };
    if (level <= 0 || !equippedSlot) return z;
    if (category === 'weapon' && equippedSlot === 'main_hand') return { ...z, atk: level * 2 };
    if (category === 'apparel' && equippedSlot === 'body') return { ...z, def: level * 2 };
    if (category === 'jewelry' && equippedSlot === 'neck') return { ...z, mp: level * 5 };
    return z;
}

export class HoshiUpgradeModal extends BaseModal {
    private listEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private currencyEl?: HTMLDivElement;
    private items: InventoryItemDTO[] = [];
    private stonesAvailable = 0;
    private yenAvailable = 0;
    private characterLevel = 1;
    private selectedItemId: string | null = null;
    private actionInFlight = false;
    /** Cache sorted view (đồng bộ với renderList) — nav bằng phím cần index. */
    private sortedItems: InventoryItemDTO[] = [];
    /** 'list' = list trái; 'button' = nút Cường Hoá ở detail. */
    private focusZone: 'list' | 'button' = 'list';
    private focusedIdx = 0;
    private onUpgraded?: () => void;

    constructor(scene: Phaser.Scene, callbacks?: { onUpgraded?: () => void }) {
        super(scene);
        this.onUpgraded = callbacks?.onUpgraded;
    }

    open(): void {
        if (this.visible) return;
        if (!this.ensureShell()) return;
        this.visible = true;
        this.scene.input.keyboard?.disableGlobalCapture();
        this.focusZone = 'list';
        this.focusedIdx = 0;
        this.selectedItemId = null;
        void this.refresh();
    }

    /** ↑/↓ trong list, ↓ ở item cuối → button (nếu có), ↑ trên button → list. */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (this.focusZone === 'button') {
            if (direction === 'up' || direction === 'left') {
                this.focusZone = 'list';
                this.renderButtonFocus();
            }
            return;
        }
        // list zone
        if (this.sortedItems.length === 0) return;
        switch (direction) {
            case 'up':
                if (this.focusedIdx > 0) {
                    this.focusedIdx -= 1;
                    this.applySelection();
                }
                return;
            case 'down':
                if (this.focusedIdx < this.sortedItems.length - 1) {
                    this.focusedIdx += 1;
                    this.applySelection();
                } else if (this.hasUpgradeButton()) {
                    this.focusZone = 'button';
                    this.renderButtonFocus();
                }
                return;
            case 'right':
                if (this.hasUpgradeButton()) {
                    this.focusZone = 'button';
                    this.renderButtonFocus();
                }
                return;
            case 'left':
                return;
        }
    }

    /** Enter trong list = chọn item; Enter trên button = click cường hoá. */
    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone === 'button') {
            const btn = this.detailEl?.querySelector<HTMLButtonElement>('#hoshi-upgrade-confirm');
            if (btn && !btn.disabled) btn.click();
            return;
        }
        // list zone — Enter chỉ confirm selection (đã update qua arrow); không
        // làm gì thêm. Có thể mở rộng sau (vd auto-jump tới button).
    }

    private applySelection(): void {
        const item = this.sortedItems[this.focusedIdx];
        if (!item) return;
        this.selectedItemId = item.id;
        this.renderList();
        this.renderDetail();
    }

    private hasUpgradeButton(): boolean {
        return !!this.detailEl?.querySelector('#hoshi-upgrade-confirm');
    }

    private renderButtonFocus(): void {
        const btn = this.detailEl?.querySelector<HTMLButtonElement>('#hoshi-upgrade-confirm');
        if (!btn) return;
        if (this.focusZone === 'button') {
            btn.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
            btn.style.outlineOffset = '2px';
            btn.style.boxShadow = '0 0 12px rgba(255,234,122,0.8)';
        } else {
            btn.style.outline = '';
            btn.style.outlineOffset = '';
            btn.style.boxShadow = '';
        }
    }

    close(): void {
        if (!this.visible) return;
        this.scene.input.keyboard?.enableGlobalCapture();
        this.teardownShell();
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.currencyEl = undefined;
        this.listEl = undefined;
        this.detailEl = undefined;
    }

    /** Refresh list items + currency. Gọi sau open + sau mỗi upgrade thành công. */
    private async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('hoshi.error_no_character'), 'error');
            return;
        }
        this.shell?.setStatus(t('hoshi.loading'), 'muted');
        try {
            const [inv, wallet, list] = await Promise.all([
                inventoryAPI.list(character.id),
                charactersAPI.getWallet(character.id),
                charactersAPI.list(),
            ]);
            this.items = inv.items.filter((i) => i.upgrade_category !== null);
            this.stonesAvailable = inv.items
                .filter((i) => i.item_template_id === STONE_TEMPLATE_ID)
                .reduce((sum, i) => sum + i.amount, 0);
            this.yenAvailable = wallet.gold;
            const c = list.characters.find((x) => x.id === character.id);
            if (c) this.characterLevel = c.level;
            this.renderList();
            this.renderDetail();
            this.renderCurrency();
            this.shell?.setStatus('', 'muted');
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('hoshi.error_load');
            this.shell?.setStatus(msg, 'error');
        }
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-hoshi-upgrade',
            size: 'lg',
            layer: 'blockingDialog',
            mount: 'document-body',
            withStatus: true,
            title: t('hoshi.title'),
            onClose: () => this.close(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Currency row.
        const currency = document.createElement('div');
        currency.style.cssText = `
            display: flex; gap: 16px; padding: 8px 14px;
            background: rgba(0,0,0,0.3); font-size: 12px; flex-shrink: 0;
            border-bottom: 1px solid ${MODAL_COLORS.divider};
        `;
        this.currencyEl = currency;
        shell.body.appendChild(currency);

        // Two-column body: list (left) + detail (right).
        const cols = document.createElement('div');
        cols.style.cssText = 'display: flex; gap: 12px; flex: 1; min-height: 0; padding: 12px;';

        const list = document.createElement('div');
        list.style.cssText = `
            flex: 1; min-width: 280px; max-height: 420px; overflow-y: auto;
            background: rgba(0,0,0,0.3); border-radius: 4px; padding: 6px;
            display: flex; flex-direction: column; gap: 4px;
        `;
        this.listEl = list;

        const detail = document.createElement('div');
        detail.style.cssText = `
            flex: 1; min-width: 240px; padding: 10px;
            background: rgba(0,0,0,0.3); border-radius: 4px;
            font-size: 12px; line-height: 1.5; position: relative;
        `;
        this.detailEl = detail;

        cols.appendChild(list);
        cols.appendChild(detail);
        shell.body.appendChild(cols);

        // Re-render text khi locale đổi runtime — title + currency + list + detail.
        shell.registerLocaleSync(() => {
            this.shell?.setTitle(t('hoshi.title'));
            this.renderCurrency();
            this.renderList();
            this.renderDetail();
        });
    }

    private renderCurrency(): void {
        if (!this.currencyEl) return;
        this.currencyEl.innerHTML =
            `<span>${t('hoshi.currency_stones', { n: this.stonesAvailable })}</span>`
            + `<span>${t('hoshi.currency_yen', { n: this.yenAvailable.toLocaleString('vi') })}</span>`
            + `<span>${t('hoshi.currency_level', { level: this.characterLevel, cap: capForLevel(this.characterLevel) })}</span>`;
    }

    private renderList(): void {
        if (!this.listEl) return;
        if (this.items.length === 0) {
            this.sortedItems = [];
            this.listEl.innerHTML = `<div style="color:#aaa;text-align:center;padding:20px;">${escapeHtml(t('hoshi.list_empty'))}</div>`;
            return;
        }
        this.listEl.innerHTML = '';
        // Sort: equipped trước, sau đó theo category > upgrade_level desc.
        const sorted = [...this.items].sort((a, b) => {
            if (a.is_equipped !== b.is_equipped) return a.is_equipped ? -1 : 1;
            const ca = a.upgrade_category ?? '';
            const cb = b.upgrade_category ?? '';
            if (ca !== cb) return ca.localeCompare(cb);
            return b.upgrade_level - a.upgrade_level;
        });
        // Cache cho nav bằng phím + sync focusedIdx với selectedItemId nếu có.
        this.sortedItems = sorted;
        if (this.selectedItemId) {
            const idx = sorted.findIndex((it) => it.id === this.selectedItemId);
            if (idx >= 0) this.focusedIdx = idx;
        }
        if (this.focusedIdx >= sorted.length) this.focusedIdx = Math.max(0, sorted.length - 1);
        for (const item of sorted) {
            const row = document.createElement('div');
            const isSelected = this.selectedItemId === item.id;
            row.style.cssText = `
                padding: 6px 8px; border-radius: 4px; cursor: pointer;
                background: ${isSelected ? 'rgba(255,234,122,0.2)' : 'rgba(255,255,255,0.04)'};
                border: 1px solid ${isSelected ? MODAL_COLORS.borderAccent : 'transparent'};
                display: flex; justify-content: space-between; align-items: center; gap: 6px;
            `;
            const equippedTag = item.is_equipped
                ? `<span style="color:${MODAL_COLORS.statusOk};font-size:10px;">${escapeHtml(t('hoshi.list_equipped_tag'))}</span>`
                : '';
            const cat = item.upgrade_category ? t(CATEGORY_KEY[item.upgrade_category]) : t('hoshi.category_unknown');
            row.innerHTML = `
                <span>${escapeHtml(displayName(item))} <b style="color:${MODAL_COLORS.title};">+${item.upgrade_level}</b> ${equippedTag}</span>
                <span style="color:#aaa;font-size:11px;">${escapeHtml(cat)}</span>
            `;
            row.addEventListener('click', () => {
                this.selectedItemId = item.id;
                this.renderList();
                this.renderDetail();
            });
            this.listEl.appendChild(row);
        }
    }

    private renderDetail(): void {
        if (!this.detailEl) return;
        if (!this.selectedItemId) {
            this.detailEl.innerHTML = `<div style="color:#aaa;">${escapeHtml(t('hoshi.detail_pick'))}</div>`;
            return;
        }
        const item = this.items.find((i) => i.id === this.selectedItemId);
        if (!item || !item.upgrade_category) {
            this.detailEl.innerHTML = `<div style="color:${MODAL_COLORS.statusError};">${escapeHtml(t('hoshi.detail_item_not_found'))}</div>`;
            return;
        }
        const category = item.upgrade_category;
        const cap = capForLevel(this.characterLevel);
        const cur = item.upgrade_level;
        const next = cur + 1;
        const atCap = cur >= cap;

        let costBlock: string;
        let confirmBtnHtml = '';
        if (atCap) {
            costBlock = `<div style="color:${MODAL_COLORS.title};">${escapeHtml(t('hoshi.detail_at_cap', { cap, level: this.characterLevel }))}</div>`;
        } else {
            const cost = nextCost(category, cur);
            if (!cost) {
                costBlock = `<div style="color:${MODAL_COLORS.statusError};">${escapeHtml(t('hoshi.detail_no_cost'))}</div>`;
            } else {
                const lacksStones = this.stonesAvailable < cost.stones;
                const lacksYen = this.yenAvailable < cost.yen;
                const enough = !lacksStones && !lacksYen;
                const curBonus = bonusForLevel(category, item.equipped_slot, cur);
                const nextBonus = bonusForLevel(category, item.equipped_slot, next);
                const deltaLine = formatBonusDelta(curBonus, nextBonus);
                const lacksSuffix = t('hoshi.detail_lacks_suffix');
                const stonesLine = `${t('hoshi.detail_cost_stones', { n: cost.stones })}${lacksStones ? ' ' + lacksSuffix : ''}`;
                const yenLine = `${t('hoshi.detail_cost_yen', { n: cost.yen.toLocaleString('vi') })}${lacksYen ? ' ' + lacksSuffix : ''}`;
                const bonusLine = t('hoshi.detail_bonus_new', { delta: deltaLine || t('hoshi.detail_bonus_no_equip') });
                costBlock = `
                    <div style="margin-top:8px;"><b>${escapeHtml(t('hoshi.detail_cost_label', { n: next }))}</b></div>
                    <div style="color:${lacksStones ? MODAL_COLORS.statusError : MODAL_COLORS.statusOk};">${escapeHtml(stonesLine)}</div>
                    <div style="color:${lacksYen ? MODAL_COLORS.statusError : MODAL_COLORS.title};">${escapeHtml(yenLine)}</div>
                    <div style="margin-top:6px;color:#9affb4;">${escapeHtml(bonusLine)}</div>
                `;
                confirmBtnHtml = `
                    <button id="hoshi-upgrade-confirm" style="
                        margin-top: 10px; padding: 8px 16px;
                        background: ${enough ? MODAL_COLORS.title : '#555'};
                        color: ${enough ? '#000' : '#aaa'};
                        border: none; border-radius: 4px; cursor: ${enough ? 'pointer' : 'not-allowed'};
                        font-weight: 600; font-size: 13px;
                    " ${enough ? '' : 'disabled'}>
                        ${escapeHtml(t('hoshi.btn_upgrade', { cur, next }))}
                    </button>
                `;
            }
        }

        const equippedNote = item.is_equipped
            ? ''
            : `<div style="color:#aaa;font-size:11px;margin-top:4px;">${escapeHtml(t('hoshi.detail_not_equipped_note'))}</div>`;

        const slotLabel = item.equipped_slot ?? t('hoshi.detail_slot_unequipped');
        const metaLine = t('hoshi.detail_meta', {
            category: t(CATEGORY_KEY[category]),
            slot: slotLabel,
        });

        this.detailEl.innerHTML = `
            <div style="font-weight:600;color:${MODAL_COLORS.title};">${escapeHtml(displayName(item))} +${cur}</div>
            <div style="color:#aaa;font-size:11px;">${escapeHtml(metaLine)}</div>
            ${equippedNote}
            ${costBlock}
            ${confirmBtnHtml}
        `;

        const btn = this.detailEl.querySelector<HTMLButtonElement>('#hoshi-upgrade-confirm');
        if (btn) {
            btn.addEventListener('click', () => void this.handleUpgrade());
        }
        // Re-apply outline khi rerender (button mới — DOM đã thay) nếu zone='button'.
        this.renderButtonFocus();
        // Nếu zone='button' nhưng button không còn (item đạt cap, đổi item khác),
        // tự fallback về list để khỏi mắc kẹt.
        if (this.focusZone === 'button' && !btn) {
            this.focusZone = 'list';
        }
    }

    private async handleUpgrade(): Promise<void> {
        if (this.actionInFlight || !this.selectedItemId) return;
        const character = getCurrentCharacter();
        if (!character) return;
        this.actionInFlight = true;
        this.shell?.setStatus(t('hoshi.upgrading'), 'muted');
        try {
            const res = await equipmentUpgradeAPI.upgrade(character.id, this.selectedItemId);
            this.shell?.setStatus(
                t('hoshi.upgrade_success', { old: res.old_enchant_level, next: res.new_enchant_level }),
                'ok',
            );
            this.onUpgraded?.();
            await this.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('hoshi.error_upgrade');
            this.shell?.setStatus(msg, 'error');
        } finally {
            this.actionInFlight = false;
        }
    }
}

function displayName(item: InventoryItemDTO): string {
    // Lookup i18n cho name_key (vd item.consumable.mp_lv70 → "Bình MP cấp 70").
    // Khi key chưa có translation, t() trả về key gốc → fallback giữ nguyên
    // hành vi cũ. Final fallback xuống template_id khi name_key trống.
    return item.name_key ? t(item.name_key) : item.item_template_id;
}

function formatBonusDelta(cur: EnchantStatBonus, next: EnchantStatBonus): string {
    const parts: string[] = [];
    if (next.atk !== cur.atk) parts.push(`+${next.atk - cur.atk} ATK`);
    if (next.def !== cur.def) parts.push(`+${next.def - cur.def} DEF`);
    if (next.hp !== cur.hp) parts.push(`+${next.hp - cur.hp} HP`);
    if (next.mp !== cur.mp) parts.push(`+${next.mp - cur.mp} MP`);
    return parts.join(', ');
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
