import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { portalLabelForTargetMap } from '../maps/portalLabels';
import { BaseMapScene } from './BaseMapScene';

/**
 * Rừng Tuyết Shirakawa (ice_to_village003_001) — combat map lv 8-12, map đầu
 * nhánh Băng hướng village_003 (chain 2 map).
 * Stat lookup: BE `monster_spawns` với map_id = ice_to_village003_001.
 *
 * Entry: từ ice_school_001 (portal phải).
 * Exit: về ice_school_001 (x=180), tiến ice_to_village003_002 (x=3700).
 * Asset bg.png + colliders.json là placeholder — designer thay khi có art.
 */
export class IceToVillage003001Scene extends BaseMapScene {
    constructor() {
        super('IceToVillage003001Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'ice_to_village003_001',
            displayName: mapDisplayName('ice_to_village003_001'),
            bgKey: 'map-bg-ice-to-village003-001',
            bgAsset: 'assets/maps/ice_to_village003_001/bg.png',
            colliderKey: 'ice_to_village003_001_colliders',
            colliderAsset: 'assets/maps/ice_to_village003_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('ice_to_village003_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: portalLabelForTargetMap('ice_school_001'),
                targetSceneKey: 'IceSchoolScene',
            },
            {
                x: 3700,
                label: portalLabelForTargetMap('ice_to_village003_002'),
                targetSceneKey: 'IceToVillage003002Scene',
            },
        ];
    }
}
