# Plan: Skills & hotbar

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-SKL-001 |
| Linked spec | `docs/specs/FEAT-SKL-001_skills_and_hotbar.md` |
| Status | Done |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Goal

A server-authoritative skill system UI: a Skills modal for browsing/upgrading/slot-assigning class skills, a 5-slot Phaser hotbar that picks the primary attack skill and casts buff skills, icon plumbing with graceful fallbacks, and skill-book auto-assignment (spec AC-1…AC-9).

## 2. Approach

Split DOM and world concerns: the browsing/upgrading UI is a `BaseModal`/`createModalShell` overlay (consistent with every other modal, keyboard-routable through `inputFocus.ts`), while the hotbar is a plain `GameComponent` of Phaser GameObjects because it must coexist with gameplay input and the HUD every frame. The two stay decoupled and sync through `BaseMapScene`: the modal's `onSlotsChanged` callback refreshes the hotbar without an extra round-trip pattern, and the hotbar's callbacks (`onPrimaryChanged`, `onSlotPressed`) feed `GameControls` and the cast flow. Skill semantics live entirely on the backend — the FE distinguishes only `active_attack` (becomes the swing's `skill_id`) from `active_buff` (immediate `cast`), and renders whatever `SkillDTO` says. Icons use a two-layer strategy (PNG over faction emoji) so missing art never breaks the UI.

## 3. Steps

1. **API surface** — `src/network/api.ts`: `SkillDTO` (+`NextUpgradeDTO`, `PrereqMissingDTO`, `SkillFaction`, `SkillType`), `ListSkillsResponse`, `UpgradeSkillResponse`, `AssignSlotsResponse`, `CastSkillResponse` (+`ActiveSkillBuffDTO`); `skillAPI.list/upgrade/cast/assignSlots`. `AttackRequest.skill_id` on `combatAPI.attack` carries the hotbar selection. `SkillLearnedEffect` inside `UseInventoryEffects` for skill books.
2. **Icon plumbing** — `src/game/skillIcon.ts`: `skillTextureKey` / `skillIconAssetPath` / `skillIconPublicUrl` (dots → underscores), `SKILL_ICON_FILE_IDS` (24 sword/bow icons) + `registerSkillIconPreloads` for scene preload, and `ensureSkillIconTexture` (HTMLImage → TextureManager, deduped via a promise map) for post-create loading.
3. **Class rule helper** — `src/game/combatClass.ts`: `canAttackMonsterBelow(playerClass)` (bow only) + `isMonsterBelowPlayer` used by the combat/targeting path.
4. **Skill modal** — `src/game/components/modals/SkillModal.ts`: shell (size `sm`, layer `modal`, status footer); SP row inserted above the body; horizontal icon strip (48 px cells, level badges, dimmed unlearned); detail pane built from `SkillDTO` rows (type, levels, prereqs, MP, cooldown, range, `current_stats`, next upgrade); action bar with Upgrade (gated on `next_upgrade.ready`) and Assign-slot (learned non-passive); inline 5-button slot picker popup with click-outside dismiss; `handleUpgrade` / `assignToSlot` re-render from responses; localized names via `skill.<id>.name` with raw-key fallback.
5. **Modal keyboard** — `navigate()` (strip ⇄ actions zones with scroll-into-view), `confirm()`; registered in `BaseMapScene.collectInputTargets()` at `INPUT_LAYER.modal` and counted in `isInputBlockingModalOpen()`.
6. **Hotbar** — `src/game/components/SkillHotbar.ts`: container bottom-center (depth 105, resize-aware), 5 slots (bg image, selection ring, icon image/emoji text, key + level labels); keys 1–5 via `keyboard.addKey`; pointer-down screen hit-testing (container children don't receive pointers reliably); `refresh()` pulls `skillAPI.list`, hides the bar while `classLocked` (`class === 'none'`); `getPrimaryAttackSkillID()` returns the selection only when it is `active_attack`; generation-counted async icon loading.
7. **Scene wiring** — `src/game/scenes/BaseMapScene.ts`: construct `SkillModal` (`onSlotsChanged` → `skillHotbar.refresh()`) and `SkillHotbar`; `setOnPrimaryChanged` → `GameControls.setPrimaryAttackSkill` (icon inside the attack button); `setOnSlotPressed` → `handleCastSkill` (`skillAPI.cast`; on `buff` → `BuffIndicator.setBuff({key: 'skill_buff.<id>', expiresAt})` + `skill.cast_success`); `getSwingSkillID()` (selected attack skill or `none.basic_swing`) passed to `MonsterManager.attackNearest`; menu entry `menu.skills` opens the modal; `setOverlayUIVisible` hides the bar behind modals; Bái Sư `onCharacterUpdated` re-runs `refresh()` to unlock the bar.
8. **Skill-book flow** — `InventoryModal` `onSkillLearned(skillIDs)` → `BaseMapScene.handleSkillLearned`: re-list skills, auto-assign the new skill to the first empty slot via `skillAPI.assignSlots` (best-effort), `setSlots` + `refresh()` on the hotbar, then `showSkillLearnedBanner` placeholder animation.

## 4. Assets & i18n

- Assets: `public/assets/game/skills/icon_<skill_id>.png` (24 files matching `SKILL_ICON_FILE_IDS`) and the hotbar/attack-button textures (`skill_slot_empty`, `btn_attack`) — provided by the user; faction emoji fallback covers missing files.
- i18n (`locales/en.ts` + `vi.ts`): `skill.modal.*` (title, sp_label, loading/upgrading/assigning, success + error keys), `skill.label_*` / `skill.value_*` / `skill.type_*` / `skill.btn_*` / `skill.lock_*` / `skill.slot_*`, per-skill `skill.<id>.name` / `.desc` bundles, `skill.cast_success`, `menu.skills`, `api.error.load_skills/upgrade_skill/cast_skill/assign_slot/attack`.
- Env vars: none added.

## 5. Server-authority checklist

- [x] No combat / loot / XP / upgrade results computed client-side — upgrade levels, SP, cast buffs/cooldowns, slot layouts and attack damage are all taken from REST responses; the FE only paints them.
- [x] WS `move` stays inside the throttle (`BaseMapScene.sendMoveIfNeeded`); no idle sends (skills add no WS traffic).
- [x] FE mirror `src/network/protocol/events.ts` synced with `realtime.md` — no protocol change; post-cast MP sync rides the existing `char_stats` event.

## 6. Definition of Done

- [x] All spec acceptance criteria pass in a manual game pass.
- [x] `npx tsc -b` + `yarn lint` + `yarn build` green.
- [x] Docs synced per `STANDARDS.md` §7.1.
- [ ] Spec status moved to `Implemented`; `_INDEX.md` rows updated. *(Spec is Implemented; `_INDEX.md` rows are added in a follow-up indexing pass.)*
