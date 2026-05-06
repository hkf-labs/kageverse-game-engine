import * as Phaser from 'phaser';
import type { GameComponent, MapConfig, ParallaxLayerConfig, ParallaxOverlayConfig, TiledMapData, TiledLayer, TiledObject } from './types';

export class MapBackground implements GameComponent {
    private bgWidth = 3200;
    private bgHeight = 1080;
    private worldWidth = 3200; // max(bgWidth, collider extent) — player chạy được tới đây
    private platforms!: Phaser.Physics.Arcade.StaticGroup;
    private scene: Phaser.Scene;
    private config: MapConfig;
    // Parallax: tileSprite scroll-locked tới camera (factor=0), tilePositionX
    // dịch theo camera.scrollX*factor mỗi frame. Texture scale lên nên chia
    // tileScale khi convert px → texture coord.
    private parallaxLayers: Array<{ sprite: Phaser.GameObjects.TileSprite; factor: number; texScale: number }> = [];

    constructor(scene: Phaser.Scene, config: MapConfig) {
        this.scene = scene;
        this.config = config;
    }

    create(): void {
        this.drawBackdrop();
        // Compute world width = max(bg image, collider extent). Khi BG mock ngắn
        // hơn map Tiled, player vẫn đi tới được rìa collider (sky lộ ngoài BG).
        this.worldWidth = Math.max(this.bgWidth, this.computeColliderMaxX());

        this.scene.physics.world.setBounds(0, 0, this.worldWidth, this.bgHeight);
        this.scene.physics.world.setBoundsCollision(true, true, false, true);
        this.scene.physics.world.gravity.y = 900;

        this.platforms = this.buildPlatforms();

        if (this.scene.physics.world.debugGraphic) {
            this.scene.physics.world.debugGraphic.setDepth(5);
        }
    }

    getBgWidth(): number { return this.bgWidth; }
    getWorldWidth(): number { return this.worldWidth; }
    getBgHeight(): number { return this.bgHeight; }
    getPlatforms(): Phaser.Physics.Arcade.StaticGroup { return this.platforms; }

    update(): void {
        if (this.parallaxLayers.length === 0) return;
        const cam = this.scene.cameras.main;
        for (const l of this.parallaxLayers) {
            // tilePositionX đo theo texture px (chưa scale) → chia texScale.
            l.sprite.tilePositionX = (cam.scrollX * l.factor) / l.texScale;
        }
    }

    getGroundY(): number {
        const scale = this.scene.scale.height / this.config.tiledOriginalHeight;
        return 1300 * scale;
    }

    getPlatformYAtX(targetX: number): number {
        const mapData = this.scene.cache.json.get(this.config.colliderKey) as TiledMapData | undefined;
        if (!mapData || !mapData.layers) return this.getGroundY();

        const objectLayer = mapData.layers.find((l: TiledLayer) => l.type === 'objectgroup');
        if (!objectLayer || !objectLayer.objects) return this.getGroundY();

        const scaleFactor = this.scene.scale.height / this.config.tiledOriginalHeight;
        const targetXTiled = targetX / scaleFactor;

        // Collect colliders overlap targetX (Tiled coords).
        const matching: TiledObject[] = [];
        for (const obj of objectLayer.objects) {
            if (!obj.width || !obj.height) continue;
            if (targetXTiled >= obj.x && targetXTiled <= obj.x + obj.width) {
                matching.push(obj);
            }
        }
        if (matching.length === 0) return this.getGroundY();

        // Surface = top edge của collider không bị collider khác đè trực tiếp
        // từ trên (= chừa trống ô phía trên cho NPC/portal đứng). Chọn surface
        // có y_top LỚN NHẤT (= sâu nhất, gần đáy nhất) để khớp behavior cũ
        // (NPC trên ground floor dù có platform nổi phía trên).
        //
        // Map cũ: ground y=1408 không bị collider nào touching trên → exposed.
        // Map NSO mới: bottom_mass y=1152 bị row 15 (bottom=1152) chạm trên →
        // NOT exposed → fallback row 15 (y=1080) khi col đó có row 14 trống.
        let best = -Infinity;
        for (const c of matching) {
            const cTop = c.y;
            const stacked = matching.some((o) =>
                o !== c && Math.abs((o.y + (o.height ?? 0)) - cTop) < 0.5);
            if (!stacked && cTop > best) best = cTop;
        }
        if (best === -Infinity) {
            // All stacked (vd cột tower nguyên xi, không có gap) → mặt trên cùng.
            best = Math.min(...matching.map((c) => c.y));
        }
        return best * scaleFactor;
    }

    private computeColliderMaxX(): number {
        const mapData = this.scene.cache.json.get(this.config.colliderKey) as TiledMapData | undefined;
        if (!mapData || !mapData.layers) return 0;
        const objectLayer = mapData.layers.find((l: TiledLayer) => l.type === 'objectgroup');
        if (!objectLayer || !objectLayer.objects) return 0;
        const scale = this.scene.scale.height / this.config.tiledOriginalHeight;
        let maxX = 0;
        for (const obj of objectLayer.objects) {
            const right = (obj.x + (obj.width ?? 0)) * scale;
            if (right > maxX) maxX = right;
        }
        return maxX;
    }

    private drawBackdrop(): void {
        const windowHeight = this.scene.scale.height;
        this.bgHeight = windowHeight;

        if (this.config.parallaxBg) {
            // Parallax tự lo visual; village_1.png chỉ còn role placeholder
            // trong asset manifest. Đặt bgWidth=0 để worldWidth chỉ phụ thuộc
            // collider extent (không bị stretch theo bgKey image to hơn).
            this.bgWidth = 0;
            this.drawParallax();
            return;
        }

        const source = this.scene.textures.get(this.config.bgKey).getSourceImage() as { width: number; height: number };
        const scale = windowHeight / source.height;
        this.bgWidth = source.width * scale;

        const bg = this.scene.add.image(0, 0, this.config.bgKey).setOrigin(0, 0);
        bg.setScale(scale);
        bg.setDepth(0);
        bg.setTint(0x888888);
        bg.setAlpha(0.8);
    }

    private drawParallax(): void {
        const cfg = this.config.parallaxBg!;
        const viewW = this.scene.scale.width;
        const viewH = this.scene.scale.height;

        // Sky fill — covers gaps giữa layers, scroll-locked.
        if (cfg.skyColor) {
            const sky = this.scene.add.rectangle(0, 0, viewW, viewH, parseColor(cfg.skyColor))
                .setOrigin(0, 0)
                .setScrollFactor(0)
                .setDepth(-2);
            sky.setData('parallax', true);
        }

        // Layers — vẽ furthest → nearest. Depth -1 → 0 dải để giữ order với
        // platforms (depth 1) và player. tileSprite full-width mỗi layer scroll
        // theo scrollFactor, position cố định trên viewport (origin 0,0 góc top-left).
        cfg.layers.forEach((layer, idx) => this.drawParallaxLayer(layer, idx, viewW, viewH));

        // Overlays (mây, mặt trời) — depth ngay trên layers cuối, dưới platforms.
        if (cfg.overlays) {
            cfg.overlays.forEach((ov, i) => this.drawParallaxOverlay(ov, i));
        }
    }

    private drawParallaxLayer(layer: ParallaxLayerConfig, idx: number, viewW: number, viewH: number): void {
        const tex = this.scene.textures.get(layer.key).getSourceImage() as { width: number; height: number };
        const heightFrac = layer.heightFraction ?? 1;
        const tileH = viewH * heightFrac;
        // Scale tile texture lên cho khớp tileH; tileSprite tile theo width sau scale.
        const scale = tileH / tex.height;
        const y = viewH * (layer.yFraction ?? 0);

        // tileSprite glued tới camera viewport (scrollFactor=0). update() dịch
        // tilePositionX = camera.scrollX*factor → tạo cảm giác parallax. Cách
        // này giữ tileSprite kích thước cố định (= viewport) thay vì cần phủ
        // toàn world width.
        const sprite = this.scene.add.tileSprite(0, y, viewW, tileH, layer.key)
            .setOrigin(0, 0)
            .setScrollFactor(0, 0)
            .setDepth(-1 + idx * 0.01); // -1, -0.99, -0.98, ... ordering stable.
        sprite.setTileScale(scale, scale);

        this.parallaxLayers.push({ sprite, factor: layer.scrollFactor, texScale: scale });
    }

    private drawParallaxOverlay(ov: ParallaxOverlayConfig, idx: number): void {
        const sc = ov.scale ?? 2;
        const viewW = this.scene.scale.width;
        const viewH = this.scene.scale.height;
        const x = ov.xFraction * viewW;
        const y = ov.yFraction * viewH;
        const factor = ov.scrollFactor ?? 0;
        const sprite = this.scene.add.image(x, y, ov.key)
            .setOrigin(0, 0)
            .setScrollFactor(factor, factor)
            .setScale(sc)
            .setDepth(-0.5 + idx * 0.001);

        // Drift mây ngang qua viewport. Khi camera-locked (factor=0) tween dịch
        // theo viewport-space; loop về phía trái rồi reset bên phải vô tận.
        if (ov.drift && ov.drift !== 0) {
            const speed = ov.drift; // px/s
            const targetX = viewW + sprite.displayWidth;
            const distance = targetX - sprite.x;
            this.scene.tweens.add({
                targets: sprite,
                x: targetX,
                duration: Math.max(1, (distance / speed) * 1000),
                ease: 'Linear',
                repeat: -1,
                onRepeat: () => { sprite.x = -sprite.displayWidth; },
            });
        }
    }

    private buildPlatforms(): Phaser.Physics.Arcade.StaticGroup {
        const platforms = this.scene.physics.add.staticGroup();
        const mapData = this.scene.cache.json.get(this.config.colliderKey) as TiledMapData | undefined;

        if (!mapData) {
            const groundY = this.getGroundY();
            const block = this.scene.add.rectangle(this.bgWidth / 2, groundY + 16, this.bgWidth, 40, 0xffffff, 0.001);
            this.scene.physics.add.existing(block, true);
            platforms.add(block);
            return platforms;
        }

        const tiledOriginalHeight = this.config.tiledOriginalHeight;
        const scale = this.scene.scale.height / tiledOriginalHeight;
        const MIN_THICKNESS = 64;
        const EDGE_LIP = 6;

        const objectLayer = mapData.layers.find((l: TiledLayer) => l.type === 'objectgroup');
        if (objectLayer && objectLayer.objects) {
            objectLayer.objects.forEach((obj: TiledObject) => {
                if (!obj.width || !obj.height) return;
                if (obj.width < 8 || obj.height < 4) return;

                let x = obj.x;
                const y = obj.y;
                let w = obj.width;
                let h = obj.height;

                const isGroundFloor = w >= 4000 && (y + h) >= tiledOriginalHeight - 8;

                if (!isGroundFloor) {
                    x -= EDGE_LIP;
                    w += EDGE_LIP * 2;
                    if (h < MIN_THICKNESS) h = MIN_THICKNESS;
                }

                const sx = x * scale;
                const sy = y * scale;
                const sw = w * scale;
                const sh = h * scale;
                const centerX = sx + sw / 2;
                const centerY = sy + sh / 2;

                // Type prefix `solid_` → 4-way collision (NSO walls). Phần
                // sau prefix tra surfaceTextures để vẽ texture (vd `solid_ground`
                // → texture `ground`). Type không có prefix → behavior cũ
                // (one-way platform khi không phải ground floor).
                const rawType = obj.type ?? '';
                const isSolidBlock = rawType.startsWith('solid_');
                const textureType = isSolidBlock ? rawType.slice(6) : rawType;
                const tex = textureType ? this.config.surfaceTextures?.[textureType] : undefined;
                let block: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Rectangle;
                if (tex && this.scene.textures.exists(tex.key)) {
                    block = this.scene.add.tileSprite(centerX, centerY, sw, sh, tex.key).setDepth(1);
                    block.tileScaleX = scale;
                    block.tileScaleY = scale;
                } else {
                    block = this.scene.add.rectangle(centerX, centerY, sw, sh, 0xffffff, 0.001);
                }
                this.scene.physics.add.existing(block, true);

                const body = block.body as Phaser.Physics.Arcade.StaticBody;
                if (!isGroundFloor && !isSolidBlock) {
                    body.checkCollision.down = false;
                    body.checkCollision.left = false;
                    body.checkCollision.right = false;
                }

                platforms.add(block);
            });
        }

        return platforms;
    }
}

function parseColor(hex: string): number {
    const s = hex.startsWith('#') ? hex.slice(1) : hex;
    return parseInt(s, 16);
}
