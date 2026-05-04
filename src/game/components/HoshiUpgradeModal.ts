import * as Phaser from 'phaser';
import {
    charactersAPI,
    equipmentUpgradeAPI,
    inventoryAPI,
    type EnchantStatBonus,
    type InventoryItemDTO,
} from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';

// MVP Hoshi cường hoá. Q13 yêu cầu cường hoá 3 category (weapon/jewelry/apparel)
// nên modal MVP focus path Upgrade — Extract defer.
//
// Cost table mirror BE (equipmentupgrade/domain/upgrade.go costPerLevel). Cap
// theo character level: <20 = +4, 20-29 = +8.
//
// Stone item: material_upgrade_stone_lv1 (Mảnh Đá Cường Hoá +1).

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

const CATEGORY_LABEL: Record<Category, string> = {
    weapon: 'Vũ Khí',
    jewelry: 'Phụ Kiện',
    apparel: 'Áo Giáp',
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

export class HoshiUpgradeModal implements GameComponent {
    private overlay?: HTMLDivElement;
    private listEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private currencyEl?: HTMLDivElement;
    private scene: Phaser.Scene;
    private visible = false;
    private items: InventoryItemDTO[] = [];
    private stonesAvailable = 0;
    private yenAvailable = 0;
    private characterLevel = 1;
    private selectedItemId: string | null = null;
    private actionInFlight = false;
    private onUpgraded?: () => void;

    constructor(scene: Phaser.Scene, callbacks?: { onUpgraded?: () => void }) {
        this.scene = scene;
        this.onUpgraded = callbacks?.onUpgraded;
    }

    create(): void {
        this.buildOverlay();
    }

    isOpen(): boolean { return this.visible; }

    open(): void {
        if (this.visible) return;
        this.visible = true;
        if (this.overlay) this.overlay.style.display = 'flex';
        this.scene.input.keyboard?.disableGlobalCapture();
        void this.refresh();
    }

    close(): void {
        if (!this.visible) return;
        this.visible = false;
        if (this.overlay) this.overlay.style.display = 'none';
        this.scene.input.keyboard?.enableGlobalCapture();
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    /** Refresh list items + currency. Gọi sau open + sau mỗi upgrade thành công. */
    private async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.setStatus('Chưa có nhân vật.', '#ff8a8a');
            return;
        }
        this.setStatus('Đang tải...', '#aaa');
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
            this.setStatus('', '#fff');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Lỗi tải dữ liệu';
            this.setStatus(msg, '#ff8a8a');
        }
    }

    private buildOverlay(): void {
        const overlay = document.createElement('div');
        overlay.classList.add('kageverse-overlay', 'kageverse-overlay-hoshi-upgrade');
        overlay.style.cssText = `
            position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.55); z-index: 200;
            font-family: system-ui, sans-serif; color: #ffffff;
        `;
        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(720px, 92vw); max-height: 80vh; display: flex; flex-direction: column;
            background: linear-gradient(180deg, rgba(28,32,40,0.98), rgba(18,22,28,0.98));
            border: 2px solid #ffea7a; border-radius: 8px;
            padding: 16px; gap: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.6);
        `;

        const header = document.createElement('div');
        header.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;
        const title = document.createElement('div');
        title.textContent = '⚒️ Tinh Luyện Sư Hoshi — Cường Hoá Trang Bị';
        title.style.cssText = `font-size: 16px; font-weight: 700; color: #ffea7a;`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Đóng (ESC)';
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);
            color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
        `;
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(title);
        header.appendChild(closeBtn);

        const currency = document.createElement('div');
        currency.style.cssText = `
            display: flex; gap: 16px; padding: 6px 10px;
            background: rgba(0,0,0,0.3); border-radius: 4px; font-size: 12px;
        `;
        this.currencyEl = currency;

        const body = document.createElement('div');
        body.style.cssText = `display: flex; gap: 12px; flex: 1; min-height: 0;`;

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
            font-size: 12px; line-height: 1.5;
        `;
        this.detailEl = detail;

        body.appendChild(list);
        body.appendChild(detail);

        const status = document.createElement('div');
        status.style.cssText = `font-size: 12px; min-height: 16px;`;
        this.statusEl = status;

        panel.appendChild(header);
        panel.appendChild(currency);
        panel.appendChild(body);
        panel.appendChild(status);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // ESC to close.
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
        // Click bên ngoài panel cũng close.
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });
    }

    private renderCurrency(): void {
        if (!this.currencyEl) return;
        this.currencyEl.innerHTML =
            `<span>🪨 Đá: <b style="color:#bdf0a0;">${this.stonesAvailable}</b></span>`
            + `<span>💰 Yên: <b style="color:#ffea7a;">${this.yenAvailable.toLocaleString('vi')}</b></span>`
            + `<span>Cấp NV: <b>${this.characterLevel}</b> (cap +${capForLevel(this.characterLevel)})</span>`;
    }

    private renderList(): void {
        if (!this.listEl) return;
        if (this.items.length === 0) {
            this.listEl.innerHTML = `<div style="color:#aaa;text-align:center;padding:20px;">Không có trang bị nào để cường hoá.</div>`;
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
        for (const item of sorted) {
            const row = document.createElement('div');
            const isSelected = this.selectedItemId === item.id;
            row.style.cssText = `
                padding: 6px 8px; border-radius: 4px; cursor: pointer;
                background: ${isSelected ? 'rgba(255,234,122,0.2)' : 'rgba(255,255,255,0.04)'};
                border: 1px solid ${isSelected ? '#ffea7a' : 'transparent'};
                display: flex; justify-content: space-between; align-items: center; gap: 6px;
            `;
            const equippedTag = item.is_equipped
                ? `<span style="color:#bdf0a0;font-size:10px;">[đang đeo]</span>`
                : '';
            const cat = item.upgrade_category ? CATEGORY_LABEL[item.upgrade_category] : '?';
            row.innerHTML = `
                <span>${escapeHtml(displayName(item))} <b style="color:#ffea7a;">+${item.upgrade_level}</b> ${equippedTag}</span>
                <span style="color:#aaa;font-size:11px;">${cat}</span>
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
            this.detailEl.innerHTML = `<div style="color:#aaa;">Chọn trang bị bên trái để xem chi tiết.</div>`;
            return;
        }
        const item = this.items.find((i) => i.id === this.selectedItemId);
        if (!item || !item.upgrade_category) {
            this.detailEl.innerHTML = `<div style="color:#ff8a8a;">Không tìm thấy item.</div>`;
            return;
        }
        const category = item.upgrade_category;
        const cap = capForLevel(this.characterLevel);
        const cur = item.upgrade_level;
        const next = cur + 1;
        const atCap = cur >= cap;

        let costBlock = '';
        let confirmBtnHtml = '';
        if (atCap) {
            costBlock = `<div style="color:#ffea7a;">Đã đạt cap +${cap} ở cấp NV ${this.characterLevel}.</div>`;
        } else {
            const cost = nextCost(category, cur);
            if (!cost) {
                costBlock = `<div style="color:#ff8a8a;">Hết bảng cost (lỗi data).</div>`;
            } else {
                const lacksStones = this.stonesAvailable < cost.stones;
                const lacksYen = this.yenAvailable < cost.yen;
                const enough = !lacksStones && !lacksYen;
                const curBonus = bonusForLevel(category, item.equipped_slot, cur);
                const nextBonus = bonusForLevel(category, item.equipped_slot, next);
                const deltaLine = formatBonusDelta(curBonus, nextBonus);
                costBlock = `
                    <div style="margin-top:8px;"><b>Cost +${next}</b></div>
                    <div style="color:${lacksStones ? '#ff8a8a' : '#bdf0a0'};">🪨 ${cost.stones} đá ${lacksStones ? '(thiếu)' : ''}</div>
                    <div style="color:${lacksYen ? '#ff8a8a' : '#ffea7a'};">💰 ${cost.yen.toLocaleString('vi')} yên ${lacksYen ? '(thiếu)' : ''}</div>
                    <div style="margin-top:6px;color:#9affb4;">Bonus mới: ${deltaLine || '(item chưa đeo — không bonus)'}</div>
                `;
                confirmBtnHtml = `
                    <button id="hoshi-upgrade-confirm" style="
                        margin-top: 10px; padding: 8px 16px;
                        background: ${enough ? '#ffea7a' : '#555'};
                        color: ${enough ? '#000' : '#aaa'};
                        border: none; border-radius: 4px; cursor: ${enough ? 'pointer' : 'not-allowed'};
                        font-weight: 600; font-size: 13px;
                    " ${enough ? '' : 'disabled'}>
                        Cường hoá +${cur} → +${next}
                    </button>
                `;
            }
        }

        const equippedNote = item.is_equipped
            ? ''
            : `<div style="color:#aaa;font-size:11px;margin-top:4px;">⚠ Chưa đeo — bonus chỉ áp dụng sau khi equip.</div>`;

        this.detailEl.innerHTML = `
            <div style="font-weight:600;color:#ffea7a;">${escapeHtml(displayName(item))} +${cur}</div>
            <div style="color:#aaa;font-size:11px;">Loại: ${CATEGORY_LABEL[category]} | Slot: ${item.equipped_slot ?? '(chưa đeo)'}</div>
            ${equippedNote}
            ${costBlock}
            ${confirmBtnHtml}
        `;

        const btn = this.detailEl.querySelector<HTMLButtonElement>('#hoshi-upgrade-confirm');
        if (btn) {
            btn.addEventListener('click', () => void this.handleUpgrade());
        }
    }

    private async handleUpgrade(): Promise<void> {
        if (this.actionInFlight || !this.selectedItemId) return;
        const character = getCurrentCharacter();
        if (!character) return;
        this.actionInFlight = true;
        this.setStatus('Đang cường hoá...', '#aaa');
        try {
            const res = await equipmentUpgradeAPI.upgrade(character.id, this.selectedItemId);
            this.setStatus(
                `Cường hoá thành công +${res.old_enchant_level} → +${res.new_enchant_level}!`,
                '#bdf0a0',
            );
            this.onUpgraded?.();
            await this.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Cường hoá thất bại';
            this.setStatus(msg, '#ff8a8a');
        } finally {
            this.actionInFlight = false;
        }
    }

    private setStatus(text: string, color: string): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.style.color = color;
    }
}

function displayName(item: InventoryItemDTO): string {
    // MVP: name_key fallback to template_id. Khi có i18n module sẽ lookup VN.
    return item.name_key || item.item_template_id;
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
