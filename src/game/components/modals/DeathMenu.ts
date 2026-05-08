import * as Phaser from 'phaser';
import { t } from '../../../i18n';
import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';

export type DeathChoice = 'respawn_village' | 'respawn_here' | 'spectate';

interface DeathMenuCallbacks {
    onChoice: (choice: DeathChoice) => void;
}

/**
 * "Kiệt sức" overlay khi character chết:
 *   stage='button' — chỉ nút Kiệt sức (Enter để mở menu).
 *   stage='menu'   — 3 nút: Quay về | Hồi sinh tại chỗ | Đóng.
 *   stage='hidden' — đóng (player chọn Đóng → chuyển spectating, Enter mở lại).
 */
export class DeathMenu extends BaseModal {
    private stage: 'hidden' | 'button' | 'menu' = 'hidden';
    private callbacks: DeathMenuCallbacks;

    constructor(scene: Phaser.Scene, callbacks: DeathMenuCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-death',
            layer: 'cinematic',
            panelStyle: 'cinematic',
            // No close button / status; click backdrop = no-op (player phải
            // chọn 1 trong các option).
        };
    }

    protected populateShell(shell: ModalShell): void {
        // Tăng độ tối backdrop so với default (death = blocking event).
        shell.overlay.style.background = 'rgba(0,0,0,0.65)';
        // Body content render lazy ở showKietSucButton / showOptions.
    }

    protected teardownShell(): void {
        super.teardownShell();
        this.stage = 'hidden';
    }

    /** Override — DeathMenu dùng `stage` thay cho `visible` flag. */
    isOpen(): boolean { return this.stage !== 'hidden'; }
    getStage(): 'hidden' | 'button' | 'menu' { return this.stage; }

    showKietSucButton(): void {
        const shell = this.ensureShell();
        if (!shell) return;
        this.stage = 'button';
        shell.body.innerHTML = '';

        const banner = document.createElement('div');
        banner.style.cssText = 'font-size:34px;font-weight:bold;color:#ff8a8a;text-shadow:0 0 12px rgba(255,138,138,0.6),2px 2px 0 #000;letter-spacing:4px;';
        banner.textContent = t('death.banner');
        shell.body.appendChild(banner);

        const btn = this.makeButton(t('death.btn_collapsed'), '#7a3a3a', '#ff8a8a', () => this.showOptions());
        btn.style.fontSize = '20px';
        btn.style.padding = '14px 36px';
        shell.body.appendChild(btn);

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:#aaa;margin-top:6px;';
        hint.textContent = t('death.hint_press_enter');
        shell.body.appendChild(hint);
    }

    showOptions(): void {
        const shell = this.ensureShell();
        if (!shell) return;
        this.stage = 'menu';
        shell.body.innerHTML = '';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:24px;font-weight:bold;color:#ffea7a;letter-spacing:2px;';
        title.textContent = t('death.options_title');
        shell.body.appendChild(title);

        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:6px;';
        sub.textContent = t('death.choose_recovery');
        shell.body.appendChild(sub);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;';
        shell.body.appendChild(btnRow);

        btnRow.appendChild(this.makeButton(t('death.btn_respawn_village'), '#4a7a3a', '#bdf0a0', () => this.callbacks.onChoice('respawn_village')));
        btnRow.appendChild(this.makeButton(t('death.btn_respawn_here'), '#7a6a2a', '#ffd070', () => this.callbacks.onChoice('respawn_here'), true));
        btnRow.appendChild(this.makeButton(t('death.btn_spectate'), '#444', '#aaa', () => this.callbacks.onChoice('spectate')));

        const note = document.createElement('div');
        note.style.cssText = 'font-size:11px;color:#888;margin-top:6px;';
        note.textContent = t('death.note');
        shell.body.appendChild(note);
    }

    hide(): void {
        this.teardownShell();
    }

    private makeButton(label: string, borderColor: string, textColor: string, onClick: () => void, disabled: boolean = false): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.disabled = disabled;
        btn.style.cssText = `
            padding: 10px 20px; min-width: 140px;
            border-radius: 8px; border: 2px solid ${borderColor};
            background: rgba(20,12,4,0.85); color: ${textColor};
            font-size: 14px; font-weight: bold;
            font-family: system-ui, sans-serif;
            cursor: ${disabled ? 'not-allowed' : 'pointer'};
            opacity: ${disabled ? '0.5' : '1'};
            transition: transform 0.1s, box-shadow 0.1s;
        `;
        if (!disabled) {
            btn.addEventListener('mouseenter', () => {
                btn.style.boxShadow = `0 0 12px ${textColor}55`;
                btn.style.transform = 'translateY(-2px)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.boxShadow = 'none';
                btn.style.transform = 'translateY(0)';
            });
            btn.addEventListener('click', onClick);
        }
        return btn;
    }
}
