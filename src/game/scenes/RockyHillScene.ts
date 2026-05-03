import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

/**
 * Đồi Đá Iwagumo — hunting + boss map lv 14-20. Quái: Đá Sống, Goblin
 * Pháp Sư, Hổ Vằn, Quạ Bóng, Gấu Núi, Tinh Hỏa + Boss MVP Kage Tinh
 * Khôi (lv 20, leader grade) ở x=4000. Stat lookup: BE `monster_spawns`
 * cho `rocky_hill_iwagumo`.
 *
 * NOTE: bg.png + colliders.json thêm sau (placeholder path). Map nên
 * rộng hơn Rừng Tre vì có boss arena cuối map.
 */
export class RockyHillScene extends BaseMapScene {
    constructor() {
        super('RockyHillScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'rocky_hill_iwagumo',
            displayName: 'Đồi Đá Iwagumo',
            bgKey: 'map-bg-rocky-hill-iwagumo',
            bgAsset: 'assets/maps/rocky_hill_iwagumo/bg.png',
            colliderKey: 'rocky_hill_iwagumo_colliders',
            colliderAsset: 'assets/maps/rocky_hill_iwagumo/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'ĐỒI ĐÁ IWAGUMO'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Quay Về Rừng Tre', targetSceneKey: 'BambooForestScene' },
        ];
    }
}
