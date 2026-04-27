import * as Phaser from 'phaser';
import type { GameComponent } from './types';

interface DirBtnEntry {
    g: Phaser.GameObjects.Graphics;
    dir: 'left' | 'right' | 'up';
    cx: number;
    cy: number;
    r: number;
}

export interface ControlCallbacks {
    onInteract: () => void;
    onHpPotion: () => void;
    onMpPotion: () => void;
    onCycleTarget: () => void;
    onDirLeft?: () => void;
    onDirRight?: () => void;
}

export class GameControls implements GameComponent {
    private virtualInputs = { left: false, right: false, up: false };
    private dirBtns: DirBtnEntry[] = [];
    private switchTargetBtn?: { bg: Phaser.GameObjects.Arc; txt: Phaser.GameObjects.Text };
    private scene: Phaser.Scene;
    private callbacks: ControlCallbacks;

    constructor(scene: Phaser.Scene, callbacks: ControlCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;
    }

    create(): void {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;

        const cx = 80;
        const cy = height - 70;
        const dirRadius = 28;
        const offset = 64;

        const makeDirBtn = (x: number, y: number, dir: 'left' | 'right' | 'up', onPress?: () => void) => {
            const dirG = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
            const hit = this.scene.add.circle(x, y, dirRadius, 0xffffff, 0.001)
                .setScrollFactor(0).setDepth(101)
                .setInteractive({ useHandCursor: true });
            const entry: DirBtnEntry = { g: dirG, dir, cx: x, cy: y, r: dirRadius };
            this.dirBtns.push(entry);
            this.redrawDirBtn(entry, false);

            hit.on('pointerdown', () => { if (onPress) onPress(); this.virtualInputs[dir] = true; });
            hit.on('pointerup', () => { this.virtualInputs[dir] = false; });
            hit.on('pointerout', () => { this.virtualInputs[dir] = false; });
        };

        makeDirBtn(cx, cy - offset, 'up');
        makeDirBtn(cx - offset, cy, 'left', this.callbacks.onDirLeft);
        makeDirBtn(cx + offset, cy, 'right', this.callbacks.onDirRight);

        const ATTACK_X = width - 72;
        const ATTACK_Y = height - 78;
        const attackBtn = this.scene.add.image(ATTACK_X, ATTACK_Y, 'btn_attack')
            .setScrollFactor(0).setDepth(100).setScale(0.7)
            .setInteractive({ useHandCursor: true });
        attackBtn.on('pointerdown', () => { attackBtn.setScale(0.66); this.callbacks.onInteract(); });
        attackBtn.on('pointerup', () => attackBtn.setScale(0.7));
        attackBtn.on('pointerout', () => attackBtn.setScale(0.7));

        const SAT_RADIUS = 22;
        const SAT_DISTANCE = 78;
        const makeSatBtn = (angleDeg: number, fillColor: number, label: string, labelColor: string, onClick: () => void) => {
            const rad = Phaser.Math.DegToRad(angleDeg);
            const x = ATTACK_X + Math.cos(rad) * SAT_DISTANCE;
            const y = ATTACK_Y + Math.sin(rad) * SAT_DISTANCE;

            const bg = this.scene.add.circle(x, y, SAT_RADIUS, fillColor, 0.92)
                .setStrokeStyle(3, 0xe29e4a).setScrollFactor(0).setDepth(100)
                .setInteractive({ useHandCursor: true });
            const txt = this.scene.add.text(x, y, label, {
                fontSize: '14px', fontStyle: 'bold', color: labelColor,
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

            bg.on('pointerdown', () => {
                if ((bg as Phaser.GameObjects.Arc & { disabled?: boolean }).disabled) return;
                bg.setScale(0.9); onClick();
            });
            bg.on('pointerup', () => bg.setScale(1));
            bg.on('pointerout', () => bg.setScale(1));
            return { bg, txt };
        };

        makeSatBtn(180, 0x7a1a1a, 'HP', '#ffe4e4', this.callbacks.onHpPotion);
        makeSatBtn(225, 0x163d6e, 'MP', '#dceeff', this.callbacks.onMpPotion);
        this.switchTargetBtn = makeSatBtn(270, 0x4d2d13, '⇄', '#ffea7a', this.callbacks.onCycleTarget);

        const slotY = height - 30;
        for (let i = 0; i < 5; i += 1) {
            const rRect = this.drawRoundedRect(width / 2 - 120 + i * 50, slotY, 42, 24, 0x5c3a19, 0xe29e4a);
            const pDots = this.drawPixelDots(width / 2 - 118 + i * 50, slotY + 2, 40, 20, 0xd9c39e, 8);
            if (rRect) { rRect.setScrollFactor(0); rRect.setDepth(100); }
            if (pDots) { pDots.setScrollFactor(0); pDots.setDepth(100); }
        }
    }

    getVirtualInputs(): { left: boolean; right: boolean; up: boolean } { return this.virtualInputs; }

    updateVisuals(cursors?: Phaser.Types.Input.Keyboard.CursorKeys): void {
        for (const btn of this.dirBtns) {
            const keyDown = cursors ? !!cursors[btn.dir]?.isDown : false;
            const active = this.virtualInputs[btn.dir] || keyDown;
            this.redrawDirBtn(btn, active);
        }
    }

    updateSwitchTarget(canSwitch: boolean): void {
        if (!this.switchTargetBtn) return;
        this.switchTargetBtn.bg.setAlpha(canSwitch ? 1 : 0.4);
        this.switchTargetBtn.txt.setAlpha(canSwitch ? 1 : 0.5);
        (this.switchTargetBtn.bg as Phaser.GameObjects.Arc & { disabled?: boolean }).disabled = !canSwitch;
    }

    private redrawDirBtn(btn: DirBtnEntry, active: boolean): void {
        const { g, dir, cx, cy, r } = btn;
        g.clear();
        g.fillStyle(active ? 0x6b3a14 : 0x352313, 0.92);
        g.fillCircle(cx, cy, r);
        g.lineStyle(3, active ? 0xffea7a : 0xe29e4a, 1);
        g.strokeCircle(cx, cy, r);

        const arrowColor = active ? 0xffea7a : 0xe29e4a;
        const arm = r * 0.5;
        g.fillStyle(arrowColor, 1);
        g.lineStyle(2, 0x000000, 0.5);
        g.beginPath();
        if (dir === 'up') {
            g.moveTo(cx, cy - arm); g.lineTo(cx + arm * 0.85, cy + arm * 0.55); g.lineTo(cx - arm * 0.85, cy + arm * 0.55);
        } else if (dir === 'left') {
            g.moveTo(cx - arm, cy); g.lineTo(cx + arm * 0.55, cy - arm * 0.85); g.lineTo(cx + arm * 0.55, cy + arm * 0.85);
        } else {
            g.moveTo(cx + arm, cy); g.lineTo(cx - arm * 0.55, cy - arm * 0.85); g.lineTo(cx - arm * 0.55, cy + arm * 0.85);
        }
        g.closePath(); g.fillPath(); g.strokePath();

        if (active) { g.lineStyle(2, 0xffea7a, 0.6); g.strokeCircle(cx, cy, r + 3); }
    }

    private drawRoundedRect(x: number, y: number, w: number, h: number, fill: number, stroke: number): Phaser.GameObjects.Graphics {
        const g = this.scene.add.graphics();
        g.fillStyle(fill, 0.9); g.fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, stroke, 1); g.strokeRoundedRect(x, y, w, h, 8);
        return g;
    }

    private drawPixelDots(x: number, y: number, w: number, h: number, color: number, count: number): Phaser.GameObjects.Graphics {
        const g = this.scene.add.graphics();
        g.fillStyle(color, 1);
        for (let i = 0; i < count; i += 1) {
            const px = x + Math.floor(Math.random() * w);
            const py = y + Math.floor(Math.random() * h);
            g.fillRect(px, py, 2, 2);
        }
        return g;
    }
}
