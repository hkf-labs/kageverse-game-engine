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

// Spine asset path for male base character (animations: idle, run, attack, skill, die, win)
const MALE_BASE_SPINE_PATH = '/assets/characters/male_base/';

// Spine scale relative to hitbox — calibrate so skeleton feet align with hitbox bottom.
const SPINE_SCALE = 0.1;

// Hitbox half-height: skeleton root (feet) = player.y + this offset in world space.
const SPINE_FOOT_OFFSET_Y = 22;

export const HEAD_OFFSET_Y = -39;
export const TOP_OFFSET_Y = 11;
export const BOTTOM_OFFSET_Y = 39;
export const HEAD_OFFSET_X = 5;
export const TOP_OFFSET_X = 3;
export const BOTTOM_OFFSET_X = 0;
export const BODY_SCALE = 0.4;
export const NAME_OFFSET_Y = (HEAD_OFFSET_Y - 38) * BODY_SCALE - 13;

type AnimName = 'idle' | 'run' | 'attack' | 'skill' | 'die' | 'win';

export class PlayerController implements GameComponent {
    private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private playerNameText?: Phaser.GameObjects.Text;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private virtualInputs = { left: false, right: false, up: false };
    private scene: Phaser.Scene;
    private background: MapBackground;

    // Spine state
    private spineCanvas?: HTMLCanvasElement;
    private spineCtx?: CanvasRenderingContext2D;
    private spineRenderer?: SkeletonRenderer;
    private assetManager?: AssetManager;
    private skeleton?: Skeleton;
    private animState?: AnimationState;
    private spineLoaded = false;
    private currentAnim: AnimName = 'idle';
    private spineVisible = true;
    private lastTime = 0;

    constructor(scene: Phaser.Scene, background: MapBackground) {
        this.scene = scene;
        this.background = background;
    }

    create(): void {
        const spawn = 50;
        const hitWidth = 24;
        const hitHeight = 44;
        const hitbox = this.scene.add.rectangle(
            this.background.getWorldWidth() * 0.1, spawn,
            hitWidth, hitHeight,
            0x000000, 0,
        );

        this.scene.physics.add.existing(hitbox, false);
        this.player = hitbox as unknown as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

        if (this.player?.body) {
            this.player.body.setCollideWorldBounds(true);
            this.player.body.setBounce(0);
            this.player.body.debugShowBody = true;
            this.player.body.debugBodyColor = 0xffff00;
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

        this._initSpineCanvas();
        this._loadSpine();

        void this.syncCharacterInfo();
    }

    update(): void {
        if (!this.player || !this.cursors) return;

        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y + NAME_OFFSET_Y);
        }

        this._updateAnimState();

        if (this.spineLoaded) {
            this._renderSpine();
        }
    }

    destroy(): void {
        this.spineCanvas?.remove();
        this.spineCanvas = undefined;
        this.spineLoaded = false;
    }

    setFacing(left: boolean): void {
        if (this.skeleton) {
            this.skeleton.scaleX = left ? -Math.abs(this.skeleton.scaleX) : Math.abs(this.skeleton.scaleX);
            // Keep scaleY negative to maintain upright orientation.
            this.skeleton.scaleY = -Math.abs(this.skeleton.scaleY);
        }
    }

    setVisible(visible: boolean): void {
        this.spineVisible = visible;
        this.playerNameText?.setVisible(visible);
        if (this.spineCanvas) {
            this.spineCanvas.style.display = visible ? 'block' : 'none';
        }
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
        // Legacy stub — appearance is now driven by Spine skin swaps (future feature).
    }

    private _initSpineCanvas(): void {
        const gameCanvas = this.scene.sys.game.canvas;
        const parent = gameCanvas.parentElement!;
        parent.style.position = 'relative';

        this.spineCanvas = document.createElement('canvas');
        this.spineCanvas.id = 'player-spine-canvas';
        this.spineCanvas.width = gameCanvas.width;
        this.spineCanvas.height = gameCanvas.height;
        this.spineCanvas.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6;';
        parent.appendChild(this.spineCanvas);
        this.spineCtx = this.spineCanvas.getContext('2d')!;
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
            start: () => {},
            interrupt: () => {},
            end: () => {},
            dispose: () => {},
            complete: () => {},
        });

        this.spineLoaded = true;
        this.lastTime = performance.now() / 1000;
    }

    private _updateAnimState(): void {
        if (!this.spineLoaded || !this.animState || !this.player) return;

        const vx = this.player.body?.velocity.x ?? 0;
        const onGround = this.isOnGround();
        const isRunning = onGround && Math.abs(vx) > 10;
        const targetAnim: AnimName = isRunning ? 'run' : 'idle';

        // Only transition idle↔run automatically; one-shot anims manage themselves.
        if (
            (targetAnim !== this.currentAnim) &&
            (this.currentAnim === 'idle' || this.currentAnim === 'run')
        ) {
            this.currentAnim = targetAnim;
            this.animState.setAnimation(0, targetAnim, true);
        }
    }

    private _renderSpine(): void {
        if (!this.skeleton || !this.animState || !this.spineCtx || !this.spineCanvas || !this.player) return;

        const gc = this.scene.sys.game.canvas;
        if (this.spineCanvas.width !== gc.width || this.spineCanvas.height !== gc.height) {
            this.spineCanvas.width = gc.width;
            this.spineCanvas.height = gc.height;
        }

        const now = performance.now() / 1000;
        const delta = Math.min(now - this.lastTime, 0.05);
        this.lastTime = now;

        this.animState.update(delta);
        this.animState.apply(this.skeleton);
        this.skeleton.update(delta);
        this.skeleton.updateWorldTransform(Physics.update);

        const cam = this.scene.cameras.main;
        const zoom = cam.zoom;
        const screenX = (this.player.x - cam.scrollX) * zoom;
        const screenY = (this.player.y - cam.scrollY) * zoom + SPINE_FOOT_OFFSET_Y * zoom;

        this.skeleton.x = screenX;
        this.skeleton.y = screenY;

        const ctx = this.spineCtx;
        ctx.clearRect(0, 0, this.spineCanvas.width, this.spineCanvas.height);

        if (this.spineVisible) {
            this.spineRenderer!.draw(this.skeleton);
        }
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
