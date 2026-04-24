import * as Phaser from 'phaser';
import { getOnboardingGateway } from '../../features/onboarding';
import type { OnboardingState } from '../../features/onboarding/types';
import { charactersAPI, mapsAPI, type MapDetail } from '../../network/api';
import { getCurrentCharacter, saveCurrentCharacter } from '../playerSession';

const FIRST_MAP_ONBOARDING_DONE_KEY = 'kageverse_first_map_onboarding_done';
const TILE = 8;
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 1200;
const PLAYABLE_BOTTOM = WORLD_HEIGHT - 110;
const PLAYER_TEXTURE_KEY = 'player-placeholder-male';
const VILLAGE_BG_KEY = 'map-bg-village-001';

export class FirstMapOnboardingScene extends Phaser.Scene {
    private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private playerNameText?: Phaser.GameObjects.Text;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private statusText?: Phaser.GameObjects.Text;
    private objectiveText?: Phaser.GameObjects.Text;
    private progressText?: Phaser.GameObjects.Text;
    private mapText?: Phaser.GameObjects.Text;
    private rewardText?: Phaser.GameObjects.Text;
    private actionHintText?: Phaser.GameObjects.Text;
    private state?: OnboardingState;
    private mapDetail?: MapDetail;

    constructor() {
        super('FirstMapOnboardingScene');
    }

    preload() {
        this.load.image(PLAYER_TEXTURE_KEY, 'assets/game/characters/placeholder-ninja-male.jpg');
        this.load.image(VILLAGE_BG_KEY, 'assets/maps/village_001/bg.jpg');
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;
        this.cameras.main.setBackgroundColor('#77c6ff');
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, PLAYABLE_BOTTOM);
        this.physics.world.gravity.y = 900;

        this.drawVillageBackdrop();
        const grounds = this.drawVillagePlatforms();
        this.drawVillageProps();
        this.drawMockCharacters();
        this.createPlayer();
        if (this.player) {
            this.physics.add.collider(this.player, grounds);
            this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
            this.cameras.main.setDeadzone(width * 0.35, height * 0.3);
            this.cameras.main.setBounds(0, 0, WORLD_WIDTH, PLAYABLE_BOTTOM);
        }
        this.drawMockHUD();
        this.drawMockControls(width, height);
        this.cursors = this.input.keyboard?.createCursorKeys();

        const centerX = width / 2;
        this.add.text(centerX, 26, 'LANG SUONG KHOI (MOCK PIXEL LAYOUT)', {
            fontSize: '16px',
            color: '#0d2c4a',
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#c7edff',
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
        }).setOrigin(0.5);

        this.statusText = this.add.text(16, 52, 'Dang tai onboarding data...', {
            fontSize: '12px',
            color: '#123047',
            fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.objectiveText = this.add.text(16, 72, '', {
            fontSize: '13px',
            color: '#0b2539',
            fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.progressText = this.add.text(16, 92, '', {
            fontSize: '12px',
            color: '#694400',
            fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.mapText = this.add.text(16, height - 132, '', {
            fontSize: '12px',
            color: '#153d1f',
            fontFamily: 'system-ui, sans-serif',
            lineSpacing: 6,
            backgroundColor: '#dff3e4',
            padding: { left: 8, right: 8, top: 6, bottom: 6 },
        }).setScrollFactor(0);
        this.rewardText = this.add.text(16, height - 58, '', {
            fontSize: '12px',
            color: '#4a3200',
            fontFamily: 'system-ui, sans-serif',
        }).setScrollFactor(0);
        this.actionHintText = this.add.text(width - 16, height - 16, '', {
            fontSize: '12px',
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            lineSpacing: 8,
            align: 'right',
            backgroundColor: '#00000088',
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
        }).setOrigin(1, 1).setScrollFactor(0);

        this.input.keyboard?.on('keydown-Q', () => void this.acceptQuest());
        this.input.keyboard?.on('keydown-E', () => void this.simulateKill());
        this.input.keyboard?.on('keydown-R', () => void this.turnInQuest());
        this.input.keyboard?.on('keydown-ENTER', () => this.enterMainScene());

        void this.syncCharacterInfo();
        void this.loadInitialState();
    }

    private async loadInitialState() {
        try {
            this.mapDetail = await mapsAPI.getDetail('village_001');
            this.state = await getOnboardingGateway().getOnboardingState();
            this.renderState();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Khong tai duoc onboarding';
            this.statusText?.setText(msg).setColor('#ff6b6b');
        }
    }

    private renderState() {
        if (!this.state) return;
        const s = this.state;
        this.statusText?.setText(`Flow: ${s.flowState} | Quest: ${s.mainQuest.state}`);
        this.objectiveText?.setText(`Muc tieu: ${s.nextObjective || this.defaultObjective(s)}`);
        this.progressText?.setText(`Tien do Manh Da Dinh Vi: ${s.mainQuest.currentQty}/${s.mainQuest.requiredQty}`);
        this.mapText?.setText(
            `Map detail (mock API):\n- id: ${this.mapDetail?.mapId ?? 'n/a'}\n- nameKey: ${this.mapDetail?.displayNameKey ?? 'n/a'}\n- type: ${this.mapDetail?.mapType ?? 'n/a'}\n- bg: ${this.mapDetail?.assets.assetFolder}/${this.mapDetail?.assets.backgroundFile}\n- links: ${this.mapDetail?.links.length ?? 0}\nNodes:\n${s.mapNodes.map((n) => `- ${n.id}: ${n.state}`).join('\n')}`
        );
        this.rewardText?.setText(this.renderReward(s));
        this.actionHintText?.setText(this.renderHint(s.flowState));
    }

    private defaultObjective(state: OnboardingState): string {
        if (state.flowState === 'S1') return 'Gap Truong Lang de nhan nhiem vu';
        if (state.flowState === 'S2') return 'Tieu diet quai va thu thap Manh Da Dinh Vi';
        if (state.flowState === 'S3') return 'Quay ve gap Truong Lang de nop nhiem vu';
        if (state.flowState === 'S4') return 'Da mo khoa map moi';
        return 'Tiep tuc hanh trinh';
    }

    private renderReward(state: OnboardingState): string {
        if (!state.reward) return 'Reward: (chua co)';
        const items = state.reward.items.map((i) => `${i.id} x${i.qty}`).join(', ');
        return `Reward: EXP ${state.reward.exp} | Gold ${state.reward.softCurrency} | ${items}`;
    }

    private renderHint(flowState: OnboardingState['flowState']): string {
        if (flowState === 'S1') return '[Q] Nhan quest';
        if (flowState === 'S2') return '[E] Gia lap giet quai';
        if (flowState === 'S3') return '[R] Nop quest';
        if (flowState === 'S4') return '[ENTER] Qua MainScene';
        return '[ENTER] Qua MainScene';
    }

    private async acceptQuest() {
        if (!this.state || this.state.flowState !== 'S1') return;
        this.state = await getOnboardingGateway().acceptMainQuest();
        this.renderState();
    }

    private async simulateKill() {
        if (!this.state || this.state.flowState !== 'S2') return;
        this.state = await getOnboardingGateway().simulateShardDrop();
        this.renderState();
    }

    private async turnInQuest() {
        if (!this.state || this.state.flowState !== 'S3') return;
        this.state = await getOnboardingGateway().turnInMainQuest();
        this.renderState();
    }

    private enterMainScene() {
        if (!this.state) return;
        if (this.state.flowState === 'S4' || this.state.flowState === 'S5') {
            localStorage.setItem(FIRST_MAP_ONBOARDING_DONE_KEY, 'true');
            this.scene.start('MainScene');
        }
    }

    update() {
        if (!this.player || !this.cursors) return;
        const speed = 280;
        const onGround = this.player.body.blocked.down || this.player.body.touching.down;

        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-speed);
            this.player.setFlipX(true);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(speed);
            this.player.setFlipX(false);
        } else {
            this.player.setVelocityX(0);
        }

        if (this.cursors.up.isDown && onGround) {
            this.player.setVelocityY(-520);
        }

        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y - 84);
        }
    }

    private async syncCharacterInfo() {
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

    private createPlayer() {
        const spawn = this.getGroundY() - 340;
        this.player = this.physics.add.sprite(520, spawn, PLAYER_TEXTURE_KEY);
        this.player.setScale(0.24);
        this.player.setCollideWorldBounds(true);
        this.player.setBounce(0);
        this.player.setDepth(10);
        this.player.body.setSize(this.player.width * 0.45, this.player.height * 0.8, true);

        const displayName = getCurrentCharacter()?.displayName || 'Ninja';
        this.playerNameText = this.add.text(this.player.x, this.player.y - 84, displayName, {
            fontSize: '14px',
            color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(11);
    }

    private drawVillageBackdrop() {
        const source = this.textures.get(VILLAGE_BG_KEY).getSourceImage() as { width: number; height: number };
        const bg = this.add.image(0, WORLD_HEIGHT, VILLAGE_BG_KEY).setOrigin(0, 1);
        // Scale đồng nhất để tránh méo ảnh; ưu tiên phủ đủ chiều cao map.
        const scale = Math.max(WORLD_WIDTH / source.width, WORLD_HEIGHT / source.height);
        bg.setScale(scale);
    }

    private drawVillagePlatforms() {
        const platforms = this.physics.add.staticGroup();
        const groundY = this.getGroundY();
        // Giữ lại đường mock để dễ canh map và thấy rõ vùng có thể đứng.
        this.drawPixelBlock(0, groundY, WORLD_WIDTH / TILE, 7, 0x5f4f3e, 0x847463);
        this.drawPixelBlock(0, groundY - TILE, WORLD_WIDTH / TILE, 1, 0x6dbf4b, 0x90d968);
        // Safety floor: luôn có nền đáy để không rơi khỏi màn hình.
        platforms.create(WORLD_WIDTH / 2, groundY + 28, '__WHITE').setDisplaySize(WORLD_WIDTH, 56).setAlpha(0).refreshBody();

        // Road colliders: bám theo con đường trên background để nhân vật đi "lên đường".
        const roadSteps = [
            { x: 260, y: groundY - 130, w: 420, h: 24 },
            { x: 680, y: groundY - 160, w: 360, h: 24 },
            { x: 1040, y: groundY - 190, w: 330, h: 24 },
            { x: 1370, y: groundY - 220, w: 320, h: 24 },
            { x: 1700, y: groundY - 250, w: 300, h: 24 },
            { x: 2010, y: groundY - 235, w: 360, h: 24 },
            { x: 2380, y: groundY - 210, w: 400, h: 24 },
            { x: 2790, y: groundY - 185, w: 360, h: 24 },
        ];
        for (const step of roadSteps) {
            this.drawPixelBlock(
                step.x - step.w / 2,
                step.y - step.h / 2,
                Math.max(1, Math.floor(step.w / TILE)),
                Math.max(1, Math.floor(step.h / TILE)),
                0x756453,
                0x9a8875
            );
            platforms.create(step.x, step.y, '__WHITE').setDisplaySize(step.w, step.h).setAlpha(0).refreshBody();
        }
        return platforms;
    }

    private drawVillageProps() {
        const groundY = this.getGroundY();

        // Tree trunk
        this.drawPixelBlock(34 * TILE, groundY - 17 * TILE, 2, 12, 0x6f3f24, 0x8a5635);
        // Leaf clusters as placeholder dots
        this.drawPixelDots(36 * TILE, groundY - 19 * TILE, 18, 12, 0x33a94f, 70);
        this.drawPixelDots(31 * TILE, groundY - 14 * TILE, 16, 10, 0x3fbe60, 54);
        this.drawPixelDots(40 * TILE, groundY - 13 * TILE, 12, 8, 0xff6aa2, 18);

        // Torii gate mock
        this.drawPixelBlock(2700, groundY - 12 * TILE, 24, 2, 0xc4ae8f, 0xd7c1a3);
        this.drawPixelBlock(2710, groundY - 10 * TILE, 3, 9, 0xbca283, 0xceba9e);
        this.drawPixelBlock(2836, groundY - 10 * TILE, 3, 9, 0xbca283, 0xceba9e);
        this.drawPixelBlock(2727, groundY - 7 * TILE, 15, 4, 0x7a6348, 0x9c815f);

        // House silhouette
        this.drawPixelBlock(2940, groundY - 14 * TILE, 13, 13, 0x85715d, 0xa58d77);
        this.drawPixelBlock(2934, groundY - 16 * TILE, 15, 2, 0x5c6e7e, 0x7f95a8);
        this.drawPixelBlock(2932, groundY - 18 * TILE, 17, 2, 0x4f6070, 0x70869b);

        // River line
        this.drawPixelBlock(0, WORLD_HEIGHT - 95, WORLD_WIDTH / TILE, 2, 0x4f94cc, 0x68b0e7);
    }

    private drawMockCharacters() {
        const groundY = this.getGroundY();
        // Elder NPC
        this.drawPixelSprite(3080, groundY - 6 * TILE, 6, 8, 0x9f2d2d, 0xeac39a);
        this.add.text(3080, groundY - 60, 'Truong Lang', {
            fontSize: '11px',
            color: '#ffe3a3',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9);
    }

    private drawMockHUD() {
        const width = this.scale.width;
        this.drawRoundedRect(14, 14, 186, 48, 0x4d2d13, 0xd59a48);
        this.drawRoundedRect(20, 20, 140, 14, 0x5d1515, 0xff5454);
        this.drawRoundedRect(20, 38, 110, 14, 0x10325a, 0x4da4ff);
        this.add.text(168, 27, '100%', {
            fontSize: '10px',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
        }).setOrigin(1, 0.5);

        this.drawRoundedRect(width - 148, 14, 40, 30, 0x4d2d13, 0xd59a48);
        this.drawRoundedRect(width - 100, 14, 40, 30, 0x4d2d13, 0xd59a48);
        this.drawRoundedRect(width - 52, 14, 40, 30, 0x4d2d13, 0xd59a48);
        this.children.list.slice(-8).forEach((obj) => {
            if ('setScrollFactor' in obj) {
                (obj as Phaser.GameObjects.GameObject & { setScrollFactor: (x: number, y?: number) => void }).setScrollFactor(0);
            }
        });
    }

    private drawMockControls(width: number, height: number) {
        const g = this.add.graphics();
        const drawRing = (x: number, y: number, r: number) => {
            g.fillStyle(0x352313, 0.85);
            g.fillCircle(x, y, r);
            g.lineStyle(3, 0xe29e4a, 1);
            g.strokeCircle(x, y, r);
        };

        drawRing(74, height - 84, 36);
        drawRing(50, height - 58, 18);
        drawRing(98, height - 58, 18);
        drawRing(74, height - 36, 18);

        drawRing(width - 72, height - 78, 34);
        drawRing(width - 130, height - 48, 20);
        drawRing(width - 28, height - 48, 20);

        // Skill slots placeholders
        const slotY = height - 30;
        for (let i = 0; i < 5; i += 1) {
            this.drawRoundedRect(width / 2 - 120 + i * 50, slotY, 42, 24, 0x5c3a19, 0xe29e4a);
            this.drawPixelDots(width / 2 - 118 + i * 50, slotY + 2, 40, 20, 0xd9c39e, 8);
        }
        this.children.list.slice(-20).forEach((obj) => {
            if ('setScrollFactor' in obj) {
                (obj as Phaser.GameObjects.GameObject & { setScrollFactor: (x: number, y?: number) => void }).setScrollFactor(0);
            }
        });
    }

    private drawPixelBlock(x: number, y: number, wTiles: number, hTiles: number, dark: number, light: number) {
        const g = this.add.graphics();
        for (let yy = 0; yy < hTiles; yy += 1) {
            for (let xx = 0; xx < wTiles; xx += 1) {
                g.fillStyle((xx + yy) % 2 === 0 ? dark : light, 1);
                g.fillRect(x + xx * TILE, y + yy * TILE, TILE, TILE);
            }
        }
    }

    private drawPixelDots(x: number, y: number, w: number, h: number, color: number, count: number) {
        const g = this.add.graphics();
        g.fillStyle(color, 1);
        for (let i = 0; i < count; i += 1) {
            const px = x + Math.floor(Math.random() * w);
            const py = y + Math.floor(Math.random() * h);
            g.fillRect(px, py, 2, 2);
        }
    }

    private drawPixelSprite(x: number, y: number, wTiles: number, hTiles: number, bodyColor: number, headColor: number) {
        this.drawPixelBlock(x, y, wTiles, hTiles, bodyColor, bodyColor);
        const g = this.add.graphics();
        g.fillStyle(headColor, 1);
        g.fillRect(x + TILE, y, TILE * 4, TILE * 2);
    }

    private drawRoundedRect(x: number, y: number, w: number, h: number, fill: number, stroke: number) {
        const g = this.add.graphics();
        g.fillStyle(fill, 0.9);
        g.fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, stroke, 1);
        g.strokeRoundedRect(x, y, w, h, 8);
    }

    private getGroundY(): number {
        return PLAYABLE_BOTTOM - 28;
    }
}
