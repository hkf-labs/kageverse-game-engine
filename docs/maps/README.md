# Maps Workflow

Hướng dẫn quản lý map asset cho `kageverse-game-engine`. Áp dụng cho mọi map mới (làng / trường / farm / dungeon).

## File structure mỗi map

```
public/assets/maps/<map_id>/
├── <map_id>.tmj       # Tiled JSON đầy đủ (tile layer + objectgroup) — DESIGN SOURCE
├── colliders.json      # Stripped objectgroup-only — RUNTIME SOURCE engine load
├── <map_id>.png        # Background flatten image — RUNTIME SOURCE engine load
└── npcs/               # NPC sprite assets (optional)
    └── <npc_key>.png
```

## ⚠️ Engine chỉ load `colliders.json` + PNG

Mọi map trong codebase được render bằng **flat PNG background** + collision rectangles từ `colliders.json`. Engine **KHÔNG đọc** `.tmj` runtime — file `.tmj` chỉ phục vụ design trong Tiled Map Editor.

Hệ quả:
- `tile layer` trong `.tmj` không ảnh hưởng gameplay (chỉ visual khi mở Tiled).
- Player thấy tile layer khi dev mở Tiled, nhưng game chạy chỉ thấy `<map_id>.png`.
- Phải **export PNG** từ Tiled riêng → đó mới là asset visible.
- Phải **sync object layer** từ `.tmj` → `colliders.json` mỗi khi đổi platform.

## Workflow vẽ map mới

1. **Mở `.tmj` trong Tiled** (bản chất là JSON, mở file là OK):
   ```
   tiled public/assets/maps/<map_id>/<map_id>.tmj
   ```

2. **Vẽ tiles** vào layer `tiles`. Tileset hiện tại là `mock_32` (placeholder color blocks). Replace bằng tileset thật khi có:
   - Edit `public/assets/tilesets/mock_32.png` thay placeholder bằng tileset thực (32×32 px tiles, 16 columns).
   - Hoặc tạo tileset riêng: import vào `.tmj` qua menu Map → Add External Tileset.

3. **Adjust collision rectangles** trong layer `platforms`:
   - Dùng "Insert Rectangle" để thêm platform.
   - Mỗi rectangle = 1 collision platform. Top edge thấy được, sides + bottom đi xuyên qua (top-only).
   - Rectangle dài full-width ở đáy = ground floor (engine auto-detect khi width ≥ 4000px).

4. **Export tile-rendered PNG**:
   - File → Export As → PNG Image (`.png`).
   - Save làm `public/assets/maps/<map_id>/<map_id>.png`.
   - Tiled render flatten tile layer thành ảnh; layer `platforms` không xuất hiện trong PNG (đó là collision metadata).

5. **Sync collision** từ `.tmj` → `colliders.json`:
   - Hiện CHƯA có script auto. Manual: copy phần `objectgroup` từ `.tmj` → `colliders.json` (giữ format `{width, height, layers: [objectgroup]}`).
   - TODO: viết script `scripts/sync-colliders.mjs` parse `.tmj` → emit `colliders.json`.

6. **Update Scene config** trong `src/game/scenes/<MapName>Scene.ts`:
   - Set `bgAsset: 'assets/maps/<map_id>/<map_id>.png'`.
   - Set `colliderAsset: 'assets/maps/<map_id>/colliders.json'`.

7. **Reload FE** — `npm run dev` rebuilds; refresh browser thấy map mới.

## Convention

### Tile size
Cố định **32 px** (cả width + height). Không đổi cho map mới — engine đã hardcode tilewidth=32 trong `MapBackground.ts`.

### Map height
Cố định **1440 px** (Tiled coordinate height). Engine scale theo screen height ở runtime (`tiledOriginalHeight: 1440` trong `MapConfig`). Đừng đổi sang giá trị khác.

### Map width
Linh hoạt. Đề xuất:
- **Village**: 6688 px (= 209 tiles)
- **School**: 2160 px (= 67.5 tiles, làm tròn 68 cho .tmj alignment)
- **Farm trung gian**: 3200 px (= 100 tiles)
- **Combat field / forest / dungeon**: 4000-5000 px

Width ≥ 4000 → engine treats bottom rectangle as full ground floor (special collision flag). Width < 4000 → bottom = top-only platform like other ledges.

### Coordinate system
- Origin **(0, 0)** = top-left của map.
- Y tăng xuống dưới. Player feet ở y cao (vd y=1380 = đáy).
- Collision rectangle `{ x, y, w, h }`: top-left corner ở `(x, y)`, kéo dài xuống `y+h`.

### Platform reachability
Player physics (xem `BaseMapScene.ts` + `PlayerController.ts`):
- Jump velocity = 580 px/s, gravity = 900 px/s² → max jump height ≈ **187 px**.
- Walk speed = 280 px/s.
- Hitbox 60×110 px.

→ Platform liền nhau trong chain phải cách nhau **≤ 150 px** theo Y để player nhảy tới được (chừa margin 37 px). Vượt 187 px = không nhảy lên nổi (cần stair stepping).

### Layer naming
- `tiles` (tilelayer) — visual tiles, ignored by engine.
- `platforms` (objectgroup) — collision rectangles. Engine reads MỌI rectangle trong layer này, không phân biệt name của individual object.

Các tên layer khác (`background`, `decoration`, `parallax`, ...) tùy designer dùng trong Tiled — engine đều ignore.

## Mock tileset

`public/assets/tilesets/mock_32.{png,tsx}` là tileset placeholder để `.tmj` có thể mở trong Tiled. 256 tiles (16×16 grid), color blocks có index number để debug.

Replace `mock_32.png` bằng tileset thật cùng dimension (512×512, 32px tiles) → `.tsx` không cần đổi nếu giữ metadata.

## Portal placement

Portal config nằm trong **scene TS file** (`getPortalConfigs()`), không trong `.tmj` / `colliders.json`. Định nghĩa:

```ts
{
    x: <pixel x>,
    label: t('portal.label.<key>'),
    targetSceneKey: '<TargetSceneClass>',
    locked?: boolean,           // optional, default false
    lockedMessage?: string,     // i18n string hiện khi click portal locked
}
```

- `y` của portal **auto-calculated** từ `getPlatformYAtX(x)` — engine đặt portal trên đỉnh platform tại x đó.
- Để có "lối thông trên cao", design platform cao tại x portal (vd y=780 thay vì y=1380 ground).
- Locked portal: chỉ lockedMessage hiện khi player tương tác. Nhân vật QA có `c.unlock_all_maps=true` (BE-driven) sẽ auto-unlock toàn bộ portal locked.

## Maps hiện có (Village + 3 trường spec)

Xem `village-schools-path-spec.md` để biết detail layout của 10 map (1 village + 3 school + 6 farm trung gian + bamboo back-routes).

Map ID convention:
- `village_001` — Làng đầu tiên, spawn point.
- `fire_school_001`, `wind_school_001`, `ice_school_001` — 3 trường (Hỏa/Phong/Băng).
- `village_to_<element>_<NN>` — farm trung gian từ village tới trường tương ứng.
- `combat_field_001`, `bamboo_forest_yatomi`, `rocky_hill_iwagumo` — combat zones (out of scope MVP path 1 này).

## Out-of-scope hiện tại

- **Auto sync script** `.tmj` → `colliders.json` (manual đến khi viết).
- **Real tileset asset** — đang dùng mock placeholder.
- **NPC seed** cho 6 farm map + wind_school_001 (`getNpcConfigs()` trả `[]`).
- **Monster spawn** cho farm map (BE chưa seed).
- **BG PNG** cho 7 map mới — designer vẽ sau theo dim trong spec.

## Lore consistency note

Map ID `fire_school_001` / `ice_school_001` là tên đã rename từ `sword_school_001` / `hayabusa_school_001` (option A1, xem `village-schools-path-spec.md` §13). Một số docs cũ trong `kageverse-server/docs/business/` vẫn còn lore "Trường Mikazuki" / "Trường Hayabusa" — đây là **lore name** lịch sử, KHÔNG phải map ID. Nếu user quyết định fully rename lore → tách thành cleanup pass riêng (không thuộc spec này).
