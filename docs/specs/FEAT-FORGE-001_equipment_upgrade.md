# Spec: Equipment Upgrade (Hoshi)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-FORGE-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-FORGE-001_equipment_upgrade.md` |
| Game-design source | `../kageverse-server/docs/business/features/equipment-upgrade.md`, `../kageverse-server/docs/business/equipment/stars.md`, `../kageverse-server/docs/business/items/upgrade-stone.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

At the Hoshi (Refiner) NPC the player enhances equipment from +N to +(N+1) by spending Upgrade Stones and yen. The modal lists upgradeable gear, shows the next-level cost and the stat-bonus delta for currently equipped items, and the upgrade itself is executed and resolved entirely by the backend — the client renders the returned old/new enchant level and refreshed balances.

## 2. Player-facing behavior

**Entry point.** Interact with the Hoshi NPC; their action menu includes "Enhance equipment" (`upgrade_equipment` action, ⚒️). `NpcManager` opens `HoshiUpgradeModal` (large blocking dialog mounted on `document.body`). There is no other entry point. ESC/F2 closes it.

**Layout.** A currency strip (🪨 stones owned, 💰 yen, character level + current enhancement cap), then two columns:
- **Left — gear list.** All inventory items with a non-null `upgrade_category`, excluding the starter Wooden Sword. Sorted equipped-first, then by category, then by upgrade level descending. Each row shows name, **+N**, an `[equipped]` tag, and the category (Weapon / Jewelry / Apparel). Click or ↑/↓ selects.
- **Right — detail.** Selected item name +N, category/slot meta, a warning when the item is not equipped (bonus applies only when worn), then either the cap-reached message or the next-level cost block: stone count and yen (each turning red with an "(insufficient)" suffix when lacking) plus the projected bonus delta. The **Enhance +N → +(N+1)** button is enabled only when both resources suffice; ↓/→ from the list focuses it, Enter clicks it.

**Outcome feedback.** While the request is in flight the status footer shows "Enhancing…" and the button is guarded by `actionInFlight`. On success the footer shows "Enhanced successfully +old → +new!" (values from the server response) and the list/currencies/detail refresh from the backend. On failure (insufficient resources, cap, server error) the footer shows the API error in red; nothing changes client-side. Cost table, level cap, and bonus-delta preview in the modal are display-only mirrors of the backend tables — the authoritative numbers live in `../kageverse-server/docs/business/features/equipment-upgrade.md`.

**Star levels.** Star tier (★1–★5, parsed from the `_starN` template-id suffix) is a separate, immutable display attribute rendered by `equipmentStars.ts` in the bag/equipment screens; the Hoshi flow changes only the +N enchant level, whose badge comes from `equipmentUpgrade.ts`.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Creates `HoshiUpgradeModal`, passes it to `NpcManager`, registers it at `INPUT_LAYER.blockingDialog` in `collectInputTargets`, includes it in `isHtmlModalOpen` / `closeTopModal` |
| `src/game/components/NpcManager.ts` | Maps NPC action `upgrade_equipment` (label `npc.action_upgrade_equipment`, icon ⚒️) to `hoshiUpgradeModal.open()` |
| `src/game/components/modals/HoshiUpgradeModal.ts` | The whole screen: list, detail, cost/bonus preview, confirm flow |
| `src/game/equipmentUpgrade.ts` | +N badge/detail HTML; Wooden Sword exclusion (`canDisplayEquipmentUpgrade`) |
| `src/game/equipmentStars.ts` | Star badge display on item surfaces (read-only here) |

No new `GameComponent` classes or map scenes are needed (feature is already built).

## 4. Backend contract

- REST (`equipmentUpgradeAPI` in `src/network/api.ts`; module doc: `../kageverse-server/docs/api/forge/enhance.md`):
  - `POST /characters/:id/equipment/upgrade` `{ user_item_id }` → `UpgradeEquipmentResponse` (`old_enchant_level`, `new_enchant_level`, `stones_consumed`, `yen_consumed`, `hidden_tier_unlock`, `new_bonus`) — the only mutation this screen performs.
  - `equipmentUpgradeAPI.extract` (`POST .../equipment/extract`) exists in the API layer but is not wired to any UI (Extract deferred post-MVP).
- Supporting reads: `GET /characters/:id/inventory`, `GET /characters/:id/wallet`, `GET /characters` (`inventoryAPI.list`, `charactersAPI.getWallet`, `charactersAPI.list` — `../kageverse-server/docs/api/character/inventory.md`, `characters.md`).
- WS: none consumed by the modal. The Q13 `item_upgraded` quest objective updates via the existing `quest_progress` event (`src/network/protocol/events.ts`, `../kageverse-server/docs/api/realtime.md`).

## 5. UI & input

- Overlay: HTML DOM via `BaseModal` / `createModalShell` (`size: 'lg'`, `layer: 'blockingDialog'`, `mount: 'document-body'`, status footer on).
- Keyboard: registered at `INPUT_LAYER.blockingDialog` (250) — sits above regular modals, below confirm. Two focus zones (`list` / `button`); the modal also calls `disableGlobalCapture()` on open so Phaser does not swallow keys.
- i18n: `hoshi.*` keys (title, currencies, list, detail, cost, success/error) plus `npc.action_upgrade_equipment` in `locales/en.ts` + `locales/vi.ts`.

## 6. Client-side state & prediction

- The FE never decides an upgrade outcome. The local cost table / cap / bonus-delta functions in `HoshiUpgradeModal.ts` are render-time previews mirroring the backend; the applied result always comes from the `upgrade` response, followed by a full `refresh()` re-fetch of inventory, wallet, and character level.
- No new env vars.

## 7. Verification plan

1. `npx tsc -b` + `yarn lint` + `yarn build` green.
2. With backend running, walk to the Hoshi NPC in the village, interact, choose "Enhance equipment" — modal opens; gameplay input is blocked.
3. Select an equipped weapon: cost block and bonus delta render; with insufficient stones/yen the lines turn red and the button is disabled.
4. With enough resources, click Enhance: status shows the +old → +new success message, the row's +N increments, and stone/yen counters drop to the server-returned balances.
5. Verify the Wooden Sword never appears in the list, and an item at the level cap shows the cap message with no button.
6. ESC/F2 closes the modal and restores player movement.

## 8. Acceptance criteria

- AC-1 The modal opens only via the Hoshi NPC `upgrade_equipment` action and blocks all gameplay input while open.
- AC-2 The list shows exactly the inventory items with an `upgrade_category`, excluding the Wooden Sword, sorted equipped-first.
- AC-3 The detail pane shows next-level cost with insufficiency highlighting, and the Enhance button is disabled unless both stones and yen suffice.
- AC-4 Clicking Enhance sends a single `POST /characters/:id/equipment/upgrade`; success feedback displays the server's old/new enchant levels and the screen re-fetches inventory + wallet.
- AC-5 API failure shows the error in the status footer and leaves the displayed item and balances unchanged.
- AC-6 Items at the level cap show the cap message and render no Enhance button.
- AC-7 The screen is fully keyboard-operable: ↑/↓ list selection, ↓/→ to the button, Enter to confirm, ESC/F2 to close.

## 9. Out of scope

- The Extract (refund) path (API stub exists, no UI), enhance charms, hidden-set tier effects beyond displaying server results, upgrade rates/cost values themselves (backend-owned), and star-tier progression (stars are static display data parsed from the template id).
