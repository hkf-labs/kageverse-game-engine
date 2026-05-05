import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Farm map trung gian Village → Trường Phong (chặng 1/2). LOCKED entry tại
 * VillageScene → cổng vào path này khoá cho non-QA. Chỉ char có cờ
 * `unlock_all_maps=true` mới qua được.
 * Spec: docs/maps/village-schools-path-spec.md.
 */
export class VillageToWind001Scene extends BaseMapScene {
    constructor() { super('VillageToWind001Scene'); }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'village_to_wind_001',
            displayName: mapDisplayName('village_to_wind_001'),
            bgKey: 'map-bg-village-to-wind-001',
            bgAsset: 'assets/maps/village_to_wind_001/village_to_wind_001.png',
            colliderKey: 'village_to_wind_001_colliders',
            colliderAsset: 'assets/maps/village_to_wind_001/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('village_to_wind_001').toUpperCase(); }
    protected getNpcConfigs(): NpcConfig[] { return []; }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180,  label: t('portal.label.return_village'), targetSceneKey: 'VillageScene' },
            { x: 2900, label: t('portal.label.continue'),       targetSceneKey: 'VillageToWind002Scene' },
        ];
    }
}
