# Spec: Inventory & Equipment

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-INV-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-INV-001_inventory_and_equipment.md` |
| Game-design source | `../kageverse-server/docs/business/equipment/equipment-system.md`, `../kageverse-server/docs/business/items/README.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

The player can open a bag (8×N grid, server-driven slot count), inspect any item in a detail sub-modal, use consumables (potions, food buffs, skill books, teleport charm), equip/unequip gear, and drop unbound items. A paper-doll Equipment screen shows the 7 BE-backed slots with aggregated effective stats, and a Character Info screen lists level/EXP/class/school and combat stats. All item data, stats, and action outcomes come from the backend; the client only renders.

## 2. Player-facing behavior

**Entry points.** F1 (or the Menu button under the minimap, touch) opens the Phaser `ActionMenu` → "Self" sub-menu → Info / Inventory / Equipment (`BaseMapScene.openSelfMenu`). F2/ESC closes the top modal and reopens the originating menu.

**Inventory (`InventoryModal`).** Page tabs 1–4 (only page 1 is unlocked; 2–4 render locked 🔒), an 8-column grid, a currencies bar (coin 🪙 / gold 💰 / gem 💎 from the wallet endpoint), and a 3-slot action bar pinned to the bottom of the screen. Equipped items are hidden from the grid (managed via EquipmentModal). Selecting an item shows context actions by fixed slot position:
- **Left** — *Use* (consumables) or *Equip/Unequip* (equipment whose `sub_type` maps to a BE slot).
- **Center** — *View*: toggles a small detail sub-modal (name, star row, +N upgrade level, type, bound badge, stat lines or description, stack count).
- **Right** — *Drop*: only for items that are not bound and not equipped.

Using a teleport charm opens a two-step `ModalItemMenu` picker (category → destination) over a dimmed grid; confirming an unlocked destination consumes the charm and switches scenes. Using a skill book triggers the `onSkillLearned` callback (hotbar auto-assign). Keyboard: arrows move between tabs / grid / action-bar zones with page wrap at row edges; Enter toggles detail or clicks the focused button; F1/Enter/F2 act as J2ME-style soft keys mapped to the left/center/right action-bar slots (`softKeys.ts`).

**Equipment (`EquipmentModal`).** Paper-doll: 5 left slots (hat, cloak, shirt, pants, shoes), 5 right (main_hand, ring + 3 locked post-MVP), 6 locked future slots below, and a gender-based character image in the center above an effective-stats summary (attack, defense, HP, MP, conditional crit/accuracy/power rows). Clicking or arrow-navigating to an occupied slot shows *Unequip* / *View* on the action bar; empty slots show a status hint. Unequip pre-checks free bag space and shows a blocking "Inventory full" alert if none. Slots show item icon, star badge, +N badge, bound 🔒, and a native tooltip.

**Character Info (`CharacterInfoModal`).** Read-only row list (name, gender, level, EXP %, class, school, combat power, HP/MP, attack, defense, conditional bonus rows). Arrow keys or mouse wheel move a ▶ cursor; the hidden-scrollbar body follows it.

**Icons & stars.** `resolveItemIconUrl` maps sprite/template ids to `public/assets/game/items/...` (emoji fallback). Star tier is parsed from the `_starN` template-id suffix (max 5, wooden sword excluded) and rendered as ★ badges/detail rows.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Instantiates the three modals, wires menu entries, HUD/buff/hotbar callbacks, ESC/F2 close order, input-target collection |
| `src/game/components/modals/InventoryModal.ts` | Grid, tabs, action bar, detail sub-modal, use/equip/drop flows, teleport picker |
| `src/game/components/modals/EquipmentModal.ts` | Paper-doll, stats summary, unequip flow, inventory-full alert |
| `src/game/components/modals/CharacterInfoModal.ts` | Character profile rows + cursor scrolling |
| `src/game/components/modals/ModalItemMenu.ts` | DOM item menu used by the teleport charm picker |
| `src/game/itemIcon.ts`, `src/game/itemStats.ts`, `src/game/equipmentStars.ts`, `src/game/equipmentUpgrade.ts` | Icon URL resolution, stat-line formatting, star and +N badge HTML (display only) |

No new `GameComponent` classes or map scenes are needed (feature is already built).

## 4. Backend contract

- REST (`inventoryAPI` / `charactersAPI` in `src/network/api.ts`; docs: `../kageverse-server/docs/api/character/inventory.md`, `../kageverse-server/docs/api/character/characters.md`):
  - `GET /characters/:id/inventory` — grid contents, `max_slots`
  - `POST /characters/:id/inventory/use` — consumables; optional `params` for teleport step 2; returns `effects` + `character_stats`
  - `POST /characters/:id/inventory/equip`, `POST .../unequip`, `GET .../equipped`
  - `POST /characters/:id/inventory/drop` (`.../move` exists in `inventoryAPI` but is not wired to this UI)
  - `GET /characters/:id/wallet` — currencies bar; `GET /characters` — stats/effective_stats refresh
- WS: none consumed directly. Quest objectives affected by use/equip (`quest_progress` in `src/network/protocol/events.ts`, `../kageverse-server/docs/api/realtime.md`) are handled by the quest components.

## 5. UI & input

- Overlays: HTML DOM via `BaseModal` / `createModalShell`; detail sub-modals and the inventory-full alert are sibling overlays at `MODAL_Z_INDEX.tooltip` / `blockingDialog`.
- Keyboard: `INPUT_LAYER.modal` (200) via `createKeyboardModalTarget`; the open teleport picker escalates to `INPUT_LAYER.modalItemMenu` (300) via `createModalItemMenuInputTarget` so ESC/F2 closes the picker before the bag.
- i18n key prefixes (in `locales/en.ts` + `locales/vi.ts`): `inventory.*`, `equipment.*`, `character_info.*`, `menu.*`, `class.*`, `gender.*`.

## 6. Client-side state & prediction

- Nothing is predicted. Item lists, wallet, stats, equip results, and use effects are re-fetched from the server after every mutating action. Combat power in CharacterInfoModal is a display-only aggregate of server `effective_stats`.
- No new env vars.

## 7. Verification plan

1. `npx tsc -b` + `yarn lint` + `yarn build` green.
2. With backend running, in `Village001`: F1 → Self → Inventory; arrow through tabs/grid/action bar; View a potion, Use it (HP/HUD updates), Drop an unbound material.
3. Equip a weapon from the bag; confirm it disappears from the grid and appears in Equipment → main_hand with star/+N badges and updated stats summary; Unequip it back; fill the bag and confirm the "Inventory full" alert blocks unequip.
4. Use a teleport charm; pick category → destination; confirm scene switch and charm consumption.
5. F1 → Self → Info; scroll rows with arrows/wheel.

## 8. Acceptance criteria

- AC-1 Inventory opens from the Self menu, lists non-equipped items on page 1, and pages 2–4 are locked.
- AC-2 Selecting an item shows Use/Equip (left), View (center), Drop (right) only when each action is valid (Drop hidden for bound/equipped items).
- AC-3 Use/equip/unequip/drop each call the corresponding `inventoryAPI` endpoint and re-fetch inventory; HUD stats update from server responses.
- AC-4 The teleport charm opens a category → destination picker; locked destinations show a status message and do not consume the charm.
- AC-5 Equipment shows the 7 BE slots with icon, star, +N and bound badges; unequip with a full bag is blocked by an alert before any API mutation succeeds.
- AC-6 Character Info renders server stats and supports cursor scrolling.
- AC-7 All three modals are fully keyboard-navigable (arrows, Enter, F1/F2 soft keys) and close with ESC/F2, returning to the originating menu.

## 9. Out of scope

- Drag-and-drop slot rearrangement (`inventoryAPI.move` unused), bag pages 2–4, locked equipment slots (scroll/ninjutsu/costume + 6 future), viewing other players' profiles, and the Hoshi upgrade flow (see FEAT-FORGE-001).
