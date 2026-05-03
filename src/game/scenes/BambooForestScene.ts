import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

/**
 * Rừng Tre Yatomi — hunting map lv 8-13. Quái: Sói Đêm, Cú Bóng, Khỉ Núi,
 * Tinh Tre Yatomi, Goblin Chiến Binh, Sói Hoang. Stat lookup: BE
 * `monster_spawns` cho `bamboo_forest_yatomi`.
 *
 * NOTE: bg.png + colliders.json sẽ thêm sau (placeholder path).
 * Map nên rộng (~6000-8000 px ngang) để chứa 6 spawn point + portal 2 đầu.
 */
export class BambooForestScene extends BaseMapScene {
    constructor() {
        super('BambooForestScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'bamboo_forest_yatomi',
            displayName: 'Rừng Tre Yatomi',
            bgKey: 'map-bg-bamboo-forest-yatomi',
            bgAsset: 'assets/maps/bamboo_forest_yatomi/bg.png',
            colliderKey: 'bamboo_forest_yatomi_colliders',
            colliderAsset: 'assets/maps/bamboo_forest_yatomi/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'RỪNG TRE YATOMI'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Quay Về Đồng Cỏ', targetSceneKey: 'CombatFieldScene' },
            {
                x: 1400,
                label: 'Trường Mikazuki — Phái Kiếm',
                targetSceneKey: 'SwordSchoolScene',
                locked: true,
                lockedMessage: 'Cần hoàn thành Bái Sư (Q11) để vào Trường Mikazuki.',
            },
            {
                x: 2400,
                label: 'Trường Hayabusa — Phái Cung',
                targetSceneKey: 'HayabusaSchoolScene',
                locked: true,
                lockedMessage: 'Cần hoàn thành Bái Sư (Q11) để vào Trường Hayabusa.',
            },
            {
                x: 3700,
                label: 'Đồi Đá Iwagumo',
                targetSceneKey: 'RockyHillScene',
                locked: true,
                lockedMessage: 'Cần đạt lv 14 và hoàn thành nhiệm vụ Đồi Đá để mở khoá.',
            },
        ];
    }
}
