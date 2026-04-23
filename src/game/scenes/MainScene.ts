import * as Phaser from 'phaser';
import { WebSocketClient } from '../../network/WebSocketClient';

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wsClient: WebSocketClient;
    private lastSentPosition = { x: 0, y: 0 };

    constructor() {
        super('MainScene');
        // Connect to local WebSocket by default (can be updated later via env var)
        this.wsClient = new WebSocketClient('ws://localhost:8080/ws');
    }

    init() {
        this.wsClient.connect();
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
        // Basic World bounds
        this.physics.world.setBounds(0, 0, 800, 600);

        // Add a background grid to visualize movement
        this.add.grid(400, 300, 800, 600, 32, 32, 0x1d1d1d, 1, 0x333333, 1);

        // Create player sprite
        this.player = this.physics.add.sprite(400, 300, 'ninja');
        this.player.setCollideWorldBounds(true);
        
        // Add a simple name tag above player
        const nameText = this.add.text(0, 0, 'Kunai', { 
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
            this.wsClient.sendPosition(Math.round(this.player.x), Math.round(this.player.y));
            this.lastSentPosition.x = this.player.x;
            this.lastSentPosition.y = this.player.y;
        }
    }
}
