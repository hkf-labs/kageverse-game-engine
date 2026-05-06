import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Trường Phong (`wind_school_001`) — middle position trong topology, là phái
 * thứ 3 chưa active MVP. Entry từ village locked (chỉ QA với
 * `unlock_all_maps=true` qua được). Sau khi vào, nội bộ trường đi tự do.
 * Spec: docs/maps/village-schools-path-spec.md.
 */
export class WindSchoolScene extends BaseMapScene {
    constructor() { super('WindSchoolScene'); }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'wind_school_001',
            displayName: mapDisplayName('wind_school_001'),
            bgKey: 'map-bg-wind-school-001',
            bgAsset: 'assets/maps/wind_school_001/wind_school_001.png',
            colliderKey: 'wind_school_001_colliders',
            colliderAsset: 'assets/maps/wind_school_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('wind_school_001').toUpperCase(); }
    protected getNpcConfigs(): NpcConfig[] { return []; }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 750, label: t('portal.label.return'), targetSceneKey: 'VillageToWind002Scene' },
        ];
    }
}
