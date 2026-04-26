import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { AuthScene } from './scenes/AuthScene';
import { CharacterCreateScene } from './scenes/CharacterCreateScene';
import { FirstMapOnboardingScene } from './scenes/FirstMapOnboardingScene';

export const getGameConfig = (parent: string): Phaser.Types.Core.GameConfig => {
    return {
        type: Phaser.AUTO,
        parent: parent,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#0a0a0a',
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
        scene: [AuthScene, CharacterCreateScene, FirstMapOnboardingScene, MainScene]
    };
};
