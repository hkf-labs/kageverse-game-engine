import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

/**
 * Trường Hayabusa — phái Cung. Phase 2 placeholder: dùng asset SwordSchool đến
 * khi có art riêng. NPC: HT Tobishima + Thợ Cung Kazu (seed BE).
 */
export class HayabusaSchoolScene extends BaseMapScene {
    constructor() {
        super('HayabusaSchoolScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'hayabusa_school_001',
            displayName: 'Trường Hayabusa — Phái Cung',
            bgKey: 'map-bg-hayabusa-school-001',
            bgAsset: 'assets/maps/sword_school_001/bg.png', // placeholder asset
            colliderKey: 'hayabusa_school_001_colliders',
            colliderAsset: 'assets/maps/sword_school_001/colliders.json',
            playerTextureKey: 'player-placeholder-male',
            playerTextureAsset: 'assets/game/characters/placeholder-ninja-male.jpg',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'TRƯỜNG HAYABUSA — PHÁI CUNG'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_tobishima', name: 'HT Tobishima', x: 1500, y: undefined, offsetY: 0, templateId: 'npc_tobishima' },
            { key: 'npc_kazu', name: 'Thợ Cung Kazu', x: 2500, y: undefined, offsetY: 0, templateId: 'npc_kazu' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Quay Về Rừng Tre', targetSceneKey: 'BambooForestScene' },
        ];
    }

    protected preloadMapAssets(): void {
        // Placeholder NPC sprites — dùng village stash_keeper / merchant cho 2 trainer.
        this.load.image('npc_tobishima', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_kazu', 'assets/maps/village_001/npcs/blacksmith.png');
    }
}
