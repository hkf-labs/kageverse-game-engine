# Spec: <feature name>

> Copy this file to `docs/specs/FEAT-<DOMAIN>-<NNN>_<slug>.md` (domain codes: `_INDEX.md`) and add a row to `_INDEX.md` in the same PR. Keep it short — every section that doesn't apply gets "N/A", not silence. The spec is the behavior authority for FE work: code derives from it, never the reverse. Gameplay rules themselves stay owned by `../kageverse-server/docs/business/` — link them, don't restate them.

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-<DOMAIN>-<NNN> |
| Status | Draft \| Approved \| Implemented \| Shipped |
| Linked plan | `docs/plans/FEAT-<DOMAIN>-<NNN>_<slug>.md` or — |
| Game-design source | `../kageverse-server/docs/business/…` page(s) this derives from |
| Created / Updated | YYYY-MM-DD / YYYY-MM-DD |

## 1. Summary

One paragraph: what the player can do after this ships, and why.

## 2. Player-facing behavior

The screen/feature from the player's point of view: entry points, controls (keyboard + touch), visible states, and what each action does. This section is the heart of the spec.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/<Scene>.ts` | … |
| `src/game/components/<Component>.ts` | … |

New `GameComponent` classes needed (with their public surface): …
New map scenes need a `MAP_REGISTRY` entry and asset folder per `docs/maps/README.md`.

## 4. Backend contract

- REST endpoints consumed (link `../kageverse-server/docs/api/<module>/*.md`); extend the matching `*API` object in `src/network/api.ts`.
- WS events consumed/emitted (link `../kageverse-server/docs/api/realtime.md`); same-PR sync of the FE mirror `src/network/protocol/events.ts`.
- Anything requiring a backend change → stop and raise it against `../kageverse-server` first.

## 5. UI & input

- Overlays: HTML DOM via `BaseModal` / `createModalShell` (never Phaser `DOMElement`).
- Keyboard: which input-focus layer (`src/game/components/inputFocus.ts`), and what it blocks.
- New user-facing strings: i18n keys added to `locales/en.ts` + `locales/vi.ts`.

## 6. Client-side state & prediction

- What the client predicts (movement only) vs. what waits for the server.
- New env vars → `.env.example` with a comment.

## 7. Verification plan

No test runner — list the manual pass: `npx tsc -b` + `yarn lint` + `yarn build`, then concrete in-game steps (which map, which actions, expected result). Note if `VITE_GAME_DEBUG=true` helps.

## 8. Acceptance criteria

Numbered, verifiable statements. Each one maps to at least one step in §7.

- AC-1 …
- AC-2 …

## 9. Out of scope

What this spec deliberately does NOT cover.
