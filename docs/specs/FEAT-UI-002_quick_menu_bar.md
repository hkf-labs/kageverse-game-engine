# Spec: Quick menu bar (always-on, left of minimap)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-UI-002 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-UI-002_quick_menu_bar.md` |
| Game-design source | — (FE UX change only; no gameplay rules touched) |
| Created / Updated | 2026-06-11 / 2026-06-11 |

## 1. Summary

The function-menu items currently hidden behind F1 (`ActionMenu` main/self/settings menus) move onto the screen as an always-visible horizontal icon bar anchored to the left of the minimap. A collapse button shrinks the bar to a single icon so it never blocks the view. One tap/click reaches any feature (inventory, quests, skills…) instead of F1 → navigate → Enter.

## 2. Player-facing behavior

- **Placement:** a horizontal row of icon buttons, right edge ~12 px left of the minimap frame, bottom-aligned with the frame — keeps clear of the top-center map-name banner on narrow screens (`Minimap.getPosition()` is the anchor). Re-anchors on window resize.
- **Items (flattened from the current F1 tree, left → right):**
  `📋 info · 🎒 inventory · ⚔️ equipment · ⚡ skills · 📜 quests · 🤖 auto · 🌐 language · ☠️ suicide · 🚪 logout`
  Each button triggers exactly the action the matching `ActionMenu` item triggers today (logout still goes through `ConfirmDialog`; suicide keeps its current no-confirm behavior).
- **Collapse/expand:** the rightmost slot is a toggle (`«` when expanded, `☰` when collapsed). Collapsed, only that single button remains. State persists in `localStorage` across sessions and maps.
- **Hover/press feedback:** desktop hover shows the localized label (existing `menu.*` keys) as a small tooltip above the button (below would collide with the minimap's chat/menu buttons); press gives a scale-down feedback like `GameControls` buttons.
- **Blocked states:** clicks are ignored while an HTML modal is open (same guard as F1 today — `isHtmlModalOpen()`), while the player is dead, and during cinematics. The bar stays visible but non-interactive (dimmed) in those states.
- **Keyboard / touch parity:** `F1` and the touch `btn_menu` button now toggle collapse/expand of the bar instead of opening the old Phaser menu. Existing shortcut `J` (quest log) is unchanged.
- **Removed:** the F1 `ActionMenu` *main* and *self* menus disappear (their items live on the bar). The `ActionMenu` component itself stays — NPC dialogs and shop-slot menus still use it.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/components/QuickMenuBar.ts` | **New** `GameComponent` — buttons, tooltip, collapse toggle, layout/resize, enable/disable |
| `src/game/scenes/BaseMapScene.ts` | Construct/wire the bar; route item actions; repoint F1 + `btn_menu` to bar toggle; delete `openMainMenu()` / `openSelfMenu()` and the `main`/`self` branches of the F2-back flow |
| `src/game/components/Minimap.ts` | None (bar reads `getPosition()`); bar must exist before `ignoreUIElements()` runs |
| `src/game/components/ActionMenu.ts` | None — remains for NPC/shop menus |
| `src/game/components/GameControls.ts` | None (the `btn_menu` handler lives in `BaseMapScene`) |

New `GameComponent` public surface: `create()`, `destroy()`, `setVisible(v)`, `setEnabled(v)`, `toggleCollapsed()`, `isCollapsed()`.

## 4. Backend contract

- N/A — no REST or WS change. Item actions reuse existing modal flows and their existing endpoints.

## 5. UI & input

- The bar is a persistent HUD element → Phaser canvas objects (`scrollFactor 0`, depth ~200, like `Minimap`/`SkillHotbar`), **not** a DOM overlay — it must render under the HTML modals and be ignorable by the minimap camera.
- No new `inputFocus` layer: the bar never captures keyboard. F1/`btn_menu` toggle stays in the existing gameplay-level key handling of `BaseMapScene`, still gated by death/modal/cinematic checks.
- F2-back simplification: modals opened from the bar no longer set `cameFromMenu`; F2 in such a modal just closes it (no menu to reopen). NPC-opened flows keep their existing back behavior.
- i18n: reuse `menu.*` labels for tooltips; new keys `menu.bar_collapse`, `menu.bar_expand`, `menu.auto`, `menu.language` in `locales/en.ts` + `locales/vi.ts` (the last two were hardcoded VN strings in the old settings submenu).

## 6. Client-side state & prediction

- Collapse state in `localStorage` (`kageverse_quickmenu_collapsed`, `'1'`/absent). No server state, no prediction, no new env vars.

## 7. Verification plan

1. `npx tsc -b` → `yarn lint` → `yarn build` green.
2. `yarn dev` + backend: on Village, the bar renders left of the minimap; every button opens the same modal/flow as the old F1 path (info, inventory, equipment, skills, quest log, auto settings, language, suicide, logout-confirm).
3. Collapse → only `☰` remains; reload page → still collapsed; expand → full row returns.
4. F1 and the touch menu button toggle collapse; while inventory (or any HTML modal) is open, bar clicks and F1 do nothing.
5. Die → bar dims and ignores clicks; respawn → re-enabled.
6. Walk through a portal → next map shows the bar in the same state; no duplicated/leaked objects (scene shutdown clean).
7. Resize the window → bar stays glued left of the minimap. Minimap camera does not render the bar (check minimap view).
8. NPC dialog (e.g. Merchant) still opens the old `ActionMenu` row at the bottom — unaffected.

## 8. Acceptance criteria

- AC-1 All nine former F1 items are reachable with one click/tap from the bar, with identical behavior to the old menu path.
- AC-2 The bar anchors left of the minimap and follows it on resize.
- AC-3 Collapse hides everything but a single toggle button; the state survives reload and map transitions.
- AC-4 F1 / touch `btn_menu` toggle collapse; the old main/self Phaser menus no longer open.
- AC-5 Bar input is inert while an HTML modal is open, while dead, and during cinematics.
- AC-6 NPC and shop-slot `ActionMenu` flows are unchanged.
- AC-7 The minimap camera ignores all bar objects.

## 9. Out of scope

- Reordering/customizing bar items, badges (e.g. unread quest dot), drag-to-move.
- Changing suicide to require confirmation.
- The bottom-center chat button and the `ActionMenu` component used by NPC/shop menus.
