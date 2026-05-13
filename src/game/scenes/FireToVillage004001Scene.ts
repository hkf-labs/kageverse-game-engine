import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Rừng Tre Yatomi (fire_to_village004_001) — combat map lv 8-13.
 * Quái: Sói Đêm, Cú Bóng, Khỉ Núi, Tinh Tre Yatomi, Goblin Chiến Binh, Sói Hoang.
 * Stat lookup: BE `monster_spawns` với map_id = fire_to_village004_001.
 *
 * Entry: từ fire_school_001 (x=180) hoặc ice_school_001 (x=180).
 * Exit: về fire_school (locked), về ice_school (locked), tiến fire_to_village004_002 (locked).
 */
export class FireToVillage004001Scene extends BaseMapScene {
    constructor() {
        super('FireToVillage004001Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'fire_to_village004_001',
            displayName: mapDisplayName('fire_to_village004_001'),
            bgKey: 'map-bg-fire-to-village004-001',
            bgAsset: 'assets/maps/fire_to_village004_001/bg.png',
            colliderKey: 'fire_to_village004_001_colliders',
            colliderAsset: 'assets/maps/fire_to_village004_001/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('fire_to_village004_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            {
                x: 1400,
                label: t('portal.label.enter_fire_school'),
                targetSceneKey: 'FireSchoolScene',
                locked: true,
                lockedMessage: t('portal.locked.fire_school'),
            },
            {
                x: 2400,
                label: t('portal.label.enter_ice_school'),
                targetSceneKey: 'IceSchoolScene',
                locked: true,
                lockedMessage: t('portal.locked.ice_school'),
            },
            {
                x: 3700,
                label: t('portal.label.rocky_hill'),
                targetSceneKey: 'FireToVillage004002Scene',
                locked: true,
                lockedMessage: t('portal.locked.rocky_hill'),
            },
        ];
    }
}
