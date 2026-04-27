import * as Phaser from 'phaser';
import { getOnboardingGateway } from '../../features/onboarding';
import type { OnboardingState } from '../../features/onboarding/types';
import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

export class VillageScene extends BaseMapScene {
    private state?: OnboardingState;
    private objectiveText?: Phaser.GameObjects.Text;
    private progressText?: Phaser.GameObjects.Text;
    private rewardText?: Phaser.GameObjects.Text;
    private actionHintText?: Phaser.GameObjects.Text;

    constructor() {
        super('VillageScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_001',
            displayName: 'Làng Sương Khói',
            bgKey: 'map-bg-village-001',
            bgAsset: 'assets/maps/village_001/village_1.png',
            colliderKey: 'village_001_colliders',
            colliderAsset: 'assets/maps/village_001/colliders.json',
            playerTextureKey: 'player-placeholder-male',
            playerTextureAsset: 'assets/game/characters/placeholder-ninja-male.jpg',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'LÀNG SƯƠNG KHÓI'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_blacksmith', name: 'Thợ Rèn', x: 740, y: undefined, offsetY: 0 },
            { key: 'npc_healer', name: 'Y Sĩ Ayame', x: 1400, y: undefined, offsetY: 0, templateId: 'npc_healer_ayame' },
            { key: 'npc_chef', name: 'Bếp Trưởng Kuma', x: 2000, y: undefined, offsetY: 0, templateId: 'npc_chef_kuma' },
            { key: 'npc_merchant', name: 'Thương Gia', x: 2600, y: undefined, offsetY: 0 },
            { key: 'npc_stash', name: 'Rương Đồ', x: 3800, y: undefined, offsetY: 0 },
            { key: 'npc_teleporter', name: 'Dịch Chuyển', x: 5000, y: undefined, offsetY: 0 },
            { key: 'npc_elder', name: 'Trưởng Làng', x: 400, y: undefined, offsetY: 0 },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Hố Sâu Thời Gian', targetSceneKey: 'CombatFieldScene' },
        ];
    }

    protected preloadMapAssets(): void {
        this.load.image('npc_elder', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_blacksmith', 'assets/maps/village_001/npcs/blacksmith.png');
        this.load.image('npc_healer', 'assets/maps/village_001/npcs/healer.png');
        this.load.image('npc_chef', 'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_merchant', 'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_stash', 'assets/maps/village_001/npcs/stash_keeper.png');
        this.load.image('npc_teleporter', 'assets/maps/village_001/npcs/teleporter.png');
    }

    protected onMapReady(): void {
        const width = this.scale.width;
        const height = this.scale.height;

        this.objectiveText = this.add.text(16, 72, '', {
            fontSize: '13px', color: '#0b2539', fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.progressText = this.add.text(16, 92, '', {
            fontSize: '12px', color: '#694400', fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.rewardText = this.add.text(16, height - 58, '', {
            fontSize: '12px', color: '#4a3200', fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.actionHintText = this.add.text(width - 16, height - 16, '', {
            fontSize: '12px', color: '#ffffff', fontFamily: 'system-ui, sans-serif',
            lineSpacing: 8, align: 'right',
            backgroundColor: '#00000088', padding: { left: 8, right: 8, top: 4, bottom: 4 },
        }).setOrigin(1, 1).setScrollFactor(0);

        this.input.keyboard?.on('keydown-Q', () => { if (!this.chat.isFocused()) void this.acceptQuest(); });
        this.input.keyboard?.on('keydown-E', () => { if (!this.chat.isFocused()) void this.simulateKill(); });
        this.input.keyboard?.on('keydown-R', () => { if (!this.chat.isFocused()) void this.turnInQuest(); });

        void this.loadInitialState();
    }

    private async loadInitialState(): Promise<void> {
        try {
            this.state = await getOnboardingGateway().getOnboardingState();
            this.renderState();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Khong tai duoc onboarding';
            this.hud.setStatus(msg, '#ff6b6b');
        }
    }

    private renderState(): void {
        if (!this.state) return;
        const s = this.state;
        this.hud.setStatus(`Flow: ${s.flowState} | Quest: ${s.mainQuest.state}`);
        this.objectiveText?.setText(`Muc tieu: ${s.nextObjective || this.defaultObjective(s)}`);
        this.progressText?.setText(`Tien do Manh Da Dinh Vi: ${s.mainQuest.currentQty}/${s.mainQuest.requiredQty}`);
        this.rewardText?.setText(this.renderReward(s));
        this.actionHintText?.setText(this.renderHint(s.flowState));
    }

    private defaultObjective(state: OnboardingState): string {
        if (state.flowState === 'S1') return 'Gap Truong Lang de nhan nhiem vu';
        if (state.flowState === 'S2') return 'Tieu diet quai va thu thap Manh Da Dinh Vi';
        if (state.flowState === 'S3') return 'Quay ve gap Truong Lang de nop nhiem vu';
        if (state.flowState === 'S4') return 'Da mo khoa map moi';
        return 'Tiep tuc hanh trinh';
    }

    private renderReward(state: OnboardingState): string {
        if (!state.reward) return 'Reward: (chua co)';
        const items = state.reward.items.map((i) => `${i.id} x${i.qty}`).join(', ');
        return `Reward: EXP ${state.reward.exp} | Gold ${state.reward.softCurrency} | ${items}`;
    }

    private renderHint(flowState: OnboardingState['flowState']): string {
        if (flowState === 'S1') return '[Q] Nhan quest';
        if (flowState === 'S2') return '[E] Gia lap giet quai';
        if (flowState === 'S3') return '[R] Nop quest';
        if (flowState === 'S4') return '[ENTER] Qua MainScene';
        return '[ENTER] Qua MainScene';
    }

    private async acceptQuest(): Promise<void> {
        if (!this.state || this.state.flowState !== 'S1') return;
        this.state = await getOnboardingGateway().acceptMainQuest();
        this.renderState();
    }

    private async simulateKill(): Promise<void> {
        if (!this.state || this.state.flowState !== 'S2') return;
        this.state = await getOnboardingGateway().simulateShardDrop();
        this.renderState();
    }

    private async turnInQuest(): Promise<void> {
        if (!this.state || this.state.flowState !== 'S3') return;
        this.state = await getOnboardingGateway().turnInMainQuest();
        this.renderState();
    }
}
