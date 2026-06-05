import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { portalLabelForTargetMap } from '../maps/portalLabels';
import { BaseMapScene } from './BaseMapScene';

/**
 * Sườn Núi Kaen (fire_to_village005_002) — combat map lv 13-17, map thứ 2
 * nhánh Lửa hướng village_005. Chain tiếp fire_to_village005_003 (planned,
 * chưa có scene) — thêm portal tiến khi map đó được implement.
 * Stat lookup: BE `monster_spawns` với map_id = fire_to_village005_002.
 *
 * Asset bg.png + colliders.json là placeholder — designer thay khi có art.
 */
export class FireToVillage005002Scene extends BaseMapScene {
    constructor() {
        super('FireToVillage005002Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'fire_to_village005_002',
            displayName: mapDisplayName('fire_to_village005_002'),
            bgKey: 'map-bg-fire-to-village005-002',
            bgAsset: 'assets/maps/fire_to_village005_002/bg.png',
            colliderKey: 'fire_to_village005_002_colliders',
            colliderAsset: 'assets/maps/fire_to_village005_002/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('fire_to_village005_002').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: portalLabelForTargetMap('fire_to_village005_001'),
                targetSceneKey: 'FireToVillage005001Scene',
            },
        ];
    }
}
