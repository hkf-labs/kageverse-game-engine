# Plan: Equipment Upgrade (Hoshi)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-FORGE-001 |
| Linked spec | `docs/specs/FEAT-FORGE-001_equipment_upgrade.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

Ship the Hoshi enhancement screen: NPC-gated entry (AC-1), a filtered/sorted gear list (AC-2), cost preview with affordability gating (AC-3), a single server-authoritative upgrade call with success/failure feedback and post-action re-fetch (AC-4, AC-5), cap handling (AC-6), and full keyboard operation (AC-7).

## 2. Approach

One `BaseModal` subclass reusing `createModalShell` with the `blockingDialog` layer and `document-body` mount, so the screen sits above any map-level modal and survives scene UI layout. Entry is delegated through the existing NPC action pipeline (`NpcManager` action switch) instead of a new hotkey — the backend decides which NPCs offer `upgrade_equipment`. The FE mirrors the backend cost/cap/bonus tables purely for preview rendering; the alternative (a cost-preview endpoint) was unnecessary for MVP since the server re-validates everything on `POST .../equipment/upgrade` and the modal re-fetches after each action. Extract is deliberately stubbed at the API layer only.

## 3. Steps

1. Add `equipmentUpgradeAPI` to `src/network/api.ts`: `upgrade(characterId, userItemId)` → `UpgradeEquipmentResponse` and `extract(...)` → `ExtractEquipmentResponse` (extract left unwired), plus the `EnchantStatBonus` type.
2. Create display helpers in `src/game/equipmentUpgrade.ts`: `canDisplayEquipmentUpgrade` (Wooden Sword excluded via `WOODEN_SWORD_TEMPLATE_ID` from `src/game/itemIcon.ts`), `buildEquipmentUpgradeBadgeHtml` (+N grid badge), `buildEquipmentUpgradeDetailHtml` (+N detail row) — shared with InventoryModal/EquipmentModal.
3. Implement `src/game/components/modals/HoshiUpgradeModal.ts`:
   - Shell: `size 'lg'`, `layer 'blockingDialog'`, `mount 'document-body'`, status footer, locale-sync re-render.
   - `refresh()`: parallel `inventoryAPI.list` + `charactersAPI.getWallet` + `charactersAPI.list`; derive upgradeable items (`upgrade_category !== null`, not Wooden Sword), stone count (`material_upgrade_stone_lv1` sum), yen (`wallet.gold`), character level.
   - `renderList()`: equipped-first / category / level-desc sort cached in `sortedItems` for keyboard nav.
   - `renderDetail()`: cap check (`capForLevel`), cost lookup (`COST_TABLE` mirror of BE `equipmentupgrade/domain/upgrade.go`), bonus delta preview (`bonusForLevel` mirror of BE `ComputeEnchantBonus`, zero when unequipped), and the `#hoshi-upgrade-confirm` button only when affordable.
   - `handleUpgrade()`: `actionInFlight` guard → `equipmentUpgradeAPI.upgrade` → success status with `old_enchant_level`/`new_enchant_level` → `onUpgraded` callback → `refresh()`; errors go to the status footer.
   - Keyboard: `navigate()` over `list`/`button` zones, `confirm()` clicking the focused control, `disableGlobalCapture()` on open / re-enable on close.
4. Wire the NPC entry in `src/game/components/NpcManager.ts`: action key `upgrade_equipment` → label `npc.action_upgrade_equipment` + ⚒️ icon → `hoshiUpgradeModal.open()`, with a status-message fallback when the modal dependency is absent.
5. Integrate in `src/game/scenes/BaseMapScene.ts`: instantiate before `NpcManager` and inject via its deps; add to `collectInputTargets` with `createKeyboardModalTarget(INPUT_LAYER.blockingDialog, ...)`, to `isHtmlModalOpen`, and first-priority in `closeTopModal` so ESC/F2 closes it before lower modals.
6. Add the `hoshi.*` i18n bundle (31 keys: title, currencies, list, detail, cost, success/error) to `src/i18n/locales/en.ts` + `vi.ts`.

## 4. Assets & i18n

- No new art: the screen is text/DOM only; the Upgrade Stone icon (`public/assets/game/items/upgrade_stone.png`) already exists for bag display.
- i18n keys: `hoshi.*` plus `npc.action_upgrade_equipment` in `en.ts` + `vi.ts`.
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — the enchant outcome, consumed resources, and new bonus come exclusively from the `POST .../equipment/upgrade` response; local tables are render-only previews.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); the blocking dialog suppresses movement input entirely.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` — feature adds no WS events (Q13 progress rides the existing `quest_progress`).

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated (rows generated with this docs batch).
