# Plan: Always-visible chat dock (bottom-center)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-CHAT-002 |
| Linked spec | `docs/specs/FEAT-CHAT-002_chat_dock.md` |
| Status | Done |
| Created / Updated | 2026-06-11 / 2026-06-11 |

## 1. Goal

Remove the chat toggle button and the modal `ChatPanel`; ship a persistent `ChatDock` at bottom-center (above the skill hotbar) with compact / expanded / collapsed states, where gameplay input is blocked only while the text input is focused (spec AC-1…AC-9).

## 2. Approach

Create `src/game/components/ChatDock.ts` implementing the `GameComponent` interface directly — **not** extending `BaseModal`, whose lazy-build-on-open / teardown-on-close / `isOpen()`-blocks-input contract is exactly what is being removed. Port the proven logic from `ChatPanel`: per-tab buffers with `appendMessage`/`applyHistory` id-dedupe, tab switching, send debounce, error-status mapping (`chatErrorMessage`), `escapeHtml`, and locale sync (subscribe `onLocaleChange` directly). Delete `ChatPanel.ts`.

The dock deliberately registers **no** `inputFocus` target and is removed from every modal pathway in `BaseMapScene` — it must never steal keys from gameplay or from real modals. Typing protection reuses ChatPanel's existing mechanics: the input's keydown stops propagation, focus calls `disableGlobalCapture()` (+ `resetKeys()` against held-key drift), blur calls `enableGlobalCapture()`.

Constraints discovered up front:

- The bottom-center screen edge is occupied by the `SkillHotbar` (264px bar centered at `(width/2, height-70)`); the dock anchors at `bottom: 102px` (8px above the hotbar's top edge at `height-94`). `Phaser.Scale.RESIZE` means canvas px == CSS px, so DOM and Phaser UI coordinates align 1:1.
- Enter is already interact / double-Enter auto-attack in `BaseMapScene.update()`, so there is no Enter-to-focus-chat hotkey (spec §9).
- Mobile clearance: D-pad cluster extends to x ≤ 172, attack cluster to x ≥ width-172; the dock width is clamped accordingly.

## 3. Steps

1. **i18n** — add `chat.collapse` ("Collapse chat" / "Thu gọn chat") and `chat.expand` ("Expand chat" / "Mở rộng chat") to `src/i18n/locales/en.ts` + `vi.ts` (chat block ~line 127).
2. **Create `src/game/components/ChatDock.ts`:**
   - Module-level state so history survives map transitions: `buffers: Record<Tab, ChatMessagePayload[]>` (200/tab), `worldHistoryFetched`, collapsed-flag mirror of `localStorage` key `kageverse_chat_dock_collapsed`.
   - DOM built eagerly in `create()`, mounted to the canvas parent; root classes `kageverse-overlay kageverse-chat-dock` so the defensive overlay purge in `BaseMapScene.create()` still covers stray docks; `z-index: MODAL_Z_INDEX.chat` (100, below modals at 110).
   - Layout: root `position:absolute; left:50%; bottom:102px; transform:translateX(-50%); width:min(440px, calc(100vw - 344px)); min-width:240px; pointer-events:none; display:flex; flex-direction:column`. Children (header/tabs, messages, status, input row) get `pointer-events:auto`; everything outside passes through to the canvas. Plain responsive CSS — no modal `zoom`.
   - State machine `'collapsed' | 'compact' | 'expanded'`:
     - compact: 96px message box, `rgba(0,0,0,0.28)` background, `text-shadow: 0 1px 2px #000`, `overflow:hidden`, newest messages bottom-aligned; 36px input row.
     - expanded (input focus or messages click): tabs header (port active-tab styling from ChatPanel using `MODAL_COLORS`), 220px `overflow-y:auto` messages, opaque `rgba(26,18,8,0.92)` + border.
     - collapsed: input row + expand arrow only; arrow button (`▾`/`▴`) at top-right with `title`/`aria-label` from the new i18n keys.
   - Collapse-to-compact on blur via `setTimeout(0)` + `root.contains(document.activeElement)` check; `mousedown.preventDefault()` on Send/tabs so clicking them does not blur-collapse before the click lands.
   - Input keydown: `stopPropagation()`; Enter → send; Escape → blur (never destroys the dock). Focus: `disableGlobalCapture()` + `resetKeys()`. Blur: `enableGlobalCapture()`.
   - `setVisible(visible)`: blur input if focused, then show/hide root. `destroy()`: unsubscribe WS error + locale listeners, **re-enable global capture** (guards the portal-while-typing leak), remove DOM.
   - Send `chat_history_req` (world, limit 50) once per session on creation, guarded by the module flag, so the compact strip is populated at login.
3. **Delete `src/game/components/modals/ChatPanel.ts`**; update exports in `src/game/components/modals/index.ts` and `src/game/components/index.ts` (export `ChatDock`).
4. **Rewire `src/game/scenes/BaseMapScene.ts`:**
   - Retype the `chat` field to `ChatDock`; keep construction/`create()` (~534), `destroy()` (~685), and the `chat_message` / `chat_history` WS listeners (~785–801 — `appendMessage`/`applyHistory` API unchanged).
   - Remove: `chatBtn` field (~102), `btn_chat` preload (~263), the chat button in `createChatMenuButtons()` (~2047–2050, re-center the remaining menu button), `chatBtn.setVisible` (~892), `chat.isOpen()` from `isInputBlockingModalOpen()` (~1108, fix the stale comment above it), the chat target in `collectInputTargets()` (~1189–1195), chat cases in `toggleMainMenu()` (~2055) and the `handleBack` escape chain (~2198).
   - Add `this.chat?.setVisible?.(visible)` to `setMapUIVisible()` (~892) so the dock hides under real modals.
5. **`src/game/components/modals/theme.ts`** — keep `MODAL_Z_INDEX.chat: 100`; update the layering comment (ChatPanel → ChatDock).
6. **Sweep** — `grep -rn "ChatPanel\|btn_chat" src/` for stragglers.
7. **Verify** — `npx tsc -b`, `yarn lint`, `yarn build`, then the manual pass in spec §7.

## 4. Assets & i18n

- Assets: none new. `public/assets/game/buttons/chat.png` becomes unreferenced (file may stay on disk; deleting is optional cleanup).
- i18n: `chat.collapse`, `chat.expand` (en + vi). All existing `chat.*` keys reused.
- Env vars: none.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side (chat only).
- [x] WS `move` untouched; the dock never sends positional data.
- [x] No protocol change — `src/network/protocol/events.ts` untouched.

## 6. Definition of Done

- [x] Spec acceptance criteria verified in a live game pass (Playwright vs the dev server, 2026-06-11): AC-1…AC-7 fully; AC-8 send/tabs/bubble verified, rate-limit status not triggered; AC-9 narrow-viewport clearance verified, EN↔VI runtime switch pending a manual check.
- [x] `npx tsc -b` + `yarn build` green (`yarn lint` has 6 pre-existing errors on `main`, untouched files).
- [x] Docs synced per `STANDARDS.md` §7.1.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
