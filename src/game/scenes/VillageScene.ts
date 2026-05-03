import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

export class VillageScene extends BaseMapScene {
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
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'LÀNG SƯƠNG KHÓI'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_blacksmith', name: 'Thợ Rèn Tetsu', x: 740, y: undefined, offsetY: 0, templateId: 'npc_tetsu' },
            { key: 'npc_healer', name: 'Y Sĩ Ayame', x: 1400, y: undefined, offsetY: 0, templateId: 'npc_healer_ayame' },
            { key: 'npc_chef', name: 'Bếp Trưởng Kuma', x: 2000, y: undefined, offsetY: 0, templateId: 'npc_chef_kuma' },
            { key: 'npc_merchant', name: 'Thương Gia', x: 2600, y: undefined, offsetY: 0 },
            { key: 'npc_stash', name: 'Quản Kho Kura', x: 3800, y: undefined, offsetY: 0, templateId: 'npc_kura' },
            { key: 'npc_teleporter', name: 'Xa Phu Tobi', x: 5000, y: undefined, offsetY: 0, templateId: 'npc_teleporter' },
            { key: 'npc_elder', name: 'Trưởng Làng Genji', x: 400, y: undefined, offsetY: 0, templateId: 'npc_genji' },
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
}
