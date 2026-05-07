// i18n runtime store + translate function. Stateless lookup theo locale hiện tại;
// caller gọi `t(key, params?)` ở mọi component (Phaser scene + DOM overlay).
//
// Locale resolve order khi app boot:
//   1. localStorage 'kageverse_locale' (sticky qua reload).
//   2. (post-login) BE user.preferred_language → setLocale() override.
//   3. Default 'vi'.
//
// Subscribe pattern cho scene re-render: `onLocaleChange(cb)` → callback mỗi
// lần `setLocale()` gọi. Phaser scene attach listener trong create(), cleanup
// trong destroy/shutdown.

import { en } from './locales/en';
import { vi } from './locales/vi';
import {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    resolveLocale,
    type Locale,
    type TranslationParams,
    type TranslationTable,
} from './types';

const LOCALE_STORAGE_KEY = 'kageverse_locale';

// Bundle map — chỉ chứa locale có file dịch thật. Locale còn lại
// (zh-CN/zh-TW/ja/ko/th/de/fr/es/pt-BR) thiếu key sẽ fallback sang en
// trong t() (chain: current → en → raw key).
const tables: Partial<Record<Locale, TranslationTable>> = {
    en,
    vi,
};

let currentLocale: Locale = readInitialLocale();
const listeners = new Set<(locale: Locale) => void>();

function readInitialLocale(): Locale {
    try {
        const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) {
            return raw as Locale;
        }
    } catch {
        // localStorage có thể throw ở SSR / private mode — bỏ qua, dùng default.
    }
    return DEFAULT_LOCALE;
}

export function getLocale(): Locale {
    return currentLocale;
}

// Set locale từ user input (language picker) hoặc BE response (preferred_language).
// Persist localStorage để sticky qua reload + notify scene re-render.
export function setLocale(next: Locale | string | null | undefined): void {
    const resolved = resolveLocale(next ?? undefined);
    if (resolved === currentLocale) return;
    currentLocale = resolved;
    try {
        localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
    } catch {
        // Ignore — vẫn apply locale in-memory.
    }
    for (const cb of listeners) {
        try {
            cb(resolved);
        } catch (err) {
            console.error('[i18n] locale listener threw', err);
        }
    }
}

// Subscribe callback fire khi locale thay đổi. Trả unsubscribe function.
export function onLocaleChange(cb: (locale: Locale) => void): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

// Translate key → string theo locale hiện tại. Lookup chain:
//   1. tables[currentLocale][key] — bundle ngôn ngữ hiện chọn.
//   2. tables[DEFAULT_LOCALE][key] — fallback en nếu locale chưa có file dịch
//      (vd zh-CN/ja/ko/...) hoặc key thiếu trong bundle hiện tại.
//   3. Raw key + console.warn — visible bug để dev phát hiện key sót.
// Param interpolation: '{name}' replace bằng params.name. Param missing → giữ literal '{name}'.
export function t(key: string, params?: TranslationParams): string {
    const v = tOpt(key, params);
    if (v !== undefined) return v;
    console.warn(`[i18n] missing key: ${key}`);
    return key;
}

/**
 * Silent variant của t() — trả undefined khi không tìm thấy key, KHÔNG log
 * warn. Dùng cho pattern cascade qua nhiều namespace (vd quest target có thể
 * là monster/npc/item) — caller tự xử lý fallback, không spam console.
 */
export function tOpt(key: string, params?: TranslationParams): string | undefined {
    const localeTable = tables[currentLocale];
    const defaultTable = tables[DEFAULT_LOCALE];
    let template: string | undefined = localeTable?.[key];
    if (template === undefined) template = defaultTable?.[key];
    if (template === undefined) return undefined;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const v = params[name];
        return v === undefined ? match : String(v);
    });
}

// Apply translation cho mọi DOM element có `data-i18n="key"` attribute. Dùng
// sau khi load HTML template (vd Phaser DOMElement createFromCache). Element
// có `data-i18n-attr="placeholder"` sẽ set attribute thay vì textContent —
// phục vụ <input placeholder>.
export function applyDomTranslations(root: HTMLElement | null | undefined): void {
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('[data-i18n]');
    nodes.forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const text = t(key);
        const attr = el.getAttribute('data-i18n-attr');
        if (attr) {
            el.setAttribute(attr, text);
        } else {
            el.textContent = text;
        }
    });
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_DISPLAY_NAMES } from './types';
export type { Locale } from './types';
