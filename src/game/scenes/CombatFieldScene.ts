import type { MapConfig, MonsterConfig, NpcConfig, PortalConfig } from '../components';
import { BaseMapScene } from './BaseMapScene';

export class CombatFieldScene extends BaseMapScene {
    constructor() {
        super('CombatFieldScene');
    }

    protected getMapConfig(): MapConfig {
        return {
            mapId: 'combat_field_001',
            displayName: 'Đồng Cỏ Săn Quái',
            bgKey: 'map-bg-combat-field-001',
            bgAsset: 'assets/maps/combat_field_001/bg.jpg',
            colliderKey: 'combat_field_001_colliders',
            colliderAsset: 'assets/maps/combat_field_001/colliders.json',
            playerTextureKey: 'player-placeholder-male',
            playerTextureAsset: 'assets/game/characters/placeholder-ninja-male.jpg',
            tiledOriginalHeight: 1440,
        };
    }

    protected getMapDisplayName(): string { return 'ĐỒNG CỎ SĂN QUÁI'; }

    protected getNpcConfigs(): NpcConfig[] {
        return [];
    }

    protected getMonsterConfigs(): MonsterConfig[] {
        return [
            { name: 'Slime', level: 1, x: 380 },
            { name: 'Slime', level: 1, x: 190, y: 1240 },
            { name: 'Goblin', level: 3, x: 550, y: 960 },
            { name: 'Orc', level: 5, x: 920, y: 680 },
            { name: 'Goblin', level: 3, x: 1130, y: 820 },
        ];
    }

    protected getPortalConfigs(): PortalConfig[] {
        return [
            { x: 180, label: 'Quay Về Làng', targetSceneKey: 'VillageScene' },
            {
                x: 3800,
                label: 'Trường Mikazuki — Phái Kiếm',
                targetSceneKey: 'SwordSchoolScene',
                locked: true,
                lockedMessage: 'Cần hoàn thành nhiệm vụ Nhập Phái để mở khoá Trường Mikazuki.',
            },
        ];
    }
}
