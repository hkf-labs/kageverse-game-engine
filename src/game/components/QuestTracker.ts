import * as Phaser from 'phaser';
import type { QuestDTO, QuestObjectiveDTO } from '../../network/api';
import { questDisplayName, targetDisplayName } from './QuestLogPanel';
import type { GameComponent } from './types';

const OBJECTIVE_VERB: Record<QuestObjectiveDTO['type'], string> = {
    kill_monster: 'Diệt',
    talk_npc: 'Gặp',
    collect_item: 'Thu thập',
    use_item: 'Sử dụng',
    buy_item: 'Mua',
};

// Ưu tiên hiển thị: completed (giục turn-in) > main > side > daily > weekly.
const CATEGORY_PRIORITY: Record<QuestDTO['category'], number> = {
    main: 0, side: 1, daily: 2, weekly: 3,
};

/**
 * QuestTracker — DOM overlay góc trái, ghim 1 quest đang track.
 * Hiển thị: tên quest + objective ưu tiên (chưa done đầu tiên) + progress.
 * Click → mở QuestLogPanel (qua callback onClick).
 *
 * Cập nhật cache do BaseMapScene gọi `update(quests)` mỗi khi questLog refresh
 * (sau accept/turn-in/kill).
 */
export class QuestTracker implements GameComponent {
    private container?: HTMLDivElement;
    private scene: Phaser.Scene;
    private onClick?: () => void;
    private currentQuests: QuestDTO[] = [];
    private emptyHint: string | null = null;

    constructor(scene: Phaser.Scene, onClick?: () => void) {
        this.scene = scene;
        this.onClick = onClick;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;
        const c = document.createElement('div');
        Object.assign(c.style, {
            position: 'absolute',
            left: '12px', top: '80px',
            maxWidth: '300px', minWidth: '180px',
            padding: '8px 12px',
            background: 'linear-gradient(180deg, rgba(20,28,36,0.85), rgba(14,18,24,0.85))',
            border: '1px solid rgba(189, 240, 160, 0.35)',
            borderRadius: '8px',
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            lineHeight: '1.5',
            zIndex: '90',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            cursor: this.onClick ? 'pointer' : 'default',
            userSelect: 'none',
            display: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
        });
        if (this.onClick) {
            c.addEventListener('click', () => this.onClick?.());
            c.addEventListener('mouseenter', () => {
                c.style.borderColor = 'rgba(255, 234, 122, 0.7)';
                c.style.boxShadow = '0 4px 14px rgba(255, 234, 122, 0.25)';
            });
            c.addEventListener('mouseleave', () => {
                c.style.borderColor = 'rgba(189, 240, 160, 0.35)';
                c.style.boxShadow = '0 4px 14px rgba(0,0,0,0.5)';
            });
        }
        parent.style.position = 'relative';
        parent.appendChild(c);
        this.container = c;
    }

    /** Cập nhật cache quest từ QuestLogPanel; render lại. */
    setQuests(quests: QuestDTO[]): void {
        this.currentQuests = quests;
        this.render();
    }

    /**
     * Set hint hiển thị khi không có quest active/completed nhưng có NPC đang
     * offer quest mới (vd new char chưa accept Q1). Pass null để clear.
     */
    setEmptyHint(text: string | null): void {
        this.emptyHint = text;
        this.render();
    }

    private render(): void {
        if (!this.container) return;
        const tracked = pickTrackedQuest(this.currentQuests);
        if (tracked) {
            this.renderQuest(tracked);
            return;
        }
        if (this.emptyHint) {
            this.container.innerHTML = `<div style="color:#ff8a8a;font-weight:600;">❗ ${escapeHtml(this.emptyHint)}</div>`;
            this.container.style.display = 'block';
            return;
        }
        this.container.style.display = 'none';
    }

    private renderQuest(tracked: QuestDTO): void {
        if (!this.container) return;
        const isCompleted = tracked.status === 'completed';
        const objective = tracked.objectives.find((o) => o.done < o.count) ?? tracked.objectives[0];

        const titleLine =
            `<div style="font-size:11px;color:#ffea7a;margin-bottom:3px;font-weight:600;">📜 ${escapeHtml(questDisplayName(tracked.name_key))}</div>`;

        let bodyLine: string;
        if (isCompleted) {
            const turnInNpc = tracked.turn_in_npc_id ?? tracked.giver_npc_id;
            const npcName = turnInNpc ? targetDisplayName(turnInNpc) : 'NPC trả nhiệm vụ';
            bodyLine = `<div style="color:#ffea7a;font-weight:600;">✅ Hoàn thành — về gặp ${escapeHtml(npcName)}</div>`;
        } else {
            const verb = OBJECTIVE_VERB[objective.type] ?? objective.type;
            const target = targetDisplayName(objective.target_id);
            const done = Math.min(objective.done, objective.count);
            bodyLine =
                `<div>${verb} <span style="color:#bdf0a0;">${escapeHtml(target)}</span> `
                + `<span style="color:#aaa;">(${done}/${objective.count})</span></div>`;
        }

        this.container.innerHTML = titleLine + bodyLine;
        this.container.style.display = 'block';
    }

    destroy(): void {
        this.container?.remove();
        this.container = undefined;
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

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
