# Spec: Movement & realtime presence

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-RT-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-RT-001_movement_and_presence.md` |
| Game-design source | `../kageverse-server/docs/business/maps/coordinates.md` (position semantics); protocol authority is `../kageverse-server/docs/api/realtime.md` (§4) |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

The player runs and jumps through side-scrolling maps with instant, locally-predicted movement while a singleton WebSocket session keeps the server authoritative: position updates stream out at ≤~30 Hz, the server can snap the player back on rejected moves, and every other player on the same map appears live with name plate, Spine animation, and smooth interpolation. The connection self-heals with exponential backoff and survives map changes.

## 2. Player-facing behavior

- **Controls.** Keyboard: arrow keys ← → move (speed 280 px/s), ↑ jumps (impulse 580) when grounded. Touch: virtual D-pad (`GameControls`) sets the same left/right/up inputs; pointer-up/out releases them. Movement is blocked while any modal/menu is open (input-focus layers) or while dead.
- **Visible states (self).** The character is a Spine `male_base` rig (canvas-rendered) over a 24×44 physics hitbox, with the display name above the head. Animation auto-switches idle ↔ run from velocity; facing flips with direction. On scene mount the character is frozen/invisible until the saved position is restored ("activate"), so there is no spawn-then-teleport flicker.
- **Other players.** When another character is on the same map they appear with the same Spine rig and a name plate. They glide toward each new network position (lerp 0.2/frame), snap if more than 600 px off, play run/idle based on actual motion, and flip per the sent direction. They disappear immediately when they leave the map. A nearby remote player can be auto-targeted (selection arrow) within `REMOTE_PLAYER_SELECT_RANGE_PX`.
- **Server rollback.** If the server rejects a move (out of bounds / max speed), the player visibly snaps to the server's `snapshot_position` coordinates.
- **Connection lifecycle.** The WS connects right after login/character-create (before the first map scene). On network drops it silently reconnects with backoff (no UI badge currently). If the same account logs in elsewhere, the session closes (4010), tokens are cleared, an alert (`realtime.error.session_replaced`) shows, and the game returns to `AuthScene`; auth failure (4001) also returns to `AuthScene`.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/components/PlayerController.ts` | Local player: arcade hitbox, Spine rendering to a CanvasTexture, idle/run/one-shot anims, facing, freeze/activate, name plate |
| `src/game/scenes/BaseMapScene.ts` | `update()` movement loop; `sendMoveIfNeeded()` throttle (33 ms + 1 px delta + dir change); `sendJoinMap()` after spawn restore; `leave_map` on shutdown; `snapshot_position` rollback; WS listener setup/teardown (`rtUnsubs`) |
| `src/game/components/RemotePlayerManager.ts` | Remote players: snapshot reconcile, join/move/leave handling, ts-ordered updates, lerp + snap, shared-Spine attach, name plates, selection arrow |
| `src/game/components/spineShared.ts` | Loads `male_base` Spine skeleton/state data once, shared across all remote players |
| `src/network/WebSocketClient.ts` | Singleton `wsClient`: connect/queue/flush, 25 s app ping, backoff reconnect, close-code classification, typed event dispatch |
| `src/network/protocol/events.ts` | FE mirror of the realtime protocol (envelopes, payloads, error/close codes) |
| `src/network/realtime.ts` | `connectRealtime` / `disconnectRealtime` wrappers (token supply, session-replaced/auth-failed handling) |
| `src/game/realtimeBootstrap.ts` | `bootstrapRealtimeForGameEntry(scene)` — called by `AuthScene` and `CharacterCreateScene` before entering the first map |

No new `GameComponent` classes needed — all listed classes exist.

## 4. Backend contract

- WS protocol: `../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`.
  - Emitted: `join_map` (`{map_id, x, y, dir}` after position restore), `move` (`{x, y, dir}` throttled), `leave_map` (scene shutdown), `ping` (25 s).
  - Consumed: `map_snapshot` (you + others), `player_joined`, `player_moved` (with server `ts` to drop out-of-order packets), `player_left`, `snapshot_position` (rollback), `error` (codes 150020 OUT_OF_BOUNDS, 150021 MAX_SPEED_EXCEEDED, …). Close codes: 4001 AUTH_FAILED, 4010 SESSION_REPLACED, 4030 SERVER_SHUTDOWN.
  - (`char_stats` / `char_level_up` / chat / quest events ride the same socket but belong to other specs.)
- REST: `GET /characters` (`charactersAPI.list`) supplies the spawn position restored before `join_map`; `POST /characters/:id/position` autosave (see `../kageverse-server/docs/api/character/characters.md` and FEAT-MAP-001).
- WS handshake: `${VITE_WS_BASE_URL}/ws?token=<access_token>` (derived from `VITE_API_BASE_URL` when unset).

## 5. UI & input

- Overlays: none — name plates, selection arrow and the auto-attack label are Phaser GameObjects. The session-replaced notice is a `window.alert`.
- Keyboard: movement reads cursor keys only on the gameplay path of `BaseMapScene.update()`; any open layer in `inputFocus.ts` zeroes velocity and routes keys to the top layer instead.
- i18n keys (existing, `locales/en.ts` + `vi.ts`): `realtime.error.session_replaced`, `realtime.error.map_locked`, `realtime.error.out_of_bounds`, `realtime.error.max_speed_exceeded`.

## 6. Client-side state & prediction

- The client predicts **movement only**: physics (gravity 900, velocity, jumps) runs locally for smoothness; the server validates each `move` and rolls back via `snapshot_position` (FE also resets `rtLastSentPos` so the next delta is measured from the server's position).
- Outbound `move` gates (all in `BaseMapScene.sendMoveIfNeeded`): joined map + activated player, ≥33 ms since last send (~30 Hz), and >1 px delta on x or y **or** a direction change — an idle character sends nothing.
- Remote state is render-only; `wsClient` queues outbound events while the socket is down and flushes on open.
- Env vars: `VITE_WS_BASE_URL` (already in `.env.example` with comment).

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build`.
2. Backend up (`make up && make run`), `yarn dev`, log in. DevTools → Network → WS frames:
3. Stand still → no `move` frames; run → `move` frames at ≤~30 Hz; tap to flip facing without moving → one `move` with the new `dir`.
4. Open a second browser with another account on the same map → both clients see each other join, glide while moving, and vanish on portal exit (`player_left`).
5. Log in with the same account in a second tab → first tab alerts session-replaced and returns to `AuthScene`.
6. Kill the backend for a few seconds and restart → console shows reconnect attempts (1→2→4→8 s) and presence resumes.
7. `VITE_GAME_DEBUG=true` shows the physics hitbox to verify the 24×44 body and 22 px foot offset.

## 8. Acceptance criteria

- AC-1 Arrow keys / virtual D-pad move the player at 280 px/s with a 580 jump impulse when grounded; input is ignored while a modal layer is open or the character is dead.
- AC-2 `join_map` is sent only after the saved/link spawn position is applied, carrying the actual `{map_id, x, y, dir}`; `leave_map` is sent on scene shutdown when joined.
- AC-3 `move` is never sent when idle, never faster than every 33 ms, and only on >1 px movement or a facing change.
- AC-4 A `snapshot_position` event repositions the local player to the server's coordinates and resets the throttle baseline.
- AC-5 `map_snapshot` reconciles the remote roster (removes absent, upserts others, skips self); `player_joined`/`player_moved`/`player_left` add, interpolate (lerp 0.2, snap >600 px, out-of-order `ts` discarded) and remove remote players.
- AC-6 Remote players render the shared `male_base` Spine rig (loaded once via `ensureSharedSpineData`) with name plate, idle/run switching at >0.8 px/frame motion, and `dir`-based flipping.
- AC-7 The WS reconnects with 1/2/4/8/8 s capped backoff indefinitely on network loss, but stops and routes to `AuthScene` (clearing tokens) on close 4001 or 4010; queued events flush on reopen.

## 9. Out of scope

- Chat messages/bubbles and chat history (ride the same socket; separate feature).
- HUD stat sync (`char_stats`, `char_level_up`) and quest progress events.
- Combat, monsters, loot, and remote-player appearance/equipment visuals (`AppearancePayload` is reserved, unused in MVP).
- A visible "Reconnecting…" UI badge (`onStateChanged` exists on `WSClient` but no scene subscribes).
