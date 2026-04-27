import * as Phaser from 'phaser';
import { getCurrentCharacter, saveCurrentCharacter } from '../playerSession';
import { charactersAPI } from '../../network/api';
import type { GameComponent, MapConfig } from './types';
import type { MapBackground } from './MapBackground';

export class PlayerController implements GameComponent {
    private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private playerSprite?: Phaser.GameObjects.Sprite;
    private playerNameText?: Phaser.GameObjects.Text;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private virtualInputs = { left: false, right: false, up: false };
    private scene: Phaser.Scene;
    private config: MapConfig;
    private background: MapBackground;

    constructor(scene: Phaser.Scene, config: MapConfig, background: MapBackground) {
        this.scene = scene;
        this.config = config;
        this.background = background;
    }

    create(): void {
        const spawn = this.background.getGroundY() - 300;
        const hitWidth = 60;
        const hitHeight = 110;
        const hitbox = this.scene.add.rectangle(this.background.getBgWidth() * 0.1, spawn, hitWidth, hitHeight, 0x000000, 0);

        this.scene.physics.add.existing(hitbox, false);
        this.player = hitbox as unknown as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

        if (this.player && this.player.body) {
            this.player.body.setCollideWorldBounds(true);
            this.player.body.setBounce(0);
            this.player.body.debugShowBody = true;
            this.player.body.debugBodyColor = 0xffff00;
        }

        this.playerSprite = this.scene.add.sprite(this.player!.x, this.player!.y, this.config.playerTextureKey);
        this.playerSprite.setScale(0.12);
        this.playerSprite.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.playerSprite.setDepth(10);

        const displayName = getCurrentCharacter()?.displayName || 'Ninja';
        this.playerNameText = this.scene.add.text(this.player!.x, this.player!.y - 65, displayName, {
            fontSize: '14px',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(11);

        this.scene.physics.add.collider(this.player!, this.background.getPlatforms());

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        this.scene.cameras.main.startFollow(this.player!, true, 0.1, 0.1);
        this.scene.cameras.main.setDeadzone(width * 0.1, height * 0.2);
        this.scene.cameras.main.setBounds(0, 0, this.background.getBgWidth(), this.background.getBgHeight());

        this.cursors = this.scene.input.keyboard?.createCursorKeys();

        void this.syncCharacterInfo();
    }

    update(): void {
        if (!this.player || !this.cursors) return;

        if (this.playerSprite) {
            this.playerSprite.setPosition(this.player.x, this.player.y);
        }
        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y - 65);
        }
    }

    getPlayer(): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined { return this.player; }
    getCursors(): Phaser.Types.Input.Keyboard.CursorKeys | undefined { return this.cursors; }
    getVirtualInputs(): { left: boolean; right: boolean; up: boolean } { return this.virtualInputs; }
    getSprite(): Phaser.GameObjects.Sprite | undefined { return this.playerSprite; }

    moveLeft(speed: number): void {
        this.player?.body?.setVelocityX(-speed);
        this.playerSprite?.setFlipX(true);
    }

    moveRight(speed: number): void {
        this.player?.body?.setVelocityX(speed);
        this.playerSprite?.setFlipX(false);
    }

    stopHorizontal(): void {
        this.player?.body?.setVelocityX(0);
    }

    jump(force: number): void {
        this.player?.body?.setVelocityY(-force);
    }

    isOnGround(): boolean {
        if (!this.player?.body) return false;
        return this.player.body.blocked.down || this.player.body.touching.down;
    }

    private async syncCharacterInfo(): Promise<void> {
        let character = getCurrentCharacter();
        if (!character) {
            try {
                const list = await charactersAPI.list();
                if (list.characters.length > 0) {
                    saveCurrentCharacter(list.characters[0]);
                    character = getCurrentCharacter();
                }
            } catch {
                // Keep fallback name if API fails.
            }
        }
        if (character?.displayName && this.playerNameText) {
            this.playerNameText.setText(character.displayName);
        }
    }
}
