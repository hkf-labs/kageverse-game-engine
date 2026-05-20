import * as Phaser from 'phaser';
import { t, tOpt } from '../../i18n';
import { targetDisplayName } from './modals/QuestLogPanel';
import type { GameComponent } from './types';

const HOLD_MS = 3000;
const EXIT_MS = 550;
/** Trượt sang trái khi ẩn (px). */
const EXIT_SLIDE_X_PX = 280;
/** Gom nhiều nhặt liên tiếp thành một dòng. */
const BATCH_MS = 320;
/** Chiều ngang tối đa vùng hiển thị (px) — tỉ lệ màn hình nhỏ hơn cap. */
const MAX_VIEW_WIDTH_PX = 520;
const VIEW_WIDTH_SCREEN_RATIO = 0.82;
const VIEWPORT_H = 28;
/** Tốc độ marquee khi danh sách item dài. */
const SCROLL_MS_PER_PX = 32;
const MIN_SCROLL_MS = 2200;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '15px',
    fontStyle: 'bold',
    color: '#ffea7a',
    stroke: '#000000',
    strokeThickness: 4,
};

function itemPickupLabel(templateId: string, qty: number): string {
    const name = tOpt(`item.name.${templateId}`) ?? targetDisplayName(templateId);
    return qty > 1 ? `${name} ×${qty}` : name;
}

function yenPickupLabel(amount: number): string {
    return t('combat.pickup_yen', { n: amount.toLocaleString() });
}

/**
 * Toast nhặt loot (item / yên): một dòng, nối thêm bằng dấu phẩy.
 * Vùng hiển thị giới hạn ngang — dài hơn thì marquee để đọc phần cuối.
 */
export class PickupToast implements GameComponent {
    private scene: Phaser.Scene;
    private labels: string[] = [];
    private container?: Phaser.GameObjects.Container;
    private scrollText?: Phaser.GameObjects.Text;
    private maskGfx?: Phaser.GameObjects.Graphics;
    private scrollTween?: Phaser.Tweens.Tween;
    private batchTimer?: number;
    private holdTimer?: number;
    private isExiting = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        this.scene.events.once('shutdown', () => this.destroy());
        this.scene.events.once('destroy', () => this.destroy());
    }

    update(): void {}

    destroy(): void {
        this.clearTimers();
        this.destroyToast();
        this.labels = [];
        this.isExiting = false;
    }

    notifyItem(templateId: string, qty = 1): void {
        if (!templateId || qty <= 0) return;
        this.enqueuePickup(itemPickupLabel(templateId, qty));
    }

    notifyYen(amount: number): void {
        if (amount <= 0) return;
        this.enqueuePickup(yenPickupLabel(amount));
    }

    private enqueuePickup(label: string): void {
        if (this.container && this.holdTimer !== undefined && !this.isExiting) {
            this.labels.push(label);
            this.layoutAndScroll();
            this.scheduleHold();
            return;
        }

        this.labels.push(label);
        if (this.batchTimer !== undefined) {
            window.clearTimeout(this.batchTimer);
        }
        this.batchTimer = window.setTimeout(() => this.flushBatch(), BATCH_MS);
    }

    private flushBatch(): void {
        this.batchTimer = undefined;
        if (this.labels.length === 0) return;
        this.show();
    }

    private buildMessage(): string {
        return t('combat.pickup_received', { items: this.labels.join(', ') });
    }

    private getViewWidth(): number {
        return Math.min(MAX_VIEW_WIDTH_PX, Math.round(this.scene.scale.width * VIEW_WIDTH_SCREEN_RATIO));
    }

    private ensureToast(): void {
        if (this.container) return;

        const y = Math.round(this.scene.scale.height * 0.975);
        const x = this.scene.scale.width / 2;
        const viewW = this.getViewWidth();

        this.container = this.scene.add
            .container(x, y)
            .setDepth(95)
            .setScrollFactor(0);

        this.maskGfx = this.scene.add.graphics();
        this.maskGfx.fillStyle(0xffffff, 1);
        this.maskGfx.fillRect(-viewW / 2, -VIEWPORT_H / 2, viewW, VIEWPORT_H);
        const mask = this.maskGfx.createGeometryMask();

        this.scrollText = this.scene.add
            .text(0, 0, '', TEXT_STYLE)
            .setOrigin(0, 0.5)
            .setMask(mask);

        this.container.add([this.maskGfx, this.scrollText]);
        this.maskGfx.setVisible(false);
    }

    private layoutAndScroll(): void {
        if (!this.scrollText || !this.maskGfx) return;

        const viewW = this.getViewWidth();
        this.maskGfx.clear();
        this.maskGfx.fillStyle(0xffffff, 1);
        this.maskGfx.fillRect(-viewW / 2, -VIEWPORT_H / 2, viewW, VIEWPORT_H);

        const message = this.buildMessage();
        this.scrollText.setText(message);

        const textW = this.scrollText.width;
        const left = -viewW / 2;
        this.killScrollTween();

        if (textW <= viewW) {
            this.scrollText.x = left + (viewW - textW) / 2;
            return;
        }

        this.scrollText.x = left;
        const overflow = textW - viewW;
        const duration = Math.max(MIN_SCROLL_MS, overflow * SCROLL_MS_PER_PX);
        this.scrollTween = this.scene.tweens.add({
            targets: this.scrollText,
            x: left - overflow,
            duration,
            ease: 'Linear',
        });
    }

    private show(): void {
        this.clearTimers();
        this.isExiting = false;
        this.ensureToast();

        const y = Math.round(this.scene.scale.height * 0.975);
        const x = this.scene.scale.width / 2;
        this.container?.setPosition(x, y).setAlpha(1);

        this.layoutAndScroll();
        this.scheduleHold();
    }

    /** Giữ toast đủ lâu để marquee chạy hết khi danh sách item rất dài. */
    private getHoldDurationMs(): number {
        if (!this.scrollText) return HOLD_MS;
        const overflow = Math.max(0, this.scrollText.width - this.getViewWidth());
        if (overflow <= 0) return HOLD_MS;
        const scrollMs = Math.max(MIN_SCROLL_MS, overflow * SCROLL_MS_PER_PX);
        return Math.max(HOLD_MS, scrollMs + 400);
    }

    private scheduleHold(): void {
        if (this.holdTimer !== undefined) {
            window.clearTimeout(this.holdTimer);
        }
        this.holdTimer = window.setTimeout(() => this.startExit(), this.getHoldDurationMs());
    }

    private startExit(): void {
        this.holdTimer = undefined;
        if (!this.container) {
            this.labels = [];
            return;
        }
        this.isExiting = true;
        this.killScrollTween();
        const box = this.container;
        this.scene.tweens.add({
            targets: box,
            x: box.x - EXIT_SLIDE_X_PX,
            alpha: 0,
            duration: EXIT_MS,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.destroyToast();
                this.labels = [];
                this.isExiting = false;
            },
        });
    }

    private killScrollTween(): void {
        if (this.scrollTween) {
            this.scrollTween.stop();
            this.scrollTween = undefined;
        }
        if (this.scrollText) {
            this.scene.tweens.killTweensOf(this.scrollText);
        }
    }

    private destroyToast(): void {
        this.killScrollTween();
        this.container?.destroy();
        this.container = undefined;
        this.scrollText = undefined;
        this.maskGfx = undefined;
    }

    private clearTimers(): void {
        if (this.batchTimer !== undefined) {
            window.clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
        if (this.holdTimer !== undefined) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = undefined;
        }
        if (this.container) {
            this.scene.tweens.killTweensOf(this.container);
        }
        this.killScrollTween();
    }
}
