# Plan: Quest Tracking

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-QST-001 |
| Linked spec | `docs/specs/FEAT-QST-001_quest_tracking.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

A always-visible corner tracker, a J-key quest log modal, WS-driven live progress with no polling, and quiz steps answered through NPC menus — spec AC-1 … AC-7.

## 2. Approach

`QuestLogPanel` is the single source of quest state on the client: it owns the cache (`flatQuests` + per-category board) and emits `onQuestsUpdated` to every consumer (tracker, NPC badges, empty hint). The tracker is a dumb renderer fed via `setQuests`. Live updates use a patch model — the BE pushes full `QuestDTO` snapshots in `quest_progress`, and `applyProgress` upserts/removes locally so the board REST call happens only on mount/open. The panel reuses `BaseModal`/`createModalShell` (DOM, `blockingDialog` layer); the tracker is a lightweight Phaser container since it lives inside the HUD. Quiz logic is pure helpers in `src/game/questQuiz.ts` so both tracker rendering and the NPC menu share it.

## 3. Steps

1. REST layer — `questAPI` in `src/network/api.ts`: `list`, `board`, `accept`, `turnIn`, `npcAvailability`, `submitQuiz`; DTOs `QuestDTO`, `QuestObjectiveDTO` (incl. `quiz_npc` with `npc_id`/`question_key`/`options`), `QuestBoardResponse`, `TurnInQuestResponse` (`granted_rewards`, optional `level_up`), `SubmitQuizRequest/Response`.
2. Protocol mirror — `QuestProgressReason` + `QuestProgressPayload` and the `quest_progress` envelope arm in `src/network/protocol/events.ts` (reuses REST `QuestDTO` wire shape).
3. Name resolution helpers — `questDisplayName` (i18n `quest.<id>.name` with raw-key fallback) and `targetDisplayName` (cascade monster → npc → item → map namespaces via `tOpt`) exported from `src/game/components/modals/QuestLogPanel.ts`.
4. Quest log modal — `QuestLogPanel extends BaseModal`: `buildShellOptions` (lg, `blockingDialog`, document-body mount, status line), tabs Main/Side/Event with activity dots, fixed-height scrollable card list, `renderQuestCard` (level bullet, objectives with ✓, rewards line), dashed `next_offered` hint card, locale re-render via `registerLocaleSync`.
5. Cache + patching — `refresh()` fetches `/quests/board`; `getQuests()` exposes the flat cache; `applyProgress(quests)` removes `claimed`, upserts the rest, re-renders if visible, and fires `onQuestsUpdated` (idempotent).
6. Corner tracker — `src/game/components/QuestTracker.ts`: `pickTrackedQuest` priority sort (completed first, category order, min_level), lazy container build/teardown, auto-width rounded panel, hover border, click → `questLog.open()`, `setEmptyHint`, `setTopOffset`.
7. Quiz helpers — `src/game/questQuiz.ts`: `isQuizObjective`, `findPendingQuizStep` (active quest, `npc_id` match, `done < count`), `listQuizMenuEntries`, `quizQuestionText` (BE `question_key` → i18n, fallback `target_id`).
8. Quiz flow in NPC menu — `NpcManager.runQuestQuiz` → `openQuizAnswerMenu` (question in chat bubble, options as `ActionMenu` items, Back re-opens cached NPC menu) → `submitQuizAnswer` → on `correct` apply returned quest, chain `findPendingQuizStep`, prompt turn-in when completed (`src/game/components/NpcManager.ts`).
9. Scene wiring — `src/game/scenes/BaseMapScene.ts`: construct panel with `onQuestsUpdated` (tracker `setQuests`, `npcs.refreshBadges()`, empty-hint from `getFirstOfferedNpc`); construct tracker with open-log callback; J key (`KeyCodes.J`, gated on no blocking modal) and the F1 menu "Quests" entry both call `questLog.open()`.
10. WS subscription — `wsClient.events.on('quest_progress', (p) => this.questLog?.applyProgress(p.quests))` in the scene's WS setup; initial `void this.questLog.refresh()` in `loadInitialCharacterState()`.
11. Layout reflow — `syncQuestTrackerOffset()` repositions the tracker below `BuffIndicator` via its `onLayoutChanged` callback.

## 4. Assets & i18n

- No new art assets (tracker and cards are programmatic).
- i18n keys present in `locales/en.ts` + `locales/vi.ts`: `quest.log.*`, `quest.tracker.*`, `quest.<quest_id>.name` (~80 quest names), `quest.<id>.quiz.*` question keys, plus `quiz.option.*` labels resolved from BE `label_key`s.
- Known gap: tracker empty-hint string in `BaseMapScene.ts` is hardcoded Vietnamese ("Đến gặp … để nhận nhiệm vụ") instead of an i18n key.
- No new env vars.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — objective progress, quiz correctness, rewards, and level-ups all come from BE responses or `quest_progress` pushes.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); this feature sends no WS messages.
- [x] FE mirror `src/network/protocol/events.ts` carries `quest_progress`; note `../kageverse-server/docs/api/realtime.md` does not list it yet — doc gap belongs to the BE repo.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated — spec is Implemented; `docs/specs/_INDEX.md` / `docs/plans/_INDEX.md` do not exist yet.
