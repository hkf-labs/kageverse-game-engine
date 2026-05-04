import * as Phaser from 'phaser';
import { t } from '../../i18n';
import type { GameComponent } from './types';

export class Minimap implements GameComponent {
    private camera?: Phaser.Cameras.Scene2D.Camera;
    private uiElements: Phaser.GameObjects.GameObject[] = [];
    private scene: Phaser.Scene;
    private bgWidth: number;
    private bgHeight: number;

    constructor(scene: Phaser.Scene, bgWidth: number, bgHeight: number) {
        this.scene = scene;
        this.bgWidth = bgWidth;
        this.bgHeight = bgHeight;
    }

    create(): void {
        const width = this.scene.scale.width;
        const mmWidth = 160;
        const mmHeight = 110;
        const mmX = width - mmWidth - 16;
        const mmY = 26;
        const titleH = 18;

        const miniShadow = this.scene.add.graphics();
        miniShadow.fillStyle(0x000000, 0.45);
        miniShadow.fillRoundedRect(mmX - 4, mmY - titleH - 4 + 4, mmWidth + 12, mmHeight + titleH + 12, 10);
        miniShadow.setScrollFactor(0).setDepth(199);

        const miniFrame = this.scene.add.graphics();
        miniFrame.fillStyle(0x3d2010, 1);
        miniFrame.fillRoundedRect(mmX - 6, mmY - titleH - 6, mmWidth + 12, mmHeight + titleH + 12, 10);
        miniFrame.fillStyle(0x4d2d13, 1);
        miniFrame.fillRoundedRect(mmX - 4, mmY - titleH - 4, mmWidth + 8, titleH, 6);
        miniFrame.lineStyle(3, 0xe29e4a, 1);
        miniFrame.strokeRoundedRect(mmX - 6, mmY - titleH - 6, mmWidth + 12, mmHeight + titleH + 12, 10);
        miniFrame.setScrollFactor(0).setDepth(200);

        this.scene.add.text(mmX + mmWidth / 2, mmY - titleH / 2 - 4, t('minimap.title'), {
            fontSize: '11px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        const miniInner = this.scene.add.graphics();
        miniInner.lineStyle(2, 0xd59a48, 1);
        miniInner.strokeRect(mmX, mmY, mmWidth, mmHeight);
        miniInner.lineStyle(1, 0xffe2a8, 0.5);
        miniInner.strokeRect(mmX + 2, mmY + 2, mmWidth - 4, mmHeight - 4);
        miniInner.setScrollFactor(0).setDepth(202);

        const mmZoom = mmHeight / this.bgHeight;
        this.camera = this.scene.cameras.add(mmX, mmY, mmWidth, mmHeight).setZoom(mmZoom).setName('mini');
        this.camera.setBackgroundColor(0x0a1622);

        const miniBlip = this.scene.add.circle(mmX + mmWidth / 2, mmY + mmHeight / 2, 4, 0xff5454)
            .setStrokeStyle(2, 0xffffff);
        miniBlip.setScrollFactor(0).setDepth(203);

        this.scene.tweens.add({
            targets: miniBlip,
            scale: { from: 1, to: 1.6 },
            alpha: { from: 1, to: 0.6 },
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
    }

    followPlayer(player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody): void {
        if (this.camera) {
            this.camera.startFollow(player, true, 0.1, 0.1);
            this.camera.setBounds(0, 0, this.bgWidth, this.bgHeight);
        }
    }

    ignoreUIElements(): void {
        this.uiElements = [];
        this.scene.children.each((child: Phaser.GameObjects.GameObject) => {
            const scrollable = child as Phaser.GameObjects.GameObject & { scrollFactorX?: number; scrollFactorY?: number };
            if (scrollable.scrollFactorX === 0 || scrollable.scrollFactorY === 0) {
                this.uiElements.push(child);
            }
        });
        this.camera?.ignore(this.uiElements);
    }

    getPosition(): { x: number; y: number; width: number; height: number } {
        const width = this.scene.scale.width;
        const mmWidth = 160;
        const mmHeight = 110;
        return { x: width - mmWidth - 16, y: 26, width: mmWidth, height: mmHeight };
    }
}
