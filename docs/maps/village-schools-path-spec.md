# Village → 3 Schools Path Spec (MVP Phase 1)

Spec đầy đủ cho việc generate 3 con đường từ Làng đầu tiên đến 3 trường phái theo hệ Hỏa / Phong / Băng. Document này là **planning artifact** — đọc trước khi review PR.

> Trạng thái: **Draft, đang chờ user OK** trước khi code.

## 1. Phạm vi

- Generate map asset + scene config cho 3 path: Làng → 2 farm trung gian → Trường.
- 3 trường: **Hỏa Kiếm** (top-right), **Phong** (middle, NEW + LOCKED), **Băng Cung** (bottom-left).
- Các map sau trường (rừng tre, đồi đá, ...) **out-of-scope** phase này, giữ nguyên existing.
- Không seed NPC/monster cho map mới (defer phase sau).

## 2. Naming & mapping

### 2.1 Trường (rename existing + add new)

| Vị trí draw.io | Hệ | Phái vũ khí | Map ID mới | Map ID cũ | Trạng thái |
|---|---|---|---|---|---|
| Top-right | Hỏa 🔥 | Kiếm | `fire_school_001` | `sword_school_001` | rename in-place (option A1) |
| Middle | Phong 🌪️ | (chưa định) | `wind_school_001` | — | NEW, LOCKED entry |
| Bottom-left | Băng ❄️ | Cung | `ice_school_001` | `hayabusa_school_001` | rename in-place (option A1) |

i18n displayName:
- `map_name.fire_school_001` = "Trường Hỏa Kiếm"
- `map_name.wind_school_001` = "Trường Phong"
- `map_name.ice_school_001` = "Trường Băng Cung"

### 2.2 Farm map trung gian (NEW)

Đặt tên theo path đích để dễ trace:

| Path | Farm 1 | Farm 2 |
|---|---|---|
| Hỏa | `village_to_fire_001` | `village_to_fire_002` |
| Phong (locked) | `village_to_wind_001` | `village_to_wind_002` |
| Băng | `village_to_ice_001` | `village_to_ice_002` |

i18n: `map_name.village_to_<element>_<NN>` = "Đường tới Trường <Hệ> (1)" / "(2)".

## 3. Path topology

```
                        Village
                       / |  |  \
                      /  |  |   \
        (existing)   /   |  |    \
       CombatField  /    |  |     \
        (x=180)    /     |  |      \
                  /      |  |       \
       vt_fire_001   vt_wind_001  vt_ice_001
       (x=6300)    (x=1500,LOCK) (x=3500)
            |          |              |
            |          |              |
       vt_fire_002 vt_wind_002    vt_ice_002
            |          |              |
            ↓          ↓              ↓
      Fire School   Wind School   Ice School
```

Mỗi farm có 2 portal: entry (back) + exit (forward). Trường có 1 back portal về farm cuối path.

## 4. Lock placement

- **Lock 1 portal duy nhất**: Village → `village_to_wind_001` (`PortalConfig.locked: true`).
- Path Phong (vt_wind_001 → vt_wind_002 → wind_school_001) bản thân **không có lock** — một khi qua được cổng đầu (QA bypass), đi tiếp tự do.
- **QA bypass**: `c.unlock_all_maps = true` ở character record → BaseMapScene auto unlock toàn bộ portal locked (logic có sẵn ở `BaseMapScene.ts:740-743`).

## 5. Map dimensions (Tiled coordinate, height fixed = 1440)

| Map | Width | Note |
|---|---|---|
| `village_001` | 6688 | giữ collider gốc, chỉ update portal config |
| `fire_school_001` | 2160 | giữ collider gốc, chỉ thêm back portal |
| `ice_school_001` | 2160 | giữ collider gốc, chỉ thêm back portal |
| `wind_school_001` | 2160 | NEW |
| 6 farm maps | **3200** mỗi cái | NEW |

> ⚠️ Note: `sword_school_001/colliders.json` hiện ghi width=2160 nhưng NPC config có x=5500 (vượt biên), `map_bounds.go` ghi `sword_school_001 = 4000`. Inconsistency cũ — không sửa trong spec này, defer cho phase audit colliders.

## 6. Collision layout chuẩn (farm map 3200×1440)

Mỗi farm map dùng layout này, vary platform Y ±50px để 6 maps không identical:

```
Ground full-width:        x=0    y=1380 w=3200 h=60
Plat A (low ledge):       x=500  y=1230 w=300  h=20
Plat B (mid):             x=1100 y=1080 w=400  h=20
Plat C (mid-high):        x=1900 y=930  w=350  h=20
Plat D (HIGH exit ledge): x=2700 y=780  w=400  h=20
```

**Reachability check** (jump max ≈ 187px):
- Ground (y=1380) → Plat A (y=1230): Δ=150 ≤ 187 ✓
- Plat A → Plat B: Δ=150 ✓
- Plat B → Plat C: Δ=150 ✓
- Plat C → Plat D: Δ=150 ✓
- Plat D top y=780 → exit portal auto-place ở đây ("lối thông trên cao")

Variations cho 6 farm:
- `vt_fire_001`, `vt_ice_001` (gần village): theo template chính.
- `vt_fire_002`, `vt_ice_002`: Plat A y=1240, Plat B y=1075, Plat C y=920, Plat D y=770 (cao hơn 10px, hơi khó hơn).
- `vt_wind_001`, `vt_wind_002`: Plat layout đảo chiều (Plat D ở bên trái x=300 thay vì phải) — vibe "trường ẩn dật". Vì sao đảo: tăng visual distinctiveness cho path locked, sau này khi mở user thấy ngay "khác" so với 2 path còn lại.

Cụ thể vt_wind layout:
```
Ground:                   x=0    y=1380 w=3200 h=60
Plat D (HIGH exit, LEFT): x=200  y=780  w=400  h=20  ← exit portal
Plat C:                   x=900  y=930  w=350  h=20
Plat B:                   x=1700 y=1080 w=400  h=20
Plat A:                   x=2400 y=1230 w=300  h=20  ← gần entry x=2900? hmm
```

Hmm wait — vt_wind 001 entry from village x=180 (left), exit to vt_wind_002 x=2900 (right) per default. Không nên đảo. Bỏ đảo, giữ template chuẩn cho cả 6 farm để consistency. Variation chỉ là Y jitter ±50px.

**Final**: 6 farms dùng template + jitter Y ±50px (random per map). Document chi tiết Y jitter ở section 9.

## 7. Wind school layout (2160×1440 NEW)

Map nhỏ giống fire/ice schools, có thêm 1 platform cao bên trái cho back portal:

```
Ground:                    x=0    y=1380 w=2160 h=60
Plat back-portal:          x=100  y=900  w=300  h=20  ← back portal x≈200
Plat decor (mid):          x=900  y=1100 w=300  h=20
Plat decor (mid):          x=1500 y=1000 w=300  h=20
```

## 8. Portal table

| From map | x | Target | Locked? | Label i18n key |
|---|---|---|---|---|
| `village_001` | 180 | CombatFieldScene | no | `portal.label.time_pit` (existing) |
| `village_001` | 1500 | VillageToWind001Scene | **YES** | `portal.label.to_wind_school` |
| `village_001` | 3500 | VillageToIce001Scene | no | `portal.label.to_ice_school` |
| `village_001` | 6300 | VillageToFire001Scene | no | `portal.label.to_fire_school` |
| `village_to_fire_001` | 180 | VillageScene | no | `portal.label.return_village` |
| `village_to_fire_001` | 2900 | VillageToFire002Scene | no | `portal.label.continue` |
| `village_to_fire_002` | 180 | VillageToFire001Scene | no | `portal.label.return` |
| `village_to_fire_002` | 2900 | FireSchoolScene | no | `portal.label.enter_fire_school` |
| `village_to_wind_001` | 180 | VillageScene | no | `portal.label.return_village` |
| `village_to_wind_001` | 2900 | VillageToWind002Scene | no | `portal.label.continue` |
| `village_to_wind_002` | 180 | VillageToWind001Scene | no | `portal.label.return` |
| `village_to_wind_002` | 2900 | WindSchoolScene | no | `portal.label.enter_wind_school` |
| `village_to_ice_001` | 180 | VillageScene | no | `portal.label.return_village` |
| `village_to_ice_001` | 2900 | VillageToIce002Scene | no | `portal.label.continue` |
| `village_to_ice_002` | 180 | VillageToIce001Scene | no | `portal.label.return` |
| `village_to_ice_002` | 2900 | IceSchoolScene | no | `portal.label.enter_ice_school` |
| `fire_school_001` | 180 | VillageToFire002Scene | no | `portal.label.return` |
| `wind_school_001` | 200 | VillageToWind002Scene | no | `portal.label.return` |
| `ice_school_001` | 180 | VillageToIce002Scene | no | `portal.label.return` |
| `fire_school_001` | (existing) | BambooForestScene | no | giữ nguyên |
| `ice_school_001` | (existing) | BambooForestScene | no | giữ nguyên |

Total: 22 portals (6 existing kept + 1 LOCKED + 15 new entries).

## 9. Per-farm collision file (concrete Y values)

| Map | Plat A y | Plat B y | Plat C y | Plat D y |
|---|---|---|---|---|
| `village_to_fire_001` | 1230 | 1080 | 930 | 780 |
| `village_to_fire_002` | 1235 | 1085 | 935 | 785 |
| `village_to_wind_001` | 1225 | 1075 | 925 | 775 |
| `village_to_wind_002` | 1240 | 1090 | 940 | 790 |
| `village_to_ice_001` | 1220 | 1070 | 920 | 770 |
| `village_to_ice_002` | 1228 | 1078 | 928 | 778 |

X + W không đổi (xem section 6).

## 10. Mock tileset spec

Generate placeholder cho Tiled editor:

- **`public/assets/tilesets/mock_32.png`** — 512×512 px, 16×16 tiles size 32px = 256 tiles total. Mỗi tile là color block có viền + index number để debug visual.
- **`public/assets/tilesets/mock_32.tsx`** — Tiled tileset XML định nghĩa 256 tiles từ PNG.

Khi user vẽ tileset thật: replace `mock_32.png` cùng dim (32px tiles, 16×16 grid). Không cần đụng `.tsx` nếu giữ nguyên metadata.

## 11. Output files mỗi map mới (7 maps: 6 farm + wind school)

```
public/assets/maps/<map_id>/
├── <map_id>.tmj          # Tiled JSON: tile layer rỗng (all 0) + tileset ref → mock_32 + objectgroup
├── colliders.json         # stripped: chỉ objectgroup + width/height
└── npcs/                  # empty folder placeholder
```

**`.tmj` example structure:**
```json
{
  "version": "1.10",
  "tiledversion": "1.10.2",
  "type": "map",
  "orientation": "orthogonal",
  "renderorder": "right-down",
  "width": 100,
  "height": 45,
  "tilewidth": 32,
  "tileheight": 32,
  "infinite": false,
  "tilesets": [
    { "firstgid": 1, "source": "../../tilesets/mock_32.tsx" }
  ],
  "layers": [
    { "type": "tilelayer", "name": "tiles", "width": 100, "height": 45, "data": [/* 4500 zeros */] },
    { "type": "objectgroup", "name": "platforms", "objects": [
      { "x": 0, "y": 1380, "width": 3200, "height": 60 },
      ...
    ]}
  ]
}
```

**`colliders.json`** = `{ width, height, layers: [objectgroup only] }` — match format hiện tại.

## 12. ENGINE WORKFLOW (BẮT BUỘC ĐỌC)

> ⚠️ Engine **chỉ load `colliders.json`**, KHÔNG load `.tmj`. `.tmj` chỉ dùng cho design Tiled editor.

Workflow user khi muốn vẽ map:
1. Mở `<map_id>.tmj` trong Tiled Map Editor.
2. Vẽ tile vào layer `tiles` (dùng tileset `mock_32` hoặc replace bằng tileset thật).
3. Adjust collision rectangles trong layer `platforms` nếu cần.
4. **Export bg PNG**: File → Export As → PNG → save làm `<map_id>.png` (Tiled render flatten tile layer thành ảnh).
5. **Sync collision**: copy nội dung object layer từ `.tmj` → ghi đè `colliders.json` (giữ format `{width, height, layers}`). Hoặc tạo script export.
6. Update `MapConfig.bgAsset` trong scene file trỏ tới PNG mới.

Sẽ có README ngắn ở `docs/maps/README.md` mô tả workflow này.

## 13. BE changes (option A1: rewrite migrations in-place)

### 13.1 Migration rewrites
Edit thẳng 7 files:
- `migrations/20260428120000_seed_teleporter_npc.{up,down}.sql`
- `migrations/20260429190100_seed_phase_2_npcs_items_quests.up.sql`
- `migrations/20260503100000_phase_1_reseed.up.sql`
- `migrations/20260505120000_seed_weapon_merchant_hayato.up.sql`
- `migrations/20260505130000_seed_apparel_merchant_hina.up.sql`
- `migrations/20260505140000_seed_jewelry_merchant_akira.up.sql`

Replace tất cả: `sword_school_001` → `fire_school_001`, `hayabusa_school_001` → `ice_school_001`.

### 13.2 Go code
- `internal/modules/realtime/usecase/map_bounds.go`:
  - Rename `sword_school_001` entry → `fire_school_001`.
  - **Add** `ice_school_001` (Width: 4000, Height: 1200) — hiện đang missing.
  - **Add** `wind_school_001` (Width: 4000, Height: 1200).
  - **Add** 6 farm maps (Width: 3200, Height: 1200 — match Tiled height/scale).

- `internal/modules/npc/domain/map_catalog.go`:
  - Rename `sword_school_001` → `fire_school_001`.
  - **Add** `ice_school_001` (Category: School).
  - **Add** `wind_school_001` (Category: School).
  - 6 farm maps: **không add** vào catalog (không phải teleport destination).

### 13.3 BE i18n locale
Tìm + update key `map_name.sword_school_001` / `map_name.hayabusa_school_001` → `map_name.fire_school_001` / `map_name.ice_school_001`. Add `map_name.wind_school_001` + 6 farm names.

### 13.4 BE docs
6 file dưới `docs/business/` chỉ có lore reference đến tên cũ — search/replace `sword_school_001` → `fire_school_001`, `hayabusa_school_001` → `ice_school_001`. Update display names trong text từ "Trường Kiếm" → "Trường Hỏa Kiếm", "Trường Cung" → "Trường Băng Cung". File list:
- `docs/business/game-objects/apparel/README.md`
- `docs/business/equipment/weapons/weapon.md`
- `docs/business/game-objects/jewelry/README.md`
- `docs/business/story/mvp-plan.md`

### 13.5 DB reset
```
make down                    # docker-compose down
docker volume rm kageverse_postgres_data  # nếu volume tồn tại
make up                      # docker-compose up
make run                     # server tự chạy migrations đã rewrite
```

## 14. FE changes

### 14.1 Asset folder rename
```
git mv public/assets/maps/sword_school_001 public/assets/maps/fire_school_001
git mv public/assets/maps/hayabusa_school_001 public/assets/maps/ice_school_001
```

### 14.2 Scene file rename
```
git mv src/game/scenes/SwordSchoolScene.ts src/game/scenes/FireSchoolScene.ts
git mv src/game/scenes/HayabusaSchoolScene.ts src/game/scenes/IceSchoolScene.ts
```

Trong file đổi tên:
- Class name: `SwordSchoolScene` → `FireSchoolScene` (tương tự Ice)
- `super('SwordSchoolScene')` → `super('FireSchoolScene')`
- `mapId: 'sword_school_001'` → `'fire_school_001'`
- `bgKey`, `colliderKey`, asset paths: tất cả refs đổi theo

### 14.3 Tạo 7 scene file mới
- `VillageToFire001Scene.ts`, `VillageToFire002Scene.ts`
- `VillageToWind001Scene.ts`, `VillageToWind002Scene.ts`
- `VillageToIce001Scene.ts`, `VillageToIce002Scene.ts`
- `WindSchoolScene.ts`

Mỗi scene extend `BaseMapScene`, `getNpcConfigs() = []`, portal config theo bảng section 8.

### 14.4 Registry + GameConfig + i18n
- `src/game/maps/registry.ts`: rename 2 entry, add 7 entry mới.
- `src/game/config/GameConfig.ts`: import 7 scene mới + rename 2, add hết vào `scene: [...]`.
- `src/i18n/locales/{vi,en}.ts`: rename `map.name.sword_school_001` → `map.name.fire_school_001` (etc), add 7 entry mới + 4 portal label mới (`portal.label.to_wind_school`, `to_ice_school`, `to_fire_school`, `enter_*_school`, `continue`, `return_village`, `return`).

### 14.5 Update VillageScene portals
`getPortalConfigs()` thêm 3 entry (xem section 8).

## 15. Out of scope (defer)

- NPC seed cho 7 map mới (currently `getNpcConfigs() = []`).
- Monster spawn cho 6 farm map.
- BG PNG: user vẽ sau, scene config trỏ đến `<map_id>.png` không tồn tại → engine sẽ log lỗi load image nhưng vẫn render colliders. Acceptable cho MVP dev.
- Background music / ambience cho map mới.
- Quest gating cho việc unlock Wind school (để user thiết kế sau).
- Audit colliders.json discrepancy (sword school width 2160 vs 4000).

## 16. Definition of done

- [ ] `make all` xanh ở BE.
- [ ] FE `npm run build` xanh.
- [ ] DB reset + reseed thành công, không còn ref `sword_school_001`/`hayabusa_school_001` trong DB:
  ```
  psql -c "SELECT DISTINCT map_id FROM npc_templates;"   # không có sword/hayabusa
  ```
- [ ] Mở FE local, login → từ village thấy 4 portal (CombatField + 3 path mới). Path Wind hiển thị locked (nếu char không phải QA).
- [ ] Set `unlock_all_maps=true` trên character QA → đi qua Wind path full được.
- [ ] Walk village → vt_fire_001 → vt_fire_002 → fire_school_001, có thể quay về.
- [ ] Tương tự cho ice path.

## 17. Câu hỏi chưa chốt

Không (tất cả decisions confirmed: A1, mapping Hỏa/Phong/Băng theo vị trí, lock ở village → vt_wind_001, overwrite scene file trực tiếp).
