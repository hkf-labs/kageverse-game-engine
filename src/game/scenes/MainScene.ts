import * as Phaser from 'phaser';
import { wsClient } from '../../network/WebSocketClient';
import { getCurrentCharacter } from '../playerSession';

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private lastSentPosition = { x: 0, y: 0 };
    private worldGrid?: Phaser.GameObjects.Grid;

    constructor() {
        super('MainScene');
    }

    init() {
        const token = localStorage.getItem('kageverse_jwt');
        if (!token) {
            this.scene.start('AuthScene');
            return;
        }
        // WS singleton — connect ở AuthScene sau login. Scene fallback chỉ
        // ensure đã có connection (idempotent).
        if (wsClient.getState() === 'idle' || wsClient.getState() === 'closed') {
            // Caller (AuthScene) thường đã connect. Skip — tránh thiếu callbacks.
        }
    }

    preload() {
        // Create a simple colored texture for the player character placeholder
        const graphics = this.add.graphics();
        graphics.fillStyle(0x00ccff); // Cyan color character
        graphics.fillRoundedRect(0, 0, 32, 32, 8); // Slightly rounded ninja
        graphics.generateTexture('ninja', 32, 32);
        graphics.destroy();
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;

        // Basic World bounds
        this.physics.world.setBounds(0, 0, width, height);

        // Add a background grid to visualize movement
        this.worldGrid = this.add.grid(width / 2, height / 2, width, height, 32, 32, 0x1d1d1d, 1, 0x333333, 1);

        // Create player sprite
        this.player = this.physics.add.sprite(width / 2, height / 2, 'ninja');
        this.player.setCollideWorldBounds(true);
        
        // Add a simple name tag above player
        const displayName = getCurrentCharacter()?.displayName || 'Ninja';
        const nameText = this.add.text(0, 0, displayName, {
            fontSize: '14px', 
            fontFamily: 'system-ui, sans-serif',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        this.player.setData('nameText', nameText);

        // Setup input keyboard
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }

        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        const width = gameSize.width;
        const height = gameSize.height;
        this.physics.world.setBounds(0, 0, width, height);
        if (this.worldGrid) {
            this.worldGrid.setPosition(width / 2, height / 2);
            this.worldGrid.setDisplaySize(width, height);
        }
    }

    update() {
        if (!this.player || !this.cursors) return;

        const speed = 200;
        this.player.setVelocity(0);

        // Movement Logic
        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-speed);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(speed);
        }

        if (this.cursors.up.isDown) {
            this.player.setVelocityY(-speed);
        } else if (this.cursors.down.isDown) {
            this.player.setVelocityY(speed);
        }

        // Lock text position to player position
        const nameText = this.player.getData('nameText') as Phaser.GameObjects.Text;
        if (nameText) {
            nameText.setPosition(this.player.x, this.player.y - 25);
        }

        // Send position logic to WebSocket if position actually changed
        const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            this.lastSentPosition.x, this.lastSentPosition.y
        );

        if (dist > 1) { // Threshold to prevent spamming
            // MainScene là fallback scene (no map_id) — không gửi move qua WS
            // (BE sẽ reject not_in_map). Update local state only.
            this.lastSentPosition.x = this.player.x;
            this.lastSentPosition.y = this.player.y;
        }
    }
}
