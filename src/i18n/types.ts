// Locale codes hệ thống công nhận. MVP build bundle vi + en, các locale còn lại
// (zh-CN/zh-TW/ja/ko/th/de/fr/es/pt-BR) là placeholder hiển thị trong Settings —
// fallback en cho mọi key chưa dịch.
//
// BE supported_countries hiện map: VN→vi, US/GB/SG/AU/CA→en, DE→de, FR→fr,
// JP→ja, KR→ko, TH→th. Khi user đăng ký BE infer preferred_language từ country
// code → FE setLocale runtime.
export type Locale =
    | 'en'
    | 'vi'
    | 'zh-CN'
    | 'zh-TW'
    | 'ja'
    | 'ko'
    | 'th'
    | 'de'
    | 'fr'
    | 'es'
    | 'pt-BR';

export const SUPPORTED_LOCALES: readonly Locale[] = [
    'en',
    'vi',
    'zh-CN',
    'zh-TW',
    'ja',
    'ko',
    'th',
    'de',
    'fr',
    'es',
    'pt-BR',
] as const;

export const DEFAULT_LOCALE: Locale = 'en';

// Native names cho language picker — luôn hiển thị tên mỗi ngôn ngữ bằng
// chính ngôn ngữ đó (UX standard, người dùng nhận ra ngôn ngữ "của mình"
// dù app hiện đang dùng locale khác).
export const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
    en: 'English',
    vi: 'Tiếng Việt',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    ja: '日本語',
    ko: '한국어',
    th: 'ไทย',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    'pt-BR': 'Português (Brasil)',
};

// resolveLocale chuẩn hoá raw locale code (BE preferred_language hoặc
// localStorage cached) → Locale FE accept. Unknown code → default ('en').
export function resolveLocale(preferred: string | undefined | null): Locale {
    if (!preferred) return DEFAULT_LOCALE;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(preferred)) {
        return preferred as Locale;
    }
    // BE chỉ trả ngắn (vi/en/de/fr/ja/ko/th) — đã match SUPPORTED_LOCALES.
    // Future: BE thêm zh-CN / es / pt-BR sẽ pass-through.
    return DEFAULT_LOCALE;
}

// Translation table — flat key→string. Nested namespace conventionally dùng `.`
// (vd 'auth.login.title'). FE giữ flat object để tránh deep lookup overhead.
export type TranslationTable = Record<string, string>;

// Param interpolation: t('greet', {name: 'Hari'}) với 'greet' = 'Hello {name}'.
export type TranslationParams = Record<string, string | number>;
