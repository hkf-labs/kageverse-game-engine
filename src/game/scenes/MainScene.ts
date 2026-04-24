import * as Phaser from 'phaser';
import { WebSocketClient } from '../../network/WebSocketClient';
import { getCurrentCharacter } from '../playerSession';

function normalizeWsBase(rawBase: string): string {
    const trimmed = rawBase.trim();
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
        ? trimmed
        : `${window.location.protocol}//${trimmed}`;
    const url = new URL(withProtocol);

    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';

    // Browser chay tren HTTPS thi khong nen mo ws:// (mixed/insecure).
    if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
        url.protocol = 'wss:';
    }

    // Render thuong expose qua 443, port 8080 hay bi fail tu browser public.
    if (url.hostname.endsWith('.onrender.com') && url.port === '8080') {
        url.port = '';
    }

    return `${url.protocol}//${url.host}`;
}

function buildWsUrl(token: string): string {
    const envWsBase = String(import.meta.env.VITE_WS_BASE_URL || '').trim();
    const envApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
    const base = envWsBase || envApiBase || window.location.origin;
    const normalizedBase = normalizeWsBase(base);
    return `${normalizedBase}/ws?token=${encodeURIComponent(token)}`;
}

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wsClient!: WebSocketClient;
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

        const wsUrl = buildWsUrl(token);
        this.wsClient = new WebSocketClient(wsUrl);
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
            this.wsClient.sendPosition(Math.round(this.player.x), Math.round(this.player.y));
            this.lastSentPosition.x = this.player.x;
            this.lastSentPosition.y = this.player.y;
        }
    }
}
