import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { AuthScene } from './scenes/AuthScene';

export const getGameConfig = (parent: string): Phaser.Types.Core.GameConfig => {
    return {
        type: Phaser.AUTO,
        parent: parent,
        width: 800,
        height: 600,
        backgroundColor: '#0a0a0a',
        dom: {
            createContainer: true
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: false
            }
        },
        scene: [AuthScene, MainScene]
    };
};
