# Kageverse Game Engine — Frontend

## Tech Stack
- **Framework**: React + TypeScript + Vite
- **Game Engine**: Phaser 3 (Arcade Physics)
- **Style**: Inline Phaser graphics + native HTML DOM for overlays (chat panel)

## Architecture

### Scene System (Composition Pattern)

Scenes use **component composition** — each feature is a self-contained class, scenes only orchestrate them.

```
src/game/
  components/          ← Reusable game components
    types.ts           ← Shared interfaces (GameComponent, NpcEntry, MapConfig, Tiled types)
    index.ts           ← Barrel export
    MapBackground.ts   ← Background image, colliders, platforms from Tiled JSON
    PlayerController.ts← Player hitbox, sprite, movement, camera follow
    HUD.ts             ← Top bar (HP/MP/level/EXP), status text
    Minimap.ts         ← Minimap camera, frame, blip, UI ignore
    ChatPanel.ts       ← Chat overlay (native HTML DOM), tabs, messages, input
    MenuPanel.ts       ← In-game menu (Phaser container)
    GameControls.ts    ← D-pad, attack button, potion buttons, skill slots
    NpcManager.ts      ← NPC rendering, selection, dialog, auto-move
  scenes/
    BaseMapScene.ts    ← Abstract base: assembles all components, shared update loop
    VillageScene.ts    ← Village map (extends BaseMapScene): onboarding quest logic
    AuthScene.ts       ← Login/register
    CharacterCreateScene.ts
    MainScene.ts       ← Post-onboarding placeholder
```

### Component Contract

Every component follows this interface:

```typescript
interface GameComponent {
    create(): void;      // Called once after scene.create()
    update?(): void;     // Called every frame (optional)
    destroy?(): void;    // Cleanup (optional)
}
```

### Adding a New Map

1. Create `src/game/scenes/YourMapScene.ts` extending `BaseMapScene`
2. Implement required abstract methods:
   - `getMapConfig()` → map ID, asset paths, tiled height
   - `getNpcConfigs()` → NPC list for this map
3. Override optional hooks:
   - `preloadMapAssets()` → load map-specific assets (NPC sprites, etc.)
   - `getMapDisplayName()` → title shown at top of screen
   - `onMapReady()` → map-specific logic (quests, spawners, tutorials)
4. Register scene in `GameConfig.ts`

### Adding a New Component

1. Create `src/game/components/YourComponent.ts` implementing `GameComponent`
2. Export from `src/game/components/index.ts`
3. Wire into `BaseMapScene` (if shared) or specific map scene (if map-specific)

## Rules

- **No `any` types** — use proper interfaces. Tiled data uses `TiledMapData/TiledLayer/TiledObject`.
- **Chat panel uses native HTML DOM**, not Phaser DOMElement (Phaser's DOM system has keyboard capture issues).
- **Scene keys must match** — `super('SceneKey')` in constructor must match `this.scene.start('SceneKey')` calls from other scenes.
- **Components own their lifecycle** — don't reach into component internals from scenes; use public API methods.
- **Phaser keyboard capture** — disable global capture when HTML inputs are focused, re-enable on blur.

## Backend

The backend is a sibling repo at `../kageverse-server/` (Go). Map specs, API contracts, and database schemas are documented there under `docs/`.
