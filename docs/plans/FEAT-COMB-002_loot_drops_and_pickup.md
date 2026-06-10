# Plan: Loot drops & pickup

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-COMB-002 |
| Linked spec | `docs/specs/FEAT-COMB-002_loot_drops_and_pickup.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

Server-granted drops (Yên + items) appear on the ground at server positions, are selectable through the unified world-target system, are picked up via Enter / touch attack with auto-run-into-range, and confirmed with a batched bottom-center toast — with the server owning drop contents, ownership, gating, and expiry (spec AC-1…AC-7).

## 2. Approach

Loot reuses the patterns already established for monsters and NPCs: a `GameComponent` manager owned by `BaseMapScene`, auto/manual selection feeding the unified world-target loop, and auto-move-to-target on interact. No dedicated drop endpoint or WS event was added — drops piggyback on the existing `AttackResponse` (immediate own-kill drops) and the 8 s `GET /maps/:id/monsters` poll (set sync), keeping the protocol untouched. Normalization and expiry logic live framework-free in `src/network/lootDrop.ts` so the manager stays a thin renderer. The toast is body-mounted DOM (not `BaseModal`) because it must stay visible above HTML modals while never capturing input.

## 3. Steps

1. Define `LootDropDTO` / `PickupDropRequest` / `PickupDropResponse` and `combatAPI.pickupDrop` in `src/network/api.ts`; have `combatAPI.listMonsters` / `attack` pass drops through `normalizeLootDrops`.
2. Create `src/network/lootDrop.ts`: `normalizeLootDrop(s)` (fills missing `expires_at` from the server anchor + 15 s), expiry helpers, `LOOT_PICKUP_RANGE_RAW_PX` / `isPlayerInLootPickupRange` (X-axis raw-coordinate check matching the backend), sprite-key and material-template-id constants.
3. Build `src/game/components/LootDropManager.ts`: `addDrops` / `syncDrops`, sprite + invisible hit-area per drop on the platform surface (`MapBackground.getPlatformYAtX`), selection arrow, `selectDropAuto` / click-lock manual selection, `findNearestInRange`, `handleInteract` + `checkAutoMoveArrival` auto-run, `pickup()` calling `combatAPI.pickupDrop` and mapping the four server error codes to localized callbacks.
4. Build `src/game/components/PickupToast.ts`: body-mounted DOM marquee with 320 ms batching, 3 s static hold, overflow scroll, slide-out exit; `notifyYen` / `notifyItem` / `notifyShopItem` entry points.
5. Wire in `src/game/scenes/BaseMapScene.ts`: construct `PickupToast` then `LootDropManager` (before `MonsterManager` so `onAttackResult` / `onDropsSync` can forward drops); callbacks `onYenPicked` → toast, `onItemPicked` → toast, `onError` → HUD status, `onManualTargetLocked` → world-target lock; loot candidate in `updateUnifiedWorldTarget` (range `LOOT_PICKUP_RANGE_RAW_PX × scale`); loot-first branch in `handleInteract`; `loot.checkAutoMoveArrival` in the update loop's auto-move chain.
6. Preload the five loot textures in `BaseMapScene.preload()` (`item_yen`, `item_upgrade_stone`, `item_material_beetle_carapace`, `item_material_turtle_shell`, `item_material_herb_flower`).

## 4. Assets & i18n

- Assets (user-provided, existing): `public/assets/game/items/{yen,upgrade_stone,material_beetle_carapace,material_turtle_shell,material_herb_flower}.png`.
- i18n keys in `locales/en.ts` + `locales/vi.ts`: `combat.pickup_received`, `combat.pickup_yen`, `combat.pickup_failed`, `combat.drop_owned_by_other`, `combat.drop_out_of_range`, `combat.drop_quest_required`, plus `item.name.<template_id>` entries for toast names.
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — drop contents, ownership, quest gating, and pickup grants are all server responses; the FE range check only suppresses doomed requests.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends (auto-run to a drop goes through normal movement).
- [x] FE mirror `src/network/protocol/events.ts` untouched — loot adds no WS events, so no sync was required.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
