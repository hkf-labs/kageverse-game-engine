import * as Phaser from 'phaser';
import {
    AssetManager,
    SkeletonRenderer,
    AtlasAttachmentLoader,
    SkeletonJson,
    AnimationState,
    AnimationStateData,
    Physics,
    Skeleton,
} from '@esotericsoftware/spine-canvas';
import { getCurrentCharacter, saveCurrentCharacter } from '../playerSession';
import { charactersAPI } from '../../network/api';
import type { MapSpawnPoint } from '../spawn';
import type { GameComponent } from './types';
import type { MapBackground } from './MapBackground';

export interface CharacterAppearance {
    headTextureKey: string;
    topTextureKey: string;
    bottomTextureKey: string;
}

export const DEFAULT_CHARACTER_APPEARANCE: CharacterAppearance = {
    headTextureKey: 'body-head-default',
    topTextureKey: 'body-top-default',
    bottomTextureKey: 'body-bottom-default',
};

export const DEFAULT_CHARACTER_APPEARANCE_ASSETS: Record<string, string> = {
    'body-head-default': 'assets/game/characters/body-head-default.png',
    'body-top-default': 'assets/game/characters/body-top-default.png',
    'body-bottom-default': 'assets/game/characters/body-bottom-default.png',
};

const MALE_BASE_SPINE_PATH = '/assets/characters/male_base/';
const SPINE_SCALE = 0.1;
// Where the skeleton root (feet) sits relative to the hitbox center.
const SPINE_FOOT_OFFSET_Y = 22;

// Off-screen canvas used by SkeletonRenderer. Large enough to contain full
// skeleton at SPINE_SCALE=0.1 including any VFX bones.
const CANVAS_W = 400;
const CANVAS_H = 500;
// skeleton.y inside the canvas — feet anchor near bottom with margin for effects.
const SKELETON_CANVAS_Y = CANVAS_H - 40;
// Approximate pixel height of the skeleton within the canvas (head-to-feet).
// Tune this until the name sits correctly above the head.
const CHAR_HEIGHT_IN_CANVAS = SKELETON_CANVAS_Y - 293;

// Scale the Phaser Image so the visible character matches world-unit size.
// At SPINE_SCALE=0.1 the skeleton is ~367px tall in canvas space.
// Target ~80 world units visible height → 80/367 ≈ 0.22.  Tune if needed.
const IMAGE_SCALE = 0.5;

// Unique texture key — must be removed on destroy() so re-entering the scene
// doesn't hit a duplicate-key error.
const SPINE_TEX_KEY = 'player-spine-tex';

export const HEAD_OFFSET_Y = -39;
export const TOP_OFFSET_Y = 11;
export const BOTTOM_OFFSET_Y = 39;
export const HEAD_OFFSET_X = 5;
export const TOP_OFFSET_X = 3;
export const BOTTOM_OFFSET_X = 0;
export const BODY_SCALE = 0.4;
export const NAME_OFFSET_Y = 0;

type AnimName = 'idle' | 'run' | 'attack' | 'skill' | 'die' | 'win';

export class PlayerController implements GameComponent {
    private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private playerNameText?: Phaser.GameObjects.Text;
    private spineImage?: Phaser.GameObjects.Image;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private virtualInputs = { left: false, right: false, up: false };
    private scene: Phaser.Scene;
    private background: MapBackground;

    // Spine state
    private spineTex?: Phaser.Textures.CanvasTexture;
    private spineCtx?: CanvasRenderingContext2D;
    private spineRenderer?: SkeletonRenderer;
    private assetManager?: AssetManager;
    private skeleton?: Skeleton;
    private animState?: AnimationState;
    private spineLoaded = false;
    private currentAnim: AnimName = 'idle';
    private lastTime = 0;
    private activated = false;

    constructor(scene: Phaser.Scene, background: MapBackground) {
        this.scene = scene;
        this.background = background;
    }

    create(initialSpawn?: MapSpawnPoint): void {
        const defaultX = this.background.getWorldWidth() * 0.1;
        const defaultY = 50;
        const spawnX = initialSpawn?.x ?? defaultX;
        const spawnY = initialSpawn?.y ?? defaultY;
        const hitWidth = 24;
        const hitHeight = 44;
        const hitbox = this.scene.add.rectangle(
            spawnX, spawnY,
            hitWidth, hitHeight,
            0x000000, 0,
        );

        this.scene.physics.add.existing(hitbox, false);
        this.player = hitbox as unknown as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

        if (this.player?.body) {
            this.player.body.setCollideWorldBounds(true);
            this.player.body.setBounce(0);
            this.player.body.debugShowBody = false;
        }

        const displayName = getCurrentCharacter()?.displayName || 'Ninja';
        this.playerNameText = this.scene.add.text(
            this.player!.x, this.player!.y + NAME_OFFSET_Y,
            displayName,
            {
                fontSize: '14px', color: '#fff',
                fontFamily: 'system-ui, sans-serif',
                stroke: '#000', strokeThickness: 4,
            },
        ).setOrigin(0.5).setDepth(11);

        this.scene.physics.add.collider(this.player!, this.background.getPlatforms());

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        this.scene.cameras.main.startFollow(this.player!, true, 0.1, 0.1);
        this.scene.cameras.main.setDeadzone(width * 0.1, height * 0.2);
        this.scene.cameras.main.setBounds(0, 0, this.background.getWorldWidth(), this.background.getBgHeight());

        this.cursors = this.scene.input.keyboard?.createCursorKeys();

        this._initSpineTexture();
        this._loadSpine();

        // Khởi tạo "frozen" — no gravity + invisible. Scene gọi activate() sau
        // khi loadInitialCharacterState restore xong vị trí cuối. Tránh user
        // thấy nhân vật xuất hiện ở default spawn (x*0.1, 50) rồi rơi xuống
        // trước khi API trả last_pos_x/y (race lúc F5).
        if (this.player?.body) {
            this.player.body.setAllowGravity(false);
            this.player.body.setVelocity(0, 0);
        }
        this.setVisible(false);

        void this.syncCharacterInfo();
    }

    /** Bật gravity + hiện sprite. Scene gọi sau khi API trả vị trí cuối
     * (loadInitialCharacterState xong, dù success hay fail) — không kẹt
     * "frozen" mãi nếu API fail. Idempotent. */
    activate(): void {
        if (this.activated) return;
        this.activated = true;
        if (this.player?.body) {
            this.player.body.setAllowGravity(true);
        }
        this.setVisible(true);
    }

    isActivated(): boolean {
        return this.activated;
    }

    update(): void {
        if (!this.player || !this.cursors) return;

        if (this.playerNameText) {
            const charHeightWorld = CHAR_HEIGHT_IN_CANVAS * IMAGE_SCALE;
            const feetWorldY = this.player.y + SPINE_FOOT_OFFSET_Y;
            this.playerNameText.setPosition(this.player.x, feetWorldY - charHeightWorld - 20);
        }

        this._updateAnimState();

        if (this.spineLoaded) {
            this._renderSpine();
        }
    }

    destroy(): void {
        this.spineLoaded = false;
        this.spineImage?.destroy();
        this.spineImage = undefined;
        // Remove the CanvasTexture so re-entering the scene doesn't hit a duplicate key.
        if (this.scene.textures.exists(SPINE_TEX_KEY)) {
            this.scene.textures.remove(SPINE_TEX_KEY);
        }
        this.spineTex = undefined;
    }

    setFacing(left: boolean): void {
        if (this.skeleton) {
            this.skeleton.scaleX = left ? -Math.abs(this.skeleton.scaleX) : Math.abs(this.skeleton.scaleX);
            this.skeleton.scaleY = -Math.abs(this.skeleton.scaleY);
        }
    }

    setVisible(visible: boolean): void {
        this.playerNameText?.setVisible(visible);
        this.spineImage?.setVisible(visible);
        const hitboxRect = this.player as unknown as Phaser.GameObjects.Rectangle | undefined;
        hitboxRect?.setVisible(visible);
    }

    /** Trigger a one-shot animation (attack, skill, die, win). Returns to idle after. */
    playAnim(name: AnimName): void {
        if (!this.animState || !this.spineLoaded) return;
        const looping = name === 'idle' || name === 'run';
        this.currentAnim = name;
        this.animState.setAnimation(0, name, looping);
        if (!looping) {
            this.animState.addAnimation(0, 'idle', true, 0);
        }
    }

    getPlayer(): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined { return this.player; }
    getCursors(): Phaser.Types.Input.Keyboard.CursorKeys | undefined { return this.cursors; }
    getVirtualInputs(): { left: boolean; right: boolean; up: boolean } { return this.virtualInputs; }
    getSprite(): Phaser.GameObjects.Container | undefined { return undefined; }

    moveLeft(speed: number): void {
        this.player?.body?.setVelocityX(-speed);
        this.setFacing(true);
    }

    moveRight(speed: number): void {
        this.player?.body?.setVelocityX(speed);
        this.setFacing(false);
    }

    stopHorizontal(): void {
        this.player?.body?.setVelocityX(0);
    }

    jump(force: number): void {
        this.player?.body?.setVelocityY(-force);
    }

    isOnGround(): boolean {
        if (!this.player?.body) return false;
        return this.player.body.blocked.down || this.player.body.touching.down;
    }

    setAppearance(_appearance: Partial<CharacterAppearance>): void {
        // Legacy stub — appearance driven by Spine skin swaps in the future.
    }

    private _initSpineTexture(): void {
        // Remove stale texture from a previous scene visit before creating.
        if (this.scene.textures.exists(SPINE_TEX_KEY)) {
            this.scene.textures.remove(SPINE_TEX_KEY);
        }

        const tex = this.scene.textures.createCanvas(SPINE_TEX_KEY, CANVAS_W, CANVAS_H);
        if (!tex) return;
        this.spineTex = tex;
        this.spineCtx = tex.getCanvas().getContext('2d')!;

        // Anchor at (0.5, SKELETON_CANVAS_Y / CANVAS_H) so the feet pixel in
        // the canvas aligns with the world position we set each frame.
        const originY = SKELETON_CANVAS_Y / CANVAS_H;
        this.spineImage = this.scene.add.image(0, 0, SPINE_TEX_KEY)
            .setOrigin(0.5, originY)
            .setScale(IMAGE_SCALE)
            .setDepth(10)
            .setVisible(false);
    }

    private _loadSpine(): void {
        this.spineRenderer = new SkeletonRenderer(this.spineCtx!);
        this.spineRenderer.triangleRendering = true;
        this.assetManager = new AssetManager(MALE_BASE_SPINE_PATH);
        this.assetManager.loadText('male_base.json');
        this.assetManager.loadTextureAtlas('male_base.atlas');
        this._pollLoad();
    }

    private _pollLoad(): void {
        if (!this.assetManager) return;
        if (this.assetManager.isLoadingComplete()) {
            this._buildSkeleton();
        } else if (this.assetManager.hasErrors()) {
            console.error('[PlayerController] Spine load errors:', this.assetManager.getErrors());
        } else {
            setTimeout(() => this._pollLoad(), 50);
        }
    }

    private _buildSkeleton(): void {
        if (!this.assetManager || !this.spineCtx) return;

        const atlas = this.assetManager.require('male_base.atlas');
        const json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
        json.scale = SPINE_SCALE;

        const skelData = json.readSkeletonData(this.assetManager.require('male_base.json'));
        this.skeleton = new Skeleton(skelData);
        this.skeleton.setToSetupPose();
        // Canvas 2D Y-axis points down; Spine Y-axis points up — flip to correct.
        this.skeleton.scaleY = -1;
        // Root is feet — anchor to the fixed canvas point.
        this.skeleton.x = CANVAS_W / 2;
        this.skeleton.y = SKELETON_CANVAS_Y;

        const stateData = new AnimationStateData(skelData);
        stateData.defaultMix = 0.2;
        this.animState = new AnimationState(stateData);
        this.animState.setAnimation(0, 'idle', true);

        // Cut attack to 1 hit: transition to idle on the first "Attack" event.
        this.animState.addListener({
            event: (entry, event) => {
                if (entry.animation?.name === 'attack' && event.data.name === 'Attack') {
                    this.animState!.setAnimation(0, 'idle', true);
                }
            },
            start: () => { },
            interrupt: () => { },
            end: () => { },
            dispose: () => { },
            complete: () => { },
        });

        this.spineLoaded = true;
        this.lastTime = performance.now() / 1000;
    }

    private _updateAnimState(): void {
        if (!this.spineLoaded || !this.animState || !this.player) return;

        const vx = this.player.body?.velocity.x ?? 0;
        const onGround = this.isOnGround();
        const targetAnim: AnimName = (onGround && Math.abs(vx) > 10) ? 'run' : 'idle';

        // Only auto-transition between idle↔run; one-shot anims manage themselves.
        if (targetAnim !== this.currentAnim &&
            (this.currentAnim === 'idle' || this.currentAnim === 'run')) {
            this.currentAnim = targetAnim;
            this.animState.setAnimation(0, targetAnim, true);
        }
    }

    private _renderSpine(): void {
        if (!this.skeleton || !this.animState || !this.spineCtx || !this.spineTex || !this.player || !this.spineImage) return;

        const now = performance.now() / 1000;
        const delta = Math.min(now - this.lastTime, 0.05);
        this.lastTime = now;

        this.animState.update(delta);
        this.animState.apply(this.skeleton);
        this.skeleton.update(delta);
        this.skeleton.updateWorldTransform(Physics.update);

        // Draw skeleton onto the off-screen CanvasTexture.
        const ctx = this.spineCtx;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        this.spineRenderer!.draw(this.skeleton);

        // Push pixel changes to the WebGL texture.
        this.spineTex.refresh();

        // Move the Phaser Image to follow the hitbox in world space.
        this.spineImage.setPosition(
            this.player.x,
            this.player.y + SPINE_FOOT_OFFSET_Y,
        );
    }

    private async syncCharacterInfo(): Promise<void> {
        let character = getCurrentCharacter();
        if (!character) {
            try {
                const list = await charactersAPI.list();
                if (list.characters.length > 0) {
                    saveCurrentCharacter(list.characters[0]);
                    character = getCurrentCharacter();
                }
            } catch {
                // Keep fallback name if API fails.
            }
        }
        if (character?.displayName && this.playerNameText) {
            this.playerNameText.setText(character.displayName);
        }
    }
}
