# Spec: Combat, death & boss

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-COMB-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-COMB-001_combat_death_and_boss.md` |
| Game-design source | `../kageverse-server/docs/business/monsters/README.md`, `../kageverse-server/docs/business/monsters/catalog.md`, `../kageverse-server/docs/business/game-objects/combat-module.md`, `../kageverse-server/docs/business/game-objects/leveling-and-experience.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

The player can target and attack server-spawned monsters on combat maps, see damage/XP feedback and level-up banners, suffer monster retaliation, and on HP 0 enter a death flow ("Collapsed" overlay) with respawn-to-village / respawn-here (placeholder) / spectate choices. Boss-grade monsters (`leader` / `world_boss`) additionally show a full-width boss HP banner. All combat outcomes (damage, crits, XP, drops, retaliation, death) are computed by the backend; the client renders results.

## 2. Player-facing behavior

- **Entry:** any non-safe-zone map scene. Monsters are polled from the backend every 8 s (`MonsterManager.refreshFromBE`) and rendered as level-tiered placeholder Graphics blobs that idle-wander (ground patrol or flying orbit) around their server spawn point.
- **Targeting:** each frame `BaseMapScene.updateUnifiedWorldTarget` auto-selects the nearest in-range world object (loot / monster / NPC / remote player). Clicking a monster manually locks it as target (sticky until it dies, leaves camera view, or ESC). The selected monster shows an overhead HP bar; `MonsterTargetFrame` shows a top-center frame with name (i18n `monster.name.<template_id>`), level, grade label, and a color-shifting HP bar.
- **Attacking (keyboard):** Enter with a target in range swings (POST `/attack`); out of range, the player auto-runs toward the target and swings on arrival. Enter twice within 1.5 s toggles auto-attack (swing per cooldown while idle; any movement key turns it off). ESC dismisses the current world-target selection. A client-side per-skill cooldown gate mirrors the backend (`SKILL_COOLDOWN_MS` in `MonsterManager.ts`); the backend remains the authoritative check.
- **Attacking (touch):** virtual D-pad moves; the right-anchored attack button (`GameControls`, `btn_attack`) fires the same `onInteract` path as Enter. The attack button shows the hotbar's selected `active_attack` skill icon.
- **Class rule:** melee / classless cannot attack monsters below the player's screen Y; only Bow can (`combatClass.ts`), otherwise toast `monster.error_target_below`.
- **Hit feedback:** damage floaters above the monster (yellow + "!" on crit), body alpha flash, target-frame/boss-bar HP sync, green `+N XP` floater, HUD HP/MP/EXP update from `AttackResponse`.
- **Retaliation:** a 700 ms combat-tick poll (POST `/combat-tick`, disabled via `VITE_COMBAT_TICK_ENABLED=false`) returns retaliations; the attacking monster pulses red (ring, eyes, "!" mark) for ~680 ms, the player flashes and shows a red `-N` floater, HUD HP drops.
- **Leveling:** level-ups arrive in `AttackResponse.level_up` and/or WS `char_level_up`; the scene shows a level-up banner and updates HUD max HP/MP and level. WS `char_stats` keeps HP/MP/EXP in sync for non-attack reasons (retaliation, use_item, respawn, heal, level_up).
- **Death:** when `character_dead` / HP ≤ 0, all movement and attack input locks, auto-attack and the combat tick pause, and the `DeathMenu` cinematic overlay shows the "YOU HAVE FALLEN" banner with a Collapsed button (stage `button`). Activating it (click or Enter) opens stage `menu` with three options: **Return** (POST `/respawn` → heal + scene restart at village hub spawn), **Respawn here** (disabled, "coming soon" status), **Close** (POST `/death-state` action `spectate` → overlay closes, player spectates where they fell; Enter reopens the menu). Death state is also restored from the character DTO on scene load.
- **Boss:** when the selected monster's grade is `leader` or `world_boss`, `BossHPBar` shows a full-width top banner (name, grade, HP bar with percent) alongside the target frame; it fades out 1 s after the boss dies.
- **Mahoraga showcase:** `MahoragaBossScene` is a standalone Spine preview scene (registered in `src/game/GameConfig.ts`, not reachable from any portal or menu) rendering the Mahoraga rig via `@esotericsoftware/spine-canvas` on an overlay canvas, with DOM buttons to play idle/run/attack/skill/die/win and a BACK button to `AuthScene`.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Wires all combat components; unified world-target loop, Enter/auto-attack handling, attack-result/tick handlers, floaters, death flow (`handleDeath` / `handleDeathChoice` / `handleSuicide`), WS `char_stats` / `char_level_up` / `snapshot_position` listeners |
| `src/game/scenes/MahoragaBossScene.ts` | Standalone Spine boss animation preview scene |
| `src/game/components/MonsterManager.ts` | Monster rendering/wander, selection (auto/manual), swing + cooldown gate, list poll, combat-tick poll, damage floaters |
| `src/game/components/MonsterTargetFrame.ts` | Top-center target info frame (name/level/grade/HP) |
| `src/game/components/BossHPBar.ts` | Full-width boss banner for `leader` / `world_boss` grades |
| `src/game/components/modals/DeathMenu.ts` | "Collapsed" overlay, stages `button` → `menu` → `hidden` |
| `src/game/components/GameControls.ts` | Touch D-pad + attack button (routes to `onInteract`) |
| `src/game/combatClass.ts` | Bow-only attack-below rule |
| `src/game/worldTarget.ts` | Vertical auto-select rules + candidate types |

No new `GameComponent` classes needed — all listed components exist and implement `src/game/components/types.ts`.

## 4. Backend contract

- REST (`combatAPI` in `src/network/api.ts`; no per-endpoint doc exists yet under `../kageverse-server/docs/api/` for combat):
  - `GET /maps/:id/monsters?character_id=` — monster list + active drops (`ListMonstersResponse`).
  - `POST /characters/:id/attack` — hits, retaliations, XP, optional `level_up`, drops, character HP/MP/level/EXP, `character_dead`.
  - `POST /characters/:id/combat-tick` — retaliations + character HP / dead flag.
  - `POST /characters/:id/respawn` — heal + village `map_id`.
  - `POST /characters/:id/death-state` — `spectate` | `kill`.
- WS (`../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`): consumes `char_stats`, `char_level_up`, `snapshot_position`. No combat-specific events are emitted by the FE.
- Damage, crit, XP, level-up, retaliation, and death are server-computed; the FE only renders.

## 5. UI & input

- Overlays: `DeathMenu` extends `BaseModal` / `createModalShell` (HTML DOM, `cinematic` layer per `src/game/components/inputFocus.ts`, blocks all lower keyboard layers; backdrop click is a no-op). Target frame, boss bar, floaters are Phaser objects (non-interactive HUD).
- Keyboard: Enter (interact/swing/auto-attack toggle, reopen death menu), ESC (dismiss target), handled in `BaseMapScene.update` only while no input-blocking modal is open and `deathState === 'alive'`.
- i18n key prefixes (in `src/i18n/locales/{en,vi}.ts`): `monster.grade.*`, `monster.error_*`, `monster.name.*`, `combat.auto_attack_*`, `combat.respawn_*`, `combat.death_*`, `combat.suicide_failed`, `death.*`.

## 6. Client-side state & prediction

- Predicted client-side: movement only, plus cosmetic monster wander and the cooldown/range pre-checks that merely suppress redundant requests. HP, damage, XP, drops, death all wait for server responses; `snapshot_position` rolls back rejected moves.
- Env vars: `VITE_COMBAT_TICK_ENABLED` (in `.env.example`) toggles the retaliation poll.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build` — all green.
2. Backend running; enter a combat map (e.g. a fire farm path). Walk near a monster → auto-target + target frame; press Enter → damage floater + monster HP bar drops.
3. Press Enter twice quickly → auto-attack on; move → off.
4. Let a monster retaliate → red pulse on monster, `-N` floater on player, HUD HP drops.
5. Kill monsters until level-up → banner + HUD level/max stats update.
6. Die → input locked, Collapsed overlay; choose Return → respawn in village at hub spawn with restored HP; repeat and choose Close → spectate, Enter reopens menu.
7. Engage the Q17 leader-grade monster → boss banner appears; on kill it fades out.
8. `VITE_GAME_DEBUG=true` helps verify hitboxes/coordinates.

## 8. Acceptance criteria

- AC-1 Monsters from `GET /maps/:id/monsters` render and idle-wander; the nearest in-range alive monster is auto-targeted; click locks manual targeting.
- AC-2 Enter (or the touch attack button) swings at the target via POST `/attack` when in range, and auto-runs into range first when not; displayed damage/XP come only from the response.
- AC-3 Double-Enter within 1.5 s enables auto-attack; any movement input disables it.
- AC-4 Non-bow classes get an error toast instead of attacking monsters below them.
- AC-5 The selected monster shows an overhead HP bar and the top-center target frame; `leader`/`world_boss` targets additionally show the boss banner, which fades on death.
- AC-6 Retaliation (attack response or combat tick) shows monster aggro flash, player damage floater, and HUD HP from server values.
- AC-7 WS `char_stats` and `char_level_up` update HUD HP/MP/EXP/level; level-up shows a banner.
- AC-8 On death, movement/attack input is blocked and the Collapsed overlay offers Return (server respawn → village), Respawn here (disabled placeholder), and Close (server spectate state; Enter reopens menu); death state survives reload via the character DTO.
- AC-9 `MahoragaBossScene` plays all six Spine animations via its DOM buttons and returns to `AuthScene` with BACK.

## 9. Out of scope

- Loot drop rendering and pickup (FEAT-COMB-002).
- Skill learning/casting, hotbar management, and buff skills.
- Real monster sprites/animations (placeholder Graphics by level tier) and the in-place respawn option.
- Any client-side balance numbers — see the linked backend business docs.
