import {
    charactersAPI,
    shopAPI,
    type InventoryItemType,
    type ShopCurrencyType,
    type ShopListingDTO,
    type ShopPriceDTO,
    type WalletDTO,
} from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

const COLS = 4;

const TYPE_BORDER: Record<InventoryItemType, string> = {
    equipment: '#d4af37',
    consumable: '#6dbf5a',
    material: '#b88848',
    quest: '#a050d0',
};

// Reuse inventory.type_* keys — cùng concept item type label.
const TYPE_KEY: Record<InventoryItemType, string> = {
    equipment: 'inventory.type_equipment',
    consumable: 'inventory.type_consumable',
    material: 'inventory.type_material',
    quest: 'inventory.type_quest',
};

const DEFAULT_ICON: Record<InventoryItemType, string> = {
    equipment: '⚔️',
    consumable: '🧪',
    material: '🪨',
    quest: '📜',
};

const DEFAULT_BG: Record<InventoryItemType, string> = {
    equipment: '#2a3a3a',
    consumable: '#3a2a1a',
    material: '#3a2a1a',
    quest: '#3a1a4a',
};

// Reuse inventory.currency_* keys — cùng concept ví tiền player.
const CURRENCY_META: Record<ShopCurrencyType, { icon: string; labelKey: string; color: string }> = {
    coin: { icon: '🪙', labelKey: 'inventory.currency_coin', color: '#ffd070' },
    gold: { icon: '💰', labelKey: 'inventory.currency_gold', color: '#f0b020' },
    gem: { icon: '💎', labelKey: 'inventory.currency_gem', color: '#6cd0ff' },
};

const SUBTYPE_ICON: Record<string, string> = {
    hp_potion: '🍙',
    mp_potion: '🍵',
    food_buff: '🍜',
};

interface OpenParams {
    mapId: string;
    npcTemplateId: string;
    npcName: string;
    /** Optional — chỉ hiển thị listings có class_id matching. Dùng cho
     * weapon_merchant submenu (Kiếm / Cung). Empty/undefined = không filter. */
    classFilter?: string;
    /** Optional — chỉ hiển thị listings có sub_type matching. Dùng cho
     * apparel_merchant submenu (Nón / Áo / Găng / Quần / Giày = hat / shirt
     * / gloves / pants / shoes). */
    subTypeFilter?: string;
}

export class ShopModal extends BaseModal {
    private gridEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private amountInput?: HTMLInputElement;
    private buyBtn?: HTMLButtonElement;
    private balanceEl?: HTMLDivElement;
    private amountLabelEl?: HTMLLabelElement;

    private listings: ShopListingDTO[] = [];
    private classFilter: string | null = null;
    private subTypeFilter: string | null = null;
    private selectedIdx: number | null = null;
    private selectedCurrency: ShopCurrencyType | null = null;
    private loading = false;
    private actionInFlight = false;
    private mapId = '';
    private npcTemplateId = '';
    private npcName = '';
    private wallet: WalletDTO | null = null;
    /** 'grid' = listings; 'controls' = nút Mua + amount input. */
    private focusZone: 'grid' | 'controls' = 'grid';

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-shop',
            size: 'md',
            layer: 'modal',
            withStatus: true,
            title: t('shop.title'),
            onClose: () => this.close(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Section 1: grid (scrollable, max-height giới hạn để detail/controls
        // dưới đáy luôn thấy được).
        const gridWrap = document.createElement('div');
        gridWrap.style.cssText = 'padding:10px 14px;background:rgba(0,0,0,0.25);overflow-y:auto;max-height:46vh;';
        this.gridEl = document.createElement('div');
        Object.assign(this.gridEl.style, {
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: '8px',
        });
        gridWrap.appendChild(this.gridEl);

        // Section 2: detail
        this.detailEl = document.createElement('div');
        this.detailEl.style.cssText =
            `padding:12px 16px;border-top:2px solid ${MODAL_COLORS.divider};` +
            `background:rgba(45,26,10,0.6);min-height:84px;font-size:13px;` +
            `line-height:1.5;flex-shrink:0;`;

        // Section 3: balance bar
        this.balanceEl = document.createElement('div');
        this.balanceEl.style.cssText =
            `display:flex;justify-content:space-around;align-items:center;` +
            `padding:8px 14px;border-top:2px solid ${MODAL_COLORS.divider};` +
            `background:rgba(20,12,4,0.7);flex-shrink:0;font-size:13px;`;

        // Section 4: buy controls
        const buyRow = document.createElement('div');
        buyRow.style.cssText =
            `display:flex;gap:8px;padding:10px 14px;` +
            `border-top:2px solid ${MODAL_COLORS.divider};` +
            `background:${MODAL_COLORS.footerBg};align-items:center;flex-shrink:0;`;

        this.amountLabelEl = document.createElement('label');
        this.amountLabelEl.style.cssText = `font-size:12px;color:${MODAL_COLORS.text};`;
        this.amountLabelEl.textContent = t('shop.amount_label');

        this.amountInput = document.createElement('input');
        this.amountInput.type = 'number';
        this.amountInput.min = '1';
        this.amountInput.max = '99';
        this.amountInput.value = '1';
        this.amountInput.style.cssText =
            `width:60px;height:32px;border-radius:6px;border:2px solid ${MODAL_COLORS.divider};` +
            `background:${MODAL_COLORS.panelBgTop};color:${MODAL_COLORS.text};` +
            `font-size:13px;text-align:center;font-family:inherit;`;
        this.amountInput.addEventListener('input', () => this.renderDetail());

        this.buyBtn = document.createElement('button');
        this.buyBtn.disabled = true;
        this.buyBtn.textContent = t('shop.btn_buy');
        this.buyBtn.style.cssText =
            'flex:1;height:36px;border-radius:6px;border:2px solid #4a7a3a;' +
            'background:#2a4a1a;color:#bdf0a0;font-size:13px;font-weight:bold;' +
            'cursor:pointer;font-family:inherit;opacity:0.5;';
        this.buyBtn.addEventListener('click', () => void this.handleBuy());

        buyRow.append(this.amountLabelEl, this.amountInput, this.buyBtn);

        shell.body.append(gridWrap, this.detailEl, this.balanceEl, buyRow);

        shell.registerLocaleSync(() => {
            this.applyTitle();
            if (this.amountLabelEl) this.amountLabelEl.textContent = t('shop.amount_label');
            if (this.buyBtn) this.buyBtn.textContent = t('shop.btn_buy');
            this.renderGrid();
            this.renderDetail();
            this.renderBalance();
        });
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.gridEl = undefined;
        this.detailEl = undefined;
        this.amountInput = undefined;
        this.buyBtn = undefined;
        this.balanceEl = undefined;
        this.amountLabelEl = undefined;
    }

    open(params: OpenParams): void {
        const shell = this.ensureShell();
        if (!shell) return;
        this.mapId = params.mapId;
        this.npcTemplateId = params.npcTemplateId;
        this.npcName = params.npcName;
        this.classFilter = params.classFilter && params.classFilter.trim() ? params.classFilter.trim() : null;
        this.subTypeFilter = params.subTypeFilter && params.subTypeFilter.trim() ? params.subTypeFilter.trim() : null;
        this.selectedIdx = null;
        this.selectedCurrency = null;
        this.listings = [];
        this.wallet = null;
        this.focusZone = 'grid';
        shell.setStatus('');
        this.visible = true;
        this.applyTitle();
        this.renderDetail();
        this.renderBalance();
        this.renderControlsFocus();
        void Promise.all([this.loadListings(), this.loadWallet()]);
    }

    close(): void {
        if (!this.visible && !this.shell) return;
        this.teardownShell();
    }

    /**
     * Grid 4-cột: ↑/↓/←/→ điều hướng listing. ↓ ở row cuối → zone='controls'.
     * Controls zone: ←/→ điều chỉnh số lượng (clamp 1-99); ↑ về grid.
     */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (this.focusZone === 'controls') {
            switch (direction) {
                case 'up':
                    this.focusZone = 'grid';
                    this.renderControlsFocus();
                    return;
                case 'left':
                    this.adjustAmount(-1);
                    return;
                case 'right':
                    this.adjustAmount(1);
                    return;
                case 'down':
                    return;
            }
        }
        // grid zone
        if (this.listings.length === 0) return;
        if (this.selectedIdx === null) {
            this.setSelectedIdx(0);
            return;
        }
        const total = this.listings.length;
        const rows = Math.ceil(total / COLS);
        let row = Math.floor(this.selectedIdx / COLS);
        let col = this.selectedIdx % COLS;
        switch (direction) {
            case 'left':  col = Math.max(0, col - 1); break;
            case 'right': col = Math.min(COLS - 1, col + 1); break;
            case 'up':
                if (row === 0) return;
                row -= 1;
                break;
            case 'down':
                if (row === rows - 1) {
                    this.focusZone = 'controls';
                    this.renderControlsFocus();
                    return;
                }
                row += 1;
                break;
        }
        const next = Math.min(row * COLS + col, total - 1);
        if (next !== this.selectedIdx) this.setSelectedIdx(next);
    }

    /** Enter trong controls zone = click Mua (nếu enabled). Grid zone = no-op
     * (selection đã update qua arrow). */
    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone !== 'controls') return;
        if (this.buyBtn && !this.buyBtn.disabled) this.buyBtn.click();
    }

    /** Set selectedIdx trực tiếp (không toggle như selectListing) — cho arrow nav. */
    private setSelectedIdx(idx: number): void {
        this.selectedIdx = idx;
        const first = this.listings[idx]?.prices[0];
        this.selectedCurrency = first ? first.currency_type : null;
        if (this.amountInput) this.amountInput.value = '1';
        this.renderGrid();
        this.renderDetail();
    }

    private adjustAmount(delta: number): void {
        if (!this.amountInput) return;
        const cur = parseInt(this.amountInput.value, 10) || 1;
        const next = Math.max(1, Math.min(99, cur + delta));
        if (next === cur) return;
        this.amountInput.value = String(next);
        this.renderDetail();
    }

    private renderControlsFocus(): void {
        const focused = this.focusZone === 'controls';
        if (this.buyBtn) {
            if (focused) {
                this.buyBtn.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
                this.buyBtn.style.outlineOffset = '2px';
                this.buyBtn.style.boxShadow = '0 0 12px rgba(255,234,122,0.8)';
            } else {
                this.buyBtn.style.outline = '';
                this.buyBtn.style.outlineOffset = '';
                this.buyBtn.style.boxShadow = '';
            }
        }
        if (this.amountInput) {
            this.amountInput.style.borderColor = focused ? MODAL_COLORS.borderAccent : MODAL_COLORS.divider;
        }
    }

    private applyTitle(): void {
        if (!this.shell) return;
        this.shell.setTitle(this.npcName
            ? t('shop.title_with_npc', { npc: this.npcName.toUpperCase() })
            : t('shop.title'));
    }

    private async loadWallet(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        try {
            this.wallet = await charactersAPI.getWallet(character.id);
        } catch (err) {
            // Lỗi wallet không cản dùng shop — chỉ ẩn balance.
            this.wallet = null;
            if (err instanceof Error) console.warn('shop: load wallet failed', err.message);
        }
        this.renderBalance();
        this.renderDetail();
    }

    private async loadListings(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('shop.error_no_character'), 'error');
            return;
        }
        this.loading = true;
        this.renderGrid();
        this.renderDetail();
        try {
            const res = await shopAPI.list(this.mapId, this.npcTemplateId);
            // Filter client-side: classFilter (vd Kiếm / Cung) + subTypeFilter
            // (vd hat / shirt / gloves / pants / shoes). BE trả full catalog
            // của NPC; submenu chỉ giới hạn UI. Cả 2 optional, AND-combine.
            this.listings = res.items.filter((it) => {
                if (this.classFilter && it.class_id !== this.classFilter) return false;
                if (this.subTypeFilter && it.sub_type !== this.subTypeFilter) return false;
                return true;
            });
        } catch (err) {
            this.listings = [];
            this.shell?.setStatus(err instanceof Error ? err.message : t('shop.error_load'), 'error');
        } finally {
            this.loading = false;
            this.renderGrid();
            this.renderBalance();
            this.renderDetail();
        }
    }

    private renderGrid(): void {
        if (!this.gridEl) return;
        if (this.loading) {
            this.gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#aaa;padding:14px;font-style:italic;">${escapeHtml(t('shop.loading_listings'))}</div>`;
            return;
        }
        if (this.listings.length === 0) {
            this.gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#888;padding:14px;font-style:italic;">${escapeHtml(t('shop.empty_npc'))}</div>`;
            return;
        }

        this.gridEl.innerHTML = '';
        this.listings.forEach((item, idx) => {
            const cell = document.createElement('div');
            const isSelected = this.selectedIdx === idx;
            const borderColor = TYPE_BORDER[item.item_type];
            const bgColor = DEFAULT_BG[item.item_type];
            const icon = (item.sub_type && SUBTYPE_ICON[item.sub_type]) || DEFAULT_ICON[item.item_type];
            const primaryPrice = item.prices[0];
            const cur = primaryPrice ? CURRENCY_META[primaryPrice.currency_type] : CURRENCY_META.coin;

            Object.assign(cell.style, {
                border: `2px solid ${isSelected ? MODAL_COLORS.borderAccent : borderColor}`,
                borderRadius: '6px',
                background: bgColor,
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                userSelect: 'none',
                boxShadow: isSelected ? '0 0 8px rgba(255,234,122,0.6)' : 'none',
                transition: 'border-color 0.1s, box-shadow 0.1s',
            });

            const priceLine = primaryPrice
                ? `<div style="font-size:11px;display:flex;align-items:center;gap:3px;">` +
                    `<span>${cur.icon}</span>` +
                    `<span style="color:${cur.color};font-weight:bold;">${primaryPrice.price.toLocaleString('en-US')}</span>` +
                  `</div>`
                : `<div style="font-size:10px;color:#888;font-style:italic;">N/A</div>`;
            const multiBadge = item.prices.length > 1
                ? `<div style="font-size:9px;color:#ffd070;display:flex;gap:2px;align-items:center;">` +
                    item.prices.slice(1).map((p) => CURRENCY_META[p.currency_type].icon).join('') +
                  `</div>`
                : '';

            cell.innerHTML = [
                `<div style="font-size:24px;line-height:1;">${icon}</div>`,
                `<div style="font-size:10px;color:${MODAL_COLORS.text};text-align:center;line-height:1.2;height:24px;overflow:hidden;">${item.name_key}</div>`,
                priceLine,
                multiBadge,
            ].join('');

            cell.addEventListener('click', () => this.selectListing(idx));
            cell.addEventListener('mouseenter', () => {
                if (this.selectedIdx !== idx) cell.style.borderColor = '#ffd070';
            });
            cell.addEventListener('mouseleave', () => {
                if (this.selectedIdx !== idx) cell.style.borderColor = borderColor;
            });
            this.gridEl!.appendChild(cell);
        });
    }

    private selectListing(idx: number): void {
        if (this.selectedIdx === idx) {
            this.selectedIdx = null;
            this.selectedCurrency = null;
        } else {
            this.selectedIdx = idx;
            const first = this.listings[idx]?.prices[0];
            this.selectedCurrency = first ? first.currency_type : null;
        }
        if (this.amountInput) this.amountInput.value = '1';
        this.renderGrid();
        this.renderDetail();
    }

    private renderDetail(): void {
        if (!this.detailEl) return;
        const item = this.findSelected();
        if (!item) {
            this.detailEl.innerHTML = `<div style="color:#888;font-style:italic;">${escapeHtml(t('shop.detail_pick'))}</div>`;
            this.setBuyEnabled(false);
            return;
        }
        const selectedPrice = this.findSelectedPrice(item);
        const cur = selectedPrice ? CURRENCY_META[selectedPrice.currency_type] : CURRENCY_META.coin;
        const amount = this.getAmount();
        const total = selectedPrice ? selectedPrice.price * amount : 0;
        const isFoodBuff = item.sub_type === 'food_buff';
        const heal = isFoodBuff
            ? (() => {
                const hpRate = item.base_stats?.heal_hp_per_sec ?? 0;
                const mpRate = item.base_stats?.heal_mp_per_sec ?? 0;
                const dur = Math.round((item.base_stats?.duration_sec ?? 0) / 60);
                // shop.heal_food_buff template chứa <b> markup → KHÔNG escape.
                return t('shop.heal_food_buff', { hp: hpRate, mp: mpRate, dur })
                    + `<br/><span style="color:#aaa;font-size:11px;">${escapeHtml(t('shop.heal_food_buff_note'))}</span>`;
            })()
            : item.base_stats?.heal_hp
            ? t('shop.heal_hp', { n: item.base_stats.heal_hp })
            : item.base_stats?.heal_mp
            ? t('shop.heal_mp', { n: item.base_stats.heal_mp })
            : '';

        const currencyChooser = item.prices.length > 1
            ? this.renderCurrencyChooser(item.prices)
            : selectedPrice
                ? `<div style="margin-top:4px;font-size:12px;color:${MODAL_COLORS.text};">`
                    + `${escapeHtml(t('shop.unit_price'))} <span style="color:${cur.color};font-weight:bold;">${cur.icon} ${selectedPrice.price.toLocaleString('en-US')}</span>`
                    + `</div>`
                : '';

        const totalLine = selectedPrice
            ? `<div style="margin-top:4px;font-size:12px;color:${MODAL_COLORS.text};">${escapeHtml(t('shop.total_price', { n: amount }))} <span style="color:${cur.color};font-weight:bold;">${cur.icon} ${total.toLocaleString('en-US')}</span></div>`
            : '';

        this.detailEl.innerHTML = [
            `<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">`,
            `  <span style="font-size:14px;font-weight:bold;color:${MODAL_COLORS.title};">${escapeHtml(item.name_key)}</span>`,
            `  <span style="font-size:11px;color:${TYPE_BORDER[item.item_type]};">[${escapeHtml(t(TYPE_KEY[item.item_type]))}]</span>`,
            `  <span style="font-size:11px;color:#aaa;">${escapeHtml(t('shop.required_level', { n: item.required_level }))}</span>`,
            `</div>`,
            heal ? `<div style="margin-top:4px;">${heal}</div>` : '',
            currencyChooser,
            totalLine,
        ].join('');

        // Wire click handler cho radio currency
        if (item.prices.length > 1) {
            this.detailEl.querySelectorAll<HTMLDivElement>('[data-currency]').forEach((el) => {
                el.addEventListener('click', () => {
                    const c = el.getAttribute('data-currency') as ShopCurrencyType | null;
                    if (c) {
                        this.selectedCurrency = c;
                        this.renderDetail();
                    }
                });
            });
        }

        this.setBuyEnabled(!this.actionInFlight && amount > 0 && !!selectedPrice);
    }

    private renderCurrencyChooser(prices: ShopPriceDTO[]): string {
        const buttons = prices.map((p) => {
            const cur = CURRENCY_META[p.currency_type];
            const active = this.selectedCurrency === p.currency_type;
            const border = active ? MODAL_COLORS.borderAccent : MODAL_COLORS.divider;
            const bg = active ? '#6b3a14' : 'rgba(45,26,10,0.5)';
            return `<div data-currency="${p.currency_type}" style="`
                + `cursor:pointer;padding:6px 10px;border-radius:6px;`
                + `border:2px solid ${border};background:${bg};`
                + `display:flex;align-items:center;gap:4px;font-size:12px;`
                + `color:${cur.color};font-weight:bold;user-select:none;`
                + `">`
                + `<span>${cur.icon}</span>`
                + `<span>${p.price.toLocaleString('en-US')}</span>`
                + `<span style="font-size:10px;color:#aaa;font-weight:normal;">${escapeHtml(t(cur.labelKey))}</span>`
                + `</div>`;
        }).join('');
        return `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">`
            + `<span style="font-size:11px;color:#aaa;">${escapeHtml(t('shop.payment_label'))}</span>`
            + buttons
            + `</div>`;
    }

    private findSelectedPrice(item: ShopListingDTO): ShopPriceDTO | null {
        if (item.prices.length === 0) return null;
        if (this.selectedCurrency) {
            const match = item.prices.find((p) => p.currency_type === this.selectedCurrency);
            if (match) return match;
        }
        return item.prices[0];
    }

    private renderBalance(): void {
        if (!this.balanceEl) return;
        if (!this.wallet) {
            this.balanceEl.innerHTML =
                `<span style="font-size:11px;color:#888;font-style:italic;">${escapeHtml(t('shop.balance_loading'))}</span>`;
            return;
        }
        const fmt = (n: number) => n.toLocaleString('en-US');
        const item = (icon: string, label: string, value: number, color: string) =>
            `<div style="display:flex;align-items:center;gap:6px;" title="${escapeHtml(label)}">` +
            `  <span style="font-size:16px;">${icon}</span>` +
            `  <span style="color:${color};font-weight:bold;">${fmt(value)}</span>` +
            `</div>`;
        this.balanceEl.innerHTML = [
            item('🪙', t('inventory.currency_coin'), this.wallet.coin, '#ffd070'),
            item('💰', t('inventory.currency_gold'), this.wallet.gold, '#f0b020'),
            item('💎', t('inventory.currency_gem'), this.wallet.gem, '#6cd0ff'),
        ].join('');
    }

    private getAmount(): number {
        const raw = this.amountInput?.value ?? '1';
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 1) return 1;
        return Math.min(n, 99);
    }

    private findSelected(): ShopListingDTO | null {
        if (this.selectedIdx === null) return null;
        return this.listings[this.selectedIdx] ?? null;
    }

    private setBuyEnabled(enabled: boolean): void {
        if (!this.buyBtn) return;
        this.buyBtn.disabled = !enabled;
        this.buyBtn.style.opacity = enabled ? '1' : '0.5';
        this.buyBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }

    private async handleBuy(): Promise<void> {
        const item = this.findSelected();
        if (!item || this.actionInFlight) return;
        const price = this.findSelectedPrice(item);
        if (!price) {
            this.shell?.setStatus(t('shop.error_no_payment'), 'error');
            return;
        }
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('shop.error_no_character'), 'error');
            return;
        }
        const amount = this.getAmount();
        this.actionInFlight = true;
        this.setBuyEnabled(false);
        this.shell?.setStatus(t('shop.processing'), 'ok');
        try {
            const res = await shopAPI.buy(character.id, {
                map_id: this.mapId,
                npc_template_id: this.npcTemplateId,
                item_template_id: item.item_template_id,
                currency_type: price.currency_type,
                amount,
            });
            const cur = CURRENCY_META[res.currency.type];
            // Cập nhật wallet ngay từ response (cho currency vừa tiêu) để UI phản hồi tức thì.
            if (this.wallet) {
                this.wallet = { ...this.wallet, [res.currency.type]: res.currency.balance_after };
                this.renderBalance();
            }
            this.shell?.setStatus(
                t('shop.bought', {
                    amount,
                    name: item.name_key,
                    icon: cur.icon,
                    balance: res.currency.balance_after.toLocaleString('en-US'),
                }),
                'ok',
            );
            // Sync lại 3 loại tiền (đề phòng tickets / quest cùng lúc).
            void this.loadWallet();
        } catch (err) {
            this.shell?.setStatus(err instanceof Error ? err.message : t('shop.error_buy'), 'error');
        } finally {
            this.actionInFlight = false;
            this.renderDetail();
        }
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
