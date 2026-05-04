import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

export class SwordSchoolScene extends BaseMapScene {
    constructor() {
        super('SwordSchoolScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'sword_school_001',
            displayName: mapDisplayName('sword_school_001'),
            bgKey: 'map-bg-sword-school-001',
            bgAsset: 'assets/maps/sword_school_001/bg.png',
            colliderKey: 'sword_school_001_colliders',
            colliderAsset: 'assets/maps/sword_school_001/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('sword_school_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_tsukikage', name: t('npc.name.npc_tsukikage'), x: 1500, y: undefined, offsetY: 0, templateId: 'npc_tsukikage' },
            { key: 'npc_ryota', name: t('npc.name.npc_ryota'), x: 2500, y: undefined, offsetY: 0, templateId: 'npc_ryota' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'BambooForestScene' },
        ];
    }

    protected preloadMapAssets(): void {
        // Placeholder sprites — dùng village_elder / blacksmith cho 2 NPC trường.
        this.load.image('npc_tsukikage', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_ryota', 'assets/maps/village_001/npcs/blacksmith.png');
    }
}
