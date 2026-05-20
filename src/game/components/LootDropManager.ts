import * as Phaser from 'phaser';
import { combatAPI, type LootDropDTO } from '../../network/api';
import {
    isLootDropExpired,
    isPlayerInLootPickupRange,
    LOOT_SPRITE_BEETLE_CARAPACE,
    LOOT_SPRITE_HERB_FLOWER,
    LOOT_SPRITE_TURTLE_SHELL,
    LOOT_SPRITE_UPGRADE_STONE,
    LOOT_SPRITE_YEN,
    MATERIAL_BEETLE_CARAPACE_ID,
    MATERIAL_HERB_FLOWER_ID,
    MATERIAL_TURTLE_SHELL_ID,
    UPGRADE_STONE_TEMPLATE_ID,
} from '../../network/lootDrop';
import { isPointInMainCameraView } from '../cameraView';
import { getCurrentCharacter } from '../playerSession';
import { t } from '../../i18n';
import type { GameComponent } from './types';
import type { MapBackground } from './MapBackground';

const SPRITE_SCALE = 0.45;
const HIT_AREA_W = 44;
const HIT_AREA_H = 44;
/** Đầu nhọn mũi tên cách mép trên sprite (origin 0.5 — tính từ displayHeight/2). */
const SELECTION_ARROW_GAP_PX = 2;
const SELECTION_ARROW_HALF_W = 8;
const SELECTION_ARROW_H = 10;

interface DropEntry {
    dto: LootDropDTO;
    sprite: Phaser.GameObjects.Image;
    hitArea: Phaser.GameObjects.Rectangle;
    baseY: number;
    renderX: number;
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
    private selectionArrow?: Phaser.GameObjects.Graphics;
    /** Screen X — player chạy tới khi Enter nhặt drop ngoài tầm (giống NpcManager). */
    private autoMoveTargetScreenX: number | null = null;

    constructor(scene: Phaser.Scene, background: MapBackground, mapId: string, callbacks?: LootDropManagerCallbacks) {
        this.scene = scene;
        this.background = background;
        this.mapId = mapId;
        this.callbacks = callbacks ?? {};
    }

    create(): void {
        this.selectionArrow = this.scene.add.graphics().setDepth(8).setVisible(false);
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
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            if (isLootDropExpired(d.dto)) {
                if (this.selectedDropID === d.dto.drop_id) this.clearSelection();
                this.fadeOut(d);
            }
        }
        const selected = this.getSelectedEntry();
        if (selected && !isPointInMainCameraView(this.scene, selected.renderX, selected.baseY)) {
            this.clearSelection();
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
        this.autoMoveTargetScreenX = null;
        this.hideSelectionArrow();
        this.callbacks.onSelectionChanged?.(null);
    }

    getAutoMoveTargetX(): number | null {
        return this.autoMoveTargetScreenX;
    }

    clearAutoMove(): void {
        this.autoMoveTargetScreenX = null;
    }

    /** Enter / nhặt — trong tầm thì pickup ngay, xa thì chạy tới drop. */
    handleInteract(playerScreenX: number): void {
        const entry = this.getSelectedEntry();
        if (!entry) return;
        if (this.isInPickupRange(entry, playerScreenX)) {
            this.autoMoveTargetScreenX = null;
            void this.pickup(entry);
        } else {
            this.autoMoveTargetScreenX = entry.renderX;
        }
    }

    /** Gọi mỗi frame từ scene khi đang auto-run tới drop. */
    checkAutoMoveArrival(playerScreenX: number): boolean {
        if (this.autoMoveTargetScreenX === null) return false;
        const entry = this.getSelectedEntry();
        if (!entry) {
            this.autoMoveTargetScreenX = null;
            return false;
        }
        if (!this.isInPickupRange(entry, playerScreenX)) return false;
        this.autoMoveTargetScreenX = null;
        void this.pickup(entry);
        return true;
    }

    pickupSelected(): void {
        const pos = this.getPlayerPos();
        if (!pos) return;
        this.handleInteract(pos.x);
    }

    private getSelectedEntry(): DropEntry | undefined {
        if (!this.selectedDropID) return undefined;
        const entry = this.drops.find((d) => d.dto.drop_id === this.selectedDropID);
        if (!entry || entry.pickingUp || isLootDropExpired(entry.dto)) return undefined;
        return entry;
    }

    private isInPickupRange(entry: DropEntry, playerScreenX: number): boolean {
        const scaleFactor = this.scene.scale.height / 1440;
        return isPlayerInLootPickupRange(entry.dto.pos_x, playerScreenX, scaleFactor);
    }

    private filterActive(list: LootDropDTO[]): LootDropDTO[] {
        return list.filter((d) => !isLootDropExpired(d));
    }

    private buildEntry(dto: LootDropDTO): DropEntry {
        const scaleFactor = this.scene.scale.height / 1440;
        const renderX = dto.pos_x * scaleFactor;
        const surfaceY = this.background.getPlatformYAtX(renderX);
        const baseY = surfaceY - 14;

        const sprite = this.scene.add.image(renderX, baseY, this.spriteKeyFor(dto))
            .setDepth(7)
            .setScale(SPRITE_SCALE);

        const hitArea = this.scene.add.rectangle(renderX, baseY, HIT_AREA_W, HIT_AREA_H, 0x000000, 0)
            .setDepth(7)
            .setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => this.handleClick(dto.drop_id));

        return {
            dto,
            sprite,
            hitArea,
            baseY,
            renderX,
            pickingUp: false,
        };
    }

    private handleClick(dropID: string): void {
        const entry = this.drops.find((d) => d.dto.drop_id === dropID);
        if (!entry || entry.pickingUp || isLootDropExpired(entry.dto)) return;
        this.selectedDropID = dropID;
        this.updateSelectionArrow();
        this.callbacks.onSelectionChanged?.(entry.dto);
    }

    /** Mũi tên ↓ trên đầu item — cùng style NpcManager. */
    private updateSelectionArrow(): void {
        const g = this.selectionArrow;
        if (!g) return;
        const entry = this.drops.find((d) => d.dto.drop_id === this.selectedDropID);
        if (!entry) {
            this.hideSelectionArrow();
            return;
        }
        const x = entry.renderX;
        const spriteTop = entry.baseY - entry.sprite.displayHeight / 2;
        const tipY = spriteTop - SELECTION_ARROW_GAP_PX;
        const topY = tipY - SELECTION_ARROW_H;
        g.clear();
        g.fillStyle(0xffea7a, 1);
        g.lineStyle(2, 0x000000, 1);
        g.beginPath();
        g.moveTo(x - SELECTION_ARROW_HALF_W, topY);
        g.lineTo(x + SELECTION_ARROW_HALF_W, topY);
        g.lineTo(x, topY + SELECTION_ARROW_H);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.setVisible(true);
    }

    private hideSelectionArrow(): void {
        this.selectionArrow?.clear().setVisible(false);
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
        if (dto.kind === 'item' && dto.item_template_id === MATERIAL_HERB_FLOWER_ID) {
            return LOOT_SPRITE_HERB_FLOWER;
        }
        return LOOT_SPRITE_YEN;
    }

    private async pickup(entry: DropEntry): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        const pos = this.getPlayerPos();
        if (!pos) return;
        const scaleFactor = this.scene.scale.height / 1440;
        if (!isPlayerInLootPickupRange(entry.dto.pos_x, pos.x, scaleFactor)) {
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
        entry.sprite.destroy();
    }

    private fadeOut(entry: DropEntry): void {
        const idx = this.drops.indexOf(entry);
        if (idx >= 0) this.drops.splice(idx, 1);
        entry.hitArea.destroy();
        entry.sprite.destroy();
    }

    private cleanup(): void {
        for (const d of this.drops) {
            d.sprite.destroy();
            d.hitArea.destroy();
        }
        this.drops = [];
        this.selectedDropID = null;
        this.autoMoveTargetScreenX = null;
        this.selectionArrow?.destroy();
        this.selectionArrow = undefined;
    }
}
