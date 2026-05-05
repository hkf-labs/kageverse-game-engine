import * as Phaser from 'phaser';
import type { GameComponent } from './types';

// Bubble Y offset từ origin của target container — đủ cao để nằm trên cả
// nameplate (NAME_OFFSET_Y = -90 ở PlayerController) + 1 khoảng đệm. Cố
// định để consistent giữa local + remote (cả 2 cùng layout body).
const BUBBLE_Y_OFFSET = -110;

// TTL chung — bubble fade out sau N ms tính từ lúc show. Replace bubble cũ
// reset timer (giữ bubble lâu hơn nếu chat liên tục).
const DEFAULT_TTL_MS = 5_000;

// Max width text trong bubble — wrap auto sau ngưỡng. 280 khớp NpcChatBubble
// nhưng cho map chat user thường text ngắn → vẫn ổn.
const MAX_WIDTH = 240;

interface BubbleEntry {
    target: Phaser.GameObjects.Container | Phaser.GameObjects.Sprite;
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Graphics;
    text: Phaser.GameObjects.Text;
    hideTimer?: Phaser.Time.TimerEvent;
}

/**
 * Bong bóng chat trên đầu nhân vật player (local + remote). Multi-instance:
 * giữ map theo characterID — mỗi player có bubble riêng. Show 1 message mới
 * cùng characterID → replace nội dung + reset timer.
 *
 * Khác `NpcChatBubble` (single-instance, typewriter): chat player render
 * nguyên text 1 lần (thực tế WS message tới đã trọn vẹn) + tự fade-out sau
 * TTL. Pattern đơn giản hơn vì có thể có nhiều bubble cùng lúc.
 *
 * Cleanup khi player rời map → caller gọi `remove(characterID)` (đi kèm
 * `player_left` / leave_map). Khi bubble target không còn active (vd
 * destroy() race), bubble cũng được destroy luôn ở next update().
 */
export class PlayerChatBubble implements GameComponent {
    private scene: Phaser.Scene;
    private bubbles = new Map<string, BubbleEntry>();

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(): void {
        // No-op: bubbles tạo on-demand qua show().
    }

    /**
     * Show bubble trên target. Replace nếu characterID đã có bubble.
     * targetSprite: Container (PlayerController.bodyContainer hoặc remote
     * container) hoặc Sprite — bất cứ object nào có x/y theo world coords.
     */
    show(
        characterID: string,
        target: Phaser.GameObjects.Container | Phaser.GameObjects.Sprite,
        text: string,
        ttlMs: number = DEFAULT_TTL_MS,
    ): void {
        if (!characterID || !text) return;

        const trimmed = text.trim();
        if (!trimmed) return;

        const existing = this.bubbles.get(characterID);
        if (existing) {
            this.refreshBubble(existing, target, trimmed, ttlMs);
            return;
        }
        this.createBubble(characterID, target, trimmed, ttlMs);
    }

    /** Remove bubble cho 1 character (gọi khi player_left / leave_map). */
    remove(characterID: string): void {
        const entry = this.bubbles.get(characterID);
        if (!entry) return;
        this.disposeEntry(entry);
        this.bubbles.delete(characterID);
    }

    /** Wipe tất cả — gọi khi scene shutdown / leave_map. */
    clear(): void {
        for (const entry of this.bubbles.values()) {
            this.disposeEntry(entry);
        }
        this.bubbles.clear();
    }

    /** Per-frame: re-anchor bubble theo position của target. */
    update(): void {
        for (const [id, entry] of Array.from(this.bubbles.entries())) {
            // Target đã bị destroy (Phaser set .active=false) → cleanup.
            if (!entry.target.active) {
                this.disposeEntry(entry);
                this.bubbles.delete(id);
                continue;
            }
            entry.container.setPosition(entry.target.x, entry.target.y + BUBBLE_Y_OFFSET);
        }
    }

    destroy(): void {
        this.clear();
    }

    // --- internals ---

    private createBubble(
        characterID: string,
        target: Phaser.GameObjects.Container | Phaser.GameObjects.Sprite,
        text: string,
        ttlMs: number,
    ): void {
        const container = this.scene.add.container(target.x, target.y + BUBBLE_Y_OFFSET).setDepth(50);
        const bg = this.scene.add.graphics();
        const textObj = this.scene.add.text(0, 0, text, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            wordWrap: { width: MAX_WIDTH, useAdvancedWrap: true },
            align: 'center',
            stroke: '#000',
            strokeThickness: 2,
        }).setOrigin(0.5, 1);

        container.add([bg, textObj]);

        const entry: BubbleEntry = { target, container, bg, text: textObj };
        this.redrawBackground(entry);
        entry.hideTimer = this.scene.time.addEvent({
            delay: ttlMs,
            callback: () => this.remove(characterID),
        });

        this.bubbles.set(characterID, entry);
    }

    private refreshBubble(
        entry: BubbleEntry,
        target: Phaser.GameObjects.Container | Phaser.GameObjects.Sprite,
        text: string,
        ttlMs: number,
    ): void {
        entry.target = target;
        entry.text.setText(text);
        this.redrawBackground(entry);
        entry.hideTimer?.remove();
        // Tìm characterID lại để re-add timer — dùng find vì entry không
        // giữ id reference.
        const characterID = this.findIdFor(entry);
        if (!characterID) return;
        entry.hideTimer = this.scene.time.addEvent({
            delay: ttlMs,
            callback: () => this.remove(characterID),
        });
    }

    private findIdFor(entry: BubbleEntry): string | undefined {
        for (const [id, e] of this.bubbles.entries()) {
            if (e === entry) return id;
        }
        return undefined;
    }

    private redrawBackground(entry: BubbleEntry): void {
        const { bg, text } = entry;
        const padX = 12;
        const padY = 8;
        const tailH = 8;
        const w = Math.min(MAX_WIDTH + padX * 2, text.width + padX * 2);
        const h = text.height + padY * 2;
        const left = -w / 2;
        const top = -(h + tailH);

        text.setPosition(0, -tailH - padY);

        bg.clear();
        bg.fillStyle(0x3e2723, 0.95);
        bg.fillRoundedRect(left, top, w, h, 10);
        bg.lineStyle(2, 0xe29e4a, 1);
        bg.strokeRoundedRect(left, top, w, h, 10);

        // Tail trỏ xuống đầu nhân vật.
        const tw = 7;
        bg.fillStyle(0x3e2723, 0.95);
        bg.fillTriangle(-tw, -tailH, tw, -tailH, 0, 0);
        bg.lineStyle(2, 0xe29e4a, 1);
        bg.beginPath();
        bg.moveTo(-tw, -tailH);
        bg.lineTo(0, 0);
        bg.lineTo(tw, -tailH);
        bg.strokePath();
    }

    private disposeEntry(entry: BubbleEntry): void {
        entry.hideTimer?.remove();
        entry.container.destroy(true);
    }
}
