# Spec: Login / register screen

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-AUTH-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-AUTH-001_login_register_screen.md` |
| Game-design source | `../kageverse-server/docs/business/auth/login.md`, `../kageverse-server/docs/business/auth/register.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

`AuthScene` is the game's entry screen: a login/register form rendered over the Phaser canvas. It authenticates against the backend, persists JWT access/refresh tokens in `localStorage`, applies the server-assigned UI locale, silently restores an existing session on reload, and routes the player either to `CharacterCreateScene` (no character yet) or directly into the last-played map scene. FE screen docs: `docs/screen/auth/login.md`, `docs/screen/auth/register.md`.

## 2. Player-facing behavior

- **Entry point.** First scene after the React shell boots Phaser (`src/components/GameComponent.tsx` → `src/game/GameConfig.ts`). Dark background (`#1a1a2e`), centered HTML form loaded from `public/assets/html/auth_form.html`, plus a Phaser status text floating above it for feedback messages.
- **Session restore.** If `localStorage` already holds `kageverse_jwt`, the form is never shown; status shows "Restoring session..." and the scene jumps straight to character bootstrap (§ below). If the token is rejected, tokens are cleared and "Session expired, please sign in again." is shown.
- **Login view** (default): `identifier` input (username *or* email), `password` input, "ENTER GAME" button, and a "New apprentice? Register." link that toggles to the register view.
- **Register view**: username, email, password inputs, a country `<select>` (loaded lazily from the backend on first toggle; falls back to a single `VN — vi (offline)` option if the request fails), "REGISTER" button, and a link back to login.
- **Controls.** Mouse/touch: tapping the buttons and toggle links (single Phaser DOMElement click listener dispatching on `target.id`). Keyboard: pressing **Enter** inside any input submits the currently visible view (native `keydown` listener on the form node with `preventDefault`).
- **Client validation** (before any request, error shown in red status text): missing fields; login identifier — email regex if it contains `@`, otherwise username rules (3–20 alphanumeric); register username — same rules; missing country.
- **Progress / errors.** "Signing in..." / "Registering..." in gray while in flight; backend error message (includes `trace_id`) in red on failure.
- **On success.** Tokens persisted; `preferred_language` + `country_code` from the response applied via `saveUserPrefs` (locale switches immediately; form re-translates through `onLocaleChange`). Then character bootstrap: `GET /characters` — 0 characters → clear the `kageverse_first_map_onboarding_done` flag and start `CharacterCreateScene`; ≥1 → save the character locally, connect the realtime WS, and start the scene for `last_map_id` at the saved position (`resolveSpawnOnMap`). If the character API is unreachable (non-auth error), an amber warning shows and the scene falls back to `VillageScene`.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/AuthScene.ts` | The whole screen: form wiring, validation, session restore, routing |
| `src/network/api.ts` | `authAPI` (login/register/supportedCountries), token storage, `authFetch` 401→refresh retry |
| `src/lib/validation.ts` | `validateLoginIdentifier`, `validateUsername` (shared, framework-free) |
| `src/game/realtimeBootstrap.ts` | `bootstrapRealtimeForGameEntry` — WS connect + session-replaced/auth-failed → back to `AuthScene` |
| `src/game/playerSession.ts` | `saveCurrentCharacter`, `saveUserPrefs` (locale apply) |
| `src/game/maps/registry.ts`, `src/game/spawn.ts` | Resolve `last_map_id` → scene key + spawn point |
| `public/assets/html/auth_form.html` | Form markup with `data-i18n` attributes |

New `GameComponent` classes needed: none — this is a standalone pre-game scene, not an in-map feature.

## 4. Backend contract

- REST (all in `authAPI` / `charactersAPI`, `src/network/api.ts`):
  - `GET /auth/supported-countries` — country → preferred-language rows for the register select.
  - `POST /auth/register` — see `../kageverse-server/docs/api/auth/register.md`.
  - `POST /auth/login` — see `../kageverse-server/docs/api/auth/login.md`.
  - `POST /auth/refresh` — single-flight token refresh inside `authFetch` on any 401; failure clears tokens and surfaces `auth.error.unauthorized`.
  - `GET /characters` — see `../kageverse-server/docs/api/character/characters.md`.
- WS: no events consumed/emitted by the form itself. On successful entry with a character, `bootstrapRealtimeForGameEntry` opens the WS singleton (`src/network/realtime.ts`); close codes 4010 (`session_replaced`) and 4001 (auth failed) route back to `AuthScene`. Protocol: `../kageverse-server/docs/api/realtime.md`, FE mirror `src/network/protocol/events.ts`.
- Tokens: `kageverse_jwt` + `kageverse_refresh` in `localStorage` (`setTokens`/`getAccessToken`/`clearTokens`).

## 5. UI & input

- Overlay: a Phaser `DOMElement` loading `auth_form.html`. This is a pre-existing exception to the "HTML DOM via `createModalShell`" rule — `AuthScene` is a full pre-game scene with no gameplay keyboard capture to conflict with.
- Keyboard: no `inputFocus` layer is registered (no gameplay input exists yet); the only handler is the native Enter-to-submit listener scoped to the form's inputs.
- i18n: `auth.login.*`, `auth.register.*`, `auth.bootstrap.api_error`, `character.bootstrap.checking`, `validation.*`, `api.error.*`, `realtime.error.session_replaced` in `src/i18n/locales/{en,vi}.ts`; static markup translated via `data-i18n` + `applyDomTranslations`.

## 6. Client-side state & prediction

- Nothing predicted; authentication and the character list are fully server-authoritative. Client-side validation is a UX pre-check only — the server re-validates.
- Local state: tokens, `kageverse_user_prefs` (locale), `kageverse_current_character`, `kageverse_first_map_onboarding_done` flag.
- Env vars: `VITE_API_BASE_URL` (already in `.env.example`). No new vars.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build` green.
2. Backend up (`../kageverse-server`: `make up && make run`), `yarn dev`, open `http://localhost:5173` with cleared `localStorage`.
3. Submit empty login → missing-fields message; identifier `a@b` → email-invalid; identifier `x!` → alphanumeric error.
4. Toggle to register → country select populates (or shows `VN — vi (offline)` with backend down); register a new account → lands on `CharacterCreateScene`.
5. Login with an account that has a character → lands on its `last_map_id` scene at the saved position.
6. Reload the page → "Restoring session..." then direct entry, no form. Corrupt `kageverse_jwt` and `kageverse_refresh` → "Session expired" + form (after reload).
7. Press Enter inside the password field → submits login without clicking.
8. Log in from a second browser → first client returns to `AuthScene` with the session-replaced alert.

## 8. Acceptance criteria

- AC-1 Invalid or missing login/register fields are rejected client-side with a localized message and no network request (§7.3).
- AC-2 Successful login/register stores `kageverse_jwt` (+ refresh token) and applies the user's `preferred_language` to the UI immediately (§7.4–5).
- AC-3 A user with zero characters is routed to `CharacterCreateScene`; a user with a character enters the scene mapped from `last_map_id` at `last_pos_x/y` (§7.4–5).
- AC-4 With a stored token, reload skips the form and restores the session; an invalid session clears tokens and shows the expired message (§7.6).
- AC-5 An expired access token during character bootstrap is transparently refreshed via `POST /auth/refresh`; refresh failure returns the player to the login form.
- AC-6 Enter inside any input submits the visible view (§7.7).
- AC-7 WS close 4010 (session replaced) returns the player to `AuthScene` with an alert (§7.8).
- AC-8 Character-API outage after a valid login degrades to `VillageScene` with a warning instead of blocking entry (§7.5 with `/characters` failing).

## 9. Out of scope

- Character creation itself (FEAT-CHAR-001), logout UI, password reset / email verification (no backend support), social/wallet login, manual language switcher on the auth form (locale changes happen in-game via Settings), token storage hardening beyond `localStorage`.
