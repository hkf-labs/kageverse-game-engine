import * as Phaser from 'phaser';
import { logout } from '../../network/api';
import {
    ChatPanel, GameControls, HUD, MapBackground, MenuPanel, Minimap, MonsterManager, NpcManager, PlayerController, Portal,
    type MapConfig, type MonsterConfig, type NpcConfig, type PortalConfig,
} from '../components';

export abstract class BaseMapScene extends Phaser.Scene {
    protected background!: MapBackground;
    protected playerCtrl!: PlayerController;
    protected hud!: HUD;
    protected minimap!: Minimap;
    protected chat!: ChatPanel;
    protected menu!: MenuPanel;
    protected controls!: GameControls;
    protected npcs!: NpcManager;
    protected monsters!: MonsterManager;
    protected portals: Portal[] = [];

    private enterKey?: Phaser.Input.Keyboard.Key;

    constructor(sceneKey: string) {
        super(sceneKey);
    }

    protected abstract getMapConfig(): MapConfig;
    protected abstract getNpcConfigs(): NpcConfig[];
    protected getPortalConfigs(): PortalConfig[] { return []; }
    protected getMonsterConfigs(): MonsterConfig[] { return []; }
    protected getMapDisplayName(): string { return ''; }
    protected onMapReady(): void {}

    preload(): void {
        const cfg = this.getMapConfig();
        this.load.image(cfg.playerTextureKey, cfg.playerTextureAsset);
        this.load.image(cfg.bgKey, cfg.bgAsset);
        this.load.json(cfg.colliderKey, cfg.colliderAsset);
        this.load.image('btn_attack', 'assets/game/buttons/button-attack.png');
        this.load.image('btn_chat', 'assets/game/buttons/chat.png');
        this.load.image('btn_menu', 'assets/game/buttons/menu.png');
        this.load.image('topbar', 'assets/game/ui/topbar.png');
        this.preloadMapAssets();
    }

    protected preloadMapAssets(): void {}

    create(): void {
        const cfg = this.getMapConfig();
        const width = this.scale.width;
        this.cameras.main.setBackgroundColor('#77c6ff');

        // Background & platforms
        this.background = new MapBackground(this, cfg);
        this.background.create();

        // Player
        this.playerCtrl = new PlayerController(this, cfg, this.background);
        this.playerCtrl.create();

        // NPC
        this.npcs = new NpcManager(this, this.background, this.getNpcConfigs(), (text, color) => {
            this.hud.setStatus(text, color);
        });
        this.npcs.create();

        // Portals
        this.portals = this.getPortalConfigs().map((portalCfg) => {
            const portal = new Portal(this, portalCfg, this.background, () => {
                this.scene.start(portalCfg.targetSceneKey);
            });
            portal.create();
            return portal;
        });

        // Monsters
        this.monsters = new MonsterManager(this, this.background, this.getMonsterConfigs());
        this.monsters.create();

        // HUD
        this.hud = new HUD(this);
        this.hud.create();

        // Controls
        this.controls = new GameControls(this, {
            onInteract: () => this.handleInteract(),
            onHpPotion: () => this.hud.setStatus('Đã dùng bình HP! (placeholder)', '#ff8a8a'),
            onMpPotion: () => this.hud.setStatus('Đã dùng bình MP! (placeholder)', '#8aaaff'),
            onCycleTarget: () => this.npcs.cycleSelectedNpc(),
            onDirLeft: () => {
                if (this.npcs.getInteractingNpc()) this.npcs.navigateOption('left');
            },
            onDirRight: () => {
                if (this.npcs.getInteractingNpc()) this.npcs.navigateOption('right');
            },
        });
        this.controls.create();

        this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

        // Minimap
        this.minimap = new Minimap(this, this.background.getBgWidth(), this.background.getBgHeight());
        this.minimap.create();
        const player = this.playerCtrl.getPlayer();
        if (player) this.minimap.followPlayer(player);

        // Chat & Menu buttons under minimap
        const mm = this.minimap.getPosition();
        this.createChatMenuButtons(mm.x, mm.y, mm.width, mm.height);

        // Chat
        this.chat = new ChatPanel(this);
        this.chat.create();

        // Menu
        this.menu = new MenuPanel(this, [
            { label: 'Túi đồ', action: () => this.hud.setStatus('Mở Túi Đồ (placeholder)', '#ffea7a') },
            { label: 'Nhiệm vụ', action: () => this.hud.setStatus('Mở Nhiệm Vụ (placeholder)', '#ffea7a') },
            { label: 'Kỹ năng', action: () => this.hud.setStatus('Mở Kỹ Năng (placeholder)', '#ffea7a') },
            { label: 'Cài đặt', action: () => this.hud.setStatus('Cài Đặt (placeholder)', '#ffea7a') },
            { label: 'Đăng xuất', action: () => this.handleLogout() },
        ]);
        this.menu.create();

        // Minimap ignore UI
        this.minimap.ignoreUIElements();

        // Map display name
        const displayName = this.getMapDisplayName();
        if (displayName) {
            this.add.text(width / 2, 26, displayName, {
                fontSize: '16px', color: '#0d2c4a', fontFamily: 'system-ui, sans-serif',
                backgroundColor: '#c7edff', padding: { left: 8, right: 8, top: 4, bottom: 4 },
            }).setOrigin(0.5).setScrollFactor(0);
        }

        this.input.keyboard?.on('keydown-ENTER', () => {
            if (!this.chat.isFocused()) this.handleInteract();
        });

        this.onMapReady();
    }

    update(): void {
        const player = this.playerCtrl.getPlayer();
        const cursors = this.playerCtrl.getCursors();
        if (!player || !cursors) return;

        this.controls.updateVisuals(cursors);
        this.portals.forEach((p) => p.updatePortal(player.x, player.y));
        this.monsters.update();

        if (this.chat.isFocused()) {
            player.body?.setVelocityX(0);
            return;
        }

        this.controls.updateSwitchTarget(this.npcs.canCycleTarget());

        // NPC dialog navigation
        if (this.npcs.getInteractingNpc()) {
            if (Phaser.Input.Keyboard.JustDown(cursors.left)) this.npcs.navigateOption('left');
            else if (Phaser.Input.Keyboard.JustDown(cursors.right)) this.npcs.navigateOption('right');
            else if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) this.handleInteract();
            return;
        }

        if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.handleInteract();
            return;
        }

        // Movement
        const speed = 280;
        const vi = this.controls.getVirtualInputs();
        const moveLeft = cursors.left.isDown || vi.left;
        const moveRight = cursors.right.isDown || vi.right;
        const moveUp = cursors.up.isDown || vi.up;

        const autoTarget = this.npcs.getAutoMoveTargetX();
        if (autoTarget !== null) {
            if (moveLeft || moveRight || moveUp) {
                this.npcs.clearAutoMove();
            } else if (this.npcs.checkAutoMoveArrival(player.x, player.y)) {
                player.body?.setVelocityX(0);
            } else {
                const dx = autoTarget - player.x;
                player.body?.setVelocityX(dx > 0 ? speed : -speed);
                this.playerCtrl.getSprite()?.setFlipX(dx < 0);
            }
        } else if (moveLeft) {
            this.playerCtrl.moveLeft(speed);
        } else if (moveRight) {
            this.playerCtrl.moveRight(speed);
        } else {
            this.playerCtrl.stopHorizontal();
        }

        if (moveUp && this.playerCtrl.isOnGround() && autoTarget === null) {
            this.playerCtrl.jump(580);
        }

        this.playerCtrl.update();
    }

    private handleLogout(): void {
        logout();
        this.scene.start('AuthScene');
    }

    private handleInteract(): void {
        const player = this.playerCtrl.getPlayer();
        if (!player) return;

        const portal = this.portals.find((p) => p.isPlayerInRange());
        if (portal) {
            portal.trigger();
            return;
        }

        this.npcs.handleInteract(player.x, player.y);
    }

    private createChatMenuButtons(mmX: number, mmY: number, mmWidth: number, mmHeight: number): void {
        const cx = mmX + mmWidth / 2;
        const btnY = mmY + mmHeight + 36;
        const SPACING = 60;
        const SCALE = 0.5;

        const makeBtn = (x: number, y: number, key: string, onClick: () => void) => {
            const btn = this.add.image(x, y, key)
                .setScrollFactor(0).setDepth(100).setScale(SCALE)
                .setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => { btn.setScale(SCALE * 0.94); onClick(); });
            btn.on('pointerup', () => btn.setScale(SCALE));
            btn.on('pointerout', () => btn.setScale(SCALE));
        };

        makeBtn(cx - SPACING / 2, btnY, 'btn_chat', () => {
            if (this.menu.isOpen()) this.menu.hide();
            this.chat.toggle();
        });
        makeBtn(cx + SPACING / 2, btnY, 'btn_menu', () => {
            if (this.chat.isOpen()) this.chat.toggle();
            this.menu.toggle();
        });
    }
}
