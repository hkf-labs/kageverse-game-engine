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
            { key: 'npc_hayato', name: t('npc.name.npc_hayato'), x: 3500, y: undefined, offsetY: 0, templateId: 'npc_hayato' },
            { key: 'npc_hina', name: t('npc.name.npc_hina'), x: 4500, y: undefined, offsetY: 0, templateId: 'npc_hina' },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: t('portal.label.return_bamboo'), targetSceneKey: 'BambooForestScene' },
        ];
    }

    protected preloadMapAssets(): void {
        // Placeholder NPC sprites — dùng village_elder / blacksmith / merchant cho 3 NPC trường.
        this.load.image('npc_tobishima', 'assets/maps/village_001/npcs/village_elder.png');
        this.load.image('npc_kazu', 'assets/maps/village_001/npcs/blacksmith.png');
        this.load.image('npc_hayato', 'assets/maps/village_001/npcs/merchant.png');
        this.load.image('npc_hina', 'assets/maps/village_001/npcs/healer.png');
    }
}
