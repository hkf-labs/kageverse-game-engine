import * as Phaser from 'phaser';
import { combatAPI, type AttackResponse, type MonsterInstanceDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';
import type { MapBackground } from './MapBackground';

interface MonsterStyle {
    color: number;
    eyeColor: number;
    radius: number;
    bodyHeight: number;
}

/** Style group theo level — dùng cho visual placeholder. Sau MVP có sprite riêng theo template. */
const STYLE_BY_LEVEL: { maxLevel: number; style: MonsterStyle }[] = [
    { maxLevel: 5,  style: { color: 0x6dd96d, eyeColor: 0x163b16, radius: 22, bodyHeight: 36 } },
    { maxLevel: 10, style: { color: 0x4aa8ff, eyeColor: 0x09233f, radius: 30, bodyHeight: 56 } },
    { maxLevel: 20, style: { color: 0xe05050, eyeColor: 0x3a0808, radius: 40, bodyHeight: 78 } },
];

const FLYING_ALTITUDE = 60;

interface MonsterEntry {
    dto: MonsterInstanceDTO;
    body: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    hpBarBg: Phaser.GameObjects.Graphics;
    hpBarFill: Phaser.GameObjects.Graphics;
    hitArea: Phaser.GameObjects.Rectangle;
    style: MonsterStyle;
    baseY: number; // vị trí render Y (đã trừ altitude nếu flying)
    renderX: number;
    bobOffset: number;
}

export interface MonsterManagerCallbacks {
    onAttackResult?: (res: AttackResponse) => void;
    onError?: (msg: string) => void;
}

const ATTACK_RANGE = 220;
const POLL_INTERVAL_MS = 8000;

export class MonsterManager implements GameComponent {
    private scene: Phaser.Scene;
    private background: MapBackground;
    private mapId: string;
    private callbacks: MonsterManagerCallbacks;
    private monsters: MonsterEntry[] = [];
    private pollTimer?: number;
    private inFlightAttack = false;
    private getPlayerPos: () => { x: number; y: number } | null = () => null;

    constructor(
        scene: Phaser.Scene,
        background: MapBackground,
        mapId: string,
        callbacks?: MonsterManagerCallbacks,
    ) {
        this.scene = scene;
        this.background = background;
        this.mapId = mapId;
        this.callbacks = callbacks ?? {};
    }

    create(): void {
        // Async load — render khi có data.
        void this.refreshFromBE();
        this.pollTimer = window.setInterval(() => {
            void this.refreshFromBE();
        }, POLL_INTERVAL_MS);
        this.scene.events.once('shutdown', () => this.cleanup());
        this.scene.events.once('destroy', () => this.cleanup());
    }

    update(): void {
        const t = this.scene.time.now / 1000;
        for (const m of this.monsters) {
            const bob = Math.sin(t * 1.6 + m.bobOffset) * 3;
            this.drawBody(m.body, m.renderX, m.baseY + bob, m.style, m.dto.state === 'dead');
            m.label.setY(m.baseY - m.style.bodyHeight / 2 - 36 + bob);
            // Sync hit area position theo bob.
            m.hitArea.setPosition(m.renderX, m.baseY + bob);
        }
    }

    destroy(): void {
        this.cleanup();
    }

    /** BaseMapScene gọi để wire vị trí player (dùng cho range check + auto-target). */
    setPlayerPositionGetter(getter: () => { x: number; y: number } | null): void {
        this.getPlayerPos = getter;
    }

    /** Public: trigger attack vào monster gần nhất trong range (gọi từ Attack button). */
    async attackNearest(): Promise<void> {
        if (this.inFlightAttack) return;
        const pos = this.getPlayerPos();
        if (!pos) return;
        const target = this.findNearestAlive(pos.x, pos.y, ATTACK_RANGE);
        if (!target) {
            this.callbacks.onError?.('Không có quái trong tầm đánh.');
            return;
        }
        await this.attackInstance(target.dto.instance_id);
    }

    private async attackInstance(instanceId: string): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        const target = this.monsters.find((m) => m.dto.instance_id === instanceId);
        if (!target || target.dto.state === 'dead') return;

        this.inFlightAttack = true;
        try {
            const res = await combatAPI.attack(character.id, {
                instance_id: instanceId,
                map_id: this.mapId,
            });
            // Update monster state.
            target.dto.current_hp = res.monster_hp_remaining;
            if (res.monster_dead) {
                target.dto.state = 'dead';
            }
            this.redrawHpBar(target);
            this.spawnDamageFloater(target.renderX, target.baseY - target.style.bodyHeight / 2 - 50, res.damage_dealt, res.is_crit);
            this.callbacks.onAttackResult?.(res);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Lỗi tấn công';
            this.callbacks.onError?.(msg);
        } finally {
            this.inFlightAttack = false;
        }
    }

    private async refreshFromBE(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        try {
            const res = await combatAPI.listMonsters(this.mapId, character.id);
            this.applyMonsterList(res.monsters);
        } catch (err) {
            if (err instanceof Error) console.warn('combat: list monsters failed', err.message);
        }
    }

    private applyMonsterList(list: MonsterInstanceDTO[]): void {
        const byID = new Map(list.map((m) => [m.instance_id, m]));

        // Update existing + remove gone.
        const keep: MonsterEntry[] = [];
        for (const entry of this.monsters) {
            const dto = byID.get(entry.dto.instance_id);
            if (!dto) {
                this.destroyEntry(entry);
                continue;
            }
            entry.dto = dto;
            this.redrawHpBar(entry);
            entry.label.setText(`${shortName(dto)} Lv.${dto.level}`);
            byID.delete(dto.instance_id);
            keep.push(entry);
        }
        this.monsters = keep;

        // Add new.
        for (const dto of byID.values()) {
            this.monsters.push(this.buildEntry(dto));
        }
    }

    private buildEntry(dto: MonsterInstanceDTO): MonsterEntry {
        const scaleFactor = this.scene.scale.height / 1440;
        const renderX = dto.pos_x * scaleFactor;
        const surfaceY = this.background.getPlatformYAtX(renderX);
        const style = pickStyle(dto.level);
        let baseY = surfaceY - style.bodyHeight / 2 - 4;
        if (dto.movement_type === 'flying') {
            baseY -= FLYING_ALTITUDE;
        }

        const body = this.scene.add.graphics().setDepth(8);
        const hpBarBg = this.scene.add.graphics().setDepth(9);
        const hpBarFill = this.scene.add.graphics().setDepth(10);
        const label = this.scene.add.text(renderX, baseY - style.bodyHeight / 2 - 36, `${shortName(dto)} Lv.${dto.level}`, {
            fontSize: '12px', color: '#ffffff', fontFamily: 'system-ui, sans-serif',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(11);

        // Invisible hit area lớn hơn body để dễ click.
        const hitArea = this.scene.add.rectangle(renderX, baseY, style.radius * 2 + 20, style.bodyHeight + 20, 0x000000, 0)
            .setDepth(7).setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
            void this.attackInstance(dto.instance_id);
        });

        const entry: MonsterEntry = {
            dto, body, label, hpBarBg, hpBarFill, hitArea,
            style, baseY, renderX,
            bobOffset: Math.random() * Math.PI * 2,
        };
        this.redrawHpBar(entry);
        return entry;
    }

    private destroyEntry(entry: MonsterEntry): void {
        entry.body.destroy();
        entry.label.destroy();
        entry.hpBarBg.destroy();
        entry.hpBarFill.destroy();
        entry.hitArea.destroy();
    }

    private redrawHpBar(m: MonsterEntry): void {
        const w = m.style.radius * 2 + 16;
        const h = 6;
        const y = m.baseY - m.style.bodyHeight / 2 - 22;
        const x = m.renderX;

        m.hpBarBg.clear();
        m.hpBarFill.clear();
        if (m.dto.state === 'dead') return;

        m.hpBarBg.fillStyle(0x000000, 0.7);
        m.hpBarBg.fillRoundedRect(x - w / 2, y, w, h, 3);
        const ratio = m.dto.max_hp > 0 ? Math.max(0, m.dto.current_hp / m.dto.max_hp) : 0;
        if (ratio > 0) {
            m.hpBarFill.fillStyle(0xff5454, 1);
            m.hpBarFill.fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * ratio, h - 2, 2);
        }
    }

    private drawBody(g: Phaser.GameObjects.Graphics, x: number, y: number, s: MonsterStyle, dead: boolean): void {
        g.clear();
        if (dead) {
            // Faint body ghost-like khi dead.
            g.fillStyle(s.color, 0.2);
            g.fillEllipse(x, y, s.radius * 2, s.bodyHeight);
            return;
        }
        // Shadow.
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(x, y + s.bodyHeight / 2 + 4, s.radius * 2, 10);
        // Body.
        g.fillStyle(s.color, 1);
        g.fillEllipse(x, y, s.radius * 2, s.bodyHeight);
        g.lineStyle(2, 0x000000, 0.6);
        g.strokeEllipse(x, y, s.radius * 2, s.bodyHeight);
        // Eyes.
        const eyeX = s.radius * 0.35;
        const eyeY = -s.bodyHeight * 0.15;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(x - eyeX, y + eyeY, 4);
        g.fillCircle(x + eyeX, y + eyeY, 4);
        g.fillStyle(s.eyeColor, 1);
        g.fillCircle(x - eyeX, y + eyeY, 2);
        g.fillCircle(x + eyeX, y + eyeY, 2);
    }

    private spawnDamageFloater(x: number, y: number, dmg: number, crit: boolean): void {
        const color = crit ? '#ffea7a' : '#ffffff';
        const size = crit ? '20px' : '16px';
        const txt = this.scene.add.text(x, y, crit ? `${dmg}!` : `${dmg}`, {
            fontSize: size, fontStyle: 'bold', color,
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(50);
        this.scene.tweens.add({
            targets: txt,
            y: y - 40,
            alpha: 0,
            duration: 700,
            ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy(),
        });
    }

    private findNearestAlive(px: number, py: number, range: number): MonsterEntry | null {
        let best: MonsterEntry | null = null;
        let bestDist = range;
        for (const m of this.monsters) {
            if (m.dto.state === 'dead') continue;
            const dx = m.renderX - px;
            const dy = m.baseY - py;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= bestDist) {
                bestDist = d;
                best = m;
            }
        }
        return best;
    }

    private cleanup(): void {
        if (this.pollTimer !== undefined) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        for (const m of this.monsters) this.destroyEntry(m);
        this.monsters = [];
    }
}

function pickStyle(level: number): MonsterStyle {
    for (const tier of STYLE_BY_LEVEL) {
        if (level <= tier.maxLevel) return tier.style;
    }
    return STYLE_BY_LEVEL[STYLE_BY_LEVEL.length - 1].style;
}

const NAME_BY_KEY: Record<string, string> = {
    'monster.turtle_gold': 'Rùa Vàng',
    'monster.slime_white': 'Slime Trắng',
    'monster.mist_sprite': 'Tinh Sương',
    'monster.goblin_wanderer': 'Goblin Lưu Lạc',
    'monster.stone_beetle': 'Bọ Đá',
    'monster.field_rat': 'Chuột Đồng',
    'monster.night_crow': 'Quạ Đêm',
    'monster.night_wolf': 'Sói Đêm',
    'monster.shadow_owl': 'Cú Bóng',
    'monster.mountain_monkey': 'Khỉ Núi',
    'monster.bamboo_spirit_yatomi': 'Tinh Tre Yatomi',
    'monster.goblin_warrior': 'Goblin Chiến Binh',
    'monster.wild_wolf': 'Sói Hoang',
    'monster.living_stone_iwagumo': 'Đá Sống Iwagumo',
    'monster.goblin_mage': 'Goblin Pháp Sư',
    'monster.striped_tiger': 'Hổ Vằn',
    'monster.shadow_crow': 'Quạ Bóng',
    'monster.mountain_bear': 'Gấu Núi',
    'monster.flame_sprite': 'Tinh Hỏa',
    'monster.kage_pristine': 'Kage Tinh Khôi',
};

function shortName(dto: MonsterInstanceDTO): string {
    return NAME_BY_KEY[dto.name_key] ?? dto.template_id;
}
