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
    bg: Phaser.GameObjects.Image;
    selectRing: Phaser.GameObjects.Graphics;
    iconImage: Phaser.GameObjects.Image;
    iconText: Phaser.GameObjects.Text;
    keyLabel: Phaser.GameObjects.Text;
    levelLabel: Phaser.GameObjects.Text;
}

/**
 * SkillHotbar — 5-slot bar giữa đáy màn hình.
 * Click chuột: `scene.input` + hit-test screen (Container con không nhận pointer ổn định).
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
    private barCenterX = 0;
    private barCenterY = 0;
    private barTotalWidth = 0;
    private readonly onPointerDown: (pointer: Phaser.Input.Pointer) => void;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.onPointerDown = (pointer) => this.handlePointerDown(pointer);
    }

    setOnSlotPressed(cb: (slotIdx: number, skillID: string) => void): void {
        this.onSlotPressed = cb;
    }

    setOnPrimaryChanged(cb: (skillID: string | null) => void): void {
        this.onPrimaryChanged = cb;
    }

    getPrimarySkillID(): string | null {
        if (this.selectedSlotIndex === null) return null;
        return this.boundSlots[this.selectedSlotIndex] ?? null;
    }

    getPrimaryAttackSkillID(): string | null {
        const id = this.getPrimarySkillID();
        if (!id) return null;
        const s = this.skillsByID.get(id);
        if (s?.skill_type === 'active_attack') return id;
        return null;
    }

    create(): void {
        this.barTotalWidth = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * SLOT_GAP;
        this.barCenterX = this.scene.scale.width / 2;
        this.barCenterY = this.scene.scale.height - 70;

        this.container = this.scene.add
            .container(this.barCenterX, this.barCenterY)
            .setScrollFactor(0)
            .setDepth(105);
        this.container.setVisible(false);

        this.scene.input.on('pointerdown', this.onPointerDown);
        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.input.off('pointerdown', this.onPointerDown);
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
                key.on('down', () => this.handleSlotTapped(i));
                this.keyHandlers.push(key);
            }
        }

        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotX = this.slotLocalX(i);
            const bg = this.scene.add.image(slotX, 0, TEX_KEY_EMPTY).setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            const selectRing = this.scene.add.graphics();
            const iconImage = this.scene.add.image(slotX, 0, TEX_KEY_EMPTY)
                .setDisplaySize(SLOT_SIZE - 6, SLOT_SIZE - 6)
                .setVisible(false);
            const iconText = this.scene.add.text(slotX, -2, '', {
                fontSize: '24px', color: '#ffea7a', fontFamily: 'system-ui, sans-serif',
                stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5);
            const keyLabel = this.scene.add.text(
                slotX - SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 2, String(i + 1), {
                    fontSize: '10px', fontStyle: 'bold', color: '#ffffff',
                    fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 2,
                },
            ).setOrigin(0, 0);
            const levelLabel = this.scene.add.text(
                slotX + SLOT_SIZE / 2 - 4, SLOT_SIZE / 2 - 4, '', {
                    fontSize: '11px', fontStyle: 'bold', color: '#bdf0a0',
                    fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
                },
            ).setOrigin(1, 1);
            this.container.add([bg, selectRing, iconImage, iconText, keyLabel, levelLabel]);
            this.slots.push({ bg, selectRing, iconImage, iconText, keyLabel, levelLabel });
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

    destroy(): void {
        this.scene.input.off('pointerdown', this.onPointerDown);
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
        this.barCenterX = this.scene.scale.width / 2;
        this.barCenterY = this.scene.scale.height - 70;
        this.container?.setPosition(this.barCenterX, this.barCenterY);
    }

    /** Tọa độ local trong container (origin 0,0 = tâm thanh). */
    private slotLocalX(slotIdx: number): number {
        return -this.barTotalWidth / 2 + SLOT_SIZE / 2 + slotIdx * (SLOT_SIZE + SLOT_GAP);
    }

    private slotScreenBounds(slotIdx: number): Phaser.Geom.Rectangle {
        const localX = this.slotLocalX(slotIdx);
        const left = this.barCenterX + localX - SLOT_SIZE / 2;
        const top = this.barCenterY - SLOT_SIZE / 2;
        return new Phaser.Geom.Rectangle(left, top, SLOT_SIZE, SLOT_SIZE);
    }

    private isBarInteractive(): boolean {
        return this.externallyVisible && !this.classLocked && !!this.container?.visible;
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        if (!this.isBarInteractive()) return;
        const px = pointer.x;
        const py = pointer.y;
        for (let i = 0; i < SLOT_COUNT; i++) {
            if (Phaser.Geom.Rectangle.Contains(this.slotScreenBounds(i), px, py)) {
                this.handleSlotTapped(i);
                return;
            }
        }
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

    private selectPrimarySlot(slotIdx: number | null): void {
        this.selectedSlotIndex = slotIdx;
        this.repaintSelection();
        this.onPrimaryChanged?.(this.getPrimarySkillID());
    }

    private ensureValidPrimarySelection(): void {
        if (
            this.selectedSlotIndex !== null
            && !this.boundSlots[this.selectedSlotIndex]
        ) {
            this.selectedSlotIndex = null;
        }
        this.onPrimaryChanged?.(this.getPrimarySkillID());
    }

    private applyVisibility(): void {
        this.container?.setVisible(this.externallyVisible && !this.classLocked);
    }

    private repaintSelection(): void {
        for (let i = 0; i < SLOT_COUNT; i++) {
            const slot = this.slots[i];
            if (!slot) continue;
            const g = slot.selectRing;
            const slotX = this.slotLocalX(i);
            g.clear();
            if (this.selectedSlotIndex !== i) continue;
            g.lineStyle(3, 0xffea7a, 1);
            g.strokeRoundedRect(
                slotX - SLOT_SIZE / 2 + 2,
                -SLOT_SIZE / 2 + 2,
                SLOT_SIZE - 4,
                SLOT_SIZE - 4,
                6,
            );
        }
    }

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
