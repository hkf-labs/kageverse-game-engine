import type { TranslationTable } from '../types';

// English translations — fallback locale cho user country ngoài VN. Đảm bảo
// đồng bộ với vi.ts mỗi khi thêm key mới.
export const en: TranslationTable = {
    // Common buttons / actions
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',

    // Auth — login screen
    'auth.login.title': 'ACADEMY GATES',
    'auth.login.identifier_placeholder': 'Username or Email',
    'auth.login.password_placeholder': 'Password',
    'auth.login.submit': 'ENTER GAME',
    'auth.login.switch_to_register': 'New apprentice? Register.',
    'auth.login.in_progress': 'Signing in...',
    'auth.login.failed': 'Login failed',
    'auth.login.missing_fields': 'Enter username/email and password.',
    'auth.login.session_restoring': 'Restoring session...',
    'auth.login.session_expired': 'Session expired, please sign in again.',

    // Auth — register screen
    'auth.register.title': 'ENROLLMENT',
    'auth.register.username_placeholder': 'Username',
    'auth.register.email_placeholder': 'Email',
    'auth.register.password_placeholder': 'Password (min 6)',
    'auth.register.country_label': 'Country (server-assigned language)',
    'auth.register.country_loading': 'Loading...',
    'auth.register.country_loading_offline': '{code} — {lang} (offline)',
    'auth.register.submit': 'REGISTER',
    'auth.register.switch_to_login': 'Have an account? Back to gate.',
    'auth.register.in_progress': 'Registering...',
    'auth.register.failed': 'Registration failed',
    'auth.register.missing_fields': 'Fill in username, email, and password.',
    'auth.register.missing_country': 'Pick a country (or wait for list to load).',
    'auth.register.country_load_error': 'Failed to load country list',

    // Language picker
    'auth.language.label': 'Language',
    'auth.language.vi': 'Tiếng Việt',
    'auth.language.en': 'English',

    // Character — boot flow
    'character.bootstrap.checking': 'Checking character...',
};
