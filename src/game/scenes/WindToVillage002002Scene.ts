import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { portalLabelForTargetMap } from '../maps/portalLabels';
import { BaseMapScene } from './BaseMapScene';

/**
 * Hẻm Núi Arashi (wind_to_village002_002) — combat map lv 13-17, map cuối
 * nhánh Gió hướng village_002. Đích village_002 (planned, chưa có scene) —
 * thêm portal tiến khi làng đó được implement.
 * Stat lookup: BE `monster_spawns` với map_id = wind_to_village002_002.
 *
 * Asset bg.png + colliders.json là placeholder — designer thay khi có art.
 */
export class WindToVillage002002Scene extends BaseMapScene {
    constructor() {
        super('WindToVillage002002Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'wind_to_village002_002',
            displayName: mapDisplayName('wind_to_village002_002'),
            bgKey: 'map-bg-wind-to-village002-002',
            bgAsset: 'assets/maps/wind_to_village002_002/bg.png',
            colliderKey: 'wind_to_village002_002_colliders',
            colliderAsset: 'assets/maps/wind_to_village002_002/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('wind_to_village002_002').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: portalLabelForTargetMap('wind_to_village002_001'),
                targetSceneKey: 'WindToVillage002001Scene',
            },
        ];
    }
}
