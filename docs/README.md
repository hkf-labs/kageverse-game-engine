# Docs Index

Navigation map for everything under `docs/`. Rule files live at the repo root: `AGENTS.md` (start here), `STANDARDS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`.

> **Authority note.** Game design, REST contracts, the WebSocket protocol, and DB schema are owned by the backend repo — `../kageverse-server/docs/` (`business/`, `api/`, `database/`). The docs here cover only what is frontend-specific.
>
> **Language note.** New docs are English-only (`AGENTS.md` → Repo Policies). Existing Vietnamese pages remain authoritative until rewritten; do not translate them inside unrelated PRs.

## Directory map

| Path | Contents | Authority |
|---|---|---|
| `adr/` | Architecture Decision Records for FE-only decisions (`_TEMPLATE.md` to start one) | Why a structural choice was made |
| `specs/` | Feature specs, one per screen/feature (`_INDEX.md` tracker, `_TEMPLATE.md` to start one) | Behavior authority for the feature |
| `plans/` | Implementation plans, same `FEAT-…` ID as the spec (`_INDEX.md` tracker) | How the feature is built — file map + steps |
| `maps/README.md` | Map asset workflow — Tiled export, `public/assets/maps/<map_id>/` layout, collider conventions | How map assets are produced and wired |
| `maps/village-schools-path-spec.md` | Planning spec for the village ↔ three-schools path maps (MVP phase 1) | Historical planning artifact |
| `screen/auth/` | Login / register screen flows (`login.md`, `register.md`) | FE screen behavior |
| `screen/character/first-map-onboarding-fe.md` | Onboarding flow + mock/api gateway switching (`VITE_ONBOARDING_DATA_SOURCE`) | FE onboarding behavior |

## Where to look instead

| Question | Source |
|---|---|
| What should this gameplay feature do? | `../kageverse-server/docs/business/` |
| What does this endpoint return? | `../kageverse-server/docs/api/<module>/*.md` |
| What WS events exist? | `../kageverse-server/docs/api/realtime.md` + FE mirror `src/network/protocol/events.ts` |
| Which scene renders map X? | `src/game/maps/registry.ts` |
| Scene / component inventory | `ARCHITECTURE.md` |
