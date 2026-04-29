import * as Phaser from 'phaser';
import { skillAPI, type SkillDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import type { GameComponent } from './types';

const SLOT_COUNT = 5;
const SLOT_SIZE = 48;
const SLOT_GAP = 6;
const TEX_KEY_EMPTY = 'skill_slot_empty';

// Icon emoji fallback theo faction — match SkillModal convention.
const FACTION_ICON: Record<string, string> = {
    none: '🗡',
    sword: '⚔',
    bow: '🏹',
    katana: '🗡',
    fan: '🪭',
    dart: '🎯',
    kunai: '🔪',
};

interface SlotView {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Image;
    iconText: Phaser.GameObjects.Text;
    keyLabel: Phaser.GameObjects.Text;
    levelLabel: Phaser.GameObjects.Text;
}

/**
 * SkillHotbar — 5-slot bar trên world map. Slot trống dùng skill-empty.png;
 * slot gán hiện icon faction (emoji placeholder) + level badge. Phím 1-5 cast
 * skill tương ứng (Phase 2 chỉ wire data; cast logic defer skill module
 * combat unify).
 *
 * Sync: load từ skillAPI.list() lúc create + setSlots() để SkillModal
 * push update sau mỗi assignSlots.
 */
export class SkillHotbar implements GameComponent {
    private scene: Phaser.Scene;
    private container?: Phaser.GameObjects.Container;
    private slots: SlotView[] = [];
    private skillsByID: Map<string, SkillDTO> = new Map();
    private boundSlots: (string | null)[] = [null, null, null, null, null];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    preload(): void {
        if (!this.scene.textures.exists(TEX_KEY_EMPTY)) {
            this.scene.load.image(TEX_KEY_EMPTY, 'assets/game/skills/skill-empty.png');
        }
    }

    create(): void {
        const totalWidth = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * SLOT_GAP;
        // Vị trí: bottom-center, cách đáy 88px (chừa chỗ cho buttons + minimap mobile).
        const cx = this.scene.scale.width / 2;
        const y = this.scene.scale.height - 70;
        this.container = this.scene.add.container(cx - totalWidth / 2, y).setScrollFactor(0).setDepth(95);

        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotX = i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;
            const cell = this.scene.add.container(slotX, 0);
            const bg = this.scene.add.image(0, 0, TEX_KEY_EMPTY).setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            const iconText = this.scene.add.text(0, -2, '', {
                fontSize: '24px', color: '#ffea7a', fontFamily: 'system-ui, sans-serif',
                stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5);
            const keyLabel = this.scene.add.text(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 2, String(i + 1), {
                fontSize: '10px', fontStyle: 'bold', color: '#ffffff',
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 2,
            }).setOrigin(0, 0);
            const levelLabel = this.scene.add.text(SLOT_SIZE / 2 - 4, SLOT_SIZE / 2 - 4, '', {
                fontSize: '11px', fontStyle: 'bold', color: '#bdf0a0',
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
            }).setOrigin(1, 1);
            cell.add([bg, iconText, keyLabel, levelLabel]);
            this.container.add(cell);
            this.slots.push({ container: cell, bg, iconText, keyLabel, levelLabel });
        }

        void this.refresh();
    }

    /** Reload skill list + slot binding từ BE — gọi sau khi SkillModal assignSlots. */
    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        try {
            const res = await skillAPI.list(character.id);
            this.skillsByID.clear();
            for (const s of res.skills) this.skillsByID.set(s.skill_id, s);
            this.boundSlots = res.skill_slots.slice(0, SLOT_COUNT) as (string | null)[];
            this.repaint();
        } catch (err) {
            if (err instanceof Error) console.warn('skill hotbar: refresh failed', err.message);
        }
    }

    /** SkillModal call sau assignSlots — sync nhanh không cần round-trip BE thêm. */
    setSlots(slots: (string | null)[]): void {
        this.boundSlots = slots.slice(0, SLOT_COUNT) as (string | null)[];
        this.repaint();
    }

    destroy(): void {
        this.container?.destroy();
        this.container = undefined;
        this.slots = [];
    }

    private repaint(): void {
        for (let i = 0; i < SLOT_COUNT; i++) {
            const slot = this.slots[i];
            if (!slot) continue;
            const skillID = this.boundSlots[i];
            if (!skillID) {
                slot.iconText.setText('');
                slot.levelLabel.setText('');
                continue;
            }
            const s = this.skillsByID.get(skillID);
            if (!s) {
                // Slot có skill_id nhưng chưa load xong info — show placeholder.
                slot.iconText.setText('?');
                slot.levelLabel.setText('');
                continue;
            }
            slot.iconText.setText(FACTION_ICON[s.faction] ?? '✨');
            slot.levelLabel.setText(s.learned ? `${s.current_skill_level}` : '');
        }
    }
}
