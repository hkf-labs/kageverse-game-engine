import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

export class VillageScene extends BaseMapScene {
    constructor() {
        super('VillageScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_001',
            displayName: mapDisplayName('village_001'),
            bgKey: 'map-bg-village-001',
            bgAsset: 'assets/maps/village_001/village_1.png',
            colliderKey: 'village_001_colliders',
            colliderAsset: 'assets/maps/village_001/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('village_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_blacksmith', name: t('npc.name.npc_tetsu'), x: 740, y: undefined, offsetY: 0, templateId: 'npc_tetsu' },
            { key: 'npc_healer', name: t('npc.name.npc_healer_ayame'), x: 1400, y: undefined, offsetY: 0, templateId: 'npc_healer_ayame' },
            { key: 'npc_chef', name: t('npc.name.npc_chef_kuma'), x: 2000, y: undefined, offsetY: 0, templateId: 'npc_chef_kuma' },
            { key: 'npc_merchant', name: t('npc.name.npc_merchant'), x: 2600, y: undefined, offsetY: 0 },
            { key: 'npc_stash', name: t('npc.name.npc_kura'), x: 3800, y: undefined, offsetY: 0, templateId: 'npc_kura' },
            { key: 'npc_teleporter', name: t('npc.name.npc_teleporter'), x: 5000, y: undefined, offsetY: 0, templateId: 'npc_teleporter' },
            { key: 'npc_elder', name: t('npc.name.npc_genji'), x: 400, y: undefined, offsetY: 0, templateId: 'npc_genji' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180,  label: t('portal.label.time_pit'),       targetSceneKey: 'CombatFieldScene' },
            // Path 2 (Phong) — locked entry. QA char với unlock_all_maps=true
            // sẽ auto-unlock toàn bộ portal locked (xem BaseMapScene
            // loadInitialCharacterState ~L740).
            {
                x: 1500,
                label: t('portal.label.to_wind_school'),
                targetSceneKey: 'VillageToWind001Scene',
                locked: true,
                lockedMessage: t('portal.locked.wind_school'),
            },
            { x: 3500, label: t('portal.label.to_ice_school'),  targetSceneKey: 'VillageToIce001Scene' },
            { x: 6300, label: t('portal.label.to_fire_school'), targetSceneKey: 'VillageToFire001Scene' },
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
