import { t } from '../i18n';

const ALPHANUM_RE = /^[a-zA-Z0-9]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;

export function validateUsername(s: string): string | null {
    if (!s) return t('validation.username_required');
    if (s.length < USERNAME_MIN) return t('validation.username_too_short', { n: USERNAME_MIN });
    if (s.length > USERNAME_MAX) return t('validation.username_too_long', { n: USERNAME_MAX });
    if (!ALPHANUM_RE.test(s)) return t('validation.username_alphanum');
    return null;
}

export function validateLoginIdentifier(s: string): string | null {
    if (!s) return t('validation.identifier_required');
    if (s.includes('@')) {
        if (!EMAIL_RE.test(s)) return t('validation.email_invalid');
        return null;
    }
    return validateUsername(s);
}

export function validateDisplayName(s: string): string | null {
    if (!s) return t('validation.display_name_required');
    if (s.length < DISPLAY_NAME_MIN) return t('validation.display_name_too_short', { n: DISPLAY_NAME_MIN });
    if (s.length > DISPLAY_NAME_MAX) return t('validation.display_name_too_long', { n: DISPLAY_NAME_MAX });
    if (!ALPHANUM_RE.test(s)) return t('validation.display_name_alphanum');
    return null;
}
