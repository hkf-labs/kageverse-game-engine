import * as Phaser from 'phaser';
import type { GameComponent } from './types';

export type CharacterVitals = {
    current_hp: number;
    max_hp: number;
    current_mp: number;
    max_mp: number;
    level: number;
};

const HP_BAR = { x: 105, y: 14, w: 170, h: 18 };
const MP_BAR = { x: 98,  y: 46, w: 125, h: 15 };

export class HUD implements GameComponent {
    private statusText?: Phaser.GameObjects.Text;
    private scene: Phaser.Scene;

    private hpFill?: Phaser.GameObjects.Graphics;
    private mpFill?: Phaser.GameObjects.Graphics;
    private hpText?: Phaser.GameObjects.Text;
    private mpText?: Phaser.GameObjects.Text;
    private levelText?: Phaser.GameObjects.Text;
    private expText?: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const width = this.scene.scale.width;

        const topbar = this.scene.add.image(0, 0, 'topbar').setOrigin(0, 0);
        topbar.setScale(0.5);

        // HP/MP = frame (vẽ 1 lần) + fill (redraw mỗi setStats theo ratio).
        const hpFrame = this.drawBarFrame(HP_BAR.x, HP_BAR.y, HP_BAR.w, HP_BAR.h, 0x5d1515, 0xff5454);
        this.hpFill = this.scene.add.graphics();
        this.redrawFill(this.hpFill, HP_BAR, 1, 0xff5454);

        const mpFrame = this.drawBarFrame(MP_BAR.x, MP_BAR.y, MP_BAR.w, MP_BAR.h, 0x10325a, 0x4da4ff);
        this.mpFill = this.scene.add.graphics();
        this.redrawFill(this.mpFill, MP_BAR, 1, 0x4da4ff);

        this.hpText = this.scene.add.text(192, 22, '— / —', {
            fontSize: '10px', color: '#fff', fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);

        this.mpText = this.scene.add.text(165, 53, '— / —', {
            fontSize: '10px', color: '#fff', fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);

        this.levelText = this.scene.add.text(45, 38, '–', {
            fontSize: '26px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0.5);

        this.expText = this.scene.add.text(45, 62, '0%', {
            fontSize: '11px', fontStyle: 'bold', color: '#ffffff',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5);

        const bg4 = this.drawBarFrame(width - 148, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg5 = this.drawBarFrame(width - 100, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg6 = this.drawBarFrame(width - 52, 14, 40, 30, 0x4d2d13, 0xd59a48);

        const fixed: Phaser.GameObjects.GameObject[] = [
            topbar, hpFrame, this.hpFill, mpFrame, this.mpFill,
            this.hpText, this.mpText, this.levelText, this.expText,
            bg4, bg5, bg6,
        ];
        fixed.forEach((obj) => {
            const o = obj as Phaser.GameObjects.GameObject & {
                setScrollFactor: (x: number, y?: number) => void;
                setDepth: (z: number) => void;
            };
            o.setScrollFactor(0);
            o.setDepth(100);
        });
        topbar.setDepth(101);
        this.levelText.setDepth(102);
        this.expText.setDepth(102);

        this.statusText = this.scene.add.text(16, 52, '', {
            fontSize: '12px', color: '#123047', fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
    }

    /**
     * Cập nhật HP/MP/Level từ snapshot character. Giá trị âm hoặc max=0 sẽ clamp về 0.
     */
    setStats(stats: CharacterVitals): void {
        const hpRatio = stats.max_hp > 0 ? clamp(stats.current_hp / stats.max_hp, 0, 1) : 0;
        const mpRatio = stats.max_mp > 0 ? clamp(stats.current_mp / stats.max_mp, 0, 1) : 0;

        if (this.hpFill) this.redrawFill(this.hpFill, HP_BAR, hpRatio, 0xff5454);
        if (this.mpFill) this.redrawFill(this.mpFill, MP_BAR, mpRatio, 0x4da4ff);

        this.hpText?.setText(`${formatBig(stats.current_hp)} / ${formatBig(stats.max_hp)}`);
        this.mpText?.setText(`${formatBig(stats.current_mp)} / ${formatBig(stats.max_mp)}`);
        this.levelText?.setText(String(stats.level));
    }

    setExpPercent(percent: number): void {
        const p = clamp(percent, 0, 100);
        this.expText?.setText(`${p.toFixed(2)}%`);
    }

    getStatusText(): Phaser.GameObjects.Text | undefined { return this.statusText; }

    setStatus(text: string, color?: string): void {
        this.statusText?.setText(text);
        if (color) this.statusText?.setColor(color);
    }

    private drawBarFrame(x: number, y: number, w: number, h: number, fillBg: number, stroke: number): Phaser.GameObjects.Graphics {
        const g = this.scene.add.graphics();
        g.fillStyle(fillBg, 0.9);
        g.fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, stroke, 1);
        g.strokeRoundedRect(x, y, w, h, 8);
        return g;
    }

    private redrawFill(g: Phaser.GameObjects.Graphics, rect: { x: number; y: number; w: number; h: number }, ratio: number, color: number): void {
        g.clear();
        if (ratio <= 0) return;
        const fillW = Math.max(1, Math.floor(rect.w * ratio));
        g.fillStyle(color, 1);
        // Inset 2px tránh đè lên viền frame.
        g.fillRoundedRect(rect.x + 1, rect.y + 1, fillW - 2, rect.h - 2, 6);
    }
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

// formatBig: rút gọn cho UI nhỏ. < 10K hiện full, >= 10K hiện K, >= 1M hiện M.
function formatBig(n: number): string {
    if (!Number.isFinite(n)) return '0';
    if (n < 10_000) return n.toLocaleString('en-US');
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}
