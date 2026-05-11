import * as Phaser from 'phaser';
import { t } from '../../i18n';
import type { GameComponent } from './types';

const MM_WIDTH = 160;
const MM_HEIGHT = 110;
const MM_Y = 26;
const TITLE_H = 18;
const MARGIN_RIGHT = 16;

export class Minimap implements GameComponent {
    private camera?: Phaser.Cameras.Scene2D.Camera;
    private uiElements: Phaser.GameObjects.GameObject[] = [];
    private scene: Phaser.Scene;
    private bgWidth: number;
    private bgHeight: number;

    private miniShadow?: Phaser.GameObjects.Graphics;
    private miniFrame?: Phaser.GameObjects.Graphics;
    private miniInner?: Phaser.GameObjects.Graphics;
    private titleText?: Phaser.GameObjects.Text;
    private miniBlip?: Phaser.GameObjects.Arc;

    constructor(scene: Phaser.Scene, bgWidth: number, bgHeight: number) {
        this.scene = scene;
        this.bgWidth = bgWidth;
        this.bgHeight = bgHeight;
    }

    create(): void {
        this.miniShadow = this.scene.add.graphics().setScrollFactor(0).setDepth(199);
        this.miniFrame = this.scene.add.graphics().setScrollFactor(0).setDepth(200);
        this.miniInner = this.scene.add.graphics().setScrollFactor(0).setDepth(202);

        this.titleText = this.scene.add.text(0, 0, t('minimap.title'), {
            fontSize: '11px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        const mmZoom = MM_HEIGHT / this.bgHeight;
        this.camera = this.scene.cameras.add(0, MM_Y, MM_WIDTH, MM_HEIGHT).setZoom(mmZoom).setName('mini');
        this.camera.setBackgroundColor(0x0a1622);

        this.miniBlip = this.scene.add.circle(0, 0, 4, 0xff5454).setStrokeStyle(2, 0xffffff);
        this.miniBlip.setScrollFactor(0).setDepth(203);

        this.scene.tweens.add({
            targets: this.miniBlip,
            scale: { from: 1, to: 1.6 },
            alpha: { from: 1, to: 0.6 },
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        this.layout();
        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        });
    }

    private layout(): void {
        const mmX = this.scene.scale.width - MM_WIDTH - MARGIN_RIGHT;

        this.miniShadow?.clear();
        this.miniShadow?.fillStyle(0x000000, 0.45);
        this.miniShadow?.fillRoundedRect(mmX - 4, MM_Y - TITLE_H - 4 + 4, MM_WIDTH + 12, MM_HEIGHT + TITLE_H + 12, 10);

        this.miniFrame?.clear();
        this.miniFrame?.fillStyle(0x3d2010, 1);
        this.miniFrame?.fillRoundedRect(mmX - 6, MM_Y - TITLE_H - 6, MM_WIDTH + 12, MM_HEIGHT + TITLE_H + 12, 10);
        this.miniFrame?.fillStyle(0x4d2d13, 1);
        this.miniFrame?.fillRoundedRect(mmX - 4, MM_Y - TITLE_H - 4, MM_WIDTH + 8, TITLE_H, 6);
        this.miniFrame?.lineStyle(3, 0xe29e4a, 1);
        this.miniFrame?.strokeRoundedRect(mmX - 6, MM_Y - TITLE_H - 6, MM_WIDTH + 12, MM_HEIGHT + TITLE_H + 12, 10);

        this.miniInner?.clear();
        this.miniInner?.lineStyle(2, 0xd59a48, 1);
        this.miniInner?.strokeRect(mmX, MM_Y, MM_WIDTH, MM_HEIGHT);
        this.miniInner?.lineStyle(1, 0xffe2a8, 0.5);
        this.miniInner?.strokeRect(mmX + 2, MM_Y + 2, MM_WIDTH - 4, MM_HEIGHT - 4);

        this.titleText?.setPosition(mmX + MM_WIDTH / 2, MM_Y - TITLE_H / 2 - 4);
        this.camera?.setPosition(mmX, MM_Y);
        this.miniBlip?.setPosition(mmX + MM_WIDTH / 2, MM_Y + MM_HEIGHT / 2);
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
        return { x: width - MM_WIDTH - MARGIN_RIGHT, y: MM_Y, width: MM_WIDTH, height: MM_HEIGHT };
    }
}
