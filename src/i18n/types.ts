// Locale supported FE — subset của BE preferred_language list.
// MVP build vi + en. Locale BE trả về (de/fr/ja/ko/th) → fallback en.
export type Locale = 'vi' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['vi', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'vi';

// Resolve preferred_language từ BE → Locale FE support. Unsupported → fallback en
// (vi là native dev language; en là fallback global).
export function resolveLocale(preferred: string | undefined | null): Locale {
    if (!preferred) return DEFAULT_LOCALE;
    const lc = preferred.toLowerCase();
    if (lc === 'vi') return 'vi';
    // Mọi non-vi → en (de/fr/ja/ko/th BE accept nhưng FE chưa dịch).
    return 'en';
}

// Translation table — flat key→string. Nested namespace conventionally dùng `.`
// (vd 'auth.login.title'). FE giữ flat object để tránh deep lookup overhead.
export type TranslationTable = Record<string, string>;

// Param interpolation: t('greet', {name: 'Hari'}) với 'greet' = 'Hello {name}'.
export type TranslationParams = Record<string, string | number>;
