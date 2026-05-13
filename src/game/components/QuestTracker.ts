import * as Phaser from 'phaser';
import type { QuestDTO, QuestObjectiveDTO } from '../../network/api';
import { questDisplayName, targetDisplayName } from './modals/QuestLogPanel';
import { t } from '../../i18n';
import type { GameComponent } from './types';

// Objective verb keys — reuse từ QuestLogPanel namespace `quest.log.objective_*`.
const OBJECTIVE_KEY: Record<QuestObjectiveDTO['type'], string> = {
    kill_monster: 'quest.log.objective_kill_monster',
    talk_npc: 'quest.log.objective_talk_npc',
    collect_item: 'quest.log.objective_collect_item',
    use_item: 'quest.log.objective_use_item',
    buy_item: 'quest.log.objective_buy_item',
    equip_item: 'quest.log.objective_equip_item',
    visit_zone: 'quest.log.objective_visit_zone',
    item_upgraded: 'quest.log.objective_item_upgraded',
};

// Ưu tiên hiển thị: completed (giục turn-in) > main > side > daily > weekly.
const CATEGORY_PRIORITY: Record<QuestDTO['category'], number> = {
    main: 0, side: 1, daily: 2, weekly: 3,
};

const ANCHOR_X = 12;
const DEFAULT_TOP = 100;
const PANEL_MIN_WIDTH = 180;
const PAD_X = 10;
const PAD_Y = 6;
const TITLE_BODY_GAP = 4;
const DEPTH = 90;

const COLOR_BG = 0x141c24;       // rgba(20,28,36,0.85) — match style cũ
const ALPHA_BG = 0.85;
const COLOR_BORDER_IDLE = 0xbdf0a0;
const ALPHA_BORDER_IDLE = 0.35;
const COLOR_BORDER_HOVER = 0xffea7a;
const ALPHA_BORDER_HOVER = 0.7;

// Mọi style không set wordWrap — text render 1 dòng, panel auto-widen theo
// content (clamp PANEL_MIN_WIDTH ở dưới).
const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    fontStyle: 'bold',
    color: '#ffea7a',
};

const BODY_ACTIVE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    color: '#ffe4c4',
};

const BODY_COMPLETED_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    fontStyle: 'bold',
    color: '#ffea7a',
};

const BODY_HINT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    fontStyle: 'bold',
    color: '#ff8a8a',
};

/**
 * QuestTracker — HUD góc trên-trái (Phaser canvas), ghim 1 quest đang track.
 * Hiển thị: tên quest + objective ưu tiên (chưa done đầu tiên) + progress.
 * Click → mở QuestLogPanel (qua callback onClick).
 *
 * Cập nhật cache do BaseMapScene gọi `setQuests(quests)` mỗi khi questLog
 * refresh (sau accept/turn-in/kill).
 *
 * Render: container + Graphics rounded rect + 2 Text. Container teardown
 * khi không có quest nào để hiển thị (tránh giữ object thừa khi player chưa
 * có quest active/completed).
 */
export class QuestTracker implements GameComponent {
    private scene: Phaser.Scene;
    private onClick?: () => void;
    private currentQuests: QuestDTO[] = [];
    private emptyHint: string | null = null;
    /** Top offset cache — apply lại khi container build lazy. */
    private cachedTopOffsetPx: number | null = null;

    private container?: Phaser.GameObjects.Container;
    private bg?: Phaser.GameObjects.Graphics;
    private hitArea?: Phaser.GameObjects.Rectangle;
    private titleText?: Phaser.GameObjects.Text;
    private bodyText?: Phaser.GameObjects.Text;
    private hovered = false;

    constructor(scene: Phaser.Scene, onClick?: () => void) {
        this.scene = scene;
        this.onClick = onClick;
    }

    create(): void {
        // Container tạo lazy ở render() khi có quest tracked / emptyHint —
        // không giữ object thừa khi player chưa có quest active/completed.
    }

    /** Cập nhật cache quest từ QuestLogPanel; render lại. */
    setQuests(quests: QuestDTO[]): void {
        this.currentQuests = quests;
        this.render();
    }

    /**
     * Set top offset (px) — cho phép scene reflow khi BuffIndicator hiện/ẩn để
     * 2 panel xếp dọc dưới topbar thay vì đè nhau.
     */
    setTopOffset(px: number): void {
        this.cachedTopOffsetPx = px;
        if (this.container) this.container.y = px;
    }

    /**
     * Set hint hiển thị khi không có quest active/completed nhưng có NPC đang
     * offer quest mới (vd new char chưa accept Q1). Pass null để clear.
     */
    setEmptyHint(text: string | null): void {
        this.emptyHint = text;
        this.render();
    }

    destroy(): void {
        this.teardownContainer();
    }

    private render(): void {
        const tracked = pickTrackedQuest(this.currentQuests);
        if (tracked) {
            this.ensureContainer();
            this.renderQuest(tracked);
            return;
        }
        if (this.emptyHint) {
            this.ensureContainer();
            this.renderEmptyHint(this.emptyHint);
            return;
        }
        // Không có gì hiển thị — tear down để không giữ object thừa.
        this.teardownContainer();
    }

    private ensureContainer(): void {
        if (this.container) return;
        const top = this.cachedTopOffsetPx ?? DEFAULT_TOP;
        const container = this.scene.add.container(ANCHOR_X, top)
            .setScrollFactor(0)
            .setDepth(DEPTH);

        // Bg + border — Graphics layer dưới cùng. fillRoundedRect dùng radius
        // 6 cho match style cũ.
        const bg = this.scene.add.graphics();
        container.add(bg);
        this.bg = bg;

        // Title text — anchor top-left, padding inside bg.
        const title = this.scene.add.text(PAD_X, PAD_Y, '', TITLE_STYLE).setOrigin(0, 0);
        container.add(title);
        this.titleText = title;

        // Body text — y set sau khi đo title height.
        const body = this.scene.add.text(PAD_X, PAD_Y, '', BODY_ACTIVE_STYLE).setOrigin(0, 0);
        container.add(body);
        this.bodyText = body;

        // Invisible hit area — pointer event target (Container không bắt event
        // trực tiếp, phải dùng child với setInteractive). Size set lại trong
        // repaintBg sau khi đo content.
        const hit = this.scene.add.rectangle(0, 0, PANEL_MIN_WIDTH, 1, 0x000000, 0)
            .setOrigin(0, 0)
            .setInteractive({ useHandCursor: !!this.onClick });
        if (this.onClick) {
            hit.on('pointerdown', () => this.onClick?.());
            hit.on('pointerover', () => {
                this.hovered = true;
                this.repaintBg();
            });
            hit.on('pointerout', () => {
                this.hovered = false;
                this.repaintBg();
            });
        }
        container.add(hit);
        this.hitArea = hit;

        this.container = container;
    }

    private teardownContainer(): void {
        this.container?.destroy(); // cascade destroy children
        this.container = undefined;
        this.bg = undefined;
        this.hitArea = undefined;
        this.titleText = undefined;
        this.bodyText = undefined;
        this.hovered = false;
    }

    private renderQuest(tracked: QuestDTO): void {
        if (!this.titleText || !this.bodyText) return;
        const isCompleted = tracked.status === 'completed';
        const objective = tracked.objectives.find((o) => o.done < o.count) ?? tracked.objectives[0];

        this.titleText.setText(`📜 ${questDisplayName(tracked.name_key)}`);

        if (isCompleted) {
            const turnInNpc = tracked.turn_in_npc_id ?? tracked.giver_npc_id;
            const npcName = turnInNpc ? targetDisplayName(turnInNpc) : t('quest.tracker.unknown_npc');
            this.bodyText
                .setStyle(BODY_COMPLETED_STYLE)
                .setText(t('quest.tracker.completed_turn_in', { npc: npcName }));
        } else {
            const verbKey = OBJECTIVE_KEY[objective.type];
            const verb = verbKey ? t(verbKey) : objective.type;
            const target = targetDisplayName(objective.target_id);
            const done = Math.min(objective.done, objective.count);
            this.bodyText
                .setStyle(BODY_ACTIVE_STYLE)
                .setText(`${verb} ${target} (${done}/${objective.count})`);
        }
        this.layoutAndRepaint();
    }

    private renderEmptyHint(text: string): void {
        if (!this.titleText || !this.bodyText) return;
        // Empty-hint: title rỗng (giấu), body chiếm full panel với màu warning.
        this.titleText.setText('');
        this.bodyText
            .setStyle(BODY_HINT_STYLE)
            .setText(`❗ ${text}`);
        this.layoutAndRepaint();
    }

    /** Đo height của title + body, position body, vẽ lại bg + resize hit area. */
    private layoutAndRepaint(): void {
        if (!this.titleText || !this.bodyText) return;
        const hasTitle = this.titleText.text.length > 0;
        // Hide title element nếu rỗng (empty-hint case).
        this.titleText.setVisible(hasTitle);
        const titleHeight = hasTitle ? this.titleText.height : 0;
        const bodyY = PAD_Y + titleHeight + (hasTitle ? TITLE_BODY_GAP : 0);
        this.bodyText.setY(bodyY);
        this.repaintBg();
    }

    private repaintBg(): void {
        if (!this.bg || !this.titleText || !this.bodyText || !this.hitArea) return;
        const bodyBottom = this.bodyText.y + this.bodyText.height;
        const totalHeight = bodyBottom + PAD_Y;
        // Width auto theo content — text 1 dòng nên width = max(title, body) +
        // padding 2 chiều, clamp tối thiểu PANEL_MIN_WIDTH cho khung không co
        // quá hẹp khi quest name ngắn.
        const contentWidth = Math.max(
            this.titleText.visible ? this.titleText.width : 0,
            this.bodyText.width,
        );
        const totalWidth = Math.max(PANEL_MIN_WIDTH, contentWidth + PAD_X * 2);

        this.bg.clear();
        this.bg.fillStyle(COLOR_BG, ALPHA_BG);
        this.bg.fillRoundedRect(0, 0, totalWidth, totalHeight, 6);
        const borderColor = this.hovered ? COLOR_BORDER_HOVER : COLOR_BORDER_IDLE;
        const borderAlpha = this.hovered ? ALPHA_BORDER_HOVER : ALPHA_BORDER_IDLE;
        this.bg.lineStyle(1, borderColor, borderAlpha);
        this.bg.strokeRoundedRect(0, 0, totalWidth, totalHeight, 6);

        // Hit area phủ toàn panel để click + hover state hoạt động đều.
        this.hitArea.setSize(totalWidth, totalHeight);
        this.hitArea.input?.hitArea.setSize(totalWidth, totalHeight);
    }
}

function pickTrackedQuest(quests: QuestDTO[]): QuestDTO | null {
    const tracking = quests.filter((q) => q.status === 'active' || q.status === 'completed');
    if (tracking.length === 0) return null;
    tracking.sort((a, b) => {
        // Completed trước (urgent — giục player đến NPC trả).
        const aDone = a.status === 'completed' ? 0 : 1;
        const bDone = b.status === 'completed' ? 0 : 1;
        if (aDone !== bDone) return aDone - bDone;
        const aP = CATEGORY_PRIORITY[a.category] ?? 99;
        const bP = CATEGORY_PRIORITY[b.category] ?? 99;
        if (aP !== bP) return aP - bP;
        return a.min_level - b.min_level;
    });
    return tracking[0];
}
