# Plan: <feature name>

> Copy this file to `docs/plans/FEAT-<DOMAIN>-<NNN>_<slug>.md` — same Feature ID as the spec it implements — and add a row to `_INDEX.md`. The plan is *how*; the spec is *what*. If executing the plan reveals the spec is wrong, fix the spec first.

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-<DOMAIN>-<NNN> |
| Linked spec | `docs/specs/FEAT-<DOMAIN>-<NNN>_<slug>.md` |
| Status | Draft \| Approved \| Done |
| Created / Updated | YYYY-MM-DD / YYYY-MM-DD |

## 1. Goal

One paragraph: the end state, in terms of the spec's acceptance criteria.

## 2. Approach

The implementation strategy and why it was chosen over the alternative(s). Note which existing pieces are reused (`BaseMapScene` hooks, `createModalShell`, gateway pattern) vs. built new.

## 3. Steps

Ordered, each independently verifiable. Reference exact paths.

1. …
2. …

## 4. Assets & i18n

- New assets under `public/assets/…` (who provides them — assets come from the user).
- i18n keys to add (`locales/en.ts` + `locales/vi.ts`).
- New env vars → `.env.example`.

## 5. Server-authority checklist *(if gameplay outcomes are involved)*

- [ ] No combat / loot / XP / upgrade results computed client-side.
- [ ] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends.
- [ ] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` in the same PR.

## 6. Definition of Done

- [ ] All spec acceptance criteria pass in a manual game pass.
- [ ] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [ ] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
