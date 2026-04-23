import * as Phaser from 'phaser';
import { authAPI } from '../../network/api';

export class AuthScene extends Phaser.Scene {
    private domElement?: Phaser.GameObjects.DOMElement;
    private statusText?: Phaser.GameObjects.Text;

    constructor() {
        super('AuthScene');
    }

    preload() {
        this.load.html('authForm', 'assets/html/auth_form.html');
    }

    create() {
        // Simple background
        this.cameras.main.setBackgroundColor('#1a1a2e');
        
        // Status Text (for errors or loading)
        this.statusText = this.add.text(400, 100, '', {
            fontSize: '16px',
            color: '#ff5555',
            align: 'center'
        }).setOrigin(0.5);

        // Add DOM Element
        this.domElement = this.add.dom(400, 300).createFromCache('authForm');
        
        // Ensure pointer events are captured correctly
        this.domElement.setInteractive();

        // Listen for clicks on the HTML form
        this.domElement.addListener('click');
        this.domElement.on('click', (event: any) => {
            if (event.target.id === 'switch-to-register') {
                this.toggleView('register');
            } else if (event.target.id === 'switch-to-login') {
                this.toggleView('login');
            } else if (event.target.id === 'btn-login') {
                this.handleLogin();
            } else if (event.target.id === 'btn-register') {
                this.handleRegister();
            }
        });
    }

    private toggleView(view: 'login' | 'register') {
        const loginView = this.domElement?.getChildByID('login-view') as HTMLElement;
        const registerView = this.domElement?.getChildByID('register-view') as HTMLElement;
        
        this.statusText?.setText('');

        if (view === 'login') {
            if (loginView) loginView.style.display = 'block';
            if (registerView) registerView.style.display = 'none';
        } else {
            if (loginView) loginView.style.display = 'none';
            if (registerView) registerView.style.display = 'block';
        }
    }

    private async handleLogin() {
        const identifierInput = this.domElement?.getChildByName('identifier') as HTMLInputElement;
        const passwordInput = this.domElement?.getChildByName('password') as HTMLInputElement;

        const identifier = identifierInput?.value;
        const password = passwordInput?.value;

        if (!identifier || !password) {
            this.statusText?.setText('Identifier and password are required');
            return;
        }

        try {
            this.statusText?.setText('Logging in...').setColor('#aaaaaa');
            const response = await authAPI.login({ identifier, password });
            
            // Store token
            if (response.access_token) {
                localStorage.setItem('kageverse_jwt', response.access_token);
                // Transition to MainScene
                this.scene.start('MainScene');
            }
        } catch (error: any) {
            this.statusText?.setText(error.message || 'Login Failed').setColor('#ff5555');
        }
    }

    private async handleRegister() {
        const usernameInput = this.domElement?.getChildByName('reg-username') as HTMLInputElement;
        const emailInput = this.domElement?.getChildByName('reg-email') as HTMLInputElement;
        const passwordInput = this.domElement?.getChildByName('reg-password') as HTMLInputElement;

        const username = usernameInput?.value;
        const email = emailInput?.value;
        const password = passwordInput?.value;

        if (!username || !email || !password) {
            this.statusText?.setText('All fields are required');
            return;
        }

        try {
            this.statusText?.setText('Registering...').setColor('#aaaaaa');
            const response = await authAPI.register({ username, email, password });
            
            // On successful registration, typically we automatically log in or switch view
            if (response.access_token) {
                localStorage.setItem('kageverse_jwt', response.access_token);
                this.scene.start('MainScene');
            }
        } catch (error: any) {
            this.statusText?.setText(error.message || 'Registration Failed').setColor('#ff5555');
        }
    }
}
