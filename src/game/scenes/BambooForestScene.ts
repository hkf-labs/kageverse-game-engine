import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
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
            displayName: mapDisplayName('bamboo_forest_yatomi'),
            bgKey: 'map-bg-bamboo-forest-yatomi',
            bgAsset: 'assets/maps/bamboo_forest_yatomi/bg.png',
            colliderKey: 'bamboo_forest_yatomi_colliders',
            colliderAsset: 'assets/maps/bamboo_forest_yatomi/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('bamboo_forest_yatomi').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_combat_field'), targetSceneKey: 'CombatFieldScene' },
            {
                x: 1400,
                label: t('portal.label.sword_school'),
                targetSceneKey: 'SwordSchoolScene',
                locked: true,
                lockedMessage: t('portal.locked.sword_school'),
            },
            {
                x: 2400,
                label: t('portal.label.bow_school'),
                targetSceneKey: 'HayabusaSchoolScene',
                locked: true,
                lockedMessage: t('portal.locked.bow_school'),
            },
            {
                x: 3700,
                label: t('portal.label.rocky_hill'),
                targetSceneKey: 'RockyHillScene',
                locked: true,
                lockedMessage: t('portal.locked.rocky_hill'),
            },
        ];
    }
}
