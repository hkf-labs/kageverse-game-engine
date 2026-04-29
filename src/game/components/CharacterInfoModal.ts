import * as Phaser from 'phaser';
import { charactersAPI, type CharacterDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';

const CLASS_LABEL: Record<string, string> = {
    none: 'Tân Thủ',
    sword: 'Kiếm',
    bow: 'Cung',
    katana: 'Đao',
    fan: 'Quạt',
    dart: 'Phi Tiêu',
    kunai: 'Kunai',
};

// 6 phái → 3 trường (per docs/business/game-objects/skill.md §1).
const CLASS_TO_SCHOOL: Record<string, string> = {
    sword: 'Mikazuki',
    dart: 'Mikazuki',
    bow: 'Hayabusa',
    kunai: 'Hayabusa',
    katana: 'Akatsuki',
    fan: 'Akatsuki',
};

const GENDER_LABEL: Record<string, string> = {
    male: 'Nam',
    female: 'Nữ',
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
export class CharacterInfoModal implements GameComponent {
    private overlay?: HTMLDivElement;
    private bodyEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private visible = false;
    private loading = false;
    private scene: Phaser.Scene;
    private upKey?: Phaser.Input.Keyboard.Key;
    private downKey?: Phaser.Input.Keyboard.Key;
    private rows: InfoRow[] = [];
    private selectedIdx = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
        this.overlay.classList.add('kageverse-overlay', 'kageverse-overlay-character-info');
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
            width: 'min(360px, 90vw)',
            background: 'linear-gradient(180deg, #2a1808 0%, #1a0f04 100%)',
            border: '3px solid #e29e4a',
            borderRadius: '12px',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            color: '#ffe4c4',
        });
        this.overlay.appendChild(root);

        // Header — ◄ Thông tin ► + close. ◄ ► tạm disabled vì MVP chỉ
        // 1 character/user; sẽ enable khi mở rộng prev/next character profile.
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;';
        header.innerHTML =
            `<div data-arrow="prev" style="width:34px;text-align:center;color:#7a5a3a;cursor:not-allowed;font-size:16px;padding:8px 0;user-select:none;">◄</div>`
            + `<div style="flex:1;text-align:center;padding:8px 0;font-size:14px;font-weight:bold;color:#ffea7a;letter-spacing:1px;">THÔNG TIN</div>`
            + `<div data-arrow="next" style="width:34px;text-align:center;color:#7a5a3a;cursor:not-allowed;font-size:16px;padding:8px 0;user-select:none;">►</div>`
            + `<div data-close style="width:36px;text-align:center;cursor:pointer;font-size:16px;font-weight:bold;color:#ff8a8a;padding:8px 0;flex-shrink:0;">✕</div>`;
        root.appendChild(header);

        const body = document.createElement('div');
        // Hidden scrollbar (Firefox / IE / WebKit) — body chỉ tự động scroll khi
        // selected row off-view. User không scroll trực tiếp; arrow keys + wheel
        // luôn dịch chuyển con trỏ ▶, body follow.
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
        root.appendChild(body);

        const status = document.createElement('div');
        status.style.cssText = 'padding:6px 14px;font-size:11px;color:#aaa;background:#1a0f04;border-top:2px solid #4d2d13;text-align:center;min-height:18px;';
        root.appendChild(status);

        (header.querySelector('[data-close]') as HTMLDivElement).addEventListener('click', () => this.close());

        // Wheel chuột → dịch con trỏ thay vì scroll. preventDefault để body
        // không tự scroll theo wheel; mỗi tick wheel = di 1 hàng.
        body.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0) this.moveCursor(1);
            else if (e.deltaY < 0) this.moveCursor(-1);
        }, { passive: false });

        this.bodyEl = body;
        this.statusEl = status;

        // Phaser keyboard — UP/DOWN scroll khi modal mở.
        this.upKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.downKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    isOpen(): boolean { return this.visible; }

    /** Mở modal hiển thị info của character. Default = current character. */
    open(characterId?: string): void {
        if (!this.overlay) return;
        this.visible = true;
        this.overlay.style.display = 'block';
        if (this.bodyEl) this.bodyEl.scrollTop = 0;
        void this.load(characterId);
    }

    close(): void {
        if (!this.overlay) return;
        this.visible = false;
        this.overlay.style.display = 'none';
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
            el.style.color = isSel ? '#bdf0a0' : '#7a5a3a';
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
        this.setStatus('Đang tải...', '#aaa');
        try {
            const id = characterId ?? getCurrentCharacter()?.id;
            if (!id) {
                this.setStatus('Chưa có nhân vật.', '#ff8a8a');
                return;
            }
            // MVP chỉ có endpoint /characters (list của user hiện tại). Khi mở
            // rộng xem player khác, đổi sang GET /characters/:id (cần BE thêm).
            const res = await charactersAPI.list();
            const c = res.characters.find((x) => x.id === id);
            if (!c) {
                this.setStatus('Không tìm thấy nhân vật.', '#ff8a8a');
                return;
            }
            this.render(c);
            this.setStatus('Mũi tên ↑↓ hoặc kéo chuột để xem thêm', '#888');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Lỗi tải thông tin';
            this.setStatus(msg, '#ff8a8a');
        } finally {
            this.loading = false;
        }
    }

    private render(c: CharacterDTO): void {
        if (!this.bodyEl) return;
        // Lớp / Trường fallback khi chưa Bái Sư (class='none').
        const className = c.class === 'none' || !c.class
            ? 'Chưa vào lớp'
            : (CLASS_LABEL[c.class] ?? c.class);
        const school = CLASS_TO_SCHOOL[c.class] ?? 'Chưa vào trường';
        const gender = GENDER_LABEL[c.gender] ?? c.gender;
        const combatPower = computeCombatPower(c);
        const expPct = c.exp_to_next_level > 0 ? (c.exp / c.exp_to_next_level) * 100 : 0;

        this.rows = [
            { label: 'Nhân vật', value: c.display_name, valueColor: '#bdf0a0' },
            { label: 'Giới tính', value: gender },
            { label: 'Trình độ', value: String(c.level) },
            { label: 'Kinh nghiệm', value: `${c.exp} / ${c.exp_to_next_level} (${expPct.toFixed(2)}%)` },
            { label: 'Lớp', value: className },
            { label: 'Trường', value: school },
            { label: 'Hiệu chiến', value: combatPower.toLocaleString('en-US'), valueColor: '#ffea7a' },
            { label: 'HP', value: `${c.current_hp.toLocaleString('en-US')} / ${c.max_hp.toLocaleString('en-US')}`, valueColor: '#ff8a8a' },
            { label: 'MP', value: `${c.current_mp.toLocaleString('en-US')} / ${c.max_mp.toLocaleString('en-US')}`, valueColor: '#8aaaff' },
            { label: 'Tấn công', value: `${c.min_attack} – ${c.max_attack}` },
            { label: 'Phòng thủ', value: String(c.defense) },
        ];
        this.selectedIdx = 0;

        this.bodyEl.innerHTML = this.rows
            .map((r, i) => {
                const isSel = i === this.selectedIdx;
                const bulletChar = isSel ? '▶' : '•';
                const bulletColor = isSel ? '#bdf0a0' : '#7a5a3a';
                const valueColor = r.valueColor ?? '#ffe4c4';
                return `<div style="font-size:13px;line-height:1.7;display:flex;gap:6px;align-items:baseline;">`
                    + `<span data-bullet style="color:${bulletColor};margin-right:4px;width:12px;display:inline-block;">${bulletChar}</span>`
                    + `<span style="color:#a89070;">${escapeHtml(r.label)}:</span>`
                    + ` <span style="color:${valueColor};font-weight:600;">${escapeHtml(r.value)}</span>`
                    + `</div>`;
            })
            .join('');
        this.bodyEl.scrollTop = 0;
    }

    private setStatus(text: string, color: string): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.style.color = color;
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
