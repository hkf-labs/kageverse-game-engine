import * as Phaser from 'phaser';
import type { GameComponent } from './types';

/**
 * ActiveBuff = entry trong panel buff. Slot được phân biệt bằng `key` (vd 'food',
 * 'exp_boost', 'atk_boost') — set lại cùng key sẽ thay thế (NSO override semantic).
 */
export type ActiveBuff = {
    key: string;
    expiresAt: Date;
    icon: string;
    label?: string;
};

/** Map từ ID template hoặc category sang emoji fallback. Khi có sprite riêng → swap. */
const TEMPLATE_PREFIX_ICON: Array<{ prefix: string; icon: string }> = [
    { prefix: 'food_buff', icon: '🍜' },
    { prefix: 'exp_boost', icon: '📈' },
    { prefix: 'atk_boost', icon: '⚔️' },
    { prefix: 'def_boost', icon: '🛡️' },
];

export function iconForTemplate(itemTemplateID: string): string {
    for (const m of TEMPLATE_PREFIX_ICON) {
        if (itemTemplateID.startsWith(m.prefix)) return m.icon;
    }
    return '✨';
}

/** Map item template prefix → buff slot key chuẩn (1 category = 1 slot, override nhau). */
export function categoryForTemplate(itemTemplateID: string): string {
    for (const m of TEMPLATE_PREFIX_ICON) {
        if (itemTemplateID.startsWith(m.prefix)) return m.prefix;
    }
    return 'misc';
}

const ANCHOR_X = 22;
const ANCHOR_Y = 110;
const ICON_SIZE = 36;
const SLOT_GAP = 10;
const MAX_SLOTS = 6;

/**
 * Panel buff icon + countdown ở góc trên-trái (dưới HUD).
 * - Multi-slot pool (tới MAX_SLOTS) — mỗi buff key 1 slot.
 * - Refresh per-frame: countdown text + auto-remove khi hết hạn.
 * - Reflow tự động khi 1 buff biến mất giữa list.
 */
export class BuffIndicator implements GameComponent {
    private scene: Phaser.Scene;
    private container?: Phaser.GameObjects.Container;
    private slots: SlotView[] = [];
    private buffs: ActiveBuff[] = []; // ordered by insertion / oldest first
    private lastSecondShown = new Map<string, number>();
    private onLayoutChanged?: () => void;

    constructor(scene: Phaser.Scene, opts?: { onLayoutChanged?: () => void }) {
        this.scene = scene;
        this.onLayoutChanged = opts?.onLayoutChanged;
    }

    /** True khi đang có ít nhất 1 buff active. Auto-prune đã chạy trong update(). */
    hasBuffs(): boolean { return this.buffs.length > 0; }

    create(): void {
        this.container = this.scene.add.container(ANCHOR_X, ANCHOR_Y).setScrollFactor(0).setDepth(100);

        for (let i = 0; i < MAX_SLOTS; i++) {
            const slot = this.buildSlot(i);
            slot.container.setVisible(false);
            this.container.add(slot.container);
            this.slots.push(slot);
        }
    }

    destroy(): void {
        this.container?.destroy();
        this.container = undefined;
        this.slots = [];
        this.buffs = [];
        this.lastSecondShown.clear();
    }

    /**
     * Upsert buff theo key. Nếu đã có cùng key → thay thế (vd ăn món mới override món cũ).
     * Buff mới luôn append cuối — nếu có sẵn, giữ vị trí cũ.
     */
    setBuff(buff: ActiveBuff): void {
        const idx = this.buffs.findIndex((b) => b.key === buff.key);
        if (idx >= 0) {
            this.buffs[idx] = buff;
        } else {
            if (this.buffs.length >= MAX_SLOTS) {
                // Đầy slot → bỏ buff cũ nhất.
                const removed = this.buffs.shift();
                if (removed) this.lastSecondShown.delete(removed.key);
            }
            this.buffs.push(buff);
        }
        this.lastSecondShown.delete(buff.key);
        this.layout();
    }

    /** Xoá 1 buff theo key. No-op nếu không có. */
    removeBuff(key: string): void {
        const before = this.buffs.length;
        this.buffs = this.buffs.filter((b) => b.key !== key);
        this.lastSecondShown.delete(key);
        if (this.buffs.length !== before) this.layout();
    }

    clearAll(): void {
        this.buffs = [];
        this.lastSecondShown.clear();
        this.layout();
    }

    /** Gọi mỗi frame — refresh countdown + auto-prune buff hết hạn. */
    update(): void {
        if (this.buffs.length === 0) return;
        const now = Date.now();
        let pruned = false;
        for (const b of this.buffs) {
            if (b.expiresAt.getTime() <= now) {
                pruned = true;
            }
        }
        if (pruned) {
            this.buffs = this.buffs.filter((b) => b.expiresAt.getTime() > now);
            this.layout();
            return;
        }
        // Chỉ refresh text, không layout lại.
        this.refreshTexts(now);
    }

    private layout(): void {
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const buff = this.buffs[i];
            if (!buff) {
                slot.container.setVisible(false);
                continue;
            }
            slot.container.setPosition(i * (ICON_SIZE + SLOT_GAP), 0);
            slot.iconText.setText(buff.icon);
            slot.container.setVisible(true);
        }
        this.refreshTexts(Date.now());
        this.onLayoutChanged?.();
    }

    private refreshTexts(now: number): void {
        for (let i = 0; i < this.buffs.length; i++) {
            const buff = this.buffs[i];
            const slot = this.slots[i];
            if (!slot) continue;
            const remainingSec = Math.max(0, Math.floor((buff.expiresAt.getTime() - now) / 1000));
            const last = this.lastSecondShown.get(buff.key);
            if (last === remainingSec) continue;
            this.lastSecondShown.set(buff.key, remainingSec);
            slot.countdownText.setText(formatCountdown(remainingSec));
        }
    }

    private buildSlot(_index: number): SlotView {
        const c = this.scene.add.container(0, 0);
        const bg = this.scene.add.graphics();
        bg.fillStyle(0x2a1808, 0.85);
        bg.fillRoundedRect(0, 0, ICON_SIZE, ICON_SIZE, 6);
        bg.lineStyle(2, 0xe29e4a, 1);
        bg.strokeRoundedRect(0, 0, ICON_SIZE, ICON_SIZE, 6);

        const iconText = this.scene.add.text(ICON_SIZE / 2, ICON_SIZE / 2, '✨', {
            fontSize: '22px',
            fontFamily: 'system-ui, sans-serif',
        }).setOrigin(0.5);

        const countdownText = this.scene.add.text(ICON_SIZE / 2, ICON_SIZE + 4, '', {
            fontSize: '11px',
            color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 3,
            fontStyle: 'bold',
        }).setOrigin(0.5, 0);

        c.add([bg, iconText, countdownText]);
        return { container: c, bg, iconText, countdownText };
    }
}

interface SlotView {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Graphics;
    iconText: Phaser.GameObjects.Text;
    countdownText: Phaser.GameObjects.Text;
}

/** Format giây thành chuỗi compact: < 1h hiện "MM:SS", >= 1h hiện "HhMM". */
function formatCountdown(sec: number): string {
    if (sec >= 3600) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return `${h}h${m.toString().padStart(2, '0')}`;
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
