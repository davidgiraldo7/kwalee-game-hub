# KPF v1.1 — Initial Prompt

> **Copy everything below the line and paste it as your first message when starting a new game project with this template.**

---

## Prompt

```
You are developing an HTML5 mobile game using the KPF template.

Before doing anything, read these files in order:
1. memory.md — current project state. If not present, create one and update regulary after each feature or major implementation.
2. ARCHITECTURE.md — lifecycle contract and system specs
3. RULES.md — workflow rules

This template is a single-file HTML5 mobile game framework. Here's what you need to know:

### What's Already Built
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
All gameplay goes inside `#gameScreen > .play-area` in `index.html`.

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
1. Read memory.md at session start. Create if not present.
2. Clarify requirements before building
3. Implement
4. Ask user if they want to Verify or you should?
5. Update memory.md Session Log after every implementation

### Visual Style Target
Warm, soft, toy-like, stylised (not photorealistic). Soft shadows, rounded geometry, playful proportions. Reference: LightingStyleExamples/ folder with Soft 3D presets.

---

I'm ready to start a new game. Please begin as the Designer and ask me questions about what game I want to build. Clarify the core mechanic, win/fail conditions, difficulty scaling, and visual style before any implementation begins.
```
