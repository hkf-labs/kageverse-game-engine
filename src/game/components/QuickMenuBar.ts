import * as Phaser from 'phaser';
import { t } from '../../i18n';
import type { GameComponent } from './types';

/**
 * Quick menu bar (FEAT-UI-002) — hàng icon chức năng thường trực bên trái
 * minimap, thay cây menu F1 main/self cũ. Canvas Phaser (scrollFactor 0) như
 * Minimap/SkillHotbar: nằm dưới modal HTML và bị camera minimap ignore.
 *
 * Bar không bắt keyboard — F1/btn_menu toggle collapse từ BaseMapScene.
 */
export interface QuickMenuBarItem {
    key: string;
    /** Emoji icon (chưa có sprite asset riêng). */
    icon: string;
    /** i18n key cho tooltip — resolve lúc hover để ăn theo locale hiện tại. */
    labelKey: string;
    action: () => void;
}

export interface QuickMenuBarOptions {
    /** Anchor = Minimap.getPosition() — bar tự bám khi resize. */
    getAnchor: () => { x: number; y: number; width: number; height: number };
    items: QuickMenuBarItem[];
}

const BTN = 36;
const GAP = 6;
const RADIUS = 8;
const MARGIN_TO_MINIMAP = 12;
const BG_DEPTH = 200;
const ICON_DEPTH = 201;
const HIT_DEPTH = 202;
const TOOLTIP_DEPTH = 203;
const STORAGE_KEY = 'kageverse_quickmenu_collapsed';

interface ButtonView {
    bg: Phaser.GameObjects.Graphics;
    icon: Phaser.GameObjects.Text;
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
    private tooltip?: Phaser.GameObjects.Text;
    private collapsed: boolean;
    private enabled = true;
    private visible = true;

    constructor(scene: Phaser.Scene, opts: QuickMenuBarOptions) {
        this.scene = scene;
        this.opts = opts;
        this.collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    }

    create(): void {
        // Tooltip tạo trước (ẩn) — mọi object phải tồn tại trước khi
        // Minimap.ignoreUIElements() chạy, tạo lúc hover sẽ lọt vào minimap.
        this.tooltip = this.scene.add.text(0, 0, '', {
            fontSize: '12px', fontStyle: 'bold', color: '#ffe4c4',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
            backgroundColor: '#3e2723', padding: { left: 8, right: 8, top: 3, bottom: 3 },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(TOOLTIP_DEPTH).setVisible(false);

        this.opts.items.forEach((item) => {
            const view = this.makeButton(item.icon, () => item.action(), () => t(item.labelKey));
            this.itemViews.push(view);
        });
        this.toggleView = this.makeButton(
            this.collapsed ? '☰' : '«',
            () => this.toggleCollapsed(),
            () => t(this.collapsed ? 'menu.bar_expand' : 'menu.bar_collapse'),
        );

        this.layout();
        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        });
    }

    private makeButton(icon: string, onClick: () => void, getLabel: () => string): ButtonView {
        const bg = this.scene.add.graphics().setScrollFactor(0).setDepth(BG_DEPTH);
        const iconTxt = this.scene.add.text(0, 0, icon, {
            fontSize: '18px', fontFamily: 'system-ui, sans-serif',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(ICON_DEPTH);
        const hit = this.scene.add.rectangle(0, 0, BTN, BTN, 0x000000, 0.001)
            .setScrollFactor(0).setDepth(HIT_DEPTH)
            .setInteractive({ useHandCursor: true });

        const view: ButtonView = { bg, icon: iconTxt, hit, hovered: false, x: 0, y: 0 };
        hit.on('pointerover', () => {
            if (!this.enabled) return;
            view.hovered = true;
            this.drawButton(view);
            this.showTooltip(view, getLabel());
        });
        hit.on('pointerout', () => {
            view.hovered = false;
            view.icon.setScale(1);
            this.drawButton(view);
            this.tooltip?.setVisible(false);
        });
        hit.on('pointerdown', () => {
            if (!this.enabled || !this.visible) return;
            view.icon.setScale(0.9);
        });
        hit.on('pointerup', () => {
            if (!this.enabled || !this.visible) return;
            view.icon.setScale(1);
            this.tooltip?.setVisible(false);
            onClick();
        });
        return view;
    }

    private showTooltip(view: ButtonView, label: string): void {
        if (!this.tooltip) return;
        this.tooltip.setText(label);
        // Tooltip phía trên nút — phía dưới đụng cụm nút chat/menu của minimap.
        this.tooltip.setPosition(view.x, view.y - BTN / 2 - 16).setVisible(true);
    }

    private drawButton(view: ButtonView): void {
        const g = view.bg;
        g.clear();
        g.fillStyle(0x000000, 0.4);
        g.fillRoundedRect(view.x - BTN / 2 + 2, view.y - BTN / 2 + 3, BTN, BTN, RADIUS);
        g.fillStyle(view.hovered ? 0x6b3a14 : 0x3e2723, 0.95);
        g.fillRoundedRect(view.x - BTN / 2, view.y - BTN / 2, BTN, BTN, RADIUS);
        g.lineStyle(2, view.hovered ? 0xffea7a : 0xe29e4a, 1);
        g.strokeRoundedRect(view.x - BTN / 2, view.y - BTN / 2, BTN, BTN, RADIUS);
    }

    /** Re-anchor theo minimap — gọi khi resize và khi đổi collapsed. Bar
     * bottom-aligned với khung minimap để không đè tên map ở top-center. */
    private layout = (): void => {
        const anchor = this.opts.getAnchor();
        const cy = anchor.y + anchor.height - BTN / 2 + 4;
        let cx = anchor.x - MARGIN_TO_MINIMAP - BTN / 2;

        if (this.toggleView) {
            this.placeButton(this.toggleView, cx, cy);
            cx -= BTN + GAP;
        }
        // Items xếp từ toggle lan sang trái, giữ thứ tự khai báo trái→phải.
        for (let i = this.itemViews.length - 1; i >= 0; i--) {
            this.placeButton(this.itemViews[i], cx, cy);
            cx -= BTN + GAP;
        }
        this.applyVisibility();
    };

    private placeButton(view: ButtonView, x: number, y: number): void {
        view.x = x;
        view.y = y;
        view.icon.setPosition(x, y);
        view.hit.setPosition(x, y);
        this.drawButton(view);
    }

    private applyVisibility(): void {
        const showItems = this.visible && !this.collapsed;
        this.itemViews.forEach((v) => {
            v.bg.setVisible(showItems);
            v.icon.setVisible(showItems);
            v.hit.setVisible(showItems);
            if (showItems) v.hit.setInteractive({ useHandCursor: true });
            else v.hit.disableInteractive();
        });
        if (this.toggleView) {
            this.toggleView.bg.setVisible(this.visible);
            this.toggleView.icon.setVisible(this.visible);
            this.toggleView.hit.setVisible(this.visible);
        }
        if (!this.visible || this.collapsed) this.tooltip?.setVisible(false);
    }

    toggleCollapsed(): void {
        this.collapsed = !this.collapsed;
        if (this.collapsed) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
        this.toggleView?.icon.setText(this.collapsed ? '☰' : '«');
        this.tooltip?.setVisible(false);
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
            v.hovered = false;
            v.icon.setScale(1);
            this.drawButton(v);
        });
        if (!enabled) this.tooltip?.setVisible(false);
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        this.applyVisibility();
    }

    destroy(): void {
        this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        [...this.itemViews, ...(this.toggleView ? [this.toggleView] : [])].forEach((v) => {
            v.bg.destroy(); v.icon.destroy(); v.hit.destroy();
        });
        this.itemViews = [];
        this.toggleView = undefined;
        this.tooltip?.destroy();
        this.tooltip = undefined;
    }
}
