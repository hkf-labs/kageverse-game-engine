# STANDARDS — AI Development Rules

> Required reading for every task. If a rule here conflicts with your instinct, follow the rule and flag the conflict in your summary.

## 1. TypeScript Code Quality

### 1.1 Forbidden Patterns

| Pattern | Rule | Rationale |
|---|---|---|
| `any` | Forbidden. Use shared interfaces; Tiled data uses `TiledMapData` / `TiledLayer` / `TiledObject` (`src/game/components/types.ts`); unknown JSON goes through `asRecord()` (`src/network/api.ts`). | Type safety is the only test suite this repo has. |
| Static Phaser import in React scope | Forbidden. Phaser enters the bundle only via `await import('phaser')` in `GameComponent.tsx`. | Bundle size + main-thread blocking on mount. |
| `import Phaser from 'phaser'` | Forbidden. Always `import * as Phaser from 'phaser'`. | Default export breaks under Rollup. |
| React hooks inside Phaser code | Forbidden. Scenes push data to React via events/callbacks. | Hook rules + per-frame re-renders. |
| Phaser `DOMElement` overlays | Forbidden. HTML DOM via `createModalShell` / `BaseModal` (`src/game/components/modals/`). | Phaser's DOM system conflicts with keyboard capture. |
| Raw key handlers that ignore focus layers | Forbidden. Register through `inputFocus.ts` layer priority; handlers must not fire when a higher layer (modal, confirm, cinematic) is open. | Typing in chat must never move the player. |
| `fetch` outside `src/network/api.ts` | Forbidden. Extend the matching `*API` object (`authAPI`, `charactersAPI`, `inventoryAPI`, …). | One place owns JWT refresh, `X-Trace-Id`, error formatting. |
| Client-side gameplay outcomes | Forbidden. Damage / drops / XP / upgrade results come from the server; client renders. | Server-authoritative game. |
| Unthrottled / idle WS sends | Forbidden. Movement goes through `BaseMapScene.sendMoveIfNeeded` (~30 Hz cap, >1 px delta). | Packet spam. |
| Hardcoded user-facing strings | Forbidden. Every display string is an i18n key in `locales/en.ts` + `locales/vi.ts`, read via `t()` / `tOpt()`. | 11 supported locales. |
| Mutating React state in place | Forbidden. Immutable updates only. | React rendering model. |

### 1.2 Required Patterns

- Every game feature is a class implementing `GameComponent` (`create()`, optional `update()` / `destroy()` / `setVisible()`), exported from `src/game/components/index.ts`.
- Every component cleans up after itself: `destroy()` removes DOM nodes, timers, and WS listeners. Scene `shutdown` must leave no `.kageverse-overlay` elements behind (portal transitions defensively clear them).
- Long-lived listeners (WS events, `onLocaleChange`) are unsubscribed in `destroy()` / `shutdown` — leaking them across scene restarts is the most common FE bug class.
- Fire-and-forget API calls use `void someAPI.call().catch(...)` with a defensive `console.warn` — never let a background call crash a scene.
- New env vars: read in one place, documented in `.env.example` with a comment and a default.

## 2. Scene & Component Conventions

### 2.1 Scene contract (`BaseMapScene`)

- Required overrides: `getMapConfig()`, `getNpcConfigs()`, `getMapDisplayName()`.
- Optional hooks: `preloadMapAssets()`, `getPortalConfigs()` (legacy), `getPortalOverrides()`, `onMapReady()`.
- Scene key discipline: `super('SceneKey')` === entry in `GameConfig.ts` `scene` array === `MAP_REGISTRY` entry (`src/game/maps/registry.ts`). A mismatch fails silently at `scene.start()`.
- Portals: prefer backend `map_links` (built automatically from `GET /maps/:id`); `getPortalConfigs()` is the fallback for maps the backend doesn't serve.
- Scenes orchestrate; they do not own feature logic. If a scene method grows feature behavior, extract a component.

### 2.2 Component contract

- Public API methods only — scenes never touch a component's internal fields.
- Components receive their dependencies via constructor; no global singletons except the documented ones (`wsClient`, i18n, `playerSession`).
- Modal components extend `BaseModal` / use `createModalShell` and register an input layer (`inputFocus.ts`) so ESC/F1/F2/Enter route correctly. Layer priorities (confirm > cinematic > modalItemMenu > blockingDialog > modal > actionMenu) are load-bearing — justify any new layer's position.
- Styling constants live in `modals/theme.ts` — dark mode, glow / glassmorphism (Web3 premium look). Don't inline new color systems.

## 3. Networking Red Lines

- **Server authority:** client predicts movement only; on `snapshot_position` the client rolls back. Never suppress or "smooth over" a server correction.
- **Protocol mirror:** every WS event shape lives in `src/network/protocol/events.ts` and must match `../kageverse-server/docs/api/realtime.md`. A protocol change updates both sides in coordinated PRs — never patch the FE type to match a guess.
- **REST client:** `api.ts` owns JWT storage (`kageverse_jwt` / `kageverse_refresh` in localStorage), auto-refresh on 401 (clears tokens and returns to `AuthScene` when refresh fails), `X-Trace-Id` per request, and `formatApiError()` for user-facing errors. New endpoints extend the existing `*API` objects and reuse all of it.
- **Reconnect behavior:** `WebSocketClient` backs off 1→2→4→8 s indefinitely, except on auth failure / `session_replaced`. Don't change these semantics casually — the game must survive flaky mobile networks.
- **Outbound queue:** messages sent before the socket opens are queued and flushed — rely on it instead of hand-rolling "wait for open" logic.

## 4. UI & i18n Standards

- Dark mode, glow / glassmorphism premium styling (Web3 direction). Reuse `modals/theme.ts`.
- Every user-facing string: key in `src/i18n/locales/en.ts` **and** `vi.ts` (other 9 locales fall back to `en`). Key patterns: `npc.name.<key>`, `map.name.<map_id>`, `portal.label.*`, `quest.*`.
- DOM outside Phaser (e.g. rotate prompt) uses `data-i18n` attributes + `applyDomTranslations`.
- Locale changes propagate via `onLocaleChange` — components showing text must subscribe or be re-created.

## 5. Verification Standards

- No test runner exists. The gate is: `npx tsc -b` (type-check) → `yarn lint` → `yarn build`, then a manual game pass for anything touching gameplay.
- Manual pass = run backend (`../kageverse-server`) + `yarn dev`, then exercise the changed flow (login → village → the affected map/feature).
- `VITE_GAME_DEBUG=true` for coordinate/hitbox debugging; `VITE_COMBAT_TICK_ENABLED=false` to silence monster retaliation while testing.
- Regressions you fix manually deserve at least a defensive type or runtime guard so they can't silently return.

## 6. AI Working Protocol

### 6.1 Reading Protocol

Follow the Required Reading order in `AGENTS.md` before writing code. Grep before reading; read before claiming.

### 6.2 Verification Protocol — "Done" Means

- `npx tsc -b` and `yarn lint` are clean; `yarn build` succeeds.
- For gameplay changes: you state exactly which flow you verified in the running game, or explicitly flag that manual verification is still needed.
- Never claim "fixed" without reproducing the original problem first.

### 6.3 Stop-and-Ask Protocol

Pause for human input in the cases listed in `AGENTS.md` "When to Stop and Ask". Format:

```
[STOP-AND-ASK] <one-line summary>
Context: <what you were doing>
Question: <specific question>
Options: <A, B, C considered>
Recommendation: <recommended option with reasoning>
```

### 6.4 Anti-Hallucination Protocol

- Every claim about existing code cites `file:line`.
- Never invent function / type / event / scene names — grep first.
- When unsure, read the file; do not guess.

## 7. Documentation Standards

### 7.1 Same-PR Sync Rules

- New / changed WS event handling → keep `src/network/protocol/events.ts` aligned with `../kageverse-server/docs/api/realtime.md`.
- New map → `MAP_REGISTRY` entry + i18n `map.name.<map_id>` + assets per `docs/maps/README.md`, all in the same PR.
- New env var → `.env.example` with comment.
- New screen/onboarding flow → page under `docs/screen/`.

### 7.2 ADR Required For

- Any deviation from `ARCHITECTURE.md` (scene/component structure, React ↔ Phaser boundary, network layer).
- New runtime dependency (rendering/physics/state library, external service).
- Replacing a core mechanism (input focus layers, modal shell, move throttle, map registry).

ADRs live in `docs/adr/`, numbered sequentially, per `docs/adr/_TEMPLATE.md`.

### 7.3 Code Comments

- Write only WHY, never WHAT. Well-named code explains WHAT.
- Good: `// scaleY=-1: Spine editor Y-axis is inverted vs Phaser world space.`
- Bad (delete): `// create the player`, `// loop over items`.
