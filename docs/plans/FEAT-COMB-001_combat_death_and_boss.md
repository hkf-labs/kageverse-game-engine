# Plan: Combat, death & boss

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-COMB-001 |
| Linked spec | `docs/specs/FEAT-COMB-001_combat_death_and_boss.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

A player on any combat map can target, attack, and kill backend-spawned monsters with full visual feedback (HP bars, floaters, level-up banners), take retaliation damage, die into the Collapsed flow, and respawn — with every gameplay outcome supplied by the server (spec AC-1…AC-9).

## 2. Approach

Combat is built as self-contained `GameComponent` classes orchestrated by `BaseMapScene`, so every map scene inherits the full loop for free; safe-zone maps pass `{ safeZone: true }` and skip polling entirely. REST polling (`combatAPI`) was chosen over new WS events for attack/tick/respawn — the existing personal WS channel (`char_stats` / `char_level_up`) already covers stat sync, so no protocol change was needed. The death overlay reuses `BaseModal` / `createModalShell` on the `cinematic` input-focus layer rather than a Phaser overlay. The Mahoraga boss preview is an isolated scene using `@esotericsoftware/spine-canvas` on its own DOM canvas, deliberately outside `BaseMapScene` / `MAP_REGISTRY`.

## 3. Steps

1. Define combat DTOs and `combatAPI` (`listMonsters`, `attack`, `tick`, `respawn`, `pickupDrop`, `setDeathState`) in `src/network/api.ts`.
2. Add class/targeting rule helpers: `src/game/combatClass.ts` (bow-only attack-below) and `src/game/worldTarget.ts` (vertical auto-select constraints, candidate types).
3. Build `src/game/components/MonsterManager.ts`: 8 s list poll, placeholder bodies by level tier, ground/flying wander, click-to-lock + auto selection, `swing()` with client cooldown gate and range pre-check, auto-move-to-target, damage floaters, 700 ms combat-tick poll gated by `isCombatTickEnabled()` (`src/game/env.ts`).
4. Build `src/game/components/MonsterTargetFrame.ts` (top-center frame: name/level/grade/HP, dead fade-out) and `src/game/components/BossHPBar.ts` (full-width banner, engages only for `leader`/`world_boss`).
5. Build `src/game/components/modals/DeathMenu.ts` on `BaseModal` with stages `button` → `menu` → `hidden` and the three `DeathChoice` callbacks.
6. Wire everything in `src/game/scenes/BaseMapScene.ts`: component construction with callbacks (`onAttackResult`, `onRetaliation`, `onTickResult`, `onTargetSelected/Cleared`, `onManualTargetLocked`), `updateUnifiedWorldTarget` per-frame selection, Enter/double-Enter/ESC handling, auto-attack tick, `handleAttackResult` (HUD, floaters, target-frame/boss-bar sync, death check), `handleDeath` / `handleDeathChoice` (respawn via `combatAPI.respawn` + `resolveSceneKeyForMap` with `useHubSpawn`), death-state restore from the character DTO.
7. Subscribe WS listeners in `BaseMapScene.setupRealtimeListeners` for `char_stats`, `char_level_up`, `snapshot_position` (FE mirror `src/network/protocol/events.ts`).
8. Route touch input through `src/game/components/GameControls.ts` (D-pad + `btn_attack` → `onInteract`, primary-attack skill icon from `SkillHotbar`).
9. Add `MahoragaBossScene` (`src/game/scenes/MahoragaBossScene.ts`) and register it in `src/game/GameConfig.ts`; load rig from `public/assets/mahoraga/`.

## 4. Assets & i18n

- Assets (user-provided, existing): `public/assets/game/buttons/button-attack.png`, `public/assets/mahoraga/{Mahoraga.json,Mahoraga.atlas,Mahoraga.png}`. Monster visuals are placeholder Graphics — no sprite assets yet.
- i18n keys in `locales/en.ts` + `locales/vi.ts`: `monster.grade.*`, `monster.error_*`, `monster.name.*`, `death.*`, `combat.auto_attack_*`, `combat.respawn_*`, `combat.death_*`, `combat.suicide_failed`.
- Env: `VITE_COMBAT_TICK_ENABLED` documented in `.env.example`.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side (cooldown/range checks are request gates only; backend re-validates).
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends.
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` (consumes `char_stats` / `char_level_up` / `snapshot_position`).

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [x] Spec status moved to `Implemented`; `_INDEX.md` rows updated.
