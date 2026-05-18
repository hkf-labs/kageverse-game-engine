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
            safeZone: true,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('wind_school_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_honoo',  name: t('npc.name.npc_honoo'),  x: 1500, y: undefined, offsetY: 0, templateId: 'npc_honoo' },
            { key: 'npc_hayato', name: t('npc.name.npc_hayato'), x: 2900, y: undefined, offsetY: 0, templateId: 'npc_hayato' },
            { key: 'npc_hina',   name: t('npc.name.npc_hina'),   x: 4300, y: undefined, offsetY: 0, templateId: 'npc_hina' },
            { key: 'npc_akira',  name: t('npc.name.npc_akira'),  x: 5700, y: undefined, offsetY: 0, templateId: 'npc_akira' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 750, label: t('portal.label.return'), targetSceneKey: 'VillageToWind002Scene' },
        ];
    }

    protected preloadMapAssets(): void {
        this.load.image('npc_honoo',  'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_hayato', 'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_hina',   'assets/maps/village_001/npcs/healer.png');
        this.load.image('npc_akira',  'assets/maps/village_001/npcs/stash_keeper.png');
    }
}
