import * as Phaser from 'phaser';
import type {
    AppearancePayload,
    MapSnapshotPayload,
    PlayerLeftPayload,
    PlayerMovedPayload,
    PlayerPresencePayload,
    RealtimeDirection,
} from '../../network/protocol/events';
import {
    BODY_SCALE,
    BOTTOM_OFFSET_X,
    BOTTOM_OFFSET_Y,
    DEFAULT_CHARACTER_APPEARANCE,
    HEAD_OFFSET_X,
    HEAD_OFFSET_Y,
    NAME_OFFSET_Y,
    TOP_OFFSET_X,
    TOP_OFFSET_Y,
} from './PlayerController';
import type { GameComponent } from './types';

// Lerp factor mỗi frame — 0.2 = 20%/frame ~ 80% sau 200ms (đủ smooth ở 60fps
// với server tick 100ms gap). Cao hơn → snappy nhưng giật.
const LERP_FACTOR = 0.2;

// Snap threshold — nếu khoảng cách quá lớn (vd reconnect, teleport) thì snap
// thẳng thay interpolate. Giảm artefact nhân vật trượt dài qua màn hình.
const SNAP_DISTANCE_PX = 600;

interface RemotePlayer {
    characterID: string;
    container: Phaser.GameObjects.Container;
    headSprite: Phaser.GameObjects.Sprite;
    topSprite: Phaser.GameObjects.Sprite;
    bottomSprite: Phaser.GameObjects.Sprite;
    nameText: Phaser.GameObjects.Text;
    target: { x: number; y: number; dir: RealtimeDirection };
    presence: PlayerPresencePayload;
    lastTS: number;
}

// RemotePlayerManager render player khác trên map. Sử dụng cùng 3-layer
// body (head + top + bottom) như PlayerController để đảm bảo visual
// đồng nhất.
//
// Appearance fallback: nếu BE Presence.appearance không gửi sprite key,
// FE dùng `body-{head|top|bottom}-default`. Tương lai BE bridge fetch
// equipped items + sprite_key → swap texture tương ứng. Áo cấp X / class
// khác sẽ có sprite_key khác → render đúng outfit ngay khi BE update.
export class RemotePlayerManager implements GameComponent {
    private scene: Phaser.Scene;
    private players = new Map<string, RemotePlayer>();
    private ownCharacterID: string | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        // No-op: state khởi tạo ở constructor; sprite tạo theo nhu cầu.
    }

    setOwnCharacterID(id: string): void {
        this.ownCharacterID = id;
    }

    /** map_snapshot → wipe + populate others. Gọi ở join_map success. */
    applySnapshot(snap: MapSnapshotPayload): void {
        // Remove các remote không còn trong snapshot.
        const incoming = new Set(snap.others.map((o) => o.character_id));
        for (const id of Array.from(this.players.keys())) {
            if (!incoming.has(id)) this.removePlayer(id);
        }
        // Add / update others.
        for (const p of snap.others) {
            if (p.character_id === this.ownCharacterID) continue;
            this.upsertPlayer(p);
        }
    }

    /** player_joined → thêm 1 remote. */
    addPlayer(p: PlayerPresencePayload): void {
        if (p.character_id === this.ownCharacterID) return;
        this.upsertPlayer(p);
    }

    /** player_moved → set target position; update() interpolate. */
    updatePosition(p: PlayerMovedPayload): void {
        if (p.character_id === this.ownCharacterID) return;
        const rp = this.players.get(p.character_id);
        if (!rp) return;
        // Discard out-of-order packets — server cùng tick có thể tới khác thứ tự.
        if (p.ts < rp.lastTS) return;
        rp.target.x = p.x;
        rp.target.y = p.y;
        rp.target.dir = p.dir;
        rp.lastTS = p.ts;

        // Snap nếu chênh lớn (reconnect / teleport) — tránh trượt dài.
        const dx = p.x - rp.container.x;
        const dy = p.y - rp.container.y;
        if (dx * dx + dy * dy > SNAP_DISTANCE_PX * SNAP_DISTANCE_PX) {
            rp.container.setPosition(p.x, p.y);
        }
    }

    /** player_left → remove. */
    removePlayer(characterID: string): void {
        const rp = this.players.get(characterID);
        if (!rp) return;
        rp.container.destroy(true);
        this.players.delete(characterID);
    }

    /** Wipe tất cả — gọi khi leave_map. */
    clear(): void {
        for (const id of Array.from(this.players.keys())) this.removePlayer(id);
    }

    /** Per-frame interpolate. Call từ scene.update(). */
    update(): void {
        for (const rp of this.players.values()) {
            const cx = rp.container.x;
            const cy = rp.container.y;
            const tx = rp.target.x;
            const ty = rp.target.y;
            // Apply facing flip (cho mọi frame để chắc chắn sync khi dir đổi).
            const flip = rp.target.dir === 'left';
            rp.headSprite.setFlipX(flip);
            rp.topSprite.setFlipX(flip);
            rp.bottomSprite.setFlipX(flip);
            if (cx === tx && cy === ty) continue;
            const nx = cx + (tx - cx) * LERP_FACTOR;
            const ny = cy + (ty - cy) * LERP_FACTOR;
            rp.container.setPosition(nx, ny);
        }
    }

    destroy(): void {
        this.clear();
    }

    /** Convenience từ ngoài — convert PlayerLeftPayload sang remove. */
    handleLeft(p: PlayerLeftPayload): void {
        this.removePlayer(p.character_id);
    }

    private upsertPlayer(p: PlayerPresencePayload): void {
        const existing = this.players.get(p.character_id);
        if (existing) {
            existing.presence = p;
            existing.target.x = p.x;
            existing.target.y = p.y;
            existing.target.dir = p.dir;
            existing.nameText.setText(this.formatNamePlate(p));
            this.applyAppearance(existing, p.appearance);
            existing.container.setPosition(p.x, p.y);
            return;
        }
        const keys = resolveAppearanceKeys(p.appearance);

        const headSprite = this.scene.add.sprite(HEAD_OFFSET_X, HEAD_OFFSET_Y, keys.head);
        const topSprite = this.scene.add.sprite(TOP_OFFSET_X, TOP_OFFSET_Y, keys.top);
        const bottomSprite = this.scene.add.sprite(BOTTOM_OFFSET_X, BOTTOM_OFFSET_Y, keys.bottom);
        // Pixel art crisp — phải set NEAREST cho mỗi texture, giống
        // PlayerController.applyPixelArtFilter.
        [headSprite, topSprite, bottomSprite].forEach((s) => {
            s.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        });
        const flip = p.dir === 'left';
        headSprite.setFlipX(flip);
        topSprite.setFlipX(flip);
        bottomSprite.setFlipX(flip);

        const nameText = this.scene.add
            .text(0, NAME_OFFSET_Y, this.formatNamePlate(p), {
                fontSize: '13px',
                color: '#ffffff',
                fontFamily: 'system-ui, sans-serif',
                stroke: '#000',
                strokeThickness: 4,
            })
            .setOrigin(0.5);

        // Thứ tự children = z-order trong container: bottom → top → head
        // (legs dưới cùng, đầu trên cùng). Name text ngoài container vì
        // không scale theo BODY_SCALE.
        const container = this.scene.add.container(p.x, p.y, [bottomSprite, topSprite, headSprite, nameText]);
        container.setScale(BODY_SCALE);
        container.setDepth(9); // Dưới local player (depth=10) để own avatar nổi.

        this.players.set(p.character_id, {
            characterID: p.character_id,
            container,
            headSprite,
            topSprite,
            bottomSprite,
            nameText,
            target: { x: p.x, y: p.y, dir: p.dir },
            presence: p,
            lastTS: 0,
        });
    }

    private applyAppearance(rp: RemotePlayer, appearance: AppearancePayload | undefined): void {
        const keys = resolveAppearanceKeys(appearance);
        if (rp.headSprite.texture.key !== keys.head) rp.headSprite.setTexture(keys.head);
        if (rp.topSprite.texture.key !== keys.top) rp.topSprite.setTexture(keys.top);
        if (rp.bottomSprite.texture.key !== keys.bottom) rp.bottomSprite.setTexture(keys.bottom);
        // Re-apply NEAREST filter sau setTexture (Phaser reset filter mặc định).
        [rp.headSprite, rp.topSprite, rp.bottomSprite].forEach((s) => {
            s.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        });
    }

    private formatNamePlate(p: PlayerPresencePayload): string {
        return `Lv${p.level} ${p.display_name}`;
    }
}

// resolveAppearanceKeys — pick BE sprite key nếu có, else default. Chỉ
// fallback cho field thiếu (BE có thể gửi chỉ helmet, body + legs vẫn
// default).
function resolveAppearanceKeys(a: AppearancePayload | undefined): {
    head: string;
    top: string;
    bottom: string;
} {
    return {
        head: a?.head_sprite_key || DEFAULT_CHARACTER_APPEARANCE.headTextureKey,
        top: a?.top_sprite_key || DEFAULT_CHARACTER_APPEARANCE.topTextureKey,
        bottom: a?.bottom_sprite_key || DEFAULT_CHARACTER_APPEARANCE.bottomTextureKey,
    };
}
