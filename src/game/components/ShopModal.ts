import * as Phaser from 'phaser';
import {
    shopAPI,
    type InventoryItemType,
    type ShopCurrencyType,
    type ShopListingDTO,
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
    private loading = false;
    private actionInFlight = false;
    private mapId = '';
    private npcTemplateId = '';
    private npcName = '';

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
        this.listings = [];
        this.feedbackEl && (this.feedbackEl.textContent = '');
        this.visible = true;
        this.overlay.style.display = 'block';
        this.renderHeader();
        this.renderDetail();
        void this.loadListings();
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
            const cur = CURRENCY_META[item.currency_type];

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

            cell.innerHTML = [
                `<div style="font-size:24px;line-height:1;">${icon}</div>`,
                `<div style="font-size:10px;color:#ffe4c4;text-align:center;line-height:1.2;height:24px;overflow:hidden;">${item.name_key}</div>`,
                `<div style="font-size:11px;display:flex;align-items:center;gap:3px;">` +
                    `<span>${cur.icon}</span>` +
                    `<span style="color:${cur.color};font-weight:bold;">${item.price.toLocaleString('en-US')}</span>` +
                `</div>`,
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
        this.selectedIdx = this.selectedIdx === idx ? null : idx;
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
        const cur = CURRENCY_META[item.currency_type];
        const amount = this.getAmount();
        const total = item.price * amount;
        const heal = item.base_stats?.heal_hp
            ? `Hồi <b style="color:#ff8a8a;">${item.base_stats.heal_hp}</b> HP`
            : item.base_stats?.heal_mp
            ? `Hồi <b style="color:#8aaaff;">${item.base_stats.heal_mp}</b> MP`
            : '';

        this.detailEl.innerHTML = [
            `<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">`,
            `  <span style="font-size:14px;font-weight:bold;color:#ffea7a;">${item.name_key}</span>`,
            `  <span style="font-size:11px;color:${TYPE_BORDER[item.item_type]};">[${TYPE_LABEL[item.item_type]}]</span>`,
            `  <span style="font-size:11px;color:#aaa;">Yêu cầu Lv ${item.required_level}</span>`,
            `</div>`,
            heal ? `<div style="margin-top:4px;">${heal}</div>` : '',
            `<div style="margin-top:4px;font-size:12px;color:#ffe4c4;">`,
            `  Đơn giá: <span style="color:${cur.color};font-weight:bold;">${cur.icon} ${item.price.toLocaleString('en-US')}</span>`,
            `  &nbsp;|&nbsp; Tổng (x${amount}): <span style="color:${cur.color};font-weight:bold;">${cur.icon} ${total.toLocaleString('en-US')}</span>`,
            `</div>`,
        ].join('');
        this.setBuyEnabled(!this.actionInFlight && amount > 0);
    }

    private renderBalance(): void {
        if (!this.balanceEl) return;
        // MVP: chưa có endpoint trả character currency. Show hint chuẩn về 3 loại tiền.
        // Khi BE expose GET /characters/:id/wallet (hoặc field trong /characters), update.
        this.balanceEl.innerHTML = [
            `<span style="font-size:11px;color:#888;font-style:italic;">Số dư ví đang tải từ BE — sẽ cập nhật sau khi mua.</span>`,
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
                amount,
            });
            const cur = CURRENCY_META[res.currency.type];
            this.setFeedback(
                `Đã mua ${amount} ${item.name_key}. Còn lại ${cur.icon} ${res.currency.balance_after.toLocaleString('en-US')}.`,
                'ok',
            );
        } catch (err) {
            this.setFeedback(err instanceof Error ? err.message : 'Mua hàng thất bại', 'error');
        } finally {
            this.actionInFlight = false;
            this.renderDetail();
        }
    }
}
