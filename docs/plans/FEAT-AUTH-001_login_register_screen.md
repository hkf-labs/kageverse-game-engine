# Plan: Login / register screen

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-AUTH-001 |
| Linked spec | `docs/specs/FEAT-AUTH-001_login_register_screen.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

A single entry scene that satisfies spec AC-1…AC-8: validated login/register against the backend, durable token storage with transparent refresh, locale applied from the user record, silent session restore on reload, and correct routing into either character creation or the player's last map.

## 2. Approach

Keep authentication entirely inside one Phaser scene (`AuthScene`) with an HTML form template, instead of a React screen — the React shell stays a thin bootstrap (`GameComponent.tsx`) and the scene flow (`AuthScene → CharacterCreateScene | map scene`) lives in one place. The form is a Phaser `DOMElement` (accepted exception: pre-game scene, no gameplay keyboard to conflict with — in-game overlays still use `createModalShell`). All HTTP lives in `src/network/api.ts` (`authAPI`, `authFetch` with single-flight 401→refresh) per the no-`fetch`-outside-api rule; validation is framework-free in `src/lib/validation.ts` so `CharacterCreateScene` reuses it; routing reuses `MAP_REGISTRY` + `resolveSpawnOnMap` rather than auth-specific logic.

## 3. Steps

1. **Form template** — `public/assets/html/auth_form.html`: `#login-view` (identifier, password, `#btn-login`, `#switch-to-register`) and `#register-view` (username, email, password, `#reg-country-code` select, `#btn-register`, `#switch-to-login`), all labels carrying `data-i18n` keys.
2. **Token layer** — `src/network/api.ts`: `getAccessToken`/`setTokens`/`clearTokens` over `localStorage` keys `kageverse_jwt`/`kageverse_refresh`; `refreshAccessToken()` (single-flight `POST /auth/refresh`); `authFetch()` wrapper that retries once on 401 then clears tokens and throws `auth.error.unauthorized`.
3. **Auth API** — `authAPI` in the same file: `supportedCountries()` (`GET /auth/supported-countries`), `register()` (`POST /auth/register`), `login()` (`POST /auth/login`); errors formatted with `trace_id`.
4. **Validation helpers** — `src/lib/validation.ts`: `validateUsername` (3–20 alphanumeric), `validateLoginIdentifier` (email regex when the value contains `@`, otherwise username rules), returning localized messages via `t()`.
5. **Scene shell** — `src/game/scenes/AuthScene.ts`: load the template in `preload`, create status text + DOMElement in `create`, wire the click dispatcher (button/link ids) and the native Enter-keydown submit listener; handle `Phaser.Scale.Events.RESIZE` repositioning and unsubscribe the locale listener on shutdown/destroy.
6. **View toggle + countries** — `toggleView()` swaps view `display`; `ensureCountriesLoaded()` lazily fills the select from `authAPI.supportedCountries()` with the offline `VN — vi` fallback, loading at most once.
7. **Submit handlers** — `handleLogin()` / `handleRegister()`: client validation → progress status → API call → `setTokens` → `applyUserPrefsFromResponse` (`saveUserPrefs` in `src/game/playerSession.ts`, which persists `kageverse_user_prefs` and calls `setLocale`).
8. **Routing** — `goToGameOrCharacterCreate()`: `charactersAPI.list()`; zero characters → remove `kageverse_first_map_onboarding_done` and start `CharacterCreateScene`; otherwise `saveCurrentCharacter`, `bootstrapRealtimeForGameEntry(this)` (`src/game/realtimeBootstrap.ts` — WS connect with session-replaced/auth-failed handlers), then `resolveSceneKeyForMap(last_map_id)` + `resolveSpawnOnMap` (`src/game/maps/registry.ts`, `src/game/spawn.ts`) and `scene.start`. Non-auth API failure → warning + `VillageScene` fallback.
9. **Session restore** — in `create()`, when a token exists skip the form and run `bootstrapSession()` (restore status → step 8; on auth error `clearTokens` + expired message).
10. **i18n** — add `auth.login.*`, `auth.register.*`, `auth.bootstrap.api_error`, `validation.*` keys to `src/i18n/locales/en.ts` + `vi.ts`; translate the static form via `applyDomTranslations` and re-apply on `onLocaleChange`.

## 4. Assets & i18n

- Assets: `public/assets/html/auth_form.html` only (markup/CSS, no art; in repo).
- i18n keys: `auth.login.*`, `auth.register.*`, `auth.bootstrap.api_error`, `character.bootstrap.checking`, `validation.username_*`, `validation.identifier_required`, `validation.email_invalid`, `api.error.{not_logged_in,load_countries,register,login}`, `realtime.error.session_replaced`, `common.loading` — present in both `locales/en.ts` and `locales/vi.ts`.
- Env vars: `VITE_API_BASE_URL` (already documented in `.env.example`); none added.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — auth and character list are read from the server; client validation is a UX pre-check only.
- [x] WS `move` stays inside the throttle; no idle sends — this feature sends no movement; it only opens the WS connection via `bootstrapRealtimeForGameEntry`.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` — no protocol shape touched by this feature.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1 (`docs/screen/auth/login.md`, `docs/screen/auth/register.md`).
- [x] Spec status `Implemented`; `_INDEX.md` rows updated.
