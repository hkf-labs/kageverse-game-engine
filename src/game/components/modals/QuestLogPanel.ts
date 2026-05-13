import * as Phaser from 'phaser';
import { questAPI, type QuestBoardCategoryDTO, type QuestDTO, type QuestObjectiveDTO } from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t, tOpt } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

// Status / objective verb labels resolve qua i18n key. Fallback raw status
// hoặc raw type nếu thiếu key (defensive — BE có thể trả type mới).
const STATUS_KEY: Record<QuestDTO['status'], string> = {
    active: 'quest.log.status_active',
    completed: 'quest.log.status_completed',
    claimed: 'quest.log.status_claimed',
};

const STATUS_COLOR: Record<QuestDTO['status'], string> = {
    active: '#bdf0a0',
    completed: '#ffea7a',
    claimed: '#7a8a8a',
};

const OBJECTIVE_KEY: Record<QuestObjectiveDTO['type'], string> = {
    kill_monster: 'quest.log.objective_kill_monster',
    talk_npc: 'quest.log.objective_talk_npc',
    collect_item: 'quest.log.objective_collect_item',
    use_item: 'quest.log.objective_use_item',
    buy_item: 'quest.log.objective_buy_item',
};

// Quest name resolve qua i18n. BE trả `quest.<id>.name` → key đã có namespace
// match — pass thẳng vào t(). Missing key → t() trả raw key, fallback xuống
// raw nameKey để dev nhìn thấy id.
export function questDisplayName(nameKey: string): string {
    const localized = t(nameKey);
    return localized === nameKey ? nameKey : localized;
}

// Target ID có thể là monster_template_id / npc_template_id / item_template_id.
// Quest engine không phân loại → FE phải cascade qua 3 namespace để tìm tên hợp.
// Order: monster (phổ biến nhất ở quest objective) → npc → item. Dùng tOpt
// để khỏi spam warn khi target là NPC/item (không có ở namespace monster.name).
export function targetDisplayName(targetID: string): string {
    const candidates = [
        `monster.name.${targetID}`,
        `npc.name.${targetID}`,
        `item.name.${targetID}`,
        `map.name.${targetID}`,
    ];
    for (const k of candidates) {
        const v = tOpt(k);
        if (v !== undefined) return v;
    }
    return targetID;
}

type TabKey = 'main' | 'side' | 'event';
const TAB_KEY: Record<TabKey, string> = {
    main: 'quest.log.tab_main',
    side: 'quest.log.tab_side',
    event: 'quest.log.tab_event',
};

export class QuestLogPanel extends BaseModal {
    private bodyEl?: HTMLDivElement;
    private tabsEl?: HTMLDivElement;
    private board: Record<string, QuestBoardCategoryDTO> = {};
    private flatQuests: QuestDTO[] = [];
    private loading = false;
    private currentTab: TabKey = 'main';
    private onClosed?: () => void;
    private onQuestsUpdated?: (quests: QuestDTO[]) => void;

    constructor(
        scene: Phaser.Scene,
        opts?: { onClosed?: () => void; onQuestsUpdated?: (quests: QuestDTO[]) => void },
    ) {
        super(scene);
        this.onClosed = opts?.onClosed;
        this.onQuestsUpdated = opts?.onQuestsUpdated;
    }

    isVisible(): boolean { return this.visible; }

    open(): void {
        if (this.visible) return;
        if (!this.ensureShell()) return;
        this.visible = true;
        this.scene.input.keyboard?.disableGlobalCapture();
        void this.refresh();
    }

    close(): void {
        if (!this.visible) return;
        this.scene.input.keyboard?.enableGlobalCapture();
        this.teardownShell();
        this.onClosed?.();
    }

    /** Refresh từ BE — gọi sau accept/turn-in/kill từ ngoài. */
    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        if (this.loading) return;
        this.loading = true;
        this.shell?.setStatus(t('quest.log.loading'), 'muted');
        try {
            const res = await questAPI.board(character.id);
            this.board = {};
            this.flatQuests = [];
            for (const c of res.categories) {
                this.board[c.category] = c;
                this.flatQuests.push(...c.quests);
            }
            this.renderTabs();
            this.renderBody();
            this.shell?.setStatus('', 'muted');
            this.onQuestsUpdated?.(this.flatQuests);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('quest.log.error');
            this.shell?.setStatus(msg, 'error');
        } finally {
            this.loading = false;
        }
    }

    /** Cached quests phẳng (active+completed mọi category) — tracker dùng. */
    getQuests(): QuestDTO[] { return this.flatQuests; }

    /** Patch local cache từ WS quest_progress event — không gọi /board. Áp dụng:
     *
     * - status=claimed → remove khỏi flatQuests + board (đã turn-in xong).
     * - existing quest_id → replace (cập nhật objectives.done + status).
     * - new quest_id → append (accept emits new quest).
     *
     * Sau khi patch: re-render nếu panel đang mở + emit onQuestsUpdated để
     * tracker / NPC badge cập nhật. Idempotent: gọi nhiều lần cùng payload ra
     * cùng state.
     */
    applyProgress(quests: QuestDTO[]): void {
        if (!quests || quests.length === 0) return;
        let touched = false;
        for (const incoming of quests) {
            if (incoming.status === 'claimed') {
                touched = this.removeQuest(incoming.quest_id) || touched;
                continue;
            }
            touched = this.upsertQuest(incoming) || touched;
        }
        if (!touched) return;
        if (this.visible) {
            this.renderTabs();
            this.renderBody();
        }
        this.onQuestsUpdated?.(this.flatQuests);
    }

    private removeQuest(questID: string): boolean {
        let removed = false;
        const idx = this.flatQuests.findIndex((q) => q.quest_id === questID);
        if (idx >= 0) {
            this.flatQuests.splice(idx, 1);
            removed = true;
        }
        for (const cat of Object.values(this.board)) {
            const qIdx = cat.quests.findIndex((q) => q.quest_id === questID);
            if (qIdx >= 0) {
                cat.quests.splice(qIdx, 1);
                removed = true;
            }
        }
        return removed;
    }

    private upsertQuest(quest: QuestDTO): boolean {
        const flatIdx = this.flatQuests.findIndex((q) => q.quest_id === quest.quest_id);
        if (flatIdx >= 0) {
            this.flatQuests[flatIdx] = quest;
        } else {
            this.flatQuests.push(quest);
        }
        const cat = this.board[quest.category];
        if (cat) {
            const qIdx = cat.quests.findIndex((q) => q.quest_id === quest.quest_id);
            if (qIdx >= 0) {
                cat.quests[qIdx] = quest;
            } else {
                cat.quests.push(quest);
            }
        }
        // Category chưa load (board chưa fetch lần nào) → bỏ qua. Initial mount
        // sẽ load đủ; tracker đã dùng flatQuests rồi.
        return true;
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.bodyEl = undefined;
        this.tabsEl = undefined;
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-quest-log',
            size: 'lg',
            layer: 'blockingDialog',
            mount: 'document-body',
            withStatus: true,
            title: t('quest.log.title'),
            onClose: () => this.close(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Tabs row — ngay đầu body.
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex; gap: 4px; padding: 10px 14px 0 14px;
            background: rgba(0,0,0,0.25); border-bottom: 1px solid rgba(189,240,160,0.15);
            flex-shrink: 0;
        `;
        this.tabsEl = tabs;
        shell.body.appendChild(tabs);

        // Body — fixed height list, scrollable. Không co dãn theo content. Tránh
        // modal nhảy mỗi khi switch tab giữa Chính tuyến (nhiều quest) và Phụ
        // tuyến (ít hơn).
        const body = document.createElement('div');
        body.style.cssText = `
            height: 420px; overflow-y: auto; padding: 12px 18px; display: flex;
            flex-direction: column; gap: 10px;
        `;
        this.bodyEl = body;
        shell.body.appendChild(body);

        // Subscribe locale changes — re-render khi user đổi ngôn ngữ runtime.
        shell.registerLocaleSync(() => {
            this.shell?.setTitle(t('quest.log.title'));
            this.renderTabs();
            this.renderBody();
        });

        this.renderTabs();
        this.renderBody();
    }

    private renderTabs(): void {
        if (!this.tabsEl) return;
        this.tabsEl.innerHTML = '';
        (['main', 'side', 'event'] as TabKey[]).forEach((key) => {
            const isEvent = key === 'event';
            const cat = !isEvent ? this.board[key] : undefined;
            const activeCount = cat?.quests.filter((q) => q.status !== 'claimed').length ?? 0;
            const hasNext = cat?.next_offered != null;
            const dot = !isEvent && (activeCount > 0 || hasNext);

            const tab = document.createElement('div');
            const isCurrent = this.currentTab === key;
            const disabled = isEvent;
            tab.style.cssText = `
                padding: 7px 14px; font-size: 13px; font-weight: 600;
                cursor: ${disabled ? 'not-allowed' : 'pointer'};
                color: ${isCurrent ? MODAL_COLORS.title : disabled ? '#666' : MODAL_COLORS.text};
                background: ${isCurrent ? 'rgba(255,234,122,0.12)' : 'transparent'};
                border: 1px solid ${isCurrent ? 'rgba(255,234,122,0.4)' : 'transparent'};
                border-bottom: none;
                border-top-left-radius: 6px; border-top-right-radius: 6px;
                user-select: none; position: relative;
                opacity: ${disabled ? '0.6' : '1'};
            `;
            tab.textContent = t(TAB_KEY[key]);
            if (dot) {
                const dotEl = document.createElement('span');
                dotEl.style.cssText = `
                    position: absolute; top: 4px; right: 4px;
                    width: 8px; height: 8px; border-radius: 50%;
                    background: #ff8a8a; box-shadow: 0 0 4px #ff8a8a;
                `;
                tab.appendChild(dotEl);
            }
            if (!disabled) {
                tab.addEventListener('click', () => {
                    if (this.currentTab === key) return;
                    this.currentTab = key;
                    this.renderTabs();
                    this.renderBody();
                });
            }
            this.tabsEl!.appendChild(tab);
        });
    }

    private renderBody(): void {
        if (!this.bodyEl) return;
        this.bodyEl.innerHTML = '';

        if (this.currentTab === 'event') {
            const note = document.createElement('div');
            note.style.cssText = 'padding: 60px; text-align: center; color: #888; font-style: italic;';
            note.textContent = t('quest.log.event_coming_soon');
            this.bodyEl.appendChild(note);
            return;
        }

        const cat = this.board[this.currentTab];
        const quests = (cat?.quests ?? []).filter((q) => q.status !== 'claimed');
        const next = cat?.next_offered ?? null;

        if (next) this.bodyEl.appendChild(this.renderNextHint(next));

        if (quests.length === 0 && !next) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding: 50px; text-align: center; color: #888;';
            empty.textContent = this.currentTab === 'main'
                ? t('quest.log.empty_main')
                : t('quest.log.empty_side');
            this.bodyEl.appendChild(empty);
            return;
        }

        // Sort: completed (cần turn-in) trước active.
        const sorted = [...quests].sort((a, b) => {
            const orderA = a.status === 'completed' ? 0 : 1;
            const orderB = b.status === 'completed' ? 0 : 1;
            if (orderA !== orderB) return orderA - orderB;
            return a.min_level - b.min_level;
        });
        for (const q of sorted) this.bodyEl.appendChild(this.renderQuestRow(q));
    }

    private renderNextHint(next: NonNullable<QuestBoardCategoryDTO['next_offered']>): HTMLDivElement {
        const npcName = next.giver_npc_id ? targetDisplayName(next.giver_npc_id) : t('quest.log.unknown_npc');
        const headerLine = `<span style="color:#ff8a8a;font-weight:600;">${escapeHtml(t('quest.log.next_label'))}</span> ${escapeHtml(t('quest.log.next_meet'))} <span style="color:#bdf0a0;">${escapeHtml(npcName)}</span>`;
        return this.renderQuestCard({
            title: questDisplayName(next.name_key),
            subtitleHTML: headerLine,
            minLevel: next.min_level,
            objectives: next.objectives,
            rewards: null,
            statusBadge: null,
            border: 'rgba(255,138,138,0.5)',
            background: 'rgba(255,138,138,0.08)',
            dashed: true,
        });
    }

    private renderQuestRow(q: QuestDTO): HTMLDivElement {
        const status = q.status as 'active' | 'completed';
        return this.renderQuestCard({
            title: questDisplayName(q.name_key),
            subtitleHTML: null,
            minLevel: q.min_level,
            objectives: q.objectives,
            rewards: q.rewards ?? null,
            statusBadge: { label: t(STATUS_KEY[status]), color: STATUS_COLOR[status] },
            border: 'rgba(189,240,160,0.25)',
            background: 'rgba(255,255,255,0.04)',
            dashed: false,
        });
    }

    private renderQuestCard(opts: {
        title: string;
        subtitleHTML: string | null;
        minLevel: number;
        objectives: QuestObjectiveDTO[];
        rewards: QuestDTO['rewards'] | null;
        statusBadge: { label: string; color: string } | null;
        border: string;
        background: string;
        dashed: boolean;
    }): HTMLDivElement {
        const row = document.createElement('div');
        row.style.cssText = `
            border: 1px ${opts.dashed ? 'dashed' : 'solid'} ${opts.border};
            border-radius: 10px; padding: 10px 12px;
            background: ${opts.background};
        `;

        // Title bar
        const head = document.createElement('div');
        head.style.cssText = 'display: flex; justify-content: space-between; gap: 8px; align-items: baseline;';
        const title = document.createElement('div');
        title.innerHTML = `<span style="color:${MODAL_COLORS.title};font-weight:600;font-size:14px;">${escapeHtml(opts.title)}</span>`;
        head.appendChild(title);
        if (opts.statusBadge) {
            const badge = document.createElement('div');
            badge.textContent = opts.statusBadge.label;
            badge.style.cssText = `font-size: 11px; color: ${opts.statusBadge.color};`;
            head.appendChild(badge);
        }
        row.appendChild(head);

        // Optional subtitle (NPC hint cho next_offered)
        if (opts.subtitleHTML) {
            const sub = document.createElement('div');
            sub.style.cssText = 'margin-top: 4px; font-size: 12px; color: #ffd070;';
            sub.innerHTML = opts.subtitleHTML;
            row.appendChild(sub);
        }

        // Bullet body — level requirement + objectives
        const body = document.createElement('div');
        body.style.cssText = 'margin-top: 8px; font-size: 13px; color: #d8e0d8; display: flex; flex-direction: column; gap: 3px;';

        // Level requirement bullet — luôn hiện, dùng character level để mark done.
        // Highlight token {level} bằng span — split template + inject HTML.
        const lvLine = document.createElement('div');
        const lvText = t('quest.log.level_requirement', { level: '\u0001LV\u0001' });
        const lvHighlight = `<span style="color:${MODAL_COLORS.title};">${opts.minLevel}</span>`;
        lvLine.innerHTML = '• ' + escapeHtml(lvText).replace('\u0001LV\u0001', lvHighlight);
        body.appendChild(lvLine);

        for (const o of opts.objectives) {
            const verbKey = OBJECTIVE_KEY[o.type];
            const verb = verbKey ? t(verbKey) : o.type;
            const target = targetDisplayName(o.target_id);
            const done = Math.min(o.done, o.count);
            const isDone = done >= o.count;
            const line = document.createElement('div');
            line.innerHTML = `• ${verb} <span style="color:${isDone ? '#bdf0a0' : MODAL_COLORS.text};">${escapeHtml(target)}</span> `
                + `<span style="color:${isDone ? '#bdf0a0' : '#aaa'};">${done}/${o.count}</span>`
                + (isDone ? ' <span style="color:#bdf0a0;">✓</span>' : '');
            body.appendChild(line);
        }
        row.appendChild(body);

        // Rewards (optional — chỉ hiện cho quest đang active/completed)
        if (opts.rewards) {
            const parts: string[] = [];
            if (opts.rewards.exp > 0) parts.push(t('quest.log.reward_xp', { n: opts.rewards.exp }));
            if (opts.rewards.yen > 0) parts.push(t('quest.log.reward_yen', { n: opts.rewards.yen }));
            if (opts.rewards.coin > 0) parts.push(t('quest.log.reward_coin', { n: opts.rewards.coin }));
            if (opts.rewards.items) {
                for (const it of opts.rewards.items) {
                    parts.push(t('quest.log.reward_item', { n: it.qty, name: targetDisplayName(it.template_id) }));
                }
            }
            if (parts.length > 0) {
                const rewardLine = document.createElement('div');
                rewardLine.style.cssText = 'margin-top: 8px; font-size: 12px; color: #bbb;';
                rewardLine.textContent = `${t('quest.log.rewards_label')}: ${parts.join(' • ')}`;
                row.appendChild(rewardLine);
            }
        }

        return row;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
