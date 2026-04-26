import * as Phaser from 'phaser';
import { getOnboardingGateway } from '../../features/onboarding';
import type { OnboardingState } from '../../features/onboarding/types';
import {
    charactersAPI,
    // mapsAPI, type MapDetail
} from '../../network/api';
import { getCurrentCharacter, saveCurrentCharacter } from '../playerSession';

const FIRST_MAP_ONBOARDING_DONE_KEY = 'kageverse_first_map_onboarding_done';
const PLAYER_TEXTURE_KEY = 'player-placeholder-male';
const VILLAGE_BG_KEY = 'map-bg-village-001';

export class FirstMapOnboardingScene extends Phaser.Scene {
    private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private playerSprite?: Phaser.GameObjects.Sprite;
    private playerNameText?: Phaser.GameObjects.Text;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private statusText?: Phaser.GameObjects.Text;
    private objectiveText?: Phaser.GameObjects.Text;
    private progressText?: Phaser.GameObjects.Text;
    private rewardText?: Phaser.GameObjects.Text;
    private actionHintText?: Phaser.GameObjects.Text;
    private state?: OnboardingState;
    // private mapDetail?: MapDetail;

    // NPC Interaction State
    private interactingNpc: any | null = null;
    private dialogContainer?: Phaser.GameObjects.Container;
    private dialogOptions: { text: Phaser.GameObjects.Text, bg: Phaser.GameObjects.Graphics, action: () => void }[] = [];
    private selectedOptionIndex: number = 0;
    private npcOptionsTitle?: Phaser.GameObjects.Text;
    private enterKey?: Phaser.Input.Keyboard.Key;
    private npcList: any[] = []; // Chứa danh sách NPC để tính khoảng cách

    // Joystick/Buttons
    private virtualInputs = { left: false, right: false, up: false };

    private minimap?: Phaser.Cameras.Scene2D.Camera;
    private uiElements: Phaser.GameObjects.GameObject[] = [];

    private bgWidth = 3200;
    private bgHeight = 1080;

    constructor() {
        super('FirstMapOnboardingScene');
    }

    preload() {
        this.load.image(PLAYER_TEXTURE_KEY, 'assets/game/characters/placeholder-ninja-male.jpg');
        this.load.image(VILLAGE_BG_KEY, 'assets/maps/village_001/village_1.png');
        this.load.json('village_001_colliders', 'assets/maps/village_001/colliders.json');
        this.load.image('npc_elder', 'assets/game/npcs/village/village_elder.png');
        this.load.image('npc_blacksmith', 'assets/game/npcs/village/blacksmith.png');
        this.load.image('npc_healer', 'assets/game/npcs/village/healer.png');
        this.load.image('npc_merchant', 'assets/game/npcs/village/merchant.png');
        this.load.image('npc_stash', 'assets/game/npcs/village/stash_keeper.png');
        this.load.image('npc_teleporter', 'assets/game/npcs/village/teleporter.png');
        this.load.image('btn_dir', 'assets/game/buttons/dir_btn.png');
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;
        this.cameras.main.setBackgroundColor('#77c6ff');

        // Draw background first, which calculates bgWidth and bgHeight
        this.drawVillageBackdrop();

        // Xóa Hack PaddingBottom đi vì giờ hệ thống va chạm sẽ chặn đúng đỉnh mỏm đá Tiled! 
        this.physics.world.setBounds(0, 0, this.bgWidth, this.bgHeight);
        this.physics.world.gravity.y = 900;

        const grounds = this.drawVillagePlatforms();
        this.drawMockCharacters();
        this.createPlayer();

        // Ép lớp Vẽ Viền Vật Lý (Physics Debug - viền xanh) lặn xuống độ sâu 5, để nhường chỗ cho NPC(8) & Player(10)
        if (this.physics.world.debugGraphic) {
            this.physics.world.debugGraphic.setDepth(5);
        }

        if (this.player) {
            this.physics.add.collider(this.player, grounds);
            // Smoother camera follow, deadzone smaller so player doesn't run off screen
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setDeadzone(width * 0.1, height * 0.2);
            this.cameras.main.setBounds(0, 0, this.bgWidth, this.bgHeight);
        }

        this.drawMockHUD();
        this.drawMockControls(width, height);
        this.cursors = this.input.keyboard?.createCursorKeys();
        this.enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

        this.createDialogUI(width, height);

        const centerX = width / 2;
        this.add.text(centerX, 26, 'LÀNG SƯƠNG KHÓI', {
            fontSize: '16px',
            color: '#0d2c4a',
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#c7edff',
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
        }).setOrigin(0.5).setScrollFactor(0);

        this.statusText = this.add.text(16, 52, 'Đang tải dữ liệu map...', {
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

        // --- CÀI ĐẶT MINIMAP (GÓC PHẢI TRÊN BÊN TRONG CÙNG) ---
        const mmWidth = 150;
        const mmHeight = 100;
        const mmX = width - mmWidth - 10;
        const mmY = 10; // Đè cả lên nút Action phía sau nếu chạm

        const miniBorder = this.add.graphics();
        miniBorder.lineStyle(3, 0xe29e4a, 1);
        miniBorder.strokeRect(mmX, mmY, mmWidth, mmHeight);
        miniBorder.setScrollFactor(0).setDepth(200);

        this.minimap = this.cameras.add(mmX, mmY, mmWidth, mmHeight).setZoom(0.08).setName('mini');
        this.minimap.setBackgroundColor(0x0a1622); // Màu nền tối (Dark Navy) để dễ nhìn

        if (this.player) {
            this.minimap.startFollow(this.player, true, 0.1, 0.1);
            this.minimap.setBounds(0, 0, this.bgWidth, this.bgHeight);
        }

        // Tự động thu thập TOÀN BỘ các cụm UI (Nút, Text, Joystick...) đang làm HUD và Bịt mắt Minimap lại
        this.children.each((child: any) => {
            if (child.scrollFactorX === 0 || child.scrollFactorY === 0) {
                this.uiElements.push(child);
            }
        });
        this.minimap.ignore(this.uiElements);
        // ------ KẾT THÚC CÀI ĐẶT MINIMAP ------

        void this.syncCharacterInfo();
        void this.loadInitialState();
    }

    private async loadInitialState() {
        try {
            // this.mapDetail = await mapsAPI.getDetail('village_001');
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

    private handleInteractAction() {
        if (!this.player) return;

        if (this.interactingNpc) {
            this.executeOption();
            return;
        }

        let closestNpc = null;
        let minDist = Infinity;

        this.npcList.forEach(npc => {
            const dist = Phaser.Math.Distance.Between(this.player!.x, this.player!.y, npc.sprite.x, npc.sprite.y);
            // Khoảng cách 150px = Cự ly chạm / giao tiếp vừa đủ
            if (dist <= 150 && dist < minDist) {
                minDist = dist;
                closestNpc = npc;
            }
        });

        if (closestNpc) {
            this.startNpcInteraction(closestNpc);
        }
    }

    update() {
        if (!this.player || !this.cursors) return;

        if (this.interactingNpc) {
            // Khi đang mở menu NPC: Khóa di chuyển, dùng mũi tên Keyboard để chọn chức năng (Nút UI cũng được nối trực tiếp vào)
            if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
                this.selectedOptionIndex = Math.max(0, this.selectedOptionIndex - 1);
                this.updateOptionHighlight();
            } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
                this.selectedOptionIndex = Math.min(this.dialogOptions.length - 1, this.selectedOptionIndex + 1);
                this.updateOptionHighlight();
            } else if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
                this.handleInteractAction();
            }
            return;
        }

        // --- Kiểm tra tương tác NPC bằng phím Enter ---
        if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.handleInteractAction();
            return;
        }

        const speed = 280;
        const onGround = this.player.body.blocked.down || this.player.body.touching.down;

        const moveLeft = this.cursors.left.isDown || this.virtualInputs.left;
        const moveRight = this.cursors.right.isDown || this.virtualInputs.right;
        const moveUp = this.cursors.up.isDown || this.virtualInputs.up;

        if (moveLeft) {
            this.player.body.setVelocityX(-speed);
            if (this.playerSprite) this.playerSprite.setFlipX(true);
        } else if (moveRight) {
            this.player.body.setVelocityX(speed);
            if (this.playerSprite) this.playerSprite.setFlipX(false);
        } else {
            this.player.body.setVelocityX(0);
        }

        if (moveUp && onGround) {
            this.player.body.setVelocityY(-580);
        }

        if (this.playerSprite) {
            this.playerSprite.setPosition(this.player.x, this.player.y);
        }

        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y - 65);
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
        const spawn = this.getGroundY() - 300;

        // BỎ ẢNH GỐC THÀNH VẬT LÝ, TẠO MỘT KHỐI RECTANGLE CHUẨN MỰC THAY THẾ!
        const hitWidth = 60;
        const hitHeight = 110;
        const hitbox = this.add.rectangle(this.bgWidth * 0.1, spawn, hitWidth, hitHeight, 0x000000, 0); // Vô hình

        this.physics.add.existing(hitbox, false); // Dynamic Body!
        this.player = hitbox as any;  // Lừa Typescript để không phải sửa các hàm Collider cũ

        if (this.player && this.player.body) {
            this.player.body.setCollideWorldBounds(true);
            this.player.body.setBounce(0);

            // NHUỘM VÀNG HITBOX CỦA PLAYER
            this.player.body.debugShowBody = true;
            this.player.body.debugBodyColor = 0xffff00;
        }

        // TẠO VISUAL SPRITE RIÊNG BIỆT: Sẽ tự động follow theo Hitbox qua hàm `update()`
        this.playerSprite = this.add.sprite(this.player!.x, this.player!.y, PLAYER_TEXTURE_KEY);
        this.playerSprite.setScale(0.12);
        this.playerSprite.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.playerSprite.setDepth(10);

        const displayName = getCurrentCharacter()?.displayName || 'Ninja';
        this.playerNameText = this.add.text(this.player!.x, this.player!.y - 65, displayName, {
            fontSize: '14px',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(11);
    }

    private drawVillageBackdrop() {
        const source = this.textures.get(VILLAGE_BG_KEY).getSourceImage() as { width: number; height: number };

        const windowHeight = this.scale.height;
        // Make the image height match the window, or a bit larger if needed
        const scale = windowHeight / source.height;

        this.bgWidth = source.width * scale;
        this.bgHeight = windowHeight;

        const bg = this.add.image(0, 0, VILLAGE_BG_KEY).setOrigin(0, 0);
        bg.setScale(scale);
        bg.setDepth(0);

        // Làm mờ background (dimming) để nổi bật nhân vật và các Tiled Collider
        bg.setTint(0x888888); // Phủ một lớp màu xám tối lên ảnh gốc
        bg.setAlpha(0.8);     // Giảm nhẹ độ đậm đặc của ảnh
    }

    private getGroundY(): number {
        // Căn cứ theo Data Tiled, nền đất trung bình nằm ở mức 1300 trên bản vẽ gốc cao 1440
        // KHÔNG dùng source.height vì ảnh xịn bị bóp xuống 480px, làm nổ hệ tọa độ ngầm dẫn tới sinh sản dưới lòng đất!
        const tiledOriginalHeight = 1440;
        const scale = this.scale.height / tiledOriginalHeight;
        return 1300 * scale;
    }

    private drawVillagePlatforms() {
        const platforms = this.physics.add.staticGroup();

        const mapData = this.cache.json.get('village_001_colliders');
        if (!mapData) {
            const groundY = this.getGroundY();
            const block = this.add.rectangle(this.bgWidth / 2, groundY + 16, this.bgWidth, 40, 0xffffff, 0.001);
            this.physics.add.existing(block, true);
            platforms.add(block);
            return platforms;
        }

        // Tuyệt đối không dùng source.height từ bức ảnh, vì ảnh Background 1 là bản rút gọi 480px.
        // Tọa độ JSON Tiled lại trích xuất trên bản vẽ 1440. Phải convert thẳng theo tỷ lệ 1440!
        const tiledOriginalHeight = 1440;
        const scale = this.scale.height / tiledOriginalHeight;

        const objectLayer = mapData.layers.find((l: any) => l.type === 'objectgroup');
        if (objectLayer && objectLayer.objects) {
            objectLayer.objects.forEach((obj: any) => {
                if (!obj.width || !obj.height) return;

                // Tọa độ gốc X Y của box trong Tiled tính từ viền mép trên bên trái
                const x = obj.x * scale;
                const y = obj.y * scale;
                const w = obj.width * scale;
                const h = obj.height * scale;

                // Trong Phaser, Create Static block sẽ cắm mốc ở tâm (Center)
                const centerX = x + (w / 2);
                const centerY = y + (h / 2);

                // ÉP HIỂN THỊ DEBUG: Nếu alpha = 0, Engine sẽ coi như Vô hình và không vẽ Viền hộp vật lý.
                // Phải nhồi Alpha = 0.001 vào Rectangle, nó gần như vô hình với mắt người nhưng ép Engine phải soi vạch Tím/Xanh!
                const block = this.add.rectangle(centerX, centerY, w, h, 0xffffff, 0.001);
                this.physics.add.existing(block, true); // true = Static Body

                const body = block.body as Phaser.Physics.Arcade.StaticBody;

                // Luật Nhảy xuyên Kageverse: Mặc định TẤT CẢ nền đất (Platform) đều có thể nhảy xuyên từ dưới lên.
                body.checkCollision.down = false;
                body.checkCollision.left = false;
                body.checkCollision.right = false;

                platforms.add(block);
            });
        }

        return platforms;
    }

    private getPlatformYAtX(targetX: number): number {
        const mapData = this.cache.json.get('village_001_colliders');
        if (!mapData || !mapData.layers) return this.getGroundY();

        const objectLayer = mapData.layers.find((l: any) => l.type === 'objectgroup');
        if (!objectLayer || !objectLayer.objects) return this.getGroundY();

        const scaleFactor = this.scale.height / 1440;
        let lowestY = 0; // We want to find the ground path (largest mathematical Y)

        objectLayer.objects.forEach((obj: any) => {
            const objX = obj.x * scaleFactor;
            const objW = obj.width * scaleFactor;
            const objY = obj.y * scaleFactor;

            // X is inside platform horizontally
            if (targetX >= objX && targetX <= objX + objW) {
                // To avoid roofs, we find the lowest platform visually (largest Y value)
                if (objY > lowestY) {
                    lowestY = objY;
                }
            }
        });

        return lowestY === 0 ? this.getGroundY() : lowestY;
    }

    private drawMockCharacters() {
        // Tọa độ x, y dưới đây là tọa độ chuẩn trên file Tiled gốc (1440px). Hệ thống sẽ tự động Scale.
        // Nếu không điền y (bỏ trống hoặc undefined), NPC sẽ tự động rớt xuống thềm đất gần nhất.
        const npcs: { key: string, name: string, x: number, y?: number, offsetY: number }[] = [
            { key: 'npc_blacksmith', name: 'Thợ Rèn', x: 740, y: undefined, offsetY: 0 },
            { key: 'npc_healer', name: 'Y Sĩ', x: 1400, y: undefined, offsetY: 0 },
            { key: 'npc_merchant', name: 'Thương Gia', x: 2600, y: undefined, offsetY: 0 },
            { key: 'npc_stash', name: 'Rương Đồ', x: 3800, y: undefined, offsetY: 0 },
            { key: 'npc_teleporter', name: 'Dịch Chuyển', x: 5000, y: undefined, offsetY: 0 },
            { key: 'npc_elder', name: 'Trưởng Làng', x: 400, y: undefined, offsetY: 0 }
        ];

        const scaleFactor = this.scale.height / 1440;

        npcs.forEach(npc => {
            const scaledX = npc.x * scaleFactor;

            // Lấy y cụ thể do móm vào, hoặc tự quét ra nền đất cao nhất
            let baseSurfaceY = npc.y !== undefined ? (npc.y * scaleFactor) : this.getPlatformYAtX(scaledX);

            const spr = this.add.sprite(scaledX, baseSurfaceY + npc.offsetY, npc.key).setOrigin(0.5, 1).setDepth(8);
            spr.setScale(0.12);

            this.add.text(scaledX, baseSurfaceY + npc.offsetY - (spr.height * 0.12) - 10, npc.name, {
                fontSize: '13px',
                color: '#ffea7a',
                fontFamily: 'system-ui, sans-serif',
                stroke: '#000',
                strokeThickness: 3,
            }).setOrigin(0.5).setDepth(9);

            this.npcList.push({ ...npc, sprite: spr });
        });
    }

    private createDialogUI(width: number, height: number) {
        this.dialogContainer = this.add.container(width / 2, height - 100).setScrollFactor(0).setDepth(100).setVisible(false);

        const panel = this.add.graphics();
        panel.fillStyle(0x3e2723, 0.95);
        panel.fillRoundedRect(-300, -60, 600, 100, 16);
        panel.lineStyle(4, 0x8d6e63, 1);
        panel.strokeRoundedRect(-300, -60, 600, 100, 16);

        this.npcOptionsTitle = this.add.text(-280, -45, '', {
            fontSize: '18px', color: '#ffea7a', stroke: '#000', strokeThickness: 4, fontFamily: 'system-ui, sans-serif'
        });

        this.dialogContainer.add([panel, this.npcOptionsTitle]);
    }

    private startNpcInteraction(npc: any) {
        if (!this.player || !this.dialogContainer || this.interactingNpc) return;

        this.interactingNpc = npc;
        if (this.player.body) {
            this.player.body.setVelocityX(0); // Khóa di chuyển
        }

        this.dialogContainer.setVisible(true);
        this.npcOptionsTitle?.setText(`[ ${npc.name} ]`);

        this.dialogOptions.forEach(opt => { opt.bg.destroy(); opt.text.destroy(); });
        this.dialogOptions = [];
        this.selectedOptionIndex = 0;

        const options = [
            { label: 'Trò chuyện', action: () => this.statusText?.setText(`${npc.name}: Chào mừng đến với Kageverse!`).setColor('#fff') },
            { label: 'Nhận Nhiệm vụ', action: () => { this.acceptQuest(); this.closeNpcInteraction(); } },
            { label: 'Giao dịch', action: () => this.statusText?.setText('Chức năng Cửa Hàng đang nâng cấp!').setColor('#aaaaaa') },
            { label: 'Rời đi', action: () => this.closeNpcInteraction() }
        ];

        let startX = -280;
        options.forEach((opt, idx) => {
            const bg = this.add.graphics();
            const txt = this.add.text(startX + 20, 0, opt.label, {
                fontSize: '16px', color: '#fff', fontFamily: 'system-ui, sans-serif'
            }).setInteractive({ useHandCursor: true });

            txt.on('pointerdown', () => {
                this.selectedOptionIndex = idx;
                this.updateOptionHighlight();
                this.executeOption();
            });

            this.dialogContainer!.add([bg, txt]);
            this.dialogOptions.push({ text: txt, bg: bg, action: opt.action });

            startX += txt.width + 40;
        });

        this.updateOptionHighlight();
    }

    private closeNpcInteraction() {
        this.interactingNpc = null;
        this.dialogContainer?.setVisible(false);
    }

    private updateOptionHighlight() {
        this.dialogOptions.forEach((opt, idx) => {
            opt.bg.clear();
            const isSelected = idx === this.selectedOptionIndex;
            if (isSelected) {
                opt.bg.fillStyle(0x8d6e63, 1);
                opt.bg.fillRoundedRect(opt.text.x - 10, -5, opt.text.width + 20, 26, 4);
                opt.text.setColor('#ffea7a');
            } else {
                opt.text.setColor('#ffffff');
            }
        });
    }

    private executeOption() {
        const opt = this.dialogOptions[this.selectedOptionIndex];
        if (opt) opt.action();
    }

    private drawMockHUD() {
        const width = this.scale.width;
        const bg1 = this.drawRoundedRect(14, 14, 186, 48, 0x4d2d13, 0xd59a48);
        const bg2 = this.drawRoundedRect(20, 20, 140, 14, 0x5d1515, 0xff5454);
        const bg3 = this.drawRoundedRect(20, 38, 110, 14, 0x10325a, 0x4da4ff);
        const txt = this.add.text(168, 27, '100%', {
            fontSize: '10px',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
        }).setOrigin(1, 0.5);

        const bg4 = this.drawRoundedRect(width - 148, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg5 = this.drawRoundedRect(width - 100, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg6 = this.drawRoundedRect(width - 52, 14, 40, 30, 0x4d2d13, 0xd59a48);

        [bg1, bg2, bg3, txt, bg4, bg5, bg6].forEach((obj) => {
            if (obj && 'setScrollFactor' in obj) {
                (obj as Phaser.GameObjects.GameObject & { setScrollFactor: (x: number, y?: number) => void }).setScrollFactor(0);
                (obj as Phaser.GameObjects.GameObject & { setDepth: (z: number) => void }).setDepth(100);
            }
        });
    }

    private drawMockControls(width: number, height: number) {
        const g = this.add.graphics();
        g.setScrollFactor(0); // Fix cứng Graphics vào HUD
        g.setDepth(100);

        const drawRing = (x: number, y: number, r: number) => {
            g.fillStyle(0x352313, 0.85);
            g.fillCircle(x, y, r);
            g.lineStyle(3, 0xe29e4a, 1);
            g.strokeCircle(x, y, r);
        };

        // Phím ảo trái (D-PAD)
        const cx = 80;
        const cy = height - 70;
        const btnScale = 0.15;
        const offset = 54;

        const btnUp = this.add.image(cx, cy - offset, 'btn_dir').setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true }).setScale(btnScale);
        const btnLeft = this.add.image(cx - offset, cy, 'btn_dir').setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true }).setScale(btnScale).setAngle(-90);
        const btnRight = this.add.image(cx + offset, cy, 'btn_dir').setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true }).setScale(btnScale).setAngle(90);

        btnUp.on('pointerdown', () => this.virtualInputs.up = true);
        btnUp.on('pointerup', () => this.virtualInputs.up = false);
        btnUp.on('pointerout', () => this.virtualInputs.up = false);

        btnLeft.on('pointerdown', () => {
            if (this.interactingNpc) {
                this.selectedOptionIndex = Math.max(0, this.selectedOptionIndex - 1);
                this.updateOptionHighlight();
            } else {
                this.virtualInputs.left = true;
            }
        });
        btnLeft.on('pointerup', () => this.virtualInputs.left = false);
        btnLeft.on('pointerout', () => this.virtualInputs.left = false);

        btnRight.on('pointerdown', () => {
            if (this.interactingNpc) {
                this.selectedOptionIndex = Math.min(this.dialogOptions.length - 1, this.selectedOptionIndex + 1);
                this.updateOptionHighlight();
            } else {
                this.virtualInputs.right = true;
            }
        });
        btnRight.on('pointerup', () => this.virtualInputs.right = false);
        btnRight.on('pointerout', () => this.virtualInputs.right = false);

        // Bên phải dải phím Action (Đánh/Tương tác vòng bự nhất)
        drawRing(width - 72, height - 78, 34);
        const actionBtn = this.add.circle(width - 72, height - 78, 34, 0x000, 0).setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true });
        actionBtn.on('pointerdown', () => this.handleInteractAction());

        drawRing(width - 130, height - 48, 20);
        drawRing(width - 28, height - 48, 20);

        // Skill slots placeholders
        const slotY = height - 30;
        for (let i = 0; i < 5; i += 1) {
            const rRect = this.drawRoundedRect(width / 2 - 120 + i * 50, slotY, 42, 24, 0x5c3a19, 0xe29e4a);
            const pDots = this.drawPixelDots(width / 2 - 118 + i * 50, slotY + 2, 40, 20, 0xd9c39e, 8);
            if (rRect) { rRect.setScrollFactor(0); rRect.setDepth(100); }
            if (pDots) { pDots.setScrollFactor(0); pDots.setDepth(100); }
        }
    }

    private drawRoundedRect(x: number, y: number, w: number, h: number, fill: number, stroke: number) {
        const g = this.add.graphics();
        g.fillStyle(fill, 0.9);
        g.fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, stroke, 1);
        g.strokeRoundedRect(x, y, w, h, 8);
        return g;
    }

    private drawPixelDots(x: number, y: number, w: number, h: number, color: number, count: number) {
        const g = this.add.graphics();
        g.fillStyle(color, 1);
        for (let i = 0; i < count; i += 1) {
            const px = x + Math.floor(Math.random() * w);
            const py = y + Math.floor(Math.random() * h);
            g.fillRect(px, py, 2, 2);
        }
        return g;
    }
}
