# Spec: Character creation & onboarding

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-CHAR-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-CHAR-001_character_creation_onboarding.md` |
| Game-design source | `../kageverse-server/docs/business/character/create-character.md`, `../kageverse-server/docs/business/character/first-map-fog-village-onboarding.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

After first login, a player with zero characters lands on `CharacterCreateScene`: a single-step form (display name, gender, costume primary color) that creates the one allowed MVP character via `POST /characters` and hands off into `VillageScene` with the realtime WS connected. School/class is deliberately *not* chosen here — every character starts as class `none` and picks a class later through the in-game Q10 "Bái Sư" initiation (`src/game/initiation.ts`). A data-source-switchable onboarding gateway (`src/features/onboarding/`) provides the first-map onboarding state contract (mock by default, HTTP behind `VITE_ONBOARDING_DATA_SOURCE=api`). FE integration notes: `docs/screen/character/first-map-onboarding-fe.md`.

## 2. Player-facing behavior

- **Entry points.** Started by `AuthScene.goToGameOrCharacterCreate()` when `GET /characters` returns an empty list (login or fresh registration). Direct entry without a stored `kageverse_jwt` immediately bounces back to `AuthScene`.
- **Layout.** Dark background (`#1a1a2e`), centered HTML form from `public/assets/html/character_create.html`, Phaser status text above it for errors/progress.
- **Form fields and controls** (mouse/touch — tap to select; no keyboard shortcuts on this screen):
  - **Display name** text input — the in-game name other players see, distinct from the login username (help text states this).
  - **Gender** — two cards (`data-gender="male" | "female"`); the selected card gets a blue border + glow. Default: male.
  - **Primary costume color** — two swatches (`data-color="blue" | "red"`); the selected one is full-opacity with a white outline. Default: blue.
  - **Create button** (`#btn-create-character`) submits.
- **Validation.** Display name must be 2–24 alphanumeric characters (`validateDisplayName`, `src/lib/validation.ts`); failures show a localized red message without any request.
- **Submit flow.** "Creating..."-style progress text → `POST /characters` → on success the character is cached locally (`saveCurrentCharacter`), the first-map onboarding flag `kageverse_first_map_onboarding_done` is set to `'false'` (marking the onboarding as pending for this fresh character), the realtime WS is connected (`bootstrapRealtimeForGameEntry` — required so the new player is visible to others), and the scene starts `VillageScene`. Backend errors (duplicate name, character limit) are shown in red.
- **No class choice.** Class selection happens later in-game: initiation principals (`npc_tsukikage` → sword/dart, `npc_tobishima` → kunai/bow, `npc_honoo` → katana/fan) each offer two factions; MVP-open classes are flagged in `FACTIONS_BY_PRINCIPAL` (`src/game/initiation.ts`).
- **Locale.** The form is translated via `data-i18n` + `applyDomTranslations` and re-renders on `onLocaleChange` (locale was set from the login/register response).

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/CharacterCreateScene.ts` | The whole screen: selection state, validation, submit, handoff |
| `src/network/api.ts` | `charactersAPI.create` / `charactersAPI.list` |
| `src/lib/validation.ts` | `validateDisplayName` (2–24 alphanumeric) |
| `src/game/playerSession.ts` | `saveCurrentCharacter` cache consumed by in-game components |
| `src/game/realtimeBootstrap.ts` | WS bootstrap shared with `AuthScene` |
| `src/game/initiation.ts` | Q10 class/faction catalog (consumed by NPC dialog flow, not this scene) |
| `src/features/onboarding/{types,OnboardingGateway,mockOnboardingGateway,httpOnboardingGateway,index}.ts` | Gateway-pattern onboarding state source (mock \| http) |
| `public/assets/html/character_create.html` | Form markup with `data-i18n` attributes |

New `GameComponent` classes needed: none — standalone pre-game scene. No new map scenes.

## 4. Backend contract

- REST:
  - `GET /characters` (caller side, `AuthScene`) and `POST /characters` with `{ display_name, gender, costume_primary_color }` → `{ character, max_characters_per_user }` — `charactersAPI` in `src/network/api.ts`; contract: `../kageverse-server/docs/api/character/characters.md`.
  - `HttpOnboardingGateway` (`src/features/onboarding/httpOnboardingGateway.ts`) targets provisional routes `GET /onboarding/first-map/state`, `POST /onboarding/first-map/{accept-main-quest,simulate-shard-drop,turn-in-main-quest}`. These are an FE placeholder contract (noted in-file); no `../kageverse-server/docs/api/` page exists for them yet — any change must be raised against the backend repo first.
- WS: no events emitted by this scene; on success it opens the WS singleton via `bootstrapRealtimeForGameEntry` so the subsequent map scene can `join_map` (protocol: `../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`).

## 5. UI & input

- Overlay: Phaser `DOMElement` loading `character_create.html` — same accepted pre-game-scene exception as `AuthScene` (in-game overlays still use `createModalShell`).
- Keyboard: no `inputFocus` layer; the scene registers no key handlers (mouse/touch only).
- i18n: `character.create.*` (title, help, labels, gender/color options, progress/failure), `character.bootstrap.checking`, `validation.display_name_*`, `class.*` (for the later initiation choice) in `src/i18n/locales/{en,vi}.ts`.

## 6. Client-side state & prediction

- Nothing predicted: name uniqueness, character limit, starting stats, and starting map all come from the server response. The created `CharacterDTO` (class `none`, `unlocked_maps: ['village_001']`) is only cached for display via `saveCurrentCharacter`.
- Local flags: `kageverse_current_character`, `kageverse_first_map_onboarding_done` (set `'false'` on create; removed by `AuthScene` when a user has no characters).
- Env vars: `VITE_ONBOARDING_DATA_SOURCE` (`mock` default \| `api`) selects the gateway singleton in `src/features/onboarding/index.ts` — documented in `.env.example`.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build` green.
2. Backend up, `yarn dev`; register a fresh account → lands on `CharacterCreateScene`.
3. Submit with empty / 1-char / 25-char / non-alphanumeric display name → localized red error, no request.
4. Tap gender cards and color swatches → selection highlight moves (border/glow, opacity/outline).
5. Submit a valid form → progress text, then `VillageScene`; a second logged-in client on the same map sees the new player (WS connected before scene start).
6. Reload after creation → `AuthScene` restores the session straight into the game (character exists, creation screen skipped).
7. Open the scene with `localStorage` cleared (no JWT) → instant redirect to `AuthScene`.
8. With `VITE_ONBOARDING_DATA_SOURCE=mock` (default) `getOnboardingGateway()` returns the mock S1→S4 state machine; with `=api` it returns the HTTP adapter (verify via the adapter chosen at first call).

## 8. Acceptance criteria

- AC-1 A user with zero characters is shown `CharacterCreateScene` after auth; a user without a JWT is redirected to `AuthScene` (§7.2, §7.7).
- AC-2 Display name is validated client-side to 2–24 alphanumeric characters with localized messages (§7.3).
- AC-3 Gender (male/female) and costume color (blue/red) are selectable with visible selected state and are sent in the create payload (§7.4–5).
- AC-4 Successful creation caches the character, sets `kageverse_first_map_onboarding_done='false'`, connects the realtime WS, and starts `VillageScene` (§7.5).
- AC-5 Backend rejection (duplicate name, limit reached) is shown as a red status message and the player stays on the form.
- AC-6 The onboarding gateway is selected once per session from `VITE_ONBOARDING_DATA_SOURCE`: `mock` (default) serves the local S1–S5 flow, `api` serves the HTTP adapter, and UI code depends only on the `OnboardingGateway` interface (§7.8).
- AC-7 No class/school is chosen at creation; the character starts as class `none` and class options surface later via initiation principals per `src/game/initiation.ts`.

## 9. Out of scope

- The in-map first-quest onboarding UI itself (quest tracking is FEAT-QST-001); the Q10 initiation dialog flow (NPC interaction, FEAT-NPC-001); character deletion / multiple slots (MVP cap is 1, server-enforced); appearance preview rendering; backend onboarding routes (placeholder until the backend publishes a contract).
