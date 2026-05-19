import * as Phaser from 'phaser';
import { combatAPI, type LootDropDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import { t } from '../../i18n';
import type { GameComponent } from './types';
import type { MapBackground } from './MapBackground';

const SPRITE_SCALE = 0.45;   // tỉ lệ render — nhỏ hơn nhân vật, rõ là vật phẩm rơi
const GLOW_RADIUS_PX = 14;   // glow base dưới sprite
const SELECT_GLOW_RADIUS_PX = 20;
const HIT_AREA_W = 44;       // vùng click ẩn — vừa đủ rộng để dễ chọn nhưng không "tham lam"
const HIT_AREA_H = 44;

interface DropEntry {
    dto: LootDropDTO;
    sprite: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Graphics;
    /** Vùng click ẩn — rộng hơn sprite để dễ select trên mobile / touch. */
    hitArea: Phaser.GameObjects.Rectangle;
    baseY: number;
    renderX: number;
    bobOffset: number;
    /** true khi đã gửi pickup request — không gửi lại tới khi response về. */
    pickingUp: boolean;
}

export interface LootDropManagerCallbacks {
    onYenPicked?: (amount: number, balance: number) => void;
    onError?: (msg: string) => void;
    /** Báo scene drop nào đang được chọn (vd để target frame / status text).
     * Null = vừa clear selection. */
    onSelectionChanged?: (drop: LootDropDTO | null) => void;
}

/**
 * Render + manage loot drops (Yên hôm nay, item mai kia) rơi trên mặt đất sau
 * khi đánh chết quái. **Flow nhặt: player click sprite → drop selected →
 * nhấn Enter (BaseMapScene.handleInteract) → gọi pickupSelected().** KHÔNG
 * auto-pickup khi đi qua — tránh hover-loot annoyance.
 *
 * UX ownership tối giản: tất cả drop trông giống nhau. BE là source of truth —
 * khi player cố nhặt drop không phải của mình, BE reject → FE hiện toast
 * "Vật phẩm của người khác". Không có lock badge / dim sprite để giảm visual
 * noise (yêu cầu 2026-05-19).
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

    /** Thêm drops mới (vd từ AttackResponse hoặc ListMonstersResponse refresh). */
    addDrops(list: LootDropDTO[]): void {
        for (const dto of list) {
            // Dedupe — drop_id đã có thì skip.
            if (this.drops.some((d) => d.dto.drop_id === dto.drop_id)) continue;
            this.drops.push(this.buildEntry(dto));
        }
    }

    /** Sync drops từ ListMonstersResponse: thêm mới + xoá những drop server không còn (đã nhặt). */
    syncDrops(list: LootDropDTO[]): void {
        const byID = new Map(list.map((d) => [d.drop_id, d]));
        const keep: DropEntry[] = [];
        for (const entry of this.drops) {
            const dto = byID.get(entry.dto.drop_id);
            if (!dto) {
                // Server đã xoá drop (player khác nhặt / despawn) → fade ra.
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
        for (const d of this.drops) {
            // Bob animation cho drop sprite.
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

    /** Drop đang được player chọn. BaseMapScene đọc khi handleInteract. */
    getSelectedDrop(): LootDropDTO | null {
        if (!this.selectedDropID) return null;
        const entry = this.drops.find((d) => d.dto.drop_id === this.selectedDropID);
        return entry ? entry.dto : null;
    }

    /** Clear selection (vd khi player chọn NPC / quái khác). */
    clearSelection(): void {
        if (!this.selectedDropID) return;
        this.selectedDropID = null;
        this.callbacks.onSelectionChanged?.(null);
    }

    /** Gọi từ BaseMapScene.handleInteract khi player nhấn Enter và có drop
     * đang chọn. Trả true nếu đã trigger pickup, false nếu không có selection. */
    async pickupSelected(): Promise<boolean> {
        if (!this.selectedDropID) return false;
        const entry = this.drops.find((d) => d.dto.drop_id === this.selectedDropID);
        if (!entry || entry.pickingUp) return false;
        await this.pickup(entry);
        return true;
    }

    private buildEntry(dto: LootDropDTO): DropEntry {
        const scaleFactor = this.scene.scale.height / 1440;
        const renderX = dto.pos_x * scaleFactor;
        const surfaceY = this.background.getPlatformYAtX(renderX);
        // Render drop ngay sát mặt đất, hơi nhô lên để không bị clip với platform.
        const baseY = surfaceY - 14;

        const glow = this.scene.add.graphics().setDepth(6);
        glow.fillStyle(0xffd070, 0.35);
        glow.fillCircle(0, 0, GLOW_RADIUS_PX);
        glow.setPosition(renderX, baseY);

        const sprite = this.scene.add.image(renderX, baseY, this.spriteKeyFor(dto))
            .setDepth(7)
            .setScale(SPRITE_SCALE);

        // Vùng click ẩn — rộng hơn sprite để dễ select.
        const hitArea = this.scene.add.rectangle(renderX, baseY, HIT_AREA_W, HIT_AREA_H, 0x000000, 0)
            .setDepth(7)
            .setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => this.handleClick(dto.drop_id));

        const entry: DropEntry = {
            dto, sprite, glow, hitArea,
            baseY, renderX,
            bobOffset: Math.random() * Math.PI * 2,
            pickingUp: false,
        };
        // Spawn animation — pop up scale 0 → target.
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
        if (!entry || entry.pickingUp) return;
        this.selectedDropID = dropID;
        this.callbacks.onSelectionChanged?.(entry.dto);
    }

    /** Map kind → sprite key. Mở rộng sau khi có item drop (lookup theo
     * item_template_id từ asset catalog). */
    private spriteKeyFor(dto: LootDropDTO): string {
        if (dto.kind === 'yen') return 'item_yen';
        return 'item_yen'; // fallback — phase sau item drop sẽ thêm sprite riêng.
    }

    /** Drop đang được select → glow pulse sáng hơn để player thấy rõ. */
    private updateSelectionGlow(entry: DropEntry, tSec: number): void {
        if (entry.dto.drop_id !== this.selectedDropID) {
            // Reset về glow base nếu trước đó là selected (vd vừa deselect).
            return;
        }
        const pulse = 0.5 + 0.4 * Math.abs(Math.sin(tSec * 4));
        entry.glow.clear();
        entry.glow.fillStyle(0xffea7a, pulse);
        entry.glow.fillCircle(0, 0, SELECT_GLOW_RADIUS_PX);
    }

    private async pickup(entry: DropEntry): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        entry.pickingUp = true;
        try {
            const pos = this.getPlayerPos();
            if (!pos) return;
            const scaleFactor = this.scene.scale.height / 1440;
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
            // Map BE error code → toast key. Defensive contains-check vì error
            // message dạng "combat.error.drop_not_owned (trace_id=...)".
            if (raw.includes('drop_not_owned')) {
                this.callbacks.onError?.(t('combat.drop_owned_by_other'));
            } else if (raw.includes('drop_out_of_range')) {
                this.callbacks.onError?.(t('combat.drop_out_of_range'));
            } else {
                this.callbacks.onError?.(t('combat.pickup_failed'));
            }
        }
    }

    private removeEntry(entry: DropEntry): void {
        const idx = this.drops.indexOf(entry);
        if (idx >= 0) this.drops.splice(idx, 1);
        entry.hitArea.destroy(); // disable input ngay, tránh click vào sprite đang fade.
        // Tween pickup — sprite bay lên + scale + fade.
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
