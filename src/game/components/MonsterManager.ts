import * as Phaser from 'phaser';
import type { GameComponent, MonsterConfig, MonsterLevel } from './types';
import type { MapBackground } from './MapBackground';

interface MonsterStyle {
    color: number;
    eyeColor: number;
    radius: number;
    maxHp: number;
    bodyHeight: number;
}

interface MonsterEntry {
    config: MonsterConfig;
    body: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    hpBarBg: Phaser.GameObjects.Graphics;
    hpBarFill: Phaser.GameObjects.Graphics;
    hp: number;
    style: MonsterStyle;
    baseY: number;
}

const STYLES: Record<MonsterLevel, MonsterStyle> = {
    1: { color: 0x6dd96d, eyeColor: 0x163b16, radius: 22, maxHp: 30, bodyHeight: 36 },
    3: { color: 0x4aa8ff, eyeColor: 0x09233f, radius: 30, maxHp: 80, bodyHeight: 56 },
    5: { color: 0xe05050, eyeColor: 0x3a0808, radius: 40, maxHp: 180, bodyHeight: 78 },
};

export class MonsterManager implements GameComponent {
    private scene: Phaser.Scene;
    private background: MapBackground;
    private configs: MonsterConfig[];
    private monsters: MonsterEntry[] = [];

    constructor(scene: Phaser.Scene, background: MapBackground, configs: MonsterConfig[]) {
        this.scene = scene;
        this.background = background;
        this.configs = configs;
    }

    create(): void {
        const scaleFactor = this.scene.scale.height / 1440;

        this.configs.forEach((cfg) => {
            const scaledX = cfg.x * scaleFactor;
            const style = STYLES[cfg.level];
            const surfaceY = cfg.y !== undefined
                ? cfg.y * scaleFactor
                : this.background.getPlatformYAtX(scaledX);
            const baseY = surfaceY - style.bodyHeight / 2 - 4;

            const body = this.scene.add.graphics().setDepth(8);
            this.drawBody(body, scaledX, baseY, style);

            const hpBarWidth = style.radius * 2 + 16;
            const hpBarHeight = 6;
            const hpBarY = baseY - style.bodyHeight / 2 - 22;
            const hpBarBg = this.scene.add.graphics().setDepth(9);
            const hpBarFill = this.scene.add.graphics().setDepth(10);

            const label = this.scene.add.text(scaledX, hpBarY - 14, `${cfg.name} Lv.${cfg.level}`, {
                fontSize: '12px', color: '#ffffff', fontFamily: 'system-ui, sans-serif',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(11);

            const entry: MonsterEntry = {
                config: cfg,
                body,
                label,
                hpBarBg,
                hpBarFill,
                hp: style.maxHp,
                style,
                baseY,
            };
            this.drawHpBar(entry, scaledX, hpBarY, hpBarWidth, hpBarHeight);

            this.monsters.push(entry);
        });
    }

    update(): void {
        const t = this.scene.time.now / 1000;
        this.monsters.forEach((m, i) => {
            const scaleFactor = this.scene.scale.height / 1440;
            const x = m.config.x * scaleFactor;
            const bob = Math.sin(t * 1.6 + i) * 3;
            this.drawBody(m.body, x, m.baseY + bob, m.style);
            m.label.setY(m.baseY - m.style.bodyHeight / 2 - 22 - 14 + bob);
        });
    }

    destroy(): void {
        this.monsters.forEach((m) => {
            m.body.destroy();
            m.label.destroy();
            m.hpBarBg.destroy();
            m.hpBarFill.destroy();
        });
        this.monsters = [];
    }

    private drawBody(g: Phaser.GameObjects.Graphics, x: number, y: number, s: MonsterStyle): void {
        g.clear();
        // Shadow
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(x, y + s.bodyHeight / 2 + 4, s.radius * 2, 10);
        // Body
        g.fillStyle(s.color, 1);
        g.fillEllipse(x, y, s.radius * 2, s.bodyHeight);
        // Outline
        g.lineStyle(2, 0x000000, 0.6);
        g.strokeEllipse(x, y, s.radius * 2, s.bodyHeight);
        // Eyes
        const eyeOffsetX = s.radius * 0.35;
        const eyeOffsetY = -s.bodyHeight * 0.15;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(x - eyeOffsetX, y + eyeOffsetY, 4);
        g.fillCircle(x + eyeOffsetX, y + eyeOffsetY, 4);
        g.fillStyle(s.eyeColor, 1);
        g.fillCircle(x - eyeOffsetX, y + eyeOffsetY, 2);
        g.fillCircle(x + eyeOffsetX, y + eyeOffsetY, 2);
    }

    private drawHpBar(m: MonsterEntry, x: number, y: number, w: number, h: number): void {
        m.hpBarBg.clear();
        m.hpBarBg.fillStyle(0x000000, 0.7);
        m.hpBarBg.fillRoundedRect(x - w / 2, y, w, h, 3);

        const ratio = Math.max(0, m.hp / m.style.maxHp);
        m.hpBarFill.clear();
        m.hpBarFill.fillStyle(0xff5454, 1);
        m.hpBarFill.fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * ratio, h - 2, 2);
    }
}
