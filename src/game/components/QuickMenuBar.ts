import * as Phaser from 'phaser';
import { onLocaleChange, t } from '../../i18n';
import type { GameComponent } from './types';

/**
 * Quick menu bar (FEAT-UI-002) — hàng nút chức năng thường trực bên trái
 * minimap, thay cây menu F1 main/self cũ. Canvas Phaser (scrollFactor 0) như
 * Minimap/SkillHotbar: nằm dưới modal HTML và bị camera minimap ignore.
 *
 * Mỗi nút hiển thị icon + tên chức năng (label) ngay bên dưới — tên ăn theo
 * locale hiện tại và tự cập nhật khi đổi ngôn ngữ.
 *
 * Bar không bắt keyboard — F1 toggle collapse từ BaseMapScene.
 */
export interface QuickMenuBarItem {
    key: string;
    /** Emoji icon (chưa có sprite asset riêng). */
    icon: string;
    /** i18n key cho tên chức năng — resolve theo locale hiện tại. */
    labelKey: string;
    action: () => void;
}

export interface QuickMenuBarOptions {
    /** Anchor = Minimap.getPosition() — bar tự bám khi resize. */
    getAnchor: () => { x: number; y: number; width: number; height: number };
    items: QuickMenuBarItem[];
}

const BTN_W = 54;
const BTN_H = 48;
const GAP = 6;
const RADIUS = 8;
const MARGIN_TO_MINIMAP = 12;
// Tối đa số item mỗi dòng; dư thì xuống dòng dưới.
const ITEMS_PER_ROW = 5;
// Bar bám sát mép trên màn hình.
const TOP_MARGIN = 8;
const BG_DEPTH = 200;
const ICON_DEPTH = 201;
const HIT_DEPTH = 202;
// Icon ngồi nửa trên, tên chức năng nửa dưới của ô nút (nút có label).
const ICON_OFFSET_Y = -9;
const LABEL_OFFSET_Y = 14;
const STORAGE_KEY = 'kageverse_quickmenu_collapsed';

interface ButtonView {
    bg: Phaser.GameObjects.Graphics;
    icon: Phaser.GameObjects.Text;
    /** Nút toggle chỉ có icon — không kèm label. */
    label?: Phaser.GameObjects.Text;
    getLabel?: () => string;
    hit: Phaser.GameObjects.Rectangle;
    hovered: boolean;
    x: number;
    y: number;
}

export class QuickMenuBar implements GameComponent {
    private scene: Phaser.Scene;
    private opts: QuickMenuBarOptions;
    private itemViews: ButtonView[] = [];
    private toggleView?: ButtonView;
    private collapsed: boolean;
    private enabled = true;
    private visible = true;
    private unsubLocale?: () => void;

    constructor(scene: Phaser.Scene, opts: QuickMenuBarOptions) {
        this.scene = scene;
        this.opts = opts;
        this.collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    }

    create(): void {
        this.opts.items.forEach((item) => {
            const view = this.makeButton(item.icon, () => item.action(), () => t(item.labelKey));
            this.itemViews.push(view);
        });
        // Nút toggle: chỉ icon ☰/«, không hiện chữ "Mở menu/Thu gọn menu".
        this.toggleView = this.makeButton(
            this.collapsed ? '☰' : '«',
            () => this.toggleCollapsed(),
        );

        // Tên chức năng theo locale — cập nhật khi người chơi đổi ngôn ngữ.
        this.unsubLocale = onLocaleChange(() => this.syncLabels());

        this.layout();
        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        });
    }

    private makeButton(icon: string, onClick: () => void, getLabel?: () => string): ButtonView {
        const bg = this.scene.add.graphics().setScrollFactor(0).setDepth(BG_DEPTH);
        const iconTxt = this.scene.add.text(0, 0, icon, {
            fontSize: '18px', fontFamily: 'system-ui, sans-serif',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(ICON_DEPTH);
        const label = getLabel
            ? this.scene.add.text(0, 0, getLabel(), {
                fontSize: '9px', fontFamily: 'system-ui, sans-serif', color: '#ffe4c4',
                stroke: '#000', strokeThickness: 2, align: 'center',
            }).setOrigin(0.5).setScrollFactor(0).setDepth(ICON_DEPTH)
            : undefined;
        const hit = this.scene.add.rectangle(0, 0, BTN_W, BTN_H, 0x000000, 0.001)
            .setScrollFactor(0).setDepth(HIT_DEPTH)
            .setInteractive({ useHandCursor: true });

        const view: ButtonView = { bg, icon: iconTxt, label, getLabel, hit, hovered: false, x: 0, y: 0 };
        hit.on('pointerover', () => {
            if (!this.enabled) return;
            view.hovered = true;
            this.drawButton(view);
        });
        hit.on('pointerout', () => {
            view.hovered = false;
            view.icon.setScale(1);
            this.drawButton(view);
        });
        hit.on('pointerdown', () => {
            if (!this.enabled || !this.visible) return;
            view.icon.setScale(0.9);
        });
        hit.on('pointerup', () => {
            if (!this.enabled || !this.visible) return;
            view.icon.setScale(1);
            onClick();
        });
        return view;
    }

    private syncLabels(): void {
        this.itemViews.forEach((v) => v.getLabel && v.label?.setText(v.getLabel()));
    }

    private drawButton(view: ButtonView): void {
        const g = view.bg;
        g.clear();
        g.fillStyle(0x000000, 0.4);
        g.fillRoundedRect(view.x - BTN_W / 2 + 2, view.y - BTN_H / 2 + 3, BTN_W, BTN_H, RADIUS);
        g.fillStyle(view.hovered ? 0x6b3a14 : 0x3e2723, 0.95);
        g.fillRoundedRect(view.x - BTN_W / 2, view.y - BTN_H / 2, BTN_W, BTN_H, RADIUS);
        g.lineStyle(2, view.hovered ? 0xffea7a : 0xe29e4a, 1);
        g.strokeRoundedRect(view.x - BTN_W / 2, view.y - BTN_H / 2, BTN_W, BTN_H, RADIUS);
    }

    /** Grid bám sát mép trên, bên trái minimap. Tối đa ITEMS_PER_ROW nút mỗi
     * dòng, dư thì xuống dòng dưới. Nút toggle cố định ở ô trên-cùng-bên-phải
     * (sát minimap) nên khi thu gọn vẫn nằm đúng chỗ. */
    private layout = (): void => {
        const anchor = this.opts.getAnchor();
        const cols = ITEMS_PER_ROW;
        const cellW = BTN_W + GAP;
        const cellH = BTN_H + GAP;
        // Cột phải nhất nằm sát minimap; cột trái hơn lùi dần sang trái.
        const rightCenterX = anchor.x - MARGIN_TO_MINIMAP - BTN_W / 2;
        const topCenterY = TOP_MARGIN + BTN_H / 2;
        const colX = (c: number): number => rightCenterX - (cols - 1 - c) * cellW;
        const rowY = (r: number): number => topCenterY + r * cellH;

        // Toggle: ô (row 0, cột phải nhất).
        if (this.toggleView) this.placeButton(this.toggleView, colX(cols - 1), rowY(0));

        // Items lấp các ô còn lại theo thứ tự khai báo (trái→phải, trên→xuống),
        // chừa ô của toggle.
        let idx = 0;
        for (let r = 0; idx < this.itemViews.length; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === 0 && c === cols - 1) continue; // ô toggle
                if (idx >= this.itemViews.length) break;
                this.placeButton(this.itemViews[idx], colX(c), rowY(r));
                idx++;
            }
        }
        this.applyVisibility();
    };

    private placeButton(view: ButtonView, x: number, y: number): void {
        view.x = x;
        view.y = y;
        // Nút có label: icon nửa trên + label nửa dưới. Nút chỉ-icon: icon giữa ô.
        view.icon.setPosition(x, y + (view.label ? ICON_OFFSET_Y : 0));
        view.label?.setPosition(x, y + LABEL_OFFSET_Y);
        view.hit.setPosition(x, y);
        this.drawButton(view);
    }

    private applyVisibility(): void {
        const showItems = this.visible && !this.collapsed;
        this.itemViews.forEach((v) => {
            v.bg.setVisible(showItems);
            v.icon.setVisible(showItems);
            v.label?.setVisible(showItems);
            v.hit.setVisible(showItems);
            if (showItems) v.hit.setInteractive({ useHandCursor: true });
            else v.hit.disableInteractive();
        });
        if (this.toggleView) {
            this.toggleView.bg.setVisible(this.visible);
            this.toggleView.icon.setVisible(this.visible);
            this.toggleView.label?.setVisible(this.visible);
            this.toggleView.hit.setVisible(this.visible);
        }
    }

    toggleCollapsed(): void {
        this.collapsed = !this.collapsed;
        if (this.collapsed) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
        this.toggleView?.icon.setText(this.collapsed ? '☰' : '«');
        this.layout();
    }

    isCollapsed(): boolean {
        return this.collapsed;
    }

    /** Dim + khoá click khi modal mở / chết / cinematic. Idempotent — gọi mỗi
     * frame từ update loop của BaseMapScene. */
    setEnabled(enabled: boolean): void {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        const alpha = enabled ? 1 : 0.45;
        [...this.itemViews, ...(this.toggleView ? [this.toggleView] : [])].forEach((v) => {
            v.bg.setAlpha(alpha);
            v.icon.setAlpha(alpha);
            v.label?.setAlpha(alpha);
            v.hovered = false;
            v.icon.setScale(1);
            this.drawButton(v);
        });
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        this.applyVisibility();
    }

    destroy(): void {
        this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.unsubLocale?.();
        this.unsubLocale = undefined;
        [...this.itemViews, ...(this.toggleView ? [this.toggleView] : [])].forEach((v) => {
            v.bg.destroy(); v.icon.destroy(); v.label?.destroy(); v.hit.destroy();
        });
        this.itemViews = [];
        this.toggleView = undefined;
    }
}
