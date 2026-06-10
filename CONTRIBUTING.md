# CONTRIBUTING — Development Workflow

> Required reading for every task. Together with `STANDARDS.md`, this defines how work flows through this repo.

## 0. Before You Start

1. Read `AGENTS.md` (canonical; `CLAUDE.md` symlinks to it), then `STANDARDS.md`, then this file.
2. For gameplay work, read the matching page in `../kageverse-server/docs/business/`; for endpoint work, the contract in `../kageverse-server/docs/api/`.
3. Environment: `yarn install`, copy `.env.example` → `.env`. For live gameplay, run the backend: `cd ../kageverse-server && make up && make run`.
4. Pull latest `main`.

## 1. Feature Workflow (lightweight)

```
Design (BE docs/business or docs/screen) ──→ Implement ──→ Verify (tsc + lint + build + manual) ──→ Docs sync ──→ PR
```

1. **Design.** Gameplay behavior is defined in the backend repo (`docs/business/`); FE-specific flows (screens, onboarding) live in `docs/screen/`. Non-trivial FE features get a spec in `docs/specs/` plus a plan in `docs/plans/` (templates: `_TEMPLATE.md` in each; track both in `_INDEX.md`); FE architecture-level changes need an ADR first (`docs/adr/_TEMPLATE.md`). If no source covers your task, stop and ask — don't invent game design.
2. **Implement.** Follow the boundary/scene/component rules (`STANDARDS.md` §1–2). New code is English-commented, i18n-keyed, typed (no `any`).
3. **Verify.** `npx tsc -b` → `yarn lint` → `yarn build`, then a manual pass of the affected flow in the running game (`yarn dev` + backend). There is no CI — local green is the gate.
4. **Docs sync.** Same-PR rules in `STANDARDS.md` §7.1.

## 2. Adding a New Map

Full asset workflow: `docs/maps/README.md`. Checklist:

1. Assets in `public/assets/maps/<map_id>/`: `bg.png`, `colliders.json` (Tiled export), `npcs/` sprites if any.
2. Create `src/game/scenes/<Name>Scene.ts` extending `BaseMapScene`; implement `getMapConfig()` (mapId, asset paths, `tiledOriginalHeight`, `safeZone`), `getNpcConfigs()`, `getMapDisplayName()`.
3. Optional hooks as needed: `preloadMapAssets()`, `getPortalOverrides()`, `onMapReady()`. Portals come from backend `map_links` automatically; `getPortalConfigs()` only as legacy fallback.
4. Register the class in `GameConfig.ts` `scene` array — key must match `super('SceneKey')`.
5. Add the `MAP_REGISTRY` entry (`src/game/maps/registry.ts`) and the `map.name.<map_id>` i18n key (`en.ts` + `vi.ts`).
6. If the map is new to the backend, confirm it exists there first (`../kageverse-server` migrations / `GET /maps/:id`) — FE-only maps break spawn & monster loading.

## 3. Adding a New Component / Modal

1. Class in `src/game/components/` implementing `GameComponent`; export from `index.ts`.
2. Modals extend `BaseModal` / use `createModalShell`, style via `theme.ts`, and register an `inputFocus` layer.
3. Wire it in `BaseMapScene` (shared) or the specific scene (local). Clean up everything in `destroy()`.
4. All strings via i18n keys.

## 4. Touching the WS Protocol

1. The contract lives in `../kageverse-server/docs/api/realtime.md` — backend leads, FE follows.
2. Mirror the type in `src/network/protocol/events.ts`; handle the event via the dispatcher; unsubscribe on scene shutdown.
3. Never add client→server events the backend hasn't committed to.

## 5. Branching, Commits, PRs

- Branches: `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `chore/<scope>`. Target `main`.
- Conventional Commits; body explains *why*. English only.
- One concern per PR. PR description states what changed, why, which flow was manually verified, and which docs were synced.
- Commit only when the user explicitly asks; never bypass hooks.
