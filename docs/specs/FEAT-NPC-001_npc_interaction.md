# Spec: NPC Interaction

## 0. Metadata

| Field | Value |
|---|---|
| Feature ID | FEAT-NPC-001 |
| Status | Implemented |
| Linked plan | `docs/plans/FEAT-NPC-001_npc_interaction.md` |
| Game-design source | `../kageverse-server/docs/business/npcs/README.md` + per-NPC pages (e.g. `village-chief-genji.md`, `healer-ayame.md`, `enhancer-hoshi.md`, `transporter-tobi.md`) |
| Created / Updated | 2026-06-10 / 2026-06-10 |

## 1. Summary

Every map scene spawns its NPCs from a per-scene config. The player can select an NPC, walk up (or auto-walk) and interact to open an action menu fetched live from the backend (talk, shop, upgrade, teleport, quests, quiz, class initiation). NPCs render quest-availability badges (❗ offer / ❓ turn-in) so the player always knows where to go next.

## 2. Player-facing behavior

- **Spawning.** Each scene declares NPCs (sprite key, display name, x position, optional BE `templateId`) via `getNpcConfigs()`. NPCs stand grounded on the platform with a yellow name label; a hidden quest badge sits above the name.
- **Selection.** The nearest NPC within 60 px is auto-selected by the unified world target (name turns green, ring + arrow indicator). Tap/click an NPC sprite selects it manually. The ⇄ satellite touch button (or scene cycle-target callback) cycles through NPCs visible on camera.
- **Interact.** Keyboard: single **Enter** (double-tap Enter toggles auto-attack instead). Touch: the main attack button (`onInteract`). If the selected NPC is out of range, the player auto-walks to it and the menu opens on arrival.
- **Menu.** A horizontal Phaser canvas `ActionMenu` opens titled with the NPC name. With a `templateId`, a loading row shows while the BE menu is fetched; entries appear in order: quest turn-ins (🏆), quest accepts (❗), pending quiz steps (📝), "Choose class" at a principal during the initiation quest (🎓), then BE-declared actions (talk, shop, teleport, …), then Leave (🚪). Without `templateId` (or on fetch error) a mock fallback menu shows talk / quests / shop placeholders.
- **Talk** shows a typewriter chat bubble above the NPC (`NpcChatBubble`, 35 ms/char, lingers 2.5 s) and silently ticks any pending `talk_npc` quest objective.
- **Menus open other features:** `buy_shop` / `browse_weapons|apparel|jewelry` (with class/slot submenus) → `ShopModal`; `upgrade_equipment` → `HoshiUpgradeModal`; `view_quests` → `QuestLogPanel`; `teleport` → destination submenu that starts the target scene; `cancel_main_quest` / `save_coordinates` → confirm + REST call; `open_stash` / `explore_cave` → "coming soon". Pre-class players are rejected early from apparel/jewelry submenus.
- **Quest accept/turn-in** from the menu call the quest API; irreversible quests (e.g. initiation `set_class`) show a red `ConfirmDialog` first. Turn-in can grant rewards (floater), cascade level-up, and trigger the end-MVP overlay.
- **Badges** refresh on every quest cache update: ❓ (turn-in, priority) or ❗ (offer) above the NPC name.

## 3. Affected scenes & components

| Unit | Change |
|---|---|
| `src/game/scenes/BaseMapScene.ts` | Wires `NpcManager` deps; unified world target auto-select; Enter → `handleInteract()`; auto-move arrival check; badge refresh on quest updates |
| `src/game/scenes/VillageScene.ts` (and every map scene) | Implements `getNpcConfigs()`; preloads NPC sprites in `preload()` |
| `src/game/components/NpcManager.ts` | Core component: spawn, selection, badges, interaction, BE/mock menus, all action handlers |
| `src/game/components/NpcChatBubble.ts` | Typewriter speech bubble anchored above the NPC sprite |
| `src/game/components/ActionMenu.ts` | Phaser canvas menu used for the NPC dialog + submenus |
| `src/game/components/types.ts` | `NpcConfig` / `NpcEntry` shapes |
| `src/features/npcs/{types,mockNpcGateway,index}.ts` | Mock NPC template gateway (`MOCK_NPC_TEMPLATES`, `getMockNpcTemplate`) — legacy/mock path |

New `GameComponent` classes needed: none (all exist). No new map scenes.

## 4. Backend contract

- REST (`npcAPI` / `questAPI` in `src/network/api.ts`; doc: `../kageverse-server/docs/api/npc/npc.md`):
  - `GET /maps/:mapId/npcs/:templateId?character_id=` → `NpcInteractResponse` (actions, dialogue key, teleport destinations, offered/turn-in quest IDs, quest warnings)
  - `POST /maps/:mapId/npcs/:templateId/talk` — tick `talk_npc` objective (204)
  - `POST /maps/:mapId/npcs/:templateId/cancel-main-quest`
  - `POST /maps/:mapId/npcs/:templateId/save-coordinates`
  - `GET /characters/:id/quests/npc-availability` — batch badge data
  - `POST /characters/:id/quests/:questId/accept` and `/turn-in` (optional `class_id` for initiation)
- WS: none emitted by this feature; quest state after accept/turn-in arrives via `quest_progress` (see FEAT-QST-001). General WS doc: `../kageverse-server/docs/api/realtime.md`.
- Shop purchases from NPC menus follow `../kageverse-server/docs/api/shop/shop.md` (owned by the shop feature).

## 5. UI & input

- Overlays: NPC menu is the Phaser canvas `ActionMenu` (pre-dates the DOM rule; canvas sits under HTML modals, so it is never used while a modal is open). Confirmations use `ConfirmDialog`; shop/upgrade/quest log are `BaseModal` DOM overlays.
- Keyboard: `ActionMenu` routes through `INPUT_LAYER.actionMenu` (100) in `src/game/components/inputFocus.ts`; while open, movement is blocked and arrows/Enter/ESC navigate the menu via `BaseMapScene.routeBlockedInput`.
- i18n: `npc.*` prefixes in `locales/en.ts` + `locales/vi.ts` — `npc.name.*`, `npc.action_*`, `npc.mock.*`, `npc.run.*`, `npc.quest.*`, `npc.quiz.*`, `npc.teleport.*`, `npc.weapon.*`, `npc.apparel.*`, `npc.jewelry.*`, `npc.initiation.*`, `npc.dialogue.*`, `npc.cancel_quest.*`, `npc.save_coordinates.*`. Known deviation: `DIALOGUE_TEXT_VI` in `NpcManager.ts` hardcodes a few VN dialogue lines (TODO in code to move to i18n).

## 6. Client-side state & prediction

- Nothing is predicted. Menus, quest availability, teleport destinations, accept/turn-in outcomes all come from the server. Client-only state: selection, auto-move target X, badge/availability cache, last-menu cache for quiz "back".
- No new env vars.

## 7. Verification plan

`npx tsc -b` + `yarn lint` + `yarn build`, then with backend running:

1. Enter Village (`village_001`): all 7 NPCs spawn grounded with names; Genji shows ❗ on a fresh character.
2. Walk near an NPC → auto-select (green name + ring). Press Enter far away → auto-walk then menu opens.
3. Talk → typewriter bubble. Open shop / upgrade / quest log / teleport from the menu entries.
4. Accept and turn in a quest at Genji; verify reward floater and badge change.
5. Kill backend → interact shows error status + mock fallback menu.

`VITE_GAME_DEBUG=true` helps verify the 60 px interact range visually.

## 8. Acceptance criteria

- AC-1 Every NPC in `getNpcConfigs()` spawns with sprite, name label, and (if `templateId` set) a quest badge slot.
- AC-2 The nearest NPC within 60 px is auto-selected; clicking a sprite or the ⇄ button changes selection.
- AC-3 Enter on a selected in-range NPC opens its menu; out of range triggers auto-walk and opens on arrival.
- AC-4 NPCs with `templateId` show the BE menu (quest hooks first, Leave last); without it or on error, the mock menu shows.
- AC-5 Talk shows the chat bubble and POSTs `/talk` only when a pending `talk_npc` objective matches this NPC.
- AC-6 Menu actions open the correct feature: shop (with class/slot filters), Hoshi upgrade, quest log, teleport scene switch.
- AC-7 Quest accept with a `quest_warnings` entry shows a confirm dialog before calling the API; turn-in shows rewards and applies level-up if returned.
- AC-8 Badges show ❓ for turn-in (priority over ❗ offer) and hide when neither applies; API failure hides all badges without crashing.

## 9. Out of scope

- Shop purchase/sell flow internals (`ShopModal`), Hoshi upgrade mechanics, quest log UI (FEAT-QST-001).
- NPC movement/AI (NPCs are static), stash (`open_stash` is a placeholder), cave exploration (post-MVP).
- Dialogue trees beyond the single greet line.
