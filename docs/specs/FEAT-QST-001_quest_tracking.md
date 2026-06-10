# Spec: Quest Tracking

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-QST-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-QST-001_quest_tracking.md` |
| Game-design source | `../kageverse-server/docs/business/quests/quest.md`, `../kageverse-server/docs/business/quests/main-quests.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

The player always sees their current objective: a compact corner tracker pins the highest-priority quest, a full quest-log modal (J) shows all quests by category with objectives and rewards, and both update live from WS `quest_progress` pushes — no polling. Quiz-type quest steps are answered through NPC menus.

## 2. Player-facing behavior

- **Corner tracker** (`QuestTracker`, top-left under the HUD topbar, reflows below the buff panel): shows one quest — completed quests first (urging turn-in: "✅ Complete — return to {npc}"), else by category priority main > side > daily > weekly, then lowest `min_level`. Body shows the first unfinished objective as "<verb> <target> (done/count)"; quiz steps show the question summary. Hover highlights the border; click opens the quest log. With no active/completed quest but an NPC offering one, a red hint shows instead ("go meet <NPC>"); with nothing to show, the tracker disappears entirely.
- **Quest log** (`QuestLogPanel`): opens via **J** (when no other modal is open), the F1 menu "Quests" entry, an NPC's `view_quests` action, or clicking the tracker. HTML DOM modal with tabs Main / Side / Event (Event disabled, "coming soon"); a red dot marks tabs with active quests or a next offer. Each quest card shows name, status badge (Active/Completed), level requirement, per-objective progress with ✓, and rewards (XP/yen/coin/items). A dashed "next" card hints the upcoming offered quest and its giver NPC. Loading and errors appear in the modal status line. ESC/close button closes; content re-renders on locale change.
- **Live updates:** any progress (kills, talks, item use, accept, turn-in) is pushed by the server over WS; the tracker, open panel, tab dots, and NPC badges update immediately without re-fetching.
- **Quiz quests:** quests with `quiz_npc` objectives surface a "Do quiz" entry in the matching NPC's menu (see FEAT-NPC-001). The NPC asks the question in a chat bubble; the player picks an answer from a menu. Wrong → retry hint and the same question; correct → next pending step chains automatically; all steps done → status message to turn in.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/components/QuestTracker.ts` | Corner tracker: lazy Phaser container, priority pick, empty-hint, click/hover, `setTopOffset` reflow |
| `src/game/components/modals/QuestLogPanel.ts` | DOM modal: board fetch, tabs, quest cards, `applyProgress` cache patching, `getQuests()` cache, exports `questDisplayName` / `targetDisplayName` |
| `src/game/questQuiz.ts` | Quiz helpers: `findPendingQuizStep`, `listQuizMenuEntries`, `quizQuestionText`, `isQuizObjective` |
| `src/game/components/NpcManager.ts` | Quiz answer menu + `questAPI.submitQuiz`; accept/turn-in entry points (FEAT-NPC-001) |
| `src/game/scenes/BaseMapScene.ts` | Wires panel→tracker via `onQuestsUpdated`; J key; WS `quest_progress` → `applyProgress`; initial `questLog.refresh()`; `syncQuestTrackerOffset()` |

New `GameComponent` classes needed: none (all exist). No new map scenes.

## 4. Backend contract

- REST (`questAPI` in `src/network/api.ts`; no dedicated quest page exists under `../kageverse-server/docs/api/` — `docs/api/npc/npc.md` and the BE business docs are the nearest references):
  - `GET /characters/:id/quests/board` → categories with quests + `next_offered` (panel refresh)
  - `GET /characters/:id/quests` (`questAPI.list`, optional `status` filter)
  - `GET /characters/:id/quests/npc-availability` → per-NPC offered/turn-in IDs (badges, FEAT-NPC-001)
  - `POST /characters/:id/quests/:questId/accept` / `/turn-in` (turn-in may return `granted_rewards` + `level_up`)
  - `POST /characters/:id/quests/:questId/quiz` → `{ correct, quest? }`
- WS consumed: `quest_progress` — `QuestProgressPayload { reason, quests: QuestDTO[] }`, FE mirror `src/network/protocol/events.ts`. Note: `../kageverse-server/docs/api/realtime.md` exists but does not yet list `quest_progress`; the FE mirror is the working reference.
- WS emitted: none.

## 5. UI & input

- Overlays: `QuestLogPanel` extends `BaseModal` / `createModalShell` (`mount: 'document-body'`, size `lg`, `withStatus`). Tracker is Phaser canvas (HUD element, not an overlay).
- Keyboard: panel registers on the `blockingDialog` layer (250) in `src/game/components/inputFocus.ts`; while open it disables Phaser global key capture and blocks movement. J only fires when no input-blocking modal is open.
- i18n: `quest.log.*` (title, tabs, statuses, objective verbs, rewards, empty/next hints), `quest.tracker.*` (completed_turn_in, quiz_step, unknown_npc), quest names as `quest.<quest_id>.name` and quiz questions as `quest.<id>.quiz.*` in `locales/en.ts` + `locales/vi.ts`; target names cascade through `monster.name.*` / `npc.name.*` / `item.name.*` / `map.name.*` (`targetDisplayName`). Known deviation: the tracker empty-hint string in `BaseMapScene.ts` ("Đến gặp … để nhận nhiệm vụ") is hardcoded Vietnamese, not an i18n key.

## 6. Client-side state & prediction

- No prediction. Objective counts, statuses, rewards, and quiz correctness are server-computed; the client holds a quest cache (`QuestLogPanel.flatQuests` + per-category board) patched idempotently by `applyProgress` (claimed → remove; otherwise upsert). Board is re-fetched only on scene mount, panel open, and explicit `refresh()` calls.
- No new env vars.

## 7. Verification plan

`npx tsc -b` + `yarn lint` + `yarn build`, then with backend running:

1. Fresh character in Village: tracker shows the red "go meet Genji" hint; accept Q1 → tracker switches to the quest objective.
2. Press **J** → quest log opens with Main tab populated, dot on tabs with content; Event tab disabled. ESC closes.
3. Kill a quest monster → tracker count increments live (WS, no reopen needed); complete all objectives → tracker shows "return to {npc}".
4. Run the Basic Knowledge quiz at the NPC: wrong answer keeps the question, correct chains to the next step, completion prompts turn-in.
5. Turn in → quest leaves the log (claimed), tracker advances to the next quest, NPC badges update.

## 8. Acceptance criteria

- AC-1 Tracker pins exactly one quest, preferring completed, then main > side > daily > weekly, then lowest min_level; it disappears when there is nothing to track and no offer hint.
- AC-2 Tracker body shows the first unfinished objective with progress, or the turn-in NPC name when completed; clicking it opens the quest log.
- AC-3 J toggles the quest log only when no other modal is open; the panel fetches `/quests/board` on open and shows loading/error states.
- AC-4 Quest cards render level requirement, each objective with done/count and ✓, status badge, and rewards; `next_offered` renders as a dashed hint card with the giver NPC.
- AC-5 A WS `quest_progress` push patches the cache (upsert active/completed, remove claimed), re-renders an open panel, and updates the tracker and NPC badges without any REST call.
- AC-6 Quiz steps appear in the matching NPC menu; wrong answers re-open the question, correct answers advance via the API response, and a fully completed quest prompts the turn-in message.
- AC-7 Tracker reflows below the buff indicator when buffs appear (`setTopOffset`).

## 9. Out of scope

- Quest accept/turn-in UX inside NPC menus (FEAT-NPC-001 owns the menu; this spec owns the quest API + cache).
- Daily/weekly/event quest UI (Event tab is a disabled placeholder).
- Quest design, rewards, and quiz content — owned by `../kageverse-server/docs/business/quests/`.
