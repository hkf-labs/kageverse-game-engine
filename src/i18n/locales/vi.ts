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

    // Quest log panel
    'quest.log.title': '📜 Nhật ký Nhiệm vụ',
    'quest.log.loading': 'Đang tải...',
    'quest.log.error': 'Lỗi tải nhiệm vụ',
    'quest.log.tab_main': 'Chính tuyến',
    'quest.log.tab_side': 'Phụ tuyến',
    'quest.log.tab_event': 'Sự kiện',
    'quest.log.event_coming_soon': 'Sự kiện sắp ra mắt.',
    'quest.log.empty_main': 'Chưa có nhiệm vụ chính tuyến nào khả dụng.',
    'quest.log.empty_side': 'Chưa có nhiệm vụ phụ tuyến nào khả dụng.',
    'quest.log.next_label': '❗ Tiếp theo —',
    'quest.log.next_meet': 'Đến gặp',
    'quest.log.unknown_npc': 'NPC chưa rõ',
    'quest.log.level_requirement': 'Trình độ đạt cấp {level}',
    'quest.log.rewards_label': 'Thưởng',
    'quest.log.reward_xp': '+{n} XP',
    'quest.log.reward_yen': '+{n} Yên',
    'quest.log.reward_coin': '+{n} Xu',
    'quest.log.reward_item': '+{n} {name}',
    'quest.log.status_active': 'Đang làm',
    'quest.log.status_completed': 'Hoàn thành — chờ trả',
    'quest.log.status_claimed': 'Đã trả',
    'quest.log.objective_kill_monster': 'Diệt',
    'quest.log.objective_talk_npc': 'Gặp',
    'quest.log.objective_collect_item': 'Thu thập',
    'quest.log.objective_use_item': 'Sử dụng',
    'quest.log.objective_buy_item': 'Mua',
    'quest.log.objective_equip_item': 'Trang bị',
    'quest.log.objective_visit_zone': 'Đến',
    'quest.log.objective_item_upgraded': 'Cường hoá',

    // Character create
    'character.create.title': 'Tạo nhân vật',
    'character.create.help': 'Tên hiển thị là tên người chơi khác thấy trong game (khác username đăng nhập).',
    'character.create.display_name_label': 'Tên hiển thị',
    'character.create.display_name_placeholder': 'Ví dụ: Hạ Ảnh',
    'character.create.gender_label': 'Giới tính',
    'character.create.gender_male': 'Nam',
    'character.create.gender_female': 'Nữ',
    'character.create.color_label': 'Màu trang phục chủ đạo',
    'character.create.color_blue': 'Xanh',
    'character.create.color_red': 'Đỏ',
    'character.create.submit': 'Bắt đầu hành trình',
    'character.create.in_progress': 'Đang tạo nhân vật...',
    'character.create.failed': 'Tạo nhân vật thất bại',
};
