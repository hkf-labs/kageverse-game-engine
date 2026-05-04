import type { TranslationTable } from '../types';

// Vietnamese translations — native default. Khi thêm key mới đảm bảo cũng thêm
// ở en.ts (fallback en sang vi nếu thiếu, nhưng nên đầy đủ).
export const vi: TranslationTable = {
    // Common buttons / actions
    'common.confirm': 'Xác nhận',
    'common.cancel': 'Huỷ',
    'common.close': 'Đóng',
    'common.loading': 'Đang tải...',
    'common.error': 'Đã xảy ra lỗi',

    // Auth — login screen
    'auth.login.title': 'CỔNG HỌC VIỆN',
    'auth.login.identifier_placeholder': 'Username hoặc Email',
    'auth.login.password_placeholder': 'Mật khẩu',
    'auth.login.submit': 'VÀO GAME',
    'auth.login.switch_to_register': 'Tập sự mới? Đăng ký.',
    'auth.login.in_progress': 'Đang đăng nhập...',
    'auth.login.failed': 'Đăng nhập thất bại',
    'auth.login.missing_fields': 'Nhập đủ username/email và mật khẩu.',
    'auth.login.session_restoring': 'Đang khôi phục phiên đăng nhập...',
    'auth.login.session_expired': 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',

    // Auth — register screen
    'auth.register.title': 'NHẬP HỌC',
    'auth.register.username_placeholder': 'Username',
    'auth.register.email_placeholder': 'Email',
    'auth.register.password_placeholder': 'Mật khẩu (tối thiểu 6)',
    'auth.register.country_label': 'Quốc gia (server gán ngôn ngữ)',
    'auth.register.country_loading': 'Đang tải...',
    'auth.register.country_loading_offline': '{code} — {lang} (offline)',
    'auth.register.submit': 'ĐĂNG KÝ',
    'auth.register.switch_to_login': 'Đã có tài khoản? Quay lại cổng.',
    'auth.register.in_progress': 'Đang đăng ký...',
    'auth.register.failed': 'Đăng ký thất bại',
    'auth.register.missing_fields': 'Điền đủ username, email và mật khẩu.',
    'auth.register.missing_country': 'Chọn quốc gia (hoặc đợi tải xong danh sách).',
    'auth.register.country_load_error': 'Không tải được danh sách quốc gia',

    // Language picker
    'auth.language.label': 'Ngôn ngữ',
    'auth.language.vi': 'Tiếng Việt',
    'auth.language.en': 'English',

    // Character — boot flow
    'character.bootstrap.checking': 'Đang kiểm tra nhân vật...',
};
