# Kageverse Game Engine — Frontend

## Tech Stack
- **Framework**: React + TypeScript + Vite
- **Game Engine**: Phaser 3 (Arcade Physics)
- **Style**: Phaser graphics inline + native HTML DOM cho overlay (chat panel)

## Kiến trúc

### Hệ thống Scene (Composition Pattern)

Scene dùng **component composition** — mỗi tính năng là một class tự đóng gói, scene chỉ điều phối.

```
src/game/
  components/          ← Game component tái sử dụng
    types.ts           ← Interface dùng chung (GameComponent, NpcEntry, MapConfig, Tiled types)
    index.ts           ← Barrel export
    MapBackground.ts   ← Ảnh nền, collider, platform từ Tiled JSON
    PlayerController.ts← Hitbox, sprite, di chuyển, camera follow của player
    HUD.ts             ← Top bar (HP/MP/level/EXP), text trạng thái
    Minimap.ts         ← Minimap camera, frame, blip, UI ignore
    ChatPanel.ts       ← Overlay chat (native HTML DOM), tab, messages, input
    MenuPanel.ts       ← Menu trong game (Phaser container)
    GameControls.ts    ← D-pad, nút tấn công, nút potion, slot kỹ năng
    NpcManager.ts      ← Render NPC, chọn, dialog, auto-move
  scenes/
    BaseMapScene.ts    ← Abstract base: lắp ráp các component, share update loop
    VillageScene.ts    ← Map làng (extends BaseMapScene): logic quest onboarding
    AuthScene.ts       ← Login/register
    CharacterCreateScene.ts
    MainScene.ts       ← Placeholder sau onboarding
```

### Component Contract

Mọi component tuân theo interface:

```typescript
interface GameComponent {
    create(): void;      // Gọi 1 lần sau scene.create()
    update?(): void;     // Gọi mỗi frame (tuỳ chọn)
    destroy?(): void;    // Cleanup (tuỳ chọn)
}
```

### Thêm Map mới

1. Tạo `src/game/scenes/YourMapScene.ts` extends `BaseMapScene`
2. Cài đặt các abstract method bắt buộc:
   - `getMapConfig()` → map ID, đường dẫn asset, tiled height
   - `getNpcConfigs()` → danh sách NPC cho map này
3. Override các hook tuỳ chọn:
   - `preloadMapAssets()` → load asset riêng cho map (NPC sprite, v.v.)
   - `getMapDisplayName()` → tiêu đề hiển thị đầu màn hình
   - `onMapReady()` → logic riêng cho map (quest, spawner, tutorial)
4. Đăng ký scene vào `GameConfig.ts`

### Thêm Component mới

1. Tạo `src/game/components/YourComponent.ts` implement `GameComponent`
2. Export từ `src/game/components/index.ts`
3. Wire vào `BaseMapScene` (nếu dùng chung) hoặc map scene cụ thể (nếu chỉ riêng cho map đó)

## Quy tắc

- **Không dùng kiểu `any`** — dùng interface chuẩn. Tiled data dùng `TiledMapData/TiledLayer/TiledObject`.
- **Chat panel dùng native HTML DOM**, không dùng Phaser DOMElement (DOM system của Phaser có vấn đề với keyboard capture).
- **Scene key phải khớp** — `super('SceneKey')` trong constructor phải khớp với call `this.scene.start('SceneKey')` từ scene khác.
- **Component tự quản lý lifecycle** — không reach vào internals của component từ scene; dùng public API method.
- **Phaser keyboard capture** — disable global capture khi HTML input đang focus, enable lại khi blur.

## Backend

Backend là sibling repo ở `../kageverse-server/` (Go). Map specs, API contract, và database schema được document ở đó dưới `docs/`.
