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

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '15px',
    fontStyle: 'bold',
    color: '#ffe4c4',
    stroke: '#000000',
    strokeThickness: 4,
    align: 'center',
    wordWrap: { width: 520 },
};

function itemPickupLabel(templateId: string, qty: number): string {
    const name = tOpt(`item.name.${templateId}`) ?? targetDisplayName(templateId);
    return qty > 1 ? `${name} ×${qty}` : name;
}

/**
 * Toast nhặt item: đứng im ~3s rồi trôi lên + fade. Nhiều item gần nhau → một dòng
 * "Bạn đã nhận được a, b, c".
 */
export class PickupToast implements GameComponent {
    private scene: Phaser.Scene;
    private labels: string[] = [];
    private text?: Phaser.GameObjects.Text;
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
        this.text?.destroy();
        this.text = undefined;
        this.labels = [];
        this.isExiting = false;
    }

    notifyItem(templateId: string, qty = 1): void {
        if (!templateId || qty <= 0) return;
        const label = itemPickupLabel(templateId, qty);

        if (this.text && this.holdTimer !== undefined && !this.isExiting) {
            this.labels.push(label);
            this.renderMessage();
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

    private show(): void {
        this.clearTimers();
        this.isExiting = false;

        const message = t('combat.pickup_received', { items: this.labels.join(', ') });
        const y = Math.round(this.scene.scale.height * 0.14);
        const x = this.scene.scale.width / 2;

        if (!this.text) {
            this.text = this.scene.add
                .text(x, y, message, TEXT_STYLE)
                .setOrigin(0.5)
                .setDepth(95)
                .setScrollFactor(0);
        } else {
            this.text.setText(message);
            this.text.setPosition(x, y);
            this.text.setAlpha(1);
        }

        this.scheduleHold();
    }

    private renderMessage(): void {
        if (!this.text) return;
        this.text.setText(t('combat.pickup_received', { items: this.labels.join(', ') }));
    }

    private scheduleHold(): void {
        if (this.holdTimer !== undefined) {
            window.clearTimeout(this.holdTimer);
        }
        this.holdTimer = window.setTimeout(() => this.startExit(), HOLD_MS);
    }

    private startExit(): void {
        this.holdTimer = undefined;
        if (!this.text) {
            this.labels = [];
            return;
        }
        this.isExiting = true;
        const txt = this.text;
        this.scene.tweens.add({
            targets: txt,
            x: txt.x - EXIT_SLIDE_X_PX,
            alpha: 0,
            duration: EXIT_MS,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                txt.destroy();
                if (this.text === txt) {
                    this.text = undefined;
                }
                this.labels = [];
                this.isExiting = false;
            },
        });
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
        if (this.text) {
            this.scene.tweens.killTweensOf(this.text);
        }
    }
}
