# Plan: HUD, touch controls & menu system

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-UI-001 |
| Linked spec | `docs/specs/FEAT-UI-001_hud_controls_and_menus.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

The in-game shell described by spec AC-1…AC-8: a live server-fed HUD, dual keyboard/touch movement controls, an F1 soft-key menu tree opening DOM modals (language settings, auto-play placeholder, confirm dialog, end-MVP cinematic), with every key press routed through one layer-priority system and zero gameplay outcomes computed on the client.

## 2. Approach

Two render domains, one input router. World-anchored / always-on UI (HUD, D-pad, action menu) is Phaser canvas with `scrollFactor(0)`; anything overlay-shaped is HTML DOM built on the shared `BaseModal` + `createModalShell` pattern (lazy build on open, teardown on close, locale re-render via `registerLocaleSync`, viewport `zoom` fit) — Phaser `DOMElement` is banned because it fights keyboard capture. Keyboard unification follows the J2ME soft-key model: `BaseMapScene` registers F1/F2 with `capture=true` plus Enter/ESC/J, and every open UI exposes an `InputFocusTarget`; `pickTopInputTarget` picks the single highest layer so modals stack predictably (action menu < modal < blockingDialog < cinematic < confirm). The HUD is fed once from REST (`charactersAPI.list()`) and then exclusively by WS pushes, caching level/EXP locally only to fill partial `char_stats` payloads.

## 3. Steps

1. **Shell pattern** — `src/game/components/modals/createModalShell.ts`: overlay + panel + header/✕ + status footer, size/layer presets from `theme.ts` (`MODAL_SIZES`, `MODAL_Z_INDEX`), `canvas-parent` vs `document-body` mounts, `modal` vs `cinematic` panel styles, responsive CSS `zoom`, locale-sync registry. `BaseModal.ts`: abstract lifecycle (`ensureShell`/`teardownShell`, `isOpen`) with `buildShellOptions()` + `populateShell()` hooks. `softKeys.ts`: `SoftKeySlot` ('left'|'center'|'right') + `KeyboardModalHandler` contract.
2. **Input focus layer** — `src/game/components/inputFocus.ts`: `INPUT_LAYER` constants (actionMenu 100 … confirm 400), `InputFocusTarget` interface (`navigate`/`confirm`/`softKey`/`cancel`), `pickTopInputTarget`, and factories `createKeyboardModalTarget` / `createActionMenuInputTarget` / `createModalItemMenuInputTarget`.
3. **HUD** — `src/game/components/HUD.ts`: `topbar` image + frame/fill graphics for HP/MP, level + EXP texts, class badge (`class.*` i18n labels, per-element palette), `formatBig` K/M abbreviation; all at scrollFactor 0, depth 100–102. Public: `setStats`, `setHP`, `setExpPercent`, `setClass`, `setStatus`.
4. **Touch controls** — `src/game/components/GameControls.ts`: three D-pad circles writing `virtualInputs` on pointer down/up/out, attack button (`btn_attack`) with async primary-skill icon (`ensureSkillIconTexture`), HP/MP/⇄ satellite circles at fixed angles, resize-aware `layout()`. `updateVisuals(cursors)` merges keyboard + touch for highlighting; `setVisible(false)` also calls `resetVirtualInputs()`.
5. **Action menu** — `src/game/components/ActionMenu.ts`: Phaser card row (depths 199–202) with invisible full-screen click-out overlay, hover-select + click-confirm, wrap-around `navigate`, disabled-item skip, `initialSelectedKey` restore, close-before-action in `confirm()`.
6. **Modals** — `src/game/components/modals/SettingsModal.ts` (2-col locale grid over `SUPPORTED_LOCALES`, `setLocale` + `localStorage` persistence via `src/i18n`, focus ring nav, `blockingDialog` layer); `AutoSettingsModal.ts` (UI-only toggle/slider builders, in-memory `DEFAULTS`); `ConfirmDialog.ts` (`open(params)` rebuilds shell each call, focus defaults Cancel, `triggerSoftKey` F1=cancel/F2=confirm, `confirm` layer, `withCloseButton: false`); `EndMvpOverlay.ts` (`cinematic` panel + layer, 1.2 s opacity fade, `show(className)` subtitle, `detectEndMvpClass` helper for Q17 quest ids).
7. **Scene orchestration** — `src/game/scenes/BaseMapScene.ts`: register keys (Enter/ESC/J plain; F1/F2 `addKey(…, true)`); build menu trees in `openMainMenu`/`openSelfMenu` with the `wrap()` helper recording `cameFromMenu`/`lastMenuName`/`lastMenuKey` for F2 reopen (`reopenMenuAfterModalClose`, `handleBack`); `toggleMainMenu` guarded by `isHtmlModalOpen`; per-frame `update()` gates gameplay input behind `isInputBlockingModalOpen` → `routeBlockedInput` → top target; `setMapUIVisible` hides controls/hotbar/chat+menu buttons (HUD, minimap, tracker stay); chat/menu buttons under the minimap in `createChatMenuButtons`.
8. **Data feed** — `BaseMapScene.loadInitialCharacterState` seeds HUD from `charactersAPI.list()` (`src/network/api.ts`); `setupRealtimeListeners` subscribes `char_stats` / `char_level_up` to update HUD + caches and trigger the level-up banner; NPC `onCharacterUpdated` callback refreshes the class badge after Bái Sư.
9. **i18n** — `menu.*`, `settings.*`, `confirm.*`, `endmvp.*`, `class.*` blocks in `src/i18n/locales/en.ts` + `vi.ts`.

## 4. Assets & i18n

- Assets (user-provided): `topbar`, `btn_attack`, `btn_chat`, `btn_menu` under `public/assets/game/` (loaded in `BaseMapScene.preload`); skill icons fetched lazily per skill id.
- i18n keys: `menu.*` (incl. logout confirm strings), `settings.*`, `confirm.btn_confirm/btn_cancel`, `endmvp.*`, `class.*` in `locales/en.ts` + `locales/vi.ts`.
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — HUD only renders REST/WS values; auto-settings apply no logic.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends — movement is zeroed while UI blocks input.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` (`char_stats`, `char_level_up` shapes).

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [ ] Docs synced per `STANDARDS.md` §7.1 — known gap: `AutoSettingsModal` and the Settings sub-menu labels are hardcoded Vietnamese, pending i18n migration.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
