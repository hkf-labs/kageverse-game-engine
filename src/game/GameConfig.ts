import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { AuthScene } from './scenes/AuthScene';
import { CharacterCreateScene } from './scenes/CharacterCreateScene';
import { VillageScene } from './scenes/VillageScene';
import { FireSchoolScene } from './scenes/FireSchoolScene';
import { IceSchoolScene } from './scenes/IceSchoolScene';
import { WindSchoolScene } from './scenes/WindSchoolScene';
import { VillageToFire001Scene } from './scenes/VillageToFire001Scene';
import { VillageToFire002Scene } from './scenes/VillageToFire002Scene';
import { VillageToWind001Scene } from './scenes/VillageToWind001Scene';
import { VillageToWind002Scene } from './scenes/VillageToWind002Scene';
import { VillageToIce001Scene } from './scenes/VillageToIce001Scene';
import { VillageToIce002Scene } from './scenes/VillageToIce002Scene';
import { BambooForestScene } from './scenes/BambooForestScene';
import { RockyHillScene } from './scenes/RockyHillScene';
import { MahoragaBossScene } from './scenes/MahoragaBossScene';

// Design viewport — mọi scene render ở 1280×720 logic pixel; Phaser FIT scale
// canvas khớp viewport thật (giữ aspect 16:9, letterbox khi viewport tỉ lệ
// khác). Lý do dùng FIT thay vì RESIZE: HUD/buttons/items hardcode pixel coord
// (HUD HP_BAR.x=105, Minimap mmWidth=160, ...) — RESIZE giữ nguyên pixel size
// trên mọi màn hình → tí xíu trên 4K, khổng lồ trên 480p. FIT scale toàn bộ
// canvas đồng đều theo viewport, world content (player/monster/NPC dùng
// scale.height/1440 = const 0.5) cũng đồng nhất giữa các thiết bị.
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

export const getGameConfig = (parent: string): Phaser.Types.Core.GameConfig => {
    return {
        type: Phaser.AUTO,
        parent: parent,
        backgroundColor: '#0a0a0a',
        pixelArt: true,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
        },
        dom: {
            createContainer: true
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: false // HIỂN THỊ VIỀN TÍM CỦA HITBOX — bật khi cần debug platform
            }
        },
        scene: [
            AuthScene, CharacterCreateScene, VillageScene,
            FireSchoolScene, IceSchoolScene, WindSchoolScene,
            VillageToFire001Scene, VillageToFire002Scene,
            VillageToWind001Scene, VillageToWind002Scene,
            VillageToIce001Scene, VillageToIce002Scene,
            BambooForestScene, RockyHillScene, MahoragaBossScene, MainScene,
        ]
    };
};
