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

const ANIMS = ['idle', 'run', 'attack', 'skill', 'die', 'win'] as const;
type AnimName = typeof ANIMS[number];

export class MahoragaBossScene extends Phaser.Scene {
    private spineCanvas!: HTMLCanvasElement;
    private spineCtx!: CanvasRenderingContext2D;
    private assetManager!: AssetManager;
    private skeleton?: Skeleton;
    private animState?: AnimationState;
    private spineRenderer?: SkeletonRenderer;
    private lastTime = 0;
    private rafId = 0;
    activeAnim: AnimName = 'idle';
    private loaded = false;
    private btnEls: HTMLButtonElement[] = [];
    private controlsEl?: HTMLElement;

    constructor() {
        super('MahoragaBossScene');
    }

    create() {
        this.add.rectangle(640, 360, 1280, 720, 0x05050f).setDepth(0);

        this.add.text(640, 30, '⚔  MAHORAGA — SPINE PREVIEW', {
            fontSize: '18px', color: '#f0a020', fontFamily: 'monospace',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(10);

        const back = this.add.text(30, 20, '← BACK', {
            fontSize: '14px', color: '#aaa', fontFamily: 'monospace',
            backgroundColor: '#111', padding: { x: 8, y: 4 },
        }).setDepth(10).setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => {
            this._teardown();
            this.scene.start('AuthScene');
        });

        this._initSpineCanvas();
        this._initControls();
        this._initSpine();
    }

    private _initSpineCanvas() {
        const gameCanvas = this.sys.game.canvas;
        const parent = gameCanvas.parentElement!;
        parent.style.position = 'relative';

        this.spineCanvas = document.createElement('canvas');
        this.spineCanvas.id = 'mahoraga-spine-canvas';
        this.spineCanvas.width = 1280;
        this.spineCanvas.height = 720;
        this.spineCanvas.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
        parent.appendChild(this.spineCanvas);
        this.spineCtx = this.spineCanvas.getContext('2d')!;
    }

    private _initControls() {
        const parent = this.sys.game.canvas.parentElement!;
        this.controlsEl = document.createElement('div');
        this.controlsEl.id = 'mahoraga-controls';
        this.controlsEl.style.cssText =
            'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:20;pointer-events:all;';
        parent.appendChild(this.controlsEl);

        ANIMS.forEach(name => {
            const btn = document.createElement('button');
            btn.textContent = name.toUpperCase();
            btn.dataset.anim = name;
            const active = name === 'idle';
            btn.style.cssText = `
                background:${active ? '#f0a020' : '#1a1a2e'};
                border:1px solid #f0a020;
                color:${active ? '#000' : '#f0a020'};
                padding:5px 14px;border-radius:4px;cursor:pointer;
                font-size:12px;font-family:monospace;letter-spacing:1px;
                text-transform:uppercase;transition:background 0.15s;
            `;
            btn.addEventListener('click', () => this._playAnim(name));
            this.controlsEl!.appendChild(btn);
            this.btnEls.push(btn);
        });
    }

    private _initSpine() {
        this.spineRenderer = new SkeletonRenderer(this.spineCtx);
        this.spineRenderer.triangleRendering = true;
        this.assetManager = new AssetManager('/assets/mahoraga/');
        this.assetManager.loadText('Mahoraga.json');
        this.assetManager.loadTextureAtlas('Mahoraga.atlas');
        this._pollLoad();
    }

    private _pollLoad() {
        if (this.assetManager.isLoadingComplete()) {
            this._buildSkeleton();
        } else if (this.assetManager.hasErrors()) {
            console.error('Spine load errors:', this.assetManager.getErrors());
        } else {
            setTimeout(() => this._pollLoad(), 50);
        }
    }

    private _buildSkeleton() {
        const atlas = this.assetManager.require('Mahoraga.atlas');
        const json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
        json.scale = 0.18;

        const skelData = json.readSkeletonData(this.assetManager.require('Mahoraga.json'));
        this.skeleton = new Skeleton(skelData);
        this.skeleton.setToSetupPose();
        this.skeleton.x = 640;
        this.skeleton.y = 660;

        const stateData = new AnimationStateData(skelData);
        stateData.defaultMix = 0.3;
        this.animState = new AnimationState(stateData);
        this.animState.setAnimation(0, 'idle', true);

        this.loaded = true;
        this.lastTime = performance.now() / 1000;
        this._rafLoop();
    }

    private _playAnim(name: AnimName) {
        this.activeAnim = name;
        this.btnEls.forEach(b => {
            const active = b.dataset.anim === name;
            b.style.background = active ? '#f0a020' : '#1a1a2e';
            b.style.color = active ? '#000' : '#f0a020';
        });
        if (!this.animState) return;
        const loop = name === 'idle' || name === 'run';
        this.animState.setAnimation(0, name, loop);
        if (!loop) this.animState.addAnimation(0, 'idle', true, 0);
    }

    private _rafLoop() {
        if (!this.loaded) return;
        this.rafId = requestAnimationFrame(() => this._rafLoop());

        const now = performance.now() / 1000;
        const delta = Math.min(now - this.lastTime, 0.05);
        this.lastTime = now;

        this.animState!.update(delta);
        this.animState!.apply(this.skeleton!);
        this.skeleton!.update(delta);
        this.skeleton!.updateWorldTransform(Physics.update);

        const ctx = this.spineCtx;
        ctx.clearRect(0, 0, 1280, 720);

        // Glow shadow under boss
        const grd = ctx.createRadialGradient(640, 670, 10, 640, 670, 130);
        grd.addColorStop(0, 'rgba(240,80,20,0.3)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(460, 570, 360, 130);

        this.spineRenderer!.draw(this.skeleton!);
    }

    private _teardown() {
        cancelAnimationFrame(this.rafId);
        this.loaded = false;
        this.spineCanvas?.remove();
        this.controlsEl?.remove();
        this.btnEls = [];
    }

    shutdown() {
        this._teardown();
    }
}
