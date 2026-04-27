import * as Phaser from 'phaser';
import { authAPI, charactersAPI } from '../../network/api';
import { saveCurrentCharacter } from '../playerSession';

const FIRST_MAP_ONBOARDING_DONE_KEY = 'kageverse_first_map_onboarding_done';

export class AuthScene extends Phaser.Scene {
    private domElement?: Phaser.GameObjects.DOMElement;
    private statusText?: Phaser.GameObjects.Text;
    private countriesLoaded = false;

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
        const hasSession = Boolean(localStorage.getItem('kageverse_jwt'));

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
        }

        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        if (hasSession) {
            void this.bootstrapSession();
        }
    }

    private async bootstrapSession() {
        const token = localStorage.getItem('kageverse_jwt');
        if (!token) return;

        try {
            if (this.statusText?.active) {
                this.statusText.setText('Đang khôi phục phiên đăng nhập...').setColor('#aaaaaa');
            }
            await this.goToGameOrCharacterCreate();
        } catch {
            // Token có thể hết hạn/không hợp lệ
            localStorage.removeItem('kageverse_jwt');
            localStorage.removeItem('kageverse_refresh');
            if (this.statusText && this.statusText.active) {
                this.statusText.setText('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.').setColor('#ff5555');
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
        loading.textContent = 'Đang tải danh sách...';
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
                    o.textContent = `${r.country_code} — ${r.preferred_language}`;
                    select.appendChild(o);
                }
            }
            this.countriesLoaded = true;
        } catch {
            select.innerHTML = '';
            const o = document.createElement('option');
            o.value = 'VN';
            o.textContent = 'VN — vi (offline)';
            select.appendChild(o);
            this.countriesLoaded = true;
        }
    }

    private async goToGameOrCharacterCreate() {
        try {
            if (this.statusText?.active) this.statusText.setText('Đang kiểm tra nhân vật...').setColor('#aaaaaa');
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
                this.scene.start('VillageScene');
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
            if (this.statusText?.active) this.statusText.setText('Nhập đủ username/email và mật khẩu.');
            return;
        }

        try {
            if (this.statusText?.active) this.statusText.setText('Đang đăng nhập...').setColor('#aaaaaa');
            const response = await authAPI.login({ identifier, password });

            if (response.access_token) {
                localStorage.setItem('kageverse_jwt', response.access_token);
                if (response.refresh_token) {
                    localStorage.setItem('kageverse_refresh', response.refresh_token);
                }
                await this.goToGameOrCharacterCreate();
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Đăng nhập thất bại';
            if (this.statusText?.active) this.statusText.setText(msg).setColor('#ff5555');
        }
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
            if (this.statusText?.active) this.statusText.setText('Điền đủ username, email và mật khẩu.');
            return;
        }
        if (!country_code) {
            if (this.statusText?.active) this.statusText.setText('Chọn quốc gia (hoặc đợi tải xong danh sách).');
            return;
        }

        try {
            if (this.statusText?.active) this.statusText.setText('Đang đăng ký...').setColor('#aaaaaa');
            const response = await authAPI.register({ username, email, password, country_code });

            if (response.access_token) {
                localStorage.setItem('kageverse_jwt', response.access_token);
                if (response.refresh_token) {
                    localStorage.setItem('kageverse_refresh', response.refresh_token);
                }
                await this.goToGameOrCharacterCreate();
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Đăng ký thất bại';
            if (this.statusText?.active) this.statusText.setText(msg).setColor('#ff5555');
        }
    }
}
