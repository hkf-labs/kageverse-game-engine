import * as Phaser from 'phaser';
import { charactersAPI, logout } from '../../network/api';
import { disconnectRealtime, wsClient } from '../../network/realtime';
import { getCurrentCharacter } from '../playerSession';
import { t } from '../../i18n';
import {
    ActionMenu, BossHPBar, BuffIndicator, CharacterInfoModal, ChatPanel, ConfirmDialog, DEFAULT_CHARACTER_APPEARANCE_ASSETS, DeathMenu, EndMvpOverlay, EquipmentModal, GameControls, HoshiUpgradeModal, HUD, InventoryModal, MapBackground, Minimap, MonsterManager, MonsterTargetFrame, NpcChatBubble, NpcManager, PlayerChatBubble, PlayerController, Portal, QuestLogPanel, QuestTracker, RemotePlayerManager, SettingsModal, ShopModal, SkillHotbar, SkillModal,
    categoryForTemplate, iconForTemplate,
    type MapConfig, type NpcConfig, type PortalConfig,
} from '../components';

export abstract class BaseMapScene extends Phaser.Scene {
    protected background!: MapBackground;
    protected playerCtrl!: PlayerController;
    protected hud!: HUD;
    protected minimap!: Minimap;
    protected chat!: ChatPanel;
    protected confirmDialog!: ConfirmDialog;
    protected actionMenu!: ActionMenu;
    protected inventory!: InventoryModal;
    protected shop!: ShopModal;
    protected npcChatBubble!: NpcChatBubble;
    protected buffIndicator!: BuffIndicator;
    protected controls!: GameControls;
    protected npcs!: NpcManager;
    protected monsters!: MonsterManager;
    protected targetFrame!: MonsterTargetFrame;
    protected bossHPBar!: BossHPBar;
    protected deathMenu!: DeathMenu;
    private deathState: 'alive' | 'dead' | 'spectating' = 'alive';
    protected questLog!: QuestLogPanel;
    protected questTracker!: QuestTracker;
    protected equipment!: EquipmentModal;
    protected hoshiUpgradeModal!: HoshiUpgradeModal;
    protected endMvpOverlay!: EndMvpOverlay;
    protected characterInfo!: CharacterInfoModal;
    protected skillModal!: SkillModal;
    protected skillHotbar!: SkillHotbar;
    protected settingsModal!: SettingsModal;
    protected portals: Portal[] = [];
    protected remotePlayers!: RemotePlayerManager;
    protected playerChatBubble!: PlayerChatBubble;
    private autoAttackEnabled = false;
    private lastEnterAt = 0;
    private readonly DOUBLE_TAP_MS = 1500;

    private enterKey?: Phaser.Input.Keyboard.Key;
    private escKey?: Phaser.Input.Keyboard.Key;
    private questKey?: Phaser.Input.Keyboard.Key;
    private lastKnownLevel = 1;
    private lastKnownExp = { exp: 0, expToNext: 1 };
    private lastKnownStats = { max_hp: 100, max_mp: 50 };
    private positionSaveTimer?: number;
    private beforeUnloadHandler?: () => void;
    private readonly POSITION_SAVE_INTERVAL_MS = 30_000;

    // Realtime WS — danh sách unsubscribe trả về từ wsClient.events.on(...).
    // Cleanup ở shutdown để không leak listener qua scene transitions.
    private rtUnsubs: Array<() => void> = [];
    private rtMoveSendThrottleAt = 0;
    private rtLastSentPos = { x: 0, y: 0, dir: 'right' as 'left' | 'right' };
    private rtJoined = false;
    private readonly RT_MOVE_THROTTLE_MS = 33; // ~30 Hz cap
    private readonly RT_MOVE_DELTA_PX = 1; // Send only when meaningful move

    constructor(sceneKey: string) {
        super(sceneKey);
    }

    protected abstract getMapConfig(): MapConfig;

    // Default lookup từ map registry — scene chỉ cần override nếu muốn label khác.
    protected abstract getNpcConfigs(): NpcConfig[];
    protected getPortalConfigs(): PortalConfig[] { return []; }
    protected getMapDisplayName(): string { return ''; }
    protected onMapReady(): void {}

    preload(): void {
        const cfg = this.getMapConfig();
        for (const [key, asset] of Object.entries(DEFAULT_CHARACTER_APPEARANCE_ASSETS)) {
            this.load.image(key, asset);
        }
        this.load.image(cfg.bgKey, cfg.bgAsset);
        this.load.json(cfg.colliderKey, cfg.colliderAsset);
        if (cfg.surfaceTextures) {
            for (const tex of Object.values(cfg.surfaceTextures)) {
                this.load.image(tex.key, tex.asset);
            }
        }
        if (cfg.parallaxBg) {
            for (const layer of cfg.parallaxBg.layers) {
                this.load.image(layer.key, layer.asset);
            }
            if (cfg.parallaxBg.overlays) {
                for (const ov of cfg.parallaxBg.overlays) {
                    this.load.image(ov.key, ov.asset);
                }
            }
        }
        this.load.image('btn_attack', 'assets/game/buttons/button-attack.png');
        this.load.image('btn_chat', 'assets/game/buttons/chat.png');
        this.load.image('btn_menu', 'assets/game/buttons/menu.png');
        this.load.image('topbar', 'assets/game/ui/topbar.png');
        this.load.image('skill_slot_empty', 'assets/game/skills/skill-empty.png');
        this.preloadMapAssets();
    }

    protected preloadMapAssets(): void {}

    create(): void {
        // Defensive cleanup: nếu shutdown handler trước đó miss vì lý do nào đó
        // (Phaser internal race, dev hot-reload, etc.), purge mọi DOM overlay
        // tagged kageverse-overlay trước khi tạo bộ mới. Tránh stack 2+ tracker /
        // modal đè nhau qua từng lần chuyển scene.
        document.querySelectorAll('.kageverse-overlay').forEach((el) => el.remove());

        const cfg = this.getMapConfig();
        const width = this.scale.width;
        this.cameras.main.setBackgroundColor('#77c6ff');

        // Background & platforms
        this.background = new MapBackground(this, cfg);
        this.background.create();

        // Player
        this.playerCtrl = new PlayerController(this, this.background);
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

        // ConfirmDialog — tạo trước NpcManager vì runQuestAccept với
        // confirm_warning_key cần dialog có sẵn.
        this.confirmDialog = new ConfirmDialog(this);
        this.confirmDialog.create();

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

        // Hoshi cường hoá modal — wired vào NPC action 'upgrade_equipment'.
        // onUpgraded refresh quest log để Q13 item_upgraded objective tăng tiến độ.
        this.hoshiUpgradeModal = new HoshiUpgradeModal(this, {
            onUpgraded: () => void this.questLog?.refresh(),
        });
        this.hoshiUpgradeModal.create();

        // End-MVP cinematic overlay — show khi Q17 turn-in (mq_first_trial_*).
        this.endMvpOverlay = new EndMvpOverlay(this);
        this.endMvpOverlay.create();

        // NPC
        this.npcs = new NpcManager(this, this.background, this.getNpcConfigs(), {
            mapId: cfg.mapId,
            actionMenu: this.actionMenu,
            confirmDialog: this.confirmDialog,
            shopModal: this.shop,
            chatBubble: this.npcChatBubble,
            questLog: this.questLog,
            hoshiUpgradeModal: this.hoshiUpgradeModal,
            onStatusMessage: (text, color) => this.hud.setStatus(text, color),
            onQuestRewarded: (questName, rewards) => this.showQuestRewardFloater(questName, rewards),
            onLevelUp: (levelUp) => this.applyLevelUp(levelUp),
            onEndMvp: (className) => this.endMvpOverlay.show(className),
            onCharacterUpdated: (char) => {
                // Bái Sư accept side effect set_class → cập nhật HUD class badge
                // + lastKnownLevel + max_hp/mp. Mọi nhãn dán cache khác (apparel/
                // jewelry classFilter) đọc từ playerSession đã refresh trước đó.
                this.lastKnownLevel = char.level;
                this.lastKnownStats.max_hp = char.max_hp;
                this.lastKnownStats.max_mp = char.max_mp;
                this.hud.setStats({
                    current_hp: char.current_hp,
                    max_hp: char.max_hp,
                    current_mp: char.current_mp,
                    max_mp: char.max_mp,
                    level: char.level,
                });
                this.hud.setClass(char.class);
            },
        });
        this.npcs.create();
        this.npcs.setPlayerPositionGetter(() => {
            const p = this.playerCtrl.getPlayer();
            return p ? { x: p.x, y: p.y } : null;
        });

        // Portals
        this.portals = this.getPortalConfigs().map((portalCfg) => {
            const portal = new Portal(this, portalCfg, this.background, () => {
                this.scene.start(portalCfg.targetSceneKey);
            });
            portal.create();
            return portal;
        });

        // Target frame — top-center HUD cho quái đang nhắm.
        this.targetFrame = new MonsterTargetFrame(this);
        this.targetFrame.create();

        // Boss HP bar — full-width banner top, chỉ engage khi grade=leader/world_boss
        // (vd Q17 mq_first_trial Kage Tinh Khôi). Disengage khi target cleared
        // hoặc boss chết.
        this.bossHPBar = new BossHPBar(this);
        this.bossHPBar.create();

        // Monsters — BE-driven (data từ /maps/:id/monsters per character).
        this.monsters = new MonsterManager(this, this.background, cfg.mapId, {
            onAttackResult: (res) => this.handleAttackResult(res),
            onError: (msg) => this.hud.setStatus(msg, '#ff8a8a'),
            onTargetSelected: (m) => {
                this.targetFrame?.setTarget(m);
                this.bossHPBar?.engage(m); // no-op nếu không phải boss-grade.
            },
            onTargetCleared: () => {
                this.targetFrame?.clear();
                this.bossHPBar?.disengage();
            },
            onRetaliation: (r) => this.showRetaliationFloater(r.damage),
            onTickResult: (hp, dead) => this.handleTickResult(hp, dead),
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
            onHpPotion: () => this.hud.setStatus(t('combat.potion_hp_placeholder'), '#ff8a8a'),
            onMpPotion: () => this.hud.setStatus(t('combat.potion_mp_placeholder'), '#8aaaff'),
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
        this.minimap = new Minimap(this, this.background.getWorldWidth(), this.background.getBgHeight());
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
                // equip_item objective (vd Q3 mq_first_swing) — refresh quest
                // tracker + NPC badge. questLog.refresh() chain qua
                // onQuestsUpdated → tracker.setQuests + npcs.refreshBadges.
                void this.questLog?.refresh();
            },
            onItemUsed: () => {
                // use_item objective (vd Q4 mq_slime_purge use 1 potion).
                void this.questLog?.refresh();
            },
            onSkillLearned: (skillIDs) => {
                // Bí Kíp Kỹ Năng (Q11) consume → BE đã grant skill. FE auto-
                // assign skill mới vào hotbar slot trống đầu tiên + show banner
                // animation. Best-effort: lỗi → log silent, hotbar refresh
                // sau cũng tự cập nhật skill list.
                void this.handleSkillLearned(skillIDs);
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
            onEquipmentChanged: () => {
                // Unequip ở EquipmentModal cũng có thể đổi state Q3 progress.
                void this.questLog?.refresh();
            },
        });
        this.equipment.create();

        // Character info modal — view profile nhân vật. Reusable cho click NPC
        // / player khác xem thông tin (post-MVP).
        this.characterInfo = new CharacterInfoModal(this);
        this.characterInfo.create();

        // Skill modal — Menu → Kỹ năng. Khi gán slot xong, push xuống hotbar
        // để khỏi mất round-trip BE thêm cho UI sync.
        this.skillModal = new SkillModal(this, {
            onSlotsChanged: (slots) => this.skillHotbar?.setSlots(slots),
        });
        this.skillModal.create();

        // Skill hotbar — 5 slot ngoài world, phía trên minimap mobile.
        this.skillHotbar = new SkillHotbar(this);
        this.skillHotbar.create();
        this.skillHotbar.setOnSlotPressed((_idx, skillID) => {
            void this.handleCastSkill(skillID);
        });

        // Settings modal — Menu chức năng → Cài đặt. Locale switcher (11 ngôn
        // ngữ) là feature MVP duy nhất; các option khác placeholder.
        this.settingsModal = new SettingsModal(this);
        this.settingsModal.create();

        // Death menu (Kiệt sức) — overlay khi character HP=0.
        this.deathMenu = new DeathMenu(this, {
            onChoice: (c) => void this.handleDeathChoice(c),
        });
        this.deathMenu.create();

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

        // Remote players — render player khác trong map. Tạo trước
        // setupRealtimeListeners để snapshot/joined event có target để gọi.
        this.remotePlayers = new RemotePlayerManager(this);
        this.remotePlayers.create();

        // Player chat bubble — multi-instance theo characterID. Show khi
        // nhận chat_message channel=map. Cleanup khi player_left.
        this.playerChatBubble = new PlayerChatBubble(this);
        this.playerChatBubble.create();

        void this.loadInitialCharacterState();
        this.startPositionAutosave();
        this.setupRealtimeListeners();

        // Scene shutdown (portal / scene.start) → destroy DOM overlays để không
        // tích tụ qua mỗi lần chuyển map. Phaser tự cleanup GameObjects nhưng
        // <div> append vào canvas parent thì phải tự xoá.
        this.events.once('shutdown', () => {
            this.teardownRealtimeListeners();
            this.questTracker?.destroy();
            this.questLog?.destroy();
            this.equipment?.destroy();
            this.characterInfo?.destroy();
            this.skillModal?.destroy();
            this.skillHotbar?.destroy();
            this.settingsModal?.destroy();
            this.inventory?.destroy();
            this.shop?.destroy();
            this.chat?.destroy();
            this.confirmDialog?.destroy();
            this.deathMenu?.destroy();
            this.targetFrame?.destroy();
            this.remotePlayers?.destroy();
            this.playerChatBubble?.destroy();
        });

        this.onMapReady();
    }

    // ---- Realtime ----------------------------------------------------------

    // setupRealtimeListeners subscribe tới WS event sau khi scene mount xong.
    // Personal channel (char_stats / char_level_up / snapshot_position) cập
    // nhật HUD; map room (map_snapshot / player_joined / player_moved /
    // player_left) update RemotePlayerManager.
    //
    // Gửi join_map ngay; server sẽ trả map_snapshot. Nếu WS chưa open, send()
    // queue lại — flush khi onopen.
    private setupRealtimeListeners(): void {
        const character = getCurrentCharacter();
        if (!character) return;
        this.remotePlayers.setOwnCharacterID(character.id);

        // F1 — char_stats: HP/MP/EXP update từ use_item, retaliation, respawn,
        // level_up. Reuse hud.setStats với cached level.
        this.rtUnsubs.push(
            wsClient.events.on('char_stats', (p) => {
                const exp = p.exp ?? this.lastKnownExp.exp;
                const expNext = p.exp_to_next_level ?? this.lastKnownExp.expToNext;
                if (p.exp !== undefined) this.lastKnownExp.exp = p.exp;
                if (p.exp_to_next_level !== undefined) this.lastKnownExp.expToNext = p.exp_to_next_level;
                this.lastKnownStats.max_hp = p.max_hp;
                this.lastKnownStats.max_mp = p.max_mp;
                this.hud.setStats({
                    current_hp: p.current_hp,
                    max_hp: p.max_hp,
                    current_mp: p.current_mp,
                    max_mp: p.max_mp,
                    level: this.lastKnownLevel,
                });
                if (expNext > 0) this.hud.setExpPercent((exp / expNext) * 100);
            }),
        );

        // F2 — char_level_up: cascade. Update level cache + HUD + show banner.
        this.rtUnsubs.push(
            wsClient.events.on('char_level_up', (p) => {
                this.lastKnownLevel = p.to_level;
                this.lastKnownStats.max_hp = p.new_max_hp;
                this.lastKnownStats.max_mp = p.new_max_mp;
                this.hud.setStats({
                    current_hp: p.current_hp,
                    max_hp: p.new_max_hp,
                    current_mp: p.current_mp,
                    max_mp: p.new_max_mp,
                    level: p.to_level,
                });
                this.showLevelUpBanner(p.from_level, p.to_level);
            }),
        );

        // Snapshot position — server reject move (out_of_bounds / max_speed) → rollback.
        this.rtUnsubs.push(
            wsClient.events.on('snapshot_position', (p) => {
                const player = this.playerCtrl?.getPlayer();
                if (player) player.setPosition(p.x, p.y);
                this.rtLastSentPos = { x: p.x, y: p.y, dir: this.rtLastSentPos.dir };
            }),
        );

        // F3 — map presence.
        this.rtUnsubs.push(
            wsClient.events.on('map_snapshot', (p) => {
                this.remotePlayers.applySnapshot(p);
            }),
        );
        this.rtUnsubs.push(
            wsClient.events.on('player_joined', (p) => {
                this.remotePlayers.addPlayer(p);
            }),
        );
        this.rtUnsubs.push(
            wsClient.events.on('player_moved', (p) => {
                this.remotePlayers.updatePosition(p);
            }),
        );
        this.rtUnsubs.push(
            wsClient.events.on('player_left', (p) => {
                this.remotePlayers.handleLeft(p);
                // Cleanup bubble nếu player rời map giữa chừng (bubble TTL có
                // thể chưa expire).
                this.playerChatBubble?.remove(p.character_id);
            }),
        );

        // Chat — receive map / world. Map → bubble trên sprite + append vào
        // panel; world → chỉ append panel (không bubble, tránh spam toàn map).
        this.rtUnsubs.push(
            wsClient.events.on('chat_message', (p) => {
                if (p.channel === 'map') {
                    const target = this.resolveBubbleTarget(p.sender_character_id);
                    if (target) this.playerChatBubble?.show(p.sender_character_id ?? '', target, p.text);
                }
                this.chat?.appendMessage(p);
            }),
        );

        // chat_history reply — ChatPanel quản lý hiển thị (bulk render +
        // pagination). Bubble không liên quan history.
        this.rtUnsubs.push(
            wsClient.events.on('chat_history', (p) => {
                this.chat?.applyHistory(p);
            }),
        );

        // sendJoinMap lùi tới khi loadInitialCharacterState restore xong
        // position. Listeners đã sẵn sàng → nếu BE đẩy event sớm vẫn nhận.
    }

    // resolveBubbleTarget → trả container của sender (local hoặc remote).
    // null khi sender không có sprite (race chat_message tới trước map_snapshot,
    // hoặc system message với sender_character_id rỗng).
    private resolveBubbleTarget(senderID: string | undefined):
        Phaser.GameObjects.Container | undefined {
        if (!senderID) return undefined;
        const own = getCurrentCharacter()?.id;
        if (own && senderID === own) {
            return this.playerCtrl?.getSprite();
        }
        return this.remotePlayers?.getContainer(senderID);
    }

    private teardownRealtimeListeners(): void {
        for (const unsub of this.rtUnsubs) {
            try { unsub(); } catch { /* ignore */ }
        }
        this.rtUnsubs = [];
        if (this.rtJoined) {
            wsClient.send({ t: 'leave_map', p: {} });
            this.rtJoined = false;
        }
    }

    private sendJoinMap(): void {
        const cfg = this.getMapConfig();
        const player = this.playerCtrl?.getPlayer();
        if (!player) return;
        const x = player.x;
        const y = player.y;
        const dir = this.rtLastSentPos.dir;
        wsClient.send({
            t: 'join_map',
            p: { map_id: cfg.mapId, x, y, dir },
        });
        this.rtLastSentPos = { x, y, dir };
        this.rtJoined = true;
    }

    // sendMoveIfNeeded gọi từ scene.update() — throttle 30 Hz + delta check.
    // Direction infer từ player velocity (chuyển facing).
    private sendMoveIfNeeded(): void {
        if (!this.rtJoined) return;
        const player = this.playerCtrl?.getPlayer();
        if (!player) return;
        const now = performance.now();
        if (now - this.rtMoveSendThrottleAt < this.RT_MOVE_THROTTLE_MS) return;
        const x = player.x;
        const y = player.y;
        const dx = x - this.rtLastSentPos.x;
        const dy = y - this.rtLastSentPos.y;
        // Detect direction từ velocity X (nếu đang đứng yên giữ dir cũ).
        const vx = player.body?.velocity.x ?? 0;
        let dir: 'left' | 'right' = this.rtLastSentPos.dir;
        if (vx < -1) dir = 'left';
        else if (vx > 1) dir = 'right';
        const dirChanged = dir !== this.rtLastSentPos.dir;
        if (Math.abs(dx) < this.RT_MOVE_DELTA_PX && Math.abs(dy) < this.RT_MOVE_DELTA_PX && !dirChanged) return;
        wsClient.send({ t: 'move', p: { x, y, dir } });
        this.rtLastSentPos = { x, y, dir };
        this.rtMoveSendThrottleAt = now;
    }

    /**
     * Reflow QuestTracker để xếp dọc dưới BuffIndicator: có buff → tracker
     * dịch xuống dưới panel buff (~y=176); không buff → về vị trí mặc định
     * (y=80, ngay dưới topbar).
     */
    private syncQuestTrackerOffset(): void {
        if (!this.questTracker || !this.buffIndicator) return;
        // Topbar render từ y=0..91 (asset 568x182 scaled 0.5). Buff panel anchor
        // y=110, cao ~55px (icon 36 + countdown text). Tracker stack dưới topbar
        // hoặc dưới panel buff khi có.
        const top = this.buffIndicator.hasBuffs() ? 176 : 100;
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
            this.hud.setExpPercent(c.exp_to_next_level > 0 ? (c.exp / c.exp_to_next_level) * 100 : 0);
            this.hud.setClass(c.class);
            // Sync death_state từ DB — nếu user trước đó chọn 'Đóng' rồi đóng
            // browser, scene mount lại vẫn ở spectating; show menu để chọn tiếp.
            if (c.death_state === 'dead' || c.death_state === 'spectating') {
                this.deathState = c.death_state;
                this.deathMenu.showOptions();
            }
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

            // Cache exp baseline cho char_stats (BE chỉ gửi exp khi reason
            // đụng EXP — use_item / respawn không gửi, FE giữ value cũ).
            this.lastKnownExp.exp = c.exp;
            this.lastKnownExp.expToNext = c.exp_to_next_level || 1;

            // Position đã restore → giờ mới send join_map cho BE biết vị trí
            // chính xác. Nếu fail trước đây (race) BE không broadcast presence
            // tới player khác; sau load này thì OK.
            this.sendJoinMap();

            // Portal lock theo unlocked_maps: portal đến map đã unlock → mở khoá;
            // chưa unlock → khoá kèm message gợi quest. Note: scene config có thể
            // set locked=true mặc định cho UX (vd "Cần Bái Sư"), nhưng nếu BE đã
            // unlock_map thì FE bỏ qua scene config gốc.
            const { mapIdForSceneKey } = await import('../maps/registry');
            this.portals.forEach((p) => {
                const targetMapId = mapIdForSceneKey(p.getTargetSceneKey());
                if (!targetMapId) return;
                if (c.unlocked_maps.includes(targetMapId)) {
                    p.setLocked(false);
                } else {
                    p.setLocked(true);
                    // Giữ lockedMessage gốc của scene nếu có — nhiều thông tin hơn message generic.
                    if (!p.getLockedMessage()) {
                        p.setLockedMessage(t('map.locked_default'));
                    }
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

        this.background.update();
        this.controls.updateVisuals(cursors);
        this.portals.forEach((p) => p.updatePortal(player.x, player.y));
        this.monsters.update();
        this.npcs.update();
        this.npcChatBubble.update();
        this.buffIndicator.update();

        // Death state: khoá toàn bộ input movement / attack. Enter mở/giữ menu.
        if (this.deathState !== 'alive') {
            player.body?.setVelocityX(0);
            if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
                if (this.deathMenu.getStage() === 'menu') {
                    // No-op: menu đang mở, Enter không action gì (player phải click).
                } else {
                    this.deathMenu.showOptions();
                }
            }
            return;
        }

        if (this.chat.isFocused() || this.shop?.isOpen() || this.questLog?.isVisible() || this.equipment?.isOpen() || this.characterInfo?.isOpen() || this.skillModal?.isOpen() || this.settingsModal?.isOpen()) {
            player.body?.setVelocityX(0);
            // CharacterInfoModal đang mở → forward arrow keys cho scroll content.
            this.characterInfo?.update();
            // Trong khi panel mở: ESC đóng, các key khác bị bỏ qua.
            if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
                if (this.questLog?.isVisible()) this.questLog.close();
                else if (this.equipment?.isOpen()) this.equipment.close();
                else if (this.characterInfo?.isOpen()) this.characterInfo.close();
                else if (this.skillModal?.isOpen()) this.skillModal.close();
                else if (this.settingsModal?.isOpen()) this.settingsModal.close();
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
            const now = Date.now();
            if (this.autoAttackEnabled) {
                // Bất kỳ Enter nào → tắt auto.
                this.setAutoAttack(false, t('combat.auto_attack_off'));
                this.lastEnterAt = 0;
            } else if (now - this.lastEnterAt < this.DOUBLE_TAP_MS) {
                // Enter thứ 2 trong cửa sổ 1.5s → bật auto.
                this.setAutoAttack(true, t('combat.auto_attack_on'));
                this.lastEnterAt = 0;
            } else {
                this.lastEnterAt = now;
                this.handleInteract();
            }
            return;
        }

        // Movement
        const speed = 280;
        const vi = this.controls.getVirtualInputs();
        const moveLeft = cursors.left.isDown || vi.left;
        const moveRight = cursors.right.isDown || vi.right;
        const moveUp = cursors.up.isDown || vi.up;

        // Auto-attack tick: idle → swing per cooldown. Move keys → tắt + apply
        // movement frame này.
        if (this.autoAttackEnabled) {
            if (moveLeft || moveRight || moveUp) {
                this.setAutoAttack(false, t('combat.auto_attack_off_moving'));
            } else {
                void this.monsters.swing();
            }
        }

        const autoTarget = this.npcs.getAutoMoveTargetX();
        if (autoTarget !== null) {
            if (moveLeft || moveRight || moveUp) {
                this.npcs.clearAutoMove();
            } else if (this.npcs.checkAutoMoveArrival(player.x, player.y)) {
                player.body?.setVelocityX(0);
            } else {
                const dx = autoTarget - player.x;
                player.body?.setVelocityX(dx > 0 ? speed : -speed);
                this.playerCtrl.setFacing(dx < 0);
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
        this.remotePlayers?.update();
        this.playerChatBubble?.update();
        this.sendMoveIfNeeded();
    }

    private handleLogout(): void {
        disconnectRealtime();
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
                const msg = portal.getLockedMessage() ?? t('portal.locked_default');
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
        // Note: applyLevelUp() là path tương đương cho quest reward XP — combat
        // path tự xử lý ở trên vì AttackResponse có thêm character_current_hp/mp
        // (không heal-full). Quest turn-in luôn heal-full khi level up nên dùng
        // helper riêng.
        if (res.character_exp_to_next_level > 0) {
            this.hud.setExpPercent((res.character_exp / res.character_exp_to_next_level) * 100);
        }
        // Quest progress: BE đã track kill, FE chỉ refresh cache khi có quái chết.
        const anyDead = res.hits.some((h) => h.dead);
        if (anyDead) {
            void this.questLog?.refresh();
            // Update target frame + boss HP bar fade-out cho con đã chết.
            for (const h of res.hits) {
                if (h.dead) {
                    this.targetFrame?.onMonsterDead(h.instance_id);
                    this.bossHPBar?.onBossDead(h.instance_id); // no-op nếu không phải boss đang engage.
                }
            }
        }
        // Sync target frame + boss HP bar cho con đang nhắm còn sống.
        for (const h of res.hits) {
            if (!h.dead) {
                this.targetFrame?.updateHP(h.instance_id, h.hp_remaining);
                this.bossHPBar?.updateHP(h.instance_id, h.hp_remaining);
            }
        }
        // Death check.
        if (res.character_dead || res.character_current_hp <= 0) {
            void this.handleDeath();
        }
    }

    private handleTickResult(currentHP: number, dead: boolean): void {
        // Tick chỉ update HP — MP/level/XP do Attack tick / loadInitialState lo.
        this.hud.setHP(currentHP, this.lastKnownStats.max_hp);
        if (dead || currentHP <= 0) {
            this.handleDeath();
        }
    }

    /**
     * Apply level-up từ quest turn-in path. Quest reward XP heal-full HP/MP
     * (xem BE quest/infrastructure/repository/actions.go grantXP) → HUD reflect
     * max + show banner. Khác combat path: combat trả character_current_hp riêng
     * (có thể không = max nếu vừa bị retaliate), nên combat tự handle.
     */
    private applyLevelUp(levelUp: import('../../network/api').LevelUpDTO): void {
        this.lastKnownStats.max_hp = levelUp.new_max_hp;
        this.lastKnownStats.max_mp = levelUp.new_max_mp;
        this.lastKnownLevel = levelUp.to_level;
        this.hud.setStats({
            current_hp: levelUp.new_max_hp,
            max_hp: levelUp.new_max_hp,
            current_mp: levelUp.new_max_mp,
            max_mp: levelUp.new_max_mp,
            level: levelUp.to_level,
        });
        this.showLevelUpBanner(levelUp.from_level, levelUp.to_level);
    }

    private showRetaliationFloater(damage: number): void {
        const player = this.playerCtrl.getPlayer();
        if (!player) return;
        const txt = this.add.text(player.x, player.y - 80, `-${damage}`, {
            fontSize: '15px', fontStyle: 'bold', color: '#ff5454',
            fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(60);
        this.tweens.add({
            targets: txt, y: txt.y - 40, alpha: 0,
            duration: 800, ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy(),
        });
        // Player flash đỏ.
        const sprite = this.playerCtrl.getSprite();
        if (sprite) {
            this.tweens.add({
                targets: sprite, alpha: 0.4,
                duration: 80, yoyo: true,
            });
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

    private showQuestRewardFloater(questName: string, rewards: import('../../network/api').QuestRewardsDTO): void {
        const player = this.playerCtrl.getPlayer();
        if (!player) return;
        // Stack: tên quest + từng dòng reward, mỗi dòng cách 18px. Float lên cao
        // hơn XP floater thường (-120 vs -100) để không đè lên +XP của combat.
        const lines: Array<{ text: string; color: string }> = [
            { text: `✅ ${questName}`, color: '#ffea7a' },
        ];
        if (rewards.exp > 0) lines.push({ text: `+${rewards.exp} XP`, color: '#bdf0a0' });
        if (rewards.yen > 0) lines.push({ text: `+${rewards.yen} Yên`, color: '#f0b020' });
        if (rewards.coin > 0) lines.push({ text: `+${rewards.coin} Xu`, color: '#ffd070' });
        if (rewards.items) {
            for (const it of rewards.items) {
                lines.push({ text: `+${it.qty} ${it.template_id}`, color: '#bdf0a0' });
            }
        }
        const baseY = player.y - 120;
        lines.forEach((line, i) => {
            const txt = this.add.text(player.x, baseY + i * 18, line.text, {
                fontSize: '13px', fontStyle: 'bold', color: line.color,
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(60);
            this.tweens.add({
                targets: txt, y: txt.y - 60, alpha: 0,
                duration: 1800, ease: 'Cubic.easeOut',
                delay: i * 80,
                onComplete: () => txt.destroy(),
            });
        });
    }

    /**
     * Cast active skill (active_buff) khi player nhấn key 1-5 hoặc click slot.
     * Best-effort: lỗi (cooldown / MP / dead / not_buff_skill) → toast hiển thị
     * msg_key. Thành công → BE đã write buff DB + emit char_stats realtime;
     * FE optimistic update HUD MP + show BuffIndicator entry với expires.
     */
    private async handleCastSkill(skillID: string): Promise<void> {
        if (this.deathState !== 'alive' || !skillID) return;
        const character = getCurrentCharacter();
        if (!character) return;
        const { skillAPI } = await import('../../network/api');
        try {
            const res = await skillAPI.cast(character.id, skillID);
            if (res.buff) {
                // BE đã emit realtime char_stats sau cast (MP changed) — HUD
                // sync qua existing char_stats listener. FE chỉ cần show
                // BuffIndicator + status feedback.
                const skillNameKey = `skill.${skillID.replace(/\./g, '_')}.name`;
                const skillName = t(skillNameKey);
                this.buffIndicator?.setBuff({
                    key: `skill_buff.${skillID}`,
                    expiresAt: new Date(res.buff.expires_at_unix_ms),
                    icon: '✨',
                    label: skillName,
                });
                this.hud.setStatus(t('skill.cast_success', { name: skillName }), '#bdf0a0');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('api.error.cast_skill');
            this.hud.setStatus(msg, '#ff8a8a');
        }
    }

    /**
     * Bí Kíp Kỹ Năng consume → handle wire:
     *   1. Auto-assign skill mới vào hotbar slot trống đầu tiên (call BE
     *      skill-slots PUT). Skip nếu skill đã trong slot hoặc không còn slot.
     *   2. Refresh SkillHotbar để hiển thị skill mới.
     *   3. Show banner animation 📜 + skill name (placeholder visual; designer
     *      thay sprite/SFX sau).
     */
    private async handleSkillLearned(skillIDs: string[]): Promise<void> {
        if (!skillIDs || skillIDs.length === 0) return;
        const character = getCurrentCharacter();
        if (!character) return;
        const newSkillID = skillIDs[0];

        const { skillAPI } = await import('../../network/api');
        let skillName = newSkillID;
        try {
            const list = await skillAPI.list(character.id);
            // Lookup skill name từ skills list (BE đã grant).
            const found = list.skills.find((s) => s.skill_id === newSkillID);
            if (found?.name_key) skillName = t(found.name_key);

            // Auto-assign vào empty slot đầu tiên (nếu chưa có).
            const slots = list.skill_slots ? [...list.skill_slots] : [];
            while (slots.length < 5) slots.push(null);
            if (!slots.includes(newSkillID)) {
                const emptyIdx = slots.findIndex((s) => !s);
                if (emptyIdx >= 0) {
                    slots[emptyIdx] = newSkillID;
                    try {
                        await skillAPI.assignSlots(character.id, slots);
                        this.skillHotbar?.setSlots(slots);
                    } catch (err) {
                        console.warn('[skill] auto-assign failed', err);
                    }
                }
            } else {
                // Đã có trong slot — chỉ refresh paint.
                this.skillHotbar?.setSlots(slots);
            }
        } catch (err) {
            console.warn('[skill] post-learn lookup failed', err);
        }

        // Refresh hotbar để skill mới có icon đúng (nếu BE trả texture key).
        void this.skillHotbar?.refresh();

        this.showSkillLearnedBanner(skillName);
    }

    /**
     * Banner placeholder cho skill learned. Mock visual: vàng kim + scroll
     * emoji + glow ring quanh player. Designer thay sprite/SFX sau.
     */
    private showSkillLearnedBanner(skillName: string): void {
        const w = this.scale.width;
        const h = this.scale.height;

        // 1. Banner trung tâm: scroll icon + skill name.
        const banner = this.add.text(
            w / 2, h / 2 - 80,
            `📜  Đã học kỹ năng:\n${skillName}`,
            {
                fontSize: '22px', fontStyle: 'bold', color: '#ffea7a',
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 5,
                align: 'center',
                backgroundColor: '#3e2723', padding: { left: 24, right: 24, top: 14, bottom: 14 },
            },
        ).setOrigin(0.5).setScrollFactor(0).setDepth(210).setAlpha(0).setScale(0.7);

        this.tweens.add({
            targets: banner,
            alpha: 1,
            scale: 1,
            duration: 320,
            ease: 'Back.easeOut',
        });
        this.tweens.add({
            targets: banner,
            alpha: 0,
            y: banner.y - 24,
            delay: 1500,
            duration: 420,
            ease: 'Cubic.easeIn',
            onComplete: () => banner.destroy(),
        });

        // 2. Glow ring quanh player (world coord) — mở rộng + fade.
        const player = this.playerCtrl?.getPlayer();
        if (player) {
            const ring = this.add.graphics();
            ring.lineStyle(4, 0xffea7a, 1);
            ring.strokeCircle(0, 0, 28);
            ring.setPosition(player.x, player.y).setDepth(60).setScale(0.6);
            this.tweens.add({
                targets: ring,
                scale: 4.2,
                alpha: 0,
                duration: 1200,
                ease: 'Cubic.easeOut',
                onComplete: () => ring.destroy(),
            });

            // Particles giả: 6 chấm nhỏ bay lên xung quanh player.
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 * i) / 6;
                const sparkle = this.add.text(
                    player.x + Math.cos(angle) * 28,
                    player.y + Math.sin(angle) * 28,
                    '✨',
                    { fontSize: '18px' },
                ).setOrigin(0.5).setDepth(60);
                this.tweens.add({
                    targets: sparkle,
                    y: sparkle.y - 60,
                    alpha: 0,
                    duration: 1000,
                    ease: 'Cubic.easeOut',
                    onComplete: () => sparkle.destroy(),
                });
            }
        }
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

    /**
     * Tự sát: gửi /death-state action='kill' để BE set HP=0 + death_state=dead,
     * sau đó trigger handleDeath() local — flow giống hệt khi quái đánh chết
     * (overlay Kiệt sức + 3 lựa chọn Quay về / Hồi sinh tại chỗ / Đóng).
     */
    private async handleSuicide(): Promise<void> {
        if (this.deathState !== 'alive') return; // đang chết rồi thì menu Kiệt sức lo.
        const character = getCurrentCharacter();
        if (!character) return;
        try {
            const { combatAPI } = await import('../../network/api');
            await combatAPI.setDeathState(character.id, 'kill');
            // HP về 0 trên BE → FE đồng bộ HUD + chạy handleDeath chung.
            this.hud.setHP(0, this.lastKnownStats.max_hp);
            this.handleDeath();
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('combat.suicide_failed');
            this.hud.setStatus(msg, '#ff8a8a');
        }
    }

    private setAutoAttack(enabled: boolean, statusMsg?: string): void {
        this.autoAttackEnabled = enabled;
        if (statusMsg) this.hud.setStatus(statusMsg, enabled ? '#bdf0a0' : '#aaa');
    }

    private handleDeath(): void {
        if (this.deathState !== 'alive') return;
        this.deathState = 'dead';
        this.setAutoAttack(false);
        // Pause combat tick — BE đã skip, FE cũng nên dừng poll.
        this.monsters?.setTickPaused(true);
        // Clear target frame + select.
        this.monsters?.clearSelection();
        this.targetFrame?.clear();
        // Show stage 1: nút Kiệt sức.
        this.deathMenu.showKietSucButton();
    }

    private async handleDeathChoice(choice: import('../components').DeathChoice): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        const { combatAPI } = await import('../../network/api');
        switch (choice) {
            case 'respawn_village':
                try {
                    const res = await combatAPI.respawn(character.id);
                    this.hud.setStats({
                        current_hp: res.current_hp,
                        max_hp: res.current_hp,
                        current_mp: res.current_mp,
                        max_mp: res.current_mp,
                        level: this.lastKnownLevel,
                    });
                    this.deathState = 'alive';
                    this.monsters?.setTickPaused(false);
                    this.deathMenu.hide();
                    this.scene.start('VillageScene');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : t('combat.respawn_failed');
                    this.hud.setStatus(msg, '#ff8a8a');
                }
                break;
            case 'respawn_here':
                this.hud.setStatus(t('combat.respawn_inplace_soon'), '#ffd070');
                break;
            case 'spectate':
                try {
                    await combatAPI.setDeathState(character.id, 'spectate');
                    this.deathState = 'spectating';
                    this.deathMenu.hide();
                    this.hud.setStatus(t('combat.death_menu_hint'), '#aaa');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : t('combat.death_state_failed');
                    this.hud.setStatus(msg, '#ff8a8a');
                }
                break;
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
            title: t('menu.title'),
            items: [
                { key: 'info', label: t('menu.info'), icon: '📋', action: () => this.characterInfo.open() },
                { key: 'inventory', label: t('menu.inventory'), icon: '🎒', action: () => this.inventory.toggle() },
                { key: 'equipment', label: t('menu.equipment'), icon: '⚔️', action: () => this.equipment.toggle() },
                { key: 'quests', label: t('menu.quests'), icon: '📜', action: () => this.questLog.open() },
                { key: 'skills', label: t('menu.skills'), icon: '⚡', action: () => this.skillModal.open() },
                { key: 'suicide', label: t('menu.suicide'), icon: '☠️', action: () => void this.handleSuicide() },
                { key: 'settings', label: t('menu.settings'), icon: '⚙️', action: () => this.settingsModal.open() },
                { key: 'logout', label: t('menu.logout'), icon: '🚪', action: () => this.handleLogout() },
            ],
        });
    }
}
