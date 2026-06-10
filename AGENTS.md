# AI Development Context

This is the first file every AI task must read. Open this, follow the reading order, then start work.

> **Source of truth.** This file (`AGENTS.md`) is canonical. `CLAUDE.md` is a symlink to it — Claude Code, Cursor, Aider, Codex, and every other agent harness see identical content. Edit `AGENTS.md` only; do not break the symlink.

---

## 5-Minute Primer

You are working on the **frontend** of **Kageverse** — a 2D Web3 MMORPG (Play-to-Own). The stack is React 19 + TypeScript + Vite as a thin outer shell around **Phaser 4** (Arcade Physics), which owns the entire gameplay loop. The backend is a Go server in the sibling repo `../kageverse-server/` (REST + WebSocket) — its `AGENTS.md` and `docs/` are the authority for API contracts and game design.

**Current MVP scope:** 2 of 3 academy schools open (Mikazuki = Fire / Sword, Hayabusa = Ice / Bow), level cap 20, 1 character per user. The world is ~20 map scenes: village hub, three school maps, and portal-linked farm/combat paths between them.

Four rules that override everything else:

1. **React ↔ Phaser boundary is sacred.** Phaser is dynamic-imported (`await import('phaser')`) only inside `src/components/GameComponent.tsx`. Never static-import Phaser at module scope in React code. Inside game code use `import * as Phaser from 'phaser'` (never the default export — Rollup breaks). Never call React state hooks from a Phaser scene; push data out via events/callbacks.
2. **Scenes compose, components encapsulate.** Every map scene extends `BaseMapScene`; every feature is a self-contained class implementing the `GameComponent` interface (`src/game/components/types.ts`). Scenes orchestrate lifecycle and the update loop — they never reach into a component's internals; components expose public methods.
3. **The server is authoritative.** Drop rates, XP, damage, upgrade outcomes come from the backend; the client only predicts movement for smoothness and rolls back on `snapshot_position`. Outbound `move` is throttled (~30 Hz cap + >1 px delta — `BaseMapScene.sendMoveIfNeeded`). Never compute gameplay outcomes client-side.
4. **Overlays are native HTML DOM, input goes through focus layers.** Modals/chat use `BaseModal` / `createModalShell` — never Phaser `DOMElement` (it conflicts with keyboard capture). All keyboard handling routes through the layer-priority system in `src/game/components/inputFocus.ts`; never add a raw key handler that fires while a modal is open.

---

## Required Reading (Every Task)

Read in order — each item has a non-bypassable reason.

| # | File / path | Why you read it |
|---|---|---|
| 1 | `AGENTS.md` (this file) | Primer + rules + verify gate |
| 2 | `STANDARDS.md` | Code rules + AI working protocol |
| 3 | `CONTRIBUTING.md` | Workflow, checklists (new map / component / WS event) |
| 4 | `ARCHITECTURE.md` | Scene/component/network inventory + invariants |
| 5 | `docs/specs/<feature>.md` *(if the task has a spec)* | FE behavior authority for the feature |
| 6 | For gameplay behavior: the matching page under `../kageverse-server/docs/business/` | Game-design authority lives in the backend repo |
| 7 | For every endpoint touched: `../kageverse-server/docs/api/<module>/*.md` | REST contract authority |
| 8 | For every WS event touched: `../kageverse-server/docs/api/realtime.md` + `src/network/protocol/events.ts` | Protocol authority + its FE mirror |
| 9 | For map work: `docs/maps/README.md` | Map asset workflow (Tiled → colliders.json) |
| 10 | Relevant existing code | `grep` first, then read — never guess |

---

## Authority Map

| Concern | Authoritative source | Override rule |
|---|---|---|
| Game design / gameplay behavior | `../kageverse-server/docs/business/` | Product decision required to deviate |
| FE feature behavior (new features) | `docs/specs/<feature>.md` | Code derives from spec, never the reverse |
| FE architecture decisions | `docs/adr/` + `ARCHITECTURE.md` | New ADR required to deviate |
| REST API contract | `../kageverse-server/docs/api/` | FE adapts to BE, never the reverse |
| WebSocket protocol | `../kageverse-server/docs/api/realtime.md`; FE mirror: `src/network/protocol/events.ts` | Update the mirror in the same PR as any protocol change |
| Map ↔ scene mapping | `src/game/maps/registry.ts` (`MAP_REGISTRY`) | Every map scene must have an entry; keys must match `super('SceneKey')` |
| Portal links between maps | Backend `GET /maps/:id` `links` (wire truth); FE fallback: `getPortalConfigs()` | Prefer backend links; legacy configs only for maps the BE doesn't know |
| Map asset workflow | `docs/maps/README.md` | New maps follow it exactly |
| Screen / onboarding flows | `docs/screen/` | — |
| User-facing strings | `src/i18n/locales/{en,vi}.ts` | No hardcoded display strings in scenes/components |
| Environment config | `.env.example` | Every new env var lands here with a comment |

---

## Repo Layout

```
src/
├── components/GameComponent.tsx  # ONLY React ↔ Phaser bridge (dynamic import)
├── game/
│   ├── GameConfig.ts             # Phaser.Game config + scene registration list
│   ├── scenes/                   # BaseMapScene (abstract) + ~22 concrete scenes
│   ├── components/               # GameComponent classes (HUD, managers, controls…)
│   │   ├── modals/               # HTML DOM overlays (BaseModal, ChatPanel, Inventory…)
│   │   └── inputFocus.ts         # Keyboard layer-priority routing
│   ├── maps/registry.ts          # MAP_REGISTRY: map_id ↔ scene key
│   └── *.ts                      # Gameplay helpers (spawn, itemIcon, playerSession…)
├── network/                      # api.ts (REST), WebSocketClient, protocol/events.ts
├── features/                     # Gateway pattern: onboarding (mock|http), maps, npcs
├── i18n/                         # t()/tOpt(), 11 locales, en+vi bundles
└── lib/                          # Framework-free helpers (validation)
public/assets/maps/<map_id>/      # bg.png + colliders.json + npcs/ per map
```

Details and full inventories: `ARCHITECTURE.md`.

---

## Forbidden Without Human Approval

- Static `import Phaser` (or `import('phaser')` outside `GameComponent.tsx`) in React module scope.
- `import Phaser from 'phaser'` (default export) anywhere — use `import * as Phaser`.
- React state hooks inside Phaser scenes or `update()` loops.
- `any` — use the shared Tiled types (`TiledMapData`, `TiledLayer`, `TiledObject`) and `asRecord()` from `api.ts` for unknown JSON.
- Phaser `DOMElement` for overlays — HTML DOM via `createModalShell` only.
- Sending WS coordinates while the character is idle, or bypassing the move throttle.
- Computing combat / loot / XP / upgrade results client-side.
- `fetch` calls outside `src/network/api.ts` — extend the matching `*API` object instead.
- Registering a scene whose key doesn't match its `MAP_REGISTRY` entry and `super('SceneKey')`.
- Hardcoded user-facing strings — add i18n keys to `locales/en.ts` + `locales/vi.ts`.
- Changing product knobs or protocol shapes that belong to the backend (raise it against `../kageverse-server` instead).

---

## Repo Policies

- **English-only for new artifacts.** New docs, code comments, commit messages — English. Existing Vietnamese pages (`docs/`, legacy comments) remain authoritative until rewritten; do not translate them opportunistically inside an unrelated PR.
- **No surprise commits.** Only commit when the user explicitly asks; never bypass hooks.
- **Branch naming.** `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `chore/<scope>`. PRs target `main`.
- **Commit style.** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`). Body explains *why*.
- **One concern per PR.** Unrelated discoveries become a note to the user or a separate PR.

---

## When to Stop and Ask

1. **Design / UX ambiguity** — do not invent gameplay or UI behavior; surface the question with options + recommendation.
2. **Contract mismatch** — FE expectation differs from `../kageverse-server/docs/api/`; never "fix" it by guessing on the FE side.
3. **Scope exceeds the request** — split or confirm first.
4. **Anything requiring a backend change** (new endpoint, new WS event, payload change).
5. **Asset decisions** (new sprites, map art, Spine rigs) — assets come from the user.

---

## Verification

There is no test runner — verification is type-check + lint + build, then running the game manually.

| Command | What it does |
|---|---|
| `npx tsc -b` | Type-check without bundling — fastest signal |
| `yarn lint` | ESLint over the project |
| `yarn build` | `tsc -b && vite build`. **Mandatory before claiming done.** |
| `yarn dev` | Vite dev server (default `http://localhost:5173`) |
| `yarn preview` | Preview the production build |

- Yarn Berry (`nodeLinker: node-modules`); `npm run <script>` also works, but the lockfile is `yarn.lock` — install with `yarn install`.
- Manual gameplay checks need the backend running (`../kageverse-server`: `make up && make run`) and a `.env` (copy `.env.example`).
- `VITE_GAME_DEBUG=true` shows the world grid, coordinate HUD, and physics hitboxes.
- There is no CI in this repo yet — a green local `yarn build` is the gate.

---

## Quick Cheatsheet

| Need | Command / path |
|---|---|
| Scene & component inventory | `ARCHITECTURE.md` |
| Feature specs / plans | `docs/specs/_INDEX.md` / `docs/plans/_INDEX.md` |
| Add a new map | `CONTRIBUTING.md` §3 + `docs/maps/README.md` |
| Game-design answer | `../kageverse-server/docs/business/` |
| REST endpoint contract | `../kageverse-server/docs/api/<module>/*.md` |
| WS events (FE mirror) | `src/network/protocol/events.ts` |
| map_id ↔ scene key | `src/game/maps/registry.ts` |
| i18n strings | `src/i18n/locales/{en,vi}.ts` |
| Env vars | `.env.example` |
| Docs index | `docs/README.md` |
| Diff vs main | `git diff main..HEAD` |
