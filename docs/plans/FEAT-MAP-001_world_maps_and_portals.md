# Plan: World maps & portals

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-MAP-001 |
| Linked spec | `docs/specs/FEAT-MAP-001_world_maps_and_portals.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

A scene-per-map world where every map is a thin `BaseMapScene` subclass; backgrounds + colliders render from `public/assets/maps/<map_id>/`, portals and spawn points come from backend `GET /maps/:id` links, locks follow `unlocked_maps`, and the player's position survives reloads (spec AC-1…AC-7).

## 2. Approach

One abstract scene (`BaseMapScene`) owns the entire map lifecycle — preload, component composition, portal building, spawn resolution, autosave — so concrete scenes are pure data (`getMapConfig`, NPC configs, overrides). Backend `links[]` is the wire truth for portals; a legacy `getPortalConfigs()`/`targetSceneKey` path remains only as a fallback for maps the BE doesn't know. Rendering reuses the flat-PNG + Tiled-collider workflow (`docs/maps/README.md`) instead of runtime tilemaps: cheaper to author and the engine never parses `.tmj`. All world features are self-contained `GameComponent` classes (`MapBackground`, `Portal`, `Minimap`) orchestrated by the scene.

## 3. Steps

1. **Registry** — `src/game/maps/registry.ts`: `MAP_REGISTRY` (map_id → sceneKey, 18 entries), `resolveSceneKeyForMap` (fallback `VillageScene`), `mapIdForSceneKey(+OrDefault)`, `mapDisplayName` via i18n `map.name.<map_id>`.
2. **Map detail gateway** — `src/features/maps/parseMapDetail.ts` parses snake_case `GET /maps/:id` into `MapDetail` (size, coordinate_system, spawn_points.default/by_link_id, links[], rules); `src/features/maps/mapDetailStore.ts` caches per map and exposes `peekLinkTargetMapId` / `peekSpawnForIncomingLink`. REST call lives in `mapsAPI.getDetail` (`src/network/api.ts`).
3. **Background & physics** — `src/game/components/MapBackground.ts`: backdrop or parallax tile-sprites, world bounds = max(bg width, collider extent), gravity 900, static platform group built from the `colliders.json` objectgroup, `getPlatformYAtX()` exposed-surface lookup for NPC/portal/spawn grounding.
4. **Coordinate + spawn helpers** — `src/game/spawn.ts`: `businessVecToRender` (bottom-left origin → render, per `coordinates.md`), `MapSceneInitData` (`spawnX/Y`, `linkId`, `useHubSpawn`), `resolveSpawnOnMap` (saved `last_pos_*`), `resolveSpawnFromIncomingLink` (by_link_id, 22 px foot offset, ground clamp when `y <= 0`).
5. **Portal component** — `src/game/components/Portal.ts`: animated ellipse graphics (gray when locked), label + in-range hint (`portal.enter_hint` / `portal.locked_hint`), `bindLinkTargetMapId`, `reposition(renderX)` after BE hydrate, `trigger()` = 450 ms camera fade then `onEnter`. Labels via `src/game/maps/portalLabels.ts`.
6. **Scene lifecycle** — `src/game/scenes/BaseMapScene.ts`:
   - `preload()`: loading-bar UI, loads `cfg.bgKey/bgAsset`, `cfg.colliderKey/colliderAsset`, surface/parallax textures, shared UI assets; `preloadMapAssets()` hook.
   - `create()`: builds components, legacy portals from `getPortalConfigs()`, then `onMapReady()`.
   - `loadInitialCharacterState()`: `loadMapDetail` → `buildPortalsFromMapLinks` (labels + `getPortalOverrides()` lock overrides, `portal_point` repositioning), link/hub spawn, `charactersAPI.list()` → HUD + saved-position restore + portal lock gating (`unlocked_maps`, `unlock_all_maps` bypass), then `playerCtrl.activate()` in `finally`.
   - `update()`: `portal.updatePortal(player.x, player.y)` each frame; Enter in `handleInteract()` triggers the in-range portal or shows its locked message.
7. **Persistence** — `startPositionAutosave()`: save on entry, 30 s interval, `beforeunload` (keepalive), scene shutdown; skipped while frozen. `charactersAPI.savePosition` posts `{map_id, x, y}`.
8. **Minimap** — `src/game/components/Minimap.ts`: 160×110 secondary camera (zoom = 110/bgHeight) top-right, framed, pulsing blip, `ignoreUIElements()`.
9. **Concrete scenes** — e.g. `src/game/scenes/VillageScene.ts`: map config (`safeZone: true`, surface textures), NPC list, wind-portal lock override, NPC sprite preloads. Register every scene in `src/game/GameConfig.ts` and `MAP_REGISTRY`; assets per `docs/maps/README.md`.

## 4. Assets & i18n

- Assets: `public/assets/maps/<map_id>/` (`<map_id>.png` + `colliders.json` + optional `npcs/`), tilesets under `public/assets/tilesets/` — provided by the user, workflow in `docs/maps/README.md`.
- i18n (`locales/en.ts` + `vi.ts`): `map.name.*`, `map.locked_default`, `portal.label.*` (incl. `portal.label.goto_map`), `portal.locked.*`, `portal.enter_hint` / `portal.locked_hint` / `portal.locked_default`, `minimap.title`, `loading.map`.
- Env vars: none added.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — portal targets, spawn points and locks all come from BE data.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` (`join_map` / `leave_map` payloads).

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated. *(Spec is Implemented; `_INDEX.md` rows are added by the docs indexer in a follow-up.)*
