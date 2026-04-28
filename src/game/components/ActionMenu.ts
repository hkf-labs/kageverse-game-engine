import * as Phaser from 'phaser';
import type { GameComponent } from './types';

export interface ActionMenuItem {
    key: string;
    label: string;
    icon?: string;
    disabled?: boolean;
    action: () => void;
}

export interface ActionMenuOpenOptions {
    title?: string;
    items: ActionMenuItem[];
    onClose?: () => void;
}

const ITEM_W = 96;
const ITEM_H = 84;
const ITEM_GAP = 10;
const ROW_BOTTOM_OFFSET = 130;
const TITLE_OFFSET = 56;

const OVERLAY_DEPTH = 199;
const ROW_DEPTH = 200;
const ITEM_HIT_DEPTH = 201;
const ITEM_TXT_DEPTH = 202;

interface ItemView {
    bg: Phaser.GameObjects.Graphics;
    hit: Phaser.GameObjects.Rectangle;
    labelTxt: Phaser.GameObjects.Text;
    iconTxt?: Phaser.GameObjects.Text;
    item: ActionMenuItem;
    x: number;
    y: number;
}

export class ActionMenu implements GameComponent {
    private scene: Phaser.Scene;
    private overlay?: Phaser.GameObjects.Rectangle;
    private titleText?: Phaser.GameObjects.Text;
    private itemViews: ItemView[] = [];
    private items: ActionMenuItem[] = [];
    private selectedIndex = 0;
    private opened = false;
    private currentOnClose?: () => void;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;

        this.overlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.001)
            .setScrollFactor(0)
            .setDepth(OVERLAY_DEPTH)
            .setInteractive({ useHandCursor: false })
            .setVisible(false);
        this.overlay.on('pointerdown', () => this.close());
    }

    open(opts: ActionMenuOpenOptions): void {
        if (opts.items.length === 0) return;
        if (this.opened) this.close();

        this.items = opts.items.slice();
        this.selectedIndex = this.firstEnabledIndex();
        this.currentOnClose = opts.onClose;
        this.opened = true;

        this.overlay?.setVisible(true);

        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const rowY = h - ROW_BOTTOM_OFFSET;
        const totalW = this.items.length * ITEM_W + (this.items.length - 1) * ITEM_GAP;
        const startX = w / 2 - totalW / 2 + ITEM_W / 2;

        if (opts.title) {
            this.titleText = this.scene.add.text(w / 2, rowY - TITLE_OFFSET, opts.title, {
                fontSize: '15px', fontStyle: 'bold', color: '#ffea7a',
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 4,
                backgroundColor: '#3e2723', padding: { left: 14, right: 14, top: 6, bottom: 6 },
            }).setOrigin(0.5).setScrollFactor(0).setDepth(ROW_DEPTH);
        }

        this.items.forEach((item, idx) => {
            const x = startX + idx * (ITEM_W + ITEM_GAP);
            const y = rowY;

            const bg = this.scene.add.graphics().setScrollFactor(0).setDepth(ROW_DEPTH);
            const hit = this.scene.add.rectangle(x, y, ITEM_W, ITEM_H, 0x000000, 0.001)
                .setScrollFactor(0).setDepth(ITEM_HIT_DEPTH);

            let iconTxt: Phaser.GameObjects.Text | undefined;
            if (item.icon) {
                iconTxt = this.scene.add.text(x, y - 16, item.icon, {
                    fontSize: '26px', fontFamily: 'system-ui, sans-serif',
                }).setOrigin(0.5).setScrollFactor(0).setDepth(ITEM_TXT_DEPTH);
            }

            const labelTxt = this.scene.add.text(x, y + (item.icon ? 22 : 0), item.label, {
                fontSize: '13px', fontStyle: 'bold', color: '#ffe4c4',
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
                align: 'center', wordWrap: { width: ITEM_W - 8 },
            }).setOrigin(0.5).setScrollFactor(0).setDepth(ITEM_TXT_DEPTH);

            if (!item.disabled) {
                hit.setInteractive({ useHandCursor: true });
                hit.on('pointerdown', () => {
                    this.selectedIndex = idx;
                    this.refresh();
                    this.confirm();
                });
                hit.on('pointerover', () => {
                    this.selectedIndex = idx;
                    this.refresh();
                });
            }

            this.itemViews.push({ bg, hit, labelTxt, iconTxt, item, x, y });
        });

        this.refresh();
    }

    close(): void {
        if (!this.opened) return;
        this.opened = false;

        this.overlay?.setVisible(false);
        this.titleText?.destroy();
        this.titleText = undefined;
        this.itemViews.forEach((v) => {
            v.bg.destroy(); v.hit.destroy();
            v.labelTxt.destroy(); v.iconTxt?.destroy();
        });
        this.itemViews = [];
        this.items = [];

        const cb = this.currentOnClose;
        this.currentOnClose = undefined;
        cb?.();
    }

    isOpen(): boolean { return this.opened; }

    navigate(direction: 'left' | 'right'): void {
        if (!this.opened || this.items.length === 0) return;
        const n = this.items.length;
        let next = this.selectedIndex;
        for (let i = 0; i < n; i++) {
            next = direction === 'left' ? (next - 1 + n) % n : (next + 1) % n;
            if (!this.items[next].disabled) break;
        }
        this.selectedIndex = next;
        this.refresh();
    }

    confirm(): void {
        if (!this.opened) return;
        const item = this.items[this.selectedIndex];
        if (!item || item.disabled) return;
        const action = item.action;
        // Đóng trước, chạy action sau — đảm bảo modal/scene tiếp theo (vd shop, portal)
        // không bị chồng lên action menu vẫn còn render.
        this.close();
        action();
    }

    private firstEnabledIndex(): number {
        const idx = this.items.findIndex((it) => !it.disabled);
        return idx === -1 ? 0 : idx;
    }

    private refresh(): void {
        const RADIUS = 10;
        this.itemViews.forEach((v, idx) => {
            const isSel = idx === this.selectedIndex;
            const g = v.bg;
            g.clear();

            g.fillStyle(0x000000, 0.4);
            g.fillRoundedRect(v.x - ITEM_W / 2 + 2, v.y - ITEM_H / 2 + 4, ITEM_W, ITEM_H, RADIUS);

            const fill = v.item.disabled ? 0x2a1808 : (isSel ? 0x6b3a14 : 0x3e2723);
            const stroke = v.item.disabled ? 0x6b4a3a : (isSel ? 0xffea7a : 0xe29e4a);
            g.fillStyle(fill, 0.95);
            g.fillRoundedRect(v.x - ITEM_W / 2, v.y - ITEM_H / 2, ITEM_W, ITEM_H, RADIUS);
            g.lineStyle(isSel ? 3 : 2, stroke, 1);
            g.strokeRoundedRect(v.x - ITEM_W / 2, v.y - ITEM_H / 2, ITEM_W, ITEM_H, RADIUS);

            v.labelTxt.setColor(v.item.disabled ? '#888' : (isSel ? '#ffea7a' : '#ffe4c4'));
            if (v.iconTxt) v.iconTxt.setAlpha(v.item.disabled ? 0.4 : 1);
        });
    }
}
