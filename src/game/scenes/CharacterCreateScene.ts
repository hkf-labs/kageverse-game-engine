import * as Phaser from 'phaser';
import { charactersAPI } from '../../network/api';

/** Scene tạo nhân vật (sau đăng nhập khi còn slot). */
export class CharacterCreateScene extends Phaser.Scene {
    private domElement?: Phaser.GameObjects.DOMElement;
    private statusText?: Phaser.GameObjects.Text;
    private selectedGender: 'male' | 'female' = 'male';
    private selectedColor: 'blue' | 'red' = 'blue';

    constructor() {
        super('CharacterCreateScene');
    }

    preload() {
        this.load.html('characterCreateForm', 'assets/html/character_create.html');
    }

    create() {
        if (!localStorage.getItem('kageverse_jwt')) {
            this.scene.start('AuthScene');
            return;
        }

        this.cameras.main.setBackgroundColor('#1a1a2e');

        this.statusText = this.add.text(400, 70, '', {
            fontSize: '14px',
            color: '#ff6b6b',
            align: 'center',
            wordWrap: { width: 520 },
        }).setOrigin(0.5);

        this.domElement = this.add.dom(400, 320).createFromCache('characterCreateForm');
        this.domElement.setOrigin(0.5, 0.5);
        this.domElement.setInteractive();
        this.domElement.addListener('click');
        this.domElement.on('click', (event: Event) => {
            const raw = event.target;
            if (!(raw instanceof Element)) return;
            const card = raw.closest('[data-gender]') as HTMLElement | null;
            if (card?.dataset.gender === 'male' || card?.dataset.gender === 'female') {
                this.selectedGender = card.dataset.gender as 'male' | 'female';
                this.refreshGenderStyles();
                return;
            }
            const colorBtn = raw.closest('[data-color]') as HTMLElement | null;
            if (colorBtn?.dataset.color === 'blue' || colorBtn?.dataset.color === 'red') {
                this.selectedColor = colorBtn.dataset.color as 'blue' | 'red';
                this.refreshColorStyles();
                return;
            }
            if (raw instanceof HTMLElement && raw.id === 'btn-create-character') {
                void this.submit();
            }
        });

        this.refreshGenderStyles();
        this.refreshColorStyles();
    }

    private refreshGenderStyles() {
        const root = this.domElement?.node as HTMLElement | undefined;
        if (!root) return;
        root.querySelectorAll('[data-gender]').forEach((el) => {
            const h = el as HTMLElement;
            const g = h.dataset.gender;
            const on = g === this.selectedGender;
            h.style.borderColor = on ? '#6ab0ff' : '#333';
            h.style.boxShadow = on ? '0 0 12px rgba(106,176,255,0.35)' : 'none';
        });
    }

    private refreshColorStyles() {
        const root = this.domElement?.node as HTMLElement | undefined;
        if (!root) return;
        root.querySelectorAll('[data-color]').forEach((el) => {
            const h = el as HTMLElement;
            const c = h.dataset.color;
            const on = c === this.selectedColor;
            h.style.opacity = on ? '1' : '0.55';
            h.style.outline = on ? '2px solid #fff' : 'none';
        });
    }

    private async submit() {
        const input = this.domElement?.getChildByName('char-display-name') as HTMLInputElement;
        const displayName = (input?.value || '').trim();
        if (displayName.length < 2) {
            this.statusText?.setText('Tên hiển thị cần ít nhất 2 ký tự.');
            return;
        }

        try {
            this.statusText?.setText('Đang tạo nhân vật...').setColor('#aaa');
            await charactersAPI.create({
                display_name: displayName,
                gender: this.selectedGender,
                costume_primary_color: this.selectedColor,
            });
            this.statusText?.setText('');
            this.scene.start('MainScene');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Tạo nhân vật thất bại';
            this.statusText?.setText(msg).setColor('#ff6b6b');
        }
    }
}
