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

export const getGameConfig = (parent: string): Phaser.Types.Core.GameConfig => {
    return {
        type: Phaser.AUTO,
        parent: parent,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#0a0a0a',
        pixelArt: true,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        dom: {
            createContainer: true
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: true // HIỂN THỊ VIỀN TÍM CỦA HITBOX
            }
        },
        scene: [
            AuthScene, CharacterCreateScene, VillageScene,
            FireSchoolScene, IceSchoolScene, WindSchoolScene,
            VillageToFire001Scene, VillageToFire002Scene,
            VillageToWind001Scene, VillageToWind002Scene,
            VillageToIce001Scene, VillageToIce002Scene,
            BambooForestScene, RockyHillScene, MainScene,
        ]
    };
};
