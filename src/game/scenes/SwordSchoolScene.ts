import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

export class SwordSchoolScene extends BaseMapScene {
    constructor() {
        super('SwordSchoolScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'sword_school_001',
            displayName: 'Trường Mikazuki — Phái Kiếm',
            bgKey: 'map-bg-sword-school-001',
            bgAsset: 'assets/maps/sword_school_001/bg.png',
            colliderKey: 'sword_school_001_colliders',
            colliderAsset: 'assets/maps/sword_school_001/colliders.json',
            playerTextureKey: 'player-placeholder-male',
            playerTextureAsset: 'assets/game/characters/placeholder-ninja-male.jpg',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'TRƯỜNG MIKAZUKI — PHÁI KIẾM'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Quay Về Đồng Cỏ', targetSceneKey: 'CombatFieldScene' },
        ];
    }
}
