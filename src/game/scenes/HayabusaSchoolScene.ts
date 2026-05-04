import type { MapConfig, NpcConfig, PortalConfig } from '../components';
import { mapDisplayName } from '../maps/registry';
import { t } from '../../i18n';
import { BaseMapScene } from './BaseMapScene';

/**
 * Trường Hayabusa — phái Cung. Asset hiện tại là placeholder copy từ
 * sword_school_001 (xem `public/assets/maps/hayabusa_school_001/`).
 * Designer thay file ở folder đó khi có art riêng — không cần sửa code.
 * NPC: HT Tobishima + Thợ Cung Kazu (seed BE).
 */
export class HayabusaSchoolScene extends BaseMapScene {
    constructor() {
        super('HayabusaSchoolScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'hayabusa_school_001',
            displayName: mapDisplayName('hayabusa_school_001'),
            bgKey: 'map-bg-hayabusa-school-001',
            bgAsset: 'assets/maps/hayabusa_school_001/bg.png',
            colliderKey: 'hayabusa_school_001_colliders',
            colliderAsset: 'assets/maps/hayabusa_school_001/colliders.json',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return mapDisplayName('hayabusa_school_001').toUpperCase(); }

    protected getNpcConfigs(): NpcConfig[] {
        return [
            { key: 'npc_tobishima', name: t('npc.name.npc_tobishima'), x: 1500, y: undefined, offsetY: 0, templateId: 'npc_tobishima' },
            { key: 'npc_kazu', name: t('npc.name.npc_kazu'), x: 2500, y: undefined, offsetY: 0, templateId: 'npc_kazu' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'BambooForestScene' },
        ];
    }

    protected preloadMapAssets(): void {
        // Placeholder NPC sprites — dùng village stash_keeper / merchant cho 2 trainer.
        this.load.image('npc_tobishima', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_kazu', 'assets/maps/village_001/npcs/blacksmith.png');
    }
}
