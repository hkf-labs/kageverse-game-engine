import * as Phaser from 'phaser';
import { skillAPI, type SkillDTO } from '../../network/api';
import { getCurrentCharacter } from '../playerSession';
import { ensureSkillIconTexture, skillTextureKey } from '../skillIcon';
import type { GameComponent } from './types';

const SLOT_COUNT = 5;
const SLOT_SIZE = 48;
const SLOT_GAP = 6;
const TEX_KEY_EMPTY = 'skill_slot_empty';

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
    selectRing: Phaser.GameObjects.Graphics;
    iconImage: Phaser.GameObjects.Image;
    iconText: Phaser.GameObjects.Text;
    keyLabel: Phaser.GameObjects.Text;
    levelLabel: Phaser.GameObjects.Text;
}

/**
 * SkillHotbar — 5-slot bar trên world map. Icon từ `public/assets/game/skills/icon_<skill_id>.png`.
 */
export class SkillHotbar implements GameComponent {
    private scene: Phaser.Scene;
    private container?: Phaser.GameObjects.Container;
    private slots: SlotView[] = [];
    private skillsByID: Map<string, SkillDTO> = new Map();
    private boundSlots: (string | null)[] = [null, null, null, null, null];
    private selectedSlotIndex: number | null = null;
    private onSlotPressed?: (slotIdx: number, skillID: string) => void;
    private onPrimaryChanged?: (skillID: string | null) => void;
    private keyHandlers: Phaser.Input.Keyboard.Key[] = [];
    private classLocked = true;
    private externallyVisible = true;
    private iconLoadGeneration = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    setOnSlotPressed(cb: (slotIdx: number, skillID: string) => void): void {
        this.onSlotPressed = cb;
    }

    /** Skill chính gắn nút tấn công — đổi khi chọn ô hotbar. */
    setOnPrimaryChanged(cb: (skillID: string | null) => void): void {
        this.onPrimaryChanged = cb;
    }

    getPrimarySkillID(): string | null {
        if (this.selectedSlotIndex === null) return null;
        return this.boundSlots[this.selectedSlotIndex] ?? null;
    }

    /** Skill dùng cho combat swing — chỉ active_attack; buff/passive → basic swing. */
    getPrimaryAttackSkillID(): string | null {
        const id = this.getPrimarySkillID();
        if (!id) return null;
        const s = this.skillsByID.get(id);
        if (s?.skill_type === 'active_attack') return id;
        return null;
    }

    create(): void {
        const totalWidth = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * SLOT_GAP;
        const cx = this.scene.scale.width / 2;
        const y = this.scene.scale.height - 70;
        this.container = this.scene.add.container(cx - totalWidth / 2, y).setScrollFactor(0).setDepth(95);
        this.container.setVisible(false);

        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        });

        const keyboard = this.scene.input.keyboard;
        if (keyboard) {
            const codes = [
                Phaser.Input.Keyboard.KeyCodes.ONE,
                Phaser.Input.Keyboard.KeyCodes.TWO,
                Phaser.Input.Keyboard.KeyCodes.THREE,
                Phaser.Input.Keyboard.KeyCodes.FOUR,
                Phaser.Input.Keyboard.KeyCodes.FIVE,
            ];
            for (let i = 0; i < SLOT_COUNT; i++) {
                const key = keyboard.addKey(codes[i], false, false);
                key.on('down', () => this.handleSlotPressed(i));
                this.keyHandlers.push(key);
            }
        }

        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotX = i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;
            const cell = this.scene.add.container(slotX, 0);
            const bg = this.scene.add.image(0, 0, TEX_KEY_EMPTY).setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            const selectRing = this.scene.add.graphics();
            const iconImage = this.scene.add.image(0, 0, TEX_KEY_EMPTY)
                .setDisplaySize(SLOT_SIZE - 6, SLOT_SIZE - 6)
                .setVisible(false);
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
            cell.add([bg, selectRing, iconImage, iconText, keyLabel, levelLabel]);
            cell.setSize(SLOT_SIZE, SLOT_SIZE);
            cell.setInteractive(
                new Phaser.Geom.Rectangle(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE),
                Phaser.Geom.Rectangle.Contains,
            );
            cell.on('pointerdown', () => this.handleSlotTapped(i));
            this.container.add(cell);
            this.slots.push({
                container: cell, bg, iconImage, iconText, keyLabel, levelLabel,
                selectRing,
            });
        }

        void this.refresh();
    }

    async refresh(): Promise<void> {
        const character = getCurrentCharacter();
        if (!character) return;
        this.classLocked = !character.class || character.class === 'none';
        this.applyVisibility();
        if (this.classLocked) return;
        try {
            const res = await skillAPI.list(character.id);
            this.skillsByID.clear();
            for (const s of res.skills) this.skillsByID.set(s.skill_id, s);
            this.boundSlots = res.skill_slots.slice(0, SLOT_COUNT) as (string | null)[];
            this.ensureValidPrimarySelection();
            this.repaint();
            void this.loadBoundSkillIcons();
        } catch (err) {
            if (err instanceof Error) console.warn('skill hotbar: refresh failed', err.message);
        }
    }

    setSlots(slots: (string | null)[]): void {
        this.boundSlots = slots.slice(0, SLOT_COUNT) as (string | null)[];
        this.ensureValidPrimarySelection();
        this.repaint();
        void this.loadBoundSkillIcons();
    }

    setVisible(visible: boolean): void {
        this.externallyVisible = visible;
        this.applyVisibility();
    }

    private applyVisibility(): void {
        this.container?.setVisible(this.externallyVisible && !this.classLocked);
    }

    destroy(): void {
        this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        for (const k of this.keyHandlers) {
            k.removeAllListeners();
            this.scene.input.keyboard?.removeKey(k, true);
        }
        this.keyHandlers = [];
        this.container?.destroy();
        this.container = undefined;
        this.slots = [];
    }

    private layout(): void {
        if (!this.container) return;
        const totalWidth = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * SLOT_GAP;
        this.container.setPosition(this.scene.scale.width / 2 - totalWidth / 2, this.scene.scale.height - 70);
    }

    private handleSlotTapped(slotIdx: number): void {
        const skillID = this.boundSlots[slotIdx];
        if (!skillID) {
            this.selectPrimarySlot(null);
            return;
        }
        this.selectPrimarySlot(slotIdx);
        const s = this.skillsByID.get(skillID);
        if (s?.skill_type === 'active_buff' && this.onSlotPressed) {
            this.onSlotPressed(slotIdx, skillID);
        }
    }

    private handleSlotPressed(slotIdx: number): void {
        this.handleSlotTapped(slotIdx);
    }

    private selectPrimarySlot(slotIdx: number | null): void {
        this.selectedSlotIndex = slotIdx;
        this.repaintSelection();
        this.onPrimaryChanged?.(this.getPrimarySkillID());
    }

    /** Bỏ chọn nếu ô đang chọn bị gỡ skill — không tự chọn ô khác. */
    private ensureValidPrimarySelection(): void {
        if (
            this.selectedSlotIndex !== null
            && !this.boundSlots[this.selectedSlotIndex]
        ) {
            this.selectedSlotIndex = null;
        }
        this.onPrimaryChanged?.(this.getPrimarySkillID());
    }

    private repaintSelection(): void {
        for (let i = 0; i < SLOT_COUNT; i++) {
            const slot = this.slots[i];
            if (!slot) continue;
            const g = slot.selectRing;
            g.clear();
            if (this.selectedSlotIndex !== i) continue;
            g.lineStyle(3, 0xffea7a, 1);
            g.strokeRoundedRect(-SLOT_SIZE / 2 + 2, -SLOT_SIZE / 2 + 2, SLOT_SIZE - 4, SLOT_SIZE - 4, 6);
        }
    }

    /** Nạp texture qua HTMLImageElement — ổn định hơn LoaderPlugin sau create(). */
    private async loadBoundSkillIcons(): Promise<void> {
        const gen = ++this.iconLoadGeneration;
        const ids = [...new Set(this.boundSlots.filter((id): id is string => !!id))];
        await Promise.all(ids.map((id) => ensureSkillIconTexture(this.scene, id)));
        if (gen !== this.iconLoadGeneration) return;
        this.repaint();
        this.onPrimaryChanged?.(this.getPrimarySkillID());
    }

    private repaint(): void {
        this.repaintSelection();
        for (let i = 0; i < SLOT_COUNT; i++) {
            const slot = this.slots[i];
            if (!slot) continue;
            const skillID = this.boundSlots[i];
            if (!skillID) {
                slot.iconImage.setVisible(false);
                slot.iconText.setText('');
                slot.levelLabel.setText('');
                continue;
            }
            const s = this.skillsByID.get(skillID);
            if (!s) {
                slot.iconImage.setVisible(false);
                slot.iconText.setText('?');
                slot.levelLabel.setText('');
                continue;
            }
            const texKey = skillTextureKey(skillID);
            if (this.scene.textures.exists(texKey)) {
                slot.iconImage.setTexture(texKey)
                    .setDisplaySize(SLOT_SIZE - 6, SLOT_SIZE - 6)
                    .setVisible(true);
                slot.iconText.setText('');
            } else {
                slot.iconImage.setVisible(false);
                slot.iconText.setText(FACTION_ICON[s.faction] ?? '✨');
            }
            slot.levelLabel.setText(s.learned ? `${s.current_skill_level}` : '');
        }
    }
}
