import * as Phaser from 'phaser';
import type { GameComponent } from './types';

export class HUD implements GameComponent {
    private statusText?: Phaser.GameObjects.Text;
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const width = this.scene.scale.width;

        const topbar = this.scene.add.image(0, 0, 'topbar').setOrigin(0, 0);
        topbar.setScale(0.5);

        const hpBar = this.drawRoundedRect(105, 14, 170, 18, 0x5d1515, 0xff5454);
        const mpBar = this.drawRoundedRect(98, 46, 125, 15, 0x10325a, 0x4da4ff);

        const hpText = this.scene.add.text(192, 22, '1500 / 1500', {
            fontSize: '10px', color: '#fff', fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);

        const mpText = this.scene.add.text(165, 53, '800 / 800', {
            fontSize: '10px', color: '#fff', fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);

        const levelText = this.scene.add.text(45, 38, '1', {
            fontSize: '26px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0.5);

        const expText = this.scene.add.text(45, 62, '20.88%', {
            fontSize: '11px', fontStyle: 'bold', color: '#ffffff',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5);

        const bg4 = this.drawRoundedRect(width - 148, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg5 = this.drawRoundedRect(width - 100, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg6 = this.drawRoundedRect(width - 52, 14, 40, 30, 0x4d2d13, 0xd59a48);

        [topbar, hpBar, mpBar, hpText, mpText, levelText, expText, bg4, bg5, bg6].forEach((obj) => {
            if (obj && 'setScrollFactor' in obj) {
                (obj as Phaser.GameObjects.GameObject & { setScrollFactor: (x: number, y?: number) => void }).setScrollFactor(0);
                (obj as Phaser.GameObjects.GameObject & { setDepth: (z: number) => void }).setDepth(100);
            }
        });

        topbar.setDepth(101);
        levelText.setDepth(102);
        expText.setDepth(102);

        this.statusText = this.scene.add.text(16, 52, '', {
            fontSize: '12px', color: '#123047', fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
    }

    getStatusText(): Phaser.GameObjects.Text | undefined { return this.statusText; }

    setStatus(text: string, color?: string): void {
        this.statusText?.setText(text);
        if (color) this.statusText?.setColor(color);
    }

    private drawRoundedRect(x: number, y: number, w: number, h: number, fill: number, stroke: number): Phaser.GameObjects.Graphics {
        const g = this.scene.add.graphics();
        g.fillStyle(fill, 0.9);
        g.fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, stroke, 1);
        g.strokeRoundedRect(x, y, w, h, 8);
        return g;
    }
}
