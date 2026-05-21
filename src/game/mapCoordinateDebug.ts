import * as Phaser from 'phaser';
import type { MapConfig } from './components/types';
import { businessVecToRender } from './spawn';

/** Bật lưới + HUD tọa độ: `.env` đặt `VITE_GAME_DEBUG=true` rồi restart dev server. */
export function isMapDebugEnabled(): boolean {
    const v = import.meta.env.VITE_GAME_DEBUG;
    return v === 'true' || v === '1';
}

function renderToBusiness(
    renderX: number,
    renderY: number,
    mapHeight: number,
    viewportHeight: number,
): { x: number; y: number } {
    const scale = viewportHeight / mapHeight;
    return {
        x: renderX / scale,
        y: mapHeight - renderY / scale,
    };
}

/**
 * Overlay debug cho map scene: lưới world (scroll theo camera), trục gốc Phaser
 * (0,0) góc trên-trái, HUD render + business + tiled raw, vị trí chuột.
 */
export class MapCoordinateDebug {
    private grid?: Phaser.GameObjects.Grid;
    private axisGfx?: Phaser.GameObjects.Graphics;
    private hudText?: Phaser.GameObjects.Text;
    private mapBusinessHeight?: number;
    private pointerRender = { x: 0, y: 0 };
    private scene: Phaser.Scene;
    private getMapConfig: () => MapConfig;
    private getPlayer: () => Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined;

    constructor(
        scene: Phaser.Scene,
        getMapConfig: () => MapConfig,
        getPlayer: () => Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined,
    ) {
        this.scene = scene;
        this.getMapConfig = getMapConfig;
        this.getPlayer = getPlayer;
    }

    setMapBusinessHeight(height: number | undefined): void {
        this.mapBusinessHeight = height;
    }

    create(worldWidth: number, worldHeight: number): void {
        const cfg = this.getMapConfig();
        const scale = this.scene.scale.height / cfg.tiledOriginalHeight;
        const step = Math.max(32, Math.round(100 * scale));

        this.grid = this.scene.add.grid(
            worldWidth / 2,
            worldHeight / 2,
            worldWidth,
            worldHeight,
            step,
            step,
            0x000000,
            0,
            0x44ff88,
            0.22,
        );
        this.grid.setDepth(100);
        this.grid.setScrollFactor(1);

        this.axisGfx = this.scene.add.graphics().setDepth(101).setScrollFactor(1);
        this.axisGfx.lineStyle(2, 0xff6666, 0.85);
        this.axisGfx.lineBetween(0, 0, worldWidth, 0);
        this.axisGfx.lineStyle(2, 0x66aaff, 0.85);
        this.axisGfx.lineBetween(0, 0, 0, worldHeight);
        this.axisGfx.fillStyle(0xffee88, 1);
        this.axisGfx.fillCircle(0, 0, 6);

        this.hudText = this.scene.add.text(8, 8, '', {
            fontSize: '11px',
            fontFamily: 'ui-monospace, monospace',
            color: '#bfffcf',
            backgroundColor: '#000000cc',
            padding: { left: 6, right: 6, top: 4, bottom: 4 },
        }).setScrollFactor(0).setDepth(1000);

        this.scene.input.on('pointermove', this.onPointerMove, this);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }

    private onPointerMove(pointer: Phaser.Input.Pointer): void {
        this.pointerRender.x = pointer.worldX;
        this.pointerRender.y = pointer.worldY;
    }

    update(): void {
        if (!this.hudText) return;
        const cfg = this.getMapConfig();
        const vh = this.scene.scale.height;
        const tiledH = cfg.tiledOriginalHeight;
        const scale = vh / tiledH;
        const bizH = this.mapBusinessHeight ?? tiledH;

        const lines: string[] = [
            `[DEBUG] map=${cfg.mapId}  grid=100 tiled units  origin=top-left (Phaser)`,
            `viewport ${Math.round(this.scene.scale.width)}×${Math.round(vh)}  scale=${scale.toFixed(4)}`,
        ];

        const player = this.getPlayer();
        if (player) {
            const biz = renderToBusiness(player.x, player.y + 22, bizH, vh);
            lines.push(
                `player render: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`,
                `player business (API h=${bizH}): (${biz.x.toFixed(1)}, ${biz.y.toFixed(1)})`,
                `player tiled raw: (${(player.x / scale).toFixed(1)}, ${(player.y / scale).toFixed(1)})`,
            );
        }

        const ptrBiz = renderToBusiness(this.pointerRender.x, this.pointerRender.y, bizH, vh);
        lines.push(
            `pointer render: (${this.pointerRender.x.toFixed(1)}, ${this.pointerRender.y.toFixed(1)})`,
            `pointer business: (${ptrBiz.x.toFixed(1)}, ${ptrBiz.y.toFixed(1)})`,
        );

        const hub = businessVecToRender({ x: 400, y: 96 }, bizH, vh);
        lines.push(`hub ref business(400,96)→render(${hub.x.toFixed(0)},${hub.y.toFixed(0)})`);

        this.hudText.setText(lines.join('\n'));
    }

    destroy(): void {
        this.scene.input.off('pointermove', this.onPointerMove, this);
        this.grid?.destroy();
        this.axisGfx?.destroy();
        this.hudText?.destroy();
        this.grid = undefined;
        this.axisGfx = undefined;
        this.hudText = undefined;
    }
}

/** Viền hitbox Arcade (tím) — bật khi VITE_GAME_DEBUG=true. */
export function applyPhysicsDebugToBody(
    body: Phaser.Physics.Arcade.Body | null | undefined,
): void {
    if (!body) return;
    body.debugShowBody = isMapDebugEnabled();
}
