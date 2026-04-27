import * as Phaser from 'phaser';
import { getOnboardingGateway } from '../../features/onboarding';
import type { OnboardingState } from '../../features/onboarding/types';
import {
    charactersAPI,
    // mapsAPI, type MapDetail
} from '../../network/api';
import { getCurrentCharacter, saveCurrentCharacter } from '../playerSession';

interface NpcEntry {
    key: string;
    name: string;
    x: number;
    y?: number;
    offsetY: number;
    sprite: Phaser.GameObjects.Sprite;
    nameText: Phaser.GameObjects.Text;
}

interface TiledObject {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface TiledLayer {
    type: string;
    objects?: TiledObject[];
}

interface TiledMapData {
    layers: TiledLayer[];
}

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
    private interactingNpc: NpcEntry | null = null;
    private selectedNpc: NpcEntry | null = null;
    private selectionIndicator?: Phaser.GameObjects.Graphics;
    private autoMoveTargetX: number | null = null;
    private dialogContainer?: Phaser.GameObjects.Container;
    private dialogOptions: { text: Phaser.GameObjects.Text, bg: Phaser.GameObjects.Graphics, action: () => void }[] = [];
    private selectedOptionIndex: number = 0;
    private npcOptionsTitle?: Phaser.GameObjects.Text;
    private enterKey?: Phaser.Input.Keyboard.Key;
    private npcList: NpcEntry[] = [];
    private readonly INTERACT_RANGE = 150;

    // Joystick/Buttons
    private virtualInputs = { left: false, right: false, up: false };
    private switchTargetBtn?: { bg: Phaser.GameObjects.Arc, txt: Phaser.GameObjects.Text };
    private dirBtns: { g: Phaser.GameObjects.Graphics, dir: 'left' | 'right' | 'up', cx: number, cy: number, r: number }[] = [];

    // Chat & Menu
    private chatOverlay?: HTMLDivElement;
    private chatRootEl?: HTMLDivElement;
    private chatInputEl?: HTMLInputElement;
    private chatMessagesEl?: HTMLDivElement;
    private chatVisible = false;
    private menuPanel?: Phaser.GameObjects.Container;

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
        this.load.image('btn_attack', 'assets/game/buttons/button-attack.png');
        this.load.image('btn_chat', 'assets/game/buttons/chat.png');
        this.load.image('btn_menu', 'assets/game/buttons/menu.png');
        this.load.image('topbar', 'assets/game/ui/topbar.png');
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;
        this.cameras.main.setBackgroundColor('#77c6ff');

        // Draw background first, which calculates bgWidth and bgHeight
        this.drawVillageBackdrop();

        // Xóa Hack PaddingBottom đi vì giờ hệ thống va chạm sẽ chặn đúng đỉnh mỏm đá Tiled!
        this.physics.world.setBounds(0, 0, this.bgWidth, this.bgHeight);
        // Tắt va chạm mép TRÊN của world: player đứng/nhảy trên platform cao không còn bị đè đầu vô hình.
        // Gravity vẫn tự kéo player rớt lại nên không cần "trần" giả.
        this.physics.world.setBoundsCollision(true, true, false, true);
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
            // Camera bám đúng khung map: chỉ lia tới đâu còn ảnh tới đó. Phần trên cùng map
            // vẫn vô vụ va chạm (đã tắt setBoundsCollision top), nên player nhảy vượt mép trên
            // chỉ bị viewport cắt phần đầu, không lộ vùng trống ngoài map.
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

        this.input.keyboard?.on('keydown-Q', () => { if (!this.isChatFocused()) void this.acceptQuest(); });
        this.input.keyboard?.on('keydown-E', () => { if (!this.isChatFocused()) void this.simulateKill(); });
        this.input.keyboard?.on('keydown-R', () => { if (!this.isChatFocused()) void this.turnInQuest(); });
        this.input.keyboard?.on('keydown-ENTER', () => { if (!this.isChatFocused()) this.enterMainScene(); });

        // --- CÀI ĐẶT MINIMAP (GÓC PHẢI TRÊN BÊN TRONG CÙNG) ---
        const mmWidth = 160;
        const mmHeight = 110;
        const mmX = width - mmWidth - 16;
        const mmY = 26;
        const titleH = 18;

        // Drop shadow
        const miniShadow = this.add.graphics();
        miniShadow.fillStyle(0x000000, 0.45);
        miniShadow.fillRoundedRect(mmX - 4, mmY - titleH - 4 + 4, mmWidth + 12, mmHeight + titleH + 12, 10);
        miniShadow.setScrollFactor(0).setDepth(199);

        // Bronze frame backdrop with title bar
        const miniFrame = this.add.graphics();
        miniFrame.fillStyle(0x3d2010, 1);
        miniFrame.fillRoundedRect(mmX - 6, mmY - titleH - 6, mmWidth + 12, mmHeight + titleH + 12, 10);
        miniFrame.fillStyle(0x4d2d13, 1);
        miniFrame.fillRoundedRect(mmX - 4, mmY - titleH - 4, mmWidth + 8, titleH, 6);
        miniFrame.lineStyle(3, 0xe29e4a, 1);
        miniFrame.strokeRoundedRect(mmX - 6, mmY - titleH - 6, mmWidth + 12, mmHeight + titleH + 12, 10);
        miniFrame.setScrollFactor(0).setDepth(200);

        this.add.text(mmX + mmWidth / 2, mmY - titleH / 2 - 4, 'BẢN ĐỒ', {
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        // Inner double border
        const miniInner = this.add.graphics();
        miniInner.lineStyle(2, 0xd59a48, 1);
        miniInner.strokeRect(mmX, mmY, mmWidth, mmHeight);
        miniInner.lineStyle(1, 0xffe2a8, 0.5);
        miniInner.strokeRect(mmX + 2, mmY + 2, mmWidth - 4, mmHeight - 4);
        miniInner.setScrollFactor(0).setDepth(202);

        // Zoom = mmHeight / bgHeight để view minimap khớp đúng chiều cao map (không lộ vùng đen)
        const mmZoom = mmHeight / this.bgHeight;
        this.minimap = this.cameras.add(mmX, mmY, mmWidth, mmHeight).setZoom(mmZoom).setName('mini');
        this.minimap.setBackgroundColor(0x0a1622); // Màu nền tối (Dark Navy) để dễ nhìn

        if (this.player) {
            this.minimap.startFollow(this.player, true, 0.1, 0.1);
            this.minimap.setBounds(0, 0, this.bgWidth, this.bgHeight);
        }

        // Player blip ở giữa minimap (do camera follow nên player luôn ở center)
        const miniBlip = this.add.circle(mmX + mmWidth / 2, mmY + mmHeight / 2, 4, 0xff5454)
            .setStrokeStyle(2, 0xffffff);
        miniBlip.setScrollFactor(0).setDepth(203);

        // Pulse animation cho blip để dễ thấy
        this.tweens.add({
            targets: miniBlip,
            scale: { from: 1, to: 1.6 },
            alpha: { from: 1, to: 0.6 },
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // 2 nút Chat / Menu đặt ngay dưới minimap, căn giữa với khung minimap.
        this.createChatMenuButtons(mmX, mmY, mmWidth, mmHeight);
        this.createChatPanel();
        this.createMenuPanel(width);

        // Tự động thu thập TOÀN BỘ các cụm UI (Nút, Text, Joystick...) đang làm HUD và Bịt mắt Minimap lại
        this.children.each((child: Phaser.GameObjects.GameObject) => {
            const scrollable = child as Phaser.GameObjects.GameObject & { scrollFactorX?: number; scrollFactorY?: number };
            if (scrollable.scrollFactorX === 0 || scrollable.scrollFactorY === 0) {
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

        if (!this.selectedNpc) return;

        const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            this.selectedNpc.sprite.x, this.selectedNpc.sprite.y
        );

        if (dist <= this.INTERACT_RANGE) {
            this.startNpcInteraction(this.selectedNpc);
        } else {
            // Quá xa: tự chạy đến NPC đã chọn
            this.autoMoveTargetX = this.selectedNpc.sprite.x;
        }
    }

    update() {
        if (!this.player || !this.cursors) return;

        // Update visual cho các nút di chuyển dựa vào keyboard + virtual input.
        this.updateDirBtnVisuals();

        // Khi đang gõ chat → khóa di chuyển/tương tác phím (DOM input vẫn nhận key bình thường).
        if (this.isChatFocused()) {
            if (this.player.body) this.player.body.setVelocityX(0);
            return;
        }

        // Cập nhật trạng thái nút Switch Target: dim khi không thể đổi đối tượng.
        if (this.switchTargetBtn) {
            const canSwitch = this.canCycleTarget();
            this.switchTargetBtn.bg.setAlpha(canSwitch ? 1 : 0.4);
            this.switchTargetBtn.txt.setAlpha(canSwitch ? 1 : 0.5);
            (this.switchTargetBtn.bg as Phaser.GameObjects.Arc & { disabled?: boolean }).disabled = !canSwitch;
        }

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

        // Auto-move tới NPC đang chọn (nếu được kích hoạt)
        if (this.autoMoveTargetX !== null) {
            // Nếu user đụng phím di chuyển thì hủy auto-move
            if (moveLeft || moveRight || moveUp) {
                this.autoMoveTargetX = null;
            } else if (this.selectedNpc) {
                const dx = this.autoMoveTargetX - this.player.x;
                const dist = Phaser.Math.Distance.Between(
                    this.player.x, this.player.y,
                    this.selectedNpc.sprite.x, this.selectedNpc.sprite.y
                );
                if (dist <= this.INTERACT_RANGE) {
                    this.player.body.setVelocityX(0);
                    const target = this.selectedNpc;
                    this.autoMoveTargetX = null;
                    this.startNpcInteraction(target);
                } else {
                    this.player.body.setVelocityX(dx > 0 ? speed : -speed);
                    if (this.playerSprite) this.playerSprite.setFlipX(dx < 0);
                }
            } else {
                this.autoMoveTargetX = null;
            }
        } else if (moveLeft) {
            this.player.body.setVelocityX(-speed);
            if (this.playerSprite) this.playerSprite.setFlipX(true);
        } else if (moveRight) {
            this.player.body.setVelocityX(speed);
            if (this.playerSprite) this.playerSprite.setFlipX(false);
        } else {
            this.player.body.setVelocityX(0);
        }

        if (moveUp && onGround && this.autoMoveTargetX === null) {
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
        this.player = hitbox as unknown as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

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

        const mapData = this.cache.json.get('village_001_colliders') as TiledMapData | undefined;
        if (!mapData) {
            const groundY = this.getGroundY();
            const block = this.add.rectangle(this.bgWidth / 2, groundY + 16, this.bgWidth, 40, 0xffffff, 0.001);
            this.physics.add.existing(block, true);
            platforms.add(block);
            return platforms;
        }

        // JSON Tiled trích xuất trên bản vẽ gốc 1440px → quy đổi về scale màn hình hiện tại.
        const tiledOriginalHeight = 1440;
        const scale = this.scale.height / tiledOriginalHeight;

        // Đảm bảo độ dày tối thiểu cho platform: chống "lọt" khi rơi nhanh.
        // Vì one-way platform không kiểm tra mặt đáy, kéo dài xuống dưới là vô hình với người chơi.
        const MIN_THICKNESS = 80;
        // Lip 2 bên giúp đáp xuống mép platform mượt hơn, không bị "trượt" ngay sát rìa.
        const EDGE_LIP = 6;

        const objectLayer = mapData.layers.find((l: TiledLayer) => l.type === 'objectgroup');
        if (objectLayer && objectLayer.objects) {
            objectLayer.objects.forEach((obj: TiledObject) => {
                if (!obj.width || !obj.height) return;
                if (obj.width < 8 || obj.height < 4) return; // Bỏ qua collider vụn

                let x = obj.x;
                const y = obj.y;
                let w = obj.width;
                let h = obj.height;

                // Sàn nền chính: rộng gần phủ map và đáy chạm sát bottom của bản vẽ Tiled.
                const isGroundFloor = w >= 4000 && (y + h) >= tiledOriginalHeight - 8;

                if (!isGroundFloor) {
                    x -= EDGE_LIP;
                    w += EDGE_LIP * 2;
                    if (h < MIN_THICKNESS) h = MIN_THICKNESS;
                }

                const sx = x * scale;
                const sy = y * scale;
                const sw = w * scale;
                const sh = h * scale;

                const centerX = sx + sw / 2;
                const centerY = sy + sh / 2;

                // Alpha 0.001 = gần như tàng hình với mắt người, nhưng vẫn ép Engine vẽ debug overlay khi bật.
                const block = this.add.rectangle(centerX, centerY, sw, sh, 0xffffff, 0.001);
                this.physics.add.existing(block, true);

                const body = block.body as Phaser.Physics.Arcade.StaticBody;

                if (!isGroundFloor) {
                    // Luật Nhảy xuyên Kageverse: Platform lửng cho phép nhảy xuyên từ dưới lên.
                    body.checkCollision.down = false;
                    body.checkCollision.left = false;
                    body.checkCollision.right = false;
                }
                // Sàn nền chính giữ va chạm 4 hướng → đứng vững, không bao giờ lọt khỏi đáy map.

                platforms.add(block);
            });
        }

        return platforms;
    }

    private getPlatformYAtX(targetX: number): number {
        const mapData = this.cache.json.get('village_001_colliders') as TiledMapData | undefined;
        if (!mapData || !mapData.layers) return this.getGroundY();

        const objectLayer = mapData.layers.find((l: TiledLayer) => l.type === 'objectgroup');
        if (!objectLayer || !objectLayer.objects) return this.getGroundY();

        const scaleFactor = this.scale.height / 1440;
        let lowestY = 0;

        objectLayer.objects.forEach((obj: TiledObject) => {
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

    private getTextureBottomPadding(key: string): number {
        const tex = this.textures.get(key);
        const src = tex?.getSourceImage() as (HTMLImageElement | HTMLCanvasElement | undefined);
        if (!src || !('width' in src)) return 0;
        const w = src.width;
        const h = src.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 0;
        try {
            ctx.drawImage(src as CanvasImageSource, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;
            for (let y = h - 1; y >= 0; y--) {
                for (let x = 0; x < w; x++) {
                    if (data[(y * w + x) * 4 + 3] > 5) return h - 1 - y;
                }
            }
        } catch {
            return 0;
        }
        return 0;
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
        const SPRITE_SCALE = 0.12;
        // Player visual chìm khoảng 3-4px dưới mặt platform (do hitbox 110 vs sprite ~117 cao). NPC khớp theo cùng mức.
        const PLAYER_VISUAL_SINK = 4;

        npcs.forEach(npc => {
            const scaledX = npc.x * scaleFactor;

            // Lấy y cụ thể do móm vào, hoặc tự quét ra nền đất cao nhất
            const baseSurfaceY = npc.y !== undefined ? (npc.y * scaleFactor) : this.getPlatformYAtX(scaledX);

            // Bù khoảng trong suốt phía dưới của ảnh NPC để feet thực sự chạm mặt platform
            const bottomPadPx = this.getTextureBottomPadding(npc.key) * SPRITE_SCALE;
            const groundedY = baseSurfaceY + bottomPadPx + PLAYER_VISUAL_SINK + npc.offsetY;

            const spr = this.add.sprite(scaledX, groundedY, npc.key).setOrigin(0.5, 1).setDepth(8);
            spr.setScale(SPRITE_SCALE);
            spr.setInteractive({ useHandCursor: true });

            const nameText = this.add.text(scaledX, groundedY - (spr.height * SPRITE_SCALE) - 10, npc.name, {
                fontSize: '13px',
                color: '#ffea7a',
                fontFamily: 'system-ui, sans-serif',
                stroke: '#000',
                strokeThickness: 3,
            }).setOrigin(0.5).setDepth(9);

            const npcEntry = { ...npc, sprite: spr, nameText };
            spr.on('pointerdown', () => this.selectNpc(npcEntry));
            this.npcList.push(npcEntry);
        });

        // Marker hiển thị NPC đang được chọn (mũi tên + ring dưới chân)
        this.selectionIndicator = this.add.graphics().setDepth(9).setVisible(false);
    }

    private useHpPotion() {
        // Placeholder: gameplay HP regen sẽ nối ở giai đoạn sau.
        this.statusText?.setText('Đã dùng bình HP! (placeholder)').setColor('#ff8a8a');
    }

    private useMpPotion() {
        this.statusText?.setText('Đã dùng bình MP! (placeholder)').setColor('#8aaaff');
    }

    private getVisibleNpcs(): NpcEntry[] {
        // Dùng scrollX + camera.width thay vì worldView để tránh stale data ở frame đầu.
        // Bỏ Y-check: tất cả NPC đều ở ground level, sprite.y có thể bị đẩy vượt view.bottom
        // 1 chút do bottomPadPx + PLAYER_VISUAL_SINK → sẽ bị loại oan nếu check Y chặt.
        const cam = this.cameras.main;
        const viewLeft = cam.scrollX;
        const viewRight = cam.scrollX + cam.width;
        return this.npcList
            .filter((n) => {
                const halfW = (n.sprite.displayWidth || 0) / 2;
                const npcRight = n.sprite.x + halfW;
                const npcLeft = n.sprite.x - halfW;
                // Visible nếu sprite chồng lấn với viewport theo trục X.
                return npcRight >= viewLeft && npcLeft <= viewRight;
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    }

    private canCycleTarget(): boolean {
        if (this.interactingNpc) return false;
        // Chỉ có ý nghĩa khi viewport có ≥2 NPC: 1 NPC thì không có gì để "chuyển đổi" sang.
        return this.getVisibleNpcs().length >= 2;
    }

    private cycleSelectedNpc() {
        if (!this.canCycleTarget()) return;
        const visible = this.getVisibleNpcs(); // đã sort a-z

        // Chưa chọn ai → chọn người đầu tiên theo alphabet.
        if (!this.selectedNpc) {
            this.selectNpc(visible[0]);
            return;
        }

        const currentIdx = visible.indexOf(this.selectedNpc);
        // Selected hiện tại đã ra khỏi viewport → bắt đầu lại từ first.
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visible.length;
        this.selectNpc(visible[nextIdx]);
    }

    private isChatFocused(): boolean {
        return this.chatVisible || (!!this.chatRootEl && this.chatRootEl.contains(document.activeElement));
    }

    private redrawDirBtn(btn: { g: Phaser.GameObjects.Graphics, dir: 'left' | 'right' | 'up', cx: number, cy: number, r: number }, active: boolean) {
        const { g, dir, cx, cy, r } = btn;
        g.clear();
        // Vòng nền + viền (style đồng nhất với attack/HP/MP/menu)
        g.fillStyle(active ? 0x6b3a14 : 0x352313, 0.92);
        g.fillCircle(cx, cy, r);
        g.lineStyle(3, active ? 0xffea7a : 0xe29e4a, 1);
        g.strokeCircle(cx, cy, r);

        // Mũi tên tam giác
        const arrowColor = active ? 0xffea7a : 0xe29e4a;
        const arm = r * 0.5;
        g.fillStyle(arrowColor, 1);
        g.lineStyle(2, 0x000000, 0.5);
        g.beginPath();
        if (dir === 'up') {
            g.moveTo(cx, cy - arm);
            g.lineTo(cx + arm * 0.85, cy + arm * 0.55);
            g.lineTo(cx - arm * 0.85, cy + arm * 0.55);
        } else if (dir === 'left') {
            g.moveTo(cx - arm, cy);
            g.lineTo(cx + arm * 0.55, cy - arm * 0.85);
            g.lineTo(cx + arm * 0.55, cy + arm * 0.85);
        } else { // right
            g.moveTo(cx + arm, cy);
            g.lineTo(cx - arm * 0.55, cy - arm * 0.85);
            g.lineTo(cx - arm * 0.55, cy + arm * 0.85);
        }
        g.closePath();
        g.fillPath();
        g.strokePath();

        // Glow nhẹ khi active
        if (active) {
            g.lineStyle(2, 0xffea7a, 0.6);
            g.strokeCircle(cx, cy, r + 3);
        }
    }

    private updateDirBtnVisuals() {
        const cursors = this.cursors;
        for (const btn of this.dirBtns) {
            const keyDown = cursors ? !!cursors[btn.dir]?.isDown : false;
            const active = this.virtualInputs[btn.dir] || keyDown;
            this.redrawDirBtn(btn, active);
        }
    }

    private createChatMenuButtons(mmX: number, mmY: number, mmWidth: number, mmHeight: number) {
        // Đặt 2 nút dưới minimap, căn giữa theo trục X của minimap.
        const cx = mmX + mmWidth / 2;
        const btnY = mmY + mmHeight + 36;
        const SPACING = 60;
        const SCALE = 0.5;

        const makeBtn = (x: number, y: number, key: string, onClick: () => void) => {
            const btn = this.add.image(x, y, key)
                .setScrollFactor(0)
                .setDepth(100)
                .setScale(SCALE)
                .setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => {
                btn.setScale(SCALE * 0.94);
                onClick();
            });
            btn.on('pointerup', () => btn.setScale(SCALE));
            btn.on('pointerout', () => btn.setScale(SCALE));
            return btn;
        };

        makeBtn(cx - SPACING / 2, btnY, 'btn_chat', () => this.toggleChatPanel());
        makeBtn(cx + SPACING / 2, btnY, 'btn_menu', () => this.toggleMenuPanel());
    }

    private createChatPanel() {
        const gameCanvas = this.game.canvas;
        const parent = gameCanvas.parentElement;
        if (!parent) return;

        // Overlay che toàn màn hình, chặn click game phía sau
        this.chatOverlay = document.createElement('div');
        Object.assign(this.chatOverlay.style, {
            position: 'absolute', inset: '0',
            background: 'rgba(0,0,0,0.35)',
            zIndex: '100', display: 'none',
        });
        this.chatOverlay.addEventListener('click', (e) => {
            if (e.target === this.chatOverlay) this.toggleChatPanel();
        });
        parent.style.position = 'relative';
        parent.appendChild(this.chatOverlay);

        // Chat panel HTML
        const mockWorldMessages = [
            { sender: 'HệThống', text: 'Chào mừng đến với Kageverse!' },
            { sender: 'NinjaX', text: 'Có ai muốn tổ đội farm boss không?' },
            { sender: 'ShadowKage', text: 'Bán kiếm lv30, inbox giá' },
            { sender: 'HệThống', text: 'Sự kiện x2 EXP đang diễn ra!' },
            { sender: 'KuroNinja', text: 'Map mới khó quá, cần buff' },
        ];
        const mockCurrentMessages = [
            { sender: 'Trưởng Làng', text: 'Hãy giúp ta tiêu diệt lũ quái ngoài rìa làng.' },
            { sender: 'Thợ Rèn', text: 'Mang nguyên liệu đến, ta sẽ rèn vũ khí cho ngươi.' },
            { sender: 'Y Sĩ', text: 'Nếu bị thương hãy quay lại đây.' },
        ];

        const buildMessages = (msgs: { sender: string; text: string }[]) =>
            msgs.map(m =>
                `<div style="margin-bottom:8px;">` +
                `<span style="color:#ffea7a;font-weight:bold;">[${m.sender}]</span> ` +
                `<span style="color:#ffe4c4;">${m.text}</span></div>`
            ).join('');

        const root = document.createElement('div');
        this.chatRootEl = root;
        Object.assign(root.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(700px, 75vw)',
            height: 'min(360px, 55vh)',
            background: 'rgba(26,18,8,0.96)',
            border: '3px solid #e29e4a',
            borderRadius: '14px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'system-ui, sans-serif',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        });

        root.innerHTML = [
            // Header: Tabs + Close
            `<div style="display:flex;align-items:center;background:#4d2d13;border-bottom:2px solid #e29e4a;flex-shrink:0;">`,
            `<div id="tab-current" style="flex:1;text-align:center;padding:8px 0;cursor:pointer;font-size:13px;font-weight:bold;color:#ffea7a;background:#6b3a14;border-bottom:2px solid #ffea7a;">Hiện tại</div>`,
            `<div id="tab-world" style="flex:1;text-align:center;padding:8px 0;cursor:pointer;font-size:13px;font-weight:bold;color:#ffe4c4;background:transparent;border-bottom:2px solid transparent;">Thế giới</div>`,
            `<div id="chat-close" style="width:36px;text-align:center;cursor:pointer;font-size:18px;font-weight:bold;color:#ff8a8a;padding:8px 0;flex-shrink:0;">&#10005;</div>`,
            `</div>`,
            // Messages
            `<div id="chat-messages" style="flex:1;overflow-y:auto;padding:10px 12px;font-size:13px;line-height:1.5;">${buildMessages(mockCurrentMessages)}</div>`,
            // Input row
            `<div style="display:flex;gap:8px;padding:8px 10px;border-top:2px solid #4d2d13;background:rgba(45,26,10,0.8);flex-shrink:0;">`,
            `<input id="chat-input" type="text" placeholder="Nhập tin nhắn..." style="flex:1;height:34px;border-radius:6px;border:2px solid #4d2d13;background:#fff5e0;padding:0 10px;font-family:system-ui,sans-serif;font-size:14px;color:#2a1808;outline:none;box-sizing:border-box;" />`,
            `<button id="chat-send" style="width:70px;height:34px;border-radius:6px;border:2px solid #e29e4a;background:#6b3a14;color:#ffea7a;font-size:14px;font-weight:bold;font-family:system-ui,sans-serif;cursor:pointer;">Gửi</button>`,
            `</div>`,
        ].join('');

        this.chatOverlay.appendChild(root);

        this.chatInputEl = root.querySelector('#chat-input') as HTMLInputElement;
        this.chatMessagesEl = root.querySelector('#chat-messages') as HTMLDivElement;
        const tabCurrent = root.querySelector('#tab-current') as HTMLDivElement;
        const tabWorld = root.querySelector('#tab-world') as HTMLDivElement;
        const closeBtn = root.querySelector('#chat-close') as HTMLDivElement;
        const sendBtn = root.querySelector('#chat-send') as HTMLButtonElement;

        const setActiveTab = (tab: 'world' | 'current') => {
            const isWorld = tab === 'world';
            tabWorld.style.color = isWorld ? '#ffea7a' : '#ffe4c4';
            tabWorld.style.background = isWorld ? '#6b3a14' : 'transparent';
            tabWorld.style.borderBottom = isWorld ? '2px solid #ffea7a' : '2px solid transparent';
            tabCurrent.style.color = !isWorld ? '#ffea7a' : '#ffe4c4';
            tabCurrent.style.background = !isWorld ? '#6b3a14' : 'transparent';
            tabCurrent.style.borderBottom = !isWorld ? '2px solid #ffea7a' : '2px solid transparent';
            if (this.chatMessagesEl) {
                this.chatMessagesEl.innerHTML = buildMessages(isWorld ? mockWorldMessages : mockCurrentMessages);
                this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
            }
        };

        tabCurrent.addEventListener('click', () => setActiveTab('current'));
        tabWorld.addEventListener('click', () => setActiveTab('world'));
        closeBtn.addEventListener('click', () => this.toggleChatPanel());
        sendBtn.addEventListener('click', () => this.handleSendChat());

        this.chatInputEl.addEventListener('focus', () => this.input.keyboard?.disableGlobalCapture());
        this.chatInputEl.addEventListener('blur', () => this.input.keyboard?.enableGlobalCapture());
        this.chatInputEl.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); this.handleSendChat(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.toggleChatPanel(); }
        });
        root.addEventListener('keydown', (e) => e.stopPropagation());
        root.addEventListener('keyup', (e) => e.stopPropagation());
    }

    private toggleChatPanel() {
        if (!this.chatOverlay) return;
        const willShow = !this.chatVisible;
        this.chatVisible = willShow;
        this.chatOverlay.style.display = willShow ? 'block' : 'none';

        if (willShow && this.menuPanel?.visible) this.menuPanel.setVisible(false);

        if (willShow) {
            setTimeout(() => this.chatInputEl?.focus(), 30);
        } else {
            this.chatInputEl?.blur();
            this.input.keyboard?.enableGlobalCapture();
            if (this.chatInputEl) this.chatInputEl.value = '';
        }
    }

    private handleSendChat() {
        const msg = this.chatInputEl?.value.trim();
        console.log('[Chat] send:', msg);
        if (!msg) return;
        if (this.chatMessagesEl) {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            div.innerHTML =
                `<span style="color:#9affb4;font-weight:bold;">[Bạn]</span> ` +
                `<span style="color:#ffe4c4;">${msg}</span>`;
            this.chatMessagesEl.appendChild(div);
            this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
        }
        if (this.chatInputEl) {
            this.chatInputEl.value = '';
            this.chatInputEl.focus();
        }
    }

    private createMenuPanel(width: number) {
        const items: { label: string, action: () => void }[] = [
            { label: 'Túi đồ', action: () => this.statusText?.setText('Mở Túi Đồ (placeholder)').setColor('#ffea7a') },
            { label: 'Nhiệm vụ', action: () => this.statusText?.setText('Mở Nhiệm Vụ (placeholder)').setColor('#ffea7a') },
            { label: 'Kỹ năng', action: () => this.statusText?.setText('Mở Kỹ Năng (placeholder)').setColor('#ffea7a') },
            { label: 'Cài đặt', action: () => this.statusText?.setText('Cài Đặt (placeholder)').setColor('#ffea7a') },
            { label: 'Đăng xuất', action: () => this.statusText?.setText('Đăng Xuất (placeholder)').setColor('#ffea7a') },
        ];

        const panelW = 220;
        const headerH = 36;
        const itemH = 38;
        const itemGap = 4;
        const panelH = headerH + items.length * (itemH + itemGap) + 12;

        // Anchor góc phải-trên gần nút menu, không che minimap.
        const panelX = width - 16 - panelW / 2;
        const panelY = 220 + panelH / 2;

        this.menuPanel = this.add.container(panelX, panelY)
            .setScrollFactor(0).setDepth(150).setVisible(false);

        const bg = this.add.graphics();
        bg.fillStyle(0x2a1808, 0.97);
        bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);
        bg.fillStyle(0x4d2d13, 1);
        bg.fillRoundedRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, headerH, 8);
        bg.lineStyle(3, 0xe29e4a, 1);
        bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);

        const headerTxt = this.add.text(0, -panelH / 2 + headerH / 2 + 4, 'MENU', {
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.menuPanel.add([bg, headerTxt]);

        items.forEach((item, idx) => {
            const itemY = -panelH / 2 + headerH + 8 + idx * (itemH + itemGap) + itemH / 2;
            const itemBg = this.add.rectangle(0, itemY, panelW - 24, itemH, 0x3a2010, 0.9)
                .setStrokeStyle(2, 0x8d6e63)
                .setInteractive({ useHandCursor: true });
            const itemTxt = this.add.text(0, itemY, item.label, {
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#ffe4c4',
                fontFamily: 'system-ui, sans-serif',
            }).setOrigin(0.5);

            itemBg.on('pointerover', () => {
                itemBg.setFillStyle(0x6b3a14, 0.95);
                itemTxt.setColor('#ffea7a');
            });
            itemBg.on('pointerout', () => {
                itemBg.setFillStyle(0x3a2010, 0.9);
                itemTxt.setColor('#ffe4c4');
            });
            itemBg.on('pointerdown', () => {
                item.action();
                this.toggleMenuPanel();
            });

            this.menuPanel!.add([itemBg, itemTxt]);
        });
    }

    private toggleMenuPanel() {
        if (!this.menuPanel) return;
        const willShow = !this.menuPanel.visible;
        this.menuPanel.setVisible(willShow);
        if (willShow && this.chatVisible) {
            this.toggleChatPanel();
        }
    }

    private selectNpc(npc: NpcEntry) {
        if (this.interactingNpc) return; // Đang trong dialog thì không cho chọn NPC khác
        // Reset màu name của NPC cũ
        if (this.selectedNpc && this.selectedNpc !== npc) {
            this.selectedNpc.nameText?.setColor('#ffea7a');
        }
        this.selectedNpc = npc;
        npc.nameText?.setColor('#9affb4');
        this.updateSelectionIndicator();
    }

    private clearNpcSelection() {
        if (this.selectedNpc) {
            this.selectedNpc.nameText?.setColor('#ffea7a');
        }
        this.selectedNpc = null;
        this.autoMoveTargetX = null;
        this.selectionIndicator?.clear().setVisible(false);
    }

    private updateSelectionIndicator() {
        if (!this.selectionIndicator || !this.selectedNpc) return;
        const npc = this.selectedNpc;
        const sprH = npc.sprite.height * npc.sprite.scaleY;
        const x = npc.sprite.x;
        const topY = npc.sprite.y - sprH - 28;
        const footY = npc.sprite.y;
        const g = this.selectionIndicator;
        g.clear();
        // Ring dưới chân
        g.lineStyle(3, 0x9affb4, 1);
        g.strokeEllipse(x, footY - 4, 50, 14);
        // Mũi tên trên đầu
        g.fillStyle(0x9affb4, 1);
        g.lineStyle(2, 0x000000, 1);
        g.beginPath();
        g.moveTo(x - 9, topY);
        g.lineTo(x + 9, topY);
        g.lineTo(x, topY + 12);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.setVisible(true);
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

    private startNpcInteraction(npc: NpcEntry) {
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
        this.clearNpcSelection();
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

        // Add the topbar image for the health/level area
        const topbar = this.add.image(0, 0, 'topbar').setOrigin(0, 0);
        topbar.setScale(0.5);

        const hpBar = this.drawRoundedRect(105, 14, 170, 18, 0x5d1515, 0xff5454);
        const mpBar = this.drawRoundedRect(98, 46, 125, 15, 0x10325a, 0x4da4ff);

        const hpText = this.add.text(192, 22, '1500 / 1500', {
            fontSize: '10px',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 2,
        }).setOrigin(0.5, 0.5);

        const mpText = this.add.text(165, 53, '800 / 800', {
            fontSize: '10px',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 2,
        }).setOrigin(0.5, 0.5);

        const levelText = this.add.text(45, 38, '1', {
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#ffea7a',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5);

        const expText = this.add.text(45, 62, '20.88%', {
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            stroke: '#000',
            strokeThickness: 3,
        }).setOrigin(0.5, 0.5);

        const bg4 = this.drawRoundedRect(width - 148, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg5 = this.drawRoundedRect(width - 100, 14, 40, 30, 0x4d2d13, 0xd59a48);
        const bg6 = this.drawRoundedRect(width - 52, 14, 40, 30, 0x4d2d13, 0xd59a48);

        [topbar, hpBar, mpBar, hpText, mpText, levelText, expText, bg4, bg5, bg6].forEach((obj) => {
            if (obj && 'setScrollFactor' in obj) {
                (obj as Phaser.GameObjects.GameObject & { setScrollFactor: (x: number, y?: number) => void }).setScrollFactor(0);
                (obj as Phaser.GameObjects.GameObject & { setDepth: (z: number) => void }).setDepth(100);
            }
        });

        topbar.setDepth(101);
        levelText.setDepth(102);
        expText.setDepth(102);
    }

    private drawMockControls(width: number, height: number) {
        // D-PAD: 3 nút di chuyển vẽ bằng Graphics, đồng style bronze rim với attack/HP/MP/menu.
        const cx = 80;
        const cy = height - 70;
        const dirRadius = 28;
        const offset = 64;

        const makeDirBtn = (x: number, y: number, dir: 'left' | 'right' | 'up', onPress?: () => void) => {
            const dirG = this.add.graphics().setScrollFactor(0).setDepth(100);
            const hit = this.add.circle(x, y, dirRadius, 0xffffff, 0.001)
                .setScrollFactor(0).setDepth(101)
                .setInteractive({ useHandCursor: true });
            const entry = { g: dirG, dir, cx: x, cy: y, r: dirRadius };
            this.dirBtns.push(entry);
            this.redrawDirBtn(entry, false);

            hit.on('pointerdown', () => {
                if (onPress) onPress();
                this.virtualInputs[dir] = true;
            });
            hit.on('pointerup', () => { this.virtualInputs[dir] = false; });
            hit.on('pointerout', () => { this.virtualInputs[dir] = false; });
            return entry;
        };

        makeDirBtn(cx, cy - offset, 'up');
        makeDirBtn(cx - offset, cy, 'left', () => {
            if (this.interactingNpc) {
                this.selectedOptionIndex = Math.max(0, this.selectedOptionIndex - 1);
                this.updateOptionHighlight();
            }
        });
        makeDirBtn(cx + offset, cy, 'right', () => {
            if (this.interactingNpc) {
                this.selectedOptionIndex = Math.min(this.dialogOptions.length - 1, this.selectedOptionIndex + 1);
                this.updateOptionHighlight();
            }
        });

        // Nút Action chính (Đánh quái / Tương tác NPC) — tương đương phím ENTER, luôn ở góc phải-dưới
        const ATTACK_X = width - 72;
        const ATTACK_Y = height - 78;
        const attackBtn = this.add.image(ATTACK_X, ATTACK_Y, 'btn_attack')
            .setScrollFactor(0)
            .setDepth(100)
            .setScale(0.7)
            .setInteractive({ useHandCursor: true });
        attackBtn.on('pointerdown', () => {
            attackBtn.setScale(0.66); // hiệu ứng nhấn xuống
            this.handleInteractAction();
        });
        attackBtn.on('pointerup', () => attackBtn.setScale(0.7));
        attackBtn.on('pointerout', () => attackBtn.setScale(0.7));

        // 3 nút vệ tinh quanh nút Attack: HP (trái), MP (trên-trái), Switch Target (trên)
        const SAT_RADIUS = 22;
        const SAT_DISTANCE = 78;
        const makeSatBtn = (
            angleDeg: number,
            fillColor: number,
            label: string,
            labelColor: string,
            onClick: () => void,
        ) => {
            const rad = Phaser.Math.DegToRad(angleDeg);
            const x = ATTACK_X + Math.cos(rad) * SAT_DISTANCE;
            const y = ATTACK_Y + Math.sin(rad) * SAT_DISTANCE;

            const bg = this.add.circle(x, y, SAT_RADIUS, fillColor, 0.92)
                .setStrokeStyle(3, 0xe29e4a)
                .setScrollFactor(0)
                .setDepth(100)
                .setInteractive({ useHandCursor: true });

            const txt = this.add.text(x, y, label, {
                fontSize: '14px',
                fontStyle: 'bold',
                color: labelColor,
                fontFamily: 'system-ui, sans-serif',
                stroke: '#000',
                strokeThickness: 3,
            }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

            bg.on('pointerdown', () => {
                if ((bg as Phaser.GameObjects.Arc & { disabled?: boolean }).disabled) return;
                bg.setScale(0.9);
                onClick();
            });
            bg.on('pointerup', () => bg.setScale(1));
            bg.on('pointerout', () => bg.setScale(1));

            return { bg, txt };
        };

        // 180° = trái nút Attack, 225° = chéo trên-trái, 270° = ngay phía trên (Phaser y tăng xuống)
        makeSatBtn(180, 0x7a1a1a, 'HP', '#ffe4e4', () => this.useHpPotion());
        makeSatBtn(225, 0x163d6e, 'MP', '#dceeff', () => this.useMpPotion());
        this.switchTargetBtn = makeSatBtn(270, 0x4d2d13, '⇄', '#ffea7a', () => this.cycleSelectedNpc());

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
