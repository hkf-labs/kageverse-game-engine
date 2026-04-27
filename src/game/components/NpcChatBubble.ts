import * as Phaser from 'phaser';
import type { GameComponent } from './types';

/**
 * Bong bóng thoại hiển thị trên đầu NPC, có hiệu ứng đánh máy (typewriter).
 * Single-instance: gọi show() cho NPC nào thì replace nội dung cũ.
 */
export class NpcChatBubble implements GameComponent {
    private scene: Phaser.Scene;
    private container?: Phaser.GameObjects.Container;
    private bg?: Phaser.GameObjects.Graphics;
    private textObj?: Phaser.GameObjects.Text;

    private fullText = '';
    private typedLen = 0;
    private typeTimer?: Phaser.Time.TimerEvent;
    private hideTimer?: Phaser.Time.TimerEvent;
    private currentTarget?: Phaser.GameObjects.Sprite;

    private readonly TYPE_DELAY_MS = 35;
    private readonly LINGER_MS = 2500;
    private readonly MAX_WIDTH = 280;
    private readonly TAIL_HEIGHT = 8;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        this.container = this.scene.add.container(0, 0).setDepth(50).setVisible(false);
        this.bg = this.scene.add.graphics();
        this.textObj = this.scene.add.text(0, 0, '', {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            wordWrap: { width: this.MAX_WIDTH, useAdvancedWrap: true },
            align: 'center',
            stroke: '#000',
            strokeThickness: 2,
        }).setOrigin(0.5, 1);
        this.container.add([this.bg, this.textObj]);
    }

    destroy(): void {
        this.cancelTimers();
        this.container?.destroy();
        this.container = undefined;
        this.bg = undefined;
        this.textObj = undefined;
    }

    update(): void {
        if (!this.container?.visible || !this.currentTarget) return;
        // NPC có thể di chuyển trong tương lai → re-anchor mỗi frame.
        this.anchorAboveSprite(this.currentTarget);
    }

    show(targetSprite: Phaser.GameObjects.Sprite, text: string): void {
        if (!this.container || !this.textObj) return;
        this.cancelTimers();
        if (!text) {
            this.hide();
            return;
        }

        this.fullText = text;
        this.typedLen = 0;
        this.currentTarget = targetSprite;
        this.textObj.setText('');
        this.anchorAboveSprite(targetSprite);
        this.container.setVisible(true);

        // Vẽ background trống ban đầu cho 1 ký tự để có frame chờ.
        this.advanceType();

        this.typeTimer = this.scene.time.addEvent({
            delay: this.TYPE_DELAY_MS,
            repeat: Math.max(0, text.length - 1),
            callback: () => this.advanceType(),
        });
    }

    hide(): void {
        this.cancelTimers();
        this.currentTarget = undefined;
        this.container?.setVisible(false);
    }

    isVisible(): boolean { return !!this.container?.visible; }

    private advanceType(): void {
        if (!this.textObj) return;
        if (this.typedLen >= this.fullText.length) return;
        this.typedLen += 1;
        this.textObj.setText(this.fullText.slice(0, this.typedLen));
        this.redrawBackground();

        if (this.typedLen >= this.fullText.length) {
            this.hideTimer = this.scene.time.addEvent({
                delay: this.LINGER_MS,
                callback: () => this.hide(),
            });
        }
    }

    private anchorAboveSprite(spr: Phaser.GameObjects.Sprite): void {
        if (!this.container) return;
        const sprH = spr.height * spr.scaleY;
        const x = spr.x;
        const y = spr.y - sprH - 16;
        this.container.setPosition(x, y);
    }

    private redrawBackground(): void {
        if (!this.bg || !this.textObj) return;
        const padX = 12;
        const padY = 8;
        const w = Math.min(this.MAX_WIDTH + padX * 2, this.textObj.width + padX * 2);
        const h = this.textObj.height + padY * 2;
        const left = -w / 2;
        const top = -(h + this.TAIL_HEIGHT);

        // Text origin (0.5,1) → đặt ở đáy bubble (trừ tail).
        this.textObj.setPosition(0, -this.TAIL_HEIGHT - padY);

        this.bg.clear();
        this.bg.fillStyle(0x3e2723, 0.95);
        this.bg.fillRoundedRect(left, top, w, h, 10);
        this.bg.lineStyle(2, 0xe29e4a, 1);
        this.bg.strokeRoundedRect(left, top, w, h, 10);

        // Đuôi bubble chỉ xuống đầu NPC.
        const tw = 7;
        this.bg.fillStyle(0x3e2723, 0.95);
        this.bg.fillTriangle(-tw, -this.TAIL_HEIGHT, tw, -this.TAIL_HEIGHT, 0, 0);
        this.bg.lineStyle(2, 0xe29e4a, 1);
        this.bg.beginPath();
        this.bg.moveTo(-tw, -this.TAIL_HEIGHT);
        this.bg.lineTo(0, 0);
        this.bg.lineTo(tw, -this.TAIL_HEIGHT);
        this.bg.strokePath();
    }

    private cancelTimers(): void {
        this.typeTimer?.remove();
        this.typeTimer = undefined;
        this.hideTimer?.remove();
        this.hideTimer = undefined;
    }
}
