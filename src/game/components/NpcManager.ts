import * as Phaser from 'phaser';
import { npcAPI, type NpcActionDTO } from '../../network/api';
import type { GameComponent, NpcConfig, NpcEntry } from './types';
import type { MapBackground } from './MapBackground';
import type { ShopModal } from './ShopModal';

interface DialogOption {
    text: Phaser.GameObjects.Text;
    bg: Phaser.GameObjects.Graphics;
    action: () => void;
}

const ACTION_LABEL_VI: Record<string, string> = {
    talk: 'Trò chuyện',
    buy_shop: 'Mua dược phẩm',
    upgrade_equipment: 'Nâng cấp đồ',
    view_quests: 'Nhiệm vụ',
    open_stash: 'Mở rương',
    teleport: 'Dịch chuyển',
};

function actionLabel(a: NpcActionDTO): string {
    return ACTION_LABEL_VI[a.action] || a.label_key;
}

export class NpcManager implements GameComponent {
    private npcList: NpcEntry[] = [];
    private interactingNpc: NpcEntry | null = null;
    private selectedNpc: NpcEntry | null = null;
    private selectionIndicator?: Phaser.GameObjects.Graphics;
    private autoMoveTargetX: number | null = null;

    private dialogContainer?: Phaser.GameObjects.Container;
    private dialogOptions: DialogOption[] = [];
    private selectedOptionIndex = 0;
    private npcOptionsTitle?: Phaser.GameObjects.Text;
    private fetchSeq = 0;

    private readonly INTERACT_RANGE = 150;
    private readonly SPRITE_SCALE = 0.12;
    private readonly PLAYER_VISUAL_SINK = 4;

    private scene: Phaser.Scene;
    private background: MapBackground;
    private npcConfigs: NpcConfig[];
    private mapId: string;
    private shopModal?: ShopModal;
    private onStatusMessage?: (text: string, color: string) => void;

    constructor(
        scene: Phaser.Scene,
        background: MapBackground,
        npcConfigs: NpcConfig[],
        deps?: {
            mapId?: string;
            shopModal?: ShopModal;
            onStatusMessage?: (text: string, color: string) => void;
        },
    ) {
        this.scene = scene;
        this.background = background;
        this.npcConfigs = npcConfigs;
        this.mapId = deps?.mapId ?? '';
        this.shopModal = deps?.shopModal;
        this.onStatusMessage = deps?.onStatusMessage;
    }

    create(): void {
        const scaleFactor = this.scene.scale.height / 1440;

        this.npcConfigs.forEach(npc => {
            const scaledX = npc.x * scaleFactor;
            const baseSurfaceY = npc.y !== undefined ? (npc.y * scaleFactor) : this.background.getPlatformYAtX(scaledX);
            const bottomPadPx = this.getTextureBottomPadding(npc.key) * this.SPRITE_SCALE;
            const groundedY = baseSurfaceY + bottomPadPx + this.PLAYER_VISUAL_SINK + npc.offsetY;

            const spr = this.scene.add.sprite(scaledX, groundedY, npc.key).setOrigin(0.5, 1).setDepth(8);
            spr.setScale(this.SPRITE_SCALE);
            spr.setInteractive({ useHandCursor: true });

            const nameText = this.scene.add.text(scaledX, groundedY - (spr.height * this.SPRITE_SCALE) - 10, npc.name, {
                fontSize: '13px', color: '#ffea7a', fontFamily: 'system-ui, sans-serif',
                stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(9);

            const npcEntry: NpcEntry = { ...npc, sprite: spr, nameText };
            spr.on('pointerdown', () => this.selectNpc(npcEntry));
            this.npcList.push(npcEntry);
        });

        this.selectionIndicator = this.scene.add.graphics().setDepth(9).setVisible(false);

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        this.dialogContainer = this.scene.add.container(width / 2, height - 100).setScrollFactor(0).setDepth(100).setVisible(false);
        const panel = this.scene.add.graphics();
        panel.fillStyle(0x3e2723, 0.95);
        panel.fillRoundedRect(-300, -60, 600, 100, 16);
        panel.lineStyle(4, 0x8d6e63, 1);
        panel.strokeRoundedRect(-300, -60, 600, 100, 16);
        this.npcOptionsTitle = this.scene.add.text(-280, -45, '', {
            fontSize: '18px', color: '#ffea7a', stroke: '#000', strokeThickness: 4, fontFamily: 'system-ui, sans-serif'
        });
        this.dialogContainer.add([panel, this.npcOptionsTitle]);
    }

    getInteractingNpc(): NpcEntry | null { return this.interactingNpc; }
    getSelectedNpc(): NpcEntry | null { return this.selectedNpc; }
    getAutoMoveTargetX(): number | null { return this.autoMoveTargetX; }
    clearAutoMove(): void { this.autoMoveTargetX = null; }

    handleInteract(playerX: number, playerY: number): void {
        if (this.interactingNpc) {
            this.executeOption();
            return;
        }
        if (!this.selectedNpc) return;

        const dist = Phaser.Math.Distance.Between(playerX, playerY, this.selectedNpc.sprite.x, this.selectedNpc.sprite.y);
        if (dist <= this.INTERACT_RANGE) {
            this.startInteraction(this.selectedNpc);
        } else {
            this.autoMoveTargetX = this.selectedNpc.sprite.x;
        }
    }

    checkAutoMoveArrival(playerX: number, playerY: number): boolean {
        if (this.autoMoveTargetX === null || !this.selectedNpc) return false;
        const dist = Phaser.Math.Distance.Between(playerX, playerY, this.selectedNpc.sprite.x, this.selectedNpc.sprite.y);
        if (dist <= this.INTERACT_RANGE) {
            const target = this.selectedNpc;
            this.autoMoveTargetX = null;
            this.startInteraction(target);
            return true;
        }
        return false;
    }

    navigateOption(direction: 'left' | 'right'): void {
        if (direction === 'left') {
            this.selectedOptionIndex = Math.max(0, this.selectedOptionIndex - 1);
        } else {
            this.selectedOptionIndex = Math.min(this.dialogOptions.length - 1, this.selectedOptionIndex + 1);
        }
        this.updateOptionHighlight();
    }

    canCycleTarget(): boolean {
        if (this.interactingNpc) return false;
        return this.getVisibleNpcs().length >= 2;
    }

    cycleSelectedNpc(): void {
        if (!this.canCycleTarget()) return;
        const visible = this.getVisibleNpcs();
        if (!this.selectedNpc) { this.selectNpc(visible[0]); return; }
        const currentIdx = visible.indexOf(this.selectedNpc);
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visible.length;
        this.selectNpc(visible[nextIdx]);
    }

    private selectNpc(npc: NpcEntry): void {
        if (this.interactingNpc) return;
        if (this.selectedNpc && this.selectedNpc !== npc) {
            this.selectedNpc.nameText?.setColor('#ffea7a');
        }
        this.selectedNpc = npc;
        npc.nameText?.setColor('#9affb4');
        this.updateSelectionIndicator();
    }

    private clearNpcSelection(): void {
        if (this.selectedNpc) this.selectedNpc.nameText?.setColor('#ffea7a');
        this.selectedNpc = null;
        this.autoMoveTargetX = null;
        this.selectionIndicator?.clear().setVisible(false);
    }

    private updateSelectionIndicator(): void {
        if (!this.selectionIndicator || !this.selectedNpc) return;
        const npc = this.selectedNpc;
        const sprH = npc.sprite.height * npc.sprite.scaleY;
        const x = npc.sprite.x;
        const topY = npc.sprite.y - sprH - 28;
        const footY = npc.sprite.y;
        const g = this.selectionIndicator;
        g.clear();
        g.lineStyle(3, 0x9affb4, 1); g.strokeEllipse(x, footY - 4, 50, 14);
        g.fillStyle(0x9affb4, 1); g.lineStyle(2, 0x000000, 1);
        g.beginPath(); g.moveTo(x - 9, topY); g.lineTo(x + 9, topY); g.lineTo(x, topY + 12);
        g.closePath(); g.fillPath(); g.strokePath();
        g.setVisible(true);
    }

    private startInteraction(npc: NpcEntry): void {
        if (!this.dialogContainer || this.interactingNpc) return;
        this.interactingNpc = npc;
        this.dialogContainer.setVisible(true);
        this.npcOptionsTitle?.setText(`[ ${npc.name} ]`);

        // Reset cũ
        this.dialogOptions.forEach(opt => { opt.bg.destroy(); opt.text.destroy(); });
        this.dialogOptions = [];
        this.selectedOptionIndex = 0;

        if (npc.templateId && this.mapId) {
            // BE-driven menu. Show loading, fetch async, render khi xong.
            this.renderLoadingPlaceholder();
            const seq = ++this.fetchSeq;
            void npcAPI.getInteract(this.mapId, npc.templateId)
                .then((res) => {
                    if (seq !== this.fetchSeq || this.interactingNpc !== npc) return;
                    this.renderActionsFromBE(npc, res.available_actions);
                })
                .catch((err) => {
                    if (seq !== this.fetchSeq || this.interactingNpc !== npc) return;
                    const msg = err instanceof Error ? err.message : 'Không tải được menu NPC';
                    this.onStatusMessage?.(msg, '#ff8a8a');
                    this.renderMockOptions(npc);
                });
        } else {
            // Fallback mock dialog cho NPC chưa wire BE.
            this.renderMockOptions(npc);
        }
    }

    private renderLoadingPlaceholder(): void {
        if (!this.dialogContainer) return;
        const txt = this.scene.add.text(-280 + 20, 0, 'Đang tải...', {
            fontSize: '16px', color: '#aaaaaa', fontStyle: 'italic', fontFamily: 'system-ui, sans-serif'
        });
        const bg = this.scene.add.graphics();
        this.dialogContainer.add([bg, txt]);
        this.dialogOptions.push({ text: txt, bg, action: () => {} });
    }

    private renderActionsFromBE(npc: NpcEntry, actions: NpcActionDTO[]): void {
        if (!this.dialogContainer) return;
        // Xóa placeholder
        this.dialogOptions.forEach(opt => { opt.bg.destroy(); opt.text.destroy(); });
        this.dialogOptions = [];
        this.selectedOptionIndex = 0;

        const builders = actions.map((a) => ({
            label: actionLabel(a),
            action: () => this.runAction(npc, a.action),
        }));
        // Luôn có "Rời đi" cuối
        builders.push({ label: 'Rời đi', action: () => this.closeInteraction() });
        this.layoutOptions(builders);
    }

    private renderMockOptions(npc: NpcEntry): void {
        // Xóa placeholder loading nếu còn
        this.dialogOptions.forEach(opt => { opt.bg.destroy(); opt.text.destroy(); });
        this.dialogOptions = [];
        this.selectedOptionIndex = 0;

        const builders = [
            { label: 'Trò chuyện', action: () => this.onStatusMessage?.(`${npc.name}: Chào mừng đến với Kageverse!`, '#fff') },
            { label: 'Nhận Nhiệm vụ', action: () => this.closeInteraction() },
            { label: 'Giao dịch', action: () => this.onStatusMessage?.('NPC này chưa có cửa hàng.', '#aaaaaa') },
            { label: 'Rời đi', action: () => this.closeInteraction() },
        ];
        this.layoutOptions(builders);
    }

    private layoutOptions(items: Array<{ label: string; action: () => void }>): void {
        if (!this.dialogContainer) return;
        let startX = -280;
        items.forEach((opt, idx) => {
            const bg = this.scene.add.graphics();
            const txt = this.scene.add.text(startX + 20, 0, opt.label, {
                fontSize: '16px', color: '#fff', fontFamily: 'system-ui, sans-serif'
            }).setInteractive({ useHandCursor: true });

            txt.on('pointerdown', () => {
                this.selectedOptionIndex = idx;
                this.updateOptionHighlight();
                this.executeOption();
            });

            this.dialogContainer!.add([bg, txt]);
            this.dialogOptions.push({ text: txt, bg, action: opt.action });
            startX += txt.width + 40;
        });

        this.updateOptionHighlight();
    }

    private runAction(npc: NpcEntry, action: string): void {
        switch (action) {
            case 'talk':
                this.onStatusMessage?.(`${npc.name}: Chào mừng!`, '#ffea7a');
                break;
            case 'buy_shop':
                if (this.shopModal && npc.templateId) {
                    this.closeInteraction();
                    this.shopModal.open({
                        mapId: this.mapId,
                        npcTemplateId: npc.templateId,
                        npcName: npc.name,
                    });
                } else {
                    this.onStatusMessage?.('Cửa hàng chưa sẵn sàng.', '#aaaaaa');
                }
                break;
            case 'view_quests':
            case 'upgrade_equipment':
            case 'open_stash':
            case 'teleport':
                this.onStatusMessage?.(`Chức năng "${ACTION_LABEL_VI[action] || action}" sắp ra mắt.`, '#aaaaaa');
                break;
            default:
                this.onStatusMessage?.(`Hành động "${action}" chưa hỗ trợ.`, '#aaaaaa');
        }
    }

    private closeInteraction(): void {
        this.interactingNpc = null;
        this.dialogContainer?.setVisible(false);
        this.clearNpcSelection();
    }

    private updateOptionHighlight(): void {
        this.dialogOptions.forEach((opt, idx) => {
            opt.bg.clear();
            if (idx === this.selectedOptionIndex) {
                opt.bg.fillStyle(0x8d6e63, 1);
                opt.bg.fillRoundedRect(opt.text.x - 10, -5, opt.text.width + 20, 26, 4);
                opt.text.setColor('#ffea7a');
            } else {
                opt.text.setColor('#ffffff');
            }
        });
    }

    private executeOption(): void {
        const opt = this.dialogOptions[this.selectedOptionIndex];
        if (opt) opt.action();
    }

    private getVisibleNpcs(): NpcEntry[] {
        const cam = this.scene.cameras.main;
        const viewLeft = cam.scrollX;
        const viewRight = cam.scrollX + cam.width;
        return this.npcList
            .filter((n) => {
                const halfW = (n.sprite.displayWidth || 0) / 2;
                return n.sprite.x + halfW >= viewLeft && n.sprite.x - halfW <= viewRight;
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    }

    private getTextureBottomPadding(key: string): number {
        const tex = this.scene.textures.get(key);
        const src = tex?.getSourceImage() as (HTMLImageElement | HTMLCanvasElement | undefined);
        if (!src || !('width' in src)) return 0;
        const w = src.width;
        const h = src.height;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 0;
        try {
            ctx.drawImage(src as CanvasImageSource, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            for (let y = h - 1; y >= 0; y--) {
                for (let x = 0; x < w; x++) {
                    if (data[(y * w + x) * 4 + 3] > 5) return h - 1 - y;
                }
            }
        } catch { return 0; }
        return 0;
    }
}
