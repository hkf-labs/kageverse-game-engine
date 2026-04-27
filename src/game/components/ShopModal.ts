import * as Phaser from 'phaser';
import {
    charactersAPI,
    shopAPI,
    type InventoryItemType,
    type ShopCurrencyType,
    type ShopListingDTO,
    type ShopPriceDTO,
    type WalletDTO,
} from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';

const COLS = 4;

const TYPE_BORDER: Record<InventoryItemType, string> = {
    equipment: '#d4af37',
    consumable: '#6dbf5a',
    material: '#b88848',
    quest: '#a050d0',
};

const TYPE_LABEL: Record<InventoryItemType, string> = {
    equipment: 'Trang bị',
    consumable: 'Tiêu hao',
    material: 'Nguyên liệu',
    quest: 'Nhiệm vụ',
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

const CURRENCY_META: Record<ShopCurrencyType, { icon: string; label: string; color: string }> = {
    coin: { icon: '🪙', label: 'Xu', color: '#ffd070' },
    gold: { icon: '💰', label: 'Vàng', color: '#f0b020' },
    gem: { icon: '💎', label: 'Kim Cương', color: '#6cd0ff' },
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
}

export class ShopModal implements GameComponent {
    private overlay?: HTMLDivElement;
    private gridEl?: HTMLDivElement;
    private headerEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private amountInput?: HTMLInputElement;
    private buyBtn?: HTMLButtonElement;
    private balanceEl?: HTMLDivElement;
    private feedbackEl?: HTMLDivElement;

    private visible = false;
    private listings: ShopListingDTO[] = [];
    private selectedIdx: number | null = null;
    private selectedCurrency: ShopCurrencyType | null = null;
    private loading = false;
    private actionInFlight = false;
    private mapId = '';
    private npcTemplateId = '';
    private npcName = '';
    private wallet: WalletDTO | null = null;

    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
        Object.assign(this.overlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.55)',
            zIndex: '111', display: 'none',
        });
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        parent.style.position = 'relative';
        parent.appendChild(this.overlay);

        const root = document.createElement('div');
        Object.assign(root.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(560px, 88vw)',
            maxHeight: '92vh',
            background: 'linear-gradient(180deg, #2a1808 0%, #1a0f04 100%)',
            border: '3px solid #e29e4a',
            borderRadius: '14px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'system-ui, sans-serif',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            color: '#ffe4c4',
        });

        root.innerHTML = this.buildHTML();
        this.overlay.appendChild(root);

        this.headerEl = root.querySelector('#shop-header') as HTMLDivElement;
        this.gridEl = root.querySelector('#shop-grid') as HTMLDivElement;
        this.detailEl = root.querySelector('#shop-detail') as HTMLDivElement;
        this.amountInput = root.querySelector('#shop-amount') as HTMLInputElement;
        this.buyBtn = root.querySelector('#shop-buy') as HTMLButtonElement;
        this.balanceEl = root.querySelector('#shop-balance') as HTMLDivElement;
        this.feedbackEl = root.querySelector('#shop-feedback') as HTMLDivElement;
        const closeBtn = root.querySelector('#shop-close') as HTMLDivElement;

        closeBtn.addEventListener('click', () => this.close());
        this.buyBtn.addEventListener('click', () => void this.handleBuy());
        this.amountInput.addEventListener('input', () => this.renderDetail());
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    isOpen(): boolean { return this.visible; }

    open(params: OpenParams): void {
        if (!this.overlay) return;
        this.mapId = params.mapId;
        this.npcTemplateId = params.npcTemplateId;
        this.npcName = params.npcName;
        this.selectedIdx = null;
        this.selectedCurrency = null;
        this.listings = [];
        this.wallet = null;
        this.feedbackEl && (this.feedbackEl.textContent = '');
        this.visible = true;
        this.overlay.style.display = 'block';
        this.renderHeader();
        this.renderDetail();
        this.renderBalance();
        void Promise.all([this.loadListings(), this.loadWallet()]);
    }

    close(): void {
        if (!this.overlay) return;
        this.visible = false;
        this.overlay.style.display = 'none';
    }

    private buildHTML(): string {
        return [
            // Header
            `<div id="shop-header" style="display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;">`,
            `  <div style="flex:1;padding:10px 16px;font-size:15px;font-weight:bold;color:#ffea7a;letter-spacing:1px;">CỬA HÀNG</div>`,
            `  <div id="shop-close" style="width:40px;text-align:center;cursor:pointer;font-size:18px;font-weight:bold;color:#ff8a8a;padding:10px 0;flex-shrink:0;">&#10005;</div>`,
            `</div>`,
            // Grid
            `<div style="padding:10px 14px 14px 14px;background:rgba(0,0,0,0.25);overflow-y:auto;max-height:46vh;">`,
            `  <div id="shop-grid" style="display:grid;grid-template-columns:repeat(${COLS}, 1fr);gap:8px;"></div>`,
            `</div>`,
            // Detail
            `<div id="shop-detail" style="padding:12px 16px;border-top:2px solid #4d2d13;background:rgba(45,26,10,0.6);min-height:84px;font-size:13px;line-height:1.5;flex-shrink:0;"></div>`,
            // Balance bar
            `<div id="shop-balance" style="display:flex;justify-content:space-around;align-items:center;padding:8px 14px;border-top:2px solid #4d2d13;background:rgba(20,12,4,0.7);flex-shrink:0;font-size:13px;"></div>`,
            // Buy controls
            `<div style="display:flex;gap:8px;padding:10px 14px;border-top:2px solid #4d2d13;background:#1a0f04;align-items:center;flex-shrink:0;">`,
            `  <label style="font-size:12px;color:#ffe4c4;">Số lượng:</label>`,
            `  <input id="shop-amount" type="number" min="1" max="99" value="1" style="width:60px;height:32px;border-radius:6px;border:2px solid #4d2d13;background:#2a1808;color:#ffe4c4;font-size:13px;text-align:center;font-family:inherit;" />`,
            `  <button id="shop-buy" disabled style="flex:1;height:36px;border-radius:6px;border:2px solid #4a7a3a;background:#2a4a1a;color:#bdf0a0;font-size:13px;font-weight:bold;cursor:pointer;font-family:inherit;opacity:0.5;">Mua</button>`,
            `</div>`,
            // Feedback
            `<div id="shop-feedback" style="padding:6px 14px;background:#1a0f04;color:#ffd070;font-size:12px;text-align:center;min-height:18px;flex-shrink:0;"></div>`,
        ].join('');
    }

    private renderHeader(): void {
        if (!this.headerEl) return;
        const titleSpan = this.headerEl.querySelector('div') as HTMLDivElement | null;
        if (titleSpan) {
            titleSpan.textContent = `CỬA HÀNG — ${this.npcName.toUpperCase()}`;
        }
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
            this.setFeedback('Chưa có nhân vật.', 'error');
            return;
        }
        this.loading = true;
        this.renderGrid();
        this.renderDetail();
        try {
            const res = await shopAPI.list(this.mapId, this.npcTemplateId);
            this.listings = res.items;
        } catch (err) {
            this.listings = [];
            this.setFeedback(err instanceof Error ? err.message : 'Không tải được shop', 'error');
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
            this.gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#aaa;padding:14px;font-style:italic;">Đang tải hàng...</div>`;
            return;
        }
        if (this.listings.length === 0) {
            this.gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#888;padding:14px;font-style:italic;">NPC này chưa bán hàng nào.</div>`;
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
                border: `2px solid ${isSelected ? '#ffea7a' : borderColor}`,
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
                `<div style="font-size:10px;color:#ffe4c4;text-align:center;line-height:1.2;height:24px;overflow:hidden;">${item.name_key}</div>`,
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
            this.detailEl.innerHTML = `<div style="color:#888;font-style:italic;">Chọn một vật phẩm để xem chi tiết.</div>`;
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
                return `Mỗi giây hồi <b style="color:#ff8a8a;">${hpRate}</b> HP + <b style="color:#8aaaff;">${mpRate}</b> MP — kéo dài <b style="color:#ffea7a;">${dur} phút</b>.`
                    + `<br/><span style="color:#aaa;font-size:11px;">Dùng món mới sẽ thay thế buff hiện tại.</span>`;
            })()
            : item.base_stats?.heal_hp
            ? `Hồi <b style="color:#ff8a8a;">${item.base_stats.heal_hp}</b> HP`
            : item.base_stats?.heal_mp
            ? `Hồi <b style="color:#8aaaff;">${item.base_stats.heal_mp}</b> MP`
            : '';

        const currencyChooser = item.prices.length > 1
            ? this.renderCurrencyChooser(item.prices)
            : selectedPrice
                ? `<div style="margin-top:4px;font-size:12px;color:#ffe4c4;">`
                    + `Đơn giá: <span style="color:${cur.color};font-weight:bold;">${cur.icon} ${selectedPrice.price.toLocaleString('en-US')}</span>`
                    + `</div>`
                : '';

        const totalLine = selectedPrice
            ? `<div style="margin-top:4px;font-size:12px;color:#ffe4c4;">Tổng (x${amount}): <span style="color:${cur.color};font-weight:bold;">${cur.icon} ${total.toLocaleString('en-US')}</span></div>`
            : '';

        this.detailEl.innerHTML = [
            `<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">`,
            `  <span style="font-size:14px;font-weight:bold;color:#ffea7a;">${item.name_key}</span>`,
            `  <span style="font-size:11px;color:${TYPE_BORDER[item.item_type]};">[${TYPE_LABEL[item.item_type]}]</span>`,
            `  <span style="font-size:11px;color:#aaa;">Yêu cầu Lv ${item.required_level}</span>`,
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
            const border = active ? '#ffea7a' : '#4d2d13';
            const bg = active ? '#6b3a14' : 'rgba(45,26,10,0.5)';
            return `<div data-currency="${p.currency_type}" style="`
                + `cursor:pointer;padding:6px 10px;border-radius:6px;`
                + `border:2px solid ${border};background:${bg};`
                + `display:flex;align-items:center;gap:4px;font-size:12px;`
                + `color:${cur.color};font-weight:bold;user-select:none;`
                + `">`
                + `<span>${cur.icon}</span>`
                + `<span>${p.price.toLocaleString('en-US')}</span>`
                + `<span style="font-size:10px;color:#aaa;font-weight:normal;">${cur.label}</span>`
                + `</div>`;
        }).join('');
        return `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">`
            + `<span style="font-size:11px;color:#aaa;">Thanh toán:</span>`
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
                `<span style="font-size:11px;color:#888;font-style:italic;">Đang tải số dư...</span>`;
            return;
        }
        const fmt = (n: number) => n.toLocaleString('en-US');
        const item = (icon: string, label: string, value: number, color: string) =>
            `<div style="display:flex;align-items:center;gap:6px;" title="${label}">` +
            `  <span style="font-size:16px;">${icon}</span>` +
            `  <span style="color:${color};font-weight:bold;">${fmt(value)}</span>` +
            `</div>`;
        this.balanceEl.innerHTML = [
            item('🪙', 'Xu', this.wallet.coin, '#ffd070'),
            item('💰', 'Vàng', this.wallet.gold, '#f0b020'),
            item('💎', 'Kim Cương', this.wallet.gem, '#6cd0ff'),
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

    private setFeedback(message: string, kind: 'ok' | 'error'): void {
        if (!this.feedbackEl) return;
        this.feedbackEl.textContent = message;
        this.feedbackEl.style.color = kind === 'ok' ? '#bdf0a0' : '#ff8a8a';
    }

    private async handleBuy(): Promise<void> {
        const item = this.findSelected();
        if (!item || this.actionInFlight) return;
        const price = this.findSelectedPrice(item);
        if (!price) {
            this.setFeedback('Chưa chọn loại thanh toán.', 'error');
            return;
        }
        const character = getCurrentCharacter();
        if (!character) {
            this.setFeedback('Chưa có nhân vật.', 'error');
            return;
        }
        const amount = this.getAmount();
        this.actionInFlight = true;
        this.setBuyEnabled(false);
        this.setFeedback('Đang xử lý...', 'ok');
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
            this.setFeedback(
                `Đã mua ${amount} ${item.name_key}. Còn lại ${cur.icon} ${res.currency.balance_after.toLocaleString('en-US')}.`,
                'ok',
            );
            // Sync lại 3 loại tiền (đề phòng tickets / quest cùng lúc).
            void this.loadWallet();
        } catch (err) {
            this.setFeedback(err instanceof Error ? err.message : 'Mua hàng thất bại', 'error');
        } finally {
            this.actionInFlight = false;
            this.renderDetail();
        }
    }
}
