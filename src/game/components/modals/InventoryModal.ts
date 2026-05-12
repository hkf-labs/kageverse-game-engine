import * as Phaser from 'phaser';
import {
    charactersAPI,
    inventoryAPI,
    type CharacterStatsSnapshot,
    type FoodBuffStartedDTO,
    type InventoryItemDTO,
    type InventoryItemType,
} from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS, MODAL_SIZES, MODAL_Z_INDEX } from './theme';

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

type ActionSlot = 'left' | 'center' | 'right';

interface ActionDef {
    /** Key ổn định (use / equip / drop / view) — log + i18n key suffix. */
    key: string;
    /** Vị trí cố định trên bar — left/center/right. Xem luôn ở center,
     * Use/Equip ở left, Drop ở right. */
    slot: ActionSlot;
    label: string;
    /** Inline CSS riêng cho color scheme (border/background/text). */
    palette: string;
    onClick: () => void;
}

export class InventoryModal extends BaseModal {
    private gridEl?: HTMLDivElement;
    private tabsEl?: HTMLDivElement;
    private currenciesEl?: HTMLDivElement;
    /** Action bar overlay — nằm trong shell.overlay nhưng absolute-positioned
     * ở đáy màn hình (ngoài panel) để không chen vào nội dung modal. */
    private actionBarEl?: HTMLDivElement;
    /** Mảng button hiện tại — recreate mỗi lần renderActionBar() chạy. */
    private actionButtons: HTMLButtonElement[] = [];
    /** Sub-modal "Xem chi tiết" — overlay riêng z-index=tooltip, panel nhỏ
     * trung tâm hiển thị info item đang chọn. Toggle qua nút Xem ↔ Đóng. */
    private detailOverlayEl?: HTMLDivElement;
    private detailPanelEl?: HTMLDivElement;
    private detailOpen = false;
    private currentPage = 1;
    private selectedSlot: number | null = null;
    /** Vùng focus điều hướng bằng phím — 'tabs' = thanh Page, 'grid' = các ô
     * item, 'actions' = action bar đáy màn hình. Mặc định grid khi mở modal. */
    private focusZone: 'tabs' | 'grid' | 'actions' = 'grid';
    /** Index nút action đang focus trong zone='actions'. Reset về 0 khi action
     * list rebuild (selected item đổi → có thể đổi count nút). */
    private focusedAction = 0;
    private items: InventoryItem[] = [];
    private maxSlots = 40;
    private loading = false;
    private errorMessage: string | null = null;
    private actionInFlight = false;
    private currencies: CharacterCurrencies = { ...ZERO_CURRENCIES };
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
        super(scene);
        this.onStatsChanged = callbacks?.onStatsChanged;
        this.onFoodBuffStarted = callbacks?.onFoodBuffStarted;
        this.onEquipmentChanged = callbacks?.onEquipmentChanged;
        this.onItemUsed = callbacks?.onItemUsed;
        this.onSkillLearned = callbacks?.onSkillLearned;
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-inventory',
            size: 'md',
            layer: 'modal',
            withStatus: false,
            title: t('inventory.title'),
            onClose: () => this.toggle(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Tabs (page 1..PAGES_COUNT)
        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:4px;padding:8px 14px 0 14px;background:rgba(0,0,0,0.3);flex-shrink:0;';
        shell.body.appendChild(tabs);
        this.tabsEl = tabs;

        // Grid section
        const gridWrap = document.createElement('div');
        gridWrap.style.cssText = 'padding:10px 14px 14px 14px;background:rgba(0,0,0,0.25);flex-shrink:0;';
        const grid = document.createElement('div');
        grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS}, 56px);gap:6px;justify-content:center;`;
        gridWrap.appendChild(grid);
        shell.body.appendChild(gridWrap);
        this.gridEl = grid;

        // Currencies bar — section cuối của panel. Detail section (info item)
        // đã move ra sub-modal riêng (xem detailOverlayEl); footer action button
        // đã move xuống đáy màn hình (xem actionBarEl).
        const currencies = document.createElement('div');
        currencies.style.cssText = `display:flex;justify-content:space-around;align-items:center;padding:8px 14px;border-top:2px solid ${MODAL_COLORS.divider};background:rgba(20,12,4,0.7);flex-shrink:0;font-size:13px;`;
        shell.body.appendChild(currencies);
        this.currenciesEl = currencies;

        // Action bar — sibling của panel trong overlay, absolute ở đáy màn hình.
        // pointerEvents:none cho container để click backdrop vẫn close modal;
        // button con tự set pointerEvents:auto. Share CSS zoom với panel để
        // bar shrink đồng bộ trên màn nhỏ.
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

        // Initial render với state hiện tại (visible=false, không sao — render
        // an toàn vì chỉ paint DOM, chưa đụng API).
        this.renderTabs();
        this.renderGrid();
        this.renderDetail();
        this.renderCurrencies();

        // Re-render mọi text khi locale đổi runtime (vd post-login BE response).
        shell.registerLocaleSync(() => {
            this.shell?.setTitle(t('inventory.title'));
            this.renderTabs();
            this.renderGrid();
            this.renderDetail();
            this.renderCurrencies();
        });
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.gridEl = undefined;
        this.tabsEl = undefined;
        this.currenciesEl = undefined;
        this.actionBarEl = undefined;
        this.actionButtons = [];
        // Sub-modal detail cũng đóng theo modal chính.
        this.closeDetailModal();
    }

    toggle(): void {
        const willShow = !this.visible;
        if (willShow) this.ensureShell();
        this.visible = willShow;

        if (willShow) {
            this.currentPage = DATA_PAGE;
            this.selectedSlot = null;
            this.focusZone = 'grid';
            this.focusedAction = 0;
            this.renderTabs();
            this.renderActionFocus();
            void this.loadInventory();
            void this.loadWallet();
        } else {
            this.teardownShell();
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

    /** Enter trên zone đang focus:
     *   - actions: click nút focused (Sử dụng / Xem / Vứt / ...).
     *   - grid: shortcut cho nút Xem — toggle sub-modal chi tiết item nếu slot
     *     đang focus có item. Không có item → no-op.
     *   - tabs: no-op (page đã đổi qua ←/→). */
    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone === 'actions') {
            const btn = this.actionButtons[this.focusedAction];
            if (btn && !btn.disabled) btn.click();
            return;
        }
        if (this.focusZone === 'grid') {
            const item = this.findSelectedItem();
            if (!item) return;
            this.toggleDetailModal();
        }
    }

    private navTabs(direction: 'left' | 'right' | 'up' | 'down'): void {
        switch (direction) {
            case 'left': {
                const target = this.findNextUnlockedPage(this.currentPage, -1);
                if (target !== null) this.setPage(target);
                return;
            }
            case 'right': {
                const target = this.findNextUnlockedPage(this.currentPage, 1);
                if (target !== null) this.setPage(target);
                return;
            }
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
                if (this.focusedAction < this.actionButtons.length - 1) {
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
            // Chỉ sang actions khi có nút khả dụng — tránh focusZone='actions'
            // mà không có button nào để confirm (selected item không có action).
            if (this.actionButtons.length > 0) {
                this.focusZone = 'actions';
                this.focusedAction = 0;
                this.renderActionFocus();
                this.renderGrid(); // bright → dim
            }
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

    /** Chuyển sang page khác giữ nguyên row, đặt col cụ thể (cho boundary wrap).
     * Bỏ qua page locked — nếu page kế bị khoá, no-op (không skip xa hơn để
     * tránh user "tunnel" qua nhiều trang khoá bằng 1 phím). */
    private gotoPageKeepRow(page: number, row: number, col: number): void {
        if (page < 1 || page > PAGES_COUNT || page === this.currentPage) return;
        if (!this.isPageUnlocked(page)) return;
        this.setPage(page);
        this.selectedSlot = Math.min(row * COLS + col, this.maxSlots - 1);
        this.renderGrid();
        this.renderDetail();
    }

    /** Vẽ outline glow cho nút action đang focus (zone='actions'). Khi rời
     * zone hoặc không có nút nào, clear outline. */
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
                btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            }
        });
    }

    /**
     * Rebuild action bar theo selected item. 3 slot cố định trái/giữa/phải:
     *   - Use / Equip (Trang bị, Tháo) → slot left
     *   - View (Xem / Đóng) → slot center, luôn hiển thị khi có item chọn
     *   - Drop → slot right
     * Slot empty thì bỏ qua (vd material chỉ có View center + Drop right).
     * Array order luôn left → center → right để keyboard nav ←/→ chạy tự nhiên.
     */
    private renderActionBar(): void {
        if (!this.actionBarEl) return;
        this.actionBarEl.innerHTML = '';
        this.actionButtons = [];

        const item = this.findSelectedItem();
        const blockReason =
            this.loading
            || this.errorMessage !== null
            || this.currentPage !== DATA_PAGE
            || !item;
        if (blockReason) {
            // Không còn button khả dụng → focus zone='actions' (nếu đang ở đó)
            // không còn nghĩa lý → trượt về grid để Enter có target.
            if (this.focusZone === 'actions') this.focusZone = 'grid';
            return;
        }

        const actions = this.collectActions(item);
        if (actions.length === 0) {
            if (this.focusZone === 'actions') this.focusZone = 'grid';
            return;
        }

        // Clamp focusedAction về biên mới (số action có thể giảm khi đổi item).
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
            // View button không bị disabled bởi actionInFlight — chỉ Use/Equip/
            // Drop block UI khi pending. Xem là read-only, an toàn lúc nào cũng
            // bấm được.
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

    /** Tập hợp action khả dụng cho item — array order = left → center → right. */
    private collectActions(item: InventoryItem): ActionDef[] {
        const list: ActionDef[] = [];

        // Slot left — Use hoặc Equip (không co-occur). Bound consumable vẫn được
        // Use? BE quyết định; FE assume consumable bound vẫn dùng được.
        if (item.type === 'consumable') {
            list.push({
                key: 'use',
                slot: 'left',
                label: t('inventory.btn_use'),
                palette: 'border:2px solid #4a7a3a;background:#2a4a1a;color:#bdf0a0;',
                onClick: () => void this.handleUse(),
            });
        } else {
            const isEquippable = item.type === 'equipment'
                && item.subType !== null
                && SUBTYPE_TO_SLOT[item.subType] !== undefined;
            if (isEquippable) {
                list.push({
                    key: 'equip',
                    slot: 'left',
                    label: item.isEquipped ? t('inventory.btn_unequip') : t('inventory.btn_equip'),
                    palette: 'border:2px solid #7a6a2a;background:#3a3014;color:#ffd070;',
                    onClick: () => void this.handleEquipToggle(),
                });
            }
        }

        // Slot center — View (Xem) luôn hiện khi có item. Toggle thành Đóng
        // khi sub-modal detail đang mở.
        list.push({
            key: 'view',
            slot: 'center',
            label: this.detailOpen ? t('inventory.btn_close_detail') : t('inventory.btn_view'),
            palette: 'border:2px solid #3a5a7a;background:#1a2a3a;color:#a0c8e0;',
            onClick: () => this.toggleDetailModal(),
        });

        // Slot right — Drop. Yêu cầu: không khoá + không đang equip (BE reject
        // equipped items).
        if (!item.isBound && !item.isEquipped) {
            list.push({
                key: 'drop',
                slot: 'right',
                label: t('inventory.btn_drop'),
                palette: 'border:2px solid #7a3a3a;background:#4a1a1a;color:#f0a0a0;',
                onClick: () => void this.handleDrop(),
            });
        }

        return list;
    }

    /** Toggle sub-modal Xem chi tiết. Nút Xem ↔ Đóng tự rerender qua
     * renderActionBar (label phụ thuộc detailOpen). */
    private toggleDetailModal(): void {
        if (this.detailOpen) {
            this.closeDetailModal();
        } else {
            this.openDetailModal();
        }
    }

    private openDetailModal(): void {
        if (this.detailOpen) return;
        const item = this.findSelectedItem();
        if (!item) return;
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
        // Chỉ rerender bar khi shell còn (đóng cleanup từ teardownShell sẽ
        // chạy sau khi shell.body bị unmount → tránh re-render vô ích).
        if (this.actionBarEl) this.renderActionBar();
    }

    private ensureDetailModalDOM(): void {
        if (this.detailOverlayEl) return;
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        const overlay = document.createElement('div');
        overlay.classList.add('kageverse-overlay-inventory-detail');
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

        // Share zoom với panel inventory → sub-modal cũng shrink theo viewport.
        this.shell?.applyZoomTo(panel);
    }

    private renderDetailModalContent(): void {
        if (!this.detailPanelEl) return;
        const item = this.findSelectedItem();
        if (!item) {
            // Item bị clear khi user click ô trống / đổi page — đóng sub-modal.
            this.closeDetailModal();
            return;
        }
        // Layout dọc — mỗi field 1 dòng, text dài tự wrap (word-break để
        // tên item / description không vỡ panel khi quá dài).
        const wrap = 'word-break:break-word;white-space:normal;';
        const upgradeRow = item.upgradeLevel > 0
            ? `<div style="color:${MODAL_COLORS.title};font-size:13px;font-weight:bold;${wrap}">+${item.upgradeLevel}</div>`
            : '';
        const lockRow = item.isBound
            ? `<div style="color:${MODAL_COLORS.statusError};font-size:12px;${wrap}">${escapeHtml(t('inventory.bound_badge'))}</div>`
            : '';
        this.detailPanelEl.innerHTML = [
            `<div style="display:flex;flex-direction:column;gap:6px;">`,
            `  <div style="font-size:15px;font-weight:bold;color:${MODAL_COLORS.title};${wrap}">${escapeHtml(item.name)}</div>`,
            upgradeRow,
            `  <div style="font-size:12px;color:${TYPE_BORDER[item.type]};${wrap}">[${escapeHtml(t(TYPE_KEY[item.type]))}]</div>`,
            lockRow,
            `  <div style="margin-top:4px;color:${MODAL_COLORS.text};${wrap}">${escapeHtml(item.description)}</div>`,
            `  <div style="margin-top:4px;color:#aaa;font-size:11px;${wrap}">${escapeHtml(t('inventory.amount_label', { amount: item.amount, max: item.maxStack }))}</div>`,
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
            return;
        }

        this.loading = true;
        this.errorMessage = null;
        this.renderDetail();

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
            const selBorder = isSelected ? (gridFocused ? MODAL_COLORS.borderAccent : '#ffd070') : borderColor;
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
                        ? `<div style="position:absolute;left:2px;top:0;font-size:10px;font-weight:bold;color:${MODAL_COLORS.title};text-shadow:0 0 3px #000,1px 1px 0 #000;">+${item.upgradeLevel}</div>`
                        : '',
                    item.isBound
                        ? `<div style="position:absolute;right:2px;top:0;font-size:9px;color:${MODAL_COLORS.statusError};text-shadow:0 0 3px #000;">🔒</div>`
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

    /**
     * Re-sync UI dựa trên state hiện tại: action bar + sub-modal Xem (nếu mở).
     * Tên cũ là renderDetail (render inline detail panel); panel đã move sang
     * sub-modal nên giờ chỉ điều phối 2 surface bên ngoài body modal.
     */
    private renderDetail(): void {
        this.renderActionBar();
        if (this.detailOpen) this.renderDetailModalContent();
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
            const unlocked = this.isPageUnlocked(p);
            const label = t('inventory.tab_page', { n: p });
            Object.assign(tab.style, {
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: unlocked ? 'pointer' : 'not-allowed',
                color: unlocked
                    ? (active ? MODAL_COLORS.title : MODAL_COLORS.text)
                    : '#6a5a48',
                background: unlocked
                    ? (active ? '#6b3a14' : 'rgba(45,26,10,0.5)')
                    : 'rgba(20,12,4,0.6)',
                border: `2px solid ${active && unlocked ? MODAL_COLORS.borderAccent : MODAL_COLORS.divider}`,
                borderBottom: 'none',
                borderTopLeftRadius: '6px',
                borderTopRightRadius: '6px',
                userSelect: 'none',
                opacity: unlocked ? '1' : '0.55',
                // Glow khi tabs đang là focus zone — phân biệt với "active tab
                // chỉ nhờ mở sẵn page này".
                boxShadow: active && tabsFocused && unlocked ? '0 -2px 10px rgba(255,234,122,0.7)' : 'none',
            });
            tab.textContent = unlocked ? label : `🔒 ${label}`;
            if (unlocked) {
                tab.addEventListener('click', () => this.setPage(p));
            }
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
        // Trang locked không cho mở — guard cả click + keyboard nav (defense in
        // depth). Caller (renderTabs / navTabs / gotoPageKeepRow) cũng đã filter
        // trước, nhưng setPage là single source of truth.
        if (!this.isPageUnlocked(page)) return;
        this.currentPage = page;
        this.selectedSlot = null;
        this.renderTabs();
        this.renderGrid();
        this.renderDetail();
    }

    /** Trang 1 (DATA_PAGE) là duy nhất hợp lệ với BE hiện tại; trang 2-4 là
     * placeholder cho túi mở rộng tương lai → chưa mở khoá, không click được. */
    private isPageUnlocked(page: number): boolean {
        return page === DATA_PAGE;
    }

    /** Tìm trang mở khoá kế tiếp theo step (+1 / -1). Null = không còn page
     * unlocked nào theo hướng đó (vd đã ở trang 1 mà ấn ←). */
    private findNextUnlockedPage(from: number, step: 1 | -1): number | null {
        for (let p = from + step; p >= 1 && p <= PAGES_COUNT; p += step) {
            if (this.isPageUnlocked(p)) return p;
        }
        return null;
    }

    private async handleUse(): Promise<void> {
        const item = this.findSelectedItem();
        if (!item || item.type !== 'consumable' || this.actionInFlight) return;
        const character = getCurrentCharacter();
        if (!character) return;

        this.actionInFlight = true;
        this.renderActionBar();
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
        this.renderActionBar();
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
        this.renderActionBar();
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
