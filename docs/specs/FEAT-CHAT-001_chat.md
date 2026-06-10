# Spec: In-game chat (panel, history, player bubbles)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-CHAT-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-CHAT-001_chat.md` |
| Game-design source | `../kageverse-server/docs/business/game-objects/chat-module.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

Players can chat with everyone on the same map ("Current" tab, `map` channel) or with the whole server ("World" tab, `world` channel) through a DOM chat panel, see world history on first open, and see map-channel messages rendered as speech bubbles above the sender's character (local and remote). The server is the authority for rate limiting and persistence; the FE only buffers, renders, and gives quick feedback.

## 2. Player-facing behavior

- **Entry point:** the chat button (`btn_chat` icon) under the minimap — touch/click only; there is no keyboard hotkey to open chat. Opening chat closes the F1 action menu if it was open.
- **Panel:** a 700×360 px DOM overlay (`ChatPanel`) with a lighter backdrop (`rgba(0,0,0,0.35)`) so the map stays visible. Header shows two tabs — Current / World — plus a ✕ close button. Body shows the message list, an error status strip, and an input row (text input, max 256 chars, + Send button).
- **Sending:** type and press Enter or click Send. The active tab decides the channel (`current` → `map`, `world` → `world`). A 200 ms FE debounce prevents double sends; real rate limiting is server-side. The input clears and keeps focus after send. No local echo — the server echoes the sender's own message back.
- **Keyboard while open:** Enter in the input sends; Escape closes the panel. While the panel is open but the input is *not* focused, ←/→ switch tabs (Current/World) and Enter re-focuses the input (`navigate`/`confirm` via the focus-layer router). ESC or F2 closes the panel (`closeTopModal` / target `cancel`). Character movement is fully blocked while the panel is open (`isInputBlockingModalOpen`).
- **History:** first open lazily sends `chat_history_req` for `world` with limit 50; the reply is reversed to oldest→newest, deduped by server message id, and merged into the World buffer. Each tab keeps at most 200 messages (oldest dropped).
- **Message rendering:** `[DisplayName Lv<level>]` sender tag (own messages green `#9affb4`, others amber, `kind=system` cyan with the `chat.system_sender` tag), HTML-escaped to prevent XSS. List auto-scrolls to bottom.
- **Errors:** WS `error` events with `request_event` of `chat_send`/`chat_history_req` show a localized status line (rate-limited, text too long, etc.) that auto-clears after 3 s.
- **Chat bubbles:** `map`-channel messages also show a speech bubble (`PlayerChatBubble`) anchored 110 px above the sender's body container, word-wrapped at 240 px, with a 5 s TTL. A new message from the same character replaces the bubble and resets the timer. World messages never produce bubbles. Bubbles are removed on `player_left`, on scene shutdown, and when the target sprite is destroyed.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Creates `ChatPanel` + `PlayerChatBubble`; chat button under minimap (`createChatMenuButtons`); WS listeners route `chat_message` → bubble + panel, `chat_history` → panel; `resolveBubbleTarget` maps sender id → local/remote container; registers chat as a `modal`-layer input target; destroys both on shutdown |
| `src/game/components/modals/ChatPanel.ts` | `BaseModal` subclass — tabs, buffers, send/history/error handling. Public: `toggle()`, `isOpen()`, `isFocused()`, `appendMessage(p)`, `applyHistory(p)`, `navigate()`, `confirm()` |
| `src/game/components/PlayerChatBubble.ts` | Multi-instance bubble manager keyed by characterID. Public: `show(id, target, text, ttl?)`, `remove(id)`, `clear()`, `setVisible(v)`, `update()` |
| `src/network/protocol/events.ts` | Chat payload types, `ChatChannel`, `CHAT_ERROR_CODES` (FE mirror) |
| `src/network/WebSocketClient.ts` | `chat_message` / `chat_history` accepted in `isKnownServerEventType`; `send()` queues until socket open |

No new `GameComponent` classes needed — feature is complete.

## 4. Backend contract

- REST: none — chat is WebSocket-only.
- WS emitted: `chat_send` (`{channel, text}`), `chat_history_req` (`{channel, limit}`). WS consumed: `chat_message`, `chat_history`, `error` (chat error codes 160001–160090). Contract: `../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`.
- `guild` / `party` / `whisper` channels exist in the protocol types but are not wired in the UI (server rejects them in MVP).

## 5. UI & input

- Overlay: HTML DOM via `BaseModal` / `createModalShell` (`layer: 'chat'`, z-index 100; custom header with tabs via `withTitle: false`).
- Keyboard: registered with `createKeyboardModalTarget(INPUT_LAYER.modal, …)` in `BaseMapScene.collectInputTargets` — blocks gameplay movement keys; input focus disables Phaser global keyboard capture and key events stop propagation at the panel.
- i18n: `chat.*` keys in `src/i18n/locales/en.ts` + `vi.ts` (tabs, placeholder, send button, system sender, 8 error messages).

## 6. Client-side state & prediction

- Pure client-side UI state only: per-tab message buffers (cap 200), `worldHistoryFetched` flag, 200 ms send debounce. No gameplay outcome is computed client-side; rate limiting and persistence are server-authoritative.
- No new env vars.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build` — all green.
2. Backend up (`../kageverse-server`: `make up && make run`), `yarn dev`, log in to the village map.
3. Click the chat button under the minimap → panel opens, World tab loads history on first open.
4. Send on Current tab → message appears in panel and a bubble shows above your character for ~5 s; a second client on the same map sees both.
5. Send on World tab → panel only, no bubble.
6. Spam Enter → server rate-limit error appears in the status strip, auto-clears after 3 s.
7. ←/→ with input unfocused switch tabs; Escape/F2 closes; arrows do not move the character while open.

## 8. Acceptance criteria

- AC-1 Chat opens/closes only via the minimap chat button, ✕, Escape, or F2; movement is blocked while open. (§7.3, §7.7)
- AC-2 Current tab sends on `map` channel; World tab sends on `world`; Enter or Send button submits and clears the input. (§7.4–5)
- AC-3 World history is fetched once per scene (limit 50), rendered oldest→newest, deduped by id, buffers capped at 200/tab. (§7.3)
- AC-4 `map`-channel messages show a bubble above the sender (local + remote) with 5 s TTL, replaced on a newer message; world messages do not. (§7.4–5)
- AC-5 Chat-scoped server errors render a localized status line that clears after 3 s; unrelated errors are ignored. (§7.6)
- AC-6 Sender names and text are HTML-escaped; system messages use the `chat.system_sender` style. (§7.4)
- AC-7 Bubbles are cleaned up on `player_left` and scene shutdown.

## 9. Out of scope

- Guild / party / whisper channels (protocol types exist; UI and server broadcast not wired).
- History pagination beyond the initial fetch (`before_id` supported by protocol, unused).
- Chat moderation/profanity filtering (server concern), and a keyboard hotkey to open the panel.
