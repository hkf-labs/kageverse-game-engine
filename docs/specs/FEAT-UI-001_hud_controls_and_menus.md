# Spec: HUD, touch controls & menu system

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-UI-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-UI-001_hud_controls_and_menus.md` |
| Game-design source | `../kageverse-server/docs/business/game-objects/character-stats.md`, `../kageverse-server/docs/business/game-objects/leveling-and-experience.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

Every map scene shows a persistent HUD (HP/MP bars, level, EXP %, class badge), touch controls (virtual D-pad + attack/potion/target buttons), and a J2ME-style soft-key menu system: F1 opens a horizontal action menu (Self / Quests / Suicide / Settings / Logout) whose entries open DOM modals — settings with an 11-locale language switcher, a UI-only auto-play settings panel, a generic two-button confirm dialog, and the end-of-MVP cinematic overlay. All keyboard input while any UI is open routes through a single layer-priority system.

## 2. Player-facing behavior

- **HUD (top-left, always visible):** `topbar` art with HP bar (red) and MP bar (blue) showing `current / max` (values ≥10K abbreviated as K/M), level number, EXP percent with 2 decimals, and a class badge (Novice / Sword / Bow / … colored per element). Populated from `GET /characters` on scene mount, then live-updated by WS `char_stats` and `char_level_up` (which also shows a level-up banner). The HUD stays visible while modals are open.
- **Touch controls:** bottom-left virtual D-pad (◄ ▲ ►) drives movement/jump and highlights when either the on-screen button or the matching arrow key is held; bottom-right attack button (shows the primary skill icon when assigned) plus three satellite buttons — HP potion, MP potion, and ⇄ cycle-target (dimmed/disabled when nothing can be targeted). All of these, plus the skill hotbar and the chat/menu buttons under the minimap, hide while any modal/menu is open; held D-pad state is reset so input never bleeds through.
- **F1 action menu:** F1 (browser default captured) or the menu button under the minimap toggles a Phaser canvas row of cards near the bottom: Self 🥷, Quests 📜, Suicide ☠️, Settings ⚙️, Logout 🚪. ←/→ (or hover) select, Enter/click confirm, ESC/F2 close. *Self* opens a sub-menu: Info 📋, Inventory 🎒, Equipment ⚔️, Skills ⚡. *Settings* opens a sub-menu: Auto 🤖, Language 🌐. *Logout* opens a ConfirmDialog (amber). The menu never opens on top of an HTML modal.
- **Soft keys & back navigation:** F1 = left soft key, Enter = center, F2 = back/right. F2 from a modal opened via the menu closes it and reopens the originating menu with the previously selected item restored; F2 in the Self sub-menu returns to the main menu; in a ConfirmDialog F1 clicks Cancel and F2 clicks Confirm.
- **Gameplay keys (no UI open):** ←/→ move, ▲ jump, Enter interact (double-tap within 1.5 s toggles auto-attack), J opens the quest log, ESC dismisses the current world target.
- **SettingsModal (Language):** 2-column grid of 11 locales with native names and a "100%" (en/vi) or "EN fallback" badge; arrows move focus, Enter selects; the change applies instantly to open UI and persists in `localStorage` (`kageverse_locale`); a status line confirms the save.
- **AutoSettingsModal:** UI-only toggles + sliders — auto-HP/MP potion thresholds, auto-pickup (all / yen / HP-MP / quest items); "pickup all" disables the sub-toggles. A footer notes the feature is still in development; no setting is applied or persisted yet.
- **ConfirmDialog:** title + message + Cancel/Confirm buttons (confirm color red/green/amber per call); focus defaults to Cancel; no ✕ button — the player must choose explicitly.
- **EndMvpOverlay:** full-screen cinematic (radial-gradient backdrop, 1.2 s fade) triggered when the Q17 boss quest is turned in (`detectEndMvpClass`: `mq_first_trial_sword`/`_bow`); shows a class-specific subtitle, the arc-1 story text, and a single "Pause Here" button (Enter/click/ESC closes).

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Owns all wiring: key registration (Enter/ESC/J, F1/F2 with capture), `collectInputTargets`/`routeBlockedInput`, `openMainMenu`/`openSelfMenu`, `toggleMainMenu`, `handleBack`/`closeTopModal`, `setMapUIVisible`, HUD updates from REST + WS |
| `src/game/components/HUD.ts` | Phaser HUD — `setStats`, `setHP`, `setExpPercent`, `setClass`, `setStatus` |
| `src/game/components/GameControls.ts` | D-pad + attack/satellite buttons — `getVirtualInputs`, `resetVirtualInputs`, `setVisible`, `updateVisuals`, `updateSwitchTarget`, `setPrimaryAttackSkill` |
| `src/game/components/ActionMenu.ts` | Phaser horizontal menu — `open({title, items, initialSelectedKey})`, `navigate('left'\|'right')`, `confirm`, `close`, `isOpen` |
| `src/game/components/inputFocus.ts` | `INPUT_LAYER` priorities + `pickTopInputTarget` + target factories |
| `src/game/components/modals/SettingsModal.ts`, `AutoSettingsModal.ts`, `ConfirmDialog.ts`, `EndMvpOverlay.ts` | `BaseModal` subclasses (DOM overlays) |
| `src/game/components/modals/BaseModal.ts`, `createModalShell.ts`, `softKeys.ts`, `theme.ts` | Shared shell pattern, soft-key types, z-index/colors |

No new `GameComponent` classes needed — feature is complete.

## 4. Backend contract

- REST: `GET /characters` via `charactersAPI.list()` in `src/network/api.ts` seeds HUD vitals/EXP/class on scene mount (`BaseMapScene.loadInitialCharacterState`). Contract: `../kageverse-server/docs/api/character/characters.md`.
- WS consumed: `char_stats` (HP/MP/EXP updates with `reason`), `char_level_up` (level + new maxima + banner). Contract: `../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`.
- Suicide/logout/potion actions invoked from these menus call their own endpoints (out of scope here); no backend change required.

## 5. UI & input

- Overlays: all four modals are HTML DOM via `BaseModal`/`createModalShell` (never Phaser `DOMElement`). Shell z-index layers (`theme.ts`): chat 100 < modal 110 < blockingDialog 200 (Settings/Auto) < cinematic 250 (EndMvp) < confirm 300. The ActionMenu is Phaser canvas (depth 199–202) and therefore never opens while an HTML modal is up.
- Keyboard: focus layers (`inputFocus.ts`): actionMenu 100 < modal 200 < blockingDialog 250 < modalItemMenu 300 < cinematic 350 < confirm 400. Only the highest open layer receives ←→↑↓ / Enter / F1 / F2 / ESC (`BaseMapScene.routeBlockedInput`); movement is zeroed and virtual inputs reset while blocked.
- i18n: `menu.*`, `settings.*`, `confirm.*`, `endmvp.*`, `class.*` keys in `locales/en.ts` + `vi.ts`. Known gap: `AutoSettingsModal` labels and the Settings sub-menu item labels ("Tự Động", "Ngôn ngữ") are hardcoded Vietnamese strings, not i18n keys.

## 6. Client-side state & prediction

- UI-only state: menu origin flags (`cameFromMenu`, `lastMenuKey/Name`) for F2 back-navigation; cached `lastKnownLevel`/`lastKnownStats`/`lastKnownExp` so partial WS payloads can re-render the HUD. All stat values come from the server; nothing is predicted. AutoSettingsModal state is in-memory only (resets per scene).
- Locale persists in `localStorage` key `kageverse_locale`. No new env vars.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build` — all green.
2. Backend running, `yarn dev`, enter the village map: HUD shows HP/MP/level/EXP/class from `GET /characters`; use a potion / kill a monster → bars and EXP % update from `char_stats`; level up → banner + level change.
3. Drag through the D-pad and arrow keys → buttons highlight; open any modal → bottom controls, hotbar, and chat/menu buttons hide; HUD/minimap stay.
4. F1 → menu opens; ←/→ + Enter navigate; Self → Inventory, then F2 → inventory closes and the Self menu reopens on "Inventory"; F2 again → main menu; F2/ESC → closed.
5. Settings → Language: arrow to another locale, Enter → UI text changes immediately, status confirms; reload → locale sticks.
6. Settings → Auto: toggles/sliders work; "pickup all" disables sub-rows; nothing persists after reopening.
7. Logout → amber ConfirmDialog; F1 cancels, F2 confirms (returns to AuthScene). Turn in the Q17 boss quest → EndMvpOverlay fades in; Enter closes it.

## 8. Acceptance criteria

- AC-1 HUD renders HP/MP (abbreviated ≥10K), level, EXP % (2 decimals), and class badge; updates live on `char_stats` and `char_level_up`. (§7.2)
- AC-2 Virtual D-pad and arrow keys both move the character and share button highlighting; held touch input is cleared when a modal opens. (§7.3)
- AC-3 While any modal/menu is open, movement stops, bottom map UI hides, and all function keys reach only the highest-priority open UI. (§7.3–4)
- AC-4 F1 toggles the main menu (never over an HTML modal); Self and Settings sub-menus open their respective modals; F2 back-navigation reopens the originating menu with selection restored. (§7.4)
- AC-5 Language selection applies instantly to open UI, persists across reloads, and shows a saved confirmation. (§7.5)
- AC-6 AutoSettingsModal is interactable but applies no gameplay logic and persists nothing. (§7.6)
- AC-7 ConfirmDialog defaults focus to Cancel, supports F1=Cancel / Enter=focused / F2=Confirm / ESC=Cancel, and has no ✕ button. (§7.7)
- AC-8 EndMvpOverlay appears on Q17 turn-in with a class-specific subtitle and closes via its button, Enter, or ESC. (§7.7)

## 9. Out of scope

- Chat panel and bubbles (FEAT-CHAT-001); inventory/equipment/shop/skill/quest modal internals; death menu; skill hotbar behavior.
- Audio / key-rebinding / accessibility settings (Settings shows a "coming soon" placeholder).
- Actually applying auto-potion/auto-pickup logic (explicitly deferred post-MVP).
