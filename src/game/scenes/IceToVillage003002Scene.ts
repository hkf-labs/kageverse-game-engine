import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { portalLabelForTargetMap } from '../maps/portalLabels';
import { BaseMapScene } from './BaseMapScene';

/**
 * Hồ Băng Fubuki (ice_to_village003_002) — combat map lv 13-17, map cuối
 * nhánh Băng hướng village_003. Đích village_003 (planned, chưa có scene) —
 * thêm portal tiến khi làng đó được implement.
 * Stat lookup: BE `monster_spawns` với map_id = ice_to_village003_002.
 *
 * Asset bg.png + colliders.json là placeholder — designer thay khi có art.
 */
export class IceToVillage003002Scene extends BaseMapScene {
    constructor() {
        super('IceToVillage003002Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'ice_to_village003_002',
            displayName: mapDisplayName('ice_to_village003_002'),
            bgKey: 'map-bg-ice-to-village003-002',
            bgAsset: 'assets/maps/ice_to_village003_002/bg.png',
            colliderKey: 'ice_to_village003_002_colliders',
            colliderAsset: 'assets/maps/ice_to_village003_002/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('ice_to_village003_002').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: portalLabelForTargetMap('ice_to_village003_001'),
                targetSceneKey: 'IceToVillage003001Scene',
            },
        ];
    }
}
