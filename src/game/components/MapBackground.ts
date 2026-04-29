import * as Phaser from 'phaser';
import type { GameComponent, MapConfig, TiledMapData, TiledLayer, TiledObject } from './types';

export class MapBackground implements GameComponent {
    private bgWidth = 3200;
    private bgHeight = 1080;
    private worldWidth = 3200; // max(bgWidth, collider extent) — player chạy được tới đây
    private platforms!: Phaser.Physics.Arcade.StaticGroup;
    private scene: Phaser.Scene;
    private config: MapConfig;

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
        let lowestY = 0;

        objectLayer.objects.forEach((obj: TiledObject) => {
            const objX = obj.x * scaleFactor;
            const objW = obj.width * scaleFactor;
            const objY = obj.y * scaleFactor;
            if (targetX >= objX && targetX <= objX + objW) {
                if (objY > lowestY) lowestY = objY;
            }
        });

        return lowestY === 0 ? this.getGroundY() : lowestY;
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
        const source = this.scene.textures.get(this.config.bgKey).getSourceImage() as { width: number; height: number };
        const windowHeight = this.scene.scale.height;
        const scale = windowHeight / source.height;

        this.bgWidth = source.width * scale;
        this.bgHeight = windowHeight;

        const bg = this.scene.add.image(0, 0, this.config.bgKey).setOrigin(0, 0);
        bg.setScale(scale);
        bg.setDepth(0);
        bg.setTint(0x888888);
        bg.setAlpha(0.8);
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
        const MIN_THICKNESS = 80;
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

                const block = this.scene.add.rectangle(centerX, centerY, sw, sh, 0xffffff, 0.001);
                this.scene.physics.add.existing(block, true);

                const body = block.body as Phaser.Physics.Arcade.StaticBody;
                if (!isGroundFloor) {
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
