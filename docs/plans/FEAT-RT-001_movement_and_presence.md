# Plan: Movement & realtime presence

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-RT-001 |
| Linked spec | `docs/specs/FEAT-RT-001_movement_and_presence.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

Locally-predicted, server-authoritative movement plus live map presence: throttled `move` streaming, `snapshot_position` rollback, remote players rendered with shared Spine data and interpolation, and a self-healing singleton WebSocket that connects at login and survives map transitions (spec AC-1…AC-7).

## 2. Approach

One app-wide `WSClient` singleton (not per-scene sockets) keeps the connection alive across `scene.start` map changes; scenes only subscribe/unsubscribe listeners and send `join_map`/`leave_map`. The protocol mirror lives in one typed file (`events.ts`) so payload drift against `realtime.md` is a single-file diff. Local movement reuses Arcade Physics for prediction; the server stays authoritative by validating each move and snapping back via `snapshot_position`. Remote players reuse the exact Spine constants of `PlayerController` but share parsed skeleton data (`spineShared.ts`) — N players cost one asset load. Everything is composed as `GameComponent` classes orchestrated by `BaseMapScene`.

## 3. Steps

1. **Protocol mirror** — `src/network/protocol/events.ts`: `ClientEvent` / `ServerEvent` envelopes (`{t, p}`), `JoinMapPayload`, `MovePayload`, `MapSnapshotPayload`, `PlayerPresencePayload`, `PlayerMovedPayload` (server `ts`), `SnapshotPositionPayload`, plus `REALTIME_ERROR_CODES` / `REALTIME_CLOSE_CODES` matching the BE constants.
2. **Transport** — `src/network/WebSocketClient.ts`: singleton `wsClient` with `connect` (idempotent, lazy token via callback), `send` (queue while closed, flush on open), app-level `ping` every 25 s (pong swallowed), reconnect backoff `[1,2,4,8,8]s` infinite, close-code classification (4001 → `onAuthFailed`, 4010 → `onSessionReplaced`, 1000 manual), typed dispatch through `EventDispatcher` with unknown-event guard.
3. **App wiring** — `src/network/realtime.ts` (`connectRealtime` supplies `getAccessToken`, clears tokens on auth failures; `disconnectRealtime` for logout) and `src/game/realtimeBootstrap.ts` (`bootstrapRealtimeForGameEntry` — called from `AuthScene` and `CharacterCreateScene` right before entering the first map; session-replaced → alert `realtime.error.session_replaced` + `AuthScene`).
4. **Local player** — `src/game/components/PlayerController.ts`: 24×44 invisible hitbox (collide world bounds, platform collider), camera follow with deadzone, Spine `male_base` loaded via `@esotericsoftware/spine-canvas` and drawn to a `CanvasTexture` each frame (foot offset 22 px), idle↔run from velocity, `setFacing` via skeleton scaleX, frozen (no gravity, invisible) until `activate()`.
5. **Movement loop** — `BaseMapScene.update()`: merge cursor keys + `GameControls.getVirtualInputs()`, speed 280 / jump 580, zero velocity + route keys to the top `inputFocus` layer while modals are open, then `playerCtrl.update()`, `remotePlayers.update()`, `sendMoveIfNeeded()`.
6. **Outbound throttle** — `BaseMapScene.sendMoveIfNeeded()`: guards `rtJoined` + activated, 33 ms min interval (`RT_MOVE_THROTTLE_MS`), 1 px delta (`RT_MOVE_DELTA_PX`) or dir change (dir inferred from velocity X), updates `rtLastSentPos`.
7. **Join/leave + rollback** — `sendJoinMap()` fires only after `loadInitialCharacterState()` restores the spawn (listeners are registered first so early events still land); `teardownRealtimeListeners()` on shutdown unsubscribes all `rtUnsubs` and sends `leave_map` when joined; the `snapshot_position` listener repositions the player and resets `rtLastSentPos`.
8. **Presence rendering** — `src/game/components/RemotePlayerManager.ts`: `setOwnCharacterID` self-filter; `applySnapshot` reconcile; `addPlayer`/`upsertPlayer`; `updatePosition` (discard `ts` older than last, set lerp target, snap >600 px); per-frame lerp 0.2, run/idle at >0.8 px/frame, `dir` flip, name plates, selection arrow (`findNearestInRange` + `canAutoSelectVertically`); full destroy of textures/containers on `removePlayer`/`handleLeft`.
9. **Shared Spine data** — `src/game/components/spineShared.ts`: `ensureSharedSpineData` loads `male_base.json`/`.atlas` once with a wait-queue; `createSpineInstance` stamps per-player `Skeleton` + `AnimationState` from the shared data.
10. **Scene listener registration** — `BaseMapScene.setupRealtimeListeners()` subscribes `snapshot_position`, `map_snapshot`, `player_joined`, `player_moved`, `player_left` (plus stats/chat/quest listeners owned by other features) and stores unsubscribers in `rtUnsubs`.

## 4. Assets & i18n

- Assets: `public/assets/characters/male_base/` (`male_base.json`, `male_base.atlas` + textures) — provided by the user; shared by local and remote rendering.
- i18n (`locales/en.ts` + `vi.ts`): `realtime.error.session_replaced`, `realtime.error.map_locked`, `realtime.error.out_of_bounds`, `realtime.error.max_speed_exceeded`.
- Env vars: `VITE_WS_BASE_URL` (optional override; derived from `VITE_API_BASE_URL` otherwise) — already in `.env.example` with comments.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — FE only predicts movement; server validates and rolls back.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends (1 px delta + dir-change gate).
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` (payloads, error codes 1500xx/1600xx, close codes 4001/4010/4030).

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass (two-client presence + WS frame inspection).
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated. *(Spec is Implemented; `_INDEX.md` rows are added by the docs indexer in a follow-up.)*
