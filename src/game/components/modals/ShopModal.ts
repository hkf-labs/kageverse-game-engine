import * as Phaser from 'phaser';
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
import { clickActionBarSlot, type SoftKeySlot } from './softKeys';
import type { ConfirmDialog } from './ConfirmDialog';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { inventorySlotIconHtml, resolveItemIconUrl } from '../../itemIcon';
import { MODAL_COLORS, MODAL_SIZES, MODAL_Z_INDEX } from './theme';

// Grid 6-cột (kích thước cell match InventoryModal — 56×56, gap 6px). Width
// panel md ~560px đủ chứa 6 × 56 + 5 × 6 = 366px + padding, dư rộng rãi.
const COLS = 6;
// Tổng số ô luôn render (6 cột × 6 hàng = 36). Item nhiều hơn 36 → scroll trong
// gridWrap. NPC ít item → ô trống dim phía sau để layout cố định, giống Túi đồ.
const TOTAL_SLOTS = 36;

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
    teleport_charm: '✨',
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

type ActionSlot = 'left' | 'center';

interface ActionDef {
    key: 'buy' | 'view';
    slot: ActionSlot;
    label: string;
    palette: string;
    onClick: () => void;
}

export class ShopModal extends BaseModal {
    private gridEl?: HTMLDivElement;
    private balanceEl?: HTMLDivElement;
    /** Action bar overlay — sibling của panel, host nút Mua (trái) + Xem (giữa)
     * absolute ở đáy overlay. Tham khảo InventoryModal action bar. */
    private actionBarEl?: HTMLDivElement;
    /** Order [buy, view] để keyboard nav ←/→ chạy tự nhiên (Mua trái → Xem giữa). */
    private actionButtons: HTMLButtonElement[] = [];
    private actionDefsForKeys: ActionDef[] = [];

    // ── Sub-modal Xem (thông tin item) ──
    private detailOverlayEl?: HTMLDivElement;
    private detailPanelEl?: HTMLDivElement;
    private detailOpen = false;

    // ── Popup menu Mua — floating buttons style giống action bar, KHÔNG panel
    // chrome. Mode 'initial' = [Mua, Mua nhiều]; 'multi' = [Input, Mua].
    private buyMenuEl?: HTMLDivElement;
    private buyAmountInput?: HTMLInputElement;
    private buyOpen = false;
    private buyMode: 'initial' | 'multi' = 'initial';

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
    /** 'grid' = listings; 'actions' = action bar (Mua/Xem). */
    private focusZone: 'grid' | 'actions' = 'grid';
    /** Index nút action đang focus trong zone='actions' (0=Mua, 1=Xem). */
    private focusedAction = 0;

    /** Optional ConfirmDialog dep — wire từ scene để show confirm trước khi
     * gọi shopAPI.buy. Nếu không inject (vd ShopModal tách độc lập), handleBuy
     * sẽ mua thẳng không cần confirm. */
    private confirmDialog?: ConfirmDialog;

    constructor(scene: Phaser.Scene, deps?: { confirmDialog?: ConfirmDialog }) {
        super(scene);
        this.confirmDialog = deps?.confirmDialog;
    }

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
        // Grid với chiều cao CỐ ĐỊNH (380px ≈ 6 hàng cell 56px + gap 6 + padding).
        // Panel modal hết co theo số item: ít item vẫn cao bằng nhiều item → UX
        // ổn định, không "nhảy size" giữa NPC này NPC khác. Vượt 6 hàng → scroll.
        //
        // Scrollbar ẩn hoàn toàn (match other modals — CharacterInfoModal/SkillModal):
        // dùng class .cim-scroll + inline scrollbar-width:none. User scroll bằng
        // wheel hoặc drag, nhưng không thấy thanh.
        const gridWrap = document.createElement('div');
        gridWrap.style.cssText =
            'padding:10px 14px;background:rgba(0,0,0,0.25);' +
            'overflow-y:auto;height:380px;flex-shrink:0;' +
            'scrollbar-width:none;-ms-overflow-style:none;';
        gridWrap.classList.add('cim-scroll');
        if (!document.getElementById('cim-scroll-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'cim-scroll-style';
            styleEl.textContent = '.cim-scroll::-webkit-scrollbar{display:none;}';
            document.head.appendChild(styleEl);
        }
        this.gridEl = document.createElement('div');
        Object.assign(this.gridEl.style, {
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 56px)`,
            gap: '6px',
            justifyContent: 'center',
        });
        gridWrap.appendChild(this.gridEl);

        // Balance bar (ví) — section cuối của panel chính.
        this.balanceEl = document.createElement('div');
        this.balanceEl.style.cssText =
            `display:flex;justify-content:space-around;align-items:center;` +
            `padding:8px 14px;border-top:2px solid ${MODAL_COLORS.divider};` +
            `background:rgba(20,12,4,0.7);flex-shrink:0;font-size:13px;`;

        shell.body.append(gridWrap, this.balanceEl);

        // Action bar — sibling của panel, absolute đáy overlay. pointerEvents:
        // none cho container để click backdrop vẫn close modal; button con tự
        // set pointerEvents:auto. Share CSS zoom với panel để bar shrink đồng bộ
        // trên màn nhỏ.
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

        this.renderActionBar();

        shell.registerLocaleSync(() => {
            this.applyTitle();
            this.renderGrid();
            this.renderBalance();
            this.renderActionBar();
            if (this.detailOpen) this.renderDetailModalContent();
            if (this.buyOpen) this.renderBuyMenu();
        });
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.closeDetailModal();
        this.closeBuyMenu();
        this.gridEl = undefined;
        this.balanceEl = undefined;
        this.actionBarEl = undefined;
        this.actionButtons = [];
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
        this.focusedAction = 0;
        shell.setStatus('');
        this.visible = true;
        this.applyTitle();
        this.renderBalance();
        this.renderActionBar();
        void Promise.all([this.loadListings(), this.loadWallet()]);
    }

    close(): void {
        if (!this.visible && !this.shell) return;
        this.teardownShell();
    }

    /**
     * Grid 4-cột: ↑/↓/←/→ điều hướng listing. ↓ ở row cuối → zone='actions'.
     * Actions zone: ←/→ giữa nút Mua/Xem; ↑ về grid.
     */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (this.focusZone === 'actions') {
            switch (direction) {
                case 'up':
                    this.focusZone = 'grid';
                    this.renderActionFocus();
                    return;
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
                    if (this.actionButtons.length > 0) {
                        this.focusZone = 'actions';
                        this.focusedAction = 0;
                        this.renderActionFocus();
                    }
                    return;
                }
                row += 1;
                break;
        }
        const next = Math.min(row * COLS + col, total - 1);
        if (next !== this.selectedIdx) this.setSelectedIdx(next);
    }

    /** Enter:
     *   - actions zone: click nút focused (Mua / Xem).
     *   - grid zone: shortcut mở popup Mua nếu có item selected. */
    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone === 'actions') {
            const btn = this.actionButtons[this.focusedAction];
            if (btn && !btn.disabled) btn.click();
            return;
        }
        if (this.findSelected()) this.toggleBuyMenu();
    }

    triggerSoftKey(slot: SoftKeySlot): boolean {
        if (!this.visible) return false;
        return clickActionBarSlot(this.actionDefsForKeys, this.actionButtons, slot);
    }

    /** Set selectedIdx trực tiếp (không toggle như selectListing) — cho arrow nav. */
    private setSelectedIdx(idx: number): void {
        this.selectedIdx = idx;
        const first = this.listings[idx]?.prices[0];
        this.selectedCurrency = first ? first.currency_type : null;
        // Đổi item → popup/sub-modal cũ stale, đóng để user mở lại cho item mới.
        if (this.detailOpen) this.closeDetailModal();
        if (this.buyOpen) this.closeBuyMenu();
        this.renderGrid();
        this.renderActionBar();
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
    }

    private async loadListings(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('shop.error_no_character'), 'error');
            return;
        }
        this.loading = true;
        this.renderGrid();
        this.renderActionBar();
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
            this.renderActionBar();
        }
    }

    private renderGrid(): void {
        if (!this.gridEl) return;
        if (this.loading) {
            this.gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#aaa;padding:14px;font-style:italic;">${escapeHtml(t('shop.loading_listings'))}</div>`;
            return;
        }

        // Render fixed grid TOTAL_SLOTS ô (giống Túi đồ). Ô có item → icon + click
        // chọn được; ô trống → dim border/bg, không tương tác. NPC chưa bán →
        // tất cả ô trống + hint "empty_npc" ở góc trên-trái grid.
        this.gridEl.innerHTML = '';
        const totalCells = Math.max(TOTAL_SLOTS, this.listings.length);
        for (let i = 0; i < totalCells; i++) {
            const item = this.listings[i];
            const cell = document.createElement('div');
            const isSelected = item && this.selectedIdx === i;
            const borderColor = item ? TYPE_BORDER[item.item_type] : '#3a2a1a';
            const bgColor = item ? DEFAULT_BG[item.item_type] : 'rgba(20,12,4,0.6)';
            const iconText = item
                ? ((item.sub_type && SUBTYPE_ICON[item.sub_type]) || DEFAULT_ICON[item.item_type])
                : '';
            const iconUrl = item
                ? resolveItemIconUrl(item.sprite_key, item.item_template_id)
                : null;

            // Cell 56×56 — match InventoryModal grid. Item hiển thị icon; tên +
            // giá + currency xem ở sub-modal Xem (click Xem trên action bar).
            // Tooltip native (title) cho hover preview tên item.
            Object.assign(cell.style, {
                width: '56px',
                height: '56px',
                border: `2px solid ${isSelected ? MODAL_COLORS.borderAccent : borderColor}`,
                borderRadius: '6px',
                background: bgColor,
                cursor: item ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                boxShadow: isSelected ? '0 0 8px rgba(255,234,122,0.6)' : 'none',
                transition: 'border-color 0.1s, box-shadow 0.1s',
            });
            if (item) {
                cell.title = t(item.name_key);
                cell.innerHTML = inventorySlotIconHtml(iconUrl, iconText);
                cell.addEventListener('click', () => this.selectListing(i));
                cell.addEventListener('mouseenter', () => {
                    if (this.selectedIdx !== i) cell.style.borderColor = '#ffd070';
                });
                cell.addEventListener('mouseleave', () => {
                    if (this.selectedIdx !== i) cell.style.borderColor = borderColor;
                });
            }
            this.gridEl.appendChild(cell);
        }
    }

    private selectListing(idx: number): void {
        if (this.selectedIdx === idx) {
            this.selectedIdx = null;
            this.selectedCurrency = null;
            if (this.detailOpen) this.closeDetailModal();
            if (this.buyOpen) this.closeBuyMenu();
        } else {
            this.selectedIdx = idx;
            const first = this.listings[idx]?.prices[0];
            this.selectedCurrency = first ? first.currency_type : null;
            // Đổi item → đóng popup/sub-modal cũ (info stale, buy flow reset).
            if (this.detailOpen) this.closeDetailModal();
            if (this.buyOpen) this.closeBuyMenu();
        }
        this.renderGrid();
        this.renderActionBar();
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

    private findSelected(): ShopListingDTO | null {
        if (this.selectedIdx === null) return null;
        return this.listings[this.selectedIdx] ?? null;
    }

    // =====================================================================
    //  Action bar (Mua trái + Xem giữa)
    // =====================================================================

    /** Slot positioning theo InventoryModal: 'left' = left:24px, 'center' =
     * left:50% + translateX(-50%). Mua dùng left, Xem dùng center. */
    private static readonly SLOT_POS: Record<ActionSlot, { left?: string; transform?: string }> = {
        left: { left: '24px' },
        center: { left: '50%', transform: 'translateX(-50%)' },
    };

    /** Rebuild action bar theo selected item. Mua (left) toggle popup menu;
     * Xem (center) toggle sub-modal chi tiết. Item chưa chọn → bar trống. */
    private renderActionBar(): void {
        if (!this.actionBarEl) return;
        this.actionBarEl.innerHTML = '';
        this.actionButtons = [];

        const item = this.findSelected();
        if (this.loading || !item) {
            this.actionDefsForKeys = [];
            if (this.focusZone === 'actions') this.focusZone = 'grid';
            return;
        }

        const actions: ActionDef[] = [
            {
                key: 'buy',
                slot: 'left',
                label: this.buyOpen ? t('shop.btn_close_detail') : t('shop.btn_buy'),
                palette: 'border:2px solid #4a7a3a;background:#2a4a1a;color:#bdf0a0;',
                onClick: () => this.toggleBuyMenu(),
            },
            {
                key: 'view',
                slot: 'center',
                label: this.detailOpen ? t('shop.btn_close_detail') : t('shop.btn_view'),
                palette: 'border:2px solid #3a5a7a;background:#1a2a3a;color:#a0c8e0;',
                onClick: () => this.toggleDetailModal(),
            },
        ];
        this.actionDefsForKeys = actions;

        if (this.focusedAction >= actions.length) this.focusedAction = 0;

        actions.forEach((a) => {
            const pos = ShopModal.SLOT_POS[a.slot];
            const btn = document.createElement('button');
            btn.textContent = a.label;
            Object.assign(btn.style, {
                position: 'absolute',
                bottom: '0',
                left: pos.left ?? '',
                transform: pos.transform ?? '',
                minWidth: '120px',
                height: '36px',
                padding: '0 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif',
                pointerEvents: 'auto',
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

    // =====================================================================
    //  Sub-modal: Xem chi tiết item (panel nhỏ, info-only)
    // =====================================================================

    private toggleDetailModal(): void {
        if (this.detailOpen) this.closeDetailModal();
        else this.openDetailModal();
    }

    private openDetailModal(): void {
        if (this.detailOpen) return;
        if (!this.findSelected()) return;
        // Chỉ 1 popup/sub-modal cùng lúc — đóng buy menu nếu đang mở.
        if (this.buyOpen) this.closeBuyMenu();
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
        overlay.classList.add('kageverse-overlay-shop-detail');
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
            width: '320px',
            maxHeight: '70vh',
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
            // Ẩn scrollbar đồng nhất với main panel grid (Firefox / IE / WebKit).
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
        });
        panel.classList.add('cim-scroll');
        overlay.appendChild(panel);
        parent.appendChild(overlay);

        // Share zoom với panel chính → sub-modal cũng shrink theo viewport.
        this.shell?.applyZoomTo(panel);

        this.detailOverlayEl = overlay;
        this.detailPanelEl = panel;
    }

    private renderDetailModalContent(): void {
        if (!this.detailPanelEl) return;
        const item = this.findSelected();
        if (!item) {
            this.closeDetailModal();
            return;
        }
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

        // Detail liệt kê tất cả giá (info-only). Chọn currency thực hiện ở
        // popup Mua nếu cần (item có nhiều currency).
        const priceLines = item.prices.length === 0
            ? `<div style="font-size:11px;color:#888;font-style:italic;">N/A</div>`
            : item.prices.map((p) => {
                const c = CURRENCY_META[p.currency_type];
                return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;">`
                    + `<span style="font-size:14px;">${c.icon}</span>`
                    + `<span style="color:${c.color};font-weight:bold;">${p.price.toLocaleString('en-US')}</span>`
                    + `<span style="color:#aaa;font-size:11px;">${escapeHtml(t(c.labelKey))}</span>`
                    + `</div>`;
            }).join('');

        this.detailPanelEl.innerHTML = [
            `<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">`,
            `  <span style="font-size:14px;font-weight:bold;color:${MODAL_COLORS.title};">${escapeHtml(t(item.name_key))}</span>`,
            `  <span style="font-size:11px;color:${TYPE_BORDER[item.item_type]};">[${escapeHtml(t(TYPE_KEY[item.item_type]))}]</span>`,
            `</div>`,
            `<div style="margin-top:4px;font-size:11px;color:#aaa;">${escapeHtml(t('shop.required_level', { n: item.required_level }))}</div>`,
            heal ? `<div style="margin-top:6px;">${heal}</div>` : '',
            `<div style="margin-top:10px;font-size:11px;color:#aaa;">${escapeHtml(t('shop.unit_price'))}</div>`,
            `<div style="margin-top:4px;display:flex;flex-direction:column;gap:4px;">${priceLines}</div>`,
        ].join('');
    }

    // =====================================================================
    //  Popup menu: Mua (floating buttons style — KHÔNG panel chrome)
    // =====================================================================

    private toggleBuyMenu(): void {
        if (this.buyOpen) this.closeBuyMenu();
        else this.openBuyMenu();
    }

    private openBuyMenu(): void {
        if (this.buyOpen) return;
        if (!this.findSelected()) return;
        if (this.detailOpen) this.closeDetailModal();
        this.buyMode = 'initial';
        this.ensureBuyMenuDOM();
        this.buyOpen = true;
        this.renderBuyMenu();
        this.renderActionBar();
    }

    private closeBuyMenu(): void {
        if (this.buyMenuEl) {
            this.buyMenuEl.remove();
            this.buyMenuEl = undefined;
            this.buyAmountInput = undefined;
        }
        if (!this.buyOpen) return;
        this.buyOpen = false;
        this.buyMode = 'initial';
        if (this.actionBarEl) this.renderActionBar();
    }

    /** Tạo container popup — sibling của action bar trong shell.overlay,
     * absolute đáy overlay (bottom:70px — ngay trên action bar 16+44=60px).
     * Không panel chrome — chỉ là 1 row floating buttons. */
    private ensureBuyMenuDOM(): void {
        if (this.buyMenuEl) return;
        const shell = this.shell;
        if (!shell) return;
        const menu = document.createElement('div');
        menu.classList.add('kageverse-overlay-shop-buy-menu');
        Object.assign(menu.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '70px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'none',
        });
        shell.overlay.appendChild(menu);
        shell.applyZoomTo(menu);
        this.buyMenuEl = menu;
    }

    private renderBuyMenu(): void {
        if (!this.buyMenuEl) return;
        const item = this.findSelected();
        if (!item) {
            this.closeBuyMenu();
            return;
        }
        this.buyMenuEl.innerHTML = '';

        // Popup Mua chỉ chứa buttons (Mua / Mua nhiều / Input + Mua). KHÔNG
        // hiển thị giá / chooser / thanh toán — info số tiền sẽ trừ chỉ show
        // ở ConfirmDialog ngay trước khi gọi API. Item nhiều currency → mặc
        // định currency đầu tiên (set khi selectListing). User xem đủ các giá
        // ở sub-modal Xem.

        if (this.buyMode === 'initial') {
            // 2 wooden tablet [Mua] [Mua nhiều] — style match menu chức năng game.
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:18px;pointer-events:none;';

            const btnBuy = this.createWoodenButton(
                t('shop.btn_buy'),
                () => void this.handleBuy(1),
            );
            const btnMulti = this.createWoodenButton(
                t('shop.btn_buy_multi'),
                () => {
                    this.buyMode = 'multi';
                    this.renderBuyMenu();
                },
            );
            row.append(btnBuy, btnMulti);
            this.buyMenuEl.appendChild(row);
        } else {
            // multi mode: wooden banner panel chứa label + input (recessed),
            // dưới là row 3 wooden tablet [Đóng] [Đồng ý] [Xoá]. KHÔNG hiển thị
            // total tiền — info số tiền chỉ show ở ConfirmDialog trước khi trừ.
            const banner = document.createElement('div');
            Object.assign(banner.style, {
                background: 'linear-gradient(180deg, #5a3a1f 0%, #3e2510 50%, #2a1808 100%)',
                border: '4px solid #1a0e04',
                borderRadius: '18px',
                boxShadow: [
                    'inset 0 2px 0 rgba(255,200,120,0.3)',
                    'inset 0 -3px 6px rgba(0,0,0,0.6)',
                    '0 6px 16px rgba(0,0,0,0.7)',
                ].join(','),
                padding: '14px 22px 16px',
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '420px',
                maxWidth: 'min(80vw, 520px)',
                boxSizing: 'border-box',
            });

            const label = document.createElement('div');
            Object.assign(label.style, {
                textAlign: 'center',
                color: '#ffe4c4',
                fontSize: '14px',
                fontWeight: 'bold',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                letterSpacing: '0.5px',
            });
            label.textContent = t('shop.input_amount_label');

            const input = document.createElement('input');
            input.type = 'number';
            input.min = '1';
            input.max = '99';
            input.value = this.buyAmountInput?.value ?? '1';
            Object.assign(input.style, {
                width: '100%',
                height: '40px',
                background: 'linear-gradient(180deg, #1a0e04, #2a1808)',
                border: '2px solid #1a0e04',
                borderRadius: '10px',
                boxShadow: [
                    'inset 0 2px 4px rgba(0,0,0,0.8)',
                    'inset 0 -1px 0 rgba(255,200,120,0.15)',
                ].join(','),
                color: '#ffe4c4',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
            });

            banner.append(label, input);
            this.buyMenuEl.appendChild(banner);
            this.buyAmountInput = input;

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:14px;pointer-events:none;';

            const btnClose = this.createWoodenButton(
                t('shop.btn_close_detail'),
                () => this.closeBuyMenu(),
            );
            const btnAgree = this.createWoodenButton(
                t('shop.btn_agree'),
                () => void this.handleBuy(this.getBuyAmount()),
            );
            const btnClear = this.createWoodenButton(
                t('shop.btn_clear'),
                () => {
                    if (this.buyAmountInput) {
                        this.buyAmountInput.value = '';
                        this.buyAmountInput.focus();
                    }
                },
            );

            btnRow.append(btnClose, btnAgree, btnClear);
            this.buyMenuEl.appendChild(btnRow);
        }
    }

    /** Wooden tablet button — gradient nâu gỗ, border đen, gold text với shadow.
     * Hover sáng hơn, mousedown lún xuống 1px. Match style menu chức năng game
     * (Phaser ActionMenu, color tone tương đương #3e2723 / #e29e4a). */
    private createWoodenButton(label: string, onClick: () => void): HTMLButtonElement {
        const REST_BG = 'linear-gradient(180deg, #5a3a1f 0%, #3e2510 50%, #2a1808 100%)';
        const HOVER_BG = 'linear-gradient(180deg, #7d5530 0%, #5d3a18 50%, #3e2308 100%)';
        const REST_SHADOW = [
            'inset 0 2px 0 rgba(255,200,120,0.3)',
            'inset 0 -3px 4px rgba(0,0,0,0.5)',
            '0 4px 10px rgba(0,0,0,0.6)',
        ].join(',');
        const PRESS_SHADOW = [
            'inset 0 2px 0 rgba(255,200,120,0.3)',
            'inset 0 -2px 4px rgba(0,0,0,0.5)',
            '0 2px 6px rgba(0,0,0,0.5)',
        ].join(',');
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            minWidth: '96px',
            height: '44px',
            padding: '0 22px',
            border: '3px solid #1a0e04',
            borderRadius: '22px',
            background: REST_BG,
            boxShadow: REST_SHADOW,
            color: '#ffd070',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'system-ui, sans-serif',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            pointerEvents: 'auto',
            whiteSpace: 'nowrap',
            transition: 'transform 0.06s ease, box-shadow 0.06s ease',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.background = HOVER_BG;
            btn.style.color = '#ffea7a';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = REST_BG;
            btn.style.color = '#ffd070';
            btn.style.transform = '';
            btn.style.boxShadow = REST_SHADOW;
        });
        btn.addEventListener('mousedown', () => {
            btn.style.transform = 'translateY(1px)';
            btn.style.boxShadow = PRESS_SHADOW;
        });
        btn.addEventListener('mouseup', () => {
            btn.style.transform = '';
            btn.style.boxShadow = REST_SHADOW;
        });
        btn.addEventListener('click', onClick);
        return btn;
    }

    /** Đọc số lượng hiện tại từ input (clamp 1-99). */
    private getBuyAmount(): number {
        const raw = this.buyAmountInput?.value ?? '1';
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 1) return 1;
        return Math.min(n, 99);
    }

    // =====================================================================
    //  Buy action
    // =====================================================================

    /** Bước 1: validate input + hiển thị ConfirmDialog với chi tiết số tiền
     * sẽ bị trừ. User OK → executeBuy thực gọi API. User Huỷ → giữ buy menu
     * mở, không trừ gì.
     *
     * Nếu confirmDialog dep không được inject (vd test / scene độc lập),
     * skip confirm và mua thẳng — fallback an toàn. */
    private async handleBuy(amount: number): Promise<void> {
        const item = this.findSelected();
        if (!item || this.actionInFlight) return;
        const price = this.findSelectedPrice(item);
        if (!price) {
            this.shell?.setStatus(t('shop.error_no_payment'), 'error');
            return;
        }
        if (!getCurrentCharacter()) {
            this.shell?.setStatus(t('shop.error_no_character'), 'error');
            return;
        }
        const qty = Math.max(1, Math.min(99, amount));
        if (!this.confirmDialog) {
            await this.executeBuy(item, price, qty);
            return;
        }
        const cur = CURRENCY_META[price.currency_type];
        const total = price.price * qty;
        this.confirmDialog.open({
            title: t('shop.confirm_buy_title'),
            message: t('shop.confirm_buy_message', {
                amount: qty,
                name: t(item.name_key),
                icon: cur.icon,
                total: total.toLocaleString('en-US'),
            }),
            confirmColor: 'green',
            onConfirm: () => {
                void this.executeBuy(item, price, qty);
            },
        });
    }

    /** Bước 2: thực gọi shopAPI.buy + cập nhật wallet + status footer. Tách
     * khỏi handleBuy để confirmDialog onConfirm callback giữ closure gọn. */
    private async executeBuy(item: ShopListingDTO, price: ShopPriceDTO, qty: number): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('shop.error_no_character'), 'error');
            return;
        }
        this.actionInFlight = true;
        this.shell?.setStatus(t('shop.processing'), 'ok');
        try {
            const res = await shopAPI.buy(character.id, {
                map_id: this.mapId,
                npc_template_id: this.npcTemplateId,
                item_template_id: item.item_template_id,
                currency_type: price.currency_type,
                amount: qty,
            });
            const cur = CURRENCY_META[res.currency.type];
            // Cập nhật wallet ngay từ response (cho currency vừa tiêu) để UI phản hồi tức thì.
            if (this.wallet) {
                this.wallet = { ...this.wallet, [res.currency.type]: res.currency.balance_after };
                this.renderBalance();
            }
            this.shell?.setStatus(
                t('shop.bought', {
                    amount: qty,
                    name: t(item.name_key),
                    icon: cur.icon,
                    balance: res.currency.balance_after.toLocaleString('en-US'),
                }),
                'ok',
            );
            // Sync lại 3 loại tiền (đề phòng tickets / quest cùng lúc).
            void this.loadWallet();
            // Đóng popup Mua sau khi mua thành công.
            this.closeBuyMenu();
        } catch (err) {
            this.shell?.setStatus(err instanceof Error ? err.message : t('shop.error_buy'), 'error');
        } finally {
            this.actionInFlight = false;
        }
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
