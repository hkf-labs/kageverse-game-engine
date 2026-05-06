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
    /** Tag từ Tiled — map sang texture qua MapConfig.surfaceTextures. Rỗng → invisible. */
    type?: string;
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
    /** Lệch theo trục y so với ground tại x. Âm = lên cao, dương = xuống. Mặc định 0. */
    offsetY?: number;
    label: string;
    targetSceneKey: string;
    /**
     * Cổng bị khoá — không cho dịch chuyển khi tương tác. Mặc định false.
     * Có thể được FE override sang false runtime nếu nhân vật có cờ
     * unlock_all_maps (xem BaseMapScene.loadInitialCharacterState).
     */
    locked?: boolean;
    /** Hiển thị khi player tương tác với portal đang khoá. */
    lockedMessage?: string;
}

export interface ParallaxLayerConfig {
    key: string;
    asset: string;
    /** 0 = camera-locked, 1 = world-locked. Lớp xa nhất → nhỏ nhất. */
    scrollFactor: number;
    /** Phần trăm chiều cao viewport layer chiếm (0..1). Default 1 → full height. */
    heightFraction?: number;
    /** Top của layer tính bằng fraction viewport height (0..1). Default 0 = top. */
    yFraction?: number;
}

export interface ParallaxOverlayConfig {
    key: string;
    asset: string;
    /** X khởi điểm theo fraction viewport width (0..1). */
    xFraction: number;
    /** Y theo fraction viewport height (0..1). */
    yFraction: number;
    /** 0 = camera-locked. Default 0. */
    scrollFactor?: number;
    /** Drift speed px/s — clouds trôi ngang. 0 = static. Default 0. */
    drift?: number;
    /** Scale uniform. Default 2 (asset gốc J2ME nhỏ). */
    scale?: number;
}

export interface ParallaxBgConfig {
    /** Màu sky vẽ dưới đáy stack — backup khi layers có alpha hoặc gap. */
    skyColor?: string;
    /** Layers vẽ furthest → nearest (idx 0 = xa nhất, scrollFactor nhỏ nhất). */
    layers: ParallaxLayerConfig[];
    /** Mây / mặt trời — drift theo camera, depth giữa layers cuối và world. */
    overlays?: ParallaxOverlayConfig[];
}

export interface MapConfig {
    mapId: string;
    displayName: string;
    bgKey: string;
    bgAsset: string;
    colliderKey: string;
    colliderAsset: string;
    tiledOriginalHeight: number;
    /**
     * Map từ Tiled object.type (vd "rock", "grass", "wood") → texture asset.
     * Object có type khớp một entry → render tileSprite lặp texture đó. Không khớp → invisible.
     */
    surfaceTextures?: Record<string, { key: string; asset: string }>;
    /**
     * Tuỳ chọn parallax NinjaSchool-style. Khi có, MapBackground bỏ qua bgKey
     * tinted, thay bằng stack tileSprite scroll khác tốc + overlay (mây / mặt trời).
     * bgKey vẫn dùng để tính worldWidth (collider extent fallback).
     */
    parallaxBg?: ParallaxBgConfig;
}
