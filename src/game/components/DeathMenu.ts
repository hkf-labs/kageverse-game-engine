import * as Phaser from 'phaser';
import type { GameComponent } from './types';

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
export class DeathMenu implements GameComponent {
    private overlay?: HTMLDivElement;
    private centerEl?: HTMLDivElement;
    private stage: 'hidden' | 'button' | 'menu' = 'hidden';
    private scene: Phaser.Scene;
    private callbacks: DeathMenuCallbacks;

    constructor(scene: Phaser.Scene, callbacks: DeathMenuCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;
    }

    create(): void {
        const parent = this.scene.game.canvas.parentElement;
        if (!parent) return;

        const overlay = document.createElement('div');
        overlay.classList.add('kageverse-overlay', 'kageverse-overlay-death');
        Object.assign(overlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.65)',
            zIndex: '250', display: 'none',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
        });
        parent.style.position = 'relative';
        parent.appendChild(overlay);

        const center = document.createElement('div');
        center.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:14px;';
        overlay.appendChild(center);

        this.overlay = overlay;
        this.centerEl = center;
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    isOpen(): boolean { return this.stage !== 'hidden'; }
    getStage(): 'hidden' | 'button' | 'menu' { return this.stage; }

    showKietSucButton(): void {
        if (!this.overlay || !this.centerEl) return;
        this.stage = 'button';
        this.overlay.style.display = 'flex';
        this.centerEl.innerHTML = '';

        const banner = document.createElement('div');
        banner.style.cssText = 'font-size:34px;font-weight:bold;color:#ff8a8a;text-shadow:0 0 12px rgba(255,138,138,0.6),2px 2px 0 #000;letter-spacing:4px;';
        banner.textContent = '☠️ BẠN ĐÃ GỤC';
        this.centerEl.appendChild(banner);

        const btn = this.makeButton('Kiệt sức', '#7a3a3a', '#ff8a8a', () => this.showOptions());
        btn.style.fontSize = '20px';
        btn.style.padding = '14px 36px';
        this.centerEl.appendChild(btn);

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:#aaa;margin-top:6px;';
        hint.textContent = 'Nhấn Enter để mở menu';
        this.centerEl.appendChild(hint);
    }

    showOptions(): void {
        if (!this.overlay || !this.centerEl) return;
        this.stage = 'menu';
        this.overlay.style.display = 'flex';
        this.centerEl.innerHTML = '';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:24px;font-weight:bold;color:#ffea7a;letter-spacing:2px;';
        title.textContent = 'KIỆT SỨC';
        this.centerEl.appendChild(title);

        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:6px;';
        sub.textContent = 'Chọn cách hồi phục:';
        this.centerEl.appendChild(sub);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;';
        this.centerEl.appendChild(btnRow);

        btnRow.appendChild(this.makeButton('🏠 Quay về', '#4a7a3a', '#bdf0a0', () => this.callbacks.onChoice('respawn_village')));
        btnRow.appendChild(this.makeButton('💎 Hồi sinh tại chỗ', '#7a6a2a', '#ffd070', () => this.callbacks.onChoice('respawn_here'), true));
        btnRow.appendChild(this.makeButton('👁 Đóng', '#444', '#aaa', () => this.callbacks.onChoice('spectate')));

        const note = document.createElement('div');
        note.style.cssText = 'font-size:11px;color:#888;margin-top:6px;';
        note.textContent = '"Đóng" = ngồi nhìn tại chỗ chết. Nhấn Enter mở lại menu.';
        this.centerEl.appendChild(note);
    }

    hide(): void {
        if (!this.overlay) return;
        this.stage = 'hidden';
        this.overlay.style.display = 'none';
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
