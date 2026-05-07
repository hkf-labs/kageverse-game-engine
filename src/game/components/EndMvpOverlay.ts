import * as Phaser from 'phaser';
import { t } from '../../i18n';
import type { GameComponent } from './types';

// End-MVP cinematic placeholder — fullscreen overlay khi player turn-in Q17
// (mq_first_trial_sword/_bow) → BE đã set characters.mvp_flags.mvp_arc1_complete=true.
// Hiển thị message kết thúc story arc 1 + button "Tạm dừng tại đây".
//
// Khi mở post-MVP arc 2, đổi component này thành cinematic thật (fade scenes,
// dialogue chain, intro arc 2).

export class EndMvpOverlay implements GameComponent {
    private scene: Phaser.Scene;
    private overlay?: HTMLDivElement;
    private visible = false;
    private buttonEl?: HTMLButtonElement;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        this.buildOverlay();
    }

    isOpen(): boolean { return this.visible; }

    /** Cinematic chỉ có 1 nút "Tạm dừng" → navigate no-op (signature giữ
     * cho interface đồng nhất với các modal khác). */
    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        void direction;
    }

    /** Enter trigger nút duy nhất (close overlay). */
    confirm(): void {
        if (!this.visible) return;
        this.buttonEl?.click();
    }

    /**
     * Trigger cinematic. className đặc biệt để CSS animate fade-in 2s.
     * Reusable: gọi nhiều lần cũng OK (dismiss xong show lại được).
     */
    show(className: 'sword' | 'bow' | 'none'): void {
        if (!this.overlay) return;
        this.visible = true;
        this.scene.input.keyboard?.disableGlobalCapture();
        const subtitle = className === 'sword'
            ? t('endmvp.title_sword')
            : className === 'bow'
                ? t('endmvp.title_bow')
                : t('endmvp.title_default');
        this.overlay.querySelector<HTMLDivElement>('.kv-end-subtitle')!.textContent = subtitle;
        this.overlay.style.display = 'flex';
        this.overlay.style.opacity = '0';
        // Fade in.
        requestAnimationFrame(() => {
            if (this.overlay) this.overlay.style.opacity = '1';
        });
    }

    close(): void {
        if (!this.visible || !this.overlay) return;
        this.visible = false;
        this.scene.input.keyboard?.enableGlobalCapture();
        this.overlay.style.opacity = '0';
        setTimeout(() => {
            if (this.overlay) this.overlay.style.display = 'none';
        }, 600);
    }

    destroy(): void {
        this.overlay?.remove();
        this.overlay = undefined;
    }

    private buildOverlay(): void {
        const overlay = document.createElement('div');
        overlay.classList.add('kageverse-overlay', 'kageverse-overlay-end-mvp');
        overlay.style.cssText = `
            position: fixed; inset: 0; display: none;
            align-items: center; justify-content: center;
            background: radial-gradient(ellipse at center, rgba(20,20,30,0.92) 0%, rgba(0,0,0,0.98) 80%);
            z-index: 500;
            font-family: system-ui, sans-serif;
            opacity: 0;
            transition: opacity 1.2s ease-in-out;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            text-align: center; padding: 40px 60px; max-width: 720px;
            color: #ffffff;
        `;

        const title = document.createElement('div');
        title.textContent = t('endmvp.title');
        title.style.cssText = `
            font-size: 28px; font-weight: 700; color: #ffea7a;
            text-shadow: 0 0 20px rgba(255,234,122,0.6);
            margin-bottom: 12px; letter-spacing: 2px;
        `;

        const subtitle = document.createElement('div');
        subtitle.classList.add('kv-end-subtitle');
        subtitle.style.cssText = `
            font-size: 18px; color: #bdf0a0; margin-bottom: 30px;
            font-style: italic;
        `;

        const story = document.createElement('div');
        story.innerHTML = t('endmvp.story_html');
        story.style.cssText = `
            font-size: 15px; line-height: 1.7; color: #ddd;
            margin-bottom: 30px; text-align: left;
        `;

        const button = document.createElement('button');
        button.textContent = t('endmvp.button');
        button.style.cssText = `
            padding: 12px 32px; font-size: 15px; font-weight: 600;
            background: linear-gradient(180deg, #ffea7a, #d4b95a);
            color: #1a1a1a; border: 2px solid #fff5b3;
            border-radius: 6px; cursor: pointer;
            box-shadow: 0 0 18px rgba(255,234,122,0.4);
            transition: transform 0.15s, box-shadow 0.15s;
        `;
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 0 24px rgba(255,234,122,0.7)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 0 18px rgba(255,234,122,0.4)';
        });
        button.addEventListener('click', () => this.close());
        this.buttonEl = button;

        panel.appendChild(title);
        panel.appendChild(subtitle);
        panel.appendChild(story);
        panel.appendChild(button);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // ESC to close.
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    }
}

/**
 * Detect Q17 quest_id (boss turn-in) → trigger end-MVP overlay.
 * Returns class name từ quest_id để overlay show subtitle phù hợp.
 */
export function detectEndMvpClass(questID: string): 'sword' | 'bow' | null {
    if (questID === 'mq_first_trial_sword') return 'sword';
    if (questID === 'mq_first_trial_bow') return 'bow';
    return null;
}
