# Plan: In-game chat (panel, history, player bubbles)

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-CHAT-001 |
| Linked spec | `docs/specs/FEAT-CHAT-001_chat.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

Working two-channel chat (map "Current" + server-wide "World") meeting spec AC-1…AC-7: DOM panel with tabs/send/history, localized server-error feedback, and map-channel speech bubbles above local and remote players — all over the existing WebSocket, with the server owning rate limits and persistence.

## 2. Approach

Reuse the established modal stack instead of building bespoke UI: `ChatPanel` extends `BaseModal` (lazy shell via `createModalShell`, `layer: 'chat'` so it sits below regular modals) and plugs into the existing focus-layer router as an `INPUT_LAYER.modal` target — no raw key handlers. Bubbles are a separate Phaser `GameComponent` (`PlayerChatBubble`) rather than part of the panel, because bubbles must live in world space, follow moving sprites per frame, and survive while the panel is closed. WS routing stays centralized: `BaseMapScene` owns the `chat_message`/`chat_history` subscriptions and fans out to both panel and bubbles, so the bubble target lookup (local player vs `RemotePlayerManager` container) lives next to the presence handlers that own those sprites.

## 3. Steps

1. **Protocol mirror** — `src/network/protocol/events.ts`: add `ChatChannel`, `ChatKind`, `ChatSendPayload`, `ChatHistoryReqPayload`, `ChatMessagePayload`, `ChatHistoryPayload`; extend `ClientEvent`/`ServerEvent` unions with `chat_send`, `chat_history_req`, `chat_message`, `chat_history`; add `CHAT_ERROR_CODES` (160001–160090) mirroring the BE chat domain.
2. **WS client routing** — `src/network/WebSocketClient.ts`: accept the two new server event types in `isKnownServerEventType` so the typed emitter dispatches them; rely on the existing `send()` queue-until-open behavior for outbound events.
3. **ChatPanel component** — `src/game/components/modals/ChatPanel.ts`: `BaseModal` subclass with custom header (tabs replace title via `withTitle: false`), per-tab buffers (`MAX_BUFFER_PER_TAB = 200`), `toggle()` with lazy world-history fetch (`HISTORY_FETCH_LIMIT = 50`), `handleSend()` with 200 ms debounce, `applyHistory()` reverse + id-dedupe merge, direct `error` subscription filtered by `request_event`, `escapeHtml` for all user-supplied text, locale re-render via `shell.registerLocaleSync`. Input focus toggles Phaser `disableGlobalCapture`/`enableGlobalCapture`; panel stops key propagation.
4. **PlayerChatBubble component** — `src/game/components/PlayerChatBubble.ts`: `Map<characterID, BubbleEntry>` of container+graphics+text at `BUBBLE_Y_OFFSET = -110`, `DEFAULT_TTL_MS = 5000`, replace-and-reset-timer on repeat sender, per-frame re-anchor in `update()` with auto-dispose when the target sprite is inactive; `remove()` / `clear()` / `setVisible()` public surface.
5. **Scene wiring** — `src/game/scenes/BaseMapScene.ts`: instantiate both components in `create()`; add the chat button next to the menu button under the minimap (`createChatMenuButtons`, asset `btn_chat`); in `setupRealtimeListeners` route `chat_message` → bubble (map channel only, via `resolveBubbleTarget`) + `chat.appendMessage`, `chat_history` → `chat.applyHistory`, and `player_left` → `playerChatBubble.remove`; include `chat.isOpen()` in `isInputBlockingModalOpen` and register it in `collectInputTargets` at `INPUT_LAYER.modal`; close chat in `closeTopModal`/`toggleMainMenu`; destroy both on scene `shutdown`.
6. **i18n** — add the `chat.*` key block to `src/i18n/locales/en.ts` and `vi.ts` (tabs, placeholder, send, system sender, 8 error strings keyed off `CHAT_ERROR_CODES`).

## 4. Assets & i18n

- Asset: `public/assets/game/buttons/chat.png` (loaded as `btn_chat` in `BaseMapScene.preload`) — provided by the user.
- i18n keys: `chat.tab_current`, `chat.tab_world`, `chat.input_placeholder`, `chat.btn_send`, `chat.system_sender`, `chat.error_*` (8 codes) in `locales/en.ts` + `locales/vi.ts`.
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — chat rate limiting, persistence, and message ids are server-owned; FE debounce is UX-only.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends — chat does not touch movement events.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` in the same PR.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
