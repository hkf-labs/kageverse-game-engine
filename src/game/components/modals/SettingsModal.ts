import {
    LOCALE_DISPLAY_NAMES,
    SUPPORTED_LOCALES,
    getLocale,
    setLocale,
    t,
    type Locale,
} from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

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
export class SettingsModal extends BaseModal {
    private langSectionTitleEl?: HTMLDivElement;
    private langGridEl?: HTMLDivElement;
    private langHintEl?: HTMLDivElement;
    private comingSoonEl?: HTMLDivElement;
    /** Index nút locale đang focus (0..SUPPORTED_LOCALES.length-1). */
    private focusedIdx = 0;

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-settings',
            size: 'md',
            layer: 'blockingDialog',
            mount: 'document-body',
            withStatus: true,
            title: t('settings.title'),
            onClose: () => this.close(),
        };
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.langSectionTitleEl = undefined;
        this.langGridEl = undefined;
        this.langHintEl = undefined;
        this.comingSoonEl = undefined;
    }

    protected populateShell(shell: ModalShell): void {
        // Body content area — 1 section Language + coming-soon hint.
        const bodyContent = document.createElement('div');
        bodyContent.style.cssText = 'padding: 14px 18px; overflow-y: auto; flex: 1;';
        shell.body.appendChild(bodyContent);

        // Section: Language
        const langSection = document.createElement('div');
        langSection.style.cssText = 'margin-bottom: 18px;';

        const langTitle = document.createElement('div');
        langTitle.textContent = t('settings.section_language');
        langTitle.style.cssText = `font-size: 13px; font-weight: 600; color: ${MODAL_COLORS.title}; margin-bottom: 8px; letter-spacing: 0.5px;`;
        langSection.appendChild(langTitle);
        this.langSectionTitleEl = langTitle;

        const langGrid = document.createElement('div');
        langGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;';
        for (const code of SUPPORTED_LOCALES) {
            langGrid.appendChild(this.buildLocaleButton(code));
        }
        langSection.appendChild(langGrid);
        this.langGridEl = langGrid;

        const hint = document.createElement('div');
        hint.textContent = t('settings.language_hint');
        hint.style.cssText = `margin-top: 10px; font-size: 11px; color: ${MODAL_COLORS.textMuted}; line-height: 1.5;`;
        langSection.appendChild(hint);
        this.langHintEl = hint;
        bodyContent.appendChild(langSection);

        // Coming soon placeholder section
        const comingSoon = document.createElement('div');
        comingSoon.textContent = t('settings.coming_soon_section');
        comingSoon.style.cssText = 'padding: 12px; text-align: center; color: #888; font-style: italic; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 8px;';
        bodyContent.appendChild(comingSoon);
        this.comingSoonEl = comingSoon;

        // Re-render khi locale đổi runtime (vd user pick language ở đây thì
        // chính static labels của Settings cũng phải tự dịch).
        shell.registerLocaleSync(() => this.applyTranslations());
    }

    open(): void {
        const shell = this.ensureShell();
        if (!shell) return;
        this.visible = true;
        this.scene.input.keyboard?.disableGlobalCapture();
        // Focus mặc định vào locale đang dùng (giúp user thấy ngay vị trí của họ).
        const cur = getLocale();
        const idx = SUPPORTED_LOCALES.indexOf(cur);
        this.focusedIdx = idx >= 0 ? idx : 0;
        this.refreshActiveButton();
        this.renderFocus();
        shell.setStatus('');
    }

    close(): void {
        if (!this.visible && !this.shell) return;
        this.scene.input.keyboard?.enableGlobalCapture();
        this.teardownShell();
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
        if (!this.visible || !this.langGridEl) return;
        const buttons = this.langGridEl.querySelectorAll<HTMLButtonElement>('[data-locale]');
        buttons[this.focusedIdx]?.click();
    }

    private renderFocus(): void {
        if (!this.langGridEl) return;
        const buttons = this.langGridEl.querySelectorAll<HTMLButtonElement>('[data-locale]');
        buttons.forEach((btn, idx) => {
            if (idx === this.focusedIdx) {
                btn.style.outline = `2px solid ${MODAL_COLORS.borderAccent}`;
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
        this.shell?.setTitle(t('settings.title'));
        if (this.langSectionTitleEl) this.langSectionTitleEl.textContent = t('settings.section_language');
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
            border: 2px solid ${MODAL_COLORS.divider}; background: rgba(45,26,10,0.5);
            color: ${MODAL_COLORS.text}; font-size: 13px; cursor: pointer; text-align: left;
            font-family: inherit;
        `;
        btn.addEventListener('click', () => {
            setLocale(code);
            this.refreshActiveButton();
            this.shell?.setStatus(t('settings.language_saved'), 'ok');
        });
        return btn;
    }

    private refreshActiveButton(): void {
        if (!this.langGridEl) return;
        const cur = getLocale();
        const buttons = this.langGridEl.querySelectorAll<HTMLButtonElement>('[data-locale]');
        buttons.forEach((b) => {
            const active = b.dataset.locale === cur;
            b.style.borderColor = active ? MODAL_COLORS.borderAccent : MODAL_COLORS.divider;
            b.style.background = active ? '#6b3a14' : 'rgba(45,26,10,0.5)';
            b.style.color = active ? MODAL_COLORS.title : MODAL_COLORS.text;
        });
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
