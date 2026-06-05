import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { portalLabelForTargetMap } from '../maps/portalLabels';
import { BaseMapScene } from './BaseMapScene';

/**
 * Đồng Gió Kazane (wind_to_village002_001) — combat map lv 8-12, map đầu
 * nhánh Gió hướng village_002 (chain 2 map). Trước đây wind_school_001 là
 * dead-end — đây là nội dung combat đầu tiên của nhánh Gió.
 * Stat lookup: BE `monster_spawns` với map_id = wind_to_village002_001.
 *
 * Entry: từ wind_school_001 (portal phải).
 * Exit: về wind_school_001 (x=180), tiến wind_to_village002_002 (x=3700).
 * Asset bg.png + colliders.json là placeholder — designer thay khi có art.
 */
export class WindToVillage002001Scene extends BaseMapScene {
    constructor() {
        super('WindToVillage002001Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'wind_to_village002_001',
            displayName: mapDisplayName('wind_to_village002_001'),
            bgKey: 'map-bg-wind-to-village002-001',
            bgAsset: 'assets/maps/wind_to_village002_001/bg.png',
            colliderKey: 'wind_to_village002_001_colliders',
            colliderAsset: 'assets/maps/wind_to_village002_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('wind_to_village002_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: portalLabelForTargetMap('wind_school_001'),
                targetSceneKey: 'WindSchoolScene',
            },
            {
                x: 3700,
                label: portalLabelForTargetMap('wind_to_village002_002'),
                targetSceneKey: 'WindToVillage002002Scene',
            },
        ];
    }
}
