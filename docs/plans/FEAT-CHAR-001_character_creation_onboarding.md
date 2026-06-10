# Plan: Character creation & onboarding

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-CHAR-001 |
| Linked spec | `docs/specs/FEAT-CHAR-001_character_creation_onboarding.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

Spec AC-1…AC-7 hold: a guarded single-step creation screen (name + gender + costume color, no class choice) that creates the MVP character server-side, marks first-map onboarding as pending, connects realtime, and enters `VillageScene` — plus an onboarding data layer that can flip between mock and HTTP without touching UI code.

## 2. Approach

Mirror `AuthScene`'s proven shape (Phaser scene + HTML template via `DOMElement`, shared `src/lib/validation.ts`, all HTTP in `src/network/api.ts`) instead of inventing a second form stack — both pre-game screens stay consistent and reuse `bootstrapRealtimeForGameEntry`. Selection state (gender/color) is plain scene fields with style refresh helpers rather than per-element listeners: one delegated click handler using `closest('[data-gender]')` / `closest('[data-color]')`. The first-map onboarding data source follows the repo's gateway pattern (`src/features/`): one interface, mock and HTTP adapters, env-selected singleton — so the backend can land its real routes by editing one adapter. Class selection is intentionally deferred to the in-game Q10 initiation (`src/game/initiation.ts`), keeping creation friction minimal per the MVP design.

## 3. Steps

1. **Form template** — `public/assets/html/character_create.html`: display-name input (`char-display-name`), two gender cards (`data-gender`), two color swatches (`data-color`), `#btn-create-character`, all text via `data-i18n`.
2. **Validation helper** — `validateDisplayName` in `src/lib/validation.ts` (2–24, alphanumeric, localized messages) alongside the auth validators.
3. **REST surface** — `charactersAPI.create(payload)` in `src/network/api.ts` posting `{ display_name, gender, costume_primary_color }` through `authFetch` (JWT + 401-refresh inherited), typed `CharacterDTO` response.
4. **Scene shell** — `src/game/scenes/CharacterCreateScene.ts` (`super('CharacterCreateScene')`): guard `create()` on `localStorage` `kageverse_jwt` (missing → `scene.start('AuthScene')`); load the template, add status text, handle `RESIZE`, unsubscribe locale listener on shutdown/destroy.
5. **Selection state** — `selectedGender` (default `male`) / `selectedColor` (default `blue`) fields; one delegated click handler routes card/swatch/button clicks; `refreshGenderStyles()` / `refreshColorStyles()` paint the selected state (border+glow / opacity+outline).
6. **Submit** — `submit()`: validate → progress status (`character.create.in_progress`) → `charactersAPI.create` → `saveCurrentCharacter` (`src/game/playerSession.ts`) → `localStorage.setItem('kageverse_first_map_onboarding_done', 'false')` → `bootstrapRealtimeForGameEntry(this)` (`src/game/realtimeBootstrap.ts`; WS must be open before the first map so presence broadcast works) → `scene.start('VillageScene')`; errors → red status, stay on form.
7. **Caller integration** — `AuthScene.goToGameOrCharacterCreate()` (`src/game/scenes/AuthScene.ts`) starts this scene when `charactersAPI.list()` is empty, clearing the onboarding-done flag first.
8. **Onboarding contract** — `src/features/onboarding/types.ts` (`FlowState` S1–S5, `MainQuest`, `MapNode`, `Reward`, `OnboardingState`, API envelope) + `OnboardingGateway.ts` interface (`getOnboardingState`, `acceptMainQuest`, `simulateShardDrop`, `turnInMainQuest`).
9. **Adapters** — `mockOnboardingGateway.ts` (in-memory S1→S4 state machine, deep-cloned responses) and `httpOnboardingGateway.ts` (provisional `/onboarding/first-map/*` routes, JWT header, envelope unwrap).
10. **Selection** — `src/features/onboarding/index.ts`: `getOnboardingGateway()` singleton choosing the adapter from `VITE_ONBOARDING_DATA_SOURCE` (`api` → HTTP, anything else → mock); document the var in `.env.example` and the integration notes in `docs/screen/character/first-map-onboarding-fe.md`.
11. **Class deferral** — `src/game/initiation.ts`: `FACTIONS_BY_PRINCIPAL` (2 classes per school principal, MVP flags), `isInitiationPrincipal`, `factionsForPrincipal`, `confirmWarningKeyForClass` — consumed by the NPC dialog flow, kept out of the creation screen.
12. **i18n** — `character.create.*`, `validation.display_name_*`, `class.*` keys in `src/i18n/locales/en.ts` + `vi.ts`; `applyDomTranslations` + `onLocaleChange` re-render.

## 4. Assets & i18n

- Assets: `public/assets/html/character_create.html` (markup/CSS only, in repo); no sprite/art assets required at creation time.
- i18n keys: `character.create.{title,help,display_name_label,display_name_placeholder,gender_label,gender_male,gender_female,color_label,color_blue,color_red,in_progress,failed}`, `validation.display_name_*`, `class.{none,sword,bow,katana,fan,dart,kunai}` — present in both bundles.
- Env vars: `VITE_ONBOARDING_DATA_SOURCE=mock` documented in `.env.example`.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — creation outcome, starting stats, and `unlocked_maps` come from `POST /characters`; the mock gateway is a dev-only data source behind the default env flag, never the wire truth.
- [x] WS `move` stays inside the throttle; no idle sends — this scene sends no movement, it only opens the WS connection.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` — no protocol shape touched by this feature.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1 (`docs/screen/character/first-map-onboarding-fe.md`).
- [x] Spec status `Implemented`; `_INDEX.md` rows updated.
