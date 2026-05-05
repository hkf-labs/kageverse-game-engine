import * as Phaser from 'phaser';
import { npcAPI, questAPI, type LevelUpDTO, type NpcActionDTO, type NpcQuestListsDTO, type QuestRewardsDTO, type TeleportDestinationDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import { t } from '../../i18n';
import { mapDisplayName, resolveSceneKeyForMap } from '../maps/registry';
import type { GameComponent, NpcConfig, NpcEntry } from './types';
import type { ActionMenu, ActionMenuItem } from './ActionMenu';
import { detectEndMvpClass } from './EndMvpOverlay';
import type { HoshiUpgradeModal } from './HoshiUpgradeModal';
import type { MapBackground } from './MapBackground';
import type { NpcChatBubble } from './NpcChatBubble';
import { questDisplayName } from './QuestLogPanel';
import type { QuestLogPanel } from './QuestLogPanel';
import type { ShopModal } from './ShopModal';

const ACTION_KEY: Record<string, string> = {
    talk: 'npc.action_talk',
    buy_shop: 'npc.action_buy_shop',
    upgrade_equipment: 'npc.action_upgrade_equipment',
    view_quests: 'npc.action_view_quests',
    open_stash: 'npc.action_open_stash',
    teleport: 'npc.action_teleport',
    explore_cave: 'npc.action_explore_cave',
    browse_weapons: 'npc.action_browse_weapons',
    browse_apparel: 'npc.action_browse_apparel',
    browse_jewelry: 'npc.action_browse_jewelry',
};

const ACTION_ICON: Record<string, string> = {
    talk: '💬',
    buy_shop: '🛒',
    upgrade_equipment: '⚒️',
    view_quests: '📜',
    open_stash: '📦',
    teleport: '✨',
    explore_cave: '🕳️',
    browse_weapons: '⚔️',
    browse_apparel: '👘',
    browse_jewelry: '💍',
};

function actionLabel(a: NpcActionDTO): string {
    const key = ACTION_KEY[a.action];
    return key ? t(key) : a.label_key;
}

// Map dialogue_key (BE trả về) → text VN client-side. TODO: chuyển sang i18n
// bundles theo namespace `dialogue.<id>` khi mở rộng dialog tree.
const DIALOGUE_TEXT_VI: Record<string, string> = {
    'dialogue.ayame.greet':
        'Chào nhẫn giả trẻ! Ta là Ayame. Cần dược phẩm gì cứ chọn "Mua dược phẩm" nhé.',
    'dialogue.kuma.greet':
        'Đói chưa nhẫn giả? Một bát mì Kuma là đi quái cả buổi không nghỉ!',
};

function dialogueText(key: string | null | undefined, npcName: string): string {
    if (key && DIALOGUE_TEXT_VI[key]) return DIALOGUE_TEXT_VI[key];
    return t('npc.dialogue.fallback_greet', { npc: npcName });
}

export class NpcManager implements GameComponent {
    private npcList: NpcEntry[] = [];
    private interactingNpc: NpcEntry | null = null;
    private selectedNpc: NpcEntry | null = null;
    private selectionMode: 'auto' | 'manual' = 'auto';
    private selectionIndicator?: Phaser.GameObjects.Graphics;
    private autoMoveTargetX: number | null = null;
    private fetchSeq = 0;
    private getPlayerPos: () => { x: number; y: number } | null = () => null;
    private questBadges = new Map<string, Phaser.GameObjects.Text>();
    private availabilityCache: Record<string, NpcQuestListsDTO> = {};

    private readonly INTERACT_RANGE = 150;
    private readonly SPRITE_SCALE = 0.12;
    private readonly PLAYER_VISUAL_SINK = 4;

    private scene: Phaser.Scene;
    private background: MapBackground;
    private npcConfigs: NpcConfig[];
    private mapId: string;
    private actionMenu?: ActionMenu;
    private shopModal?: ShopModal;
    private chatBubble?: NpcChatBubble;
    private questLog?: QuestLogPanel;
    private hoshiUpgradeModal?: HoshiUpgradeModal;
    private onStatusMessage?: (text: string, color: string) => void;
    private onQuestRewarded?: (questName: string, rewards: QuestRewardsDTO) => void;
    private onLevelUp?: (levelUp: LevelUpDTO) => void;
    private onEndMvp?: (className: 'sword' | 'bow') => void;
    private dialogueKeyByTemplate = new Map<string, string | null>();
    private teleportDestinations: TeleportDestinationDTO[] = [];
    private offeredQuestIDs: string[] = [];
    private turnInQuestIDs: string[] = [];

    constructor(
        scene: Phaser.Scene,
        background: MapBackground,
        npcConfigs: NpcConfig[],
        deps?: {
            mapId?: string;
            actionMenu?: ActionMenu;
            shopModal?: ShopModal;
            chatBubble?: NpcChatBubble;
            questLog?: QuestLogPanel;
            hoshiUpgradeModal?: HoshiUpgradeModal;
            onStatusMessage?: (text: string, color: string) => void;
            onQuestRewarded?: (questName: string, rewards: QuestRewardsDTO) => void;
            onLevelUp?: (levelUp: LevelUpDTO) => void;
            onEndMvp?: (className: 'sword' | 'bow') => void;
        },
    ) {
        this.scene = scene;
        this.background = background;
        this.npcConfigs = npcConfigs;
        this.mapId = deps?.mapId ?? '';
        this.actionMenu = deps?.actionMenu;
        this.shopModal = deps?.shopModal;
        this.chatBubble = deps?.chatBubble;
        this.questLog = deps?.questLog;
        this.hoshiUpgradeModal = deps?.hoshiUpgradeModal;
        this.onStatusMessage = deps?.onStatusMessage;
        this.onQuestRewarded = deps?.onQuestRewarded;
        this.onLevelUp = deps?.onLevelUp;
        this.onEndMvp = deps?.onEndMvp;
    }

    create(): void {
        const scaleFactor = this.scene.scale.height / 1440;

        this.npcConfigs.forEach(npc => {
            const scaledX = npc.x * scaleFactor;
            const baseSurfaceY = npc.y !== undefined ? (npc.y * scaleFactor) : this.background.getPlatformYAtX(scaledX);
            const bottomPadPx = this.getTextureBottomPadding(npc.key) * this.SPRITE_SCALE;
            const groundedY = baseSurfaceY + bottomPadPx + this.PLAYER_VISUAL_SINK + npc.offsetY;

            const spr = this.scene.add.sprite(scaledX, groundedY, npc.key).setOrigin(0.5, 1).setDepth(8);
            spr.setScale(this.SPRITE_SCALE);
            spr.setInteractive({ useHandCursor: true });

            const nameText = this.scene.add.text(scaledX, groundedY - (spr.height * this.SPRITE_SCALE) - 10, npc.name, {
                fontSize: '13px', color: '#ffea7a', fontFamily: 'system-ui, sans-serif',
                stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(9);

            // Quest badge — ẩn mặc định, set khi refreshBadges() chạy.
            const badge = this.scene.add.text(scaledX, nameText.y - 16, '', {
                fontSize: '20px', fontFamily: 'system-ui, sans-serif',
                stroke: '#000', strokeThickness: 4,
            }).setOrigin(0.5).setDepth(10).setVisible(false);
            if (npc.templateId) this.questBadges.set(npc.templateId, badge);

            const npcEntry: NpcEntry = { ...npc, sprite: spr, nameText };
            spr.on('pointerdown', () => this.selectNpc(npcEntry, true));
            this.npcList.push(npcEntry);
        });

        this.selectionIndicator = this.scene.add.graphics().setDepth(9).setVisible(false);
    }

    getInteractingNpc(): NpcEntry | null { return this.interactingNpc; }
    getSelectedNpc(): NpcEntry | null { return this.selectedNpc; }
    getAutoMoveTargetX(): number | null { return this.autoMoveTargetX; }
    clearAutoMove(): void { this.autoMoveTargetX = null; }

    /** Auto-pick nearest NPC trong INTERACT_RANGE mỗi frame. Manual selection
     * chỉ clear khi player ra khỏi tầm. Trong lúc dialog mở thì freeze. */
    update(): void {
        if (this.interactingNpc) return; // dialog đang mở — giữ nguyên selection.
        const pos = this.getPlayerPos();
        if (!pos) return;

        // Manual mode: check sticky range.
        if (this.selectionMode === 'manual' && this.selectedNpc) {
            const d = Phaser.Math.Distance.Between(pos.x, pos.y, this.selectedNpc.sprite.x, this.selectedNpc.sprite.y);
            if (d > this.INTERACT_RANGE) {
                this.selectionMode = 'auto'; // ra khỏi tầm → fallback auto.
            } else {
                return; // còn trong tầm + manual → giữ selection cố định.
            }
        }

        // Auto mode: pick nearest NPC trong range.
        let nearest: NpcEntry | null = null;
        let nearestD = this.INTERACT_RANGE;
        for (const n of this.npcList) {
            const d = Phaser.Math.Distance.Between(pos.x, pos.y, n.sprite.x, n.sprite.y);
            if (d <= nearestD) {
                nearestD = d;
                nearest = n;
            }
        }
        if (nearest === this.selectedNpc) return;
        if (this.selectedNpc) this.selectedNpc.nameText?.setColor('#ffea7a');
        this.selectedNpc = nearest;
        if (nearest) {
            nearest.nameText?.setColor('#9affb4');
            this.updateSelectionIndicator();
        } else {
            this.selectionIndicator?.clear().setVisible(false);
        }
    }

    /**
     * Fetch batch quest availability cho mọi NPC + render badge ❗ (offered)
     * hoặc ❓ (turn-in, ưu tiên hơn). Không có quest → ẩn. Best-effort: lỗi
     * API → ẩn hết, không throw.
     */
    async refreshBadges(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.hideAllBadges();
            this.availabilityCache = {};
            return;
        }
        try {
            const res = await questAPI.npcAvailability(character.id);
            this.availabilityCache = res.npcs;
            for (const [templateId, badge] of this.questBadges) {
                const entry = res.npcs[templateId];
                this.paintBadge(badge, entry?.offered_quest_ids ?? [], entry?.turn_in_quest_ids ?? []);
            }
        } catch (err) {
            this.hideAllBadges();
            this.availabilityCache = {};
            if (err instanceof Error) {
                console.warn('npc: refresh badges failed', err.message);
            }
        }
    }

    /**
     * NPC đầu tiên trong scene đang offer quest mới — dùng cho QuestTracker
     * empty-state hint ("Đến gặp <Tên NPC>"). null nếu không NPC nào.
     * Order theo thứ tự NPC config — tự nhiên giver chính thường ở đầu list.
     */
    getFirstOfferedNpc(): NpcEntry | null {
        for (const npc of this.npcList) {
            if (!npc.templateId) continue;
            const entry = this.availabilityCache[npc.templateId];
            if (entry?.offered_quest_ids?.length) return npc;
        }
        return null;
    }

    private paintBadge(badge: Phaser.GameObjects.Text, offered: string[], turnIn: string[]): void {
        if (turnIn.length > 0) {
            badge.setText('❓').setColor('#ffea7a').setVisible(true);
        } else if (offered.length > 0) {
            badge.setText('❗').setColor('#ff8a8a').setVisible(true);
        } else {
            badge.setVisible(false);
        }
    }

    private hideAllBadges(): void {
        for (const badge of this.questBadges.values()) badge.setVisible(false);
    }

    handleInteract(playerX: number, playerY: number): void {
        if (this.interactingNpc) return; // dialog đang mở qua ActionMenu
        if (!this.selectedNpc) return;

        const dist = Phaser.Math.Distance.Between(playerX, playerY, this.selectedNpc.sprite.x, this.selectedNpc.sprite.y);
        if (dist <= this.INTERACT_RANGE) {
            this.startInteraction(this.selectedNpc);
        } else {
            this.autoMoveTargetX = this.selectedNpc.sprite.x;
        }
    }

    checkAutoMoveArrival(playerX: number, playerY: number): boolean {
        if (this.autoMoveTargetX === null || !this.selectedNpc) return false;
        const dist = Phaser.Math.Distance.Between(playerX, playerY, this.selectedNpc.sprite.x, this.selectedNpc.sprite.y);
        if (dist <= this.INTERACT_RANGE) {
            const target = this.selectedNpc;
            this.autoMoveTargetX = null;
            this.startInteraction(target);
            return true;
        }
        return false;
    }

    canCycleTarget(): boolean {
        if (this.interactingNpc) return false;
        return this.getVisibleNpcs().length >= 2;
    }

    cycleSelectedNpc(): void {
        if (!this.canCycleTarget()) return;
        const visible = this.getVisibleNpcs();
        if (!this.selectedNpc) { this.selectNpc(visible[0], true); return; }
        const currentIdx = visible.indexOf(this.selectedNpc);
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visible.length;
        this.selectNpc(visible[nextIdx], true);
    }

    /** BaseMapScene gọi để wire vị trí player (để auto-target tick). */
    setPlayerPositionGetter(getter: () => { x: number; y: number } | null): void {
        this.getPlayerPos = getter;
    }

    private selectNpc(npc: NpcEntry, manual: boolean = false): void {
        if (this.interactingNpc) return;
        if (this.selectedNpc === npc) {
            if (manual) this.selectionMode = 'manual';
            return;
        }
        if (this.selectedNpc) {
            this.selectedNpc.nameText?.setColor('#ffea7a');
        }
        this.selectedNpc = npc;
        if (manual) this.selectionMode = 'manual';
        npc.nameText?.setColor('#9affb4');
        this.updateSelectionIndicator();
    }

    /** Public — gọi từ scene khi switch map / cleanup. */
    clearNpcSelection(): void {
        if (this.selectedNpc) this.selectedNpc.nameText?.setColor('#ffea7a');
        this.selectedNpc = null;
        this.selectionMode = 'auto';
        this.autoMoveTargetX = null;
        this.selectionIndicator?.clear().setVisible(false);
    }

    private updateSelectionIndicator(): void {
        if (!this.selectionIndicator || !this.selectedNpc) return;
        const npc = this.selectedNpc;
        const sprH = npc.sprite.height * npc.sprite.scaleY;
        const x = npc.sprite.x;
        const topY = npc.sprite.y - sprH - 28;
        const footY = npc.sprite.y;
        const g = this.selectionIndicator;
        g.clear();
        g.lineStyle(3, 0x9affb4, 1); g.strokeEllipse(x, footY - 4, 50, 14);
        g.fillStyle(0x9affb4, 1); g.lineStyle(2, 0x000000, 1);
        g.beginPath(); g.moveTo(x - 9, topY); g.lineTo(x + 9, topY); g.lineTo(x, topY + 12);
        g.closePath(); g.fillPath(); g.strokePath();
        g.setVisible(true);
    }

    private startInteraction(npc: NpcEntry): void {
        if (this.interactingNpc || !this.actionMenu) return;
        this.interactingNpc = npc;

        const showLoading = () => {
            this.actionMenu?.open({
                title: npc.name,
                items: [{ key: 'loading', label: t('npc.menu_loading'), disabled: true, action: () => {} }],
                onClose: () => this.handleMenuClosed(),
            });
        };

        if (npc.templateId && this.mapId) {
            showLoading();
            const seq = ++this.fetchSeq;
            const characterId = getCurrentCharacter()?.id;
            void npcAPI.getInteract(this.mapId, npc.templateId, characterId)
                .then((res) => {
                    if (npc.templateId) {
                        this.dialogueKeyByTemplate.set(npc.templateId, res.default_dialogue_key);
                    }
                    if (seq !== this.fetchSeq || this.interactingNpc !== npc) return;
                    this.teleportDestinations = res.teleport_destinations ?? [];
                    this.offeredQuestIDs = res.offered_quest_ids ?? [];
                    this.turnInQuestIDs = res.turn_in_quest_ids ?? [];
                    this.openMenuFromBE(npc, res.available_actions);
                })
                .catch((err) => {
                    if (seq !== this.fetchSeq || this.interactingNpc !== npc) return;
                    this.offeredQuestIDs = [];
                    this.turnInQuestIDs = [];
                    const msg = err instanceof Error ? err.message : t('npc.menu_error_load');
                    this.onStatusMessage?.(msg, '#ff8a8a');
                    this.openMenuMock(npc);
                });
        } else {
            this.offeredQuestIDs = [];
            this.turnInQuestIDs = [];
            this.openMenuMock(npc);
        }
    }

    private openMenuFromBE(npc: NpcEntry, actions: NpcActionDTO[]): void {
        if (!this.actionMenu) return;
        const items: ActionMenuItem[] = [];

        // Quest hooks lên đầu menu — phổ biến nhất khi player tới gặp NPC quest.
        for (const questID of this.turnInQuestIDs) {
            items.push({
                key: `turn_in_${questID}`,
                label: t('npc.quest.turn_in', { name: questDisplayName(`quest.${questID}.name`) }),
                icon: '🏆',
                action: () => this.runQuestTurnIn(npc, questID),
            });
        }
        for (const questID of this.offeredQuestIDs) {
            items.push({
                key: `accept_${questID}`,
                label: t('npc.quest.accept', { name: questDisplayName(`quest.${questID}.name`) }),
                icon: '❗',
                action: () => this.runQuestAccept(npc, questID),
            });
        }

        for (const a of actions) {
            items.push({
                key: a.action,
                label: actionLabel(a),
                icon: ACTION_ICON[a.action],
                action: () => this.runAction(npc, a.action),
            });
        }
        items.push({ key: 'leave', label: t('npc.action_leave'), icon: '🚪', action: () => {} });
        this.actionMenu.open({
            title: npc.name,
            items,
            onClose: () => this.handleMenuClosed(),
        });
    }

    private openMenuMock(npc: NpcEntry): void {
        if (!this.actionMenu) return;
        this.actionMenu.open({
            title: npc.name,
            items: [
                {
                    key: 'talk', label: t('npc.mock.action_talk'), icon: ACTION_ICON.talk,
                    action: () => this.onStatusMessage?.(t('npc.mock.welcome', { npc: npc.name }), '#fff'),
                },
                {
                    key: 'view_quests', label: t('npc.mock.action_view_quests'), icon: ACTION_ICON.view_quests,
                    action: () => this.onStatusMessage?.(t('npc.mock.no_quest'), '#aaaaaa'),
                },
                {
                    key: 'buy_shop', label: t('npc.mock.action_buy_shop'), icon: ACTION_ICON.buy_shop,
                    action: () => this.onStatusMessage?.(t('npc.mock.no_shop'), '#aaaaaa'),
                },
                { key: 'leave', label: t('npc.action_leave'), icon: '🚪', action: () => {} },
            ],
            onClose: () => this.handleMenuClosed(),
        });
    }

    private runAction(npc: NpcEntry, action: string): void {
        switch (action) {
            case 'talk': {
                const dialogueKey = npc.templateId
                    ? this.dialogueKeyByTemplate.get(npc.templateId) ?? null
                    : null;
                this.chatBubble?.show(npc.sprite, dialogueText(dialogueKey, npc.name));
                break;
            }
            case 'buy_shop':
                if (this.shopModal && npc.templateId) {
                    this.shopModal.open({
                        mapId: this.mapId,
                        npcTemplateId: npc.templateId,
                        npcName: npc.name,
                    });
                } else {
                    this.onStatusMessage?.(t('npc.run.shop_unavailable'), '#aaaaaa');
                }
                break;
            case 'teleport':
                this.openTeleportMenu();
                break;
            case 'view_quests':
                if (this.questLog) {
                    this.questLog.open();
                } else {
                    this.onStatusMessage?.(t('npc.run.questlog_unavailable'), '#aaaaaa');
                }
                break;
            case 'upgrade_equipment':
                if (this.hoshiUpgradeModal) {
                    this.hoshiUpgradeModal.open();
                } else {
                    this.onStatusMessage?.(t('npc.run.hoshi_unavailable'), '#aaaaaa');
                }
                break;
            case 'open_stash': {
                const actionKey = ACTION_KEY[action];
                const actionName = actionKey ? t(actionKey) : action;
                this.onStatusMessage?.(t('npc.run.coming_soon', { name: actionName }), '#aaaaaa');
                break;
            }
            case 'explore_cave':
                // Hang động chỉ mở khi player đạt lv30 (post-MVP). Hiện tại
                // NPC nói "Coming Soon..." qua chat bubble như user yêu cầu.
                this.chatBubble?.show(npc.sprite, t('npc.dialogue.explore_cave_coming_soon'));
                break;
            case 'browse_weapons':
                // Submenu phân loại theo class trước khi mở ShopModal. NPC
                // weapon_merchant bán cả Kiếm + Cung; player chọn category
                // → mở shop với class_id filter.
                this.openWeaponCategoryMenu(npc);
                break;
            case 'browse_apparel':
                // Submenu 5 slot (Nón / Áo / Găng Tay / Quần / Giày) → mở
                // ShopModal với subTypeFilter + classFilter theo class của
                // character (apparel bind class). Pre-Bái Sư (class='none')
                // → reject sớm vì shop không có item class=none.
                this.openApparelSlotMenu(npc);
                break;
            case 'browse_jewelry':
                // Submenu 4 slot (Dây chuyền / Ngọc bội / Nhẫn / Bùa). Cùng
                // pattern apparel: pre-Bái Sư reject sớm (jewelry class-bound).
                this.openJewelrySlotMenu(npc);
                break;
            default:
                this.onStatusMessage?.(t('npc.run.action_unsupported', { name: action }), '#aaaaaa');
        }
    }

    private runQuestAccept(npc: NpcEntry, questID: string): void {
        const character = getCurrentCharacter();
        if (!character || !npc.templateId) {
            this.onStatusMessage?.(t('npc.quest.cannot_accept'), '#ff8a8a');
            return;
        }
        void questAPI.accept(character.id, questID, npc.templateId)
            .then((res) => {
                this.onStatusMessage?.(t('npc.quest.accept_success', { name: questDisplayName(res.quest.name_key) }), '#bdf0a0');
                void this.questLog?.refresh();
            })
            .catch((err) => {
                const msg = err instanceof Error ? err.message : t('npc.quest.accept_failed');
                this.onStatusMessage?.(msg, '#ff8a8a');
            });
    }

    private runQuestTurnIn(npc: NpcEntry, questID: string): void {
        const character = getCurrentCharacter();
        if (!character || !npc.templateId) {
            this.onStatusMessage?.(t('npc.quest.cannot_turn_in'), '#ff8a8a');
            return;
        }
        void questAPI.turnIn(character.id, questID, npc.templateId)
            .then((res) => {
                const questName = questDisplayName(res.quest.name_key);
                this.onQuestRewarded?.(questName, res.granted_rewards);
                // Quest reward XP có thể trigger cascade level up. BE trả level_up
                // DTO (mirror combat shape) → scene update HUD + show banner mà
                // không cần re-fetch GET /characters.
                if (res.level_up) {
                    this.onLevelUp?.(res.level_up);
                }
                // End-MVP detect: Q17 (mq_first_trial_*) là quest cuối arc 1
                // — BE đã set characters.mvp_flags.mvp_arc1_complete=true qua
                // set_flag side effect. FE trigger overlay cinematic.
                const endClass = detectEndMvpClass(questID);
                if (endClass) {
                    this.onEndMvp?.(endClass);
                }
                void this.questLog?.refresh();
            })
            .catch((err) => {
                const msg = err instanceof Error ? err.message : t('npc.quest.turn_in_failed');
                this.onStatusMessage?.(msg, '#ff8a8a');
            });
    }

    private openWeaponCategoryMenu(npc: NpcEntry): void {
        if (!this.actionMenu || !this.shopModal || !npc.templateId) {
            this.onStatusMessage?.(t('npc.run.shop_unavailable'), '#aaaaaa');
            return;
        }
        const items: ActionMenuItem[] = [
            {
                key: 'weapon_sword',
                label: t('npc.weapon.category_sword'),
                icon: '🗡️',
                action: () => this.openWeaponShop(npc, 'sword'),
            },
            {
                key: 'weapon_bow',
                label: t('npc.weapon.category_bow'),
                icon: '🏹',
                action: () => this.openWeaponShop(npc, 'bow'),
            },
            { key: 'cancel', label: t('npc.weapon.cancel'), icon: '↩️', action: () => {} },
        ];
        this.actionMenu.open({
            title: t('npc.weapon.menu_title'),
            items,
        });
    }

    private openWeaponShop(npc: NpcEntry, classId: 'sword' | 'bow'): void {
        if (!this.shopModal || !npc.templateId) return;
        this.shopModal.open({
            mapId: this.mapId,
            npcTemplateId: npc.templateId,
            npcName: npc.name,
            classFilter: classId,
        });
    }

    private openApparelSlotMenu(npc: NpcEntry): void {
        if (!this.actionMenu || !this.shopModal || !npc.templateId) {
            this.onStatusMessage?.(t('npc.run.shop_unavailable'), '#aaaaaa');
            return;
        }
        const character = getCurrentCharacter();
        const charClass = character?.class;
        // Pre-Bái Sư (class chưa set hoặc 'none') — apparel toàn bộ class-bound,
        // không có item class=none nên hiện sẽ rỗng. Báo player sớm thay vì
        // mở modal trống.
        if (!charClass || charClass === 'none') {
            this.onStatusMessage?.(t('npc.apparel.requires_class'), '#aaaaaa');
            return;
        }
        const slots: Array<{ key: string; label: string; icon: string; subType: string }> = [
            { key: 'apparel_hat',    label: t('npc.apparel.slot_hat'),    icon: '🎩', subType: 'hat' },
            { key: 'apparel_shirt',  label: t('npc.apparel.slot_shirt'),  icon: '👕', subType: 'shirt' },
            { key: 'apparel_gloves', label: t('npc.apparel.slot_gloves'), icon: '🧤', subType: 'gloves' },
            { key: 'apparel_pants',  label: t('npc.apparel.slot_pants'),  icon: '👖', subType: 'pants' },
            { key: 'apparel_shoes',  label: t('npc.apparel.slot_shoes'),  icon: '👟', subType: 'shoes' },
        ];
        const items: ActionMenuItem[] = slots.map((s) => ({
            key: s.key,
            label: s.label,
            icon: s.icon,
            action: () => this.openApparelShop(npc, charClass, s.subType),
        }));
        items.push({ key: 'cancel', label: t('npc.apparel.cancel'), icon: '↩️', action: () => {} });
        this.actionMenu.open({
            title: t('npc.apparel.menu_title'),
            items,
        });
    }

    private openApparelShop(npc: NpcEntry, classId: string, subType: string): void {
        if (!this.shopModal || !npc.templateId) return;
        this.shopModal.open({
            mapId: this.mapId,
            npcTemplateId: npc.templateId,
            npcName: npc.name,
            classFilter: classId,
            subTypeFilter: subType,
        });
    }

    private openJewelrySlotMenu(npc: NpcEntry): void {
        if (!this.actionMenu || !this.shopModal || !npc.templateId) {
            this.onStatusMessage?.(t('npc.run.shop_unavailable'), '#aaaaaa');
            return;
        }
        const character = getCurrentCharacter();
        const charClass = character?.class;
        if (!charClass || charClass === 'none') {
            this.onStatusMessage?.(t('npc.jewelry.requires_class'), '#aaaaaa');
            return;
        }
        const slots: Array<{ key: string; label: string; icon: string; subType: string }> = [
            { key: 'jewelry_necklace', label: t('npc.jewelry.slot_necklace'), icon: '📿', subType: 'necklace' },
            { key: 'jewelry_pendant',  label: t('npc.jewelry.slot_pendant'),  icon: '🟢', subType: 'pendant' },
            { key: 'jewelry_ring',     label: t('npc.jewelry.slot_ring'),     icon: '💍', subType: 'ring' },
            { key: 'jewelry_amulet',   label: t('npc.jewelry.slot_amulet'),   icon: '🧿', subType: 'amulet' },
        ];
        const items: ActionMenuItem[] = slots.map((s) => ({
            key: s.key,
            label: s.label,
            icon: s.icon,
            action: () => this.openJewelryShop(npc, charClass, s.subType),
        }));
        items.push({ key: 'cancel', label: t('npc.jewelry.cancel'), icon: '↩️', action: () => {} });
        this.actionMenu.open({
            title: t('npc.jewelry.menu_title'),
            items,
        });
    }

    private openJewelryShop(npc: NpcEntry, classId: string, subType: string): void {
        if (!this.shopModal || !npc.templateId) return;
        this.shopModal.open({
            mapId: this.mapId,
            npcTemplateId: npc.templateId,
            npcName: npc.name,
            classFilter: classId,
            subTypeFilter: subType,
        });
    }

    private openTeleportMenu(): void {
        if (!this.actionMenu) return;
        const dests = this.teleportDestinations;
        if (dests.length === 0) {
            this.onStatusMessage?.(t('npc.teleport.empty'), '#aaaaaa');
            return;
        }
        const items: ActionMenuItem[] = dests.map((d) => ({
            key: `teleport_${d.map_id}`,
            label: d.is_current
                ? t('npc.teleport.current_here', { name: mapDisplayName(d.map_id) })
                : mapDisplayName(d.map_id),
            icon: '🗺️',
            disabled: d.is_current,
            action: () => this.scene.scene.start(resolveSceneKeyForMap(d.map_id)),
        }));
        items.push({ key: 'cancel', label: t('npc.teleport.cancel'), icon: '↩️', action: () => {} });
        this.actionMenu.open({
            title: t('npc.teleport.title'),
            items,
        });
    }

    /** ActionMenu đóng (item action / click ngoài / ESC) → chỉ clear interacting
     * state. Selection vẫn giữ — sẽ tự clear ở update tick khi player ra khỏi
     * INTERACT_RANGE (cùng spec với target frame quái). */
    private handleMenuClosed(): void {
        this.interactingNpc = null;
        this.autoMoveTargetX = null;
    }

    private getVisibleNpcs(): NpcEntry[] {
        const cam = this.scene.cameras.main;
        const viewLeft = cam.scrollX;
        const viewRight = cam.scrollX + cam.width;
        return this.npcList
            .filter((n) => {
                const halfW = (n.sprite.displayWidth || 0) / 2;
                return n.sprite.x + halfW >= viewLeft && n.sprite.x - halfW <= viewRight;
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    }

    private getTextureBottomPadding(key: string): number {
        const tex = this.scene.textures.get(key);
        const src = tex?.getSourceImage() as (HTMLImageElement | HTMLCanvasElement | undefined);
        if (!src || !('width' in src)) return 0;
        const w = src.width;
        const h = src.height;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 0;
        try {
            ctx.drawImage(src as CanvasImageSource, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            for (let y = h - 1; y >= 0; y--) {
                for (let x = 0; x < w; x++) {
                    if (data[(y * w + x) * 4 + 3] > 5) return h - 1 - y;
                }
            }
        } catch { return 0; }
        return 0;
    }
}

