# Spec: World maps & portals

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-MAP-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-MAP-001_world_maps_and_portals.md` |
| Game-design source | `../kageverse-server/docs/business/maps/map-linking.md`, `../kageverse-server/docs/business/maps/map-structure-backend.md`, `../kageverse-server/docs/business/maps/coordinates.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

The player moves through a world of ~18 side-scrolling map scenes (village hub, three school maps, portal-linked farm paths). Each map is one Phaser scene that renders a flat PNG background plus collision platforms from a Tiled-exported `colliders.json`, shows a minimap, and exposes animated portals at positions the backend defines. Walking into a portal and pressing Enter fades out and starts the target map's scene; the destination spawn point comes from the backend link data, so map topology is owned by the server.

## 2. Player-facing behavior

- **Entry points.** After login, `AuthScene` starts the scene for the character's `last_map_id` (`resolveSceneKeyForMap`, fallback `VillageScene`). A loading screen with a progress bar (`loading.map` + percent) covers asset preload. The character stays invisible/frozen until the saved position is restored, then appears at the saved spot (or at the link/hub spawn after a portal/respawn).
- **Map identity.** Map display name (i18n `map.name.<map_id>`) is pinned top-center; a 160×110 minimap (secondary camera, title `minimap.title`) sits top-right with a pulsing red blip following the player.
- **Portals.** Each portal renders as an animated purple ellipse (gray when locked) with a label above it ("go to {target map name}"). Walking within range shows a hint: `portal.enter_hint` ("↵ Enter") or `portal.locked_hint`. Pressing **Enter** (keyboard) or the interact button (touch — `GameControls` virtual D-pad + action buttons) while in range:
  - unlocked → camera fades out 450 ms, then the target map scene starts with `{ linkId }`;
  - locked → a status message shows the lock reason (scene-specific `portal.locked.*` or `map.locked_default`).
- **Lock gating.** Portal locks follow the character's `unlocked_maps` from `GET /characters`; `unlock_all_maps` (QA flag) unlocks everything. Scenes may force-lock a link (e.g. `VillageScene` locks `village_001_to_village_to_wind_001` with `portal.locked.wind_school`).
- **Position persistence.** Position is auto-saved on map entry, every 30 s, on `beforeunload` (keepalive fetch), and on scene shutdown — so F5 returns the player to the same spot on the same map.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Abstract base: `getMapConfig()` contract, preload (bg + colliders + shared UI assets), portal building from BE links, spawn resolution, position autosave, `onMapReady()` hook |
| `src/game/scenes/VillageScene.ts` (+ ~17 sibling scenes) | Concrete scene: `super('SceneKey')`, `getMapConfig` (mapId, bg/collider assets, `tiledOriginalHeight`, `safeZone`), NPC configs, portal overrides, `preloadMapAssets` |
| `src/game/maps/registry.ts` | `MAP_REGISTRY` map_id ↔ scene key (18 entries) + `resolveSceneKeyForMap` / `mapIdForSceneKey` / `mapDisplayName` |
| `src/game/maps/portalLabels.ts` | Portal label = `portal.label.goto_map` with the target map's display name |
| `src/game/components/MapBackground.ts` | Backdrop/parallax, physics world bounds = max(bg width, collider extent), gravity 900, static platforms from `colliders.json` objectgroup, `getPlatformYAtX()` surface lookup |
| `src/game/components/Portal.ts` | Animated portal graphics, range detection, locked state, `bindLinkTargetMapId` / `reposition`, fade-out + `onEnter` |
| `src/game/components/Minimap.ts` | Secondary camera minimap + player blip |
| `src/features/maps/mapDetailStore.ts` / `parseMapDetail.ts` | Cached `GET /maps/:id` loader; parses links, spawn_points, size, coordinate_system |
| `src/game/spawn.ts` | `businessVecToRender` (bottom-left → render coords), link/hub/saved spawn resolution, `MapSceneInitData` |

New map scenes need a `MAP_REGISTRY` entry, `GameConfig.ts` scene registration, and an asset folder per `docs/maps/README.md` (engine loads only `<map_id>.png` + `colliders.json`; `.tmj` is design-only).

## 4. Backend contract

- REST (all in `src/network/api.ts`):
  - `GET /maps/:map_id` (`mapsAPI.getDetail`) — wire truth for `links[]` (link_id, target_map_id, portal_point, entry_point), `spawn_points` (default + by_link_id), `size`, `coordinate_system`. No FE-side `docs/api` page exists for this module; business pages above are the authority.
  - `GET /characters` (`charactersAPI.list`) — `last_map_id`/`last_pos_x`/`last_pos_y`, `unlocked_maps`, `unlock_all_maps` (see `../kageverse-server/docs/api/character/characters.md`).
  - `POST /characters/:id/position` (`charactersAPI.savePosition`) — autosave, supports `keepalive`.
- WS: map transitions trigger `leave_map` (scene shutdown) and `join_map` (after spawn restore) — protocol per `../kageverse-server/docs/api/realtime.md`, FE mirror `src/network/protocol/events.ts`; details in FEAT-RT-001.
- Legacy fallback: `getPortalConfigs()` with `targetSceneKey` only for portals the BE doesn't know; BE `links[]` is preferred.

## 5. UI & input

- Overlays: none new — loading UI and portal labels/hints are Phaser GameObjects; map modals are out of scope here.
- Keyboard: Enter interaction runs in `BaseMapScene.update()` gameplay path only when no modal layer is open (`inputFocus.ts` layer system blocks it otherwise).
- i18n key prefixes (in `locales/en.ts` + `vi.ts`): `map.name.*`, `map.locked_default`, `portal.label.*`, `portal.locked.*`, `portal.enter_hint`, `portal.locked_hint`, `portal.locked_default`, `minimap.title`, `loading.map`.

## 6. Client-side state & prediction

- Client predicts nothing about maps: portal targets, spawn points, lock state, and saved position are all server data. FE only converts business coordinates (bottom-left origin) to render coordinates (`businessVecToRender`) and clamps spawn to the platform surface (`getPlatformYAtX`).
- `loadMapDetail` caches `GET /maps/:id` per map in-memory (`mapDetailStore`).
- Env vars: none new (`VITE_GAME_DEBUG` enables `MapCoordinateDebug` grid/HUD).

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build`.
2. Run BE (`../kageverse-server`: `make up && make run`) + `yarn dev`; log in.
3. In `village_001`: confirm loading bar, map name, minimap blip, portals rendered at BE `portal_point` positions.
4. Walk into an unlocked portal, press Enter → fade-out, target map loads, player spawns at the link's `spawn_points.by_link_id` entry.
5. Approach the wind-school portal with a fresh character → locked hint + locked message.
6. F5 mid-map → player reappears at the same coordinates on the same map.
7. `VITE_GAME_DEBUG=true` → coordinate grid + physics hitboxes to verify collider alignment.

## 8. Acceptance criteria

- AC-1 Every map_id in `MAP_REGISTRY` resolves to a registered scene whose key matches its `super('SceneKey')`; unknown map_ids fall back to `VillageScene`.
- AC-2 Each map renders its `bg.png`/parallax plus collision platforms from `colliders.json`; the player can walk to the collider extent even past the bg image.
- AC-3 Portals are created from `GET /maps/:id` `links[]` with positions from `portal_point` (business → render conversion) and labels from `map.name.<target>`.
- AC-4 Entering an unlocked portal in range with Enter fades out and starts the target scene with the traversed `linkId`; the destination spawns the player at `spawn_points.by_link_id[linkId]` (foot offset 22 px above the platform).
- AC-5 Locked portals (not in `unlocked_maps`, or scene override) refuse to trigger and show their locked message; `unlock_all_maps` bypasses all locks.
- AC-6 Player position is saved via `POST /characters/:id/position` on entry, every 30 s, on unload and on scene shutdown, and is restored on next mount — but never while the player is still frozen (pre-activation).
- AC-7 The minimap shows the whole map scaled into 160×110 with a pulsing blip tracking the player.

## 9. Out of scope

- Movement networking / remote players (FEAT-RT-001).
- NPCs, monsters, loot, quests, and combat behavior on maps.
- Teleport items / NPC teleporter UX (uses `scene.start` + `useHubSpawn` but is owned by inventory/NPC features).
- Creating new map art or Tiled assets (workflow doc: `docs/maps/README.md`; assets come from the user).
