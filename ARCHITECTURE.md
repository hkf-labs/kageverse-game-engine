# Architecture

Scene / component / network inventory for the Kageverse frontend. For rules see `AGENTS.md` and `STANDARDS.md`; for game design and API contracts see the backend repo (`../kageverse-server/docs/`).

This file is the canonical scene & component registry — every scene registered in `GameConfig.ts` and every component under `src/game/components/` must appear here.

## React ↔ Phaser boundary

`src/components/GameComponent.tsx` is the **only** bridge:

- `useEffect` (mount-once) dynamic-imports Phaser, builds the config from `src/game/GameConfig.ts`, and mounts `new Phaser.Game()` into `#phaser-game-container`; unmount destroys the game (with an `isMounted` guard against the import race).
- React owns: DOM shell, loading/error overlay, future Web3 chrome. Phaser owns: the entire gameplay loop.
- `src/main.tsx` boots i18n for static DOM (rotate prompt) before the React tree; `src/App.tsx` renders `<GameComponent />` only.

## Scene system

All map scenes extend `src/game/scenes/BaseMapScene.ts` (~2,200 lines), which assembles every component, runs the shared update loop (input → physics → WS move throttle → world-target selection), wires realtime listeners, and handles shutdown cleanup.

**Contract** — required: `getMapConfig()`, `getNpcConfigs()`, `getMapDisplayName()`. Optional: `preloadMapAssets()`, `getPortalConfigs()` (legacy), `getPortalOverrides()`, `onMapReady()`.

**Registration** — scene class in `GameConfig.ts` `scene` array **and** a `MAP_REGISTRY` entry (`src/game/maps/registry.ts`, map_id ↔ scene key). Portals are built from backend `GET /maps/:id` `links` when available.

### Scene inventory

| Group | Scenes | Notes |
|---|---|---|
| Auth / bootstrap | `AuthScene`, `CharacterCreateScene` | Login/register/token restore → create → village |
| Hub | `VillageScene` | Safe zone, 7 NPCs (Hoshi, Healer, Chef, Merchant, Stash, Teleporter, Elder) |
| Schools | `FireSchoolScene`, `IceSchoolScene`, `WindSchoolScene` | Safe zones, 4 NPCs each, lv 5–8 |
| Village → school paths | `VillageToFire001/002`, `VillageToIce001/002`, `VillageToWind001/002` | Farm maps, two legs per school |
| School → village paths | `FireToVillage004001/002`, `FireToVillage005001/002`, `IceToVillage003001/002`, `WindToVillage002001/002` | Combat maps, lv 8–13 |
| Boss showcase | `MahoragaBossScene` | Spine animation preview (Q17 first trial) |
| Placeholder | `MainScene` | Post-onboarding fallback / debug grid |

## Component inventory (`src/game/components/`)

All implement `GameComponent` (`types.ts`): `create()`, optional `update()` / `destroy()` / `setVisible()`.

| Component | Role |
|---|---|
| `MapBackground` | BG image, Tiled colliders, surface textures, parallax layers |
| `PlayerController` | Player sprite, hitbox, movement, camera follow |
| `HUD` | Top bar (HP/MP/level/EXP) + status text |
| `Minimap` | Secondary camera, frame, blips |
| `GameControls` | Virtual D-pad, attack / potion / target-cycle buttons |
| `SkillHotbar` | 5 skill slots |
| `ActionMenu` | In-game Phaser menu (main + submenus) |
| `NpcManager` / `NpcChatBubble` | NPC spawn, interaction, dialogs, BE template menus |
| `MonsterManager` / `MonsterTargetFrame` | Monster spawn (from `GET /maps/:id/monsters`), attack, retaliation; target HP frame |
| `BossHPBar` | Full-width boss banner |
| `LootDropManager` / `PickupToast` | Dropped Yên/items, overlap pickup, toasts |
| `RemotePlayerManager` / `PlayerChatBubble` | Other players on the map (WS) + chat bubbles |
| `QuestTracker` | Corner overlay tracking the active quest |
| `BuffIndicator` | Food-buff icons + countdown |
| `Portal` | Map transition trigger |
| `spineShared.ts` | Shared Spine (canvas runtime) skeleton loading — remote players, boss |
| `inputFocus.ts` | Keyboard layer-priority routing (see below) |

### Modals (`components/modals/` — native HTML DOM)

`BaseModal` + `createModalShell` + `theme.ts` (styling constants) + `softKeys.ts`. Instances: `ChatPanel`, `InventoryModal`, `EquipmentModal`, `CharacterInfoModal`, `SkillModal`, `QuestLogPanel`, `ShopModal`, `HoshiUpgradeModal`, `SettingsModal`, `AutoSettingsModal`, `ConfirmDialog`, `DeathMenu`, `ModalItemMenu`, `EndMvpOverlay`.

### Input focus layers

`inputFocus.ts` routes ESC / F1 / F2 / arrows / Enter to the **topmost** active layer:

```
confirm (400) > cinematic (350) > modalItemMenu (300) > blockingDialog (250) > modal (200) > actionMenu (100)
```

Shortcuts: `J` quest log, `F1` action menu, `F2`/`ESC` back/close, `Enter` interact (double-tap = auto-attack).

## Network layer (`src/network/`)

- **`api.ts`** — single REST client. JWT in localStorage (`kageverse_jwt` / `kageverse_refresh`), auto-refresh on 401, `X-Trace-Id` per request, `formatApiError()`. API objects: `authAPI`, `charactersAPI`, `inventoryAPI`, `mapsAPI`, `npcAPI`, `combatAPI`, `questAPI`.
- **`WebSocketClient.ts`** — singleton `wsClient`; reconnect backoff 1→2→4→8 s (infinite, except auth failure / `session_replaced`); outbound queue flushed on open; event dispatch by server event name.
- **`realtime.ts` / `realtimeBootstrap.ts`** — connect after login, disconnect on logout.
- **`protocol/events.ts`** — FE mirror of the WS contract (`../kageverse-server/docs/api/realtime.md`). Client→server: `join_map`, `leave_map`, `move`, `ping`, `chat_send`, `chat_history_req`. Server→client: `map_snapshot`, `player_joined/moved/left`, `char_stats`, `char_level_up`, `snapshot_position` (rollback), `quest_progress`, `chat_message`, `chat_history`, `pong`, `error`.
- **Move throttle** — `BaseMapScene.sendMoveIfNeeded`: 33 ms cap (~30 Hz) + >1 px delta + direction change.

## Features (`src/features/` — gateway pattern)

| Feature | Shape |
|---|---|
| `onboarding` | Full gateway pattern: `OnboardingGateway` interface + `mockOnboardingGateway` + `httpOnboardingGateway`; singleton selected by `VITE_ONBOARDING_DATA_SOURCE` (`mock` \| `api`) |
| `maps` | HTTP-only: `mapDetailStore` caches `GET /maps/:id` (spawn points, links, monsters) |
| `npcs` | `mockNpcGateway` fallback; NPCs with a `templateId` fetch live menus from the BE |

New backend-fed features should follow the onboarding shape (interface + mock + http + env-selected singleton).

## i18n (`src/i18n/`)

11 locales (`vi`, `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `th`, `de`, `fr`, `es`, `pt-BR`); bundles exist for `en` + `vi`, others fall back to `en`. Resolution: localStorage → user prefs → `vi`. API: `t(key, params)`, `tOpt(key)`, `onLocaleChange(cb)`, `applyDomTranslations(root)`.

## Assets

```
public/assets/
├── maps/<map_id>/        # bg.png + colliders.json (Tiled) + npcs/   ← per-map, see docs/maps/README.md
├── characters/male_base/ # Spine skeleton (player & remote players)
├── mahoraga/             # Boss Spine rig
├── game/{items,skills,buttons,ui}/  # Icons & UI sprites
├── bg/                   # Parallax layers
└── tilesets/             # Surface textures
```

Root `NPC/` holds reference artwork only — not loaded by code.

## Key invariants

1. **Single Phaser entry** — one dynamic import, one `Phaser.Game`, in `GameComponent.tsx`.
2. **Scene/registry consistency** — `super('SceneKey')` === `GameConfig.ts` list === `MAP_REGISTRY`.
3. **Server-authoritative gameplay** — client predicts movement only and obeys `snapshot_position` rollbacks.
4. **Throttled realtime** — no idle sends; ~30 Hz cap on `move`.
5. **DOM overlays + focus layers** — all modals are HTML DOM; all keys route through `inputFocus.ts`.
6. **Scene transitions leak nothing** — `shutdown` destroys DOM overlays and WS listeners; portal code defensively clears `.kageverse-overlay`.
