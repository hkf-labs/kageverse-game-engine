import * as Phaser from 'phaser';
import { skillAPI, type SkillDTO, type ListSkillsResponse } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import { onLocaleChange, t } from '../../i18n';
import type { GameComponent } from './types';

// SKILL_NAME_VI / SKILL_DESC_VI moved to i18n bundles (`skill.<id>.name` / `.desc`).
// skillName / skillDesc helpers ở dưới resolve qua t() — missing key fallback raw.

const SKILL_ICON_EMOJI: Record<string, string> = {
    none: '🗡️',
    sword: '⚔️',
    bow: '🏹',
    katana: '🗡️',
    fan: '🪭',
    dart: '🎯',
    kunai: '🔪',
};

// Skill ID có file icon trong /assets/game/skills/icon_<id-with-underscore>.png.
// Skills chưa có icon (lv 90/100/110/120) fallback về emoji theo phái.
const SKILL_ICON_AVAILABLE: ReadonlySet<string> = new Set([
    'sword.slash_lv10', 'sword.guard_lv15', 'sword.iron_body_lv20', 'sword.combo_lv25',
    'sword.crit_focus_lv30', 'sword.cleave_lv35', 'sword.heavy_lv40', 'sword.fury_lv45',
    'sword.thunder_lv50', 'sword.parry_lv60', 'sword.kage_lv70', 'sword.divine_lv80',
    'bow.shoot_lv10', 'bow.eagle_eye_lv15', 'bow.steady_aim_lv20', 'bow.rapid_lv25',
    'bow.wind_lv30', 'bow.piercing_lv35', 'bow.hunter_lv40', 'bow.swift_lv45',
    'bow.storm_lv50', 'bow.shadow_step_lv60', 'bow.falcon_lv70', 'bow.master_lv80',
]);

function skillIconURL(skillID: string): string | null {
    if (!SKILL_ICON_AVAILABLE.has(skillID)) return null;
    return `/assets/game/skills/icon_${skillID.replace('.', '_')}.png`;
}

const TYPE_KEY: Record<string, string> = {
    active_attack: 'skill.type_active_attack',
    active_buff: 'skill.type_active_buff',
    passive: 'skill.type_passive',
};

// BE trả nameKey/descKey theo format 'skill.<id>.name' / 'skill.<id>.desc' →
// pass thẳng vào t(). Missing key → t() trả raw key (visible to dev).
function skillName(key: string): string {
    const v = t(key);
    return v === key ? key : v;
}
function skillDesc(key: string | null | undefined): string {
    if (!key) return '';
    const v = t(key);
    return v === key ? key : v;
}
function skillIcon(s: SkillDTO): string {
    const url = skillIconURL(s.skill_id);
    if (url) {
        return `<img src="${url}" alt="" style="width:38px;height:38px;image-rendering:pixelated;display:block;" />`;
    }
    return SKILL_ICON_EMOJI[s.faction] ?? '✨';
}

function skillIconInline(s: SkillDTO, size: number): string {
    const url = skillIconURL(s.skill_id);
    if (url) {
        return `<img src="${url}" alt="" style="width:${size}px;height:${size}px;image-rendering:pixelated;vertical-align:middle;margin-right:6px;" />`;
    }
    return (SKILL_ICON_EMOJI[s.faction] ?? '✨') + ' ';
}

/**
 * SkillModal — Menu → Kỹ năng. Layout giống CharacterInfoModal:
 *   header ◄ KỸ NĂNG ► ✕
 *   SP counter
 *   icon strip (skills) — click chọn
 *   detail rows (description, type, max level, current level, requirements, MP)
 *   action buttons (Nâng cấp / Gán slot)
 */
export class SkillModal implements GameComponent {
    private overlay?: HTMLDivElement;
    private spEl?: HTMLDivElement;
    private iconStripEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private actionsEl?: HTMLDivElement;
    private visible = false;
    private loading = false;
    private actionInFlight = false;
    private scene: Phaser.Scene;
    private board?: ListSkillsResponse;
    private selectedSkillID: string | null = null;
    private onSlotsChanged?: (slots: (string | null)[]) => void;
    private titleEl?: HTMLDivElement;
    private spLabelEl?: HTMLSpanElement;
    private localeUnsub?: () => void;

    constructor(scene: Phaser.Scene, opts?: { onSlotsChanged?: (slots: (string | null)[]) => void }) {
        this.scene = scene;
        this.onSlotsChanged = opts?.onSlotsChanged;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
        this.overlay.classList.add('kageverse-overlay', 'kageverse-overlay-skill');
        Object.assign(this.overlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.55)',
            zIndex: '110', display: 'none',
            fontFamily: 'system-ui, sans-serif',
        });
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        parent.style.position = 'relative';
        parent.appendChild(this.overlay);

        const root = document.createElement('div');
        Object.assign(root.style, {
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(440px, 92vw)',
            background: 'linear-gradient(180deg, #2a1808 0%, #1a0f04 100%)',
            border: '3px solid #e29e4a',
            borderRadius: '12px',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            color: '#ffe4c4',
        });
        this.overlay.appendChild(root);

        // Header — same style as CharacterInfoModal.
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;';
        header.innerHTML =
            `<div style="width:34px;text-align:center;color:#7a5a3a;cursor:not-allowed;font-size:16px;padding:8px 0;user-select:none;">◄</div>`
            + `<div data-title style="flex:1;text-align:center;padding:8px 0;font-size:14px;font-weight:bold;color:#ffea7a;letter-spacing:1px;">${escapeHtml(t('skill.modal.title'))}</div>`
            + `<div style="width:34px;text-align:center;color:#7a5a3a;cursor:not-allowed;font-size:16px;padding:8px 0;user-select:none;">►</div>`
            + `<div data-close style="width:36px;text-align:center;cursor:pointer;font-size:16px;font-weight:bold;color:#ff8a8a;padding:8px 0;flex-shrink:0;">✕</div>`;
        root.appendChild(header);
        this.titleEl = header.querySelector('[data-title]') as HTMLDivElement;

        // SP counter row.
        const spRow = document.createElement('div');
        spRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(45,26,10,0.6);border-bottom:1px solid #4d2d13;font-size:13px;';
        spRow.innerHTML = `<span data-sp-label style="color:#a89070;">${escapeHtml(t('skill.modal.sp_label'))}</span> <span data-sp style="color:#bdf0a0;font-weight:bold;">—</span>`;
        root.appendChild(spRow);
        this.spEl = spRow.querySelector('[data-sp]') as HTMLDivElement;
        this.spLabelEl = spRow.querySelector('[data-sp-label]') as HTMLSpanElement;

        // Icon strip — horizontal scroll.
        const strip = document.createElement('div');
        strip.style.cssText = `
            display:flex;gap:6px;padding:10px;overflow-x:auto;background:rgba(20,12,4,0.7);
            border-bottom:1px solid #4d2d13;
            scrollbar-width:none;-ms-overflow-style:none;
        `;
        strip.classList.add('cim-scroll');
        if (!document.getElementById('cim-scroll-style')) {
            const s = document.createElement('style');
            s.id = 'cim-scroll-style';
            s.textContent = '.cim-scroll::-webkit-scrollbar{display:none;}';
            document.head.appendChild(s);
        }
        root.appendChild(strip);
        this.iconStripEl = strip;

        // Detail body.
        const body = document.createElement('div');
        body.style.cssText = 'height:220px;overflow-y:auto;padding:12px 16px;background:rgba(20,12,4,0.5);scrollbar-width:none;-ms-overflow-style:none;';
        body.classList.add('cim-scroll');
        root.appendChild(body);
        this.detailEl = body;

        // Action buttons bar.
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;padding:10px 14px;background:#1a0f04;border-top:2px solid #4d2d13;flex-shrink:0;';
        root.appendChild(actions);
        this.actionsEl = actions;

        // Status footer.
        const status = document.createElement('div');
        status.style.cssText = 'padding:6px 14px;font-size:11px;color:#aaa;background:#0a0604;text-align:center;min-height:18px;';
        root.appendChild(status);
        this.statusEl = status;

        (header.querySelector('[data-close]') as HTMLDivElement).addEventListener('click', () => this.close());

        // Re-render text khi locale đổi runtime.
        this.localeUnsub = onLocaleChange(() => {
            if (this.titleEl) this.titleEl.textContent = t('skill.modal.title');
            if (this.spLabelEl) this.spLabelEl.textContent = t('skill.modal.sp_label');
            this.render();
        });
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
        this.localeUnsub?.();
        this.localeUnsub = undefined;
    }

    isOpen(): boolean { return this.visible; }

    toggle(): void {
        if (this.visible) this.close();
        else this.open();
    }

    open(): void {
        if (!this.overlay) return;
        this.visible = true;
        this.overlay.style.display = 'block';
        void this.refresh();
    }

    close(): void {
        if (!this.overlay) return;
        this.visible = false;
        this.overlay.style.display = 'none';
    }

    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.setStatus(t('skill.modal.error_no_character'), '#ff8a8a');
            return;
        }
        if (this.loading) return;
        this.loading = true;
        this.setStatus(t('skill.modal.loading'), '#aaa');
        try {
            this.board = await skillAPI.list(character.id);
            // Default select: skill đã learned đầu tiên, fallback skill đầu list.
            if (!this.selectedSkillID || !this.board.skills.find((s) => s.skill_id === this.selectedSkillID)) {
                const firstLearned = this.board.skills.find((s) => s.learned);
                this.selectedSkillID = firstLearned?.skill_id ?? this.board.skills[0]?.skill_id ?? null;
            }
            this.render();
            this.setStatus('', '#aaa');
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('skill.modal.error_load');
            this.setStatus(msg, '#ff8a8a');
        } finally {
            this.loading = false;
        }
    }

    private render(): void {
        if (!this.board) return;
        if (this.spEl) this.spEl.textContent = String(this.board.skill_points);
        this.renderIconStrip();
        this.renderDetail();
        this.renderActions();
    }

    private renderIconStrip(): void {
        if (!this.iconStripEl || !this.board) return;
        this.iconStripEl.innerHTML = '';
        for (const s of this.board.skills) {
            const cell = document.createElement('div');
            const isSel = s.skill_id === this.selectedSkillID;
            const isLearned = s.learned;
            const opacity = isLearned ? '1' : '0.45';
            cell.style.cssText = `
                width:48px;height:48px;flex-shrink:0;
                border:2px solid ${isSel ? '#ffea7a' : isLearned ? '#4a7a3a' : '#3a2a1a'};
                border-radius:6px;
                background:${isSel ? '#3a2812' : 'rgba(20,12,4,0.6)'};
                cursor:pointer;display:flex;align-items:center;justify-content:center;
                font-size:24px;position:relative;opacity:${opacity};
                box-shadow:${isSel ? '0 0 8px rgba(255,234,122,0.5)' : 'none'};
                transition:border-color 0.1s, box-shadow 0.1s;
            `;
            cell.innerHTML = skillIcon(s);
            // Level badge bottom-right nếu learned.
            if (isLearned) {
                const badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;right:1px;bottom:0;font-size:10px;font-weight:bold;color:#ffea7a;text-shadow:0 0 3px #000,1px 1px 0 #000;';
                badge.textContent = String(s.current_skill_level);
                cell.appendChild(badge);
            }
            cell.title = skillName(s.name_key);
            cell.addEventListener('click', () => {
                this.selectedSkillID = s.skill_id;
                this.render();
            });
            this.iconStripEl.appendChild(cell);
        }
    }

    private renderDetail(): void {
        if (!this.detailEl || !this.board || !this.selectedSkillID) return;
        const s = this.board.skills.find((sk) => sk.skill_id === this.selectedSkillID);
        if (!s) return;

        const rows: Array<{ label: string; value: string; valueColor?: string }> = [];
        const typeKey = TYPE_KEY[s.skill_type];
        rows.push({ label: t('skill.label_type'), value: typeKey ? t(typeKey) : s.skill_type });
        rows.push({ label: t('skill.label_max_level'), value: String(s.max_skill_level) });
        if (s.learned) {
            rows.push({
                label: t('skill.label_current_level'),
                value: t('skill.value_current_level', { n: s.current_skill_level }),
                valueColor: '#bdf0a0',
            });
        } else {
            rows.push({ label: t('skill.label_status'), value: t('skill.value_not_learned'), valueColor: '#ff8a8a' });
        }
        rows.push({
            label: t('skill.label_requirement'),
            value: t('skill.value_required_char_level', { n: s.required_level }),
        });
        if (!s.prerequisites_met && s.missing_prerequisites) {
            for (const p of s.missing_prerequisites) {
                rows.push({
                    label: t('skill.label_prerequisite'),
                    value: t('skill.value_prereq', {
                        name: skillName(`skill.${p.skill_id.replace('.', '_')}.name`),
                        need: p.need_level,
                        cur: p.current_level,
                    }),
                    valueColor: '#ff8a8a',
                });
            }
        }
        if (s.mp_cost > 0) rows.push({ label: t('skill.label_mp_cost'), value: String(s.mp_cost) });
        if (s.cooldown_ms > 0) {
            rows.push({
                label: t('skill.label_cooldown'),
                value: t('skill.value_cooldown_sec', { n: (s.cooldown_ms / 1000).toFixed(1) }),
            });
        }
        if (s.range_px > 0 && s.skill_type !== 'passive') {
            rows.push({
                label: t('skill.label_range'),
                value: t('skill.value_range_px', { n: s.range_px }),
            });
        }
        // Show damage_multiplier / atk_bonus stats nếu có.
        if (s.current_stats.damage_multiplier !== undefined) {
            rows.push({
                label: t('skill.label_damage_multi'),
                value: t('skill.value_percent', { n: (s.current_stats.damage_multiplier * 100).toFixed(0) }),
                valueColor: '#ffea7a',
            });
        }
        if (s.current_stats.atk_bonus !== undefined && s.current_stats.atk_bonus > 0) {
            rows.push({
                label: t('skill.label_atk_bonus'),
                value: t('skill.value_atk_plus', { n: s.current_stats.atk_bonus.toFixed(0) }),
                valueColor: '#bdf0a0',
            });
        }
        if (s.next_upgrade) {
            const lockBadge = s.next_upgrade.ready
                ? `<span style="color:#bdf0a0">${escapeHtml(t('skill.lock_ready'))}</span>`
                : `<span style="color:#ff8a8a">${escapeHtml(t('skill.lock_need_level', { n: s.next_upgrade.min_char_level }))}</span>`;
            rows.push({
                label: t('skill.label_next_level', { n: s.next_upgrade.to_level }),
                value: t('skill.value_next_upgrade', { cost: s.next_upgrade.sp_cost, lock: lockBadge }),
            });
        }

        const desc = skillDesc(s.description_key);
        const descBlock = desc
            ? `<div style="font-size:13px;color:#ffe4c4;font-style:italic;margin-bottom:10px;line-height:1.5;">${escapeHtml(desc)}</div>`
            : '';
        const title = `<div style="font-size:15px;font-weight:bold;color:#ffea7a;margin-bottom:8px;display:flex;align-items:center;gap:6px;">${skillIconInline(s, 28)}<span>${escapeHtml(skillName(s.name_key))}</span></div>`;
        const rowHTML = rows.map((r) => {
            const valueColor = r.valueColor ?? '#ffe4c4';
            return `<div style="font-size:13px;line-height:1.7;display:flex;gap:6px;align-items:baseline;">`
                + `<span style="color:#7a5a3a;">•</span>`
                + `<span style="color:#a89070;">${escapeHtml(r.label)}:</span>`
                + ` <span style="color:${valueColor};font-weight:600;">${r.value}</span>`
                + `</div>`;
        }).join('');
        this.detailEl.innerHTML = title + descBlock + rowHTML;
    }

    private renderActions(): void {
        if (!this.actionsEl || !this.board || !this.selectedSkillID) return;
        const s = this.board.skills.find((sk) => sk.skill_id === this.selectedSkillID);
        this.actionsEl.innerHTML = '';
        if (!s) return;

        // Upgrade button.
        const upgradeReady = s.learned && s.next_upgrade?.ready === true;
        const upgradeLabel = !s.learned
            ? t('skill.btn_not_learned')
            : !s.upgradable
                ? t('skill.btn_not_upgradable')
                : !s.next_upgrade
                    ? t('skill.btn_maxed')
                    : t('skill.btn_upgrade', { sp: s.next_upgrade.sp_cost });
        const upgradeBtn = this.makeButton(upgradeLabel, '#7a6a2a', '#ffd070', upgradeReady, async () => {
            await this.handleUpgrade(s.skill_id);
        });
        this.actionsEl.appendChild(upgradeBtn);

        // Slot dropdown — chỉ active skill.
        if (s.skill_type !== 'passive' && s.learned) {
            const slotBtn = this.makeButton(t('skill.btn_assign_slot'), '#4a7a3a', '#bdf0a0', true, () => {
                this.openSlotPicker(s.skill_id);
            });
            this.actionsEl.appendChild(slotBtn);
        }
    }

    private async handleUpgrade(skillID: string): Promise<void> {
        if (this.actionInFlight) return;
        const character = getCurrentCharacter();
        if (!character) return;
        this.actionInFlight = true;
        this.setStatus(t('skill.modal.upgrading'), '#aaa');
        try {
            const res = await skillAPI.upgrade(character.id, skillID);
            this.setStatus(
                t('skill.modal.upgrade_success', { n: res.to_level, sp: res.skill_points_remaining }),
                '#bdf0a0',
            );
            await this.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('skill.modal.error_upgrade');
            this.setStatus(msg, '#ff8a8a');
        } finally {
            this.actionInFlight = false;
        }
    }

    private openSlotPicker(skillID: string): void {
        if (!this.board) return;
        // Inline popup ngay trên action bar — 5 ô slot, click chọn.
        const slots = this.board.skill_slots;
        const popup = document.createElement('div');
        popup.style.cssText = 'position:absolute;bottom:60px;right:14px;display:flex;gap:6px;background:#1a0f04;border:2px solid #4a7a3a;border-radius:8px;padding:8px;z-index:5;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        for (let i = 0; i < 5; i++) {
            const cur = slots[i];
            const btn = document.createElement('button');
            btn.textContent = String(i + 1);
            btn.title = cur
                ? t('skill.slot_filled', { n: i + 1, cur })
                : t('skill.slot_empty', { n: i + 1 });
            btn.style.cssText = `
                width:36px;height:36px;border-radius:6px;
                border:2px solid ${cur === skillID ? '#ffea7a' : '#4a7a3a'};
                background:${cur === skillID ? '#3a3014' : '#2a4a1a'};
                color:#bdf0a0;cursor:pointer;font-weight:bold;
            `;
            btn.addEventListener('click', async () => {
                popup.remove();
                await this.assignToSlot(skillID, i);
            });
            popup.appendChild(btn);
        }
        // Click outside → remove.
        const removeOnOutside = (e: MouseEvent) => {
            if (!popup.contains(e.target as Node)) {
                popup.remove();
                document.removeEventListener('click', removeOnOutside, true);
            }
        };
        setTimeout(() => document.addEventListener('click', removeOnOutside, true), 0);
        this.actionsEl?.parentElement?.appendChild(popup);
    }

    private async assignToSlot(skillID: string, slotIndex: number): Promise<void> {
        if (!this.board || this.actionInFlight) return;
        const character = getCurrentCharacter();
        if (!character) return;
        const newSlots = [...this.board.skill_slots];
        newSlots[slotIndex] = skillID;
        this.actionInFlight = true;
        this.setStatus(t('skill.modal.assigning_slot', { n: slotIndex + 1 }), '#aaa');
        try {
            const res = await skillAPI.assignSlots(character.id, newSlots);
            this.board.skill_slots = res.skill_slots;
            const name = skillName(this.board.skills.find((sk) => sk.skill_id === skillID)?.name_key ?? skillID);
            this.setStatus(t('skill.modal.assign_success', { name, n: slotIndex + 1 }), '#bdf0a0');
            this.render();
            this.onSlotsChanged?.(res.skill_slots);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('skill.modal.error_assign');
            this.setStatus(msg, '#ff8a8a');
        } finally {
            this.actionInFlight = false;
        }
    }

    private makeButton(label: string, borderColor: string, textColor: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.disabled = !enabled;
        btn.style.cssText = `
            flex:1;height:34px;border-radius:6px;
            border:2px solid ${borderColor};
            background:rgba(20,12,4,0.85);color:${textColor};
            font-size:13px;font-weight:bold;font-family:system-ui,sans-serif;
            cursor:${enabled ? 'pointer' : 'not-allowed'};
            opacity:${enabled ? '1' : '0.5'};
        `;
        if (enabled) btn.addEventListener('click', onClick);
        return btn;
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
