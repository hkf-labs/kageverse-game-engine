import * as Phaser from 'phaser';

export interface GameComponent {
    create(): void;
    update?(): void;
    destroy?(): void;
}

export interface NpcEntry {
    key: string;
    name: string;
    x: number;
    y?: number;
    offsetY: number;
    templateId?: string;
    sprite: Phaser.GameObjects.Sprite;
    nameText: Phaser.GameObjects.Text;
}

export interface NpcConfig {
    key: string;
    name: string;
    x: number;
    y?: number;
    offsetY: number;
    /**
     * BE npc_template_id (vd "npc_healer_ayame"). Có thì NPC fetch menu từ BE
     * và bật shop. Không có → fallback dialog mock cũ.
     */
    templateId?: string;
}

export interface TiledObject {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TiledLayer {
    type: string;
    objects?: TiledObject[];
}

export interface TiledMapData {
    layers: TiledLayer[];
}

export interface PortalConfig {
    x: number;
    label: string;
    targetSceneKey: string;
}

export type MonsterLevel = 1 | 3 | 5;

export interface MonsterConfig {
    name: string;
    level: MonsterLevel;
    x: number;
    y?: number;
}

export interface MapConfig {
    mapId: string;
    displayName: string;
    bgKey: string;
    bgAsset: string;
    colliderKey: string;
    colliderAsset: string;
    playerTextureKey: string;
    playerTextureAsset: string;
    tiledOriginalHeight: number;
}
