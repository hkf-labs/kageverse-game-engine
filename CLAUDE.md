# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Kageverse Game Engine — Frontend

## Tech Stack
- **Framework**: React 19 + TypeScript + Vite
- **Game Engine**: Phaser 4 (Arcade Physics, dynamic-imported)
- **UI**: Phaser graphics inline + native HTML DOM cho overlay (chat, inventory)
- **Backend**: Go server, sibling repo at `../kageverse-server/` (REST + WebSocket)

## Lệnh thường dùng

```bash
npm install         # Cài dependency
npm run dev         # Vite dev server (mặc định http://localhost:5173)
npm run build       # tsc -b && vite build
npm run lint        # ESLint trên toàn project
npm run preview     # Preview build production
npx tsc -b          # Type-check mà không bundle
```

Không có test runner trong repo; dự án xác minh qua type-check + chạy game thủ công.

## Biến môi trường (`.env`)

- `VITE_API_BASE_URL` — Backend REST (mặc định `http://localhost:8080/api/v1`)
- `VITE_WS_BASE_URL` — Backend WS (mặc định `ws://localhost:8080`)
- `VITE_ONBOARDING_DATA_SOURCE` — `mock` (FE-only demo) hoặc `api` (gọi backend). Xem `src/features/onboarding/index.ts` cho cơ chế chọn gateway.

## Kiến trúc

### Boundary React ↔ Phaser

`src/components/GameComponent.tsx` là cầu nối duy nhất giữa React và Phaser:
- **Phaser được dynamic-import** (`await import('phaser')`) để giảm bundle size và tránh nghẽn main thread khi React mount.
- **Tuyệt đối không** import Phaser tĩnh ở scope module trong code React.
- React chỉ phụ trách DOM/UI/Web3 outer chrome. Mọi gameplay loop (update tick, va chạm, render canvas) sống trong Phaser scene.
- Không gọi React state hook bên trong Phaser `update()` — dùng event emitter / callback nếu cần đẩy data sang React.
- Cú pháp import trong code Phaser: `import * as Phaser from 'phaser'` (không dùng default export — gặp lỗi Rollup).

### Hệ thống Scene (Composition Pattern)

Scene dùng **component composition** — mỗi tính năng là một class tự đóng gói implement `GameComponent`, scene chỉ điều phối lifecycle và update loop.

```
src/game/
  components/          ← Game component tái sử dụng
    types.ts           ← Interface dùng chung (GameComponent, NpcEntry, MapConfig, MonsterConfig, PortalConfig, Tiled types)
    index.ts           ← Barrel export
    MapBackground.ts   ← Ảnh nền, collider, platform từ Tiled JSON
    PlayerController.ts← Hitbox, sprite, di chuyển, camera follow
    HUD.ts             ← Top bar (HP/MP/level/EXP), text trạng thái
    Minimap.ts         ← Camera phụ, frame, blip, UI ignore list
    ChatPanel.ts       ← Overlay chat (native HTML DOM), tab, messages, input
    InventoryModal.ts  ← Modal túi đồ (HTML DOM overlay), gọi inventoryAPI
    MenuPanel.ts       ← Menu trong game (Phaser container)
    GameControls.ts    ← D-pad, nút tấn công, nút potion, slot kỹ năng
    NpcManager.ts      ← Render NPC, chọn, dialog, auto-move
    MonsterManager.ts  ← Spawn / update quái
    Portal.ts          ← Cổng dịch chuyển sang scene khác
  scenes/
    BaseMapScene.ts    ← Abstract base: lắp ráp components, share update loop, handle Logout / Interact
    VillageScene.ts    ← extends BaseMapScene, logic onboarding quest
    CombatFieldScene.ts← extends BaseMapScene, map combat
    AuthScene.ts       ← Login/register
    CharacterCreateScene.ts
    MainScene.ts       ← Placeholder sau onboarding
  GameConfig.ts        ← Phaser.Game config + danh sách scene đăng ký
  playerSession.ts     ← Lưu nhân vật hiện tại vào localStorage
```

#### Component Contract

```typescript
interface GameComponent {
    create(): void;      // Gọi 1 lần sau scene.create()
    update?(): void;     // Gọi mỗi frame (tuỳ chọn)
    destroy?(): void;    // Cleanup (tuỳ chọn)
}
```

#### Thêm Map mới

1. Tạo `src/game/scenes/YourMapScene.ts` extends `BaseMapScene`
2. Cài đặt abstract method bắt buộc:
   - `getMapConfig()` → mapId, đường dẫn asset, `tiledOriginalHeight`
   - `getNpcConfigs()` → danh sách NPC
3. Override hook tuỳ chọn:
   - `preloadMapAssets()` → load asset riêng (sprite NPC, ...)
   - `getMapDisplayName()` → tiêu đề hiển thị đầu màn hình
   - `getPortalConfigs()` / `getMonsterConfigs()` → portal & quái cho map
   - `onMapReady()` → logic riêng (quest, spawner, tutorial)
4. Đăng ký scene vào mảng `scene` của `GameConfig.ts`. **Scene key phải khớp** giữa `super('SceneKey')` và `this.scene.start('SceneKey')`.

#### Thêm Component mới

1. Tạo `src/game/components/YourComponent.ts` implement `GameComponent`
2. Export từ `src/game/components/index.ts`
3. Wire vào `BaseMapScene` (nếu dùng chung) hoặc map scene cụ thể

### Networking & Data Gateway

- `src/network/api.ts` — REST client. Quản lý JWT trong `localStorage` (`kageverse_jwt` + `kageverse_refresh`), tự động refresh access token khi gặp 401, gắn `X-Trace-Id` cho mọi request, format error qua `formatApiError`. Chứa `authAPI`, `charactersAPI`, `inventoryAPI`, `mapsAPI`.
- `src/network/WebSocketClient.ts` — WS client realtime với backend Go. **Throttle**: không gửi toạ độ khi nhân vật không di chuyển (>1px khác biệt). Backend là authoritative server — client predict cho mượt nhưng server giữ state cuối.
- `src/features/<feature>/` — mỗi feature có pattern Gateway: `OnboardingGateway` interface + `MockOnboardingGateway` (FE-only) + `HttpOnboardingGateway` (gọi backend). Singleton chọn impl dựa vào env var. Thêm feature mới nên đi theo cùng pattern này.

### Auth flow

`AuthScene` → login/register → token lưu qua `setTokens` → `CharacterCreateScene` → `saveCurrentCharacter()` → `VillageScene`. Khi 401 không refresh được, `authFetch` sẽ `clearTokens()` và scene gọi `this.scene.start('AuthScene')`.

## Quy tắc

- **Không dùng `any`** — dùng interface chuẩn. Tiled data dùng `TiledMapData`/`TiledLayer`/`TiledObject`. Khi parse JSON từ API, dùng `asRecord()` helper trong `api.ts`.
- **Chat panel & Inventory modal dùng native HTML DOM**, không dùng Phaser DOMElement (DOM system của Phaser xung đột với keyboard capture).
- **Phaser keyboard capture** — disable global capture khi HTML input đang focus, enable lại khi blur. Mọi handler phím trong scene phải check `chat.isFocused()` (xem `BaseMapScene.update()` và VillageScene quest hotkeys).
- **Component tự quản lý lifecycle** — không reach vào internals từ scene; expose public API method.
- **Throttle WS** — không gửi toạ độ nếu nhân vật đứng im.
- **UI style** — dark mode, glow / glassmorphism premium (theo định hướng game Web3).
- **Immutability** trong React state.

## Backend

Backend là sibling repo ở `../kageverse-server/` (Go). Map specs, API contract, và database schema được document ở đó dưới `docs/`. Khi cần API mới, kiểm tra schema bên đó trước khi viết FE binding.
