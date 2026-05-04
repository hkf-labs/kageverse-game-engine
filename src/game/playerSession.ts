import type { CharacterDTO } from '../network/api';
import { setLocale } from '../i18n';

const CURRENT_CHARACTER_KEY = 'kageverse_current_character';
const USER_PREFS_KEY = 'kageverse_user_prefs';

export type CurrentCharacter = {
    id: string;
    displayName: string;
    gender?: string;
    costumePrimaryColor?: string;
};

export function saveCurrentCharacter(character: CharacterDTO) {
    const payload: CurrentCharacter = {
        id: character.id,
        displayName: character.display_name,
        gender: character.gender,
        costumePrimaryColor: character.costume_primary_color,
    };
    localStorage.setItem(CURRENT_CHARACTER_KEY, JSON.stringify(payload));
}

export function getCurrentCharacter(): CurrentCharacter | null {
    const raw = localStorage.getItem(CURRENT_CHARACTER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as CurrentCharacter;
    } catch {
        return null;
    }
}

// UserPrefs gom các thuộc tính BE-driven cần cache local + apply runtime.
// preferredLanguage là source of truth cho UI locale — set lúc register
// (BE infer từ country_code) và cập nhật mỗi lần login (đề phòng user đổi
// nationality về sau qua admin panel).
export type UserPrefs = {
    preferredLanguage: string;
    countryCode?: string;
};

// saveUserPrefs persist + immediately apply locale → mọi scene đăng ký
// onLocaleChange sẽ re-render. Gọi từ AuthScene sau register/login response.
export function saveUserPrefs(prefs: UserPrefs): void {
    try {
        localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
        // Ignore — non-fatal, locale vẫn áp in-memory qua setLocale dưới.
    }
    setLocale(prefs.preferredLanguage);
}

export function getUserPrefs(): UserPrefs | null {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as UserPrefs;
    } catch {
        return null;
    }
}

// clearUserPrefs gọi khi logout — xoá cache nhưng giữ locale hiện tại
// (tôn trọng manual override qua language picker pre-login).
export function clearUserPrefs(): void {
    localStorage.removeItem(USER_PREFS_KEY);
}
