# Sausage Sort — Project Memory

## Game Overview
Physics-based puzzle game: tap sausages in a box to release them onto a conveyor belt that sorts them into matching colored buns. 10 hand-tuned levels with increasing difficulty (more colors, longer sausages, tighter belt capacity).

## Architecture
- **Physics**: Rapier 2D WASM via CDN dynamic import, wrapped in a Matter.js-compatible shim
- **Rendering**: Canvas 2D with virtual coordinate space (500×1000), soft-body sausage chains
- **KPF Integration**: Game logic runs inside `updateGame(dt)` at 60fps

## Key Decisions
- `GAME_ID_OVERRIDE`: `"sausage-sort"`
- Game's `level` variable renamed to `levelData` (KPF uses `level` for the integer level number)
- Game's `canvas` renamed to `gameCanvas`; context remains `ctx`
- Physics shim objects prefixed with `SS` (SSBody, SSWorld, SSComposite, SSConstraint, SSQuery) to avoid future collisions
- Rapier loads during splash via `Promise.all` — start screen only appears after physics engine is ready
- Game state uses `GAME_STATE` ("idle"/"filling"/"playing"/"finished") — win/lose call KPF `levelComplete()`/`levelFailed()`
- All 10 levels are cycled via `currentLevel = (level - 1) % LEVELS.length`
- Art style unchanged from original (soft gradient background, cylindrical sausage shading, stadium conveyor belt)
- Haptic feedback added on sausage tap; win/lose haptics handled by KPF lifecycle

## Session Log

### 2026-08-17 — Initial Merge
- Merged SausageSort.html into KPF template index.html
- Adapted all game code to live inside the KPF IIFE
- Canvas placed inside `.play-area` with absolute positioning
- Removed game's own start screen, win/lose overlays, and rAF loop
- Added resize handler using play-area dimensions
- Updated translations.js with `gameTitle` key (en + pl)
- Splash sequence waits for Rapier to finish loading before showing start screen

## Open Items
- Game logo placeholder image (`Graphic-GameLogo-PLACEHOLDER.png`) not yet replaced with a Sausage Sort logo
- No game-specific audio (SFX/BGM) added yet — only KPF template sounds are active
- Art style review not yet discussed with user
- Performance pass not yet triggered (game has physics + canvas rendering per frame)
