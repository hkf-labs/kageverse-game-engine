# Plan: Inventory & Equipment

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-INV-001 |
| Linked spec | `docs/specs/FEAT-INV-001_inventory_and_equipment.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

Ship the bag, paper-doll, and character-info screens exactly as specified: server-driven item grid with use/equip/drop context actions and a detail sub-modal (AC-1…AC-4), a 7-slot equipment view with unequip + inventory-full guard (AC-5), a read-only stats profile (AC-6), and full keyboard/soft-key navigation across all three (AC-7).

## 2. Approach

Three independent `BaseModal` subclasses sharing one shell (`createModalShell`) and one theme, orchestrated by `BaseMapScene` — no React, no Phaser `DOMElement`. The action bar lives outside the panel (absolute at screen bottom, viewport-zoom shared with the shell) so it never competes with modal content; the J2ME soft-key triple (F1/Enter/F2 → left/center/right) is reused from `softKeys.ts`. Item sub-menus (teleport charm) use `ModalItemMenu` mounted on the modal overlay instead of the canvas `ActionMenu`, because the canvas always sits below HTML overlays. Display helpers (`itemIcon.ts`, `itemStats.ts`, `equipmentStars.ts`, `equipmentUpgrade.ts`) are framework-free modules shared by every surface that renders an item. All mutations go through `inventoryAPI` in `src/network/api.ts`, then re-fetch — no optimistic state.

## 3. Steps

1. Extend `src/network/api.ts` `inventoryAPI` with `list`, `use` (optional `UseItemParams`), `drop`, `move`, `equip`, `unequip`, `listEquipped`, plus `charactersAPI.getWallet`; define `InventoryItemDTO`, `EquippedItemDTO`, `UseInventoryEffects` (food buff / skill learned / teleport menu / teleport completed).
2. Build display helpers: `src/game/itemIcon.ts` (`resolveItemIconUrl`, `inventorySlotIconHtml`), `src/game/itemStats.ts` (`buildEquipmentStatLines` — rolled bonuses vs. base min–max ranges, weapon-unrolled hidden), `src/game/equipmentStars.ts` (parse `_starN`, badge/detail/tooltip HTML), `src/game/equipmentUpgrade.ts` (+N badge/detail, wooden-sword exclusion).
3. Implement `src/game/components/modals/InventoryModal.ts`: shell options (`size: 'md'`, `layer: 'modal'`), tabs + grid + currencies + bottom action bar, `mapBeItem` filtering out equipped items, three-zone keyboard nav, `collectActions` (use/equip/view/drop), detail sub-modal at tooltip z-index, and the `handleUse` / `handleEquipToggle` / `handleDrop` flows with `actionInFlight` guarding.
4. Add the teleport charm flow inside InventoryModal: `inventoryAPI.use` step 1 returns `teleport_charm_menu`; render category → destination pickers via `src/game/components/modals/ModalItemMenu.ts` with a grid blocker; step 2 sends `params: { type: 'teleport_hub_map', map_id }` and fires `onTeleportToMap`.
5. Implement `src/game/components/modals/EquipmentModal.ts`: LEFT/RIGHT/BOTTOM slot defs (locked flags + `beSlotId`), `refresh()` joining `listEquipped` + `charactersAPI.list`, `paintCell` with icon/star/+N/bound badges, effective-stats summary, unequip with inventory-full pre-check and blocking alert.
6. Implement `src/game/components/modals/CharacterInfoModal.ts`: row list from `CharacterDTO.effective_stats`, ▶ cursor with wheel/arrow movement and scroll-into-view.
7. Wire everything in `src/game/scenes/BaseMapScene.ts`: construct modals in `create()`, expose them via the Self menu (`openSelfMenu`), register input targets in `collectInputTargets` (inventory supplies its own target so the teleport picker can claim layer 300), add them to `isHtmlModalOpen` / `closeTopModal`, and connect callbacks to HUD, `BuffIndicator`, `SkillHotbar`, and `EquipmentModal.refresh`.
8. Add i18n bundles for `inventory.*`, `equipment.*`, `character_info.*` to `src/i18n/locales/en.ts` + `vi.ts`; register locale-sync re-render in each `populateShell`.

## 4. Assets & i18n

- Item icons under `public/assets/game/items/` (weapons/, skill_books/, upgrade_stone.png, teleport_charm.png, material_*.png) and character placeholders `public/assets/game/characters/ninja-full-body-{male,female}.png` — provided by the user.
- i18n keys: `inventory.*` (31), `equipment.*` (39), `character_info.*` (21) in both `en.ts` and `vi.ts`.
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — item effects, equip results, and stats come from `inventoryAPI` / `charactersAPI` responses.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); modals block movement input entirely while open.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` — feature adds no WS events.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated (rows generated with this docs batch).
