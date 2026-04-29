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
    bullet?: string; // override mặc định '▶'
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
    // Drag state
    private dragging = false;
    private dragStartY = 0;
    private dragStartScroll = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        this.overlay = document.createElement('div');
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
        // Hidden scrollbar — Firefox / IE / WebKit. Vẫn `overflow:auto` để
        // scrollTop vẫn có thể set qua arrow keys / drag.
        body.style.cssText = `
            height: 320px; overflow-y: auto; padding: 12px 16px;
            background: rgba(20,12,4,0.7);
            scrollbar-width: none; -ms-overflow-style: none;
            cursor: grab; user-select: none;
        `;
        body.classList.add('cim-scroll');
        // Inject 1 lần (idempotent) — hide WebKit scrollbar.
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

        // Mouse drag scroll
        body.addEventListener('mousedown', (e) => {
            this.dragging = true;
            this.dragStartY = e.clientY;
            this.dragStartScroll = body.scrollTop;
            body.style.cursor = 'grabbing';
            e.preventDefault();
        });
        body.addEventListener('mousemove', (e) => {
            if (!this.dragging) return;
            const delta = this.dragStartY - e.clientY;
            body.scrollTop = this.dragStartScroll + delta;
        });
        const stopDrag = () => {
            if (!this.dragging) return;
            this.dragging = false;
            body.style.cursor = 'grab';
        };
        body.addEventListener('mouseup', stopDrag);
        body.addEventListener('mouseleave', stopDrag);

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

    /** Gọi từ scene update() — xử lý arrow keys khi modal mở. */
    update(): void {
        if (!this.visible || !this.bodyEl) return;
        if (this.upKey && Phaser.Input.Keyboard.JustDown(this.upKey)) {
            this.bodyEl.scrollTop = Math.max(0, this.bodyEl.scrollTop - 36);
        }
        if (this.downKey && Phaser.Input.Keyboard.JustDown(this.downKey)) {
            this.bodyEl.scrollTop = Math.min(this.bodyEl.scrollHeight, this.bodyEl.scrollTop + 36);
        }
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
        const className = CLASS_LABEL[c.class] ?? c.class;
        const school = CLASS_TO_SCHOOL[c.class] ?? '—';
        const gender = GENDER_LABEL[c.gender] ?? c.gender;
        const combatPower = computeCombatPower(c);
        const expPct = c.exp_to_next_level > 0 ? (c.exp / c.exp_to_next_level) * 100 : 0;

        const rows: InfoRow[] = [
            { label: 'Nhân vật', value: c.display_name, valueColor: '#bdf0a0', bullet: '▶' },
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
            { label: 'Xu', value: c.coin.toLocaleString('en-US'), valueColor: '#ffd070' },
            { label: 'Vàng', value: c.gold.toLocaleString('en-US'), valueColor: '#f0b020' },
            { label: 'Kim cương', value: c.gem.toLocaleString('en-US'), valueColor: '#6cd0ff' },
        ];

        this.bodyEl.innerHTML = rows
            .map((r) => {
                const bullet = r.bullet ?? '';
                const bulletHTML = bullet
                    ? `<span style="color:#bdf0a0;margin-right:4px;">${bullet}</span>`
                    : `<span style="color:#7a5a3a;margin-right:4px;">•</span>`;
                const valueColor = r.valueColor ?? '#ffe4c4';
                return `<div style="font-size:13px;line-height:1.7;display:flex;gap:6px;">`
                    + `${bulletHTML}`
                    + `<span style="color:#a89070;">${escapeHtml(r.label)}:</span>`
                    + ` <span style="color:${valueColor};font-weight:600;">${escapeHtml(r.value)}</span>`
                    + `</div>`;
            })
            .join('');
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
