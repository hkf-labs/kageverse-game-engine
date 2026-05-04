import * as Phaser from 'phaser';
import type { MonsterInstanceDTO } from '../../network/api';
import { t } from '../../i18n';
import type { GameComponent } from './types';

// Boss HP bar — full-width banner top-of-screen cho leader / world_boss grade.
// Dùng song song với MonsterTargetFrame: TargetFrame vẫn show info quái đang
// nhắm (mọi grade), BossHPBar chỉ hiện khi engage boss-grade — gây cảm giác
// "đại chiến". Q17 mq_first_trial dùng cho Kage Tinh Khôi (lv 20 leader).

// Boss/monster names — content translation, defer iteration sau (cùng pattern
// MonsterTargetFrame). Khi mở rộng → namespace `monster.<id>.name`.
const MONSTER_NAME_VI: Record<string, string> = {
    kage_pristine: 'Kage Tinh Khôi',
    living_stone_iwagumo: 'Đá Sống Iwagumo',
    striped_tiger: 'Hổ Vằn',
    shadow_crow: 'Quạ Bóng',
    mountain_bear: 'Gấu Núi',
    flame_sprite: 'Tinh Hỏa',
};

const GRADE_KEY: Record<string, string> = {
    leader: 'monster.grade.leader',
    world_boss: 'monster.grade.world_boss',
};

const BAR_HEIGHT = 70;
const HP_BAR_H = 22;
const SIDE_PADDING = 80; // không kéo hết viền màn để chừa minimap / topbar.

export class BossHPBar implements GameComponent {
    private scene: Phaser.Scene;
    private container?: Phaser.GameObjects.Container;
    private bg?: Phaser.GameObjects.Graphics;
    private hpBarBg?: Phaser.GameObjects.Graphics;
    private hpBarFill?: Phaser.GameObjects.Graphics;
    private nameText?: Phaser.GameObjects.Text;
    private gradeText?: Phaser.GameObjects.Text;
    private hpText?: Phaser.GameObjects.Text;
    private currentInstanceId: string | null = null;
    private currentMaxHP = 0;
    private currentHP = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const sw = this.scene.scale.width;
        const top = 50; // dưới topbar nhưng trên TargetFrame.
        this.container = this.scene.add.container(sw / 2, top)
            .setScrollFactor(0).setDepth(106).setVisible(false);

        this.bg = this.scene.add.graphics();
        this.container.add(this.bg);

        this.nameText = this.scene.add.text(0, 8, '', {
            fontSize: '18px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0);
        this.container.add(this.nameText);

        this.gradeText = this.scene.add.text(0, 30, '', {
            fontSize: '11px', color: '#ff8a8a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 0);
        this.container.add(this.gradeText);

        this.hpBarBg = this.scene.add.graphics();
        this.hpBarFill = this.scene.add.graphics();
        this.container.add([this.hpBarBg, this.hpBarFill]);

        this.hpText = this.scene.add.text(0, BAR_HEIGHT - HP_BAR_H / 2 - 4, '', {
            fontSize: '12px', fontStyle: 'bold', color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5);
        this.container.add(this.hpText);
    }

    isEngaged(): boolean { return this.currentInstanceId != null; }

    /** Engage boss — show banner + HP bar. No-op nếu grade không phải leader+. */
    engage(m: MonsterInstanceDTO): void {
        if (m.grade !== 'leader' && m.grade !== 'world_boss') return;
        // Đã engage cùng instance → no-op.
        if (this.currentInstanceId === m.instance_id) return;
        this.currentInstanceId = m.instance_id;
        this.currentMaxHP = m.max_hp;
        this.currentHP = m.current_hp;
        const name = MONSTER_NAME_VI[m.template_id] ?? m.template_id;
        const gradeKey = GRADE_KEY[m.grade];
        const gradeLabel = gradeKey ? t(gradeKey) : m.grade.toUpperCase();
        this.nameText?.setText(`⚔️ ${name} · Lv ${m.level}`);
        this.gradeText?.setText(`【 ${gradeLabel} 】`);
        this.repaint();
        if (this.container) {
            this.container.setVisible(true).setAlpha(0);
            this.scene.tweens.add({
                targets: this.container, alpha: 1, duration: 300, ease: 'Cubic.easeOut',
            });
        }
    }

    /** Update HP bar nếu instance khớp. */
    updateHP(instanceId: string, currentHP: number): void {
        if (this.currentInstanceId !== instanceId) return;
        this.currentHP = Math.max(0, currentHP);
        this.repaint();
    }

    /** Boss chết → flash + fade out 1s. */
    onBossDead(instanceId: string): void {
        if (this.currentInstanceId !== instanceId) return;
        this.currentHP = 0;
        this.repaint();
        if (!this.container) return;
        this.scene.tweens.add({
            targets: this.container, alpha: 0, duration: 1000, ease: 'Cubic.easeIn',
            onComplete: () => {
                this.container?.setVisible(false).setAlpha(1);
                this.currentInstanceId = null;
            },
        });
    }

    /** Hard reset (vd scene change / target cleared). */
    disengage(): void {
        if (!this.container) return;
        this.container.setVisible(false).setAlpha(1);
        this.currentInstanceId = null;
    }

    destroy(): void {
        this.container?.destroy();
        this.container = undefined;
        this.currentInstanceId = null;
    }

    private repaint(): void {
        if (!this.bg || !this.hpBarBg || !this.hpBarFill || !this.hpText) return;
        const sw = this.scene.scale.width;
        const w = sw - SIDE_PADDING * 2;
        // BG dramatic — đỏ tối + viền vàng đậm.
        this.bg.clear();
        this.bg.fillStyle(0x1a0a0a, 0.92);
        this.bg.fillRoundedRect(-w / 2, 0, w, BAR_HEIGHT, 10);
        this.bg.lineStyle(3, 0xffea7a, 1);
        this.bg.strokeRoundedRect(-w / 2, 0, w, BAR_HEIGHT, 10);

        const ratio = this.currentMaxHP > 0 ? this.currentHP / this.currentMaxHP : 0;
        this.hpText.setText(
            `${formatNum(this.currentHP)} / ${formatNum(this.currentMaxHP)}  (${Math.floor(ratio * 100)}%)`,
        );
        this.drawHPBar(ratio, w);
    }

    private drawHPBar(ratio: number, totalW: number): void {
        if (!this.hpBarBg || !this.hpBarFill) return;
        const x = -totalW / 2 + 14;
        const y = BAR_HEIGHT - HP_BAR_H - 8;
        const w = totalW - 28;
        this.hpBarBg.clear();
        this.hpBarBg.fillStyle(0x3a1010, 0.85);
        this.hpBarBg.fillRoundedRect(x, y, w, HP_BAR_H, 6);
        this.hpBarBg.lineStyle(1, 0x7a3030, 1);
        this.hpBarBg.strokeRoundedRect(x, y, w, HP_BAR_H, 6);

        this.hpBarFill.clear();
        const r = Math.max(0, Math.min(1, ratio));
        if (r > 0) {
            const fillW = Math.max(2, Math.floor((w - 2) * r));
            // Phase color: full → red → orange → yellow → red dark khi gần chết.
            const color = r > 0.66 ? 0xff5454 : r > 0.33 ? 0xff9f3a : 0xc81818;
            this.hpBarFill.fillStyle(color, 1);
            this.hpBarFill.fillRoundedRect(x + 1, y + 1, fillW, HP_BAR_H - 2, 5);
        }
    }
}

function formatNum(n: number): string {
    return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}
