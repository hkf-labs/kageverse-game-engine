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

// Scale mode RESIZE — canvas internal size = viewport size (no letterbox bars).
// HUD top-left anchored (HP_BAR.x=105, ...) stays fixed; edge-anchored (Minimap
// top-right, SkillHotbar bottom-center, GameControls bottom-corners, BossHPBar
// top-center) đăng ký `Phaser.Scale.Events.RESIZE` để reposition khi viewport
// đổi. World content (player/monster) dùng world-space coords, camera handles
// viewing — không bị ảnh hưởng resize. DESIGN_* dùng làm baseline cho world
// scale factor (`scale.height / 1440 = 0.5` ở 720p).
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

export const getGameConfig = (parent: string): Phaser.Types.Core.GameConfig => {
    return {
        type: Phaser.AUTO,
        parent: parent,
        backgroundColor: '#0a0a0a',
        // Asset là hi-res art (NPC 1254×1254, BG 1445×720) — KHÔNG phải pixel art.
        // `pixelArt: true` set canvas CSS `image-rendering: pixelated` → khi FIT
        // upscale từ 1280×720 lên viewport thật, browser NEAREST-scale toàn bộ
        // canvas → text mờ, stroke gãy + sprite cứng. Default (pixelArt: false)
        // dùng bilinear smooth scaling → text + art crisp.
        render: {
            antialias: true,
            roundPixels: true,
        },
        scale: {
            mode: Phaser.Scale.RESIZE,
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
