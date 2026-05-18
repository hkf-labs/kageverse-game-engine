import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Trường Băng Cung (`ice_school_001`) — phái Cung, hệ Băng.
 * Bottom-left trong map topology (xem docs/maps/village-schools-path-spec.md).
 * Asset bg.png hiện tại là placeholder copy từ fire_school_001 — designer
 * thay file thật khi có art riêng, không cần sửa code.
 */
export class IceSchoolScene extends BaseMapScene {
    constructor() {
        super('IceSchoolScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'ice_school_001',
            displayName: mapDisplayName('ice_school_001'),
            bgKey: 'map-bg-ice-school-001',
            bgAsset: 'assets/maps/ice_school_001/bg.png',
            colliderKey: 'ice_school_001_colliders',
            colliderAsset: 'assets/maps/ice_school_001/colliders.json',
            tiledOriginalHeight: 1440,
            safeZone: true,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('ice_school_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_tobishima', name: t('npc.name.npc_tobishima'), x: 1500, y: undefined, offsetY: 0, templateId: 'npc_tobishima' },
            { key: 'npc_hayato',    name: t('npc.name.npc_hayato'),    x: 2900, y: undefined, offsetY: 0, templateId: 'npc_hayato' },
            { key: 'npc_hina',      name: t('npc.name.npc_hina'),      x: 4300, y: undefined, offsetY: 0, templateId: 'npc_hina' },
            { key: 'npc_akira',     name: t('npc.name.npc_akira'),     x: 5700, y: undefined, offsetY: 0, templateId: 'npc_akira' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'FireToVillage004001Scene' },
            { x: 750, label: t('portal.label.return'), targetSceneKey: 'VillageToIce002Scene' },
        ];
    }

    protected preloadMapAssets(): void {
        this.load.image('npc_tobishima', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_hayato',    'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_hina',      'assets/maps/village_001/npcs/healer.png');
        this.load.image('npc_akira',     'assets/maps/village_001/npcs/stash_keeper.png');
    }
}
