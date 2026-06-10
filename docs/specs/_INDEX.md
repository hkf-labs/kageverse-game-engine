# Spec Index

Master tracker for feature specs. Every spec gets a row here in the same PR that creates it.

## Naming

- File: `FEAT-<DOMAIN>-<NNN>_<slug>.md` (e.g. `FEAT-FORGE-001_equipment_upgrade.md`).
- `<NNN>` is sequential per domain, starting at `001`.
- The same `FEAT-<DOMAIN>-<NNN>` ID links the spec to its plan (`docs/plans/`) — never reuse an ID.
- IDs are shared semantics with the backend repo (`../kageverse-server/docs/specs/_INDEX.md`); a cross-repo feature may use the same ID on both sides.

## Domain codes

| Code | Screen / feature area | Code | Screen / feature area |
|---|---|---|---|
| AUTH | login / register screen | QST | quests |
| CHAR | character creation & stats | SKL | skills & hotbar |
| MAP | world maps, portals, minimap | SHOP | shop & consumables |
| RT | movement & realtime presence | FORGE | equipment upgrade |
| COMB | combat, death, loot | CHAT | chat |
| INV | inventory & equipment | UI | HUD, controls, menus, settings |
| NPC | NPC interaction | CORE | infra / cross-cutting |

## Status lifecycle

`Draft` → `Approved` → `Implemented` → `Shipped`. A spec is `Approved` only after human sign-off; code work starts from `Approved`. The specs below were reverse-engineered from the shipped MVP code (2026-06-10), so they enter at `Implemented`.

## Specs

| Feature ID | Spec | Status | Plan |
|---|---|:---:|:---:|
| FEAT-AUTH-001 | [Login / register screen](FEAT-AUTH-001_login_register_screen.md) | Implemented | [✓](../plans/FEAT-AUTH-001_login_register_screen.md) |
| FEAT-CHAR-001 | [Character creation & onboarding](FEAT-CHAR-001_character_creation_onboarding.md) | Implemented | [✓](../plans/FEAT-CHAR-001_character_creation_onboarding.md) |
| FEAT-MAP-001 | [World maps & portals](FEAT-MAP-001_world_maps_and_portals.md) | Implemented | [✓](../plans/FEAT-MAP-001_world_maps_and_portals.md) |
| FEAT-RT-001 | [Movement & presence](FEAT-RT-001_movement_and_presence.md) | Implemented | [✓](../plans/FEAT-RT-001_movement_and_presence.md) |
| FEAT-COMB-001 | [Combat, death & boss](FEAT-COMB-001_combat_death_and_boss.md) | Implemented | [✓](../plans/FEAT-COMB-001_combat_death_and_boss.md) |
| FEAT-COMB-002 | [Loot drops & pickup](FEAT-COMB-002_loot_drops_and_pickup.md) | Implemented | [✓](../plans/FEAT-COMB-002_loot_drops_and_pickup.md) |
| FEAT-NPC-001 | [NPC interaction](FEAT-NPC-001_npc_interaction.md) | Implemented | [✓](../plans/FEAT-NPC-001_npc_interaction.md) |
| FEAT-QST-001 | [Quest tracking](FEAT-QST-001_quest_tracking.md) | Implemented | [✓](../plans/FEAT-QST-001_quest_tracking.md) |
| FEAT-INV-001 | [Inventory & equipment](FEAT-INV-001_inventory_and_equipment.md) | Implemented | [✓](../plans/FEAT-INV-001_inventory_and_equipment.md) |
| FEAT-FORGE-001 | [Equipment upgrade (Hoshi)](FEAT-FORGE-001_equipment_upgrade.md) | Implemented | [✓](../plans/FEAT-FORGE-001_equipment_upgrade.md) |
| FEAT-SHOP-001 | [Shop & food buffs](FEAT-SHOP-001_shop_and_food_buffs.md) | Implemented | [✓](../plans/FEAT-SHOP-001_shop_and_food_buffs.md) |
| FEAT-SKL-001 | [Skills & hotbar](FEAT-SKL-001_skills_and_hotbar.md) | Implemented | [✓](../plans/FEAT-SKL-001_skills_and_hotbar.md) |
| FEAT-CHAT-001 | [Chat](FEAT-CHAT-001_chat.md) | Implemented | [✓](../plans/FEAT-CHAT-001_chat.md) |
| FEAT-UI-001 | [HUD, controls & menus](FEAT-UI-001_hud_controls_and_menus.md) | Implemented | [✓](../plans/FEAT-UI-001_hud_controls_and_menus.md) |
