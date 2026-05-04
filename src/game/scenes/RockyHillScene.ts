import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Đồi Đá Iwagumo — hunting + boss map lv 14-20. Quái: Đá Sống, Goblin
 * Pháp Sư, Hổ Vằn, Quạ Bóng, Gấu Núi, Tinh Hỏa + Boss MVP Kage Tinh
 * Khôi (lv 20, leader grade) ở x=4000. Stat lookup: BE `monster_spawns`
 * cho `rocky_hill_iwagumo`.
 *
 * Asset hiện tại là placeholder copy từ bamboo_forest_yatomi
 * (xem `public/assets/maps/rocky_hill_iwagumo/`). Colliders đã tinh
 * giảm platform cho boss arena rộng. Designer thay bg.png khi có art
 * riêng — không cần sửa code.
 */
export class RockyHillScene extends BaseMapScene {
    constructor() {
        super('RockyHillScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'rocky_hill_iwagumo',
            displayName: mapDisplayName('rocky_hill_iwagumo'),
            bgKey: 'map-bg-rocky-hill-iwagumo',
            bgAsset: 'assets/maps/rocky_hill_iwagumo/bg.png',
            colliderKey: 'rocky_hill_iwagumo_colliders',
            colliderAsset: 'assets/maps/rocky_hill_iwagumo/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('rocky_hill_iwagumo').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'BambooForestScene' },
        ];
    }
}
