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
        return [
            { key: 'npc_tsukikage', name: 'HT Tsukikage', x: 1500, y: undefined, offsetY: 0, templateId: 'npc_tsukikage' },
            { key: 'npc_ryota', name: 'Võ Sư Ryota', x: 2500, y: undefined, offsetY: 0, templateId: 'npc_ryota' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Quay Về Rừng Tre', targetSceneKey: 'BambooForestScene' },
        ];
    }

    protected preloadMapAssets(): void {
        // Placeholder sprites — dùng village_elder / blacksmith cho 2 NPC trường.
        this.load.image('npc_tsukikage', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_ryota', 'assets/maps/village_001/npcs/blacksmith.png');
    }
}
