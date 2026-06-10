# Plan: Shop & food buffs

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-SHOP-001 |
| Linked spec | `docs/specs/FEAT-SHOP-001_shop_and_food_buffs.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

A per-NPC shop modal (grid catalog, wallet bar, view/buy actions, confirm-before-spend) backed entirely by `shopAPI`, plus a top-left buff panel that shows food-buff countdowns started by inventory use and restored on reload (spec AC-1…AC-8).

## 2. Approach

Reuse the established modal stack instead of building bespoke UI: `ShopModal` extends `BaseModal`/`createModalShell` (HTML DOM overlay, status footer, locale re-render) and mirrors `InventoryModal`'s 56 px grid, bottom action bar and soft-key conventions so shop and bag feel identical. The shop is injected into `NpcManager` as a dependency so NPC menus stay declarative. Submenu filtering (weapon class, apparel slot) is a pure client-side filter over the full BE catalog — one endpoint serves every merchant. The buff display is a separate Phaser-side `GameComponent` (`BuffIndicator`) because it lives in the HUD layer of the world, not in a modal; it only renders server-provided expiry timestamps. All money math stays on the server: the FE shows BE prices, sends `{currency_type, amount}`, and paints `balance_after` from the response.

## 3. Steps

1. **API surface** — `src/network/api.ts`: `ShopListingDTO`/`ShopPriceDTO`/`ShopListResponse`/`ShopBuyPayload`/`ShopBuyResponse` types; `shopAPI.list(mapId, npcTemplateId)` → `GET /maps/:id/npcs/:tpl/shop`, `shopAPI.buy(characterId, payload)` → `POST /characters/:id/shop/buy`; `WalletDTO` + `charactersAPI.getWallet`. Food buff types: `FoodBuffStartedDTO` in `UseInventoryEffects`, `ActiveFoodBuffDTO` on `CharacterDTO`.
2. **Shop modal** — `src/game/components/modals/ShopModal.ts`: shell options (size `md`, layer `modal`, `withStatus`); 6×6 fixed grid (36 cells, hidden-scrollbar `.cim-scroll`), cell icons via `inventorySlotIconHtml` + `resolveItemIconUrl` + equipment-star badges (`src/game/equipmentStars.ts`); wallet footer; `open()` loads listings + wallet in parallel and applies `classFilter`/`subTypeFilter`.
3. **Actions & sub-panels** — same file: bottom action bar (Buy left / View center, `clickActionBarSlot` from `modals/softKeys.ts`); detail sub-panel (stats via `buildEquipmentStatLines`, heal templates `shop.heal_*`); buy menu with wooden-tablet buttons, `initial`/`multi` modes, amount input clamped 1–99.
4. **Confirm + execute** — `handleBuy` opens the injected `ConfirmDialog` with name/qty/total, `executeBuy` calls `shopAPI.buy`, writes `currency.balance_after` into the wallet bar, sets the `shop.bought` status, fires `onItemPurchased` (→ `PickupToast.notifyShopItem`), then re-syncs the wallet.
5. **Keyboard** — `navigate()` (grid ⇄ action-bar zones), `confirm()`, `triggerSoftKey()`; registered in `BaseMapScene.collectInputTargets()` as `createKeyboardModalTarget(INPUT_LAYER.modal, this.shop, …)` so `routeBlockedInput` forwards arrows/Enter/F1/F2 only to the top layer (`src/game/components/inputFocus.ts`).
6. **NPC wiring** — `src/game/components/NpcManager.ts`: `shopModal` dep from the scene; `runAction('buy_shop')` opens it with `{mapId, npcTemplateId, npcName}`; `openWeaponCategoryMenu` / `openApparelSlotMenu` / `openJewelrySlotMenu` build `ActionMenu` submenus that re-open the shop with `classFilter`/`subTypeFilter` (pre-class characters rejected early).
7. **Scene composition** — `src/game/scenes/BaseMapScene.ts`: create `ConfirmDialog` and `PickupToast` before `ShopModal`, pass both as deps; pass the shop into `NpcManager`; include `shop.isOpen()` in `isInputBlockingModalOpen()`.
8. **Buff indicator** — `src/game/components/BuffIndicator.ts`: 6-slot Phaser container (depth 100, scroll-locked, top-left), `setBuff` upsert by category key, per-frame countdown text (`MM:SS` / `XhMM`) + auto-prune at expiry, `onLayoutChanged` → `BaseMapScene.syncQuestTrackerOffset()` so the quest tracker reflows below active buffs.
9. **Buff sources** — `BaseMapScene`: `InventoryModal` `onFoodBuffStarted` → `buffIndicator.setBuff({key: categoryForTemplate(...), expiresAt, icon: iconForTemplate(...)})`; initial load reads `active_food_buff` from `charactersAPI.list()` (or removes the `food_buff` slot when absent). HUD HP/MP regen arrives via the existing WS `char_stats` listener.

## 4. Assets & i18n

- Assets: item icon sprites under `public/assets/` resolved by `src/game/itemIcon.ts` (emoji fallback per item type / sub_type, e.g. 🍜 for `food_buff`) — provided by the user; no shop-specific art files.
- i18n (`locales/en.ts` + `vi.ts`): `shop.*` (~30 keys: title, btn_buy/btn_view/btn_buy_multi/btn_agree/btn_clear, confirm_buy_*, bought, processing, error_*, heal_hp/heal_mp/heal_food_buff(+_note), required_level, unit_price, input_amount_label, balance_loading), `inventory.currency_*`, `inventory.type_*`, `npc.action_buy_shop`, `npc.run.shop_unavailable`, `api.error.load_shop/buy/load_wallet/use_item`.
- Env vars: none added.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — prices, stock, deduction, buff duration and regen all come from BE responses; FE only clamps the input amount and displays `balance_after` / `expires_at`.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends (shop adds no WS traffic).
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` — no protocol change; buff HUD sync rides the existing `char_stats` event.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated. *(Spec is Implemented; `_INDEX.md` rows are added in a follow-up indexing pass.)*
