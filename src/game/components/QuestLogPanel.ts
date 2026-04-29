import * as Phaser from 'phaser';
import { questAPI, type QuestBoardCategoryDTO, type QuestDTO, type QuestObjectiveDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';

const STATUS_LABEL: Record<QuestDTO['status'], string> = {
    active: 'Đang làm',
    completed: 'Hoàn thành — chờ trả',
    claimed: 'Đã trả',
};

const STATUS_COLOR: Record<QuestDTO['status'], string> = {
    active: '#bdf0a0',
    completed: '#ffea7a',
    claimed: '#7a8a8a',
};

const OBJECTIVE_VERB: Record<QuestObjectiveDTO['type'], string> = {
    kill_monster: 'Diệt',
    talk_npc: 'Gặp',
    collect_item: 'Thu thập',
    use_item: 'Sử dụng',
    buy_item: 'Mua',
};

// I18n key → tên hiển thị (FE-side override; sau này sẽ thay bằng i18n module).
const QUEST_NAME_VI: Record<string, string> = {
    'quest.mq_awakening.name': 'Tỉnh Mộng',
    'quest.mq_first_potion.name': 'Học Cách Hồi Sức',
    'quest.mq_slime_purge.name': 'Dọn Sạch Slime',
    'quest.mq_letter_relay.name': 'Thư Tay Cho Lò Rèn',
    'quest.mq_dewlight_hunt.name': 'Săn Tinh Sương',
    'quest.mq_goblin_raid.name': 'Goblin Phá Làng',
    'quest.mq_field_rat_swarm.name': 'Chuột Đồng Tràn Đồng',
    'quest.mq_crow_strike.name': 'Quạ Đêm Đột Kích',
    'quest.mq_bamboo_gate.name': 'Vào Rừng Tre',
    'quest.mq_owl_omen.name': 'Cú Bóng Báo Hiệu',
    'quest.sq_blacksmith_intro.name': 'Lò Rèn Đầu Tiên',
    'quest.sq_stash_intro.name': 'Kho Báu Cá Nhân',
};

export function questDisplayName(nameKey: string): string {
    return QUEST_NAME_VI[nameKey] ?? nameKey;
}

const TARGET_NAME_VI: Record<string, string> = {
    // monsters
    turtle_gold: 'Rùa Vàng',
    slime_white: 'Slime Trắng',
    mist_sprite: 'Tinh Sương',
    goblin_wanderer: 'Goblin Lưu Lạc',
    stone_beetle: 'Bọ Đá',
    field_rat: 'Chuột Đồng',
    night_crow: 'Quạ Đêm',
    night_wolf: 'Sói Đêm',
    shadow_owl: 'Cú Bóng',
    // npcs
    npc_genji: 'Trưởng Làng Genji',
    npc_healer_ayame: 'Y Sư Ayame',
    npc_tetsu: 'Thợ Rèn Tetsu',
    npc_kura: 'Quản Kho Kura',
    npc_teleporter: 'Xa Phu Tobi',
    // items
    hp_potion_lv1: 'Bình HP Nhỏ',
    material_owl_feather: 'Lông Cú Đêm',
};

export function targetDisplayName(targetID: string): string {
    return TARGET_NAME_VI[targetID] ?? targetID;
}

type TabKey = 'main' | 'side' | 'event';
const TAB_LABEL: Record<TabKey, string> = {
    main: 'Chính tuyến',
    side: 'Phụ tuyến',
    event: 'Sự kiện',
};

export class QuestLogPanel implements GameComponent {
    private overlay?: HTMLDivElement;
    private bodyEl?: HTMLDivElement;
    private tabsEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private visible = false;
    private board: Record<string, QuestBoardCategoryDTO> = {};
    private flatQuests: QuestDTO[] = [];
    private loading = false;
    private currentTab: TabKey = 'main';
    private scene: Phaser.Scene;
    private onClosed?: () => void;
    private onQuestsUpdated?: (quests: QuestDTO[]) => void;

    constructor(
        scene: Phaser.Scene,
        opts?: { onClosed?: () => void; onQuestsUpdated?: (quests: QuestDTO[]) => void },
    ) {
        this.scene = scene;
        this.onClosed = opts?.onClosed;
        this.onQuestsUpdated = opts?.onQuestsUpdated;
    }

    create(): void {
        this.buildOverlay();
    }

    isVisible(): boolean { return this.visible; }

    open(): void {
        if (this.visible) return;
        this.visible = true;
        if (this.overlay) this.overlay.style.display = 'flex';
        this.scene.input.keyboard?.disableGlobalCapture();
        void this.refresh();
    }

    close(): void {
        if (!this.visible) return;
        this.visible = false;
        if (this.overlay) this.overlay.style.display = 'none';
        this.scene.input.keyboard?.enableGlobalCapture();
        this.onClosed?.();
    }

    /** Refresh từ BE — gọi sau accept/turn-in/kill từ ngoài. */
    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        if (this.loading) return;
        this.loading = true;
        this.setStatus('Đang tải...', '#aaaaaa');
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
            this.setStatus('', '#fff');
            this.onQuestsUpdated?.(this.flatQuests);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Lỗi tải nhiệm vụ';
            this.setStatus(msg, '#ff8a8a');
        } finally {
            this.loading = false;
        }
    }

    /** Cached quests phẳng (active+completed mọi category) — tracker dùng. */
    getQuests(): QuestDTO[] { return this.flatQuests; }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    private buildOverlay(): void {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.55); z-index: 200;
            font-family: system-ui, sans-serif; color: #ffffff;
        `;
        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(720px, 92vw); max-height: 80vh; display: flex; flex-direction: column;
            background: linear-gradient(180deg, rgba(20,28,36,0.96), rgba(14,18,24,0.96));
            border: 1px solid rgba(189,240,160,0.3); border-radius: 14px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6); overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 18px; border-bottom: 1px solid rgba(189,240,160,0.2);
        `;
        const title = document.createElement('div');
        title.textContent = '📜 Nhật ký Nhiệm vụ';
        title.style.cssText = 'font-size: 17px; font-weight: 600; color: #ffea7a;';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: transparent; color: #fff; border: none; font-size: 18px;
            cursor: pointer; padding: 4px 10px;
        `;
        closeBtn.onclick = () => this.close();
        header.append(title, closeBtn);

        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex; gap: 4px; padding: 10px 14px 0 14px;
            background: rgba(0,0,0,0.25); border-bottom: 1px solid rgba(189,240,160,0.15);
        `;

        const body = document.createElement('div');
        body.style.cssText = `
            flex: 1; overflow-y: auto; padding: 12px 18px; display: flex;
            flex-direction: column; gap: 10px;
        `;

        const status = document.createElement('div');
        status.style.cssText = `
            padding: 8px 18px; font-size: 13px; color: #aaaaaa;
            border-top: 1px solid rgba(189,240,160,0.2);
            min-height: 24px;
        `;

        panel.append(header, tabs, body, status);
        overlay.appendChild(panel);
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) this.close();
        });
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.tabsEl = tabs;
        this.bodyEl = body;
        this.statusEl = status;

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
                color: ${isCurrent ? '#ffea7a' : disabled ? '#666' : '#ffe4c4'};
                background: ${isCurrent ? 'rgba(255,234,122,0.12)' : 'transparent'};
                border: 1px solid ${isCurrent ? 'rgba(255,234,122,0.4)' : 'transparent'};
                border-bottom: none;
                border-top-left-radius: 6px; border-top-right-radius: 6px;
                user-select: none; position: relative;
                opacity: ${disabled ? '0.6' : '1'};
            `;
            tab.textContent = TAB_LABEL[key];
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
            note.textContent = 'Sự kiện sắp ra mắt.';
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
                ? 'Chưa có nhiệm vụ chính tuyến nào khả dụng.'
                : 'Chưa có nhiệm vụ phụ tuyến nào khả dụng.';
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
        const banner = document.createElement('div');
        banner.style.cssText = `
            border: 1px dashed rgba(255,138,138,0.5); border-radius: 8px;
            padding: 10px 12px; background: rgba(255,138,138,0.08);
            color: #ffd070; font-size: 13px;
        `;
        const npcName = next.giver_npc_id ? targetDisplayName(next.giver_npc_id) : 'NPC chưa rõ';
        banner.innerHTML =
            `<span style="color:#ff8a8a;font-weight:600;">❗ Tiếp theo:</span> `
            + `Đến gặp <span style="color:#bdf0a0;">${escapeHtml(npcName)}</span> để nhận `
            + `<span style="color:#ffea7a;">${escapeHtml(questDisplayName(next.name_key))}</span> `
            + `<span style="color:#aaa;font-size:11px;">(Lv ${next.min_level})</span>`;
        return banner;
    }

    private renderQuestRow(q: QuestDTO): HTMLDivElement {
        const row = document.createElement('div');
        row.style.cssText = `
            border: 1px solid rgba(189,240,160,0.25); border-radius: 10px;
            padding: 10px 12px; background: rgba(255,255,255,0.04);
        `;
        const head = document.createElement('div');
        head.style.cssText = 'display: flex; justify-content: space-between; gap: 8px; align-items: center;';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight: 600; font-size: 14px;';
        title.innerHTML = `<span style="color:#ffea7a">${escapeHtml(questDisplayName(q.name_key))}</span>
            <span style="color:#888; font-size:11px; margin-left:6px">[Lv ${q.min_level}]</span>`;
        const status = document.createElement('div');
        status.textContent = STATUS_LABEL[q.status];
        status.style.cssText = `font-size: 12px; color: ${STATUS_COLOR[q.status]};`;
        head.append(title, status);
        row.appendChild(head);

        // Objectives
        const obj = document.createElement('div');
        obj.style.cssText = 'margin-top: 8px; font-size: 13px; color: #d8e0d8; display: flex; flex-direction: column; gap: 3px;';
        for (const o of q.objectives) {
            const line = document.createElement('div');
            const verb = OBJECTIVE_VERB[o.type] ?? o.type;
            const target = targetDisplayName(o.target_id);
            const done = Math.min(o.done, o.count);
            const isDone = done >= o.count;
            line.innerHTML = `${isDone ? '✅' : '◻'} ${verb} ${escapeHtml(target)} <span style="color:${isDone ? '#bdf0a0' : '#aaa'}">(${done}/${o.count})</span>`;
            obj.appendChild(line);
        }
        row.appendChild(obj);

        // Rewards
        if (q.rewards) {
            const rewardLine = document.createElement('div');
            rewardLine.style.cssText = 'margin-top: 8px; font-size: 12px; color: #bbb;';
            const parts: string[] = [];
            if (q.rewards.exp > 0) parts.push(`+${q.rewards.exp} XP`);
            if (q.rewards.yen > 0) parts.push(`+${q.rewards.yen} Yên`);
            if (q.rewards.coin > 0) parts.push(`+${q.rewards.coin} Xu`);
            if (q.rewards.items) {
                for (const it of q.rewards.items) {
                    parts.push(`+${it.qty} ${targetDisplayName(it.template_id)}`);
                }
            }
            if (parts.length > 0) {
                rewardLine.textContent = `Thưởng: ${parts.join(' • ')}`;
                row.appendChild(rewardLine);
            }
        }

        return row;
    }

    private setStatus(text: string, color: string): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.style.color = color;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
