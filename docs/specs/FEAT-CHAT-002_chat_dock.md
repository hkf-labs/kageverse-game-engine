# Spec: Always-visible chat dock (bottom-center)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-CHAT-002 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-CHAT-002_chat_dock.md` |
| Game-design source | `../kageverse-server/docs/business/` (chat rules unchanged from FEAT-CHAT-001) |
| Created / Updated | 2026-06-11 / 2026-06-11 |

## 1. Summary

The chat button below the minimap is removed. Instead, a chat dock is always visible at the bottom-center of the screen, anchored above the skill hotbar. The player sees recent messages at a glance without opening anything, can type without a modal taking over the screen, and gameplay continues around the dock — movement is blocked only while the text input is focused. This replaces the FEAT-CHAT-001 modal `ChatPanel` presentation; channels, rate limits, and message rules are unchanged.

## 2. Player-facing behavior

The dock sits bottom-center, above the skill hotbar (hotbar occupies the bottom-center edge; the dock anchors ~102px from the bottom). It has three states:

- **Compact (default).** A semi-transparent strip (~96px message area showing the newest ~5 messages of the active tab, text with shadow for readability over the world) plus a 36px input row (`chat.input_placeholder` + `chat.btn_send`). No tabs, no border chrome. WASD / touch controls work normally; clicks outside the strip pass through to the game.
- **Expanded.** Triggered by focusing the input or clicking the message area. A header row with the `Current` / `World` tabs appears, the message area grows to ~220px and becomes scrollable, and the background becomes opaque (modal theme colors). While the input is focused, movement keys do not move the character. Pressing Escape blurs the input; clicking the game world also blurs — both return the dock to compact. Enter sends the message and keeps the input focused.
- **Collapsed.** A small arrow button at the dock's top-right collapses it to just the input row + expand arrow. The collapsed preference persists across reloads (`localStorage` key `kageverse_chat_dock_collapsed`).

Other behavior:

- When a real modal opens (inventory, shop, settings, F1 menu, quest log…), the dock hides with the rest of the map UI and returns in its prior state when the modal closes.
- Messages and the world-history fetch survive map transitions within a session; history is not persisted across page reloads.
- Map-channel chat bubbles above player sprites are unchanged.
- Enter during gameplay keeps its existing meaning (interact / auto-attack); it does not focus the chat.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Remove chat button + chat modal plumbing (input-focus target, escape chain, input-blocking check); wire `ChatDock` into `setMapUIVisible` |
| `src/game/components/ChatDock.ts` | **New** `GameComponent`: persistent dock, state machine compact/expanded/collapsed |
| `src/game/components/modals/ChatPanel.ts` | **Deleted** (logic ported into `ChatDock`) |
| `src/game/components/modals/theme.ts` | Comment update only; dock keeps `MODAL_Z_INDEX.chat` (100, below modals) |

New `GameComponent` class — `ChatDock` public surface: `create()`, `destroy()`, `setVisible(visible)`, `appendMessage(p)`, `applyHistory(p)`, `isFocused()`.

## 4. Backend contract

- REST: none.
- WS events consumed/emitted are unchanged from FEAT-CHAT-001: `chat_send`, `chat_message`, `chat_history_req`, `chat_history` (see `../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts` untouched). World history is requested once per session when the dock is first created (limit 50).
- No backend change required.

## 5. UI & input

- Overlay: native HTML DOM mounted next to the canvas (project rule — no Phaser `DOMElement`). The dock does **not** use `BaseModal`/`createModalShell`; it is not a modal.
- Keyboard: the dock registers **no** input-focus layer (`src/game/components/inputFocus.ts`). Typing protection comes from the input element itself: focus disables Phaser global keyboard capture (+ `resetKeys()` against held-key drift), blur re-enables it, keydown stops propagation. It therefore never steals arrows/softkeys from gameplay or from real modals.
- New i18n keys: `chat.collapse` ("Collapse chat" / "Thu gọn chat"), `chat.expand` ("Expand chat" / "Mở rộng chat"). All existing `chat.*` keys reused.

## 6. Client-side state & prediction

- No gameplay prediction involved. Message buffers (200/tab) and the world-history-fetched flag live at module scope so they survive map-scene recreation; collapsed state lives in `localStorage`.
- New env vars: none.

## 7. Verification plan

`npx tsc -b` + `yarn lint` + `yarn build`, then with the backend running (`../kageverse-server`: `make up && make run`):

1. Log in to the village map → dock visible bottom-center above the hotbar, recent world messages shown, movement works.
2. Focus the input → dock expands with tabs; WASD does not move the character; send a message → it appears and input stays focused.
3. Click the game world → dock returns to compact; movement works immediately, including after holding a movement key while clicking into the input.
4. Escape while typing → input blurs only; Escape again → normal gameplay behavior.
5. Collapse arrow → input-row-only; reload page → still collapsed; expand restores.
6. Open inventory / shop / F1 menu → dock hides; close → dock restored in prior state.
7. Walk through a portal (also while typing) → dock recreated on the new map, history retained, no stuck keyboard capture.
8. Switch Current/World tabs → correct buffers; spam-send → rate-limit error in status line, auto-clears ~3s.
9. Narrow window (~700px wide) → dock shrinks without overlapping the D-pad or attack cluster; switch EN↔VI → all dock strings update.

## 8. Acceptance criteria

- AC-1 The chat button no longer exists; no `btn_chat` asset is loaded. (§7.1)
- AC-2 The dock is visible on every map scene at bottom-center above the skill hotbar, showing the newest messages in compact state. (§7.1)
- AC-3 Movement and gameplay input work fully whenever the chat input is not focused; they are blocked only while it is focused. (§7.2–7.3)
- AC-4 Focusing the input expands the dock (tabs + scrollable history); blur or Escape returns it to compact without destroying it. (§7.2–7.4)
- AC-5 The collapse arrow reduces the dock to the input row and the preference persists across reloads. (§7.5)
- AC-6 The dock hides while any real modal is open and is restored afterwards. (§7.6)
- AC-7 Chat history survives map transitions within a session; world history is fetched once per session. (§7.7)
- AC-8 Sending, tabs, rate-limit/error statuses, and chat bubbles behave as in FEAT-CHAT-001. (§7.8)
- AC-9 The dock does not overlap mobile controls down to ~700px-wide viewports, and all strings are localized (en+vi). (§7.9)

## 9. Out of scope

- A keyboard hotkey to focus chat (`/` or `T`) — Enter is taken by interact/auto-attack; possible follow-up.
- Persisting chat history across page reloads (localStorage/IndexedDB).
- Additional channels (party/guild), emoji, or message formatting.
- User-draggable/resizable dock.
