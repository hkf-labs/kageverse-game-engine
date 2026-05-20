import * as Phaser from 'phaser';
import {
    SkeletonRenderer,
    Physics,
} from '@esotericsoftware/spine-canvas';
import type {
    MapSnapshotPayload,
    PlayerLeftPayload,
    PlayerMovedPayload,
    PlayerPresencePayload,
    RealtimeDirection,
} from '../../network/protocol/events';
import { createSpineInstance, ensureSharedSpineData, type SharedSpineData } from './spineShared';
import { canAutoSelectVertically } from '../worldTarget';
import type { GameComponent } from './types';

// Parity với PlayerController — giữ sync visual + name plate.
const SPINE_FOOT_OFFSET_Y = 22;
const CANVAS_W = 400;
const CANVAS_H = 500;
const SKELETON_CANVAS_Y = CANVAS_H - 40;
const CHAR_HEIGHT_IN_CANVAS = SKELETON_CANVAS_Y - 293;
const IMAGE_SCALE = 0.5;
const SPINE_ORIGIN_Y = SKELETON_CANVAS_Y / CANVAS_H;

const LERP_FACTOR = 0.2;
const SNAP_DISTANCE_PX = 600;
const SELECTION_ARROW_GAP_PX = 2;
const SELECTION_ARROW_HALF_W = 8;
const SELECTION_ARROW_H = 10;
/** px/frame — coi là đang chạy nếu lerp di chuyển đủ lớn. */
const RUN_MOVE_THRESHOLD = 0.8;

type AnimName = 'idle' | 'run';

interface RemotePlayer {
    characterID: string;
    /** Anchor vị trí (chat bubble / logic) — không chứa sprite scale. */
    container: Phaser.GameObjects.Container;
    nameText: Phaser.GameObjects.Text;
    spineTexKey: string;
    spineImage?: Phaser.GameObjects.Image;
    spineTex?: Phaser.Textures.CanvasTexture;
    spineCtx?: CanvasRenderingContext2D;
    spineRenderer?: SkeletonRenderer;
    skeleton?: ReturnType<typeof createSpineInstance>['skeleton'];
    animState?: ReturnType<typeof createSpineInstance>['animState'];
    spineLoaded: boolean;
    currentAnim: AnimName;
    lastTime: number;
    target: { x: number; y: number; dir: RealtimeDirection };
    presence: PlayerPresencePayload;
    lastTS: number;
}

// RemotePlayerManager — render player khác bằng cùng Spine male_base như local
// player (thay sprite 3-lớp cũ). Name plate là Text riêng (không scale) phía
// trên đầu.
export class RemotePlayerManager implements GameComponent {
    private scene: Phaser.Scene;
    private players = new Map<string, RemotePlayer>();
    private ownCharacterID: string | null = null;
    private sharedSpine: SharedSpineData | null = null;
    private selectedCharacterID: string | null = null;
    private selectionArrow?: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        this.selectionArrow = this.scene.add.graphics().setDepth(11).setVisible(false);
        ensureSharedSpineData((data) => {
            this.sharedSpine = data;
            for (const rp of this.players.values()) {
                if (!rp.spineLoaded) this.attachSpine(rp);
            }
        });
    }

    setVisible(visible: boolean): void {
        for (const rp of this.players.values()) {
            rp.container.setVisible(visible);
            rp.nameText.setVisible(visible);
            rp.spineImage?.setVisible(visible);
        }
        if (!visible) this.selectionArrow?.setVisible(false);
    }

    getSelectedCharacterId(): string | null {
        return this.selectedCharacterID;
    }

    clearSelection(): void {
        if (!this.selectedCharacterID) return;
        this.selectedCharacterID = null;
        this.hideSelectionArrow();
    }

    selectCharacterAuto(characterID: string | null): void {
        if (!characterID) {
            this.clearSelection();
            return;
        }
        if (!this.players.has(characterID)) {
            this.clearSelection();
            return;
        }
        if (this.selectedCharacterID === characterID) return;
        this.selectedCharacterID = characterID;
        this.updateSelectionArrow();
    }

    findNearestInRange(
        playerX: number,
        playerY: number,
        maxRangePx: number,
    ): { characterId: string; distSq: number } | null {
        const maxSq = maxRangePx * maxRangePx;
        let best: { characterId: string; distSq: number } | null = null;
        for (const rp of this.players.values()) {
            const feetY = rp.container.y + SPINE_FOOT_OFFSET_Y;
            if (!canAutoSelectVertically(playerY, feetY)) continue;
            const dx = rp.container.x - playerX;
            const dy = feetY - playerY;
            const distSq = dx * dx + dy * dy;
            if (distSq > maxSq) continue;
            if (!best || distSq < best.distSq) {
                best = { characterId: rp.characterID, distSq };
            }
        }
        return best;
    }

    setOwnCharacterID(id: string): void {
        this.ownCharacterID = id;
    }

    applySnapshot(snap: MapSnapshotPayload): void {
        const incoming = new Set(snap.others.map((o) => o.character_id));
        for (const id of Array.from(this.players.keys())) {
            if (!incoming.has(id)) this.removePlayer(id);
        }
        for (const p of snap.others) {
            if (p.character_id === this.ownCharacterID) continue;
            this.upsertPlayer(p);
        }
    }

    addPlayer(p: PlayerPresencePayload): void {
        if (p.character_id === this.ownCharacterID) return;
        this.upsertPlayer(p);
    }

    updatePosition(p: PlayerMovedPayload): void {
        if (p.character_id === this.ownCharacterID) return;
        const rp = this.players.get(p.character_id);
        if (!rp) return;
        if (p.ts < rp.lastTS) return;
        rp.target.x = p.x;
        rp.target.y = p.y;
        rp.target.dir = p.dir;
        rp.lastTS = p.ts;

        const dx = p.x - rp.container.x;
        const dy = p.y - rp.container.y;
        if (dx * dx + dy * dy > SNAP_DISTANCE_PX * SNAP_DISTANCE_PX) {
            rp.container.setPosition(p.x, p.y);
            this.syncVisuals(rp);
        }
    }

    removePlayer(characterID: string): void {
        if (this.selectedCharacterID === characterID) this.clearSelection();
        const rp = this.players.get(characterID);
        if (!rp) return;
        rp.spineImage?.destroy();
        if (this.scene.textures.exists(rp.spineTexKey)) {
            this.scene.textures.remove(rp.spineTexKey);
        }
        rp.nameText.destroy();
        rp.container.destroy();
        this.players.delete(characterID);
    }

    clear(): void {
        for (const id of Array.from(this.players.keys())) this.removePlayer(id);
    }

    update(): void {
        for (const rp of this.players.values()) {
            const cx = rp.container.x;
            const cy = rp.container.y;
            const tx = rp.target.x;
            const ty = rp.target.y;

            if (cx !== tx || cy !== ty) {
                const nx = cx + (tx - cx) * LERP_FACTOR;
                const ny = cy + (ty - cy) * LERP_FACTOR;
                rp.container.setPosition(nx, ny);
            }

            this.syncVisuals(rp);
            if (this.selectedCharacterID === rp.characterID) {
                this.updateSelectionArrow();
            }

            if (rp.spineLoaded && rp.skeleton && rp.animState) {
                const moved = Math.abs(rp.container.x - tx) + Math.abs(rp.container.y - ty);
                const targetAnim: AnimName = moved > RUN_MOVE_THRESHOLD ? 'run' : 'idle';
                if (
                    targetAnim !== rp.currentAnim
                    && (rp.currentAnim === 'idle' || rp.currentAnim === 'run')
                ) {
                    rp.currentAnim = targetAnim;
                    rp.animState.setAnimation(0, targetAnim, true);
                }
                if (rp.target.dir === 'left') {
                    rp.spineImage?.setFlipX(true);
                } else if (rp.target.dir === 'right') {
                    rp.spineImage?.setFlipX(false);
                }
                this.renderSpine(rp);
            }
        }
    }

    destroy(): void {
        this.clear();
        this.selectionArrow?.destroy();
        this.selectionArrow = undefined;
    }

    handleLeft(p: PlayerLeftPayload): void {
        this.removePlayer(p.character_id);
    }

    getContainer(characterID: string): Phaser.GameObjects.Container | undefined {
        return this.players.get(characterID)?.container;
    }

    private upsertPlayer(p: PlayerPresencePayload): void {
        const existing = this.players.get(p.character_id);
        if (existing) {
            existing.presence = p;
            existing.target.x = p.x;
            existing.target.y = p.y;
            existing.target.dir = p.dir;
            existing.nameText.setText(this.formatNamePlate(p));
            existing.container.setPosition(p.x, p.y);
            this.syncVisuals(existing);
            if (this.sharedSpine && !existing.spineLoaded) this.attachSpine(existing);
            return;
        }

        const container = this.scene.add.container(p.x, p.y);
        container.setDepth(9);

        const nameText = this.scene.add
            .text(p.x, p.y, this.formatNamePlate(p), {
                fontSize: '14px',
                color: '#ffffff',
                fontFamily: 'system-ui, sans-serif',
                stroke: '#000000',
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(11);

        const spineTexKey = `remote-spine-${p.character_id}`;
        const rp: RemotePlayer = {
            characterID: p.character_id,
            container,
            nameText,
            spineTexKey,
            spineLoaded: false,
            currentAnim: 'idle',
            lastTime: performance.now() / 1000,
            target: { x: p.x, y: p.y, dir: p.dir },
            presence: p,
            lastTS: 0,
        };
        this.players.set(p.character_id, rp);
        this.syncVisuals(rp);

        if (this.sharedSpine) this.attachSpine(rp);
    }

    private attachSpine(rp: RemotePlayer): void {
        if (!this.sharedSpine || rp.spineLoaded) return;

        if (this.scene.textures.exists(rp.spineTexKey)) {
            this.scene.textures.remove(rp.spineTexKey);
        }
        const tex = this.scene.textures.createCanvas(rp.spineTexKey, CANVAS_W, CANVAS_H);
        if (!tex) return;

        const ctx = tex.getCanvas().getContext('2d');
        if (!ctx) return;

        const { skeleton, animState } = createSpineInstance(this.sharedSpine);
        skeleton.x = CANVAS_W / 2;
        skeleton.y = SKELETON_CANVAS_Y;

        const spineRenderer = new SkeletonRenderer(ctx);
        spineRenderer.triangleRendering = true;

        const spineImage = this.scene.add.image(0, 0, rp.spineTexKey)
            .setOrigin(0.5, SPINE_ORIGIN_Y)
            .setScale(IMAGE_SCALE)
            .setDepth(9);

        rp.spineTex = tex;
        rp.spineCtx = ctx;
        rp.spineRenderer = spineRenderer;
        rp.skeleton = skeleton;
        rp.animState = animState;
        rp.spineImage = spineImage;
        rp.spineLoaded = true;
        rp.lastTime = performance.now() / 1000;

        this.syncVisuals(rp);
        this.renderSpine(rp);
    }

    private renderSpine(rp: RemotePlayer): void {
        if (
            !rp.spineLoaded
            || !rp.skeleton
            || !rp.animState
            || !rp.spineCtx
            || !rp.spineTex
            || !rp.spineImage
            || !rp.spineRenderer
        ) {
            return;
        }

        const now = performance.now() / 1000;
        const delta = Math.min(now - rp.lastTime, 0.05);
        rp.lastTime = now;

        rp.animState.update(delta);
        rp.animState.apply(rp.skeleton);
        rp.skeleton.update(delta);
        rp.skeleton.updateWorldTransform(Physics.update);

        rp.spineCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        rp.spineRenderer.draw(rp.skeleton);
        rp.spineTex.refresh();

        rp.spineImage.setPosition(
            rp.container.x,
            rp.container.y + SPINE_FOOT_OFFSET_Y,
        );
    }

    /** Name plate + spine follow container (world coords). */
    private syncVisuals(rp: RemotePlayer): void {
        const feetY = rp.container.y + SPINE_FOOT_OFFSET_Y;
        const nameY = feetY - CHAR_HEIGHT_IN_CANVAS * IMAGE_SCALE - 20;
        rp.nameText.setPosition(rp.container.x, nameY);
        if (rp.spineImage) {
            rp.spineImage.setPosition(rp.container.x, feetY);
        }
    }

    private formatNamePlate(p: PlayerPresencePayload): string {
        return (p.display_name ?? '').trim() || 'Ninja';
    }

    private updateSelectionArrow(): void {
        const g = this.selectionArrow;
        if (!g || !this.selectedCharacterID) return;
        const rp = this.players.get(this.selectedCharacterID);
        if (!rp) {
            this.hideSelectionArrow();
            return;
        }
        const feetY = rp.container.y + SPINE_FOOT_OFFSET_Y;
        const nameY = feetY - CHAR_HEIGHT_IN_CANVAS * IMAGE_SCALE - 20;
        const x = rp.container.x;
        const tipY = nameY - SELECTION_ARROW_GAP_PX;
        const topY = tipY - SELECTION_ARROW_H;
        g.clear();
        g.fillStyle(0xffea7a, 1);
        g.lineStyle(2, 0x000000, 1);
        g.beginPath();
        g.moveTo(x - SELECTION_ARROW_HALF_W, topY);
        g.lineTo(x + SELECTION_ARROW_HALF_W, topY);
        g.lineTo(x, tipY);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.setVisible(true);
    }

    private hideSelectionArrow(): void {
        this.selectionArrow?.clear().setVisible(false);
    }
}
