import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { portalLabelForTargetMap } from '../maps/portalLabels';
import { BaseMapScene } from './BaseMapScene';

/**
 * Đồng Cỏ Homura (fire_to_village005_001) — combat map lv 8-12, map đầu
 * nhánh Lửa hướng village_005 (chain 4 map, mới implement 2 map đầu).
 * Stat lookup: BE `monster_spawns` với map_id = fire_to_village005_001.
 *
 * Entry: từ fire_school_001 (portal phải).
 * Exit: về fire_school_001 (x=180), tiến fire_to_village005_002 (x=3700).
 * Asset bg.png + colliders.json là placeholder — designer thay khi có art.
 */
export class FireToVillage005001Scene extends BaseMapScene {
    constructor() {
        super('FireToVillage005001Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'fire_to_village005_001',
            displayName: mapDisplayName('fire_to_village005_001'),
            bgKey: 'map-bg-fire-to-village005-001',
            bgAsset: 'assets/maps/fire_to_village005_001/bg.png',
            colliderKey: 'fire_to_village005_001_colliders',
            colliderAsset: 'assets/maps/fire_to_village005_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('fire_to_village005_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: portalLabelForTargetMap('fire_school_001'),
                targetSceneKey: 'FireSchoolScene',
            },
            {
                x: 3700,
                label: portalLabelForTargetMap('fire_to_village005_002'),
                targetSceneKey: 'FireToVillage005002Scene',
            },
        ];
    }
}
