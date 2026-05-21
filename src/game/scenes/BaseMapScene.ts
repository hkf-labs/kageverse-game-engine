import * as Phaser from 'phaser';
import { charactersAPI, logout } from '../../network/api';
import { disconnectRealtime, wsClient } from '../../network/realtime';
import { getCurrentCharacter } from '../playerSession';
import { t } from '../../i18n';
import {
    ActionMenu, BossHPBar, BuffIndicator, CharacterInfoModal, ChatPanel, ConfirmDialog, DeathMenu, EndMvpOverlay, EquipmentModal, GameControls, HoshiUpgradeModal, HUD, InventoryModal, LootDropManager, MapBackground, Minimap, MonsterManager, MonsterTargetFrame, NpcChatBubble, NpcManager, PickupToast, PlayerChatBubble, PlayerController, Portal, QuestLogPanel, QuestTracker, RemotePlayerManager, SettingsModal, ShopModal, SkillHotbar, SkillModal,
    categoryForTemplate, iconForTemplate,
    type MapConfig, type NpcConfig, type PortalConfig,
} from '../components';
import {
    createActionMenuInputTarget,
    createKeyboardModalTarget,
    INPUT_LAYER,
    pickTopInputTarget,
    type InputFocusTarget,
} from '../components/inputFocus';
import { LOOT_PICKUP_RANGE_RAW_PX } from '../../network/lootDrop';
import { resolveSceneKeyForMap } from '../maps/registry';
import {
    incomingLinkIdFromSceneInit,
    resolveSpawnFromIncomingLink,
    resolveSpawnOnMap,
    spawnFromSceneInit,
    type MapSceneInitData,
    type MapSpawnPoint,
} from '../spawn';
import { loadMapDetail, peekLinkTargetMapId } from '../../features/maps/mapDetailStore';
import {
    REMOTE_PLAYER_SELECT_RANGE_PX,
    type WorldTargetCandidate,
    type WorldTargetKind,
} from '../worldTarget';
import { isMapDebugEnabled, MapCoordinateDebug } from '../mapCoordinateDebug';

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
    protected loot!: LootDropManager;
    protected pickupToast!: PickupToast;
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
    private menuKey?: Phaser.Input.Keyboard.Key;
    private backKey?: Phaser.Input.Keyboard.Key;
    /** True khi modal hiện mở được trigger từ Menu chức năng (qua action item).
     * F2 dùng cờ này để quyết định: chỉ đóng modal vs đóng modal + mở lại
     * menu. Auto-reset trong update() khi không có menu/modal nào mở. */
    private cameFromMenu = false;
    /** Tên menu đã mở modal hiện tại — F2 dùng để quyết định reopen 'main'
     * (menu chức năng gốc) hay 'self' (sub-menu Bản thân). */
    private lastMenuName: 'main' | 'self' | null = null;
    /** Key item của menu đang được active khi mở modal — F2 quay lại menu sẽ
     * khôi phục focus về item này thay vì reset về đầu danh sách. */
    private lastMenuKey: string | null = null;
    /** Menu nào đang hiển thị (actionMenu single-instance, dùng cờ này để
     * phân biệt main vs self khi xử lý F2 từ chính menu đó). null khi không
     * có menu nào đang mở. */
    private currentMenuName: 'main' | 'self' | null = null;
    /** Trạng thái visibility map UI (HUD / controls / hotbar / chat+menu icon)
     * khi modal mở. Polled trong update() — chỉ toggle khi state đổi để tránh
     * setVisible mỗi frame. */
    private mapUIHiddenForModal = false;
    /** Ref nút chat / menu góc minimap — lưu để toggle visibility khi modal mở. */
    private chatBtn?: Phaser.GameObjects.Image;
    private menuBtn?: Phaser.GameObjects.Image;
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
    private activeWorldTarget: WorldTargetKind | null = null;
    /** ESC / click-lock — chặn auto-select world target (click chỉ bỏ bằng ESC). */
    private worldTargetSelectLocked = false;
    /** Tọa độ từ AuthScene (sau /characters) hoặc portal — spawn ngay, không đợi fetch lần 2. */
    private sceneInitSpawn: MapSpawnPoint | null = null;
    /** link_id từ cổng vừa đi qua (BE map_links). */
    private sceneInitLinkId: string | null = null;
    private coordDebug?: MapCoordinateDebug;

    constructor(sceneKey: string) {
        super(sceneKey);
    }

    init(data?: MapSceneInitData): void {
        this.sceneInitSpawn = spawnFromSceneInit(data);
        this.sceneInitLinkId = incomingLinkIdFromSceneInit(data);
    }

    protected abstract getMapConfig(): MapConfig;

    // Default lookup từ map registry — scene chỉ cần override nếu muốn label khác.
    protected abstract getNpcConfigs(): NpcConfig[];
    protected getPortalConfigs(): PortalConfig[] { return []; }
    protected getMapDisplayName(): string { return ''; }
    protected onMapReady(): void {}

    private resolvePortalTargetScene(portalCfg: PortalConfig): string | null {
        if (portalCfg.linkId) {
            const fromMapId = this.getMapConfig().mapId;
            const toMapId = peekLinkTargetMapId(fromMapId, portalCfg.linkId);
            if (!toMapId) {
                console.warn(`[portal] unknown linkId=${portalCfg.linkId} on map ${fromMapId}`);
                return null;
            }
            return resolveSceneKeyForMap(toMapId);
        }
        if (portalCfg.targetSceneKey) return portalCfg.targetSceneKey;
        console.warn('[portal] missing linkId and targetSceneKey');
        return null;
    }

    private hydratePortalsFromMapDetail(links: { linkId: string; targetMapId: string }[]): void {
        for (const portal of this.portals) {
            const linkId = portal.getLinkId();
            if (!linkId) continue;
            const link = links.find((l) => l.linkId === linkId);
            if (link) portal.bindLinkTargetMapId(link.targetMapId);
        }
    }

    private buildPortalSceneInit(portalCfg: PortalConfig): MapSceneInitData | undefined {
        if (portalCfg.linkId) return { linkId: portalCfg.linkId };
        return undefined;
    }

    preload(): void {
        const { width, height } = this.scale;
        const cx = width / 2;
        const cy = height / 2;
        const trackW = Math.min(320, width - 48);

        const loadBg = this.add.rectangle(cx, cy, width, height, 0x0f172a)
            .setScrollFactor(0).setDepth(9998);
        const loadLabel = this.add.text(cx, cy - 32, t('loading.map'), {
            fontSize: '14px', color: '#38bdf8',
            fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(9999);
        const loadTrack = this.add.rectangle(cx, cy, trackW, 6, 0x1e293b)
            .setScrollFactor(0).setDepth(9999);
        const loadFill = this.add.rectangle(cx - trackW / 2, cy, 0, 6, 0x38bdf8)
            .setScrollFactor(0).setOrigin(0, 0.5).setDepth(10000);
        const loadPct = this.add.text(cx, cy + 24, '0%', {
            fontSize: '12px', color: '#64748b', fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0).setOrigin(0.5).setDepth(9999);

        this.load.on('progress', (value: number) => {
            loadFill.width = trackW * value;
            loadPct.setText(`${Math.round(value * 100)}%`);
        });
        this.load.on('complete', () => {
            loadBg.destroy();
            loadLabel.destroy();
            loadTrack.destroy();
            loadFill.destroy();
            loadPct.destroy();
        });

        const cfg = this.getMapConfig();
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
        this.load.image('item_yen', 'assets/game/items/yen.png');
        this.load.image('item_upgrade_stone', 'assets/game/items/upgrade_stone.png');
        this.load.image('item_material_beetle_carapace', 'assets/game/items/material_beetle_carapace.png');
        this.load.image('item_material_turtle_shell', 'assets/game/items/material_turtle_shell.png');
        this.load.image('item_material_herb_flower', 'assets/game/items/material_herb_flower.png');
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

        if (isMapDebugEnabled()) {
            this.coordDebug = new MapCoordinateDebug(
                this,
                () => this.getMapConfig(),
                () => this.playerCtrl?.getPlayer(),
            );
            this.coordDebug.create(
                this.background.getWorldWidth(),
                this.background.getBgHeight(),
            );
        }

        // Player — spawn từ Auth; link spawn áp sau loadMapDetail (BE).
        this.playerCtrl = new PlayerController(this, this.background);
        this.playerCtrl.create(this.sceneInitSpawn ?? undefined);
        if (this.sceneInitSpawn) {
            // F5 / login: tọa độ đã biết → hiện ngay, không chờ list() lần 2.
            this.playerCtrl.activate();
        }

        // ConfirmDialog — tạo trước NpcManager vì runQuestAccept với
        // confirm_warning_key cần dialog có sẵn. Cũng phải trước ShopModal để
        // wire confirm-trước-khi-trừ-tiền vào flow Mua.
        this.confirmDialog = new ConfirmDialog(this);
        this.confirmDialog.create();

        this.pickupToast = new PickupToast(this);
        this.pickupToast.create();

        // Shop modal — phải tạo trước NpcManager để NPC dialog gọi được.
        this.shop = new ShopModal(this, {
            confirmDialog: this.confirmDialog,
            onItemPurchased: (nameKey, qty) => this.pickupToast.notifyShopItem(nameKey, qty),
        });
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

        // Hoshi cường hoá modal — wired vào NPC action 'upgrade_equipment'.
        // Quest progress (Q13 item_upgraded) tự cập nhật qua WS quest_progress.
        this.hoshiUpgradeModal = new HoshiUpgradeModal(this, {
            onUpgraded: () => {},
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
                // Bái Sư set class → hotbar đổi từ ẩn (class='none') sang hiện
                // + load skill list mới của class. Refresh đọc lại playerSession
                // đã được saveCurrentCharacter(fresh) cập nhật trước callback.
                void this.skillHotbar?.refresh();
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
                const init = this.buildPortalSceneInit(portalCfg);
                const targetScene = this.resolvePortalTargetScene(portalCfg);
                if (!targetScene) return;
                this.scene.start(targetScene, init);
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

        // Loot drops (Yên + items) — render trên mặt đất, detect overlap để nhặt.
        // Khởi tạo trước MonsterManager để hook onAttackResult / onDropsSync.
        this.loot = new LootDropManager(this, this.background, cfg.mapId, {
            onYenPicked: (amount, balance) => this.handleYenPicked(amount, balance),
            onItemPicked: (templateId, qty) => this.pickupToast.notifyItem(templateId, qty),
            onError: (msg) => this.hud.setStatus(msg, '#ff8a8a'),
            onFaceScreenX: (x) => this.playerCtrl.faceTowardScreenX(x),
            onManualTargetLocked: () => {
                this.activeWorldTarget = 'loot';
                this.worldTargetSelectLocked = true;
                this.monsters.clearSelection();
                this.npcs.clearNpcSelection();
                this.remotePlayers?.clearSelection();
            },
        });
        this.loot.create();
        this.loot.setPlayerPositionGetter(() => {
            const p = this.playerCtrl.getPlayer();
            return p ? { x: p.x, y: p.y } : null;
        });

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
            onManualTargetLocked: () => {
                this.activeWorldTarget = 'monster';
                this.worldTargetSelectLocked = true;
                this.loot?.clearSelection();
                this.npcs.clearNpcSelection();
                this.remotePlayers?.clearSelection();
            },
            isOtherWorldTargetManualLocked: () => this.loot?.isManualSelection() === true,
            onRetaliation: (r) => this.showRetaliationFloater(r.damage),
            onTickResult: (hp, dead) => this.handleTickResult(hp, dead),
            onDropsSync: (drops) => this.loot.syncDrops(drops),
            onFaceScreenX: (x) => this.playerCtrl.faceTowardScreenX(x),
        }, { safeZone: cfg.safeZone === true });
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
                else if (this.inventory.isOpen()) this.inventory.navigate('left');
            },
            onDirRight: () => {
                if (this.actionMenu.isOpen()) this.actionMenu.navigate('right');
                else if (this.inventory.isOpen()) this.inventory.navigate('right');
            },
            onDirUp: () => {
                if (this.inventory.isOpen()) this.inventory.navigate('up');
            },
        });
        this.controls.create();

        this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.questKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.J);
        // F1 toggle menu chức năng. addKey với capture=true để chặn help mặc
        // định của browser; nút Menu góc phải gọi cùng toggleMainMenu() để
        // hành vi đồng nhất.
        this.menuKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F1, true);
        // F2 = Back. Capture=true để khỏi trigger browser default (rename trong
        // Excel-like UI). Chỉ active khi có modal/menu open (xem handleBack).
        this.backKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F2, true);

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
            onStatusMessage: (text, color) => this.hud.setStatus(text, color),
            onTeleportToMap: (mapId) => {
                this.scene.start(resolveSceneKeyForMap(mapId));
            },
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
                // Q3 equip_item progress tự cập nhật qua WS quest_progress.
            },
            onItemUsed: () => {
                // Q4 use_item progress tự cập nhật qua WS quest_progress.
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
                // Unequip cũng có thể đổi state Q3 — tracker tự cập nhật qua WS.
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

        // Map display name — top-center, re-anchor on resize.
        const displayName = this.getMapDisplayName();
        if (displayName) {
            const mapNameText = this.add.text(width / 2, 26, displayName, {
                fontSize: '16px', color: '#0d2c4a', fontFamily: 'system-ui, sans-serif',
                backgroundColor: '#c7edff', padding: { left: 8, right: 8, top: 4, bottom: 4 },
            }).setOrigin(0.5).setScrollFactor(0);
            const reanchor = () => mapNameText.setX(this.scale.width / 2);
            this.scale.on(Phaser.Scale.Events.RESIZE, reanchor);
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
                this.scale.off(Phaser.Scale.Events.RESIZE, reanchor);
            });
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
            this.coordDebug?.destroy();
            this.coordDebug = undefined;
            this.teardownRealtimeListeners();
            this.playerCtrl?.destroy();
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
                if (!this.playerCtrl?.isActivated()) return;
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

        // quest_progress — BE bắn full snapshot quest sau Track* / Accept /
        // TurnIn. FE patch local cache in-place (không gọi /board); tracker +
        // NPC badge cập nhật qua onQuestsUpdated chain. /board chỉ fetch ở:
        // (a) initial mount, (b) QuestLogPanel.open(), (c) click tracker.
        this.rtUnsubs.push(
            wsClient.events.on('quest_progress', (p) => {
                this.questLog?.applyProgress(p.quests);
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
        if (!this.rtJoined || !this.playerCtrl?.isActivated()) return;
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
     * Toggle visibility map UI controls (D-pad + attack + potion satellite,
     * SkillHotbar, nút chat & nút menu chức năng) khi modal/menu mở/đóng. Mục
     * tiêu: lúc modal hiện, các nút trong map không chen vào panel làm rối
     * UI. HUD (topbar HP/MP/level/exp), Minimap, BuffIndicator, QuestTracker
     * + world entities (NPC / quái / portal / player / chat bubbles) GIỮ
     * NGUYÊN — player vẫn theo dõi được vitals và bối cảnh map khi đang
     * tương tác modal hoặc menu chức năng / hội thoại NPC.
     */
    private setMapUIVisible(visible: boolean): void {
        this.controls?.setVisible?.(visible);
        this.skillHotbar?.setVisible?.(visible);
        this.chatBtn?.setVisible(visible);
        this.menuBtn?.setVisible(visible);
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
        // Save ngay khi vào map — trigger TrackVisitZone trên server để quest
        // visit_zone (Q7) cập nhật realtime thay vì chờ đến F5 / rời map.
        this.savePositionFireAndForget(false);

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
        if (!current) {
            // Không có character → activate luôn để không kẹt frozen (UX cứu hộ).
            this.playerCtrl.activate();
            return;
        }
        // Initial fetch quest list để QuestTracker populate ngay khi vào scene.
        void this.questLog.refresh();
        try {
            const cfg = this.getMapConfig();
            let mapDetail: Awaited<ReturnType<typeof loadMapDetail>> | null = null;
            try {
                mapDetail = await loadMapDetail(cfg.mapId);
                this.coordDebug?.setMapBusinessHeight(mapDetail.size.height);
                this.hydratePortalsFromMapDetail(mapDetail.links);
            } catch (err) {
                console.warn('map: load detail failed', err instanceof Error ? err.message : err);
            }

            if (!this.sceneInitSpawn && this.sceneInitLinkId && mapDetail) {
                const linkSpawn = resolveSpawnFromIncomingLink(
                    this.sceneInitLinkId,
                    cfg.mapId,
                    mapDetail,
                    this.scale.height,
                    mapDetail.size.height,
                    (renderX) => this.background.getPlatformYAtX(renderX),
                );
                if (linkSpawn) {
                    const player = this.playerCtrl.getPlayer();
                    player?.setPosition(linkSpawn.x, linkSpawn.y);
                }
            }

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

            // Restore tọa độ authoritative từ BE (ưu tiên hơn portal link spawn).
            const saved = resolveSpawnOnMap(c, cfg.mapId);
            if (saved) {
                const player = this.playerCtrl.getPlayer();
                if (player) {
                    player.setPosition(saved.x, saved.y);
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
            this.portals.forEach((p) => {
                const targetMapId = p.getTargetMapId();
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
        } finally {
            // Bật gravity + show player sau khi đã setPosition() (hoặc bỏ qua
            // nếu không có saved pos). finally đảm bảo chạy kể cả API fail —
            // tránh kẹt nhân vật invisible mãi.
            this.playerCtrl.activate();
        }
    }

    /**
     * Trả true khi có bất kỳ modal/menu nào đang chiếm input — directional key
     * + virtual D-pad sẽ được forward cho component thay vì điều khiển nhân
     * vật. ChatPanel tính cả khi panel mở mà chưa focus input (tránh drift
     * khi đọc chat).
     */
    private isInputBlockingModalOpen(): boolean {
        return (
            this.chat.isOpen()
            || this.inventory.isOpen()
            || this.shop.isOpen()
            || this.questLog.isVisible()
            || this.equipment.isOpen()
            || this.characterInfo.isOpen()
            || this.skillModal.isOpen()
            || this.settingsModal.isOpen()
            || this.hoshiUpgradeModal.isOpen()
            || this.actionMenu.isOpen()
            || this.confirmDialog.isOpen()
            || this.endMvpOverlay.isOpen()
        );
    }

    /**
     * Gom mọi UI đang mở thành `InputFocusTarget` — chọn layer cao nhất.
     * Xem `inputFocus.ts` (menu chức năng < modal < menu item < confirm).
     */
    private collectInputTargets(): InputFocusTarget[] {
        const targets: InputFocusTarget[] = [];
        if (this.confirmDialog.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.confirm,
                this.confirmDialog,
                () => { this.confirmDialog.cancel(); return true; },
            ));
        }
        if (this.endMvpOverlay.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.cinematic,
                this.endMvpOverlay,
                () => { this.endMvpOverlay.close(); return true; },
            ));
        }
        if (this.hoshiUpgradeModal.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.blockingDialog,
                this.hoshiUpgradeModal,
                () => { this.hoshiUpgradeModal.close(); return true; },
            ));
        }
        if (this.shop.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.modal,
                this.shop,
                () => { this.shop.close(); return true; },
            ));
        }
        if (this.skillModal.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.modal,
                this.skillModal,
                () => { this.skillModal.close(); return true; },
            ));
        }
        if (this.inventory.isOpen()) {
            targets.push(this.inventory.getInputTarget());
        }
        if (this.equipment.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.modal,
                this.equipment,
                () => { this.equipment.close(); return true; },
            ));
        }
        if (this.settingsModal.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.modal,
                this.settingsModal,
                () => { this.settingsModal.close(); return true; },
            ));
        }
        if (this.chat.isOpen()) {
            targets.push(createKeyboardModalTarget(
                INPUT_LAYER.modal,
                this.chat,
                () => { this.chat.toggle(); return true; },
            ));
        }
        if (this.actionMenu.isOpen()) {
            targets.push(createActionMenuInputTarget({
                menu: this.actionMenu,
                currentMenuName: this.currentMenuName,
                onBackFromSelf: () => this.openMainMenu('self'),
                onCloseMenu: () => {
                    this.actionMenu.close();
                    this.cameFromMenu = false;
                    this.lastMenuKey = null;
                    this.lastMenuName = null;
                    this.currentMenuName = null;
                },
            }));
        }
        return targets;
    }

    private resolveTopInputHandler(): InputFocusTarget | null {
        return pickTopInputTarget(this.collectInputTargets());
    }

    /** Mọi phím khi modal/menu chặn gameplay — chỉ tới layer cao nhất. */
    private routeBlockedInput(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
        const target = this.resolveTopInputHandler();
        if (!target) return;

        if (Phaser.Input.Keyboard.JustDown(cursors.left)) target.navigate('left');
        else if (Phaser.Input.Keyboard.JustDown(cursors.right)) target.navigate('right');
        else if (Phaser.Input.Keyboard.JustDown(cursors.up)) target.navigate('up');
        else if (Phaser.Input.Keyboard.JustDown(cursors.down)) target.navigate('down');

        if (this.menuKey && Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            if (!target.softKey('left')) target.navigate('left');
            return;
        }
        if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            if (!target.softKey('center')) target.confirm();
            return;
        }
        if (this.backKey && Phaser.Input.Keyboard.JustDown(this.backKey)) {
            if (target.softKey('right')) return;
            if (target.cancel()) {
                if (!this.isInputBlockingModalOpen() && this.cameFromMenu) {
                    this.reopenMenuAfterModalClose();
                }
                return;
            }
            this.handleBack();
            return;
        }
        if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
            if (target.cancel() && !this.isInputBlockingModalOpen() && this.cameFromMenu) {
                this.reopenMenuAfterModalClose();
            }
        }
    }

    private reopenMenuAfterModalClose(): void {
        const key = this.lastMenuKey;
        const menu = this.lastMenuName;
        this.cameFromMenu = false;
        if (menu === 'self') this.openSelfMenu(key);
        else if (menu === 'main') this.openMainMenu(key);
    }

    update(): void {
        this.coordDebug?.update();

        const player = this.playerCtrl.getPlayer();
        const cursors = this.playerCtrl.getCursors();
        if (!player || !cursors) return;

        // Chưa activate (đang chờ /characters) — không physics / input.
        if (!this.playerCtrl.isActivated()) {
            this.playerCtrl.update();
            return;
        }

        this.background.update();
        // D-pad highlight chỉ phản chiếu input thực điều khiển nhân vật. Khi
        // modal/menu chiếm input hoặc nhân vật đang chết → cursor không
        // chuyển thành highlight (tránh hiểu nhầm "đang đi" trong khi modal mở).
        const inputBlocked = this.deathState !== 'alive' || this.isInputBlockingModalOpen();
        this.controls.updateVisuals(inputBlocked ? undefined : cursors);
        this.portals.forEach((p) => p.updatePortal(player.x, player.y));
        this.monsters.update();
        this.loot?.update();
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

        // Auto-reset cameFromMenu + lastMenuKey khi không còn menu/modal nào
        // mở → tránh session sau (vd shop từ NPC) còn nhớ flag từ session
        // menu cũ.
        if (!this.isInputBlockingModalOpen()) {
            this.cameFromMenu = false;
            this.lastMenuKey = null;
            this.lastMenuName = null;
            this.currentMenuName = null;
        }

        // Sync visibility map UI (HUD / controls / hotbar / chat+menu btn) theo
        // modal state — bất kỳ modal/menu nào mở (chat / inventory / shop /
        // action menu / NPC dialog / ...) đều ẩn cụm UI dưới để không chen
        // panel. World entities (NPC / quái / portal / player) giữ nguyên —
        // action menu & NPC menu chỉ ẩn controls/skill như modal thường.
        const modalOpen = this.isInputBlockingModalOpen();
        if (modalOpen !== this.mapUIHiddenForModal) {
            this.mapUIHiddenForModal = modalOpen;
            this.setMapUIVisible(!modalOpen);
        }

        // Modal/menu mở → chặn di chuyển; phím chức năng chỉ tới UI layer cao nhất.
        if (this.isInputBlockingModalOpen()) {
            player.body?.setVelocityX(0);
            this.controls.resetVirtualInputs();
            this.characterInfo.update();
            this.routeBlockedInput(cursors);
            return;
        }

        // J toggle Nhật ký Nhiệm vụ — chỉ khi không có modal/menu khác (đã
        // được đảm bảo bởi early return phía trên).
        if (this.questKey && Phaser.Input.Keyboard.JustDown(this.questKey)) {
            this.questLog.open();
            return;
        }

        // F1 mở menu chức năng từ trạng thái idle.
        if (this.menuKey && Phaser.Input.Keyboard.JustDown(this.menuKey)) {
            this.toggleMainMenu();
            return;
        }

        this.controls.updateSwitchTarget(this.npcs.canCycleTarget());

        if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
            if (this.hasWorldTargetSelected()) {
                this.dismissWorldTargetSelection();
                return;
            }
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

        this.updateUnifiedWorldTarget(player.x, player.y);

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

        const lootAutoTarget = this.loot?.getAutoMoveTargetX() ?? null;
        const monsterAutoTarget = this.monsters.getAutoMoveTargetX();
        const npcAutoTarget = this.npcs.getAutoMoveTargetX();
        const autoTarget = lootAutoTarget ?? monsterAutoTarget ?? npcAutoTarget;
        if (autoTarget !== null) {
            if (moveLeft || moveRight || moveUp) {
                this.loot?.clearAutoMove();
                this.monsters.clearAutoMove();
                this.npcs.clearAutoMove();
            } else if (lootAutoTarget !== null && this.loot.checkAutoMoveArrival(player.x)) {
                player.body?.setVelocityX(0);
            } else if (monsterAutoTarget !== null && this.monsters.checkAutoMoveArrival(player.x, player.y)) {
                player.body?.setVelocityX(0);
            } else if (npcAutoTarget !== null && this.npcs.checkAutoMoveArrival(player.x, player.y)) {
                player.body?.setVelocityX(0);
            } else {
                const dx = autoTarget - player.x;
                player.body?.setVelocityX(dx > 0 ? speed : -speed);
                this.playerCtrl.setFacing(dx < 0);
            }
        } else if (moveLeft) {
            if (!this.isWorldTargetManualLocked()) this.worldTargetSelectLocked = false;
            this.playerCtrl.moveLeft(speed);
        } else if (moveRight) {
            if (!this.isWorldTargetManualLocked()) this.worldTargetSelectLocked = false;
            this.playerCtrl.moveRight(speed);
        } else {
            this.playerCtrl.stopHorizontal();
        }

        if (moveUp && !this.isWorldTargetManualLocked()) {
            this.worldTargetSelectLocked = false;
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

    /**
     * Mỗi frame: chọn đúng một đối tượng gần nhất trong tầm (loot / quái /
     * NPC / player khác). Ra xa hết → bỏ select.
     */
    private updateUnifiedWorldTarget(playerX: number, playerY: number): void {
        if (this.deathState !== 'alive' || this.isInputBlockingModalOpen()) {
            if (this.activeWorldTarget !== null) this.clearAllWorldTargets();
            return;
        }
        if (this.npcs.getInteractingNpc()) return;

        if (this.monsters.isManualSelection()) {
            this.activeWorldTarget = 'monster';
            return;
        }

        if (this.loot?.isManualSelection()) {
            this.activeWorldTarget = 'loot';
            return;
        }

        const scale = this.scale.height / 1440;
        const lootRange = LOOT_PICKUP_RANGE_RAW_PX * scale;

        const candidates: WorldTargetCandidate[] = [];

        const loot = this.loot?.findNearestInRange(playerX, playerY, lootRange);
        if (loot) candidates.push({ kind: 'loot', distSq: loot.distSq });

        const monster = this.monsters.findNearestInRange(playerX, playerY);
        if (monster) candidates.push({ kind: 'monster', distSq: monster.distSq });

        const npc = this.npcs.findNearestInRange(playerX, playerY);
        if (npc) candidates.push({ kind: 'npc', distSq: npc.distSq });

        const remote = this.remotePlayers?.findNearestInRange(
            playerX, playerY, REMOTE_PLAYER_SELECT_RANGE_PX,
        );
        if (remote) candidates.push({ kind: 'remote_player', distSq: remote.distSq });

        if (candidates.length === 0) {
            this.worldTargetSelectLocked = false;
            if (this.activeWorldTarget !== null) this.clearAllWorldTargets();
            return;
        }

        // ESC / click-lock: không auto-select khác cho đến khi bỏ khóa (ESC) hoặc di chuyển.
        if (this.worldTargetSelectLocked) {
            if (!this.hasWorldTargetSelected() && !monster && loot) {
                this.worldTargetSelectLocked = false;
            } else {
                return;
            }
        }

        let best = candidates[0];
        for (let i = 1; i < candidates.length; i++) {
            if (candidates[i].distSq < best.distSq) best = candidates[i];
        }

        if (this.isSameWorldTarget(best, loot, monster, npc, remote)) return;

        this.clearAllWorldTargets();
        this.activeWorldTarget = best.kind;
        switch (best.kind) {
            case 'loot':
                if (loot) this.loot?.selectDropAuto(loot.dropId);
                break;
            case 'monster':
                if (monster) this.monsters.selectMonsterAuto(monster.instanceId);
                break;
            case 'npc':
                if (npc) this.npcs.selectNpcAuto(npc.npc);
                break;
            case 'remote_player':
                if (remote) this.remotePlayers?.selectCharacterAuto(remote.characterId);
                break;
        }
    }

    private isSameWorldTarget(
        best: WorldTargetCandidate,
        loot: { dropId: string } | null,
        monster: { instanceId: string } | null,
        npc: { npc: { key: string } } | null,
        remote: { characterId: string } | null,
    ): boolean {
        if (this.activeWorldTarget !== best.kind) return false;
        switch (best.kind) {
            case 'loot':
                return this.loot?.getSelectedDrop()?.drop_id === loot?.dropId;
            case 'monster':
                return this.monsters.getSelectedInstanceId() === monster?.instanceId;
            case 'npc':
                return this.npcs.getSelectedNpc()?.key === npc?.npc.key;
            case 'remote_player':
                return this.remotePlayers?.getSelectedCharacterId() === remote?.characterId;
            default:
                return false;
        }
    }

    private hasWorldTargetSelected(): boolean {
        return !!(
            this.loot?.getSelectedDrop()
            || this.monsters.getSelectedInstanceId()
            || this.npcs.getSelectedNpc()
            || this.remotePlayers?.getSelectedCharacterId()
        );
    }

    /** Click-lock loot / quái — không bỏ khóa khi di chuyển. */
    private isWorldTargetManualLocked(): boolean {
        return this.monsters.isManualSelection() || this.loot?.isManualSelection() === true;
    }

    /** ESC — bỏ chọn mọi đối tượng world (loot / quái / NPC / player khác). */
    private dismissWorldTargetSelection(): void {
        this.worldTargetSelectLocked = true;
        this.clearAllWorldTargets();
        this.loot?.clearAutoMove();
        this.monsters.clearAutoMove();
        this.npcs.clearAutoMove();
    }

    private clearAllWorldTargets(): void {
        this.activeWorldTarget = null;
        this.loot?.clearSelection();
        this.monsters.clearSelection();
        this.npcs.clearNpcSelection();
        this.remotePlayers?.clearSelection();
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

        if (this.loot?.getSelectedDrop()) {
            this.npcs.clearAutoMove();
            this.monsters.clearAutoMove();
            this.loot.handleInteract(player.x);
            return;
        }

        if (this.monsters.getSelectedInstanceId()) {
            this.loot?.clearAutoMove();
            this.npcs.clearAutoMove();
            this.monsters.handleInteract(player.x, player.y);
            return;
        }

        if (this.npcs.getSelectedNpc()) {
            this.loot?.clearAutoMove();
            this.monsters.clearAutoMove();
            this.npcs.handleInteract(player.x, player.y);
            return;
        }

        const remoteId = this.remotePlayers?.getSelectedCharacterId();
        if (remoteId) {
            this.loot?.clearAutoMove();
            this.monsters.clearAutoMove();
            this.npcs.clearAutoMove();
            this.characterInfo.open(remoteId);
            return;
        }

        // Không có mục tiêu trong tầm → swing nearest.
        void this.monsters.attackNearest().then((hit) => {
            if (hit) this.playerCtrl.playAnim('attack');
        });
    }

    private handleYenPicked(amount: number, balance: number): void {
        void balance; // balance hiện chỉ dùng để invalidate InventoryModal cache khi mở lại.
        this.pickupToast.notifyYen(amount);
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
        // Quest progress (kill_monster) tự cập nhật qua WS quest_progress —
        // không cần refresh /board ở đây. Chỉ xử lý UI fade-out cho con chết.
        for (const h of res.hits) {
            if (h.dead) {
                this.targetFrame?.onMonsterDead(h.instance_id);
                this.bossHPBar?.onBossDead(h.instance_id); // no-op nếu không phải boss đang engage.
            }
        }
        // Forward loot drops mới (Yên / item) cho LootDropManager render.
        if (res.drops && res.drops.length > 0) {
            this.loot?.addDrops(res.drops);
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

        const makeBtn = (x: number, y: number, key: string, onClick: () => void): Phaser.GameObjects.Image => {
            const btn = this.add.image(x, y, key)
                .setScrollFactor(0).setDepth(100).setScale(SCALE)
                .setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => { btn.setScale(SCALE * 0.94); onClick(); });
            btn.on('pointerup', () => btn.setScale(SCALE));
            btn.on('pointerout', () => btn.setScale(SCALE));
            return btn;
        };

        this.chatBtn = makeBtn(cx - SPACING / 2, btnY, 'btn_chat', () => {
            if (this.actionMenu.isOpen()) this.actionMenu.close();
            this.chat.toggle();
        });
        this.menuBtn = makeBtn(cx + SPACING / 2, btnY, 'btn_menu', () => this.toggleMainMenu());
    }

    private toggleMainMenu(): void {
        if (this.chat.isOpen()) this.chat.toggle();
        if (this.actionMenu.isOpen()) {
            this.actionMenu.close();
            return;
        }
        // Menu chức năng (Phaser) chỉ khi không có modal HTML — modal/item menu DOM
        // luôn trên canvas; mở F1 lúc túi/shop đang mở sẽ bị kẹt dưới overlay.
        if (this.isHtmlModalOpen()) return;
        this.openMainMenu();
    }

    /** Modal overlay HTML — khi mở thì không hiện menu chức năng Phaser. */
    private isHtmlModalOpen(): boolean {
        return (
            this.inventory.isOpen()
            || this.shop.isOpen()
            || this.questLog.isVisible()
            || this.equipment.isOpen()
            || this.characterInfo.isOpen()
            || this.skillModal.isOpen()
            || this.settingsModal.isOpen()
            || this.hoshiUpgradeModal.isOpen()
            || this.confirmDialog.isOpen()
            || this.endMvpOverlay.isOpen()
        );
    }

    private openMainMenu(initialKey?: string | null): void {
        // Wrap = đặt cameFromMenu + lastMenuName + lastMenuKey trước khi mở
        // modal để F2 biết nguồn gốc (main vs self) và item nào cần active khi
        // back. Suicide / logout không mở modal nên skip wrap.
        const wrap = (key: string, fn: () => void) => () => {
            this.cameFromMenu = true;
            this.lastMenuName = 'main';
            this.lastMenuKey = key;
            fn();
        };
        this.currentMenuName = 'main';
        this.actionMenu.open({
            title: t('menu.title'),
            initialSelectedKey: initialKey ?? undefined,
            items: [
                // Bản thân — sub-menu mở char-related modals (info / inventory
                // / equipment / skills). Không wrap (chỉ chuyển menu).
                { key: 'self', label: t('menu.self'), icon: '🥷', action: () => this.openSelfMenu() },
                { key: 'quests', label: t('menu.quests'), icon: '📜', action: wrap('quests', () => this.questLog.open()) },
                { key: 'suicide', label: t('menu.suicide'), icon: '☠️', action: () => void this.handleSuicide() },
                { key: 'settings', label: t('menu.settings'), icon: '⚙️', action: wrap('settings', () => this.settingsModal.open()) },
                { key: 'logout', label: t('menu.logout'), icon: '🚪', action: () => this.handleLogout() },
            ],
        });
    }

    /**
     * Sub-menu "Bản thân" — gom 4 chức năng character-related (Thông tin /
     * Túi đồ / Trang bị / Kỹ năng) thành 1 nhóm. Mở từ main menu → 'self' item.
     * F2 trong sub-menu = về main menu (xem update loop). F2 trong modal mở
     * từ sub-menu = về sub-menu (xem handleBack).
     */
    private openSelfMenu(initialKey?: string | null): void {
        const wrap = (key: string, fn: () => void) => () => {
            this.cameFromMenu = true;
            this.lastMenuName = 'self';
            this.lastMenuKey = key;
            fn();
        };
        this.currentMenuName = 'self';
        this.actionMenu.open({
            title: t('menu.self'),
            initialSelectedKey: initialKey ?? undefined,
            items: [
                { key: 'info', label: t('menu.info'), icon: '📋', action: wrap('info', () => this.characterInfo.open()) },
                { key: 'inventory', label: t('menu.inventory'), icon: '🎒', action: wrap('inventory', () => this.inventory.toggle()) },
                { key: 'equipment', label: t('menu.equipment'), icon: '⚔️', action: wrap('equipment', () => this.equipment.toggle()) },
                { key: 'skills', label: t('menu.skills'), icon: '⚡', action: wrap('skills', () => this.skillModal.open()) },
            ],
        });
    }

    /**
     * F2 back navigation:
     *   - Modal đang mở (không phải actionMenu): đóng modal. Nếu modal đó mở
     *     từ menu (cameFromMenu=true) → mở lại menu chức năng.
     *   - actionMenu open (no modal trên): đóng menu, reset cờ.
     *   - Không có gì mở: no-op.
     * ConfirmDialog đặc biệt: F2 = cancel (không reopen menu — confirm là
     * decision point, back ra ngoài tương đương huỷ).
     */
    private handleBack(): void {
        const target = this.resolveTopInputHandler();
        if (!target) return;
        if (target.softKey('right')) return;
        if (target.cancel()) {
            if (!this.isInputBlockingModalOpen() && this.cameFromMenu) {
                this.reopenMenuAfterModalClose();
            }
            return;
        }
        if (!this.closeTopModal()) return;
        if (this.cameFromMenu) this.reopenMenuAfterModalClose();
    }

    /** Đóng modal đang ở top theo priority, trả true nếu đã đóng. Match thứ
     * tự ESC trong update(). ConfirmDialog không xử lý ở đây — caller phải
     * gọi confirmDialog.cancel() riêng. */
    private closeTopModal(): boolean {
        if (this.endMvpOverlay.isOpen()) { this.endMvpOverlay.close(); return true; }
        if (this.hoshiUpgradeModal.isOpen()) { this.hoshiUpgradeModal.close(); return true; }
        if (this.shop.isOpen()) { this.shop.close(); return true; }
        if (this.inventory.isOpen()) {
            if (this.inventory.dismissTeleportPicker()) return true;
            this.inventory.toggle();
            return true;
        }
        if (this.questLog.isVisible()) { this.questLog.close(); return true; }
        if (this.equipment.isOpen()) { this.equipment.close(); return true; }
        if (this.characterInfo.isOpen()) { this.characterInfo.close(); return true; }
        if (this.skillModal.isOpen()) { this.skillModal.close(); return true; }
        if (this.settingsModal.isOpen()) { this.settingsModal.close(); return true; }
        if (this.chat.isOpen()) { this.chat.toggle(); return true; }
        return false;
    }
}
