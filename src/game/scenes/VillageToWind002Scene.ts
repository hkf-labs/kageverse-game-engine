import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Farm map trung gian Village → Trường Phong (chặng 2/2).
 * Exit portal trên Plat D → WindSchoolScene.
 * Spec: docs/maps/village-schools-path-spec.md.
 */
export class VillageToWind002Scene extends BaseMapScene {
    constructor() { super('VillageToWind002Scene'); }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_to_wind_002',
            displayName: mapDisplayName('village_to_wind_002'),
            bgKey: 'map-bg-village-to-wind-002',
            bgAsset: 'assets/maps/village_to_wind_002/village_to_wind_002.png',
            colliderKey: 'village_to_wind_002_colliders',
            colliderAsset: 'assets/maps/village_to_wind_002/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('village_to_wind_002').toUpperCase(); }
    protected getNpcConfigs(): NpcConfig[] { return []; }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180,  label: t('portal.label.return'),             targetSceneKey: 'VillageToWind001Scene' },
            { x: 2900, label: t('portal.label.enter_wind_school'),  targetSceneKey: 'WindSchoolScene' },
        ];
    }
}
