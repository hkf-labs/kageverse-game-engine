# Spec: Shop & food buffs

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-SHOP-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-SHOP-001_shop_and_food_buffs.md` |
| Game-design source | `../kageverse-server/docs/business/features/shop.md`, `../kageverse-server/docs/business/items/food-buff.md`, `../kageverse-server/docs/business/npcs/merchant-zeni.md`, `../kageverse-server/docs/business/npcs/chef-kuma.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

The player buys items (potions, food, equipment, charms) from shop NPCs through a 36-slot grid modal that shows the per-NPC catalog and the character's coin/gold/gem wallet. Purchases go through a confirm dialog and the backend `buy` endpoint — prices, stock and the resulting balance are entirely server-decided. Eating a food item starts a server-side HP/MP regen buff; the FE shows it as a countdown icon in the top-left buff panel, restored on reload from the character's `active_food_buff`.

## 2. Player-facing behavior

- **Entry points.** Walk up to a shop NPC (e.g. Merchant Zeni, Chef Kuma), interact (Enter on keyboard, or the touch attack/interact button — `GameControls.onInteract` → `NpcManager`), and pick the NPC menu action `buy_shop` (`npc.action_buy_shop`, 🛒). Weapon/apparel/jewelry merchants first show a category submenu, then open the shop pre-filtered (`classFilter` sword/bow, `subTypeFilter` hat/shirt/…) — see `NpcManager.openWeaponShop` / `openApparelShop` / `openJewelryShop`.
- **Shop screen.** HTML DOM modal (`ShopModal`, title `shop.title_with_npc`): a fixed 6×6 grid of 56 px cells (scrolls past 36 items), empty cells dimmed. Each listing shows its icon (sprite via `resolveItemIconUrl`, emoji fallback per type/sub_type) and an equipment-star badge where applicable; hover shows a native tooltip with the item name.
- **Currency display.** A footer bar shows the wallet: 🪙 coin, 💰 gold, 💎 gem (`charactersAPI.getWallet`); while loading it shows `shop.balance_loading`. After a purchase the spent currency updates immediately from the buy response (`balance_after`), then the full wallet re-syncs.
- **Selection & actions.** Clicking a cell (or arrow keys) selects it and reveals a bottom action bar: **Buy** (left) and **View** (center). View opens a small info sub-panel: name, type, required level, equipment stats/stars, food/potion heal text (`shop.heal_food_buff` / `shop.heal_hp` / `shop.heal_mp`), and all unit prices per currency. Buy opens a floating wooden-button menu: `[Buy] [Buy multiple]`; "Buy multiple" swaps to an amount input (clamped 1–99) with `[Close] [Confirm] [Clear]`.
- **Keyboard.** Arrows navigate the grid; ↓ from the last row moves focus to the action bar (←/→ between buttons, ↑ back). Enter in the grid opens the buy menu; J2ME-style soft keys F1/Enter click the left/center action-bar button (`triggerSoftKey` → `clickActionBarSlot`). F2/Esc closes the modal.
- **Purchase.** Confirming shows a `ConfirmDialog` with the quantity, item name and total price (`shop.confirm_buy_message`); on OK the FE calls `shopAPI.buy` and shows `shop.bought` in the status footer plus a `PickupToast` notification. Errors (insufficient funds, level, stock) display the backend error message.
- **Food buffs.** Eating a food item from the **inventory** (not the shop) triggers `food_buff_started` in the use-item response; the FE adds a 🍜 icon with an MM:SS (or `XhMM`) countdown to the top-left `BuffIndicator` panel (up to 6 slots; same category replaces the old buff). The buff expires client-side at `expires_at` (icon auto-removed); the actual HP/MP regen ticks server-side and reaches the HUD via WS `char_stats`. On scene load, `active_food_buff` from `GET /characters` restores the icon.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Creates `ShopModal` (wired with `ConfirmDialog` + `PickupToast`), `BuffIndicator` (+ QuestTracker reflow via `onLayoutChanged`), restores `active_food_buff` on load, routes modal keyboard input (`collectInputTargets`, layer `INPUT_LAYER.modal`) |
| `src/game/components/modals/ShopModal.ts` | The shop screen: grid, wallet bar, detail sub-panel, buy menu, confirm + buy flow. Public: `open({mapId, npcTemplateId, npcName, classFilter?, subTypeFilter?})`, `close()`, `navigate()`, `confirm()`, `triggerSoftKey()` |
| `src/game/components/BuffIndicator.ts` | Buff countdown panel. Public: `setBuff(ActiveBuff)`, `removeBuff(key)`, `clearAll()`, `hasBuffs()`, per-frame `update()`; helpers `iconForTemplate` / `categoryForTemplate` |
| `src/game/components/NpcManager.ts` | Opens the shop from NPC action menus (`buy_shop`, `browse_weapons/apparel/jewelry` submenus with class/sub-type filters) |
| `src/game/components/modals/InventoryModal.ts` | `onFoodBuffStarted` callback feeds `BuffIndicator` when a food item is consumed |
| `src/game/components/PickupToast.ts` | `notifyShopItem(nameKey, qty)` toast after purchase |

No new `GameComponent` classes or map scenes needed.

## 4. Backend contract

- REST (all via `src/network/api.ts`):
  - `GET /maps/:map_id/npcs/:npc_template_id/shop` (`shopAPI.list`) — per-NPC catalog (`ShopListingDTO[]` with `prices[]`, `base_stats`, `class_id`, `sub_type`); doc: `../kageverse-server/docs/api/shop/shop.md`.
  - `POST /characters/:id/shop/buy` (`shopAPI.buy`) — payload `{map_id, npc_template_id, item_template_id, currency_type, amount}`; response carries `purchased` + `currency.balance_after` + `stock_remaining`; same doc.
  - `GET /characters/:id/wallet` (`charactersAPI.getWallet`) — coin/gold/gem; doc: `../kageverse-server/docs/api/character/characters.md`.
  - `POST /characters/:id/inventory/use` (`inventoryAPI.use`) — food consumption returns `effects.food_buff_started` (`FoodBuffStartedDTO`); doc: `../kageverse-server/docs/api/character/inventory.md`.
- WS: no shop-specific events. Buff regen reaches the HUD through `char_stats` (`../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`).
- No backend changes required — the FE consumes existing contracts only.

## 5. UI & input

- Overlays: `ShopModal` extends `BaseModal` / `createModalShell` (size `md`, layer `modal`, status footer); the detail sub-panel and buy menu are sibling DOM nodes inside the shell overlay. No Phaser `DOMElement`.
- Keyboard: shop registers at `INPUT_LAYER.modal` via `createKeyboardModalTarget`; while open, gameplay movement/attack input is blocked (`isInputBlockingModalOpen`). The nested `ConfirmDialog` sits on the higher `confirm` layer.
- i18n key prefixes (in `locales/en.ts` + `vi.ts`): `shop.*` (title, buttons, confirm, errors, heal texts), `inventory.currency_*`, `inventory.type_*`, `npc.action_buy_shop`, `npc.run.shop_unavailable`, `item.consumable.food_*`, `api.error.load_shop` / `api.error.buy` / `api.error.load_wallet`.

## 6. Client-side state & prediction

- The client computes **no** prices, stock, discounts or buff effects. It only: filters the BE catalog for submenu UX (`classFilter`/`subTypeFilter`), clamps the amount input to 1–99, optimistically writes `balance_after` from the buy response, and counts down the buff icon to `expires_at`. HP/MP changes from the buff arrive via server `char_stats`.
- Env vars: none new.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build`.
2. Run BE (`../kageverse-server`: `make up && make run`) + `yarn dev`; log in, go to `village_001`.
3. Interact with Merchant Zeni → Buy shop: grid renders the catalog, wallet bar shows balances.
4. Select an item → View: detail panel lists name, required level, prices. Select a food item at Chef Kuma: heal text shows the per-second/duration template.
5. Buy ×3 via "Buy multiple": confirm dialog shows total; after OK the status footer shows `shop.bought`, wallet drops by the server-reported amount, toast appears.
6. Open inventory, eat the food item → 🍜 icon with countdown appears top-left; F5 → icon restored from `active_food_buff`; wait past expiry → icon disappears.
7. Keyboard-only pass: arrows / Enter / F1 / F2 cover navigate, buy, view, close.

## 8. Acceptance criteria

- AC-1 The shop opens only from NPC action menus (`buy_shop` or merchant submenus) and shows that NPC's catalog from `shopAPI.list` in a fixed 6-column grid.
- AC-2 Weapon/apparel/jewelry submenus open the same modal filtered by `class_id` / `sub_type` client-side, without extra BE calls.
- AC-3 The wallet bar shows coin/gold/gem from `GET /characters/:id/wallet`; a wallet load failure hides balances but does not block browsing or buying.
- AC-4 Buying requires an explicit `ConfirmDialog` showing quantity and total; quantity is clamped to 1–99; the deducted amount and new balance come exclusively from the `shopAPI.buy` response.
- AC-5 A successful purchase updates the wallet bar, shows the `shop.bought` status line and a `PickupToast`; a backend rejection surfaces the server error message in the status footer.
- AC-6 Consuming a food item adds a countdown icon (`BuffIndicator`) keyed by template category; a new food buff of the same category replaces the old icon, and the icon auto-removes at `expires_at`.
- AC-7 After reload, an active food buff icon is restored from `active_food_buff` in `GET /characters`.
- AC-8 While the shop is open, arrow/Enter/F1/F2 keys operate the modal only; player movement and attack are blocked.

## 9. Out of scope

- Selling items back to NPCs (no sell endpoint consumed).
- Equipment upgrade (FEAT covered by `HoshiUpgradeModal`), inventory management itself, and potion HP/MP instant heal UX.
- Skill-cast buffs in the same indicator (covered by FEAT-SKL-001).
- Non-food buff types (exp/atk/def boost) — icon mappings exist but no FE flow starts them yet.
