import type { MapConfig, NpcConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { BaseMapScene } from './BaseMapScene';

/**
 * Farm map trung gian Village → Trường Băng Cung (chặng 2/2).
 * Exit portal trên Plat D → IceSchoolScene.
 * Spec: docs/maps/village-schools-path-spec.md.
 */
export class VillageToIce002Scene extends BaseMapScene {
    constructor() { super('VillageToIce002Scene'); }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_to_ice_002',
            displayName: mapDisplayName('village_to_ice_002'),
            bgKey: 'map-bg-village-to-ice-002',
            bgAsset: 'assets/maps/village_to_ice_002/village_to_ice_002.png',
            colliderKey: 'village_to_ice_002_colliders',
            colliderAsset: 'assets/maps/village_to_ice_002/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('village_to_ice_002').toUpperCase(); }
    protected getNpcConfigs(): NpcConfig[] { return []; }
}
