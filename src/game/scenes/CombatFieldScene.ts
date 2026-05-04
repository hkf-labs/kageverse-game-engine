import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

export class CombatFieldScene extends BaseMapScene {
    constructor() {
        super('CombatFieldScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'combat_field_001',
            displayName: mapDisplayName('combat_field_001'),
            bgKey: 'map-bg-combat-field-001',
            bgAsset: 'assets/maps/combat_field_001/bg.jpg',
            colliderKey: 'combat_field_001_colliders',
            colliderAsset: 'assets/maps/combat_field_001/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('combat_field_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_village'), targetSceneKey: 'VillageScene' },
            {
                x: 3800,
                label: t('portal.label.bamboo_forest'),
                targetSceneKey: 'BambooForestScene',
                locked: true,
                lockedMessage: t('portal.locked.bamboo'),
            },
        ];
    }
}
