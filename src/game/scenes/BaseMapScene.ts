import * as Phaser from 'phaser';
import { charactersAPI, logout } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import {
    ActionMenu, BuffIndicator, ChatPanel, EquipmentModal, GameControls, HUD, InventoryModal, MapBackground, Minimap, MonsterManager, NpcChatBubble, NpcManager, PlayerController, Portal, QuestLogPanel, QuestTracker, ShopModal,
    categoryForTemplate, iconForTemplate,
    type MapConfig, type NpcConfig, type PortalConfig,
} from '../components';

export abstract class BaseMapScene extends Phaser.Scene {
    protected background!: MapBackground;
    protected playerCtrl!: PlayerController;
    protected hud!: HUD;
    protected minimap!: Minimap;
    protected chat!: ChatPanel;
    protected actionMenu!: ActionMenu;
    protected inventory!: InventoryModal;
    protected shop!: ShopModal;
    protected npcChatBubble!: NpcChatBubble;
    protected buffIndicator!: BuffIndicator;
    protected controls!: GameControls;
    protected npcs!: NpcManager;
    protected monsters!: MonsterManager;
    protected questLog!: QuestLogPanel;
    protected questTracker!: QuestTracker;
    protected equipment!: EquipmentModal;
    protected portals: Portal[] = [];

    private enterKey?: Phaser.Input.Keyboard.Key;
    private escKey?: Phaser.Input.Keyboard.Key;
    private questKey?: Phaser.Input.Keyboard.Key;
    private lastKnownLevel = 1;
    private lastKnownStats = { max_hp: 100, max_mp: 50 };
    private positionSaveTimer?: number;
    private beforeUnloadHandler?: () => void;
    private readonly POSITION_SAVE_INTERVAL_MS = 30_000;

    constructor(sceneKey: string) {
        super(sceneKey);
    }

    protected abstract getMapConfig(): MapConfig;
    protected abstract getNpcConfigs(): NpcConfig[];
    protected getPortalConfigs(): PortalConfig[] { return []; }
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

        // Shop modal — phải tạo trước NpcManager để NPC dialog gọi được.
        this.shop = new ShopModal(this);
        this.shop.create();

        // Bong bóng thoại NPC (typewriter)
        this.npcChatBubble = new NpcChatBubble(this);
        this.npcChatBubble.create();

        // ActionMenu — phải tạo trước NpcManager vì NPC dialog ủy quyền cho nó.
        this.actionMenu = new ActionMenu(this);
        this.actionMenu.create();

        // Quest log — tạo trước NpcManager để NPC dialog có thể mở/refresh panel.
        // onQuestsUpdated push cache mới nhất vào QuestTracker mỗi khi refresh().
        this.questLog = new QuestLogPanel(this, {
            onQuestsUpdated: async (quests) => {
                this.questTracker?.setQuests(quests);
                // Mọi quest event (accept/turn-in/kill) đều có thể đổi state
                // offered/turn-in của NPC khác → refresh badge + cache.
                await this.npcs?.refreshBadges();
                // Empty-state hint: không có quest active/completed nhưng có
                // NPC đang offer (vd new char chưa nhận Q1) → giục player.
                const hasTracked = quests.some((q) => q.status === 'active' || q.status === 'completed');
                if (!hasTracked) {
                    const npc = this.npcs?.getFirstOfferedNpc();
                    this.questTracker?.setEmptyHint(npc ? `Đến gặp ${npc.name} để nhận nhiệm vụ` : null);
                } else {
                    this.questTracker?.setEmptyHint(null);
                }
            },
        });
        this.questLog.create();

        // Quest tracker — DOM góc trái, click mở quest log.
        this.questTracker = new QuestTracker(this, () => this.questLog.open());
        this.questTracker.create();

        // NPC
        this.npcs = new NpcManager(this, this.background, this.getNpcConfigs(), {
            mapId: cfg.mapId,
            actionMenu: this.actionMenu,
            shopModal: this.shop,
            chatBubble: this.npcChatBubble,
            questLog: this.questLog,
            onStatusMessage: (text, color) => this.hud.setStatus(text, color),
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

        // Monsters — BE-driven (data từ /maps/:id/monsters per character).
        this.monsters = new MonsterManager(this, this.background, cfg.mapId, {
            onAttackResult: (res) => this.handleAttackResult(res),
            onError: (msg) => this.hud.setStatus(msg, '#ff8a8a'),
        });
        this.monsters.create();
        this.monsters.setPlayerPositionGetter(() => {
            const p = this.playerCtrl.getPlayer();
            return p ? { x: p.x, y: p.y } : null;
        });

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
                if (this.actionMenu.isOpen()) this.actionMenu.navigate('left');
            },
            onDirRight: () => {
                if (this.actionMenu.isOpen()) this.actionMenu.navigate('right');
            },
        });
        this.controls.create();

        this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.questKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.J);

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

        // Buff indicator (food buff icon + countdown). Khi layout đổi (add/remove
        // buff), reflow QuestTracker xuống dưới panel buff để không đè.
        this.buffIndicator = new BuffIndicator(this, {
            onLayoutChanged: () => this.syncQuestTrackerOffset(),
        });
        this.buffIndicator.create();

        // Inventory modal (HTML DOM overlay) — callback HUD + buff indicator khi dùng item.
        this.inventory = new InventoryModal(this, {
            onStatsChanged: (stats) => {
                this.hud.setStats({
                    current_hp: stats.current_hp,
                    max_hp: stats.max_hp,
                    current_mp: stats.current_mp,
                    max_mp: stats.max_mp,
                    level: this.lastKnownLevel,
                });
            },
            onFoodBuffStarted: (buff) => {
                this.buffIndicator.setBuff({
                    key: categoryForTemplate(buff.item_template_id),
                    expiresAt: new Date(buff.expires_at),
                    icon: iconForTemplate(buff.item_template_id),
                    label: buff.item_template_id,
                });
            },
            onEquipmentChanged: () => {
                if (this.equipment?.isOpen()) void this.equipment.refresh();
            },
        });
        this.inventory.create();

        // Equipment modal — view trang bị đang mặc + tháo. Equip mới đi qua InventoryModal.
        this.equipment = new EquipmentModal(this, {
            onStatsChanged: (stats) => {
                this.hud.setStats({
                    current_hp: stats.current_hp,
                    max_hp: stats.max_hp,
                    current_mp: stats.current_mp,
                    max_mp: stats.max_mp,
                    level: this.lastKnownLevel,
                });
            },
        });
        this.equipment.create();

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

        void this.loadInitialCharacterState();
        this.startPositionAutosave();

        this.onMapReady();
    }

    /**
     * Reflow QuestTracker để xếp dọc dưới BuffIndicator: có buff → tracker
     * dịch xuống dưới panel buff (~y=176); không buff → về vị trí mặc định
     * (y=80, ngay dưới topbar).
     */
    private syncQuestTrackerOffset(): void {
        if (!this.questTracker || !this.buffIndicator) return;
        const top = this.buffIndicator.hasBuffs() ? 176 : 80;
        this.questTracker.setTopOffset(top);
    }

    private startPositionAutosave(): void {
        // Periodic save every 30s — phòng trường hợp beforeunload fail (mobile / crash).
        this.positionSaveTimer = window.setInterval(() => {
            this.savePositionFireAndForget(false);
        }, this.POSITION_SAVE_INTERVAL_MS);

        // beforeunload: F5 / close tab / navigate away. fetch keepalive cho phép request
        // sống tiếp ngay cả khi tab đã đóng.
        this.beforeUnloadHandler = () => {
            this.savePositionFireAndForget(true);
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);

        // Khi scene chuyển (vd portal sang map khác) → save trước rồi cleanup.
        this.events.once('shutdown', () => {
            this.savePositionFireAndForget(false);
            this.cleanupPositionAutosave();
        });
    }

    private cleanupPositionAutosave(): void {
        if (this.positionSaveTimer !== undefined) {
            window.clearInterval(this.positionSaveTimer);
            this.positionSaveTimer = undefined;
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadHandler = undefined;
        }
    }

    private savePositionFireAndForget(keepalive: boolean): void {
        const character = getCurrentCharacter();
        if (!character) return;
        const player = this.playerCtrl?.getPlayer();
        if (!player) return;
        const cfg = this.getMapConfig();
        // KHÔNG await — fire-and-forget.
        void charactersAPI.savePosition(
            character.id,
            { map_id: cfg.mapId, x: player.x, y: player.y },
            { keepalive },
        ).catch((err) => {
            if (err instanceof Error) console.warn('scene: save position failed', err.message);
        });
    }

    private async loadInitialCharacterState(): Promise<void> {
        const current = getCurrentCharacter();
        if (!current) return;
        // Initial fetch quest list để QuestTracker populate ngay khi vào scene.
        void this.questLog.refresh();
        try {
            const list = await charactersAPI.list();
            const c = list.characters.find((it) => it.id === current.id) ?? list.characters[0];
            if (!c) return;
            this.lastKnownLevel = c.level;
            this.lastKnownStats.max_hp = c.max_hp;
            this.lastKnownStats.max_mp = c.max_mp;
            this.hud.setStats({
                current_hp: c.current_hp,
                max_hp: c.max_hp,
                current_mp: c.current_mp,
                max_mp: c.max_mp,
                level: c.level,
            });
            if (c.active_food_buff) {
                this.buffIndicator.setBuff({
                    key: categoryForTemplate(c.active_food_buff.item_template_id),
                    expiresAt: new Date(c.active_food_buff.expires_at),
                    icon: iconForTemplate(c.active_food_buff.item_template_id),
                    label: c.active_food_buff.item_template_id,
                });
            } else {
                this.buffIndicator.removeBuff('food_buff');
            }

            // Restore tọa độ nếu nhân vật từng lưu trên đúng map này.
            const cfg = this.getMapConfig();
            if (
                c.last_map_id === cfg.mapId
                && c.last_pos_x !== null && c.last_pos_x !== undefined
                && c.last_pos_y !== null && c.last_pos_y !== undefined
            ) {
                const player = this.playerCtrl.getPlayer();
                if (player) {
                    player.setPosition(c.last_pos_x, c.last_pos_y);
                }
            }

            // Portal lock theo unlocked_maps: portal đến map chưa unlock thì lock.
            // Áp dụng SAU portal config gốc (config gốc lock vẫn giữ — vd Sword School cần Bái Sư).
            const { mapIdForSceneKey } = await import('../maps/registry');
            this.portals.forEach((p) => {
                const targetMapId = mapIdForSceneKey(p.getTargetSceneKey());
                if (targetMapId && !c.unlocked_maps.includes(targetMapId)) {
                    p.setLocked(true);
                    p.setLockedMessage('Map này chưa mở khoá. Tiếp tục nhiệm vụ chính tuyến để mở.');
                }
            });

            // QA bypass: mở khoá toàn bộ portal đang locked (trump cả unlocked_maps gating).
            if (c.unlock_all_maps) {
                this.portals.forEach((p) => p.setLocked(false));
            }
        } catch (err) {
            if (err instanceof Error) console.warn('scene: load character state failed', err.message);
        }
    }

    update(): void {
        const player = this.playerCtrl.getPlayer();
        const cursors = this.playerCtrl.getCursors();
        if (!player || !cursors) return;

        this.controls.updateVisuals(cursors);
        this.portals.forEach((p) => p.updatePortal(player.x, player.y));
        this.monsters.update();
        this.npcChatBubble.update();
        this.buffIndicator.update();

        if (this.chat.isFocused() || this.shop?.isOpen() || this.questLog?.isVisible() || this.equipment?.isOpen()) {
            player.body?.setVelocityX(0);
            // Trong khi panel mở: ESC đóng, các key khác bị bỏ qua.
            if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
                if (this.questLog?.isVisible()) this.questLog.close();
                else if (this.equipment?.isOpen()) this.equipment.close();
            }
            return;
        }

        // J toggle Nhật ký Nhiệm vụ — chỉ khi không có modal/menu khác.
        if (
            this.questKey
            && Phaser.Input.Keyboard.JustDown(this.questKey)
            && !this.actionMenu.isOpen()
            && !this.inventory.isOpen()
        ) {
            this.questLog.open();
            return;
        }

        this.controls.updateSwitchTarget(this.npcs.canCycleTarget());

        // ActionMenu mở → cướp keys (←/→ chọn, Enter confirm, ESC đóng).
        // Không touch velocity → trạng thái nhân vật giữ nguyên (có thể đang drift).
        if (this.actionMenu.isOpen()) {
            if (Phaser.Input.Keyboard.JustDown(cursors.left)) this.actionMenu.navigate('left');
            else if (Phaser.Input.Keyboard.JustDown(cursors.right)) this.actionMenu.navigate('right');
            else if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) this.actionMenu.confirm();
            else if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) this.actionMenu.close();
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
        if (this.actionMenu.isOpen()) return;
        const player = this.playerCtrl.getPlayer();
        if (!player) return;

        const portal = this.portals.find((p) => p.isPlayerInRange());
        if (portal) {
            if (portal.isLocked()) {
                const msg = portal.getLockedMessage() ?? 'Cổng đang khoá. Bạn cần hoàn thành nhiệm vụ để mở.';
                this.hud.setStatus(msg, '#ff8a8a');
                return;
            }
            portal.trigger();
            return;
        }

        if (this.npcs.getSelectedNpc()) {
            this.npcs.handleInteract(player.x, player.y);
            return;
        }

        // Không có portal/NPC → swing vào quái gần nhất.
        void this.monsters.attackNearest();
    }

    private handleAttackResult(res: import('../../network/api').AttackResponse): void {
        // Update HUD HP/MP/Level + XP bar.
        this.hud.setStats({
            current_hp: res.character_current_hp,
            max_hp: res.level_up?.new_max_hp ?? this.lastKnownStats.max_hp,
            current_mp: res.character_current_mp,
            max_mp: res.level_up?.new_max_mp ?? this.lastKnownStats.max_mp,
            level: res.character_level,
        });
        this.lastKnownLevel = res.character_level;
        if (res.level_up) {
            this.lastKnownStats.max_hp = res.level_up.new_max_hp;
            this.lastKnownStats.max_mp = res.level_up.new_max_mp;
            this.showLevelUpBanner(res.level_up.from_level, res.level_up.to_level);
        }
        if (res.xp_gained > 0) this.showXPFloater(res.xp_gained);
        // Quest progress: BE đã track kill, FE chỉ refresh cache khi quái chết.
        if (res.monster_dead) {
            void this.questLog?.refresh();
        }
        // Death check.
        if (res.character_current_hp <= 0) {
            void this.handleDeath();
        }
    }

    private showXPFloater(amount: number): void {
        const player = this.playerCtrl.getPlayer();
        if (!player) return;
        const txt = this.add.text(player.x, player.y - 100, `+${amount} XP`, {
            fontSize: '14px', fontStyle: 'bold', color: '#bdf0a0',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(60);
        this.tweens.add({
            targets: txt, y: txt.y - 50, alpha: 0,
            duration: 900, ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy(),
        });
    }

    private showLevelUpBanner(from: number, to: number): void {
        const w = this.scale.width;
        const h = this.scale.height;
        const banner = this.add.text(w / 2, h / 2 - 60, `LV ${from} → ${to}!`, {
            fontSize: '36px', fontStyle: 'bold', color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 6,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
        this.tweens.add({
            targets: banner,
            y: banner.y - 80, alpha: 0,
            duration: 1800, ease: 'Cubic.easeOut',
            onComplete: () => banner.destroy(),
        });
    }

    private async handleDeath(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        const overlay = this.add.rectangle(this.scale.width / 2, this.scale.height / 2,
            this.scale.width, this.scale.height, 0x000000, 0.6)
            .setScrollFactor(0).setDepth(250);
        const txt = this.add.text(this.scale.width / 2, this.scale.height / 2, 'BẠN ĐÃ GỤC...\nĐang hồi sinh ở Làng', {
            fontSize: '24px', color: '#ff8a8a', align: 'center',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(251);

        await new Promise((r) => setTimeout(r, 3000));
        try {
            const { combatAPI } = await import('../../network/api');
            const res = await combatAPI.respawn(character.id);
            this.hud.setStats({
                current_hp: res.current_hp,
                max_hp: res.current_hp,
                current_mp: res.current_mp,
                max_mp: res.current_mp,
                level: this.lastKnownLevel,
            });
            this.scene.start('VillageScene');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Hồi sinh thất bại';
            this.hud.setStatus(msg, '#ff8a8a');
        } finally {
            overlay.destroy();
            txt.destroy();
        }
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
            if (this.actionMenu.isOpen()) this.actionMenu.close();
            this.chat.toggle();
        });
        makeBtn(cx + SPACING / 2, btnY, 'btn_menu', () => {
            if (this.chat.isOpen()) this.chat.toggle();
            if (this.actionMenu.isOpen()) {
                this.actionMenu.close();
                return;
            }
            this.openMainMenu();
        });
    }

    private openMainMenu(): void {
        this.actionMenu.open({
            title: 'Menu',
            items: [
                { key: 'inventory', label: 'Túi đồ', icon: '🎒', action: () => this.inventory.toggle() },
                { key: 'equipment', label: 'Trang bị', icon: '⚔️', action: () => this.equipment.toggle() },
                { key: 'quests', label: 'Nhiệm vụ', icon: '📜', action: () => this.questLog.open() },
                { key: 'skills', label: 'Kỹ năng', icon: '⚡', action: () => this.hud.setStatus('Mở Kỹ Năng (placeholder)', '#ffea7a') },
                { key: 'settings', label: 'Cài đặt', icon: '⚙️', action: () => this.hud.setStatus('Cài Đặt (placeholder)', '#ffea7a') },
                { key: 'logout', label: 'Đăng xuất', icon: '🚪', action: () => this.handleLogout() },
            ],
        });
    }
}
