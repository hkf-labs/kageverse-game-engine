import * as Phaser from 'phaser';
import { skillAPI, type SkillDTO, type ListSkillsResponse } from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { skillIconPublicUrl } from '../../skillIcon';
import { MODAL_COLORS } from './theme';

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

function skillIconURL(skillID: string): string {
    return skillIconPublicUrl(skillID);
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
function skillIconLayered(skillID: string, faction: string, px: number): string {
    const url = skillIconURL(skillID);
    const emoji = SKILL_ICON_EMOJI[faction] ?? '✨';
    return [
        `<div style="width:${px}px;height:${px}px;display:inline-flex;align-items:center;justify-content:center;position:relative;vertical-align:middle;">`,
        `<span style="font-size:${Math.round(px * 0.72)}px;line-height:1;">${emoji}</span>`,
        `<img src="${url}" alt="" draggable="false"`,
        ` style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:pixelated;"`,
        ` onerror="this.style.display='none'" />`,
        `</div>`,
    ].join('');
}

function skillIcon(s: SkillDTO): string {
    return skillIconLayered(s.skill_id, s.faction, 38);
}

function skillIconInline(s: SkillDTO, size: number): string {
    return skillIconLayered(s.skill_id, s.faction, size) + ' ';
}

/**
 * SkillModal — Menu → Kỹ năng. Layout:
 *   header (title)
 *   SP counter row
 *   icon strip (skills) — click chọn
 *   detail rows (description, type, max level, current level, requirements, MP)
 *   action buttons (Nâng cấp / Gán slot)
 */
export class SkillModal extends BaseModal {
    private spEl?: HTMLSpanElement;
    private spLabelEl?: HTMLSpanElement;
    private iconStripEl?: HTMLDivElement;
    private detailEl?: HTMLDivElement;
    private actionsEl?: HTMLDivElement;
    private loading = false;
    private actionInFlight = false;
    private board?: ListSkillsResponse;
    private selectedSkillID: string | null = null;
    private onSlotsChanged?: (slots: (string | null)[]) => void;
    /** 'strip' = icon strip skill; 'actions' = nút Upgrade / Gán slot. */
    private focusZone: 'strip' | 'actions' = 'strip';
    private focusedActionIdx = 0;

    constructor(scene: Phaser.Scene, opts?: { onSlotsChanged?: (slots: (string | null)[]) => void }) {
        super(scene);
        this.onSlotsChanged = opts?.onSlotsChanged;
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-skill',
            size: 'sm',
            layer: 'modal',
            withStatus: true,
            title: t('skill.modal.title'),
            onClose: () => this.close(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // SP counter row — dán ngay sau header trong panel (trên body).
        // Position: panel.insertBefore(spRow, body)
        const spRow = document.createElement('div');
        spRow.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(45,26,10,0.6);border-bottom:1px solid ${MODAL_COLORS.divider};font-size:13px;flex-shrink:0;`;
        const spLabel = document.createElement('span');
        spLabel.style.color = MODAL_COLORS.textMuted;
        spLabel.textContent = t('skill.modal.sp_label');
        const spValue = document.createElement('span');
        spValue.style.cssText = `color:${MODAL_COLORS.statusOk};font-weight:bold;`;
        spValue.textContent = '—';
        spRow.append(spLabel, spValue);
        this.spLabelEl = spLabel;
        this.spEl = spValue;
        shell.panel.insertBefore(spRow, shell.body);

        // Icon strip — horizontal scroll ngay đầu body.
        const strip = document.createElement('div');
        strip.style.cssText = `
            display:flex;gap:6px;padding:10px;overflow-x:auto;background:rgba(20,12,4,0.7);
            border-bottom:1px solid ${MODAL_COLORS.divider};
            scrollbar-width:none;-ms-overflow-style:none;
            flex-shrink:0;
        `;
        strip.classList.add('cim-scroll');
        if (!document.getElementById('cim-scroll-style')) {
            const s = document.createElement('style');
            s.id = 'cim-scroll-style';
            s.textContent = '.cim-scroll::-webkit-scrollbar{display:none;}';
            document.head.appendChild(s);
        }
        shell.body.appendChild(strip);
        this.iconStripEl = strip;

        // Detail body.
        const detail = document.createElement('div');
        detail.style.cssText = 'height:220px;overflow-y:auto;padding:12px 16px;background:rgba(20,12,4,0.5);scrollbar-width:none;-ms-overflow-style:none;';
        detail.classList.add('cim-scroll');
        shell.body.appendChild(detail);
        this.detailEl = detail;

        // Action buttons bar.
        const actions = document.createElement('div');
        actions.style.cssText = `display:flex;gap:8px;padding:10px 14px;background:${MODAL_COLORS.footerBg};border-top:2px solid ${MODAL_COLORS.divider};flex-shrink:0;`;
        shell.body.appendChild(actions);
        this.actionsEl = actions;

        // Re-render text khi locale đổi runtime.
        shell.registerLocaleSync(() => {
            this.shell?.setTitle(t('skill.modal.title'));
            if (this.spLabelEl) this.spLabelEl.textContent = t('skill.modal.sp_label');
            this.render();
        });
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.spEl = undefined;
        this.spLabelEl = undefined;
        this.iconStripEl = undefined;
        this.detailEl = undefined;
        this.actionsEl = undefined;
    }

    toggle(): void {
        if (this.visible) this.close();
        else this.open();
    }

    open(): void {
        if (!this.ensureShell()) return;
        this.visible = true;
        this.focusZone = 'strip';
        this.focusedActionIdx = 0;
        void this.refresh();
    }

    close(): void {
        if (!this.visible && !this.shell) return;
        this.teardownShell();
    }

    /** ←/→ trong strip = đổi skill; ↓ → actions zone. Trong actions: ←/→
     * giữa các nút (Upgrade / Gán slot), ↑ về strip. Enter = click. */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        if (this.focusZone === 'actions') {
            const buttons = this.actionsEl
                ? Array.from(this.actionsEl.querySelectorAll('button'))
                : [];
            switch (direction) {
                case 'up':
                    this.focusZone = 'strip';
                    this.renderActionFocus();
                    return;
                case 'left':
                    if (this.focusedActionIdx > 0) {
                        this.focusedActionIdx -= 1;
                        this.renderActionFocus();
                    }
                    return;
                case 'right':
                    if (this.focusedActionIdx < buttons.length - 1) {
                        this.focusedActionIdx += 1;
                        this.renderActionFocus();
                    }
                    return;
                case 'down':
                    return;
            }
        }
        // strip zone
        if (!this.board || this.board.skills.length === 0) return;
        const skills = this.board.skills;
        let idx = skills.findIndex((s) => s.skill_id === this.selectedSkillID);
        if (idx < 0) idx = 0;
        switch (direction) {
            case 'left':
                if (idx > 0) idx -= 1;
                else return;
                break;
            case 'right':
                if (idx < skills.length - 1) idx += 1;
                else return;
                break;
            case 'down':
                this.focusZone = 'actions';
                this.focusedActionIdx = 0;
                this.renderActionFocus();
                return;
            case 'up':
                return;
        }
        if (skills[idx].skill_id !== this.selectedSkillID) {
            this.selectedSkillID = skills[idx].skill_id;
            this.render();
            this.scrollFocusedStripIntoView();
        }
    }

    confirm(): void {
        if (!this.visible) return;
        if (this.focusZone !== 'actions') return;
        const buttons = this.actionsEl
            ? Array.from(this.actionsEl.querySelectorAll('button'))
            : [];
        const btn = buttons[this.focusedActionIdx] as HTMLButtonElement | undefined;
        if (btn && !btn.disabled) btn.click();
    }

    private renderActionFocus(): void {
        const buttons = this.actionsEl
            ? Array.from(this.actionsEl.querySelectorAll('button'))
            : [];
        if (this.focusedActionIdx >= buttons.length) {
            this.focusedActionIdx = Math.max(0, buttons.length - 1);
        }
        const focused = this.focusZone === 'actions';
        buttons.forEach((btn, idx) => {
            if (focused && idx === this.focusedActionIdx) {
                btn.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
                btn.style.outlineOffset = '2px';
                btn.style.boxShadow = '0 0 12px rgba(255,234,122,0.8)';
            } else {
                btn.style.outline = '';
                btn.style.outlineOffset = '';
                btn.style.boxShadow = '';
            }
        });
    }

    private scrollFocusedStripIntoView(): void {
        if (!this.iconStripEl || !this.selectedSkillID || !this.board) return;
        const idx = this.board.skills.findIndex((s) => s.skill_id === this.selectedSkillID);
        if (idx < 0) return;
        const cell = this.iconStripEl.children[idx] as HTMLElement | undefined;
        cell?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) {
            this.shell?.setStatus(t('skill.modal.error_no_character'), 'error');
            return;
        }
        if (this.loading) return;
        this.loading = true;
        this.shell?.setStatus(t('skill.modal.loading'), 'muted');
        try {
            this.board = await skillAPI.list(character.id);
            // Default select: skill đã learned đầu tiên, fallback skill đầu list.
            if (!this.selectedSkillID || !this.board.skills.find((s) => s.skill_id === this.selectedSkillID)) {
                const firstLearned = this.board.skills.find((s) => s.learned);
                this.selectedSkillID = firstLearned?.skill_id ?? this.board.skills[0]?.skill_id ?? null;
            }
            this.render();
            this.shell?.setStatus('', 'muted');
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('skill.modal.error_load');
            this.shell?.setStatus(msg, 'error');
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
        // Re-apply focus glow sau mỗi render — actions DOM được rebuild nên
        // outline cần áp lại.
        this.renderActionFocus();
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
                border:2px solid ${isSel ? MODAL_COLORS.borderAccent : isLearned ? '#4a7a3a' : '#3a2a1a'};
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
                badge.style.cssText = `position:absolute;right:1px;bottom:0;font-size:10px;font-weight:bold;color:${MODAL_COLORS.title};text-shadow:0 0 3px #000,1px 1px 0 #000;`;
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
                valueColor: MODAL_COLORS.statusOk,
            });
        } else {
            rows.push({ label: t('skill.label_status'), value: t('skill.value_not_learned'), valueColor: MODAL_COLORS.statusError });
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
                    valueColor: MODAL_COLORS.statusError,
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
                valueColor: MODAL_COLORS.title,
            });
        }
        if (s.current_stats.atk_bonus !== undefined && s.current_stats.atk_bonus > 0) {
            rows.push({
                label: t('skill.label_atk_bonus'),
                value: t('skill.value_atk_plus', { n: s.current_stats.atk_bonus.toFixed(0) }),
                valueColor: MODAL_COLORS.statusOk,
            });
        }
        if (s.next_upgrade) {
            const lockBadge = s.next_upgrade.ready
                ? `<span style="color:${MODAL_COLORS.statusOk}">${escapeHtml(t('skill.lock_ready'))}</span>`
                : `<span style="color:${MODAL_COLORS.statusError}">${escapeHtml(t('skill.lock_need_level', { n: s.next_upgrade.min_char_level }))}</span>`;
            rows.push({
                label: t('skill.label_next_level', { n: s.next_upgrade.to_level }),
                value: t('skill.value_next_upgrade', { cost: s.next_upgrade.sp_cost, lock: lockBadge }),
            });
        }

        const desc = skillDesc(s.description_key);
        const descBlock = desc
            ? `<div style="font-size:13px;color:${MODAL_COLORS.text};font-style:italic;margin-bottom:10px;line-height:1.5;">${escapeHtml(desc)}</div>`
            : '';
        const title = `<div style="font-size:15px;font-weight:bold;color:${MODAL_COLORS.title};margin-bottom:8px;display:flex;align-items:center;gap:6px;">${skillIconInline(s, 28)}<span>${escapeHtml(skillName(s.name_key))}</span></div>`;
        const rowHTML = rows.map((r) => {
            const valueColor = r.valueColor ?? MODAL_COLORS.text;
            return `<div style="font-size:13px;line-height:1.7;display:flex;gap:6px;align-items:baseline;">`
                + `<span style="color:#7a5a3a;">•</span>`
                + `<span style="color:${MODAL_COLORS.textMuted};">${escapeHtml(r.label)}:</span>`
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
        this.shell?.setStatus(t('skill.modal.upgrading'), 'muted');
        try {
            const res = await skillAPI.upgrade(character.id, skillID);
            this.shell?.setStatus(
                t('skill.modal.upgrade_success', { n: res.to_level, sp: res.skill_points_remaining }),
                'ok',
            );
            await this.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('skill.modal.error_upgrade');
            this.shell?.setStatus(msg, 'error');
        } finally {
            this.actionInFlight = false;
        }
    }

    private openSlotPicker(skillID: string): void {
        if (!this.board) return;
        // Inline popup ngay trên action bar — 5 ô slot, click chọn.
        const slots = this.board.skill_slots;
        const popup = document.createElement('div');
        popup.style.cssText = `position:absolute;bottom:60px;right:14px;display:flex;gap:6px;background:${MODAL_COLORS.footerBg};border:2px solid #4a7a3a;border-radius:8px;padding:8px;z-index:5;box-shadow:0 4px 12px rgba(0,0,0,0.5);`;
        for (let i = 0; i < 5; i++) {
            const cur = slots[i];
            const btn = document.createElement('button');
            btn.textContent = String(i + 1);
            btn.title = cur
                ? t('skill.slot_filled', { n: i + 1, cur })
                : t('skill.slot_empty', { n: i + 1 });
            btn.style.cssText = `
                width:36px;height:36px;border-radius:6px;
                border:2px solid ${cur === skillID ? MODAL_COLORS.borderAccent : '#4a7a3a'};
                background:${cur === skillID ? '#3a3014' : '#2a4a1a'};
                color:${MODAL_COLORS.statusOk};cursor:pointer;font-weight:bold;
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
        this.shell?.setStatus(t('skill.modal.assigning_slot', { n: slotIndex + 1 }), 'muted');
        try {
            const res = await skillAPI.assignSlots(character.id, newSlots);
            this.board.skill_slots = res.skill_slots;
            const name = skillName(this.board.skills.find((sk) => sk.skill_id === skillID)?.name_key ?? skillID);
            this.shell?.setStatus(t('skill.modal.assign_success', { name, n: slotIndex + 1 }), 'ok');
            this.render();
            this.onSlotsChanged?.(res.skill_slots);
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('skill.modal.error_assign');
            this.shell?.setStatus(msg, 'error');
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
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
