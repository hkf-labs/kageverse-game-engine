# Spec: Skills & hotbar

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-SKL-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-SKL-001_skills_and_hotbar.md` |
| Game-design source | `../kageverse-server/docs/business/game-objects/skill.md` |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

After choosing a class (Bái Sư: Mikazuki = sword, Hayabusa = bow), the player manages class skills in a Skills modal — browse the skill tree strip, read details, spend skill points to upgrade, and assign learned active skills to a 5-slot hotbar above the bottom of the screen. Selecting a hotbar slot sets the primary attack skill used by the normal swing; pressing a slot holding an `active_buff` skill casts it immediately. All skill data, upgrade outcomes, cast results and slot assignments are server-authoritative via `skillAPI`.

## 2. Player-facing behavior

- **Skill list/detail screen.** F1 opens the main function menu; the ⚡ `menu.skills` entry opens `SkillModal` (title `skill.modal.title`). Layout: SP counter row (`skill.modal.sp_label`), a horizontal icon strip of every class skill (unlearned dimmed at 45 % opacity, learned cells show a level badge), a detail pane, and an action bar.
- **Detail pane.** For the selected skill: layered icon (PNG over faction emoji fallback), localized name/description (`skill.<id>.name` / `.desc`), type (`skill.type_active_attack` / `active_buff` / `passive`), max/current level or "not learned", required character level, missing prerequisites (red), MP cost, cooldown, range, damage multiplier / ATK bonus from `current_stats`, and the next upgrade row (SP cost + ready/locked badge).
- **Actions.** **Upgrade** (enabled only when learned + `next_upgrade.ready`) calls the backend and shows `skill.modal.upgrade_success` with remaining SP. **Assign slot** (learned, non-passive skills) opens an inline 5-button slot picker; choosing a slot calls the backend and pushes the new layout to the hotbar.
- **Keyboard in modal.** ←/→ moves through the strip; ↓ focuses the action buttons (←/→ between them, ↑ back); Enter clicks the focused button; F2/Esc closes.
- **Hotbar.** A 5-slot bar (48 px slots) bottom-center of every map scene, hidden while the character has no class (`class === 'none'`). Slots show the bound skill's icon (PNG texture or faction emoji fallback), the key number 1–5 top-left, and the skill level bottom-right.
- **Slot press (keys 1–5 or click/tap).** Selects the slot as primary (gold ring). If the slot holds an `active_attack` skill, the normal attack (Enter near a monster, the touch attack button, or auto-attack) sends that `skill_id` with `combatAPI.attack`; empty selection falls back to `none.basic_swing`. If it holds an `active_buff` skill, the FE immediately calls `skillAPI.cast`: success adds a ✨ countdown entry to `BuffIndicator` and a `skill.cast_success` status; errors (cooldown/MP/dead) surface the backend message.
- **Touch.** The round attack button (`GameControls`) overlays the primary skill's icon so the player sees which skill the next swing uses; hotbar slots respond to taps via screen hit-testing.
- **Class specificity.** The skill list returned by the backend is per-class (sword vs bow factions). Class also gates melee reach rules: only `bow` can hit monsters below the player (`combatClass.canAttackMonsterBelow`). Learning a skill from a skill book (`sub_type=skill_book` consumed in the inventory) auto-assigns it to the first empty hotbar slot and shows a banner.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Creates `SkillModal` (+`onSlotsChanged` → hotbar refresh) and `SkillHotbar`; wires `setOnPrimaryChanged` → `GameControls.setPrimaryAttackSkill`, `setOnSlotPressed` → `handleCastSkill`; `getSwingSkillID()` feeds `MonsterManager.attackNearest`; `handleSkillLearned` auto-assign + banner; modal registered in the input-focus stack |
| `src/game/components/modals/SkillModal.ts` | The skills screen. Public: `open()`, `close()`, `toggle()`, `refresh()`, `navigate()`, `confirm()` |
| `src/game/components/SkillHotbar.ts` | 5-slot bar. Public: `refresh()`, `setSlots()`, `setVisible()`, `getPrimarySkillID()`, `getPrimaryAttackSkillID()`, `setOnSlotPressed()`, `setOnPrimaryChanged()` |
| `src/game/skillIcon.ts` | Icon texture keys/paths, `SKILL_ICON_FILE_IDS` preload list, `ensureSkillIconTexture` runtime loader, `skillIconPublicUrl` for DOM |
| `src/game/combatClass.ts` | `canAttackMonsterBelow` / `isMonsterBelowPlayer` — bow-only below-player attacks |
| `src/game/components/GameControls.ts` | `setPrimaryAttackSkill(skillID)` paints the skill icon inside the attack button |
| `src/game/components/BuffIndicator.ts` | Hosts skill-buff countdown entries (`key: skill_buff.<id>`) |
| `src/game/components/modals/InventoryModal.ts` | `onSkillLearned` callback after skill-book consumption |

No new map scenes or `MAP_REGISTRY` entries needed.

## 4. Backend contract

- REST (all via `skillAPI` / `combatAPI` in `src/network/api.ts`; no dedicated page under `../kageverse-server/docs/api/` exists for the skill module — the business page above and the Go server are the authority):
  - `GET /characters/:id/skills` (`skillAPI.list`) — `skill_points`, `skill_slots[5]`, `skills: SkillDTO[]` (levels, prerequisites, cooldown, mp_cost, `current_stats`, `next_upgrade`).
  - `POST /characters/:id/skills/:skill_id/upgrade` (`skillAPI.upgrade`) — server decides the outcome; returns new level + `skill_points_remaining` + `current_stats`.
  - `POST /characters/:id/skills/:skill_id/cast` (`skillAPI.cast`) — returns `buff` (`expires_at_unix_ms`, stats) for `active_buff`, `mp_remaining`, `cooldown_end_unix_ms`.
  - `PUT /characters/:id/skill-slots` (`skillAPI.assignSlots`) — persists the 5-slot layout; response echoes the canonical `skill_slots`.
  - `POST /characters/:id/attack` (`combatAPI.attack`) — normal swing carries the optional `skill_id` from the selected hotbar slot; damage/crit/XP are server results.
- WS: no skill-specific events. MP changes after a cast and buff-driven stat changes arrive via `char_stats` (`../kageverse-server/docs/api/realtime.md`; FE mirror `src/network/protocol/events.ts`).
- Anything new (e.g. `active_attack` cast payloads) requires a backend change first.

## 5. UI & input

- Overlays: `SkillModal` extends `BaseModal` / `createModalShell` (size `sm`, layer `modal`, status footer); the slot picker is an inline DOM popup inside the shell. The hotbar itself is Phaser GameObjects (HUD layer, depth 105), not DOM.
- Keyboard: the modal registers at `INPUT_LAYER.modal` via `createKeyboardModalTarget`; while any modal is open, gameplay keys (including hotbar 1–5 via Phaser key objects on the scene's keyboard plugin) are not routed to gameplay (`isInputBlockingModalOpen` blocks movement/attack).
- i18n key prefixes (in `locales/en.ts` + `vi.ts`): `skill.modal.*`, `skill.label_*` / `skill.value_*` / `skill.btn_*` / `skill.type_*` / `skill.lock_*` / `skill.slot_*`, `skill.<skill_id>.name` / `.desc`, `skill.cast_success`, `menu.skills`, `api.error.load_skills` / `upgrade_skill` / `cast_skill` / `assign_slot`.

## 6. Client-side state & prediction

- The client computes no skill outcomes: upgrade results, SP balance, cast effects, cooldowns, buff durations, and attack damage all come from REST responses. The FE caches the last `skill_slots` for painting, mirrors `expires_at_unix_ms` as a countdown icon, and refreshes from `skillAPI.list` after any mutation.
- Hotbar visibility derives from `getCurrentCharacter().class` (playerSession cache, refreshed after Bái Sư via `onCharacterUpdated`).
- Env vars: none new.

## 7. Verification plan

1. `npx tsc -b`, `yarn lint`, `yarn build`.
2. Run BE + `yarn dev`. With a pre-class character: no hotbar visible. Complete Bái Sư → hotbar appears and `menu.skills` lists the class's skills.
3. F1 → Skills: strip shows learned vs dimmed skills; select each — detail rows match BE data; press Upgrade on a ready skill → level and SP update from the response.
4. Assign an `active_attack` skill to slot 1; press key **1** → gold ring, attack-button icon swaps; attack a monster → damage floats (server values), `skill_id` sent in the attack request (verify in network tab).
5. Assign an `active_buff` skill; press its key → ✨ countdown appears in the buff panel, HUD MP drops via `char_stats`; re-press during cooldown → backend error toast.
6. Consume a skill book in the inventory → banner plays and the skill lands in the first empty slot.
7. Keyboard-only modal pass (arrows/Enter/F2) and a touch pass (tap slots, attack button).

## 8. Acceptance criteria

- AC-1 The hotbar is hidden for class `none` and appears (5 slots, keys 1–5) once the character has a class, populated from `skill_slots` in `GET /characters/:id/skills`.
- AC-2 The Skills modal shows SP, the full class skill list with learned/unlearned states and level badges, and per-skill detail rows derived solely from `SkillDTO`.
- AC-3 Upgrade is clickable only when `learned && next_upgrade.ready`; success re-renders levels and SP from the backend response.
- AC-4 Assigning a learned active skill to a slot persists via `PUT /skill-slots` and the hotbar repaints from the response without reopening the modal.
- AC-5 Selecting a hotbar slot with an `active_attack` skill makes the normal swing send that `skill_id` to `POST /characters/:id/attack`; with no selection the swing sends `none.basic_swing`.
- AC-6 Pressing a slot with an `active_buff` skill calls `POST .../cast`; success shows a countdown buff icon expiring at the server timestamp, failure shows the backend error in the HUD status.
- AC-7 Skill icons load from `public/assets/game/skills/icon_<id>.png` with a faction-emoji fallback when the file is missing.
- AC-8 Consuming a skill book auto-assigns the granted skill to the first empty slot (server `PUT /skill-slots`) and refreshes the hotbar.
- AC-9 Only bow-class characters can hit monsters positioned below the player (`canAttackMonsterBelow`).

## 9. Out of scope

- Client-side cast of `active_attack` skills via `skillAPI.cast` (attack skills route through `combatAPI.attack` only; `CastSkillResponse.buff` is empty for them by contract).
- Skill reset/respec, drag-and-drop slot reordering, and cooldown overlays on hotbar slots.
- PvP skill behavior and post-MVP factions (katana/fan/dart/kunai — icon mappings exist, no content).
- Combat targeting/auto-attack rules themselves (separate combat feature).
