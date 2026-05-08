import * as Phaser from 'phaser';
import { charactersAPI, type CharacterDTO } from '../../../network/api';
import { getCurrentCharacter } from '../../playerSession';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

const CLASS_KEY: Record<string, string> = {
    none: 'class.none',
    sword: 'class.sword',
    bow: 'class.bow',
    katana: 'class.katana',
    fan: 'class.fan',
    dart: 'class.dart',
    kunai: 'class.kunai',
};

// 6 phái → 3 trường (per docs/business/game-objects/skill.md §1).
// School names là proper noun (Mikazuki/Hayabusa/Akatsuki) — không cần dịch.
const CLASS_TO_SCHOOL: Record<string, string> = {
    sword: 'Mikazuki',
    dart: 'Mikazuki',
    bow: 'Hayabusa',
    kunai: 'Hayabusa',
    katana: 'Akatsuki',
    fan: 'Akatsuki',
};

const GENDER_KEY: Record<string, string> = {
    male: 'gender.male',
    female: 'gender.female',
};

interface InfoRow {
    label: string;
    value: string;
    valueColor?: string;
}

/**
 * CharacterInfoModal — modal "Thông tin" hiển thị thông tin nhân vật.
 * Reusable: open(characterId?) — không truyền sẽ lấy character hiện tại.
 * Sau này có thể mở từ click NPC/player khác để xem profile họ.
 *
 * Scroll: ẩn scrollbar browser; dùng arrow keys (UP/DOWN) hoặc drag chuột.
 */
export class CharacterInfoModal extends BaseModal {
    private bodyEl?: HTMLDivElement;
    private loading = false;
    private upKey?: Phaser.Input.Keyboard.Key;
    private downKey?: Phaser.Input.Keyboard.Key;
    private rows: InfoRow[] = [];
    private selectedIdx = 0;

    /** Override — đăng ký Phaser key luôn ở create (không phụ thuộc DOM),
     * an toàn vì update() đã gate bằng this.visible. */
    create(): void {
        this.upKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.downKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-character-info',
            size: 'sm',
            layer: 'modal',
            withStatus: true,
            title: t('character_info.title'),
            onClose: () => this.close(),
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Body — fixed-height list. Hidden scrollbar (Firefox / IE / WebKit) —
        // body chỉ tự động scroll khi selected row off-view. User không scroll
        // trực tiếp; arrow keys + wheel luôn dịch chuyển con trỏ ▶, body follow.
        const body = document.createElement('div');
        body.style.cssText = `
            height: 320px; overflow-y: auto; padding: 12px 16px;
            background: rgba(20,12,4,0.7);
            scrollbar-width: none; -ms-overflow-style: none;
            user-select: none;
        `;
        body.classList.add('cim-scroll');
        if (!document.getElementById('cim-scroll-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'cim-scroll-style';
            styleEl.textContent = '.cim-scroll::-webkit-scrollbar{display:none;}';
            document.head.appendChild(styleEl);
        }

        // Wheel chuột → dịch con trỏ thay vì scroll. preventDefault để body
        // không tự scroll theo wheel; mỗi tick wheel = di 1 hàng.
        body.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0) this.moveCursor(1);
            else if (e.deltaY < 0) this.moveCursor(-1);
        }, { passive: false });

        shell.body.appendChild(body);
        this.bodyEl = body;
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.bodyEl = undefined;
    }

    /** Mở modal hiển thị info của character. Default = current character. */
    open(characterId?: string): void {
        const shell = this.ensureShell();
        if (!shell) return;
        this.visible = true;
        if (this.bodyEl) this.bodyEl.scrollTop = 0;
        void this.load(characterId);
    }

    close(): void {
        if (!this.visible && !this.shell) return;
        this.teardownShell();
    }

    toggle(characterId?: string): void {
        if (this.visible) this.close();
        else this.open(characterId);
    }

    /** Gọi từ scene update() — arrow keys di chuyển con trỏ. */
    update(): void {
        if (!this.visible) return;
        if (this.upKey && Phaser.Input.Keyboard.JustDown(this.upKey)) this.moveCursor(-1);
        if (this.downKey && Phaser.Input.Keyboard.JustDown(this.downKey)) this.moveCursor(1);
    }

    private moveCursor(delta: number): void {
        if (this.rows.length === 0) return;
        const next = Math.max(0, Math.min(this.rows.length - 1, this.selectedIdx + delta));
        if (next === this.selectedIdx) return;
        this.selectedIdx = next;
        this.repaintBullets();
        this.scrollSelectedIntoView();
    }

    private repaintBullets(): void {
        if (!this.bodyEl) return;
        const els = this.bodyEl.querySelectorAll<HTMLElement>('[data-bullet]');
        els.forEach((el, i) => {
            const isSel = i === this.selectedIdx;
            el.textContent = isSel ? '▶' : '•';
            el.style.color = isSel ? MODAL_COLORS.statusOk : '#7a5a3a';
        });
    }

    private scrollSelectedIntoView(): void {
        if (!this.bodyEl) return;
        const row = this.bodyEl.children[this.selectedIdx] as HTMLElement | undefined;
        if (!row) return;
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;
        const viewTop = this.bodyEl.scrollTop;
        const viewBottom = viewTop + this.bodyEl.clientHeight;
        if (rowTop < viewTop) this.bodyEl.scrollTop = rowTop;
        else if (rowBottom > viewBottom) this.bodyEl.scrollTop = rowBottom - this.bodyEl.clientHeight;
    }

    private async load(characterId?: string): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        this.shell?.setStatus(t('character_info.loading'), 'muted');
        try {
            const id = characterId ?? getCurrentCharacter()?.id;
            if (!id) {
                this.shell?.setStatus(t('character_info.error_no_character'), 'error');
                return;
            }
            // MVP chỉ có endpoint /characters (list của user hiện tại). Khi mở
            // rộng xem player khác, đổi sang GET /characters/:id (cần BE thêm).
            const res = await charactersAPI.list();
            const c = res.characters.find((x) => x.id === id);
            if (!c) {
                this.shell?.setStatus(t('character_info.error_not_found'), 'error');
                return;
            }
            this.render(c);
            this.shell?.setStatus(t('character_info.scroll_hint'), 'muted');
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('character_info.error_load');
            this.shell?.setStatus(msg, 'error');
        } finally {
            this.loading = false;
        }
    }

    private render(c: CharacterDTO): void {
        if (!this.bodyEl) return;
        // Lớp / Trường fallback khi chưa Bái Sư (class='none').
        const classKey = CLASS_KEY[c.class];
        const className = c.class === 'none' || !c.class
            ? t('character_info.no_class')
            : (classKey ? t(classKey) : c.class);
        const school = CLASS_TO_SCHOOL[c.class] ?? t('character_info.no_school');
        const genderKey = GENDER_KEY[c.gender];
        const gender = genderKey ? t(genderKey) : c.gender;
        const combatPower = computeCombatPower(c);
        const expPct = c.exp_to_next_level > 0 ? (c.exp / c.exp_to_next_level) * 100 : 0;

        this.rows = [
            { label: t('character_info.row_character'), value: c.display_name, valueColor: MODAL_COLORS.statusOk },
            { label: t('character_info.row_gender'), value: gender },
            { label: t('character_info.row_level'), value: String(c.level) },
            { label: t('character_info.row_exp'), value: `${c.exp} / ${c.exp_to_next_level} (${expPct.toFixed(2)}%)` },
            { label: t('character_info.row_class'), value: className },
            { label: t('character_info.row_school'), value: school },
            { label: t('character_info.row_combat_power'), value: combatPower.toLocaleString('en-US'), valueColor: MODAL_COLORS.title },
            { label: 'HP', value: `${c.current_hp.toLocaleString('en-US')} / ${c.max_hp.toLocaleString('en-US')}`, valueColor: '#ff8a8a' },
            { label: 'MP', value: `${c.current_mp.toLocaleString('en-US')} / ${c.max_mp.toLocaleString('en-US')}`, valueColor: '#8aaaff' },
            { label: t('character_info.row_attack'), value: `${c.min_attack} – ${c.max_attack}` },
            { label: t('character_info.row_defense'), value: String(c.defense) },
        ];
        this.selectedIdx = 0;

        this.bodyEl.innerHTML = this.rows
            .map((r, i) => {
                const isSel = i === this.selectedIdx;
                const bulletChar = isSel ? '▶' : '•';
                const bulletColor = isSel ? MODAL_COLORS.statusOk : '#7a5a3a';
                const valueColor = r.valueColor ?? MODAL_COLORS.text;
                return `<div style="font-size:13px;line-height:1.7;display:flex;gap:6px;align-items:baseline;">`
                    + `<span data-bullet style="color:${bulletColor};margin-right:4px;width:12px;display:inline-block;">${bulletChar}</span>`
                    + `<span style="color:${MODAL_COLORS.textMuted};">${escapeHtml(r.label)}:</span>`
                    + ` <span style="color:${valueColor};font-weight:600;">${escapeHtml(r.value)}</span>`
                    + `</div>`;
            })
            .join('');
        this.bodyEl.scrollTop = 0;
    }
}

function computeCombatPower(c: CharacterDTO): number {
    // Heuristic gọn: stat aggregate. Sẽ thay bằng BE-side khi chuẩn hoá công thức.
    const avgAtk = (c.min_attack + c.max_attack) / 2;
    return Math.round(c.max_hp * 0.3 + c.max_mp * 0.2 + avgAtk * 5 + c.defense * 4 + c.level * 50);
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
