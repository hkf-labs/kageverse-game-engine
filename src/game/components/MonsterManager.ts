import * as Phaser from 'phaser';
import { combatAPI, type AttackResponse, type LootDropDTO, type MonsterInstanceDTO, type RetaliationDTO } from '../../network/api';
import { isPointInMainCameraView } from '../cameraView';
import { canAutoSelectVertically } from '../worldTarget';
import { canAttackMonsterBelow, isMonsterBelowPlayer } from '../combatClass';
import { isCombatTickEnabled } from '../env';
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

/** Bán kính bay chung — quỹ đạo tròn quanh điểm spawn (screen px). */
const FLY_ORBIT_RADIUS_PX = 40;
/** Bán kính đi bộ trái/phải quanh spawn (screen px). */
const GROUND_PATROL_RADIUS_PX = 52;
const GROUND_PATROL_SPEED_PX = 32;
const FLY_WANDER_TURN_RATE = 1.4;
const FLY_WANDER_PICK_MIN_MS = 1200;
const FLY_WANDER_PICK_MAX_MS = 2800;

interface MonsterEntry {
    dto: MonsterInstanceDTO;
    body: Phaser.GameObjects.Graphics;
    hpBarBg: Phaser.GameObjects.Graphics;
    hpBarFill: Phaser.GameObjects.Graphics;
    hitArea: Phaser.GameObjects.Rectangle;
    style: MonsterStyle;
    /** Điểm gốc spawn — không đổi khi wander (trừ respawn). */
    anchorRenderX: number;
    baseY: number;
    renderX: number;
    displayY: number;
    bobOffset: number;
    offsetX: number;
    offsetY: number;
    /** flying: góc hiện tại / mục tiêu trên vòng tròn orbit. */
    wanderAngle: number;
    wanderTargetAngle: number;
    nextWanderPickAt: number;
    /** ground (và aquatic sau này): patrol ngang. */
    patrolOffset: number;
    patrolDir: 1 | -1;
}

export interface MonsterManagerCallbacks {
    onAttackResult?: (res: AttackResponse) => void;
    onError?: (msg: string) => void;
    onTargetSelected?: (m: MonsterInstanceDTO) => void;
    onTargetCleared?: () => void;
    /** Click chuột chọn quái (khóa manual) — scene bật worldTargetSelectLocked. */
    onManualTargetLocked?: () => void;
    onRetaliation?: (r: RetaliationDTO) => void;
    onTickResult?: (charHP: number, charDead: boolean) => void;
    /** Drops được sync từ ListMonsters poll — gọi mỗi lần refresh để LootDropManager
     * sync set drops (thêm mới + xoá đã nhặt). */
    onDropsSync?: (drops: LootDropDTO[]) => void;
    /** Ngoảnh player về quái trước khi swing (screen X). */
    onFaceScreenX?: (screenX: number) => void;
    /** Loot/NPC click-lock — không auto-select quái khi swing. */
    isOtherWorldTargetManualLocked?: () => boolean;
}

// Player base attack range — Phase 1.5 hardcode khớp BE skillRegistry. Đơn vị
// RAW game coords (Tiled-space). Phase 2 đọc từ skill_templates per skill_id.
const PLAYER_ATTACK_RANGE_RAW_PX = 120;
const LIST_POLL_INTERVAL_MS = 8000;        // poll list quái để sync respawn / new spawn
const COMBAT_TICK_INTERVAL_MS = 700;       // poll retaliation từ BE
/** Hiệu ứng “đang đánh” — chỉ khi có retaliation, ~1 tick (không theo aggro idle). */
const MONSTER_ATTACK_FLASH_MS = 680;
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
    /** Quái vừa đánh player — bật khi có retaliation, tắt sau MONSTER_ATTACK_FLASH_MS. */
    private attackingUntil = new Map<string, number>();

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
        // Combat tick — luồng quái phản đòn độc lập (tắt: VITE_COMBAT_TICK_ENABLED=false).
        if (isCombatTickEnabled()) {
            this.tickTimer = window.setInterval(() => {
                void this.combatTick();
            }, COMBAT_TICK_INTERVAL_MS);
        }
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
                this.markMonsterAttacking(ret.instance_id);
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

    private markMonsterAttacking(instanceId: string): void {
        this.attackingUntil.set(instanceId, Date.now() + MONSTER_ATTACK_FLASH_MS);
    }

    private isMonsterAttacking(instanceId: string): boolean {
        const until = this.attackingUntil.get(instanceId);
        if (until === undefined) return false;
        if (Date.now() > until) {
            this.attackingUntil.delete(instanceId);
            return false;
        }
        return true;
    }

    private pruneExpiredAttackMarks(): void {
        const now = Date.now();
        for (const [id, until] of this.attackingUntil) {
            if (now > until) this.attackingUntil.delete(id);
        }
    }

    update(): void {
        this.pruneExpiredAttackMarks();
        const t = this.scene.time.now / 1000;
        const deltaMs = this.scene.game.loop.delta;
        for (const m of this.monsters) {
            if (m.dto.state === 'alive') {
                this.updateWander(m, deltaMs);
            } else {
                m.offsetX = 0;
                m.offsetY = 0;
                m.renderX = m.anchorRenderX;
                m.displayY = m.baseY;
            }
            const bob = Math.sin(t * 1.6 + m.bobOffset) * 3;
            const drawY = m.displayY + bob;
            const attacking = m.dto.state === 'alive' && this.isMonsterAttacking(m.dto.instance_id);
            this.drawBody(m.body, m.renderX, drawY, m.style, m.dto.state === 'dead', attacking);
            m.hitArea.setPosition(m.renderX, drawY);
            if (m.dto.instance_id === this.selectedInstanceId && m.dto.state === 'alive') {
                this.redrawHpBar(m);
            }
        }
        if (this.selectedInstanceId) {
            const sel = this.monsters.find((m) => m.dto.instance_id === this.selectedInstanceId);
            if (!sel || sel.dto.state !== 'alive') {
                this.clearSelection();
            }
        }
        const selected = this.getSelectedEntry();
        if (selected && !isPointInMainCameraView(this.scene, selected.renderX, selected.displayY)) {
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
        if (!target) target = this.findNearestAlive(pos.x, pos.y);
        if (!target) {
            this.callbacks.onError?.(t('monster.error_no_target'));
            return false;
        }
        if (!this.canAttackTarget(pos, target)) {
            return false;
        }
        if (!this.callbacks.isOtherWorldTargetManualLocked?.()) {
            this.selectMonsterAuto(target.dto.instance_id);
        }

        if (!this.isInRange(pos, target)) {
            this.autoMoveTargetScreenX = target.renderX;
            return false;
        }
        this.autoMoveTargetScreenX = null;
        this.callbacks.onFaceScreenX?.(target.renderX);
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

    /** Click chuột → chỉ chọn + khóa manual; đánh bằng Enter / nút tấn công. */
    private handleMonsterClick(instanceId: string): void {
        const target = this.monsters.find((m) => m.dto.instance_id === instanceId);
        if (!target || target.dto.state === 'dead') return;
        this.selectMonster(instanceId, true);
        this.callbacks.onManualTargetLocked?.();
    }

    /** Đang khóa mục tiêu bằng click — auto-select world target không ghi đè. */
    isManualSelection(): boolean {
        return this.selectionMode === 'manual' && this.selectedInstanceId !== null;
    }

    /** Cận chiến / none: không đánh quái dưới chân; Cung (bow) được phép. */
    private canAttackTarget(
        playerPos: { x: number; y: number },
        target: MonsterEntry,
    ): boolean {
        const character = getCurrentCharacter();
        if (
            isMonsterBelowPlayer(playerPos.y, target.displayY)
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
        const targetRawX = target.renderX / scaleFactor;
        const dx = Math.abs(playerRawX - targetRawX);
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
                        this.clearSelection();
                    }
                }
                this.redrawHpBar(ent);
                this.spawnDamageFloater(
                    ent.renderX,
                    ent.displayY - ent.style.bodyHeight / 2 - 50,
                    hit.damage,
                    hit.is_crit,
                );
                this.flashHit(ent);
            }
            // Forward retaliations to scene (player floater + HUD).
            for (const ret of res.retaliations) {
                this.markMonsterAttacking(ret.instance_id);
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

    /** Auto-select từ unified world target (không ghi đè manual click-lock). */
    selectMonsterAuto(instanceId: string | null): void {
        if (this.selectionMode === 'manual') return;
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

    /**
     * Quái sống gần nhất trong tầm đánh — chỉ trục X raw (khớp isInRange / BE),
     * không dùng vòng tròn 2D (tránh select bãi xa cùng hành lang Y).
     */
    findNearestInRange(
        playerX: number,
        playerY: number,
    ): { instanceId: string; distSq: number } | null {
        let best: { instanceId: string; distSq: number } | null = null;
        for (const m of this.monsters) {
            if (!this.isInAttackRangeForSelect(playerX, playerY, m)) continue;
            const dx = m.renderX - playerX;
            const distSq = dx * dx;
            if (!best || distSq < best.distSq) {
                best = { instanceId: m.dto.instance_id, distSq };
            }
        }
        return best;
    }

    /** Auto-select / swing fallback — cùng điều kiện tầm đánh với findNearestInRange. */
    private isInAttackRangeForSelect(playerX: number, playerY: number, m: MonsterEntry): boolean {
        if (m.dto.state !== 'alive') return false;
        if (!this.isInRange({ x: playerX, y: playerY }, m)) return false;
        if (!canAutoSelectVertically(playerY, m.displayY)) return false;
        if (
            isMonsterBelowPlayer(playerY, m.displayY)
            && !canAttackMonsterBelow(getCurrentCharacter()?.class)
        ) {
            return false;
        }
        return true;
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
            const wasDead = entry.dto.state === 'dead';
            entry.dto = dto;
            if (wasDead && dto.state === 'alive') {
                this.resetSpawnAnchor(entry, dto);
            }
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
        const style = pickStyle(dto.level);
        const anchor = this.computeSpawnAnchor(dto, style);

        const body = this.scene.add.graphics().setDepth(8);
        const hpBarBg = this.scene.add.graphics().setDepth(9);
        const hpBarFill = this.scene.add.graphics().setDepth(10);

        const hitArea = this.scene.add.rectangle(
            anchor.renderX, anchor.baseY,
            style.radius * 2 + 20, style.bodyHeight + 20, 0x000000, 0,
        )
            .setDepth(7).setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
            this.handleMonsterClick(dto.instance_id);
        });

        const wanderAngle = Math.random() * Math.PI * 2;
        const entry: MonsterEntry = {
            dto, body, hpBarBg, hpBarFill, hitArea,
            style,
            anchorRenderX: anchor.renderX,
            baseY: anchor.baseY,
            renderX: anchor.renderX,
            displayY: anchor.baseY,
            bobOffset: Math.random() * Math.PI * 2,
            offsetX: 0,
            offsetY: 0,
            wanderAngle,
            wanderTargetAngle: wanderAngle,
            nextWanderPickAt: this.scene.time.now + this.randomWanderPickDelay(),
            patrolOffset: 0,
            patrolDir: Math.random() < 0.5 ? -1 : 1,
        };
        this.updateHpBarVisibility();
        return entry;
    }

    private computeSpawnAnchor(
        dto: MonsterInstanceDTO,
        style: MonsterStyle,
    ): { renderX: number; baseY: number } {
        const scaleFactor = this.scene.scale.height / 1440;
        const renderX = dto.pos_x * scaleFactor;
        const surfaceY = this.background.getPlatformYAtX(renderX);
        let baseY = surfaceY - style.bodyHeight / 2 - 4;
        if (dto.movement_type === 'flying') {
            baseY -= FLYING_ALTITUDE;
        }
        return { renderX, baseY };
    }

    private resetSpawnAnchor(entry: MonsterEntry, dto: MonsterInstanceDTO): void {
        const anchor = this.computeSpawnAnchor(dto, entry.style);
        entry.anchorRenderX = anchor.renderX;
        entry.baseY = anchor.baseY;
        entry.offsetX = 0;
        entry.offsetY = 0;
        entry.renderX = anchor.renderX;
        entry.displayY = anchor.baseY;
        entry.wanderAngle = Math.random() * Math.PI * 2;
        entry.wanderTargetAngle = entry.wanderAngle;
        entry.nextWanderPickAt = this.scene.time.now + this.randomWanderPickDelay();
        entry.patrolOffset = 0;
        entry.patrolDir = Math.random() < 0.5 ? -1 : 1;
    }

    private randomWanderPickDelay(): number {
        return FLY_WANDER_PICK_MIN_MS
            + Math.random() * (FLY_WANDER_PICK_MAX_MS - FLY_WANDER_PICK_MIN_MS);
    }

    /** Idle wander quanh điểm spawn — client-only, BE vẫn dùng pos spawn. */
    private updateWander(m: MonsterEntry, deltaMs: number): void {
        const dt = deltaMs / 1000;
        if (m.dto.movement_type === 'flying') {
            this.updateFlyingWander(m, dt);
        } else {
            this.updateGroundPatrol(m, dt);
        }
        m.renderX = m.anchorRenderX + m.offsetX;
        m.displayY = m.baseY + m.offsetY;
    }

    private updateFlyingWander(m: MonsterEntry, dt: number): void {
        const now = this.scene.time.now;
        if (now >= m.nextWanderPickAt) {
            m.wanderTargetAngle = Math.random() * Math.PI * 2;
            m.nextWanderPickAt = now + this.randomWanderPickDelay();
        }
        let diff = m.wanderTargetAngle - m.wanderAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const step = FLY_WANDER_TURN_RATE * dt;
        if (Math.abs(diff) <= step) {
            m.wanderAngle = m.wanderTargetAngle;
        } else {
            m.wanderAngle += Math.sign(diff) * step;
        }
        m.offsetX = Math.cos(m.wanderAngle) * FLY_ORBIT_RADIUS_PX;
        m.offsetY = Math.sin(m.wanderAngle) * FLY_ORBIT_RADIUS_PX;
    }

    private updateGroundPatrol(m: MonsterEntry, dt: number): void {
        m.patrolOffset += m.patrolDir * GROUND_PATROL_SPEED_PX * dt;
        if (m.patrolOffset >= GROUND_PATROL_RADIUS_PX) {
            m.patrolOffset = GROUND_PATROL_RADIUS_PX;
            m.patrolDir = -1;
        } else if (m.patrolOffset <= -GROUND_PATROL_RADIUS_PX) {
            m.patrolOffset = -GROUND_PATROL_RADIUS_PX;
            m.patrolDir = 1;
        }
        m.offsetX = m.patrolOffset;
        m.offsetY = 0;
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
        const y = m.displayY - m.style.bodyHeight / 2 - 22;
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

    private drawBody(
        g: Phaser.GameObjects.Graphics,
        x: number,
        y: number,
        s: MonsterStyle,
        dead: boolean,
        aggroOnPlayer: boolean,
    ): void {
        g.clear();
        if (dead) {
            // Faint body ghost-like khi dead.
            g.fillStyle(s.color, 0.2);
            g.fillEllipse(x, y, s.radius * 2, s.bodyHeight);
            return;
        }
        const pulse = aggroOnPlayer
            ? 0.55 + 0.45 * Math.sin(this.scene.time.now / 140)
            : 0;
        // Shadow.
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(x, y + s.bodyHeight / 2 + 4, s.radius * 2, 10);
        // Vòng đỏ chân — placeholder tới khi có animation tấn công.
        if (aggroOnPlayer) {
            g.lineStyle(4, 0xff3333, pulse);
            g.strokeEllipse(x, y + s.bodyHeight / 2 + 4, s.radius * 2 + 16, 14);
            g.fillStyle(0xff4444, 0.22 * pulse);
            g.fillEllipse(x, y, s.radius * 2 + 4, s.bodyHeight + 4);
        }
        // Body.
        const bodyColor = aggroOnPlayer ? this.tintColor(s.color, 0xff5555, 0.35) : s.color;
        g.fillStyle(bodyColor, 1);
        g.fillEllipse(x, y, s.radius * 2, s.bodyHeight);
        g.lineStyle(aggroOnPlayer ? 3 : 2, aggroOnPlayer ? 0xff6666 : 0x000000, aggroOnPlayer ? 0.85 : 0.6);
        g.strokeEllipse(x, y, s.radius * 2, s.bodyHeight);
        // Eyes — đỏ khi đang đánh player.
        const eyeX = s.radius * 0.35;
        const eyeY = -s.bodyHeight * 0.15;
        g.fillStyle(aggroOnPlayer ? 0xffaaaa : 0xffffff, 1);
        g.fillCircle(x - eyeX, y + eyeY, 4);
        g.fillCircle(x + eyeX, y + eyeY, 4);
        g.fillStyle(aggroOnPlayer ? 0xaa0000 : s.eyeColor, 1);
        g.fillCircle(x - eyeX, y + eyeY, 2);
        g.fillCircle(x + eyeX, y + eyeY, 2);
        // Dấu ! trên đầu (tạm thời).
        if (aggroOnPlayer) {
            const markY = y - s.bodyHeight / 2 - 14;
            g.fillStyle(0xff4444, pulse);
            g.fillCircle(x, markY, 7);
            g.fillStyle(0xffffff, 1);
            g.fillRect(x - 1.5, markY - 5, 3, 6);
            g.fillRect(x - 1.5, markY + 3, 3, 2);
        }
    }

    /** Pha màu body hướng tint (0–1). */
    private tintColor(base: number, tint: number, amount: number): number {
        const br = (base >> 16) & 0xff;
        const bg = (base >> 8) & 0xff;
        const bb = base & 0xff;
        const tr = (tint >> 16) & 0xff;
        const tg = (tint >> 8) & 0xff;
        const tb = tint & 0xff;
        const r = Math.round(br + (tr - br) * amount);
        const g = Math.round(bg + (tg - bg) * amount);
        const b = Math.round(bb + (tb - bb) * amount);
        return (r << 16) | (g << 8) | b;
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

    private findNearestAlive(px: number, py: number): MonsterEntry | null {
        let best: MonsterEntry | null = null;
        let bestDistSq = Infinity;
        for (const m of this.monsters) {
            if (!this.isInAttackRangeForSelect(px, py, m)) continue;
            const dx = m.renderX - px;
            const distSq = dx * dx;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = m;
            }
        }
        return best;
    }

    private cleanup(): void {
        this.attackingUntil.clear();
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
