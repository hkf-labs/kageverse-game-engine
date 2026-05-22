import * as Phaser from 'phaser';
import { ensureSkillIconTexture, skillTextureKey } from '../skillIcon';
import type { GameComponent } from './types';

const ATTACK_BTN_SCALE = 0.7;
const ATTACK_SKILL_ICON_SIZE = 44;

interface DirBtnEntry {
    g: Phaser.GameObjects.Graphics;
    hit: Phaser.GameObjects.Arc;
    dir: 'left' | 'right' | 'up';
    cx: number;
    cy: number;
    r: number;
    /** Offset from anchor (left bottom corner). Recomputed on resize. */
    dx: number;
    dy: number;
}

interface SatBtnEntry {
    bg: Phaser.GameObjects.Arc;
    txt: Phaser.GameObjects.Text;
    angleDeg: number;
}

export interface ControlCallbacks {
    onInteract: () => void;
    onHpPotion: () => void;
    onMpPotion: () => void;
    onCycleTarget: () => void;
    onDirLeft?: () => void;
    onDirRight?: () => void;
    onDirUp?: () => void;
}

const DIR_ANCHOR_X = 80;
const DIR_BOTTOM_OFFSET = 70;
const DIR_RADIUS = 28;
const DIR_BTN_GAP = 64;
const ATTACK_RIGHT_OFFSET = 72;
const ATTACK_BOTTOM_OFFSET = 78;
const SAT_RADIUS = 22;
const SAT_DISTANCE = 78;

export class GameControls implements GameComponent {
    private virtualInputs = { left: false, right: false, up: false };
    private dirBtns: DirBtnEntry[] = [];
    private attackBtn?: Phaser.GameObjects.Image;
    private attackSkillIcon?: Phaser.GameObjects.Image;
    private attackSkillLoadGen = 0;
    private attackSkillShowing = false;
    private controlsVisible = true;
    private satBtns: SatBtnEntry[] = [];
    private switchTargetBtn?: { bg: Phaser.GameObjects.Arc; txt: Phaser.GameObjects.Text };
    private scene: Phaser.Scene;
    private callbacks: ControlCallbacks;

    constructor(scene: Phaser.Scene, callbacks: ControlCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;
    }

    create(): void {
        // Dir buttons — store offset from anchor (left=DIR_ANCHOR_X, bottom).
        // dx/dy relative to (DIR_ANCHOR_X, scale.height - DIR_BOTTOM_OFFSET).
        const makeDirBtn = (dx: number, dy: number, dir: 'left' | 'right' | 'up', onPress?: () => void) => {
            const dirG = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
            const hit = this.scene.add.circle(0, 0, DIR_RADIUS, 0xffffff, 0.001)
                .setScrollFactor(0).setDepth(101)
                .setInteractive({ useHandCursor: true });
            const entry: DirBtnEntry = { g: dirG, hit, dir, cx: 0, cy: 0, r: DIR_RADIUS, dx, dy };
            this.dirBtns.push(entry);

            hit.on('pointerdown', () => { if (onPress) onPress(); this.virtualInputs[dir] = true; });
            hit.on('pointerup', () => { this.virtualInputs[dir] = false; });
            hit.on('pointerout', () => { this.virtualInputs[dir] = false; });
        };

        makeDirBtn(0, -DIR_BTN_GAP, 'up', this.callbacks.onDirUp);
        makeDirBtn(-DIR_BTN_GAP, 0, 'left', this.callbacks.onDirLeft);
        makeDirBtn(DIR_BTN_GAP, 0, 'right', this.callbacks.onDirRight);

        // Attack button — right-anchored. Position recomputed in layout().
        const attackBtn = this.scene.add.image(0, 0, 'btn_attack')
            .setScrollFactor(0).setDepth(100).setScale(ATTACK_BTN_SCALE)
            .setInteractive({ useHandCursor: true });
        attackBtn.on('pointerdown', () => {
            attackBtn.setScale(ATTACK_BTN_SCALE * 0.94);
            this.attackSkillIcon?.setScale((ATTACK_SKILL_ICON_SIZE / 64) * 0.94);
            this.callbacks.onInteract();
        });
        const releaseAttackScale = () => {
            attackBtn.setScale(ATTACK_BTN_SCALE);
            this.syncAttackSkillIconScale();
        };
        attackBtn.on('pointerup', releaseAttackScale);
        attackBtn.on('pointerout', releaseAttackScale);
        this.attackBtn = attackBtn;

        this.attackSkillIcon = this.scene.add.image(0, 0, 'btn_attack')
            .setScrollFactor(0).setDepth(99)
            .setVisible(false);

        const makeSatBtn = (angleDeg: number, fillColor: number, label: string, labelColor: string, onClick: () => void) => {
            const bg = this.scene.add.circle(0, 0, SAT_RADIUS, fillColor, 0.92)
                .setStrokeStyle(3, 0xe29e4a).setScrollFactor(0).setDepth(100)
                .setInteractive({ useHandCursor: true });
            const txt = this.scene.add.text(0, 0, label, {
                fontSize: '14px', fontStyle: 'bold', color: labelColor,
                fontFamily: 'system-ui, sans-serif', stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

            bg.on('pointerdown', () => {
                if ((bg as Phaser.GameObjects.Arc & { disabled?: boolean }).disabled) return;
                bg.setScale(0.9); onClick();
            });
            bg.on('pointerup', () => bg.setScale(1));
            bg.on('pointerout', () => bg.setScale(1));

            const entry: SatBtnEntry = { bg, txt, angleDeg };
            this.satBtns.push(entry);
            return entry;
        };

        makeSatBtn(180, 0x7a1a1a, 'HP', '#ffe4e4', this.callbacks.onHpPotion);
        makeSatBtn(225, 0x163d6e, 'MP', '#dceeff', this.callbacks.onMpPotion);
        const swEntry = makeSatBtn(270, 0x4d2d13, '⇄', '#ffea7a', this.callbacks.onCycleTarget);
        this.switchTargetBtn = { bg: swEntry.bg, txt: swEntry.txt };

        this.layout();
        this.syncAttackSkillIconScale();
        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
        });
    }

    private layout(): void {
        const dirAnchorY = this.scene.scale.height - DIR_BOTTOM_OFFSET;
        for (const btn of this.dirBtns) {
            const newX = DIR_ANCHOR_X + btn.dx;
            const newY = dirAnchorY + btn.dy;
            btn.cx = newX;
            btn.cy = newY;
            btn.hit.setPosition(newX, newY);
            this.redrawDirBtn(btn, this.virtualInputs[btn.dir]);
        }

        const attackX = this.scene.scale.width - ATTACK_RIGHT_OFFSET;
        const attackY = this.scene.scale.height - ATTACK_BOTTOM_OFFSET;
        this.attackBtn?.setPosition(attackX, attackY);
        this.attackSkillIcon?.setPosition(attackX, attackY);

        for (const sat of this.satBtns) {
            const rad = Phaser.Math.DegToRad(sat.angleDeg);
            const x = attackX + Math.cos(rad) * SAT_DISTANCE;
            const y = attackY + Math.sin(rad) * SAT_DISTANCE;
            sat.bg.setPosition(x, y);
            sat.txt.setPosition(x, y);
        }
    }

    /** Icon skill chính trong vòng nút tấn công; `null` → chỉ khung trống. */
    setPrimaryAttackSkill(skillID: string | null): void {
        const gen = ++this.attackSkillLoadGen;
        if (!skillID) {
            this.attackSkillShowing = false;
            this.attackSkillIcon?.setVisible(false);
            return;
        }
        void ensureSkillIconTexture(this.scene, skillID).then((ok) => {
            if (gen !== this.attackSkillLoadGen || !this.attackSkillIcon) return;
            const texKey = skillTextureKey(skillID);
            if (!ok || !this.scene.textures.exists(texKey)) {
                this.attackSkillShowing = false;
                this.attackSkillIcon.setVisible(false);
                return;
            }
            this.attackSkillIcon
                .setTexture(texKey)
                .setDisplaySize(ATTACK_SKILL_ICON_SIZE, ATTACK_SKILL_ICON_SIZE);
            this.syncAttackSkillIconScale();
            this.attackSkillShowing = true;
            this.attackSkillIcon.setVisible(this.controlsVisible);
        });
    }

    private syncAttackSkillIconScale(): void {
        this.attackSkillIcon?.setScale(1);
    }

    getVirtualInputs(): { left: boolean; right: boolean; up: boolean } { return this.virtualInputs; }

    /** Clear sticky virtual D-pad state — gọi khi modal/menu chiếm input để
     * pointerdown đang giữ không bleed qua frame movement sau khi modal đóng. */
    resetVirtualInputs(): void {
        this.virtualInputs.left = false;
        this.virtualInputs.right = false;
        this.virtualInputs.up = false;
    }

    /** Ẩn/hiện toàn bộ D-pad + nút attack + satellite (HP/MP potion, cycle target).
     * Scene gọi khi modal mở → bottom controls không chen với panel. Reset
     * virtualInputs khi ẩn để pointerdown đang giữ không bleed sau khi modal đóng. */
    setVisible(visible: boolean): void {
        if (!visible) this.resetVirtualInputs();
        this.controlsVisible = visible;
        for (const btn of this.dirBtns) {
            btn.g.setVisible(visible);
            btn.hit.setVisible(visible);
        }
        this.attackBtn?.setVisible(visible);
        this.attackSkillIcon?.setVisible(visible && this.attackSkillShowing);
        for (const sat of this.satBtns) {
            sat.bg.setVisible(visible);
            sat.txt.setVisible(visible);
        }
    }

    updateVisuals(cursors?: Phaser.Types.Input.Keyboard.CursorKeys): void {
        for (const btn of this.dirBtns) {
            const keyDown = cursors ? !!cursors[btn.dir]?.isDown : false;
            const active = this.virtualInputs[btn.dir] || keyDown;
            this.redrawDirBtn(btn, active);
        }
    }

    updateSwitchTarget(canSwitch: boolean): void {
        if (!this.switchTargetBtn) return;
        this.switchTargetBtn.bg.setAlpha(canSwitch ? 1 : 0.4);
        this.switchTargetBtn.txt.setAlpha(canSwitch ? 1 : 0.5);
        (this.switchTargetBtn.bg as Phaser.GameObjects.Arc & { disabled?: boolean }).disabled = !canSwitch;
    }

    private redrawDirBtn(btn: DirBtnEntry, active: boolean): void {
        const { g, dir, cx, cy, r } = btn;
        g.clear();
        g.fillStyle(active ? 0x6b3a14 : 0x352313, 0.92);
        g.fillCircle(cx, cy, r);
        g.lineStyle(3, active ? 0xffea7a : 0xe29e4a, 1);
        g.strokeCircle(cx, cy, r);

        const arrowColor = active ? 0xffea7a : 0xe29e4a;
        const arm = r * 0.5;
        g.fillStyle(arrowColor, 1);
        g.lineStyle(2, 0x000000, 0.5);
        g.beginPath();
        if (dir === 'up') {
            g.moveTo(cx, cy - arm); g.lineTo(cx + arm * 0.85, cy + arm * 0.55); g.lineTo(cx - arm * 0.85, cy + arm * 0.55);
        } else if (dir === 'left') {
            g.moveTo(cx - arm, cy); g.lineTo(cx + arm * 0.55, cy - arm * 0.85); g.lineTo(cx + arm * 0.55, cy + arm * 0.85);
        } else {
            g.moveTo(cx + arm, cy); g.lineTo(cx - arm * 0.55, cy - arm * 0.85); g.lineTo(cx - arm * 0.55, cy + arm * 0.85);
        }
        g.closePath(); g.fillPath(); g.strokePath();

        if (active) { g.lineStyle(2, 0xffea7a, 0.6); g.strokeCircle(cx, cy, r + 3); }
    }
}
