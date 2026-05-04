import * as Phaser from 'phaser';
import type { MonsterInstanceDTO } from '../../network/api';
import { t } from '../../i18n';
import type { GameComponent } from './types';

// Grade label resolve qua i18n key — normal trả empty (suffix optional).
const GRADE_KEY: Record<string, string> = {
    elite: 'monster.grade.elite',
    leader: 'monster.grade.leader',
    world_boss: 'monster.grade.world_boss',
};

function gradeLabel(grade: string): string {
    const key = GRADE_KEY[grade];
    return key ? t(key) : '';
}

const GRADE_TINT: Record<string, number> = {
    normal: 0xc0c0c0,
    elite: 0x9affb4,
    leader: 0xffea7a,
    world_boss: 0xff8a8a,
};

interface FrameMonsterSnapshot {
    instanceId: string;
    templateId: string;
    name: string;
    level: number;
    grade: string;
    maxHP: number;
    currentHP: number;
}

const FRAME_W = 280;
const FRAME_H = 50;
const HP_BAR_H = 14;

/**
 * Target frame top-center hiển thị info quái đang nhắm.
 * Layout: tên + Lv (+ grade nếu có) | HP bar (current / max).
 * Update qua setTarget() / updateHP() / clear().
 */
export class MonsterTargetFrame implements GameComponent {
    private scene: Phaser.Scene;
    private container?: Phaser.GameObjects.Container;
    private bg?: Phaser.GameObjects.Graphics;
    private nameText?: Phaser.GameObjects.Text;
    private hpBarBg?: Phaser.GameObjects.Graphics;
    private hpBarFill?: Phaser.GameObjects.Graphics;
    private hpText?: Phaser.GameObjects.Text;
    private currentSnapshot: FrameMonsterSnapshot | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const cx = this.scene.scale.width / 2;
        const top = 100; // dưới topbar (topbar height ~91)
        this.container = this.scene.add.container(cx, top).setScrollFactor(0).setDepth(105).setVisible(false);

        this.bg = this.scene.add.graphics();
        this.drawBg();
        this.container.add(this.bg);

        this.nameText = this.scene.add.text(0, 4, '', {
            fontSize: '13px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 0);
        this.container.add(this.nameText);

        this.hpBarBg = this.scene.add.graphics();
        this.hpBarFill = this.scene.add.graphics();
        this.container.add([this.hpBarBg, this.hpBarFill]);

        this.hpText = this.scene.add.text(0, FRAME_H - HP_BAR_H / 2 - 6, '', {
            fontSize: '10px', color: '#fff', fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
        this.container.add(this.hpText);
    }

    setTarget(m: MonsterInstanceDTO): void {
        const snap: FrameMonsterSnapshot = {
            instanceId: m.instance_id,
            templateId: m.template_id,
            name: monsterDisplayName(m.template_id, m.name_key),
            level: m.level,
            grade: m.grade,
            maxHP: m.max_hp,
            currentHP: m.current_hp,
        };
        this.currentSnapshot = snap;
        this.repaint();
        this.container?.setVisible(true);
    }

    /** Cập nhật HP của target hiện tại (từ AttackResponse hits). */
    updateHP(instanceId: string, currentHP: number): void {
        if (!this.currentSnapshot || this.currentSnapshot.instanceId !== instanceId) return;
        this.currentSnapshot.currentHP = Math.max(0, currentHP);
        this.repaint();
    }

    /** Quái chết → fade out 500ms rồi ẩn. */
    onMonsterDead(instanceId: string): void {
        if (!this.currentSnapshot || this.currentSnapshot.instanceId !== instanceId) return;
        this.currentSnapshot.currentHP = 0;
        this.repaint();
        if (!this.container) return;
        this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            duration: 500,
            onComplete: () => {
                this.container?.setVisible(false).setAlpha(1);
                this.currentSnapshot = null;
            },
        });
    }

    clear(): void {
        if (!this.container) return;
        this.container.setVisible(false).setAlpha(1);
        this.currentSnapshot = null;
    }

    isShowing(): boolean { return this.currentSnapshot != null; }

    getCurrentInstanceId(): string | null {
        return this.currentSnapshot?.instanceId ?? null;
    }

    destroy(): void {
        this.container?.destroy();
        this.container = undefined;
        this.currentSnapshot = null;
    }

    private repaint(): void {
        if (!this.currentSnapshot || !this.nameText || !this.hpText) return;
        const s = this.currentSnapshot;
        const grade = gradeLabel(s.grade);
        const gradeSuffix = grade ? ` · ${grade}` : '';
        this.nameText.setText(`${s.name} · Lv ${s.level}${gradeSuffix}`);
        const tint = GRADE_TINT[s.grade] ?? 0xffea7a;
        this.nameText.setColor(rgbHex(tint));

        this.hpText.setText(`${formatNum(s.currentHP)} / ${formatNum(s.maxHP)}`);
        this.drawHPBar(s.currentHP / Math.max(1, s.maxHP));
    }

    private drawBg(): void {
        if (!this.bg) return;
        this.bg.clear();
        this.bg.fillStyle(0x0a0a0a, 0.78);
        this.bg.fillRoundedRect(-FRAME_W / 2, 0, FRAME_W, FRAME_H, 8);
        this.bg.lineStyle(2, 0x4d2d13, 0.9);
        this.bg.strokeRoundedRect(-FRAME_W / 2, 0, FRAME_W, FRAME_H, 8);
    }

    private drawHPBar(ratio: number): void {
        if (!this.hpBarBg || !this.hpBarFill) return;
        const x = -FRAME_W / 2 + 12;
        const y = FRAME_H - HP_BAR_H - 6;
        const w = FRAME_W - 24;
        this.hpBarBg.clear();
        this.hpBarBg.fillStyle(0x3a1010, 0.8);
        this.hpBarBg.fillRoundedRect(x, y, w, HP_BAR_H, 4);
        this.hpBarBg.lineStyle(1, 0x7a3030, 1);
        this.hpBarBg.strokeRoundedRect(x, y, w, HP_BAR_H, 4);

        this.hpBarFill.clear();
        const r = Math.max(0, Math.min(1, ratio));
        if (r > 0) {
            const fillW = Math.max(2, Math.floor((w - 2) * r));
            const color = r > 0.5 ? 0xff5454 : r > 0.25 ? 0xff9f3a : 0xff3030;
            this.hpBarFill.fillStyle(color, 1);
            this.hpBarFill.fillRoundedRect(x + 1, y + 1, fillW, HP_BAR_H - 2, 3);
        }
    }
}

function monsterDisplayName(templateId: string, _nameKey: string): string {
    // Resolve qua i18n key `monster.name.<id>`. Missing → t() trả raw key →
    // fallback xuống raw template_id (cũng visible cho dev / placeholder).
    const i18nKey = `monster.name.${templateId}`;
    const localized = t(i18nKey);
    return localized === i18nKey ? templateId : localized;
}

function formatNum(n: number): string {
    return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

function rgbHex(rgb: number): string {
    return '#' + rgb.toString(16).padStart(6, '0');
}
