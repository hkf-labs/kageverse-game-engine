import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Farm map trung gian Village → Trường Hỏa Kiếm (chặng 1/2).
 * Layout chuẩn farm: ground full-width + 4 platform leo dần lên bên phải.
 * Exit portal đặt trên Plat D (HIGH ledge ~y=780).
 * Spec: docs/maps/village-schools-path-spec.md.
 */
export class VillageToFire001Scene extends BaseMapScene {
    constructor() { super('VillageToFire001Scene'); }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_to_fire_001',
            displayName: mapDisplayName('village_to_fire_001'),
            bgKey: 'map-bg-village-to-fire-001',
            bgAsset: 'assets/maps/village_to_fire_001/village_to_fire_001.png',
            colliderKey: 'village_to_fire_001_colliders',
            colliderAsset: 'assets/maps/village_to_fire_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('village_to_fire_001').toUpperCase(); }
    protected getNpcConfigs(): NpcConfig[] { return []; }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 180,
                label: t('portal.label.return_village'),
                linkId: 'village_to_fire_001_to_village_001',
            },
            {
                x: 2900,
                label: t('portal.label.continue'),
                linkId: 'village_to_fire_001_to_village_to_fire_002',
            },
        ];
    }
}
