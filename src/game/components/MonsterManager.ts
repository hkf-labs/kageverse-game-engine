import * as Phaser from 'phaser';
import { combatAPI, type AttackResponse, type LootDropDTO, type MonsterInstanceDTO, type RetaliationDTO } from '../../network/api';
import { isPointInMainCameraView } from '../cameraView';
import { canAutoSelectVertically } from '../worldTarget';
import { canAttackMonsterBelow, isMonsterBelowPlayer } from '../combatClass';
import { getCurrentCharacter } from '../playerSession';
import { t, tOpt } from '../../i18n';
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
    onTargetSelected?: (m: MonsterInstanceDTO) => void;
    onTargetCleared?: () => void;
    onRetaliation?: (r: RetaliationDTO) => void;
    onTickResult?: (charHP: number, charDead: boolean) => void;
    /** Drops được sync từ ListMonsters poll — gọi mỗi lần refresh để LootDropManager
     * sync set drops (thêm mới + xoá đã nhặt). */
    onDropsSync?: (drops: LootDropDTO[]) => void;
}

// Player base attack range — Phase 1.5 hardcode khớp BE skillRegistry. Đơn vị
// RAW game coords (Tiled-space). Phase 2 đọc từ skill_templates per skill_id.
const PLAYER_ATTACK_RANGE_RAW_PX = 120;
const ATTACK_NEAREST_SCAN_RADIUS_PX = 400; // bán kính render-space tìm nearest khi auto-target
const LIST_POLL_INTERVAL_MS = 8000;        // poll list quái để sync respawn / new spawn
const COMBAT_TICK_INTERVAL_MS = 700;       // poll retaliation từ BE
const DEFAULT_SKILL_ID = 'none.basic_swing';

// Client-side cooldown gate per skill — mirror BE skillRegistry. Tránh spam
// request mỗi khi user giữ phím Enter; BE vẫn check authoritative.
const SKILL_COOLDOWN_MS: Record<string, number> = {
    'none.basic_swing': 800,
};
function getSkillCooldownMs(skillId: string): number {
    return SKILL_COOLDOWN_MS[skillId] ?? 800;
}

export class MonsterManager implements GameComponent {
    private scene: Phaser.Scene;
    private background: MapBackground;
    private mapId: string;
    private callbacks: MonsterManagerCallbacks;
    private safeZone: boolean;
    private monsters: MonsterEntry[] = [];
    private pollTimer?: number;
    private tickTimer?: number;
    private tickInFlight = false;
    private tickPaused = false;
    private inFlightAttack = false;
    private lastSwingAt = 0; // client-side cooldown gate
    private getPlayerPos: () => { x: number; y: number } | null = () => null;
    private selectedInstanceId: string | null = null;
    // 'auto' = đang dùng nearest in-range. 'manual' = player chủ động chọn,
    // sticky cho tới khi target chết / out of range.
    private selectionMode: 'auto' | 'manual' = 'auto';
    private autoMoveTargetScreenX: number | null = null;
    /** setVisible(false) khi mở menu — HP bar vẫn chỉ trên quái đang select. */
    private layerVisible = true;

    constructor(
        scene: Phaser.Scene,
        background: MapBackground,
        mapId: string,
        callbacks?: MonsterManagerCallbacks,
        options?: { safeZone?: boolean },
    ) {
        this.scene = scene;
        this.background = background;
        this.mapId = mapId;
        this.callbacks = callbacks ?? {};
        this.safeZone = options?.safeZone === true;
    }

    create(): void {
        this.scene.events.once('shutdown', () => this.cleanup());
        this.scene.events.once('destroy', () => this.cleanup());
        // Map an toàn (làng / trường phái) — không poll /monsters cũng không
        // chạy combat tick. update() vẫn no-op vì monsters[] rỗng.
        if (this.safeZone) return;
        // Async load — render khi có data.
        void this.refreshFromBE();
        this.pollTimer = window.setInterval(() => {
            void this.refreshFromBE();
        }, LIST_POLL_INTERVAL_MS);
        // Combat tick — luồng quái phản đòn độc lập.
        this.tickTimer = window.setInterval(() => {
            void this.combatTick();
        }, COMBAT_TICK_INTERVAL_MS);
    }

    /** Pause/resume combat tick (vd khi player chết / Đóng menu). */
    setTickPaused(paused: boolean): void { this.tickPaused = paused; }

    /** Toggle visibility sprite quái. HP bar chỉ trên target đang select. */
    setVisible(visible: boolean): void {
        this.layerVisible = visible;
        for (const m of this.monsters) {
            m.body.setVisible(visible);
            m.hitArea.setVisible(visible);
        }
        this.updateHpBarVisibility();
    }

    private hasAliveMonster(): boolean {
        for (const m of this.monsters) {
            if (m.dto.state === 'alive') return true;
        }
        return false;
    }

    private async combatTick(): Promise<void> {
        if (this.tickPaused || this.tickInFlight) return;
        // Map không có quái sống → no-op. Tránh tốn RPS ở Làng / Trường / map
        // không phải combat. Khi quái respawn / scene mới load, applyMonsterList
        // sẽ thêm vào và tick tự kích hoạt lại.
        if (!this.hasAliveMonster()) return;
        const character = getCurrentCharacter();
        if (!character) return;
        const pos = this.getPlayerPos();
        if (!pos) return;
        this.tickInFlight = true;
        try {
            const scaleFactor = this.scene.scale.height / 1440;
            const res = await combatAPI.tick(character.id, {
                map_id: this.mapId,
                player_x: pos.x / scaleFactor,
                player_y: pos.y / scaleFactor,
            });
            for (const ret of res.retaliations) {
                this.callbacks.onRetaliation?.(ret);
            }
            this.callbacks.onTickResult?.(res.character_current_hp, res.character_dead);
        } catch (err) {
            // Silent — tick fail không quan trọng UX.
            if (err instanceof Error) console.warn('combat: tick failed', err.message);
        } finally {
            this.tickInFlight = false;
        }
    }

    update(): void {
        const t = this.scene.time.now / 1000;
        for (const m of this.monsters) {
            const bob = Math.sin(t * 1.6 + m.bobOffset) * 3;
            this.drawBody(m.body, m.renderX, m.baseY + bob, m.style, m.dto.state === 'dead');
            // Sync hit area position theo bob.
            m.hitArea.setPosition(m.renderX, m.baseY + bob);
        }
        const selected = this.getSelectedEntry();
        if (selected && !isPointInMainCameraView(this.scene, selected.renderX, selected.baseY)) {
            this.clearSelection();
        }
    }

    destroy(): void {
        this.cleanup();
    }

    /** BaseMapScene gọi để wire vị trí player (dùng cho range check + auto-target). */
    setPlayerPositionGetter(getter: () => { x: number; y: number } | null): void {
        this.getPlayerPos = getter;
    }

    /** Trigger swing với skill_id (default basic_swing). Tìm target ưu tiên: selected
     * → nearest in scan radius. Nếu ngoài tầm → toast, không tấn công.
     * Client-side cooldown gate: silent skip nếu chưa hết cooldown skill (mirror BE). */
    async swing(skillId: string = DEFAULT_SKILL_ID): Promise<boolean> {
        if (this.inFlightAttack) return false;
        const now = Date.now();
        if (now - this.lastSwingAt < getSkillCooldownMs(skillId)) return false;
        const pos = this.getPlayerPos();
        if (!pos) return false;

        // Ưu tiên monster đang được select (nếu còn alive). Fallback nearest.
        let target: MonsterEntry | null = null;
        if (this.selectedInstanceId) {
            const sel = this.monsters.find((m) => m.dto.instance_id === this.selectedInstanceId);
            if (sel && sel.dto.state === 'alive') target = sel;
        }
        if (!target) target = this.findNearestAlive(pos.x, pos.y, ATTACK_NEAREST_SCAN_RADIUS_PX);
        if (!target) {
            this.callbacks.onError?.(t('monster.error_no_target'));
            return false;
        }
        if (!this.canAttackTarget(pos, target)) {
            return false;
        }
        // Auto-select cho UX target frame.
        this.selectMonsterAuto(target.dto.instance_id);

        if (!this.isInRange(pos, target)) {
            this.autoMoveTargetScreenX = target.renderX;
            return false;
        }
        this.autoMoveTargetScreenX = null;
        await this.fireAttack(target, skillId, pos);
        return true;
    }

    getAutoMoveTargetX(): number | null {
        return this.autoMoveTargetScreenX;
    }

    clearAutoMove(): void {
        this.autoMoveTargetScreenX = null;
    }

    /** Enter — trong tầm đánh thì swing, xa thì chạy tới quái. */
    handleInteract(playerScreenX: number, playerScreenY: number): void {
        const target = this.getSelectedEntry();
        if (!target) return;
        const pos = this.getPlayerPos();
        if (!pos) return;
        const attackPos = { x: playerScreenX, y: playerScreenY };
        if (!this.canAttackTarget(attackPos, target)) return;
        if (this.isInRange({ x: playerScreenX, y: pos.y }, target)) {
            this.autoMoveTargetScreenX = null;
            void this.swing();
        } else {
            this.autoMoveTargetScreenX = target.renderX;
        }
    }

    checkAutoMoveArrival(playerScreenX: number, playerScreenY: number): boolean {
        if (this.autoMoveTargetScreenX === null) return false;
        const target = this.getSelectedEntry();
        if (!target) {
            this.autoMoveTargetScreenX = null;
            return false;
        }
        const pos = this.getPlayerPos();
        if (!pos) return false;
        if (!this.canAttackTarget({ x: playerScreenX, y: playerScreenY }, target)) {
            this.autoMoveTargetScreenX = null;
            return false;
        }
        if (!this.isInRange({ x: playerScreenX, y: pos.y }, target)) return false;
        this.autoMoveTargetScreenX = null;
        void this.swing();
        return true;
    }

    /** Click vào quái → manual select; chỉ đánh ngay nếu đã trong tầm. */
    private handleMonsterClick(instanceId: string): void {
        const target = this.monsters.find((m) => m.dto.instance_id === instanceId);
        if (!target || target.dto.state === 'dead') return;
        this.selectMonster(instanceId, true);
        const pos = this.getPlayerPos();
        if (!pos) return;
        if (!this.canAttackTarget(pos, target)) return;
        if (this.isInRange(pos, target)) {
            void this.fireAttack(target, DEFAULT_SKILL_ID, pos);
        }
    }

    /** Cận chiến / none: không đánh quái dưới chân; Cung (bow) được phép. */
    private canAttackTarget(
        playerPos: { x: number; y: number },
        target: MonsterEntry,
    ): boolean {
        const character = getCurrentCharacter();
        if (
            isMonsterBelowPlayer(playerPos.y, target.baseY)
            && !canAttackMonsterBelow(character?.class)
        ) {
            this.callbacks.onError?.(t('monster.error_target_below'));
            return false;
        }
        return true;
    }

    private getSelectedEntry(): MonsterEntry | undefined {
        if (!this.selectedInstanceId) return undefined;
        const ent = this.monsters.find((m) => m.dto.instance_id === this.selectedInstanceId);
        if (!ent || ent.dto.state !== 'alive') return undefined;
        return ent;
    }

    /** Range check 1D x trong raw coords — match BE check. Side-scroller, Y bỏ qua. */
    private isInRange(playerRendered: { x: number; y: number }, target: MonsterEntry): boolean {
        const scaleFactor = this.scene.scale.height / 1440;
        const playerRawX = playerRendered.x / scaleFactor;
        const dx = Math.abs(playerRawX - target.dto.pos_x);
        return dx <= PLAYER_ATTACK_RANGE_RAW_PX;
    }

    private async fireAttack(target: MonsterEntry, skillId: string, pos: { x: number; y: number }): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        if (this.inFlightAttack) return;
        this.inFlightAttack = true;
        this.lastSwingAt = Date.now(); // gate ngay khi bắt đầu request, không đợi response.
        try {
            // Convert player rendered pos → raw (BE coords match monster.pos_x).
            const scaleFactor = this.scene.scale.height / 1440;
            const playerRawX = pos.x / scaleFactor;
            const playerRawY = pos.y / scaleFactor;
            const res = await combatAPI.attack(character.id, {
                instance_id: target.dto.instance_id,
                map_id: this.mapId,
                skill_id: skillId,
                player_x: playerRawX,
                player_y: playerRawY,
            });
            // Apply hits per target.
            for (const hit of res.hits) {
                const ent = this.monsters.find((m) => m.dto.instance_id === hit.instance_id);
                if (!ent) continue;
                ent.dto.current_hp = hit.hp_remaining;
                if (hit.dead) {
                    ent.dto.state = 'dead';
                    if (this.selectedInstanceId === ent.dto.instance_id) {
                        // Frame fade-out qua callback; sau fade clear selection.
                    }
                }
                this.redrawHpBar(ent);
                this.spawnDamageFloater(
                    ent.renderX,
                    ent.baseY - ent.style.bodyHeight / 2 - 50,
                    hit.damage,
                    hit.is_crit,
                );
                this.flashHit(ent);
            }
            // Forward retaliations to scene (player floater + HUD).
            for (const ret of res.retaliations) {
                this.callbacks.onRetaliation?.(ret);
            }
            this.callbacks.onAttackResult?.(res);
        } catch (err) {
            let msg = t('monster.error_attack');
            if (err instanceof Error) {
                const key = err.message.match(/^([\w.]+)/)?.[1];
                msg = (key && tOpt(key)) || err.message;
            }
            this.callbacks.onError?.(msg);
        } finally {
            this.inFlightAttack = false;
        }
    }

    private selectMonster(instanceId: string, manual: boolean = false): void {
        if (this.selectedInstanceId === instanceId) {
            // Re-click cùng target → bump sang manual.
            if (manual) this.selectionMode = 'manual';
            return;
        }
        this.selectedInstanceId = instanceId;
        if (manual) this.selectionMode = 'manual';
        const ent = this.monsters.find((m) => m.dto.instance_id === instanceId);
        if (ent) {
            this.redrawHpBar(ent);
            this.callbacks.onTargetSelected?.(ent.dto);
        }
        this.updateHpBarVisibility();
    }

    clearSelection(): void {
        if (!this.selectedInstanceId) return;
        this.selectedInstanceId = null;
        this.selectionMode = 'auto';
        this.autoMoveTargetScreenX = null;
        this.updateHpBarVisibility();
        this.callbacks.onTargetCleared?.();
    }

    /** Auto-select từ unified world target (không bật manual sticky). */
    selectMonsterAuto(instanceId: string | null): void {
        if (!instanceId) {
            this.clearSelection();
            return;
        }
        const ent = this.monsters.find((m) => m.dto.instance_id === instanceId);
        if (!ent || ent.dto.state !== 'alive') {
            this.clearSelection();
            return;
        }
        if (this.selectedInstanceId === instanceId && this.selectionMode === 'auto') return;
        this.selectionMode = 'auto';
        this.selectedInstanceId = instanceId;
        this.redrawHpBar(ent);
        this.callbacks.onTargetSelected?.(ent.dto);
        this.updateHpBarVisibility();
    }

    /** Quái sống gần nhất trong tầm đánh (screen 2D). */
    findNearestInRange(
        playerX: number,
        playerY: number,
        maxRangePx: number,
    ): { instanceId: string; distSq: number } | null {
        const maxSq = maxRangePx * maxRangePx;
        let best: { instanceId: string; distSq: number } | null = null;
        for (const m of this.monsters) {
            if (m.dto.state !== 'alive') continue;
            if (!canAutoSelectVertically(playerY, m.baseY)) continue;
            if (isMonsterBelowPlayer(playerY, m.baseY) && !canAttackMonsterBelow(getCurrentCharacter()?.class)) {
                continue;
            }
            const dx = m.renderX - playerX;
            const dy = m.baseY - playerY;
            const distSq = dx * dx + dy * dy;
            if (distSq > maxSq) continue;
            if (!best || distSq < best.distSq) {
                best = { instanceId: m.dto.instance_id, distSq };
            }
        }
        return best;
    }

    getSelectedInstanceId(): string | null { return this.selectedInstanceId; }

    /** Backward compatibility cho các call site cũ. */
    async attackNearest(): Promise<boolean> { return this.swing(); }

    private async refreshFromBE(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        try {
            const res = await combatAPI.listMonsters(this.mapId, character.id);
            this.applyMonsterList(res.monsters);
            this.callbacks.onDropsSync?.(res.drops ?? []);
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
                if (this.selectedInstanceId === entry.dto.instance_id) this.clearSelection();
                this.destroyEntry(entry);
                continue;
            }
            entry.dto = dto;
            this.redrawHpBar(entry);
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

        // Invisible hit area lớn hơn body để dễ click.
        const hitArea = this.scene.add.rectangle(renderX, baseY, style.radius * 2 + 20, style.bodyHeight + 20, 0x000000, 0)
            .setDepth(7).setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
            this.handleMonsterClick(dto.instance_id);
        });

        const entry: MonsterEntry = {
            dto, body, hpBarBg, hpBarFill, hitArea,
            style, baseY, renderX,
            bobOffset: Math.random() * Math.PI * 2,
        };
        this.updateHpBarVisibility();
        return entry;
    }

    private destroyEntry(entry: MonsterEntry): void {
        entry.body.destroy();
        entry.hpBarBg.destroy();
        entry.hpBarFill.destroy();
        entry.hitArea.destroy();
    }

    /** Chỉ quái đang được select (và còn sống) hiện thanh máu trên map. */
    private updateHpBarVisibility(): void {
        for (const m of this.monsters) {
            const show =
                this.layerVisible
                && m.dto.instance_id === this.selectedInstanceId
                && m.dto.state === 'alive';
            m.hpBarBg.setVisible(show);
            m.hpBarFill.setVisible(show);
        }
    }

    private redrawHpBar(m: MonsterEntry): void {
        m.hpBarBg.clear();
        m.hpBarFill.clear();
        if (
            m.dto.state === 'dead'
            || m.dto.instance_id !== this.selectedInstanceId
        ) {
            m.hpBarBg.setVisible(false);
            m.hpBarFill.setVisible(false);
            return;
        }

        const w = m.style.radius * 2 + 16;
        const h = 6;
        const y = m.baseY - m.style.bodyHeight / 2 - 22;
        const x = m.renderX;

        m.hpBarBg.fillStyle(0x000000, 0.7);
        m.hpBarBg.fillRoundedRect(x - w / 2, y, w, h, 3);
        const ratio = m.dto.max_hp > 0 ? Math.max(0, m.dto.current_hp / m.dto.max_hp) : 0;
        if (ratio > 0) {
            m.hpBarFill.fillStyle(0xff5454, 1);
            m.hpBarFill.fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * ratio, h - 2, 2);
        }
        const show = this.layerVisible;
        m.hpBarBg.setVisible(show);
        m.hpBarFill.setVisible(show);
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

    private flashHit(m: MonsterEntry): void {
        // Tint đỏ flash 100ms — feedback hit. Body là Graphics, không có tint API
        // → re-draw với color override; sau timeout redraw normal.
        m.body.alpha = 1;
        this.scene.tweens.add({
            targets: m.body,
            alpha: 0.5,
            duration: 80,
            yoyo: true,
        });
    }

    private findNearestAlive(px: number, py: number, range: number): MonsterEntry | null {
        let best: MonsterEntry | null = null;
        let bestDist = range;
        const playerClass = getCurrentCharacter()?.class;
        for (const m of this.monsters) {
            if (m.dto.state === 'dead') continue;
            if (isMonsterBelowPlayer(py, m.baseY) && !canAttackMonsterBelow(playerClass)) {
                continue;
            }
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
        if (this.tickTimer !== undefined) {
            window.clearInterval(this.tickTimer);
            this.tickTimer = undefined;
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
