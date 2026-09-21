# KPF v1.1 — Merging Prompt

> **Copy everything below the line and paste it as your first message when starting a new game project with this template.**

---

## Prompt

```
You are merging my game into the KPF template.

Before doing anything, read these files from the KPF folder in the following order:
1. memory.md — current project state. If not present, create one and update regulary after each feature or major implementation.
2. ARCHITECTURE.md — lifecycle contract and system specs
3. RULES.md — workflow rules

This template is a single-file HTML5 mobile game framework. Here's what you need to know:

### What's Already Built in the KPF
- Splash screen → Home screen → Game screen flow
- Level progression with localStorage persistence
- 60fps-capped game loop via `updateGame(dt)`
- Audio engine (Web Audio API) with Music/SFX channels, debug mixer, loudness meter
- Haptics system (tap/success/error/heavy)
- i18n (English + Polish) via translations.js
- Win/Fail overlays with confetti/fireworks VFX
- Settings menu with audio/haptic toggles
- Portrait lock, edge-to-edge, Android back swallowed
- Debug panel (level skip, complete, fail, delete progress, language toggle)

### Where to Build
Merge all the users gameplay code inside `#gameScreen > .play-area` in `index.html`. -> Ask the user which files need to be implemented into the KPF template.

### Critical Rules
- SINGLE FILE: All code in index.html (inline JS + CSS). No bundlers. CDN libs OK.
- LIFECYCLE: Never rename/remove `startGame()`, `levelComplete()`, `levelFailed()`, `onOverlayContinue()`, `updateGame(dt)`
- GAME LOOP: All per-frame logic in `updateGame(dt)`. Use `dt` for movement. Never create your own rAF loop.
- HAPTICS: Every interaction needs `haptic()` — tap, success, error, or heavy.
- i18n: Every visible string goes in translations.js (en + pl). Use `t("key")` or `data-i18n="key"`.
- AUDIO: Register in `AUDIO_FILES`, play with `playSound(name)`. Keys with "bgm" → Music channel.
- PERFORMANCE: Object pools, no allocation in loops, cache DOM dimensions, no setInterval.
- ASSETS: Write full literal paths — never concatenate folder variables.
- UNIQUE GAME ID: Always set `GAME_ID_OVERRIDE` to a unique, descriptive slug for the game being built (e.g. "bubble-pop", "color-match"). Never leave it as an empty string. This prevents localStorage collisions between games built from this template.
- DO NOT MODIFY: Splash, overlays, settings, screen transitions, localisation system structure.

### Workflow
1. Clarify requirements before building
2. Merge my game file into the project cleanly following the above rule.
3. Ask user if they want to Verify or you should?
4. Update memory.md Session Log after every implementation

### Visual Style Target
Ask the user if they would like to update the art style to fit the warm, soft, toy-like, stylised (not photorealistic). Soft shadows, rounded geometry, playful proportions. Reference: LightingStyleExamples/ folder with Soft 3D presets. DO NOT CHANGE THE ART STYLE WITHIOUT CONFIRMATION!

---

I'm ready to start a merge your game. Please begin by understanding the current game and its architecture, classify it to cleanly inject in the template and then merge both files so my game uses this template now.
```
