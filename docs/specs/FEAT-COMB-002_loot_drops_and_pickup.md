# Spec: Loot drops & pickup

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-COMB-002 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-COMB-002_loot_drops_and_pickup.md` |
| Game-design source | `../kageverse-server/docs/business/items/yen.md`, `../kageverse-server/docs/business/items/upgrade-stone.md`, `../kageverse-server/docs/business/monsters/README.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

When the backend grants loot from a monster kill (Yên or item drops in `AttackResponse.drops`), the drops appear as sprites on the ground at server-supplied positions. The player picks them up by selecting (auto or click) and pressing Enter / the touch attack button — auto-running into range if needed — and gets a bottom-center marquee toast listing what was received. Drop contents, ownership locks, quest gating, and expiry all come from the server; the client never decides what dropped.

## 2. Player-facing behavior

- **Appearing:** drops from the player's own kills are added immediately from `AttackResponse.drops` (`LootDropManager.addDrops`); the 8 s `GET /maps/:id/monsters` poll syncs the full drop set (adds others' drops, removes picked/pruned ones). Each drop renders as an item sprite (Yên coin, upgrade stone, beetle carapace, turtle shell, herb flower — keyed off `item_template_id` in `src/network/lootDrop.ts`) sitting on the platform surface at its raw `pos_x`.
- **Expiry:** drops despawn client-side at `expires_at` (server timestamp, 15 s lifetime; FE fallback derives it if missing and logs a warning).
- **Selecting:** the unified world-target loop in `BaseMapScene` auto-selects the nearest drop within pickup range (160 raw px on the X axis, `LOOT_PICKUP_RANGE_RAW_PX`); a yellow down-arrow appears above the selected drop. Clicking a drop selects it manually and locks the selection (other auto-targets won't override until ESC or pickup).
- **Picking up (keyboard):** Enter with a drop selected — in range the player turns to face the drop and POST `/drops/pickup` fires; out of range the player auto-runs toward the drop's X and picks up on arrival. ESC cancels selection and auto-move.
- **Picking up (touch):** the attack button triggers the same interact path; drop selection takes priority over monster/NPC interaction when a drop is selected.
- **Feedback:** success removes the sprite and shows the `PickupToast` — a DOM marquee at bottom-center ("You received {items}"), batching pickups within 320 ms into one line, holding 3 s, scrolling if too wide, then sliding out. Yên shows as "N Yen" (`combat.pickup_yen`); items resolve names via `item.name.<template_id>`. The same toast component also announces shop purchases.
- **Errors (server-validated):** owned-by-other (`combat.drop_owned_by_other`), out of range (`combat.drop_out_of_range`), quest-gated drop (`combat.drop_quest_required`, sprite fades), already gone (`drop_not_found`, sprite fades silently), generic failure (`combat.pickup_failed`) — all shown as HUD status text.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Constructs `LootDropManager` + `PickupToast`; routes `AttackResponse.drops` → `addDrops`, `onDropsSync` poll → `syncDrops`; loot branch in `handleInteract` / auto-move arrival in `update()`; preloads the five loot textures |
| `src/game/components/LootDropManager.ts` | Drop sprites, selection arrow, auto/manual selection, range check, auto-move, POST pickup + error mapping |
| `src/game/components/PickupToast.ts` | DOM marquee toast (batch, static hold, scroll, exit) |
| `src/network/lootDrop.ts` | Drop normalization (`normalizeLootDrops`), expiry helpers, pickup-range helper, sprite-key / template-id constants |

No new `GameComponent` classes needed — `LootDropManager` and `PickupToast` exist and implement `src/game/components/types.ts`. No new map scenes.

## 4. Backend contract

- REST (`combatAPI` in `src/network/api.ts`; no combat module doc exists yet under `../kageverse-server/docs/api/`):
  - `GET /maps/:id/monsters?character_id=` — returns `drops: LootDropDTO[]` + `server_now` (anchor for expiry normalization).
  - `POST /characters/:id/attack` — response `drops` are the player's newly granted loot.
  - `POST /characters/:id/drops/pickup` — body `{ map_id, drop_id, player_x, player_y }`; response carries `kind` plus `yen_amount`/`yen_balance` or `item_template_id`/`qty`. Error codes consumed: `drop_not_owned`, `drop_out_of_range`, `drop_not_found`, `drop_quest_required`.
- WS: none consumed or emitted for loot (drop sync is REST-polled).
- Drop rates, contents, owner locks, and quest gating are server-side only.

## 5. UI & input

- Overlays: `PickupToast` is a plain DOM element appended to `document.body` at `MODAL_Z_INDEX.toast` (pointer-events none) so it stays visible above HTML modals; not a `BaseModal` since it never takes input. No Phaser `DOMElement`.
- Keyboard: Enter/ESC handled in `BaseMapScene.update` at the gameplay layer; no new focus layer — pickup input is blocked whenever a modal is open or the player is dead.
- i18n key prefixes (`src/i18n/locales/{en,vi}.ts`): `combat.pickup_*` (`pickup_received`, `pickup_yen`, `pickup_failed`), `combat.drop_*`, `item.name.*` (toast item names), `shop.purchase_received` (shared toast path).

## 6. Client-side state & prediction

- Nothing about loot is predicted: drop existence, position, ownership, and pickup results come from the server. The client only pre-checks pickup range to avoid doomed requests and despawns sprites at the server-provided `expires_at`.
- No new env vars.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build` — all green.
2. Backend running; kill monsters on a farm map until the server grants drops → sprites appear on the ground where the monster stood.
3. Walk near a drop → selection arrow appears; press Enter → player faces the drop, sprite disappears, toast shows "You received N Yen" / item name.
4. Select a distant drop by clicking, press Enter → player auto-runs and picks up on arrival; ESC mid-run cancels.
5. Kill several monsters quickly and pick up multiple drops → one batched toast line; long lists scroll.
6. Leave a drop on the ground ~15 s → it despawns. With a second account, try to grab a fresh drop owned by the first → "Someone else's drop".
7. `VITE_GAME_DEBUG=true` helps confirm positions against raw coordinates.

## 8. Acceptance criteria

- AC-1 Drops returned in `AttackResponse.drops` render immediately at their server `pos_x` on the platform surface with the correct sprite per `kind` / `item_template_id`.
- AC-2 The periodic monster-list poll adds newly visible drops and removes drops the server no longer reports.
- AC-3 Drops despawn locally at their server `expires_at` without a pickup call.
- AC-4 The nearest in-range drop is auto-selected (arrow indicator); clicking a drop manually locks selection over other world targets.
- AC-5 Enter / touch attack picks up the selected drop via POST `/drops/pickup` when in range, and auto-runs into range first when not.
- AC-6 Successful Yên pickup shows the "{n} Yen" toast; item pickup shows the localized item name (×qty); rapid pickups batch into one toast.
- AC-7 Server pickup errors map to the correct localized HUD messages; `drop_not_found` / `drop_quest_required` also fade out the sprite.

## 9. Out of scope

- What and how often monsters drop (server-side; see linked business docs).
- Inventory/wallet UI updates beyond cache invalidation (FEAT-INV-001).
- Shop purchase flow (the toast is merely reused for it).
- Auto-pickup on walk-over without an interact press (current build requires Enter / attack button).
