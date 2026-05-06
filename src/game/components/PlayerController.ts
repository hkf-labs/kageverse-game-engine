import * as Phaser from 'phaser';
import { getCurrentCharacter, saveCurrentCharacter } from '../playerSession';
import { charactersAPI } from '../../network/api';
import type { GameComponent } from './types';
import type { MapBackground } from './MapBackground';

export interface CharacterAppearance {
    headTextureKey: string;
    topTextureKey: string;
    bottomTextureKey: string;
}

// Bộ mặc định lv thấp (chưa mặc trang bị). Trong tương lai khi nhân vật equip
// áo / quần, override các key tương ứng qua setAppearance().
export const DEFAULT_CHARACTER_APPEARANCE: CharacterAppearance = {
    headTextureKey: 'body-head-default',
    topTextureKey: 'body-top-default',
    bottomTextureKey: 'body-bottom-default',
};

// Asset paths khớp các texture key bên trên — preload qua BaseMapScene.
export const DEFAULT_CHARACTER_APPEARANCE_ASSETS: Record<string, string> = {
    'body-head-default': 'assets/game/characters/body-head-default.png',
    'body-top-default': 'assets/game/characters/body-top-default.png',
    'body-bottom-default': 'assets/game/characters/body-bottom-default.png',
};

// Stack 3 phần dọc, chân chạm đáy hitbox 60×110. Kích thước nguồn:
// head 84×76 → top 88×44 → bottom 60×32. Overlap 10px ở mỗi seam (head↔body
// và body↔legs) — hair / chin gối lên collar gi, belt knot gối lên waistband.
// Edge-to-edge stack lộ vệt nền do alpha falloff ở mép từng part.
//
// Export để RemotePlayerManager tái dùng cùng layout — đảm bảo player local
// và remote render đồng nhất, không lệch khi tương lai mặc đồ khác.
export const HEAD_OFFSET_Y = -39;
export const TOP_OFFSET_Y = 11;
export const BOTTOM_OFFSET_Y = 39;
// Bù lệch ngang cho từng part — art body bị lệch trục so với head/legs nên
// shift phải vài pixel để ngực thẳng cột với đầu + chân.
export const HEAD_OFFSET_X = 5;
export const TOP_OFFSET_X = 3;
export const BOTTOM_OFFSET_X = 0;
// Scale toàn body container — chỉnh chỗ này để phóng to / thu nhỏ nhân vật.
// Scale tác động lên cả offset → seam vẫn khớp ở mọi giá trị. 0.4 đưa player
// về cỡ ~50px khớp tile NSO 24×24 render scale (tile ~36px = 1.5x native).
export const BODY_SCALE = 0.4;
// Name text không thuộc container nên không tự scale — derive Y từ head top
// (-39 - 38 = -77 local) để name luôn cách đỉnh đầu 13px ở mọi BODY_SCALE.
export const NAME_OFFSET_Y = (HEAD_OFFSET_Y - 38) * BODY_SCALE - 13;

export class PlayerController implements GameComponent {
    private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private bodyContainer?: Phaser.GameObjects.Container;
    private headSprite?: Phaser.GameObjects.Sprite;
    private topSprite?: Phaser.GameObjects.Sprite;
    private bottomSprite?: Phaser.GameObjects.Sprite;
    private playerNameText?: Phaser.GameObjects.Text;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private virtualInputs = { left: false, right: false, up: false };
    private scene: Phaser.Scene;
    private background: MapBackground;

    constructor(scene: Phaser.Scene, background: MapBackground) {
        this.scene = scene;
        this.background = background;
    }

    create(): void {
        // Spawn cao gần đỉnh viewport rồi để gravity rơi xuống surface đầu tiên
        // — tránh kẹt khi spawn x rơi vô cột terrain solid (NSO map có hills/
        // tower chiếm rows trung. Map cũ flat ground thì rơi 0px = OK).
        const spawn = 50;
        // Hitbox khớp visual sau BODY_SCALE=0.4: 60*0.4=24, 110*0.4=44 — về NSO
        // ratio (~24×40). Speed/jump trong BaseMapScene chưa scale theo, nếu
        // nhân vật cảm giác di chuyển quá nhanh có thể giảm ở đó.
        const hitWidth = 24;
        const hitHeight = 44;
        // Spawn 10% từ mép trái world. Dùng worldWidth thay vì bgWidth — bgWidth
        // = 0 khi MapConfig có parallaxBg (bgKey chỉ là placeholder).
        const hitbox = this.scene.add.rectangle(this.background.getWorldWidth() * 0.1, spawn, hitWidth, hitHeight, 0x000000, 0);

        this.scene.physics.add.existing(hitbox, false);
        this.player = hitbox as unknown as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

        if (this.player && this.player.body) {
            this.player.body.setCollideWorldBounds(true);
            this.player.body.setBounce(0);
            this.player.body.debugShowBody = true;
            this.player.body.debugBodyColor = 0xffff00;
        }

        const appearance = DEFAULT_CHARACTER_APPEARANCE;
        this.headSprite = this.scene.add.sprite(HEAD_OFFSET_X, HEAD_OFFSET_Y, appearance.headTextureKey);
        this.topSprite = this.scene.add.sprite(TOP_OFFSET_X, TOP_OFFSET_Y, appearance.topTextureKey);
        this.bottomSprite = this.scene.add.sprite(BOTTOM_OFFSET_X, BOTTOM_OFFSET_Y, appearance.bottomTextureKey);
        this.applyPixelArtFilter();

        this.bodyContainer = this.scene.add.container(this.player!.x, this.player!.y, [
            this.bottomSprite, this.topSprite, this.headSprite,
        ]);
        this.bodyContainer.setDepth(10);
        this.bodyContainer.setScale(BODY_SCALE);

        const displayName = getCurrentCharacter()?.displayName || 'Ninja';
        this.playerNameText = this.scene.add.text(this.player!.x, this.player!.y + NAME_OFFSET_Y, displayName, {
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
        this.scene.cameras.main.setBounds(0, 0, this.background.getWorldWidth(), this.background.getBgHeight());

        this.cursors = this.scene.input.keyboard?.createCursorKeys();

        void this.syncCharacterInfo();
    }

    update(): void {
        if (!this.player || !this.cursors) return;

        if (this.bodyContainer) {
            this.bodyContainer.setPosition(this.player.x, this.player.y);
        }
        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y + NAME_OFFSET_Y);
        }
    }

    setAppearance(appearance: Partial<CharacterAppearance>): void {
        if (appearance.headTextureKey) this.headSprite?.setTexture(appearance.headTextureKey);
        if (appearance.topTextureKey) this.topSprite?.setTexture(appearance.topTextureKey);
        if (appearance.bottomTextureKey) this.bottomSprite?.setTexture(appearance.bottomTextureKey);
        this.applyPixelArtFilter();
    }

    setFacing(left: boolean): void {
        this.headSprite?.setFlipX(left);
        this.topSprite?.setFlipX(left);
        this.bottomSprite?.setFlipX(left);
    }

    getPlayer(): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined { return this.player; }
    getCursors(): Phaser.Types.Input.Keyboard.CursorKeys | undefined { return this.cursors; }
    getVirtualInputs(): { left: boolean; right: boolean; up: boolean } { return this.virtualInputs; }
    getSprite(): Phaser.GameObjects.Container | undefined { return this.bodyContainer; }

    moveLeft(speed: number): void {
        this.player?.body?.setVelocityX(-speed);
        this.setFacing(true);
    }

    moveRight(speed: number): void {
        this.player?.body?.setVelocityX(speed);
        this.setFacing(false);
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

    private applyPixelArtFilter(): void {
        // NEAREST giữ pixel art sắc nét — Phaser default linear filter sẽ làm mờ.
        [this.headSprite, this.topSprite, this.bottomSprite].forEach((s) => {
            s?.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        });
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
