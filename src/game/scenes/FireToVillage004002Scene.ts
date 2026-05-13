import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Đồi Đá Iwagumo (fire_to_village004_002) — combat + boss map lv 14-20.
 * Quái: Đá Sống, Goblin Pháp Sư, Hổ Vằn, Quạ Bóng, Gấu Núi, Tinh Hỏa
 * + Boss MVP Kage Tinh Khôi (lv 20, leader grade) tại x=4000.
 * Stat lookup: BE `monster_spawns` với map_id = fire_to_village004_002.
 *
 * Asset hiện là placeholder copy từ fire_to_village004_001 — designer thay
 * bg.png khi có art riêng, không cần sửa code.
 */
export class FireToVillage004002Scene extends BaseMapScene {
    constructor() {
        super('FireToVillage004002Scene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'fire_to_village004_002',
            displayName: mapDisplayName('fire_to_village004_002'),
            bgKey: 'map-bg-fire-to-village004-002',
            bgAsset: 'assets/maps/fire_to_village004_002/bg.png',
            colliderKey: 'fire_to_village004_002_colliders',
            colliderAsset: 'assets/maps/fire_to_village004_002/colliders.json',
            tiledOriginalHeight: 1440,
            surfaceTextures: {
                wood: { key: 'tile_vachgo_64', asset: 'assets/tilesets/vachgo_64.png' },
            },
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('fire_to_village004_002').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'FireToVillage004001Scene' },
        ];
    }
}
