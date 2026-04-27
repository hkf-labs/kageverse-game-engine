const ALPHANUM_RE = /^[a-zA-Z0-9]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;

export function validateUsername(s: string): string | null {
    if (!s) return 'Vui lòng nhập username.';
    if (s.length < USERNAME_MIN) return `Username phải có ít nhất ${USERNAME_MIN} ký tự.`;
    if (s.length > USERNAME_MAX) return `Username không quá ${USERNAME_MAX} ký tự.`;
    if (!ALPHANUM_RE.test(s)) return 'Username chỉ chứa chữ cái và chữ số (a-z, A-Z, 0-9).';
    return null;
}

export function validateLoginIdentifier(s: string): string | null {
    if (!s) return 'Vui lòng nhập username hoặc email.';
    if (s.includes('@')) {
        if (!EMAIL_RE.test(s)) return 'Email không hợp lệ.';
        return null;
    }
    return validateUsername(s);
}

export function validateDisplayName(s: string): string | null {
    if (!s) return 'Vui lòng nhập tên hiển thị.';
    if (s.length < DISPLAY_NAME_MIN) return `Tên hiển thị phải có ít nhất ${DISPLAY_NAME_MIN} ký tự.`;
    if (s.length > DISPLAY_NAME_MAX) return `Tên hiển thị không quá ${DISPLAY_NAME_MAX} ký tự.`;
    if (!ALPHANUM_RE.test(s)) return 'Tên hiển thị chỉ chứa chữ cái và chữ số (a-z, A-Z, 0-9).';
    return null;
}
