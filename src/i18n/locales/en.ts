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

    // Quest log panel
    'quest.log.title': '📜 Quest Log',
    'quest.log.loading': 'Loading...',
    'quest.log.error': 'Failed to load quests',
    'quest.log.tab_main': 'Main',
    'quest.log.tab_side': 'Side',
    'quest.log.tab_event': 'Events',
    'quest.log.event_coming_soon': 'Events coming soon.',
    'quest.log.empty_main': 'No main quests available.',
    'quest.log.empty_side': 'No side quests available.',
    'quest.log.next_label': '❗ Next —',
    'quest.log.next_meet': 'Talk to',
    'quest.log.unknown_npc': 'Unknown NPC',
    'quest.log.level_requirement': 'Reach level {level}',
    'quest.log.rewards_label': 'Rewards',
    'quest.log.reward_xp': '+{n} XP',
    'quest.log.reward_yen': '+{n} Yen',
    'quest.log.reward_coin': '+{n} Coin',
    'quest.log.reward_item': '+{n} {name}',
    'quest.log.status_active': 'In progress',
    'quest.log.status_completed': 'Ready to turn in',
    'quest.log.status_claimed': 'Completed',
    'quest.log.objective_kill_monster': 'Defeat',
    'quest.log.objective_talk_npc': 'Talk to',
    'quest.log.objective_collect_item': 'Collect',
    'quest.log.objective_use_item': 'Use',
    'quest.log.objective_buy_item': 'Buy',
    'quest.log.objective_equip_item': 'Equip',
    'quest.log.objective_visit_zone': 'Visit',
    'quest.log.objective_item_upgraded': 'Upgrade',

    // Character create
    'character.create.title': 'Create Character',
    'character.create.help': 'Display name is what other players see in-game (different from login username).',
    'character.create.display_name_label': 'Display Name',
    'character.create.display_name_placeholder': 'e.g. Shadow',
    'character.create.gender_label': 'Gender',
    'character.create.gender_male': 'Male',
    'character.create.gender_female': 'Female',
    'character.create.color_label': 'Primary Costume Color',
    'character.create.color_blue': 'Blue',
    'character.create.color_red': 'Red',
    'character.create.submit': 'Begin Journey',
    'character.create.in_progress': 'Creating character...',
    'character.create.failed': 'Failed to create character',
};
