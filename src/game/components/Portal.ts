import * as Phaser from 'phaser';
import type { GameComponent, PortalConfig } from './types';
import type { MapBackground } from './MapBackground';

export class Portal implements GameComponent {
    private scene: Phaser.Scene;
    private config: PortalConfig;
    private background: MapBackground;
    private onEnter: () => void;

    private graphics?: Phaser.GameObjects.Graphics;
    private label?: Phaser.GameObjects.Text;
    private hint?: Phaser.GameObjects.Text;
    private centerX = 0;
    private centerY = 0;
    private radiusX = 50;
    private radiusY = 80;
    private inRange = false;
    private triggered = false;
    private locked = false;

    constructor(
        scene: Phaser.Scene,
        config: PortalConfig,
        background: MapBackground,
        onEnter: () => void,
    ) {
        this.scene = scene;
        this.config = config;
        this.background = background;
        this.onEnter = onEnter;
        this.locked = config.locked === true;
    }

    create(): void {
        const scaleFactor = this.scene.scale.height / 1440;
        const scaledX = this.config.x * scaleFactor;
        const groundY = this.background.getPlatformYAtX(scaledX);

        this.centerX = scaledX;
        this.centerY = groundY - this.radiusY - 10;

        this.graphics = this.scene.add.graphics().setDepth(7);

        this.label = this.scene.add.text(
            this.centerX,
            this.centerY - this.radiusY - 18,
            this.config.label,
            {
                fontSize: '14px', color: '#e6c8ff',
                fontFamily: 'system-ui, sans-serif',
                stroke: '#1a0030', strokeThickness: 3,
                backgroundColor: '#3a0d5a',
                padding: { left: 8, right: 8, top: 3, bottom: 3 },
            },
        ).setOrigin(0.5).setDepth(8);

        this.hint = this.scene.add.text(
            this.centerX,
            this.centerY + this.radiusY + 14,
            this.locked ? '↵ (Đã khoá)' : '↵ Bước vào',
            {
                fontSize: '12px', color: '#ffffff',
                fontFamily: 'system-ui, sans-serif',
                backgroundColor: '#00000099',
                padding: { left: 6, right: 6, top: 2, bottom: 2 },
            },
        ).setOrigin(0.5).setDepth(8).setVisible(false);
    }

    isLocked(): boolean { return this.locked; }
    getLockedMessage(): string | undefined { return this.config.lockedMessage; }
    getTargetSceneKey(): string { return this.config.targetSceneKey; }

    /** Override lockedMessage runtime — dùng khi gating thay đổi (vd map chưa unlock theo quest). */
    setLockedMessage(msg: string): void {
        this.config.lockedMessage = msg;
    }

    setLocked(locked: boolean): void {
        this.locked = locked;
        this.hint?.setText(locked ? '↵ (Đã khoá)' : '↵ Bước vào');
    }

    updatePortal(playerX: number, playerY: number): void {
        if (this.triggered) return;

        const t = this.scene.time.now / 1000;
        this.drawPortal(t);

        const dx = playerX - this.centerX;
        const dy = playerY - this.centerY;
        this.inRange = Math.abs(dx) < this.radiusX + 16 && Math.abs(dy) < this.radiusY + 60;
        this.hint?.setVisible(this.inRange);
    }

    isPlayerInRange(): boolean {
        return this.inRange && !this.triggered;
    }

    trigger(): void {
        if (this.triggered || this.locked) return;
        this.triggered = true;
        this.hint?.setVisible(false);

        const cam = this.scene.cameras.main;
        cam.fadeOut(450, 0, 0, 0);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.onEnter();
        });
    }

    destroy(): void {
        this.graphics?.destroy();
        this.label?.destroy();
        this.hint?.destroy();
    }

    private drawPortal(t: number): void {
        const g = this.graphics;
        if (!g) return;
        g.clear();

        const cx = this.centerX;
        const cy = this.centerY;
        const rx = this.radiusX;
        const ry = this.radiusY;

        const pulse = 1 + Math.sin(t * 2.4) * 0.04;

        const haloColor = this.locked ? 0x444444 : 0x6a1da8;
        const coreColor = this.locked ? 0x1a1a1a : 0x2a0d4a;
        g.fillStyle(haloColor, 0.18);
        g.fillEllipse(cx, cy, (rx + 18) * 2 * pulse, (ry + 18) * 2 * pulse);

        g.fillStyle(coreColor, 0.92);
        g.fillEllipse(cx, cy, rx * 2, ry * 2);

        const rings = 4;
        for (let i = 0; i < rings; i++) {
            const phase = t * (1.4 + i * 0.55) + (i * Math.PI) / 2;
            const ringRx = rx * (0.42 + i * 0.18);
            const ringRy = ry * (0.42 + i * 0.18);
            const alpha = 0.6 - i * 0.1;
            const color = this.locked
                ? (i % 2 === 0 ? 0x888888 : 0xaaaaaa)
                : (i % 2 === 0 ? 0xa56cff : 0x6cd0ff);

            g.lineStyle(3, color, alpha);
            g.beginPath();
            const steps = 36;
            for (let s = 0; s <= steps; s++) {
                const a = (s / steps) * Math.PI * 2 + phase;
                const x = cx + Math.cos(a) * ringRx;
                const y = cy + Math.sin(a) * ringRy;
                if (s === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
            }
            g.strokePath();
        }

        const sparks = 7;
        for (let i = 0; i < sparks; i++) {
            const a = t * 2 + (i * Math.PI * 2) / sparks;
            const r = 0.6 + 0.3 * Math.sin(t * 3 + i);
            const x = cx + Math.cos(a) * rx * r;
            const y = cy + Math.sin(a) * ry * r;
            g.fillStyle(0xffffff, 0.75);
            g.fillCircle(x, y, 2);
        }
    }
}
