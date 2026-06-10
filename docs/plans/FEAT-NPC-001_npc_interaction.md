# Plan: NPC Interaction

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-NPC-001 |
| Linked spec | `docs/specs/FEAT-NPC-001_npc_interaction.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

NPCs spawn per scene config, are selectable/interactable with keyboard and touch, open a server-driven action menu with quest hooks, and route to shop / upgrade / quest log / teleport features — spec AC-1 … AC-8.

## 2. Approach

One self-contained `GameComponent` (`NpcManager`) owns the whole NPC lifecycle; `BaseMapScene` only orchestrates (constructs it with injected deps, forwards interact/selection from the unified world-target loop). The NPC dialog reuses the existing Phaser `ActionMenu` (canvas) instead of a DOM modal because it never coexists with HTML overlays and inherits the input-focus layer routing for free. Menus are fetched live from the BE per interaction (`GET /maps/:id/npcs/:templateId`) with a mock fallback so maps without BE templates still work. Quest hooks (accept/turn-in/quiz/initiation) are injected into the same menu rather than a separate UI.

## 3. Steps

1. Define config shapes — `NpcConfig` / `NpcEntry` in `src/game/components/types.ts` (`templateId` optional → BE vs mock path).
2. Mock gateway for legacy/no-BE maps — `src/features/npcs/types.ts` + `mockNpcGateway.ts` (`MOCK_NPC_TEMPLATES`, `getMockNpcTemplate`), re-exported via `index.ts`.
3. REST layer — `npcAPI` in `src/network/api.ts`: `getInteract`, `talk`, `cancelMainQuest`, `saveCoordinates`; DTOs (`NpcInteractResponse`, `NpcActionDTO`, `TeleportDestinationDTO`, `CancelMainQuestResponse`).
4. Spawning — `NpcManager.create()`: scale-factor positioning, transparent-padding-aware grounding (`getTextureBottomPadding`), name label, hidden badge per `templateId`, pointerdown select.
5. Selection — `selectNpcAuto` (called from `BaseMapScene.updateUnifiedWorldTarget`), `findNearestInRange` (60 px + vertical gate from `src/game/worldTarget.ts`), selection ring/arrow graphics, `cycleSelectedNpc` for the ⇄ button.
6. Interaction — `handleInteract` (in range → menu; out of range → `autoMoveTargetX`) + `checkAutoMoveArrival` polled by the scene update loop; Enter and the touch attack button reach it via `BaseMapScene.handleInteract()` (`src/game/scenes/BaseMapScene.ts`).
7. Menus — `startInteraction` fetches the BE menu (loading row, stale-response guard via `fetchSeq`), `openMenuFromBE` orders quest turn-ins → accepts → quiz steps → initiation choose-class → BE actions → Leave; `openMenuMock` fallback.
8. Action handlers — `runAction` switch: talk (chat bubble + `tryTrackTalk`), shop submenus (weapon class / apparel slots / jewelry slots → `ShopModal` filters), teleport submenu (`resolveSceneKeyForMap` + `scene.start`), quest log, Hoshi upgrade, cancel-main-quest + save-coordinates with `ConfirmDialog`.
9. Quest hooks — `runQuestAccept` (warning confirm), `runQuestTurnIn` (rewards/level-up/end-MVP callbacks), quiz flow (`questQuiz.ts` helpers), initiation flow (`src/game/initiation.ts` helpers, `class_id` on turn-in), `refreshCharacterAfterAccept`.
10. Badges — `refreshBadges()` via `questAPI.npcAvailability`, `paintBadge` (❓ > ❗), `getFirstOfferedNpc()` for the tracker empty hint; scene calls it from `QuestLogPanel.onQuestsUpdated`.
11. Chat bubble — `src/game/components/NpcChatBubble.ts`: single-instance typewriter bubble, re-anchored each frame, linger + hide timers, snapshot-aware `setVisible`.
12. Scene wiring — `BaseMapScene` constructs `ConfirmDialog`/`ShopModal`/`ActionMenu`/`QuestLogPanel`/`HoshiUpgradeModal` before `NpcManager` and injects them plus status/reward/level-up/end-MVP/character-updated callbacks; each concrete scene (e.g. `src/game/scenes/VillageScene.ts`) implements `getNpcConfigs()` and preloads sprites.

## 4. Assets & i18n

- NPC sprites under `public/assets/maps/<map_id>/npcs/*.png` (user-provided; village set exists: village_elder, blacksmith, healer, merchant, stash_keeper, teleporter).
- i18n keys present in `locales/en.ts` + `locales/vi.ts` under `npc.*` (names, actions, mock, run, quest, quiz, teleport, weapon/apparel/jewelry submenus, initiation, dialogue, cancel_quest, save_coordinates).
- Known gap: `DIALOGUE_TEXT_VI` map in `NpcManager.ts` hardcodes VN dialogue lines (in-code TODO to migrate to i18n bundles).
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — menus, quest outcomes, rewards, teleport destinations all come from the BE.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); NPC auto-walk reuses normal movement, no idle sends.
- [x] FE mirror `src/network/protocol/events.ts` untouched by this feature (quest cache updates consumed via `quest_progress`, owned by FEAT-QST-001).

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated — spec is Implemented; `docs/specs/_INDEX.md` / `docs/plans/_INDEX.md` do not exist yet.
