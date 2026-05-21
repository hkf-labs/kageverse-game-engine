import * as Phaser from 'phaser';
import { t, tOpt } from '../../i18n';
import { targetDisplayName } from './modals/QuestLogPanel';
import type { GameComponent } from './types';

/** Đứng im trước khi marquee (ms) — cố định, không reset khi thêm item. */
const STATIC_HOLD_MS = 3000;
const EXIT_DELAY_MS = 400;
const EXIT_MS = 550;
/** Trượt sang trái khi ẩn (px). */
const EXIT_SLIDE_X_PX = 280;
/** Gom nhiều nhặt liên tiếp thành một dòng. */
const BATCH_MS = 320;
/** Chiều ngang tối đa vùng hiển thị (px). */
const MAX_VIEW_WIDTH_PX = 520;
const VIEW_WIDTH_SCREEN_RATIO = 0.82;
const VIEWPORT_H = 28;
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

type ToastPhase = 'idle' | 'static' | 'scroll';

function itemPickupLabel(templateId: string, qty: number): string {
    const name = tOpt(`item.name.${templateId}`) ?? targetDisplayName(templateId);
    return qty > 1 ? `${name} ×${qty}` : name;
}

function yenPickupLabel(amount: number): string {
    return t('combat.pickup_yen', { n: amount.toLocaleString() });
}

/**
 * Toast nhặt loot: một dòng, nối bằng dấu phẩy, vùng ngang có mask.
 * 3s đứng im → marquee (nếu dài) → thoát. Thêm item khi đang hiện không reset timer/tween.
 */
export class PickupToast implements GameComponent {
    private scene: Phaser.Scene;
    private labels: string[] = [];
    /** i18n key cho dòng prefix (nhặt vs mua shop). */
    private receivedKey = 'combat.pickup_received';
    private container?: Phaser.GameObjects.Container;
    private scrollText?: Phaser.GameObjects.Text;
    private maskGfx?: Phaser.GameObjects.Graphics;
    private scrollTween?: Phaser.Tweens.Tween;
    private phase: ToastPhase = 'idle';
    private batchTimer?: number;
    private staticTimer?: number;
    private exitTimer?: number;
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
        this.receivedKey = 'combat.pickup_received';
        this.phase = 'idle';
        this.isExiting = false;
    }

    notifyItem(templateId: string, qty = 1): void {
        if (!templateId || qty <= 0) return;
        this.enqueuePickup(itemPickupLabel(templateId, qty), 'combat.pickup_received');
    }

    /** Mua tại NPC shop — dùng name_key từ listing (vd item.consumable.teleport_charm). */
    notifyShopItem(nameKey: string, qty = 1): void {
        if (!nameKey || qty <= 0) return;
        const name = t(nameKey);
        const label = qty > 1 ? `${name} ×${qty}` : name;
        this.enqueuePickup(label, 'shop.purchase_received');
    }

    notifyYen(amount: number): void {
        if (amount <= 0) return;
        this.enqueuePickup(yenPickupLabel(amount), 'combat.pickup_received');
    }

    private enqueuePickup(label: string, receivedKey: string): void {
        if (this.container && !this.isExiting && this.phase !== 'idle') {
            this.labels.push(label);
            this.updateMessageOnly();
            return;
        }

        this.labels.push(label);
        if (this.phase === 'idle' && !this.isExiting) {
            this.receivedKey = receivedKey;
        }
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
        return t(this.receivedKey, { items: this.labels.join(', ') });
    }

    private getViewWidth(): number {
        return Math.min(MAX_VIEW_WIDTH_PX, Math.round(this.scene.scale.width * VIEW_WIDTH_SCREEN_RATIO));
    }

    private getLeftEdge(): number {
        return -this.getViewWidth() / 2;
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

    private redrawMask(): void {
        if (!this.maskGfx) return;
        const viewW = this.getViewWidth();
        this.maskGfx.clear();
        this.maskGfx.fillStyle(0xffffff, 1);
        this.maskGfx.fillRect(-viewW / 2, -VIEWPORT_H / 2, viewW, VIEWPORT_H);
    }

    /** Chỉ đổi nội dung — không đụng vị trí, tween, timer (đang static/scroll). */
    private updateMessageOnly(): void {
        if (!this.scrollText) return;
        this.redrawMask();
        this.scrollText.setText(this.buildMessage());
    }

    /** Bắt đầu hiển thị: căn chỗ + 3s đứng im. */
    private layoutStaticStart(): void {
        if (!this.scrollText) return;
        this.redrawMask();
        this.scrollText.setText(this.buildMessage());

        const viewW = this.getViewWidth();
        const textW = this.scrollText.width;
        const left = this.getLeftEdge();

        if (textW <= viewW) {
            this.scrollText.x = left + (viewW - textW) / 2;
        } else {
            this.scrollText.x = left;
        }
    }

    private show(): void {
        this.clearTimers();
        this.isExiting = false;
        this.phase = 'static';
        this.ensureToast();

        const y = Math.round(this.scene.scale.height * 0.975);
        const x = this.scene.scale.width / 2;
        this.container?.setPosition(x, y).setAlpha(1);

        this.layoutStaticStart();
        this.staticTimer = window.setTimeout(() => this.beginScrollOrExit(), STATIC_HOLD_MS);
    }

    private beginScrollOrExit(): void {
        this.staticTimer = undefined;
        if (!this.scrollText || this.isExiting) return;

        const viewW = this.getViewWidth();
        const textW = this.scrollText.width;
        const left = this.getLeftEdge();

        if (textW <= viewW) {
            this.scrollText.x = left + (viewW - textW) / 2;
            this.scheduleExit(EXIT_DELAY_MS);
            return;
        }

        this.phase = 'scroll';
        this.scrollText.x = left;
        const overflow = textW - viewW;
        const duration = Math.max(MIN_SCROLL_MS, overflow * SCROLL_MS_PER_PX);
        this.scrollTween = this.scene.tweens.add({
            targets: this.scrollText,
            x: left - overflow,
            duration,
            ease: 'Linear',
            onComplete: () => {
                this.scrollTween = undefined;
                if (!this.isExiting) this.scheduleExit(EXIT_DELAY_MS);
            },
        });
    }

    private scheduleExit(delayMs: number): void {
        if (this.exitTimer !== undefined) {
            window.clearTimeout(this.exitTimer);
        }
        this.exitTimer = window.setTimeout(() => this.startExit(), delayMs);
    }

    private startExit(): void {
        this.exitTimer = undefined;
        if (!this.container) {
            this.labels = [];
            this.phase = 'idle';
            return;
        }
        this.isExiting = true;
        this.phase = 'idle';
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
                this.receivedKey = 'combat.pickup_received';
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
        if (this.staticTimer !== undefined) {
            window.clearTimeout(this.staticTimer);
            this.staticTimer = undefined;
        }
        if (this.exitTimer !== undefined) {
            window.clearTimeout(this.exitTimer);
            this.exitTimer = undefined;
        }
        if (this.container) {
            this.scene.tweens.killTweensOf(this.container);
        }
        this.killScrollTween();
    }
}
