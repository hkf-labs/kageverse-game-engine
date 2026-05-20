import * as Phaser from 'phaser';

/** Lề world (px) — target vẫn “trong tầm nhìn” khi sát mép camera. */
const VIEW_MARGIN_PX = 64;

/** Điểm world có nằm trong khung camera chính (dùng bỏ select loot/quái). */
export function isPointInMainCameraView(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    marginPx = VIEW_MARGIN_PX,
): boolean {
    const view = scene.cameras.main.worldView;
    return (
        worldX >= view.x - marginPx
        && worldX <= view.right + marginPx
        && worldY >= view.y - marginPx
        && worldY <= view.bottom + marginPx
    );
}
