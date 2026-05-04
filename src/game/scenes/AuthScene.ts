import * as Phaser from 'phaser';
import { authAPI, charactersAPI, clearTokens, getAccessToken, setTokens } from '../../network/api';
import { validateLoginIdentifier, validateUsername } from '../../lib/validation';
import { resolveSceneKeyForMap } from '../maps/registry';
import { saveCurrentCharacter, saveUserPrefs } from '../playerSession';
import { applyDomTranslations, getLocale, onLocaleChange, setLocale, t } from '../../i18n';

const FIRST_MAP_ONBOARDING_DONE_KEY = 'kageverse_first_map_onboarding_done';

export class AuthScene extends Phaser.Scene {
    private domElement?: Phaser.GameObjects.DOMElement;
    private statusText?: Phaser.GameObjects.Text;
    private countriesLoaded = false;
    private localeUnsub?: () => void;

    constructor() {
        super('AuthScene');
    }

    preload() {
        this.load.html('authForm', 'assets/html/auth_form.html');
    }

    create() {
        this.cameras.main.setBackgroundColor('#1a1a2e');
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const hasSession = Boolean(getAccessToken());

        this.statusText = this.add.text(centerX, centerY - 200, '', {
            fontSize: '14px',
            color: '#ff5555',
            align: 'center',
            wordWrap: { width: 520 },
        }).setOrigin(0.5);

        if (!hasSession) {
            this.domElement = this.add.dom(centerX, centerY).createFromCache('authForm');
            this.domElement.setInteractive();
            this.domElement.addListener('click');
            this.domElement.on('click', (event: Event) => {
                const target = event.target as HTMLElement;
                if (target.id === 'switch-to-register') {
                    void this.toggleView('register');
                } else if (target.id === 'switch-to-login') {
                    void this.toggleView('login');
                } else if (target.id === 'btn-login') {
                    void this.handleLogin();
                } else if (target.id === 'btn-register') {
                    void this.handleRegister();
                }
            });
            this.applyTranslations();
            this.bindLocalePicker();
            // Re-apply translations khi locale đổi runtime (vd post-login BE
            // response setLocale, hoặc user đổi language picker tay).
            this.localeUnsub = onLocaleChange(() => this.applyTranslations());
        }

        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
        if (hasSession) {
            void this.bootstrapSession();
        }
    }

    private cleanup() {
        this.localeUnsub?.();
        this.localeUnsub = undefined;
    }

    // applyTranslations walk DOM cây auth form replace data-i18n elements.
    // Sync select#auth-locale với locale hiện tại để tránh drift sau setLocale.
    private applyTranslations() {
        const root = this.domElement?.node as HTMLElement | undefined;
        applyDomTranslations(root);
        const localeSelect = this.domElement?.getChildByID('auth-locale') as HTMLSelectElement | null;
        if (localeSelect) {
            localeSelect.value = getLocale();
        }
        // Status text re-render nếu đang hiển thị key (best-effort: không track raw key →
        // chỉ clear nếu locale changed AND text khớp 1 trong các key prompt — skip MVP).
    }

    private bindLocalePicker() {
        const select = this.domElement?.getChildByID('auth-locale') as HTMLSelectElement | null;
        if (!select) return;
        select.value = getLocale();
        select.addEventListener('change', () => {
            setLocale(select.value);
        });
    }

    private async bootstrapSession() {
        if (!getAccessToken()) return;

        try {
            if (this.statusText?.active) {
                this.statusText.setText(t('auth.login.session_restoring')).setColor('#aaaaaa');
            }
            await this.goToGameOrCharacterCreate();
        } catch {
            clearTokens();
            if (this.statusText && this.statusText.active) {
                this.statusText.setText(t('auth.login.session_expired')).setColor('#ff5555');
            }
        }
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        const centerX = gameSize.width / 2;
        const centerY = gameSize.height / 2;
        this.statusText?.setPosition(centerX, centerY - 200);
        this.domElement?.setPosition(centerX, centerY);
    }

    private async toggleView(view: 'login' | 'register') {
        const loginView = this.domElement?.getChildByID('login-view') as HTMLElement;
        const registerView = this.domElement?.getChildByID('register-view') as HTMLElement;

        this.statusText?.setText('');

        if (view === 'login') {
            if (loginView) loginView.style.display = 'block';
            if (registerView) registerView.style.display = 'none';
        } else {
            if (loginView) loginView.style.display = 'none';
            if (registerView) registerView.style.display = 'block';
            await this.ensureCountriesLoaded();
        }
    }

    private async ensureCountriesLoaded() {
        if (this.countriesLoaded) return;
        const select = this.domElement?.getChildByID('reg-country-code') as HTMLSelectElement;
        if (!select) return;

        select.innerHTML = '';
        const loading = document.createElement('option');
        loading.value = '';
        loading.textContent = t('common.loading');
        select.appendChild(loading);

        try {
            const rows = await authAPI.supportedCountries();
            select.innerHTML = '';
            if (rows.length === 0) {
                const o = document.createElement('option');
                o.value = 'VN';
                o.textContent = 'VN — vi';
                select.appendChild(o);
            } else {
                for (const r of rows) {
                    const o = document.createElement('option');
                    o.value = r.country_code;
                    // Country code + lang code là technical identifiers; không
                    // dịch — show as-is để user nhìn thấy chính xác giá trị BE.
                    o.textContent = `${r.country_code} — ${r.preferred_language}`;
                    select.appendChild(o);
                }
            }
            this.countriesLoaded = true;
        } catch {
            select.innerHTML = '';
            const o = document.createElement('option');
            o.value = 'VN';
            o.textContent = t('auth.register.country_loading_offline', { code: 'VN', lang: 'vi' });
            select.appendChild(o);
            this.countriesLoaded = true;
        }
    }

    private async goToGameOrCharacterCreate() {
        try {
            if (this.statusText?.active) this.statusText.setText(t('character.bootstrap.checking')).setColor('#aaaaaa');
            const list = await charactersAPI.list();
            const max = list.max_characters_per_user ?? 1;
            
            if (this.statusText?.active) this.statusText.setText('');
            
            if (list.characters.length === 0) {
                localStorage.removeItem(FIRST_MAP_ONBOARDING_DONE_KEY);
                this.scene.start('CharacterCreateScene');
                return;
            }
            saveCurrentCharacter(list.characters[0]);

            const onboardingDone = localStorage.getItem(FIRST_MAP_ONBOARDING_DONE_KEY) === 'true';
            if (!onboardingDone) {
                this.scene.start(resolveSceneKeyForMap(list.characters[0].last_map_id));
                return;
            }

            if (list.characters.length >= max) {
                this.scene.start('MainScene');
            } else {
                this.scene.start('CharacterCreateScene');
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : '';
            if (msg.includes('auth.error.unauthorized')) {
                throw error;
            }
            if (this.statusText?.active) {
                this.statusText.setText('Không gọi được API nhân vật — vào game thử (kiểm tra server).').setColor('#ffaa00');
            }
            this.scene.start('MainScene');
        }
    }

    private async handleLogin() {
        const identifierInput = this.domElement?.getChildByName('identifier') as HTMLInputElement;
        const passwordInput = this.domElement?.getChildByName('password') as HTMLInputElement;

        const identifier = identifierInput?.value?.trim();
        const password = passwordInput?.value;

        if (!identifier || !password) {
            if (this.statusText?.active) this.statusText.setText(t('auth.login.missing_fields'));
            return;
        }
        const identifierError = validateLoginIdentifier(identifier);
        if (identifierError) {
            if (this.statusText?.active) this.statusText.setText(identifierError).setColor('#ff5555');
            return;
        }

        try {
            if (this.statusText?.active) this.statusText.setText(t('auth.login.in_progress')).setColor('#aaaaaa');
            const response = await authAPI.login({ identifier, password });

            if (response.access_token) {
                setTokens(response.access_token, response.refresh_token);
                this.applyUserPrefsFromResponse(response.user);
                await this.goToGameOrCharacterCreate();
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : t('auth.login.failed');
            if (this.statusText?.active) this.statusText.setText(msg).setColor('#ff5555');
        }
    }

    // Đọc preferred_language + country_code từ user response BE → persist +
    // setLocale runtime. Defensive: BE có thể không trả field nếu legacy
    // user (account cũ tạo trước migration) — fallback to current locale.
    private applyUserPrefsFromResponse(user: Record<string, unknown> | undefined) {
        if (!user || typeof user !== 'object') return;
        const preferredLanguage = typeof user.preferred_language === 'string' ? user.preferred_language : '';
        const countryCode = typeof user.country_code === 'string' ? user.country_code : undefined;
        if (!preferredLanguage) return;
        saveUserPrefs({ preferredLanguage, countryCode });
    }

    private async handleRegister() {
        const usernameInput = this.domElement?.getChildByName('reg-username') as HTMLInputElement;
        const emailInput = this.domElement?.getChildByName('reg-email') as HTMLInputElement;
        const passwordInput = this.domElement?.getChildByName('reg-password') as HTMLInputElement;
        const countrySelect = this.domElement?.getChildByID('reg-country-code') as HTMLSelectElement;

        const username = usernameInput?.value?.trim();
        const email = emailInput?.value?.trim();
        const password = passwordInput?.value;
        const country_code = countrySelect?.value?.trim().toUpperCase();

        if (!username || !email || !password) {
            if (this.statusText?.active) this.statusText.setText(t('auth.register.missing_fields'));
            return;
        }
        const usernameError = validateUsername(username);
        if (usernameError) {
            if (this.statusText?.active) this.statusText.setText(usernameError).setColor('#ff5555');
            return;
        }
        if (!country_code) {
            if (this.statusText?.active) this.statusText.setText(t('auth.register.missing_country'));
            return;
        }

        try {
            if (this.statusText?.active) this.statusText.setText(t('auth.register.in_progress')).setColor('#aaaaaa');
            const response = await authAPI.register({ username, email, password, country_code });

            if (response.access_token) {
                setTokens(response.access_token, response.refresh_token);
                this.applyUserPrefsFromResponse(response.user);
                await this.goToGameOrCharacterCreate();
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : t('auth.register.failed');
            if (this.statusText?.active) this.statusText.setText(msg).setColor('#ff5555');
        }
    }
}
