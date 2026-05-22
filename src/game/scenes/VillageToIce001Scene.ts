import type { MapConfig, NpcConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { BaseMapScene } from './BaseMapScene';

/**
 * Farm map trung gian Village → Trường Băng Cung (chặng 1/2).
 * Spec: docs/maps/village-schools-path-spec.md.
 */
export class VillageToIce001Scene extends BaseMapScene {
    constructor() { super('VillageToIce001Scene'); }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_to_ice_001',
            displayName: mapDisplayName('village_to_ice_001'),
            bgKey: 'map-bg-village-to-ice-001',
            bgAsset: 'assets/maps/village_to_ice_001/village_to_ice_001.png',
            colliderKey: 'village_to_ice_001_colliders',
            colliderAsset: 'assets/maps/village_to_ice_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('village_to_ice_001').toUpperCase(); }
    protected getNpcConfigs(): NpcConfig[] { return []; }
}
