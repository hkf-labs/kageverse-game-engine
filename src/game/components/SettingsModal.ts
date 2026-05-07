import * as Phaser from 'phaser';
import {
    LOCALE_DISPLAY_NAMES,
    SUPPORTED_LOCALES,
    getLocale,
    onLocaleChange,
    setLocale,
    t,
    type Locale,
} from '../../i18n';
import type { GameComponent } from './types';

// Locale có file dịch thật — đặt badge ở Settings để user biết ngôn ngữ nào
// đầy đủ. Các locale còn lại sẽ fallback sang English ở những key chưa dịch.
const TRANSLATED_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['en', 'vi']);

/**
 * SettingsModal — mở từ Menu chức năng → Cài đặt.
 *
 * MVP scope chỉ có 1 section "Ngôn ngữ" với picker 11 locale. Các option khác
 * (audio, key bindings, accessibility) defer post-MVP.
 *
 * Locale change áp dụng ngay (setLocale → onLocaleChange listeners). Sticky qua
 * localStorage 'kageverse_locale' (xem i18n/index.ts).
 */
export class SettingsModal implements GameComponent {
    private scene: Phaser.Scene;
    private overlay?: HTMLDivElement;
    private titleEl?: HTMLDivElement;
    private langSectionEl?: HTMLDivElement;
    private langHintEl?: HTMLDivElement;
    private comingSoonEl?: HTMLDivElement;
    private statusEl?: HTMLDivElement;
    private closeBtn?: HTMLButtonElement;
    private localeUnsub?: () => void;
    private visible = false;
    /** Index nút locale đang focus (0..SUPPORTED_LOCALES.length-1). */
    private focusedIdx = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        const overlay = document.createElement('div');
        overlay.classList.add('kageverse-overlay', 'kageverse-overlay-settings');
        overlay.style.cssText = `
            position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.55); z-index: 200;
            font-family: system-ui, sans-serif; color: #ffe4c4;
        `;
        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(520px, 92vw); max-height: 80vh; display: flex; flex-direction: column;
            background: linear-gradient(180deg, #2a1808 0%, #1a0f04 100%);
            border: 3px solid #e29e4a; border-radius: 14px;
            overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.7);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;';
        const title = document.createElement('div');
        title.textContent = t('settings.title');
        title.style.cssText = 'flex:1;padding:10px 16px;font-size:15px;font-weight:bold;color:#ffea7a;letter-spacing:1px;';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.textContent = t('settings.close');
        closeBtn.style.cssText = `
            margin: 6px 10px; padding: 6px 14px;
            background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);
            color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;
        `;
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(closeBtn);
        panel.appendChild(header);
        this.titleEl = title;
        this.closeBtn = closeBtn;

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding: 14px 18px; overflow-y: auto; flex: 1;';
        panel.appendChild(body);

        // Section: Language
        const langSection = document.createElement('div');
        langSection.style.cssText = 'margin-bottom: 18px;';
        const langTitle = document.createElement('div');
        langTitle.textContent = t('settings.section_language');
        langTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: #ffea7a; margin-bottom: 8px; letter-spacing: 0.5px;';
        langSection.appendChild(langTitle);

        const langGrid = document.createElement('div');
        langGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;';
        for (const code of SUPPORTED_LOCALES) {
            langGrid.appendChild(this.buildLocaleButton(code));
        }
        langSection.appendChild(langGrid);

        const hint = document.createElement('div');
        hint.textContent = t('settings.language_hint');
        hint.style.cssText = 'margin-top: 10px; font-size: 11px; color: #a89070; line-height: 1.5;';
        langSection.appendChild(hint);
        body.appendChild(langSection);
        this.langSectionEl = langSection;
        this.langHintEl = hint;

        // Coming soon placeholder section
        const comingSoon = document.createElement('div');
        comingSoon.textContent = t('settings.coming_soon_section');
        comingSoon.style.cssText = 'padding: 12px; text-align: center; color: #888; font-style: italic; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 8px;';
        body.appendChild(comingSoon);
        this.comingSoonEl = comingSoon;

        // Status footer
        const status = document.createElement('div');
        status.style.cssText = 'padding: 6px 14px; font-size: 11px; color: #aaa; background: #0a0604; text-align: center; min-height: 18px; border-top: 1px solid #4d2d13;';
        panel.appendChild(status);
        this.statusEl = status;

        overlay.appendChild(panel);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Re-render khi locale đổi runtime (vd user pick language ở đây thì
        // chính static labels của Settings cũng phải tự dịch).
        this.localeUnsub = onLocaleChange(() => this.applyTranslations());
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
        this.localeUnsub?.();
        this.localeUnsub = undefined;
    }

    isOpen(): boolean { return this.visible; }

    open(): void {
        if (!this.overlay) return;
        this.visible = true;
        this.overlay.style.display = 'flex';
        this.scene.input.keyboard?.disableGlobalCapture();
        // Focus mặc định vào locale đang dùng (giúp user thấy ngay vị trí của họ).
        const cur = getLocale();
        const idx = SUPPORTED_LOCALES.indexOf(cur);
        this.focusedIdx = idx >= 0 ? idx : 0;
        this.refreshActiveButton();
        this.renderFocus();
        this.setStatus('');
    }

    close(): void {
        if (!this.overlay) return;
        this.visible = false;
        this.overlay.style.display = 'none';
        this.scene.input.keyboard?.enableGlobalCapture();
    }

    /** Grid 2 cột — ↑/↓/←/→ điều hướng giữa các nút locale. */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        if (!this.visible) return;
        const COLS = 2;
        const total = SUPPORTED_LOCALES.length;
        const rows = Math.ceil(total / COLS);
        let row = Math.floor(this.focusedIdx / COLS);
        let col = this.focusedIdx % COLS;
        switch (direction) {
            case 'left':  col = Math.max(0, col - 1); break;
            case 'right': col = Math.min(COLS - 1, col + 1); break;
            case 'up':    row = Math.max(0, row - 1); break;
            case 'down':  row = Math.min(rows - 1, row + 1); break;
        }
        const next = Math.min(row * COLS + col, total - 1);
        if (next === this.focusedIdx) return;
        this.focusedIdx = next;
        this.renderFocus();
    }

    /** Enter = chọn locale đang focus (tương đương click). */
    confirm(): void {
        if (!this.visible || !this.langSectionEl) return;
        const buttons = this.langSectionEl.querySelectorAll<HTMLButtonElement>('[data-locale]');
        buttons[this.focusedIdx]?.click();
    }

    private renderFocus(): void {
        if (!this.langSectionEl) return;
        const buttons = this.langSectionEl.querySelectorAll<HTMLButtonElement>('[data-locale]');
        buttons.forEach((btn, idx) => {
            if (idx === this.focusedIdx) {
                btn.style.outline = '2px solid #ffea7a';
                btn.style.outlineOffset = '2px';
                btn.style.boxShadow = '0 0 10px rgba(255,234,122,0.7)';
            } else {
                btn.style.outline = '';
                btn.style.outlineOffset = '';
                btn.style.boxShadow = '';
            }
        });
    }

    // applyTranslations re-text static element. Locale buttons không re-text vì
    // hiển thị native name (LOCALE_DISPLAY_NAMES) — không phụ thuộc locale.
    private applyTranslations(): void {
        if (this.titleEl) this.titleEl.textContent = t('settings.title');
        if (this.closeBtn) this.closeBtn.textContent = t('settings.close');
        if (this.langSectionEl) {
            const langTitle = this.langSectionEl.firstChild as HTMLDivElement | null;
            if (langTitle) langTitle.textContent = t('settings.section_language');
        }
        if (this.langHintEl) this.langHintEl.textContent = t('settings.language_hint');
        if (this.comingSoonEl) this.comingSoonEl.textContent = t('settings.coming_soon_section');
        this.refreshActiveButton();
    }

    private buildLocaleButton(code: Locale): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.dataset.locale = code;
        const isTranslated = TRANSLATED_LOCALES.has(code);
        const native = LOCALE_DISPLAY_NAMES[code];
        const badge = isTranslated
            ? '<span style="display:inline-block;margin-left:6px;font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(189,240,160,0.18);color:#bdf0a0;">100%</span>'
            : '<span style="display:inline-block;margin-left:6px;font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,0.08);color:#888;">EN fallback</span>';
        btn.innerHTML = `<span style="font-weight:600;">${escapeHtml(native)}</span>${badge}`;
        btn.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 10px; border-radius: 6px;
            border: 2px solid #4d2d13; background: rgba(45,26,10,0.5);
            color: #ffe4c4; font-size: 13px; cursor: pointer; text-align: left;
            font-family: inherit;
        `;
        btn.addEventListener('click', () => {
            setLocale(code);
            this.refreshActiveButton();
            this.setStatus(t('settings.language_saved'));
        });
        return btn;
    }

    private refreshActiveButton(): void {
        if (!this.langSectionEl) return;
        const cur = getLocale();
        const buttons = this.langSectionEl.querySelectorAll<HTMLButtonElement>('[data-locale]');
        buttons.forEach((b) => {
            const active = b.dataset.locale === cur;
            b.style.borderColor = active ? '#ffea7a' : '#4d2d13';
            b.style.background = active ? '#6b3a14' : 'rgba(45,26,10,0.5)';
            b.style.color = active ? '#ffea7a' : '#ffe4c4';
        });
    }

    private setStatus(text: string): void {
        if (this.statusEl) this.statusEl.textContent = text;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
