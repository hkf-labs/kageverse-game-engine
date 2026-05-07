import * as Phaser from 'phaser';
import {
    charactersAPI,
    inventoryAPI,
    type CharacterStatsSnapshot,
    type FoodBuffStartedDTO,
    type InventoryItemDTO,
    type InventoryItemType,
} from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import { onLocaleChange, t } from '../../i18n';
import type { GameComponent } from './types';

interface InventoryItem {
    page: number;
    slot: number;
    userItemId: string;
    name: string;
    type: InventoryItemType;
    subType: string | null;
    iconBg: string;
    iconText: string;
    amount: number;
    maxStack: number;
    upgradeLevel: number;
    isBound: boolean;
    isEquipped: boolean;
    equippedSlot: string | null;
    description: string;
}

export interface CharacterCurrencies {
    coin: number;   // Xu — farm từ quái / nhiệm vụ, không giao dịch.
    gold: number;   // Vàng / Lượng — cao cấp, giao dịch được.
    gem: number;    // Kim Cương / K-Coin — nạp thẻ, không giao dịch.
}

// Khi chưa fetch xong wallet hoặc lỗi, hiển thị 0.
const ZERO_CURRENCIES: CharacterCurrencies = {
    coin: 0,
    gold: 0,
    gem: 0,
};

const COLS = 8;
const PAGES_COUNT = 4;
const DATA_PAGE = 1; // BE inventory dùng trang 1; trang 2-4 là placeholder cho túi mở rộng tương lai.

const TYPE_BORDER: Record<InventoryItemType, string> = {
    equipment: '#d4af37',
    consumable: '#6dbf5a',
    material: '#b88848',
    quest: '#a050d0',
};

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

const SUBTYPE_ICON: Record<string, string> = {
    hp_potion: '🍙',
    mp_potion: '🍵',
    food_buff: '🍜',
};

const DEFAULT_BG: Record<InventoryItemType, string> = {
    equipment: '#2a3a3a',
    consumable: '#3a2a1a',
    material: '#3a2a1a',
    quest: '#3a1a4a',
};

function mapBeItem(dto: InventoryItemDTO): InventoryItem | null {
    if (dto.slot_index === null || dto.slot_index === undefined) return null;
    return {
        page: DATA_PAGE,
        slot: dto.slot_index,
        userItemId: dto.id,
        name: dto.name_key,
        type: dto.item_type,
        subType: dto.sub_type,
        iconBg: DEFAULT_BG[dto.item_type],
        iconText: (dto.sub_type && SUBTYPE_ICON[dto.sub_type]) || DEFAULT_ICON[dto.item_type],
        amount: dto.amount,
        maxStack: dto.max_stack,
        upgradeLevel: dto.upgrade_level,
        isBound: dto.is_bound,
        isEquipped: dto.is_equipped,
        equippedSlot: dto.equipped_slot,
        description: dto.sub_type ? `${dto.item_template_id} (${dto.sub_type})` : dto.item_template_id,
    };
}

// Map sub_type → equipment slot — đồng bộ với BE inventory.SlotForSubType.
const SUBTYPE_TO_SLOT: Record<string, string> = {
    weapon: 'main_hand',
    shirt: 'shirt',
    pants: 'pants',
    shoes: 'shoes',
    hat: 'hat',
    ring: 'ring',
    cloak: 'cloak',
};

export class InventoryModal implements GameComponent {
    private overlay?: HTMLDivElement;
    private gridEl?: HTMLDivElement;
    private tabsEl?: HTMLDivElement;
    private counterEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private currenciesEl?: HTMLDivElement;
    private useBtn?: HTMLButtonElement;
    private equipBtn?: HTMLButtonElement;
    private dropBtn?: HTMLButtonElement;
    private visible = false;
    private currentPage = 1;
    private selectedSlot: number | null = null;
    /** Vùng focus điều hướng bằng phím — 'tabs' = thanh Page, 'grid' = các ô
     * item, 'actions' = nút Use/Equip/Drop. Mặc định grid khi mở modal. */
    private focusZone: 'tabs' | 'grid' | 'actions' = 'grid';
    /** Index nút action đang focus trong zone='actions' (0=use, 1=equip, 2=drop). */
    private focusedAction = 0;
    private items: InventoryItem[] = [];
    private maxSlots = 40;
    private loading = false;
    private errorMessage: string | null = null;
    private actionInFlight = false;
    private currencies: CharacterCurrencies = { ...ZERO_CURRENCIES };
    private titleEl?: HTMLDivElement;
    private localeUnsub?: () => void;
    private scene: Phaser.Scene;
    private onStatsChanged?: (stats: CharacterStatsSnapshot) => void;
    private onFoodBuffStarted?: (buff: FoodBuffStartedDTO) => void;
    private onEquipmentChanged?: () => void;
    private onItemUsed?: () => void;
    private onSkillLearned?: (skillIDs: string[]) => void;

    constructor(
        scene: Phaser.Scene,
        callbacks?: {
            onStatsChanged?: (stats: CharacterStatsSnapshot) => void;
            onFoodBuffStarted?: (buff: FoodBuffStartedDTO) => void;
            onEquipmentChanged?: () => void;
            onItemUsed?: () => void;
            /** Bí Kíp Kỹ Năng consume thành công → callback với mảng skill_id
             * vừa được grant. Scene auto-assign vào hotbar empty slot + show
             * animation banner. */
            onSkillLearned?: (skillIDs: string[]) => void;
        },
    ) {
        this.scene = scene;
        this.onStatsChanged = callbacks?.onStatsChanged;
        this.onFoodBuffStarted = callbacks?.onFoodBuffStarted;
        this.onEquipmentChanged = callbacks?.onEquipmentChanged;
        this.onItemUsed = callbacks?.onItemUsed;
        this.onSkillLearned = callbacks?.onSkillLearned;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
        this.overlay.classList.add('kageverse-overlay', 'kageverse-overlay-inventory');
        Object.assign(this.overlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.55)',
            zIndex: '110', display: 'none',
        });
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.toggle();
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

        this.titleEl = root.querySelector('#inv-title') as HTMLDivElement;
        this.gridEl = root.querySelector('#inv-grid') as HTMLDivElement;
        this.tabsEl = root.querySelector('#inv-tabs') as HTMLDivElement;
        this.counterEl = root.querySelector('#inv-counter') as HTMLDivElement;
        this.detailEl = root.querySelector('#inv-detail') as HTMLDivElement;
        this.currenciesEl = root.querySelector('#inv-currencies') as HTMLDivElement;
        this.useBtn = root.querySelector('#inv-use') as HTMLButtonElement;
        this.equipBtn = root.querySelector('#inv-equip') as HTMLButtonElement;
        this.dropBtn = root.querySelector('#inv-drop') as HTMLButtonElement;
        const closeBtn = root.querySelector('#inv-close') as HTMLDivElement;

        closeBtn.addEventListener('click', () => this.toggle());
        this.useBtn.addEventListener('click', () => void this.handleUse());
        this.equipBtn.addEventListener('click', () => void this.handleEquipToggle());
        this.dropBtn.addEventListener('click', () => void this.handleDrop());

        this.renderTabs();
        this.renderGrid();
        this.renderDetail();
        this.renderCounter();
        this.renderCurrencies();

        // Re-render mọi text khi locale đổi runtime (vd post-login BE response).
        this.localeUnsub = onLocaleChange(() => {
            if (this.titleEl) this.titleEl.textContent = t('inventory.title');
            this.renderTabs();
            this.renderGrid();
            this.renderDetail();
            this.renderCounter();
            this.renderCurrencies();
        });
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
        this.gridEl = undefined;
        this.tabsEl = undefined;
        this.counterEl = undefined;
        this.detailEl = undefined;
        this.currenciesEl = undefined;
        this.titleEl = undefined;
        this.localeUnsub?.();
        this.localeUnsub = undefined;
    }

    toggle(): void {
        if (!this.overlay) return;
        this.visible = !this.visible;
        this.overlay.style.display = this.visible ? 'block' : 'none';

        if (this.visible) {
            this.currentPage = DATA_PAGE;
            this.selectedSlot = null;
            this.focusZone = 'grid';
            this.focusedAction = 0;
            this.renderTabs();
            this.renderActionFocus();
            void this.loadInventory();
            void this.loadWallet();
        }
    }

    private async loadWallet(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        try {
            const w = await charactersAPI.getWallet(character.id);
            this.currencies = { coin: w.coin, gold: w.gold, gem: w.gem };
        } catch (err) {
            this.currencies = { ...ZERO_CURRENCIES };
            if (err instanceof Error) console.warn('inventory: load wallet failed', err.message);
        }
        this.renderCurrencies();
    }

    isOpen(): boolean { return this.visible; }

    /**
     * Điều hướng modal bằng mũi tên / D-pad theo focus zone:
     *   - tabs:    ←/→ đổi page; ↓ xuống grid (giữ slot đã chọn).
     *   - grid:    ↑ ở row đầu → tabs; ↓ ở row cuối → actions; ←/→ trong row,
     *              ở col đầu/cuối thì wrap sang page liền kề (giữ row).
     *   - actions: ←/→ đổi nút (Use/Equip/Drop); ↑ về grid.
     * Mục tiêu: mọi clickable trong modal đều tới được không cần chuột.
     */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (this.focusZone === 'tabs') return this.navTabs(direction);
        if (this.focusZone === 'actions') return this.navActions(direction);
        this.navGrid(direction);
    }

    /** Enter trên zone đang focus — actions: click nút; tabs/grid: no-op
     * (page đã đổi qua ←/→, slot chọn đã update qua mũi tên). */
    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone !== 'actions') return;
        const btns = [this.useBtn, this.equipBtn, this.dropBtn];
        const btn = btns[this.focusedAction];
        if (btn && !btn.disabled) btn.click();
    }

    private navTabs(direction: 'left' | 'right' | 'up' | 'down'): void {
        switch (direction) {
            case 'left':
                if (this.currentPage > 1) this.setPage(this.currentPage - 1);
                return;
            case 'right':
                if (this.currentPage < PAGES_COUNT) this.setPage(this.currentPage + 1);
                return;
            case 'down':
                this.focusZone = 'grid';
                this.renderTabs(); // glow off
                if (this.selectedSlot === null) this.selectedSlot = 0;
                this.renderGrid();
                this.renderDetail();
                return;
            case 'up':
                return; // chạm trần — close button (X) chưa đưa vào nav.
        }
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
                if (this.focusedAction < 2) {
                    this.focusedAction += 1;
                    this.renderActionFocus();
                }
                return;
            case 'up':
                this.focusZone = 'grid';
                this.renderActionFocus();
                this.renderGrid(); // dim → bright cho slot đã chọn
                return;
            case 'down':
                return;
        }
    }

    private navGrid(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (this.selectedSlot === null) {
            this.selectedSlot = 0;
            this.renderGrid();
            this.renderDetail();
            return;
        }
        const rows = Math.ceil(this.maxSlots / COLS);
        const row = Math.floor(this.selectedSlot / COLS);
        const col = this.selectedSlot % COLS;

        if (direction === 'up' && row === 0) {
            this.focusZone = 'tabs';
            this.renderTabs(); // glow on
            this.renderGrid(); // bright → dim cho slot đã chọn
            return;
        }
        if (direction === 'down' && row === rows - 1) {
            this.focusZone = 'actions';
            this.renderActionFocus();
            this.renderGrid(); // bright → dim
            return;
        }
        if (direction === 'left' && col === 0) {
            this.gotoPageKeepRow(this.currentPage - 1, row, COLS - 1);
            return;
        }
        if (direction === 'right' && col === COLS - 1) {
            this.gotoPageKeepRow(this.currentPage + 1, row, 0);
            return;
        }

        let nextRow = row;
        let nextCol = col;
        switch (direction) {
            case 'left':  nextCol = col - 1; break;
            case 'right': nextCol = col + 1; break;
            case 'up':    nextRow = row - 1; break;
            case 'down':  nextRow = row + 1; break;
        }
        const next = Math.min(nextRow * COLS + nextCol, this.maxSlots - 1);
        if (next === this.selectedSlot) return;
        this.selectedSlot = next;
        this.renderGrid();
        this.renderDetail();
    }

    /** Chuyển sang page khác giữ nguyên row, đặt col cụ thể (cho boundary wrap). */
    private gotoPageKeepRow(page: number, row: number, col: number): void {
        if (page < 1 || page > PAGES_COUNT || page === this.currentPage) return;
        this.setPage(page);
        this.selectedSlot = Math.min(row * COLS + col, this.maxSlots - 1);
        this.renderGrid();
        this.renderDetail();
    }

    /** Vẽ outline glow cho nút action đang focus (zone='actions'). Khi rời
     * zone, clear toàn bộ outline. setButtonsEnabled không động vào
     * outline/boxShadow nên 2 stylesheet độc lập. */
    private renderActionFocus(): void {
        const btns = [this.useBtn, this.equipBtn, this.dropBtn];
        const focused = this.focusZone === 'actions';
        btns.forEach((btn, idx) => {
            if (!btn) return;
            if (focused && this.focusedAction === idx) {
                btn.style.outline = '2px solid #ffea7a';
                btn.style.outlineOffset = '2px';
                btn.style.boxShadow = '0 0 10px rgba(255,234,122,0.7)';
            } else {
                btn.style.outline = '';
                btn.style.outlineOffset = '';
                btn.style.boxShadow = '';
            }
        });
    }

    private buildHTML(): string {
        return [
            // Header
            `<div style="display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;">`,
            `  <div id="inv-title" style="flex:1;padding:10px 16px;font-size:15px;font-weight:bold;color:#ffea7a;letter-spacing:1px;">${escapeHtml(t('inventory.title'))}</div>`,
            `  <div id="inv-counter" style="padding:10px 12px;font-size:12px;color:#ffe4c4;"></div>`,
            `  <div id="inv-close" style="width:40px;text-align:center;cursor:pointer;font-size:18px;font-weight:bold;color:#ff8a8a;padding:10px 0;flex-shrink:0;">&#10005;</div>`,
            `</div>`,
            // Tabs (trang 1 / 2 / ...)
            `<div id="inv-tabs" style="display:flex;gap:4px;padding:8px 14px 0 14px;background:rgba(0,0,0,0.3);"></div>`,
            // Grid
            `<div style="padding:10px 14px 14px 14px;background:rgba(0,0,0,0.25);">`,
            `  <div id="inv-grid" style="display:grid;grid-template-columns:repeat(${COLS}, 56px);gap:6px;justify-content:center;"></div>`,
            `</div>`,
            // Detail
            `<div id="inv-detail" style="padding:12px 16px;border-top:2px solid #4d2d13;background:rgba(45,26,10,0.6);min-height:64px;font-size:13px;line-height:1.5;flex-shrink:0;"></div>`,
            // Currencies bar (Xu / Vàng / Kim Cương)
            `<div id="inv-currencies" style="display:flex;justify-content:space-around;align-items:center;padding:8px 14px;border-top:2px solid #4d2d13;background:rgba(20,12,4,0.7);flex-shrink:0;font-size:13px;"></div>`,
            // Footer buttons
            `<div style="display:flex;gap:8px;padding:10px 14px;border-top:2px solid #4d2d13;background:#1a0f04;flex-shrink:0;">`,
            `  <button id="inv-use" disabled style="flex:1;height:36px;border-radius:6px;border:2px solid #4a7a3a;background:#2a4a1a;color:#bdf0a0;font-size:13px;font-weight:bold;cursor:pointer;font-family:system-ui,sans-serif;opacity:0.5;">${escapeHtml(t('inventory.btn_use'))}</button>`,
            `  <button id="inv-equip" disabled style="flex:1;height:36px;border-radius:6px;border:2px solid #7a6a2a;background:#3a3014;color:#ffd070;font-size:13px;font-weight:bold;cursor:pointer;font-family:system-ui,sans-serif;opacity:0.5;">${escapeHtml(t('inventory.btn_equip'))}</button>`,
            `  <button id="inv-drop" disabled style="flex:1;height:36px;border-radius:6px;border:2px solid #7a3a3a;background:#4a1a1a;color:#f0a0a0;font-size:13px;font-weight:bold;cursor:pointer;font-family:system-ui,sans-serif;opacity:0.5;">${escapeHtml(t('inventory.btn_drop'))}</button>`,
            `</div>`,
        ].join('');
    }

    private async loadInventory(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.errorMessage = t('inventory.error_no_character');
            this.items = [];
            this.renderGrid();
            this.renderDetail();
            this.renderCounter();
            return;
        }

        this.loading = true;
        this.errorMessage = null;
        this.renderDetail();
        this.renderCounter();

        try {
            const res = await inventoryAPI.list(character.id);
            this.maxSlots = res.max_slots;
            this.items = res.items
                .map(mapBeItem)
                .filter((it): it is InventoryItem => it !== null);
        } catch (err) {
            this.errorMessage = err instanceof Error ? err.message : t('inventory.error_load');
            this.items = [];
        } finally {
            this.loading = false;
            this.renderGrid();
            this.renderDetail();
            this.renderCounter();
        }
    }

    private renderGrid(): void {
        if (!this.gridEl) return;
        const itemBySlot = new Map<number, InventoryItem>();
        for (const it of this.items) {
            if (it.page === this.currentPage) itemBySlot.set(it.slot, it);
        }

        this.gridEl.innerHTML = '';
        const gridFocused = this.focusZone === 'grid';
        for (let i = 0; i < this.maxSlots; i++) {
            const item = itemBySlot.get(i);
            const cell = document.createElement('div');
            const isSelected = this.selectedSlot === i;
            const borderColor = item ? TYPE_BORDER[item.type] : '#3a2a1a';
            const bgColor = item ? item.iconBg : 'rgba(20,12,4,0.6)';
            // Highlight: vàng + glow khi grid là focus zone, cam dịu khi đã rời
            // grid (tabs/actions) — vẫn nhớ slot đã chọn nhưng không chiếm focus.
            const selBorder = isSelected ? (gridFocused ? '#ffea7a' : '#ffd070') : borderColor;
            const selShadow = isSelected && gridFocused ? '0 0 8px rgba(255,234,122,0.6)' : 'none';
            Object.assign(cell.style, {
                width: '56px', height: '56px',
                border: `2px solid ${selBorder}`,
                borderRadius: '6px',
                background: bgColor,
                position: 'relative',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                userSelect: 'none',
                boxShadow: selShadow,
                transition: 'border-color 0.1s, box-shadow 0.1s',
            });

            if (item) {
                cell.innerHTML = [
                    `<div style="font-size:24px;">${item.iconText}</div>`,
                    item.amount > 1
                        ? `<div style="position:absolute;right:2px;bottom:0;font-size:11px;font-weight:bold;color:#fff;text-shadow:0 0 3px #000,1px 1px 0 #000;">${item.amount}</div>`
                        : '',
                    item.upgradeLevel > 0
                        ? `<div style="position:absolute;left:2px;top:0;font-size:10px;font-weight:bold;color:#ffea7a;text-shadow:0 0 3px #000,1px 1px 0 #000;">+${item.upgradeLevel}</div>`
                        : '',
                    item.isBound
                        ? `<div style="position:absolute;right:2px;top:0;font-size:9px;color:#ff8a8a;text-shadow:0 0 3px #000;">🔒</div>`
                        : '',
                ].join('');
            }

            cell.addEventListener('click', () => this.selectSlot(i));
            cell.addEventListener('mouseenter', () => {
                if (this.selectedSlot !== i) cell.style.borderColor = '#ffd070';
            });
            cell.addEventListener('mouseleave', () => {
                if (this.selectedSlot !== i) cell.style.borderColor = borderColor;
            });
            this.gridEl.appendChild(cell);
        }
    }

    private selectSlot(slot: number): void {
        this.selectedSlot = this.selectedSlot === slot ? null : slot;
        this.renderGrid();
        this.renderDetail();
    }

    private renderDetail(): void {
        if (!this.detailEl) return;
        if (this.loading) {
            this.detailEl.innerHTML = `<div style="color:#aaa;font-style:italic;">${escapeHtml(t('inventory.detail_loading'))}</div>`;
            this.setButtonsEnabled(false, false);
            return;
        }
        if (this.errorMessage) {
            this.detailEl.innerHTML = `<div style="color:#ff8a8a;">⚠ ${escapeHtml(this.errorMessage)}</div>`;
            this.setButtonsEnabled(false, false);
            return;
        }
        if (this.currentPage !== DATA_PAGE) {
            this.detailEl.innerHTML = `<div style="color:#888;font-style:italic;">${escapeHtml(t('inventory.detail_locked_page'))}</div>`;
            this.setButtonsEnabled(false, false);
            return;
        }

        const item = this.findSelectedItem();
        if (!item) {
            this.detailEl.innerHTML = `<div style="color:#888;font-style:italic;">${escapeHtml(t('inventory.detail_pick'))}</div>`;
            this.setButtonsEnabled(false, false);
            return;
        }
        const lockBadge = item.isBound ? `<span style="margin-left:6px;color:#ff8a8a;font-size:11px;">${escapeHtml(t('inventory.bound_badge'))}</span>` : '';
        const upgradeBadge = item.upgradeLevel > 0 ? `<span style="margin-left:6px;color:#ffea7a;">+${item.upgradeLevel}</span>` : '';
        this.detailEl.innerHTML = [
            `<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">`,
            `  <span style="font-size:14px;font-weight:bold;color:#ffea7a;">${escapeHtml(item.name)}</span>`,
            upgradeBadge,
            `  <span style="font-size:11px;color:${TYPE_BORDER[item.type]};">[${escapeHtml(t(TYPE_KEY[item.type]))}]</span>`,
            lockBadge,
            `</div>`,
            `<div style="margin-top:4px;color:#ffe4c4;">${escapeHtml(item.description)}</div>`,
            `<div style="margin-top:4px;color:#aaa;font-size:11px;">${escapeHtml(t('inventory.amount_label', { amount: item.amount, max: item.maxStack }))}</div>`,
        ].join('');

        const canUse = !this.actionInFlight && item.type === 'consumable';
        // Drop chỉ được phép khi: chưa khoá + không đang equip (BE sẽ reject equipped items).
        const canDrop = !this.actionInFlight && !item.isBound && !item.isEquipped;
        const isEquippable = item.type === 'equipment'
            && item.subType !== null
            && SUBTYPE_TO_SLOT[item.subType] !== undefined;
        const canEquip = !this.actionInFlight && isEquippable;
        const equipLabel = item.isEquipped ? t('inventory.btn_unequip') : t('inventory.btn_equip');
        this.setButtonsEnabled(canUse, canDrop, canEquip, equipLabel);
    }

    private renderCounter(): void {
        if (!this.counterEl) return;
        if (this.currentPage !== DATA_PAGE) {
            this.counterEl.textContent = t('inventory.counter_locked', { n: this.currentPage });
            return;
        }
        const usedThisPage = this.items.filter((it) => it.page === this.currentPage).length;
        this.counterEl.textContent = t('inventory.counter_used', { n: this.currentPage, used: usedThisPage, max: this.maxSlots });
    }

    private setButtonsEnabled(use: boolean, drop: boolean, equip: boolean = false, equipLabel?: string): void {
        const equipText = equipLabel ?? t('inventory.btn_equip');
        if (this.useBtn) {
            this.useBtn.disabled = !use;
            this.useBtn.style.opacity = use ? '1' : '0.5';
            this.useBtn.style.cursor = use ? 'pointer' : 'not-allowed';
        }
        if (this.equipBtn) {
            this.equipBtn.disabled = !equip;
            this.equipBtn.style.opacity = equip ? '1' : '0.5';
            this.equipBtn.style.cursor = equip ? 'pointer' : 'not-allowed';
            this.equipBtn.textContent = equipText;
        }
        if (this.dropBtn) {
            this.dropBtn.disabled = !drop;
            this.dropBtn.style.opacity = drop ? '1' : '0.5';
            this.dropBtn.style.cursor = drop ? 'pointer' : 'not-allowed';
        }
    }

    private findSelectedItem(): InventoryItem | undefined {
        if (this.selectedSlot === null) return undefined;
        return this.items.find((it) => it.page === this.currentPage && it.slot === this.selectedSlot);
    }

    private renderTabs(): void {
        if (!this.tabsEl) return;
        this.tabsEl.innerHTML = '';
        const tabsFocused = this.focusZone === 'tabs';
        for (let p = 1; p <= PAGES_COUNT; p++) {
            const tab = document.createElement('div');
            const active = p === this.currentPage;
            Object.assign(tab.style, {
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: active ? '#ffea7a' : '#ffe4c4',
                background: active ? '#6b3a14' : 'rgba(45,26,10,0.5)',
                border: `2px solid ${active ? '#ffea7a' : '#4d2d13'}`,
                borderBottom: 'none',
                borderTopLeftRadius: '6px',
                borderTopRightRadius: '6px',
                userSelect: 'none',
                // Glow khi tabs đang là focus zone — phân biệt với "active tab
                // chỉ nhờ mở sẵn page này".
                boxShadow: active && tabsFocused ? '0 -2px 10px rgba(255,234,122,0.7)' : 'none',
            });
            tab.textContent = t('inventory.tab_page', { n: p });
            tab.addEventListener('click', () => this.setPage(p));
            this.tabsEl.appendChild(tab);
        }
    }

    private renderCurrencies(): void {
        if (!this.currenciesEl) return;
        const fmt = (n: number) => n.toLocaleString('en-US');
        const item = (icon: string, label: string, value: number, color: string) =>
            `<div style="display:flex;align-items:center;gap:6px;" title="${escapeHtml(label)}">` +
            `  <span style="font-size:16px;">${icon}</span>` +
            `  <span style="color:${color};font-weight:bold;">${fmt(value)}</span>` +
            `</div>`;
        this.currenciesEl.innerHTML = [
            item('🪙', t('inventory.currency_coin'), this.currencies.coin, '#ffd070'),
            item('💰', t('inventory.currency_gold'), this.currencies.gold, '#f0b020'),
            item('💎', t('inventory.currency_gem'), this.currencies.gem, '#6cd0ff'),
        ].join('');
    }

    /**
     * Cập nhật ví tiền hiển thị. Tạm dùng để inject mock; sẽ wire vào API sau.
     */
    setCurrencies(currencies: CharacterCurrencies): void {
        this.currencies = { ...currencies };
        this.renderCurrencies();
    }

    private setPage(page: number): void {
        if (page < 1 || page > PAGES_COUNT || page === this.currentPage) return;
        this.currentPage = page;
        this.selectedSlot = null;
        this.renderTabs();
        this.renderGrid();
        this.renderDetail();
        this.renderCounter();
    }

    private async handleUse(): Promise<void> {
        const item = this.findSelectedItem();
        if (!item || item.type !== 'consumable' || this.actionInFlight) return;
        const character = getCurrentCharacter();
        if (!character) return;

        this.actionInFlight = true;
        this.setButtonsEnabled(false, false);
        try {
            const res = await inventoryAPI.use(character.id, item.userItemId, 1);
            if (res.character_stats && this.onStatsChanged) {
                this.onStatsChanged(res.character_stats);
            }
            if (res.effects?.food_buff_started && this.onFoodBuffStarted) {
                this.onFoodBuffStarted(res.effects.food_buff_started);
            }
            // Bí Kíp consume → grant_skill actions. Extract skill_id list +
            // báo scene để wire animation + auto-assign hotbar.
            if (res.effects?.skill_learned && this.onSkillLearned) {
                const skillIDs: string[] = [];
                for (const a of res.effects.skill_learned.actions ?? []) {
                    const sid = a.params?.skill_id;
                    if (typeof sid === 'string' && sid) skillIDs.push(sid);
                }
                if (skillIDs.length > 0) this.onSkillLearned(skillIDs);
            }
            await this.loadInventory();
            // use_item objective (vd Q4 mq_slime_purge: use 1 potion) — báo scene
            // refresh quest tracker / badge ❓ trên NPC turn-in.
            this.onItemUsed?.();
        } catch (err) {
            this.errorMessage = err instanceof Error ? err.message : t('inventory.error_use');
            this.renderDetail();
        } finally {
            this.actionInFlight = false;
        }
    }

    private async handleEquipToggle(): Promise<void> {
        const item = this.findSelectedItem();
        if (!item || item.type !== 'equipment' || this.actionInFlight) return;
        const character = getCurrentCharacter();
        if (!character) return;

        this.actionInFlight = true;
        this.setButtonsEnabled(false, false, false);
        try {
            if (item.isEquipped && item.equippedSlot) {
                await inventoryAPI.unequip(character.id, item.equippedSlot);
            } else {
                if (!item.subType) throw new Error(t('inventory.error_missing_subtype'));
                const slot = SUBTYPE_TO_SLOT[item.subType];
                if (!slot) throw new Error(t('inventory.error_not_equippable', { sub: item.subType }));
                await inventoryAPI.equip(character.id, item.userItemId, slot);
            }
            await this.loadInventory();
            this.onEquipmentChanged?.();
            // Stat character thay đổi sau equip → fetch lại để HUD đồng bộ.
            if (this.onStatsChanged) {
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
            this.errorMessage = err instanceof Error ? err.message : t('inventory.error_equip');
            this.renderDetail();
        } finally {
            this.actionInFlight = false;
        }
    }

    private async handleDrop(): Promise<void> {
        const item = this.findSelectedItem();
        if (!item || item.isBound || this.actionInFlight) return;
        const character = getCurrentCharacter();
        if (!character) return;

        this.actionInFlight = true;
        this.setButtonsEnabled(false, false);
        try {
            await inventoryAPI.drop(character.id, item.userItemId);
            this.selectedSlot = null;
            await this.loadInventory();
        } catch (err) {
            this.errorMessage = err instanceof Error ? err.message : t('inventory.error_drop');
            this.renderDetail();
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
