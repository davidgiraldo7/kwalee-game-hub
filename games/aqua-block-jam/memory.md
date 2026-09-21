# KPF Project Memory

> Living record of project state. Updated after every feature or major change.
> Append to the Session Log — never erase history.

---

## Project Overview

- **Template:** KPF v1.1.2 — single-file HTML5 mobile game framework (`index.html` + `translations.js`).
- **Game being merged:** "Element Jam" / WaterBlockJam — a Phaser 3 block-jam sliding-block
  puzzle with live flowing liquids. Slide blocks to carve channels so each coloured liquid
  reaches its matching pipe; never let two different liquids touch (they mix and fail).
  Fill every pipe's meter to clear a level.
- **Source game file:** `../WaterBlockJam/index.html` (~2850 lines, Phaser 3 via CDN).

---

## Architecture Facts (verified)

### KPF template (index.html) — key hooks
- Lifecycle: `startGame()` (~L2193), `levelComplete()` (~L2216), `levelFailed()` (~L2253),
  `onOverlayContinue()` (~L2504), `updateGame(dt)` (~L2084).
- Build target: `#gameScreen > .play-area` (L1271).
- `GAME_ID_OVERRIDE` constant (L1422) — currently empty; MUST be set to a unique slug.
- `AUDIO_FILES` registry (L1573); play via `playSound(name)`; keys with "bgm" → Music channel.
- `level` integer at module scope, persisted to `${GAME_ID}_level`.

### Source game (WaterBlockJam) — structure
- Phaser 3 CDN: `phaser@3.90.0` (L422).
- `STYLE` art-style config (L440), `LEVELS` data (L576), `TUNING` (L688).
- `Menu` scene (L952) — the game's own home screen (to be dropped in favour of KPF home).
- `Game` scene (L1170): `preload` (L1173), `create` (L1192), `makeTextures` (L1213),
  gameplay core (L2453–2695), Phaser `update(time, delta)` (L2565).
- Phaser boot `new Phaser.Game(config)` (L2815), config `parent: 'game'`.
- `window.QA_HOOKS` wiring (L2827).
- Has its own chassis (to be superseded by KPF): Web Audio engine + procedural `MUSIC`,
  `state`/`SAVE_KEY` persistence, FTUE flags, own haptics `buzz()`.

### Known integration tensions (to resolve with user)
1. **Game loop:** Phaser runs its own rAF loop; KPF mandates `updateGame(dt)` and forbids
   custom rAF loops. Decision needed on how to reconcile.
2. **Chassis overlap:** menu, audio, persistence, i18n, haptics all exist in both.
3. **Art style:** must not change without explicit user confirmation.

---

## Open Questions

- Confirm which source file(s) to merge (only `WaterBlockJam/index.html` present).
- How to reconcile Phaser's loop with KPF's `updateGame(dt)` rule.
- Which chassis wins for audio / persistence / i18n / home screen (assume KPF).
- `GAME_ID_OVERRIDE` slug value.
- Whether to update art style to KPF Soft 3D presets.

---

## Session Log

### 2026-08-17 — Initial review
- Read ARCHITECTURE.md, RULES.md, translations.js, KPF index.html hooks, and the source game.
- Created this memory.md (was missing).
- Mapped both architectures; identified integration tensions.
- Next: clarify requirements with user before merging.

### 2026-08-17 — WaterBlockJam merged into KPF
- **Decision:** Hybrid integration — Phaser 3.90.0 stays as the renderer; its internal
  loop is stopped on 'ready' and driven solely by KPF's `updateGame(dt)` via
  `game.step(now, dt)`. Satisfies "no independent rAF loop" rule.
- **Injection:** Phaser CDN + a single injected `<script>` (SHIM + transformed game body
  + GLUE `window.WBJ`) inserted between `translations.js` and the main IIFE. Game code is
  NOT extracted to a separate file (single-file rule preserved).
- **Bridges added:**
  - `window.KPF = { haptic, playSound, stopSound, t, quitToHome, get level }` exposed after
    `installBackNavigationGuard()`; wired `WBJ.onLevelComplete=levelComplete`,
    `WBJ.onLevelFailed=levelFailed`.
  - `GAME_ID_OVERRIDE = "water-block-jam"` (localStorage namespace).
  - `updateGame(dt)` → `window.WBJ.step(dt)`.
  - `startGame()` and splash `level===1` branch → `window.WBJ.startLevel(level)`.
- **SHIM replaces** the game's dropped chassis: buzz→KPF.haptic('tap'); sfx→KPF AUDIO_FILES
  (click/move→sfx_button, coin→sfx_popup, hit→sfx_levelfail, level→sfx_levelcomplete,
  win→sfx_welldone, melt→sfx_toggle); MUSIC/fullscreen no-ops; T(key,fb)→KPF.t; FTUE state
  persisted under 'wbj_ftue'.
- **Game transforms:** DEBUG→false; scene create() defers to `WBJ._sceneReady`; in-game
  HUD level label + MENU/pause button hidden; `levelComplete()`→`WBJ.complete()`;
  `mixFail()`→`WBJ.fail()` (with GAMEOVER re-entry guard); `goHome`→`KPF.quitToHome()`;
  all FTUE/liquid strings routed through `T('key','fallback')`.
- **translations.js:** added ftueMoveL1/L2, ftueFlowL1/L2, ftueWater, ftueDrain,
  ftueDrainsL1/L2, ftueMixL1/L2, tapContinue, liqRose/Sky/Mint/Sun to both `en` and `pl`.
- **Verification (HTTP + browser):** splash → gameScreen; Phaser board renders inside
  `.play-area` and scales; FTUE i18n works; KPF "Level Complete!" overlay fires on win;
  continue advances level and loads Level 2 with a fresh board; PL/EN toggle switches shell
  strings. No JS errors.
- **Tooling note:** `node` is NOT on PATH in this sandbox. Ran the assembler via VS Code's
  bundled Electron: `ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" script.js`.
  Static server for testing: `python3 -m http.server`.
- **Backup:** original KPF `index.html` saved to `index.html.bak`.
- Known minor: live mid-level language switch doesn't re-draw canvas FTUE text (redrawn on
  next level load) — acceptable.
