# Plan: Quick menu bar (always-on, left of minimap)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-UI-002 |
| Linked spec | `docs/specs/FEAT-UI-002_quick_menu_bar.md` |
| Status | Done |
| Created / Updated | 2026-06-11 / 2026-06-11 |

## 1. Goal

The nine F1 menu actions become an always-visible, collapsible icon bar left of the minimap (spec AC-1…AC-7); the old `ActionMenu` main/self menus are removed while NPC/shop menus keep working.

## 2. Approach

New self-contained `QuickMenuBar` component rendered in Phaser canvas (like `Minimap` / `SkillHotbar`), anchored off `Minimap.getPosition()` so it cannot drift from the minimap. `BaseMapScene` stays the orchestrator: it builds the item list (closing over its modal instances, exactly as `openMainMenu()`/`openSelfMenu()` do today) and passes it in — the bar knows nothing about modals. Reused pieces: `Minimap.getPosition()` + `RESIZE` re-layout pattern, `GameControls` button press feedback, `isHtmlModalOpen()` guard, `ConfirmDialog` for logout. Removed rather than kept-in-parallel: the main/self `ActionMenu` trees and their `cameFromMenu`/`lastMenuName` back-navigation state — one source of truth for "the function menu".

## 3. Steps

1. **`src/game/components/QuickMenuBar.ts` (new).** `GameComponent` taking `{ scene, minimap, items, storageKey }`; renders icon buttons (emoji icon, rounded bg per `ActionMenu.refresh()` palette), a collapse toggle as the rightmost slot, and a hover tooltip using the item label. Public: `create/destroy/setVisible/setEnabled/toggleCollapsed/isCollapsed`. Layout: right edge = `minimap.getPosition().x - 12`, bottom-aligned with the frame (clears the top-center map-name banner); re-layout on `Phaser.Scale.Events.RESIZE` and unhook on `SHUTDOWN` (copy the pattern from `Minimap.create()`). Collapse state read/written via `localStorage('kageverse_quickmenu_collapsed')`.
2. **Export** from `src/game/components/index.ts`.
3. **Wire in `BaseMapScene.create()`** before `this.minimap.ignoreUIElements()` (line order matters — the minimap camera must ignore the bar's objects). Item list = flattened actions copied verbatim from `openMainMenu()`/`openSelfMenu()`: `characterInfo.open`, `inventory.toggle`, `equipment.toggle`, `skillModal.open`, `questLog.open`, `autoSettingsModal.open`, `settingsModal.open`, `handleSuicide`, logout-`ConfirmDialog`. Guard every action with `isHtmlModalOpen() || isDead || cinematic` (the bar also gets `setEnabled(false)` in those states from the update loop).
4. **Repoint F1 + touch menu button.** `menuKey` handler (both `JustDown` sites in the update loop) and `menuBtn` in the bottom button row call `quickMenuBar.toggleCollapsed()` instead of `toggleMainMenu()`.
5. **Delete the old tree.** Remove `openMainMenu()`, `openSelfMenu()`, `toggleMainMenu()`, the `wrap()` helpers, and the `cameFromMenu` / `lastMenuName` / `lastMenuKey` / `currentMenuName` fields plus their uses in the F2-back flow (`handleBack`, `reopenMenuAfterModalClose`, the auto-reset block in `update()`, and `createActionMenuInputTarget`'s `currentMenuName`/`onBackFromSelf` params — adjust `src/game/components/inputFocus.ts` accordingly). `ActionMenu` itself and its NPC/shop usages stay untouched.
6. **i18n.** Add `menu.bar_collapse` / `menu.bar_expand` to `locales/en.ts` + `locales/vi.ts`; tooltips reuse existing `menu.info|inventory|equipment|skills|quests|suicide|settings|logout` keys (the two settings entries get the existing `Tự Động`/`Ngôn ngữ` strings promoted to i18n keys `menu.auto` / `menu.language` — they are hardcoded today in `openMainMenu()`).
7. **Manual pass** per spec §7 on desktop + touch (DevTools device mode), including portal transition and death/respawn.

## 4. Assets & i18n

- No new image assets (emoji icons, Graphics backgrounds). If the user later provides icon sprites, they slot into the same buttons.
- i18n keys: `menu.bar_collapse`, `menu.bar_expand`, `menu.auto`, `menu.language` (en + vi).
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — UI-only change.
- [x] WS `move` throttle untouched; no idle sends introduced.
- [x] `src/network/protocol/events.ts` untouched (no protocol change).

## 6. Definition of Done

- [x] All spec acceptance criteria (AC-1…AC-7) pass in a manual game pass (browser-driven against the dev backend, 2026-06-11; resize re-anchor relies on the shared `Minimap` layout pattern).
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green (lint: 6 pre-existing errors on `main`, none new).
- [x] Docs synced per `STANDARDS.md` §7.1 (i18n keys in both locales; no other sync triggers).
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
