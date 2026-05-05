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
            { key: 'npc_hayato', name: t('npc.name.npc_hayato'), x: 3500, y: undefined, offsetY: 0, templateId: 'npc_hayato' },
            { key: 'npc_hina', name: t('npc.name.npc_hina'), x: 4500, y: undefined, offsetY: 0, templateId: 'npc_hina' },
            { key: 'npc_akira', name: t('npc.name.npc_akira'), x: 5500, y: undefined, offsetY: 0, templateId: 'npc_akira' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'BambooForestScene' },
        ];
    }

    protected preloadMapAssets(): void {
        // Placeholder sprites — dùng village_elder / blacksmith / merchant cho 3 NPC trường.
        this.load.image('npc_tsukikage', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_ryota', 'assets/maps/village_001/npcs/blacksmith.png');
        this.load.image('npc_hayato', 'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_hina', 'assets/maps/village_001/npcs/healer.png');
        this.load.image('npc_akira', 'assets/maps/village_001/npcs/stash_keeper.png');
    }
}
