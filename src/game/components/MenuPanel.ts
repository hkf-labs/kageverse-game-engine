import * as Phaser from 'phaser';
import type { GameComponent } from './types';

export interface MenuItem {
    label: string;
    action: () => void;
}

export class MenuPanel implements GameComponent {
    private container?: Phaser.GameObjects.Container;
    private scene: Phaser.Scene;
    private items: MenuItem[];

    constructor(scene: Phaser.Scene, items: MenuItem[]) {
        this.scene = scene;
        this.items = items;
    }

    create(): void {
        const width = this.scene.scale.width;
        const panelW = 220;
        const headerH = 36;
        const itemH = 38;
        const itemGap = 4;
        const panelH = headerH + this.items.length * (itemH + itemGap) + 12;

        const panelX = width - 16 - panelW / 2;
        const panelY = 220 + panelH / 2;

        this.container = this.scene.add.container(panelX, panelY)
            .setScrollFactor(0).setDepth(150).setVisible(false);

        const bg = this.scene.add.graphics();
        bg.fillStyle(0x2a1808, 0.97);
        bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);
        bg.fillStyle(0x4d2d13, 1);
        bg.fillRoundedRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, headerH, 8);
        bg.lineStyle(3, 0xe29e4a, 1);
        bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);

        const headerTxt = this.scene.add.text(0, -panelH / 2 + headerH / 2 + 4, 'MENU', {
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.container.add([bg, headerTxt]);

        this.items.forEach((item, idx) => {
            const itemY = -panelH / 2 + headerH + 8 + idx * (itemH + itemGap) + itemH / 2;
            const itemBg = this.scene.add.rectangle(0, itemY, panelW - 24, itemH, 0x3a2010, 0.9)
                .setStrokeStyle(2, 0x8d6e63)
                .setInteractive({ useHandCursor: true });
            const itemTxt = this.scene.add.text(0, itemY, item.label, {
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#ffe4c4',
                fontFamily: 'system-ui, sans-serif',
            }).setOrigin(0.5);

            itemBg.on('pointerover', () => { itemBg.setFillStyle(0x6b3a14, 0.95); itemTxt.setColor('#ffea7a'); });
            itemBg.on('pointerout', () => { itemBg.setFillStyle(0x3a2010, 0.9); itemTxt.setColor('#ffe4c4'); });
            itemBg.on('pointerdown', () => { item.action(); this.toggle(); });

            this.container!.add([itemBg, itemTxt]);
        });
    }

    toggle(): void {
        if (!this.container) return;
        this.container.setVisible(!this.container.visible);
    }

    isOpen(): boolean { return !!this.container?.visible; }

    hide(): void { this.container?.setVisible(false); }
}
