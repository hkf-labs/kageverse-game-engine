import * as Phaser from 'phaser';
import { combatAPI, type LootDropDTO } from '../../network/api';
import {
    isLootDropExpired,
    isPlayerInLootPickupRange,
    LOOT_SPRITE_BEETLE_CARAPACE,
    LOOT_SPRITE_TURTLE_SHELL,
    LOOT_SPRITE_UPGRADE_STONE,
    LOOT_SPRITE_YEN,
    MATERIAL_BEETLE_CARAPACE_ID,
    MATERIAL_TURTLE_SHELL_ID,
    UPGRADE_STONE_TEMPLATE_ID,
} from '../../network/lootDrop';
import { getCurrentCharacter } from '../playerSession';
import { t } from '../../i18n';
import type { GameComponent } from './types';
import type { MapBackground } from './MapBackground';

const SPRITE_SCALE = 0.45;
const GLOW_RADIUS_PX = 14;
const SELECT_GLOW_RADIUS_PX = 20;
const HIT_AREA_W = 44;
const HIT_AREA_H = 44;

const GLOW_YEN = 0xffd070;
const GLOW_UPGRADE_STONE = 0x58b8ff;
const GLOW_QUEST_MATERIAL = 0xa8e06a;
const GLOW_SELECT_YEN = 0xffea7a;
const GLOW_SELECT_STONE = 0x9ae8ff;
const GLOW_SELECT_QUEST_MATERIAL = 0xc8f090;

interface DropEntry {
    dto: LootDropDTO;
    sprite: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Graphics;
    hitArea: Phaser.GameObjects.Rectangle;
    baseY: number;
    renderX: number;
    bobOffset: number;
    glowBase: number;
    glowSelect: number;
    pickingUp: boolean;
}

export interface LootDropManagerCallbacks {
    onYenPicked?: (amount: number, balance: number) => void;
    onError?: (msg: string) => void;
    onSelectionChanged?: (drop: LootDropDTO | null) => void;
}

/**
 * Render + manage loot drops (Yên, Đá Cường Hoá, ...) trên mặt đất.
 * Despawn: theo expires_at (15s) client-side + sync ListMonsters khi BE prune.
 */
export class LootDropManager implements GameComponent {
    private scene: Phaser.Scene;
    private background: MapBackground;
    private mapId: string;
    private callbacks: LootDropManagerCallbacks;
    private drops: DropEntry[] = [];
    private getPlayerPos: () => { x: number; y: number } | null = () => null;
    private selectedDropID: string | null = null;

    constructor(scene: Phaser.Scene, background: MapBackground, mapId: string, callbacks?: LootDropManagerCallbacks) {
        this.scene = scene;
        this.background = background;
        this.mapId = mapId;
        this.callbacks = callbacks ?? {};
    }

    create(): void {
        this.scene.events.once('shutdown', () => this.cleanup());
        this.scene.events.once('destroy', () => this.cleanup());
    }

    setPlayerPositionGetter(getter: () => { x: number; y: number } | null): void {
        this.getPlayerPos = getter;
    }

    addDrops(list: LootDropDTO[]): void {
        for (const dto of this.filterActive(list)) {
            if (this.drops.some((d) => d.dto.drop_id === dto.drop_id)) continue;
            this.drops.push(this.buildEntry(dto));
        }
    }

    syncDrops(list: LootDropDTO[]): void {
        const active = this.filterActive(list);
        const byID = new Map(active.map((d) => [d.drop_id, d]));
        const keep: DropEntry[] = [];
        for (const entry of this.drops) {
            const dto = byID.get(entry.dto.drop_id);
            if (!dto) {
                if (this.selectedDropID === entry.dto.drop_id) this.clearSelection();
                this.fadeOut(entry);
                continue;
            }
            entry.dto = dto;
            byID.delete(dto.drop_id);
            keep.push(entry);
        }
        this.drops = keep;
        for (const dto of byID.values()) {
            this.drops.push(this.buildEntry(dto));
        }
    }

    update(): void {
        const tSec = this.scene.time.now / 1000;
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            if (isLootDropExpired(d.dto)) {
                if (this.selectedDropID === d.dto.drop_id) this.clearSelection();
                this.fadeOut(d);
                continue;
            }
            const bob = Math.sin(tSec * 2.4 + d.bobOffset) * 4;
            d.sprite.setY(d.baseY + bob);
            d.glow.setY(d.baseY + bob);
            d.hitArea.setY(d.baseY + bob);
            this.updateSelectionGlow(d, tSec);
        }
    }

    destroy(): void {
        this.cleanup();
    }

    getSelectedDrop(): LootDropDTO | null {
        if (!this.selectedDropID) return null;
        const entry = this.drops.find((d) => d.dto.drop_id === this.selectedDropID);
        return entry ? entry.dto : null;
    }

    clearSelection(): void {
        if (!this.selectedDropID) return;
        this.selectedDropID = null;
        this.callbacks.onSelectionChanged?.(null);
    }

    async pickupSelected(): Promise<boolean> {
        if (!this.selectedDropID) return false;
        const entry = this.drops.find((d) => d.dto.drop_id === this.selectedDropID);
        if (!entry || entry.pickingUp || isLootDropExpired(entry.dto)) return false;
        await this.pickup(entry);
        return true;
    }

    private filterActive(list: LootDropDTO[]): LootDropDTO[] {
        return list.filter((d) => !isLootDropExpired(d));
    }

    private glowColorsFor(dto: LootDropDTO): { base: number; select: number } {
        if (dto.kind === 'item' && dto.item_template_id === UPGRADE_STONE_TEMPLATE_ID) {
            return { base: GLOW_UPGRADE_STONE, select: GLOW_SELECT_STONE };
        }
        if (
            dto.kind === 'item'
            && (dto.item_template_id === MATERIAL_BEETLE_CARAPACE_ID
                || dto.item_template_id === MATERIAL_TURTLE_SHELL_ID)
        ) {
            return { base: GLOW_QUEST_MATERIAL, select: GLOW_SELECT_QUEST_MATERIAL };
        }
        return { base: GLOW_YEN, select: GLOW_SELECT_YEN };
    }

    private buildEntry(dto: LootDropDTO): DropEntry {
        const scaleFactor = this.scene.scale.height / 1440;
        const renderX = dto.pos_x * scaleFactor;
        const surfaceY = this.background.getPlatformYAtX(renderX);
        const baseY = surfaceY - 14;
        const { base: glowBase, select: glowSelect } = this.glowColorsFor(dto);

        const glow = this.scene.add.graphics().setDepth(6);
        glow.fillStyle(glowBase, 0.35);
        glow.fillCircle(0, 0, GLOW_RADIUS_PX);
        glow.setPosition(renderX, baseY);

        const sprite = this.scene.add.image(renderX, baseY, this.spriteKeyFor(dto))
            .setDepth(7)
            .setScale(SPRITE_SCALE);

        const hitArea = this.scene.add.rectangle(renderX, baseY, HIT_AREA_W, HIT_AREA_H, 0x000000, 0)
            .setDepth(7)
            .setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => this.handleClick(dto.drop_id));

        const entry: DropEntry = {
            dto,
            sprite,
            glow,
            hitArea,
            baseY,
            renderX,
            bobOffset: Math.random() * Math.PI * 2,
            glowBase,
            glowSelect,
            pickingUp: false,
        };
        sprite.setScale(0);
        this.scene.tweens.add({
            targets: sprite,
            scale: SPRITE_SCALE,
            duration: 220,
            ease: 'Back.easeOut',
        });
        return entry;
    }

    private handleClick(dropID: string): void {
        const entry = this.drops.find((d) => d.dto.drop_id === dropID);
        if (!entry || entry.pickingUp || isLootDropExpired(entry.dto)) return;
        this.selectedDropID = dropID;
        this.callbacks.onSelectionChanged?.(entry.dto);
    }

    private spriteKeyFor(dto: LootDropDTO): string {
        if (dto.kind === 'yen') return LOOT_SPRITE_YEN;
        if (dto.kind === 'item' && dto.item_template_id === UPGRADE_STONE_TEMPLATE_ID) {
            return LOOT_SPRITE_UPGRADE_STONE;
        }
        if (dto.kind === 'item' && dto.item_template_id === MATERIAL_BEETLE_CARAPACE_ID) {
            return LOOT_SPRITE_BEETLE_CARAPACE;
        }
        if (dto.kind === 'item' && dto.item_template_id === MATERIAL_TURTLE_SHELL_ID) {
            return LOOT_SPRITE_TURTLE_SHELL;
        }
        return LOOT_SPRITE_YEN;
    }

    private updateSelectionGlow(entry: DropEntry, tSec: number): void {
        if (entry.dto.drop_id !== this.selectedDropID) {
            return;
        }
        const pulse = 0.5 + 0.4 * Math.abs(Math.sin(tSec * 4));
        entry.glow.clear();
        entry.glow.fillStyle(entry.glowSelect, pulse);
        entry.glow.fillCircle(0, 0, SELECT_GLOW_RADIUS_PX);
    }

    private async pickup(entry: DropEntry): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        const pos = this.getPlayerPos();
        if (!pos) return;
        const scaleFactor = this.scene.scale.height / 1440;
        if (!isPlayerInLootPickupRange(entry.dto.pos_x, pos.x, scaleFactor)) {
            this.callbacks.onError?.(t('combat.drop_out_of_range'));
            return;
        }
        entry.pickingUp = true;
        try {
            const res = await combatAPI.pickupDrop(character.id, {
                map_id: this.mapId,
                drop_id: entry.dto.drop_id,
                player_x: pos.x / scaleFactor,
                player_y: pos.y / scaleFactor,
            });
            if (this.selectedDropID === entry.dto.drop_id) this.clearSelection();
            this.removeEntry(entry);
            if (res.kind === 'yen' && typeof res.yen_amount === 'number') {
                this.callbacks.onYenPicked?.(res.yen_amount, res.yen_balance ?? 0);
            }
        } catch (err) {
            entry.pickingUp = false;
            const raw = err instanceof Error ? err.message : '';
            if (raw.includes('drop_not_owned')) {
                this.callbacks.onError?.(t('combat.drop_owned_by_other'));
            } else if (raw.includes('drop_out_of_range')) {
                this.callbacks.onError?.(t('combat.drop_out_of_range'));
            } else if (raw.includes('drop_not_found')) {
                this.fadeOut(entry);
            } else if (raw.includes('drop_quest_required')) {
                this.callbacks.onError?.(t('combat.drop_quest_required'));
                this.fadeOut(entry);
            } else {
                this.callbacks.onError?.(t('combat.pickup_failed'));
            }
        }
    }

    private removeEntry(entry: DropEntry): void {
        const idx = this.drops.indexOf(entry);
        if (idx >= 0) this.drops.splice(idx, 1);
        entry.hitArea.destroy();
        this.scene.tweens.add({
            targets: [entry.sprite, entry.glow],
            y: entry.baseY - 60,
            alpha: 0,
            scale: 1.4,
            duration: 380,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                entry.sprite.destroy();
                entry.glow.destroy();
            },
        });
    }

    private fadeOut(entry: DropEntry): void {
        const idx = this.drops.indexOf(entry);
        if (idx >= 0) this.drops.splice(idx, 1);
        entry.hitArea.destroy();
        this.scene.tweens.add({
            targets: [entry.sprite, entry.glow],
            alpha: 0,
            duration: 220,
            onComplete: () => {
                entry.sprite.destroy();
                entry.glow.destroy();
            },
        });
    }

    private cleanup(): void {
        for (const d of this.drops) {
            d.sprite.destroy();
            d.glow.destroy();
            d.hitArea.destroy();
        }
        this.drops = [];
        this.selectedDropID = null;
    }
}
