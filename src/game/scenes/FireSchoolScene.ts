import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Trường Hỏa Kiếm (`fire_school_001`) — phái Kiếm, hệ Hỏa.
 * Top-right trong map topology (xem docs/maps/village-schools-path-spec.md).
 * 2 back portal: bamboo (x=180, existing — chuyển map farm post-school) và
 * x=750 ở high ledge → VillageToFire002Scene (về làng theo path Hỏa).
 */
export class FireSchoolScene extends BaseMapScene {
    constructor() {
        super('FireSchoolScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'fire_school_001',
            displayName: mapDisplayName('fire_school_001'),
            bgKey: 'map-bg-fire-school-001',
            bgAsset: 'assets/maps/fire_school_001/bg.png',
            colliderKey: 'fire_school_001_colliders',
            colliderAsset: 'assets/maps/fire_school_001/colliders.json',
            tiledOriginalHeight: 1440,
            safeZone: true,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('fire_school_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_tsukikage', name: t('npc.name.npc_tsukikage'), x: 1500, y: undefined, offsetY: 0, templateId: 'npc_tsukikage' },
            { key: 'npc_hayato',    name: t('npc.name.npc_hayato'),    x: 2900, y: undefined, offsetY: 0, templateId: 'npc_hayato' },
            { key: 'npc_hina',      name: t('npc.name.npc_hina'),      x: 4300, y: undefined, offsetY: 0, templateId: 'npc_hina' },
            { key: 'npc_akira',     name: t('npc.name.npc_akira'),     x: 5700, y: undefined, offsetY: 0, templateId: 'npc_akira' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'FireToVillage004001Scene' },
            {
                x: 750,
                label: t('portal.label.return'),
                linkId: 'fire_school_001_to_village_to_fire_002',
            },
        ];
    }

    protected preloadMapAssets(): void {
        this.load.image('npc_tsukikage', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_hayato',    'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_hina',      'assets/maps/village_001/npcs/healer.png');
        this.load.image('npc_akira',     'assets/maps/village_001/npcs/stash_keeper.png');
    }
}
