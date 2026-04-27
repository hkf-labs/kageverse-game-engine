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
    sprite: Phaser.GameObjects.Sprite;
    nameText: Phaser.GameObjects.Text;
}

export interface NpcConfig {
    key: string;
    name: string;
    x: number;
    y?: number;
    offsetY: number;
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
