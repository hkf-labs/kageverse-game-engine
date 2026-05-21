import type * as Phaser from 'phaser';
import { t, tOpt } from '../../i18n';
import { MODAL_Z_INDEX } from './modals/theme';
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

const MESSAGE_CSS = `
    font-family: system-ui, sans-serif;
    font-size: 15px;
    font-weight: bold;
    color: #ffea7a;
    white-space: nowrap;
    -webkit-text-stroke: 1px #000;
    paint-order: stroke fill;
`;

type ToastPhase = 'idle' | 'static' | 'scroll';

function itemPickupLabel(templateId: string, qty: number): string {
    const name = tOpt(`item.name.${templateId}`) ?? targetDisplayName(templateId);
    return qty > 1 ? `${name} ×${qty}` : name;
}

function yenPickupLabel(amount: number): string {
    return t('combat.pickup_yen', { n: amount.toLocaleString() });
}

/**
 * Toast nhặt loot / mua shop — DOM (ngoài canvas), z-index toast.
 * Modal HTML che canvas; toast phải mount body để hiện khi shop/inventory mở.
 */
export class PickupToast implements GameComponent {
    private scene: Phaser.Scene;
    private labels: string[] = [];
    /** i18n key cho dòng prefix (nhặt vs mua shop). */
    private receivedKey = 'combat.pickup_received';
    private root?: HTMLDivElement;
    private viewport?: HTMLDivElement;
    private track?: HTMLDivElement;
    private messageEl?: HTMLSpanElement;
    private scrollEndHandler?: () => void;
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
        if (this.root && !this.isExiting && this.phase !== 'idle') {
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

    private ensureToast(): void {
        if (this.root) return;

        const root = document.createElement('div');
        root.className = 'kageverse-pickup-toast';
        Object.assign(root.style, {
            position: 'fixed',
            left: '50%',
            bottom: '2.5%',
            transform: 'translateX(-50%)',
            zIndex: String(MODAL_Z_INDEX.toast),
            pointerEvents: 'none',
            opacity: '0',
            visibility: 'hidden',
        });

        const viewport = document.createElement('div');
        Object.assign(viewport.style, {
            overflow: 'hidden',
            height: `${VIEWPORT_H}px`,
            display: 'flex',
            alignItems: 'center',
        });

        const track = document.createElement('div');
        Object.assign(track.style, {
            position: 'relative',
            flexShrink: '0',
            height: `${VIEWPORT_H}px`,
            display: 'flex',
            alignItems: 'center',
            willChange: 'transform',
        });

        const messageEl = document.createElement('span');
        messageEl.style.cssText = MESSAGE_CSS;

        track.appendChild(messageEl);
        viewport.appendChild(track);
        root.appendChild(viewport);
        document.body.appendChild(root);

        this.root = root;
        this.viewport = viewport;
        this.track = track;
        this.messageEl = messageEl;
    }

    private applyViewportWidth(): void {
        if (!this.viewport) return;
        this.viewport.style.width = `${this.getViewWidth()}px`;
    }

    private measureTextWidth(): number {
        if (!this.messageEl) return 0;
        return this.messageEl.getBoundingClientRect().width;
    }

    private resetTrackMotion(): void {
        if (!this.track) return;
        this.killScrollTween();
        this.track.style.transition = 'none';
        this.track.style.transform = 'translateX(0)';
    }

    /** Chỉ đổi nội dung — không đụng vị trí, animation, timer (đang static/scroll). */
    private updateMessageOnly(): void {
        if (!this.messageEl) return;
        this.messageEl.textContent = this.buildMessage();
    }

    /** Bắt đầu hiển thị: căn chỗ + 3s đứng im. */
    private layoutStaticStart(): void {
        if (!this.messageEl || !this.viewport || !this.track) return;
        this.applyViewportWidth();
        this.resetTrackMotion();
        this.messageEl.textContent = this.buildMessage();

        const viewW = this.getViewWidth();
        const textW = this.measureTextWidth();

        if (textW <= viewW) {
            this.viewport.style.justifyContent = 'center';
        } else {
            this.viewport.style.justifyContent = 'flex-start';
        }
    }

    private show(): void {
        this.clearTimers();
        this.isExiting = false;
        this.phase = 'static';
        this.ensureToast();
        if (!this.root) return;

        this.root.style.visibility = 'visible';
        this.root.style.opacity = '1';
        this.root.style.transition = 'none';
        this.root.style.transform = 'translateX(-50%)';

        this.layoutStaticStart();
        this.staticTimer = window.setTimeout(() => this.beginScrollOrExit(), STATIC_HOLD_MS);
    }

    private beginScrollOrExit(): void {
        this.staticTimer = undefined;
        if (!this.messageEl || !this.viewport || !this.track || this.isExiting) return;

        const viewW = this.getViewWidth();
        const textW = this.measureTextWidth();

        if (textW <= viewW) {
            this.viewport.style.justifyContent = 'center';
            this.resetTrackMotion();
            this.scheduleExit(EXIT_DELAY_MS);
            return;
        }

        this.phase = 'scroll';
        this.viewport.style.justifyContent = 'flex-start';
        const overflow = textW - viewW;
        const duration = Math.max(MIN_SCROLL_MS, overflow * SCROLL_MS_PER_PX);

        this.killScrollTween();
        this.track.style.transition = 'none';
        this.track.style.transform = 'translateX(0)';
        void this.track.offsetWidth;
        this.track.style.transition = `transform ${duration}ms linear`;
        this.track.style.transform = `translateX(-${overflow}px)`;

        const onEnd = (): void => {
            if (this.scrollEndHandler !== onEnd) return;
            this.scrollEndHandler = undefined;
            this.track?.removeEventListener('transitionend', onEnd);
            if (!this.isExiting) this.scheduleExit(EXIT_DELAY_MS);
        };
        this.scrollEndHandler = onEnd;
        this.track.addEventListener('transitionend', onEnd);
    }

    private scheduleExit(delayMs: number): void {
        if (this.exitTimer !== undefined) {
            window.clearTimeout(this.exitTimer);
        }
        this.exitTimer = window.setTimeout(() => this.startExit(), delayMs);
    }

    private startExit(): void {
        this.exitTimer = undefined;
        if (!this.root) {
            this.labels = [];
            this.phase = 'idle';
            return;
        }
        this.isExiting = true;
        this.phase = 'idle';
        this.killScrollTween();

        const root = this.root;
        const onEnd = (e: TransitionEvent): void => {
            if (e.target !== root || e.propertyName !== 'transform') return;
            root.removeEventListener('transitionend', onEnd);
            this.destroyToast();
            this.labels = [];
            this.receivedKey = 'combat.pickup_received';
            this.isExiting = false;
        };
        root.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.55, 0.085, 0.68, 0.53), opacity ${EXIT_MS}ms ease-in`;
        root.style.transform = `translateX(calc(-50% - ${EXIT_SLIDE_X_PX}px))`;
        root.style.opacity = '0';
        root.addEventListener('transitionend', onEnd);
    }

    private killScrollTween(): void {
        if (this.scrollEndHandler && this.track) {
            this.track.removeEventListener('transitionend', this.scrollEndHandler);
            this.scrollEndHandler = undefined;
        }
        if (this.track) {
            this.track.style.transition = 'none';
        }
    }

    private destroyToast(): void {
        this.killScrollTween();
        this.root?.remove();
        this.root = undefined;
        this.viewport = undefined;
        this.track = undefined;
        this.messageEl = undefined;
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
        this.killScrollTween();
        if (this.root) {
            this.root.style.transition = 'none';
        }
    }
}
