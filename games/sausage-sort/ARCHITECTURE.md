# Game Template Architecture

> **This file is the contract between the game code and the analytics pipeline.**
> Read it fully before making structural changes.

---

## Required Lifecycle Functions

These functions MUST exist with these exact names. They are the single entry point for each game event and are used by the analytics pipeline for hook injection.

| Function | Purpose | Analytics Hook Injected |
|----------|---------|------------------------|
| `startGame()` | Called when player starts or resumes a level | `window.trackLevelStart(level)` |
| `levelComplete()` | Called when player wins the current level | `window.trackLevelComplete(level)` |
| `levelFailed()` | Called when player loses the current level | — |
| `onOverlayContinue()` | Advances to next level (win) or retries (fail) | — |

**DO NOT** rename, remove, or bypass these functions. All level transitions must flow through them.

The very first call to `startGame()` is also where `window.trackStartTrial()` is injected.

### Terminal Result Overlay Back Lock

The complete/fail result overlay uses a CSS safeguard for Android hardware-back and
external dismissal behavior:

```css
.overlay.result-locked {
  display: flex !important;
}
```

`lockResultOverlay()` adds both the normal visible class and `result-locked` after
the final success or failure popup is shown. `unlockResultOverlay()` must run before
intentional Continue/Retry or screen-transition dismissal. This safeguard must remain
CSS-only and non-observing: do not add a `MutationObserver`, polling, render loop,
timer, or class-restoring event listener to reapply the lock.

### Android Back Navigation Guard

The template consumes Android/browser Back so the game does not minimize while it
is open. `installBackNavigationGuard()` uses the Capacitor `App` back-button event
when that optional plugin is available, and also installs a browser history sentinel
with a `popstate` fallback. Back does not dismiss the result overlay or Settings;
the existing in-game buttons remain responsible for those transitions.

### Performance Pass Gate

When implementation begins for any of the following, ask the user whether they want
to run a performance pass now:

- A second playable level
- Level looping, level generation, or a multi-level progression system
- Continuous animation, physics, or another persistent per-frame system

Use `Performance.md` as the checklist for that pass. If the user chooses not to do
the pass now, ask permission to add a performance-pass TODO and agree when it should
be revisited, such as before release or after the level set is complete. Do not make
performance tradeoffs that reduce visual quality without discussing the balance with
the user.

### Dark Mode / Xiaomi and Redmi Safeguard

The template explicitly preserves its authored light appearance with:

```css
:root {
  color-scheme: only light;
}
```

and a white `theme-color` meta tag in `index.html`. This primarily addresses custom
dark-mode behavior reported on Xiaomi and Redmi Android skins, where the WebView may
recolor the FTUE, Home, Settings, confirmation popup, and gameplay UI.

If a game using this template reports a new dark-mode or color-appearance issue after
this safeguard is added, first revert these two declarations and retest. The issue
may be caused by this Xiaomi/Redmi-focused compatibility change; reverting it is the
first diagnostic step before considering broader theme changes.

---

## Level State

- `level` (integer) — current level number, starts at 1
- Incremented inside `onOverlayContinue()` after a win
- Must be accessible at module scope (the pipeline reads it)
- **Persisted to `localStorage`** under a namespaced key: `${GAME_ID}_level`
- On load, the game reads `${GAME_ID}_level` to resume from the last saved level
- `saveProgress()` is called after every level advancement or skip
- The debug "Delete Progress" button clears `${GAME_ID}_level` and reloads

### GAME_ID and Save Isolation

The template resolves a per-game `GAME_ID` and uses it to namespace storage keys (`${GAME_ID}_level`, `${GAME_ID}_mixer`). This prevents one game from overwriting another game's save data on the same origin.

Resolution order:

1. `GAME_ID_OVERRIDE` constant in `index.html` (recommended for production)
2. `window.GAME_ID` (if injected by host shell)
3. Fallback: derived from `location.pathname` plus a stable hash

If folder names are generic, set an explicit unique ID in `GAME_ID_OVERRIDE` (example: `arrowouttower_2026`).

---

## Boot Sequence (Splash Screen)

On load, the game shows a splash screen (`#splashScreen`) with the Pocket Spark branding:

1. **Splash appears** — solid `#3CC3D3` background
2. **Logo fades in** (100ms delay, 600ms transition)
3. **Logo holds** (~1.5s)
4. **Logo fades out** (600ms transition)
5. **Screen transitions** to either:
   - **Game screen** (level 1) — if the player has never completed level 1 (fresh start)
   - **Home screen** — if the player is returning (level > 1)

**Do not remove the splash screen.** It is a branding requirement.

Replace `Graphic-PocketSpark-PLACEHOLDER.png` with the actual Pocket Spark logo asset.

---

## Where to Build Your Game

All gameplay logic and rendering goes inside the **`.play-area`** element on the game screen.

```
#gameScreen > .play-area
```

You may replace the placeholder text with a canvas, DOM elements, or any rendering approach. Keep it within that container.

---

## Haptics

A `haptic(type)` utility is available globally within the IIFE. It respects the settings toggle and silently no-ops on unsupported devices.

| Type | Capacitor (APK) | Vibration API fallback | Use for |
|------|-----------------|------------------------|---------|
| `"tap"` | Impact Light | 10ms | Button presses, selections, piece placements |
| `"success"` | Notification SUCCESS | 30-50-60-50-100ms | Wins, matches, combos, achievements |
| `"error"` | Notification ERROR | 80-40-80ms | Failures, invalid moves, wrong answers |
| `"heavy"` | Impact Heavy | 40ms | Impacts, explosions, dramatic moments |

### Platform behaviour

- **Capacitor APK (Android/iOS)**: Uses `@capacitor/haptics` plugin via `Capacitor.Plugins.Haptics`. This provides native haptic feedback types (taptic engine on iOS, vibration motor on Android). The plugin must be installed in the Capacitor project (`npm install @capacitor/haptics` + sync).
- **Mobile web (Android Chrome)**: Falls back to `navigator.vibrate()` with the pattern arrays above.
- **iOS Safari / desktop**: Both APIs unavailable — `haptic()` silently no-ops.

**Every player interaction should include a haptic call.** The template already wires haptics into `startGame`, `levelComplete`, `levelFailed`, and `onOverlayContinue`. Add calls for game-specific interactions (piece swaps, tile taps, drag releases, etc.).

---

## Game Loop (60 fps Cap)

The template provides a frame-rate-locked game loop. On high-refresh-rate screens (90/120 Hz) extra frames are skipped to maintain a steady 60 fps — preventing overheating and inconsistent physics.

| Function | Purpose |
|----------|---------|
| `startLoop()` | Starts the rAF loop (called automatically by `startGame()`) |
| `stopLoop()` | Stops the loop (called automatically by `levelComplete()` / `levelFailed()`) |
| `updateGame(dt)` | **Your per-frame logic.** Replace the empty body with rendering/physics. `dt` is milliseconds since last frame (~16.67 ms). |

### Rules

- **All continuous rendering MUST go in `updateGame(dt)`.** Do not spin up your own `requestAnimationFrame` loop.
- Use `dt` for time-based movement (`pos += speed * dt`) so behaviour is consistent regardless of minor frame jitter.
- Never call `startLoop()` or `stopLoop()` yourself — the lifecycle functions handle it.
- If your game is purely event-driven (no continuous animation), leave `updateGame` empty. The loop will idle at negligible cost.

---

## Audio System (Web Audio API)

The template includes a full audio engine based on the Web Audio API (`fetch` + `decodeAudioData` + `AudioBufferSourceNode`). Do **not** use `<audio>` elements — they are unreliable on mobile.

### Adding Sounds

Register files in the `AUDIO_FILES` object at the top of the script:

```js
const AUDIO_FILES = {
  bgm_main: "audio/bgm_main.mp3",
  click:    "audio/click.mp3",
  success:  "audio/success.mp3",
};
```

### Channel Routing

Routing is automatic based on the **key name** or **file path**:
- If either contains `"bgm"` → routed to the **Music** channel
- Everything else → routed to the **SFX** channel

The Music/SFX channels respect the settings toggles (Music on/off, Sound on/off).

### Playback API

| Function | Purpose |
|----------|---------|
| `playSound(name, { loop })` | Play a registered sound. Returns an instance object (or `null` if buffer not loaded yet — it will auto-retry). |
| `stopSound(instance)` | Stop a playing instance. |
| `playBackgroundAudio()` | Starts all `"music"` channel sounds as looping BGM. Called on first user tap. Won't stack. |
| `stopBackgroundAudio()` | Stops all BGM instances. |

### Common Pitfalls

1. **Must serve over HTTP** — `fetch()` does not work on `file://` protocol. Use a local server (`python3 -m http.server` or equivalent).
2. **AudioContext requires a user gesture** — The template handles this by starting BGM on the first `pointerdown` event. If you need to play a sound earlier, it will be queued until the context resumes.
3. **Channel routing checks the key name AND file path** — Name your BGM entries with `bgm` in the key (e.g. `bgm_level`, `bgm_menu`) so they route to Music and respect the Music toggle.
4. **Preloading** — `preloadAllAudio()` is called on page load. Files are fetched and decoded immediately so playback is instant when triggered.
5. **Spaces in filenames** — Work fine over HTTP; the browser handles URL encoding. No need to manually encode.

### Debug Mixer

A debug mixer panel (🔊 button) lets you adjust volumes, mute/solo channels and individual sounds live. Settings are only persisted when you press **Save** (stored in `localStorage` under `kpf_mixer`).

### Debug Feature Containment

Any debug UI or debug-only control requested during development must be added
inside the `.debug` container/class. This includes debug buttons, panels, meters,
test controls, and any related debug-only interface. The release pipeline hides
`.debug`, so do not place debug features outside it or repurpose production UI for
debug behavior.

### Background Audio Lifecycle

When a game adds BGM, it must stop active background audio when the app or page is
minimized/backgrounded and resume it only when the app returns and Music is still
enabled. The template's lifecycle guard uses browser visibility/page lifecycle events
and the optional Capacitor `App` state event; it does not affect SFX or games without
BGM.

If a Music/SFX bug is reported after this lifecycle guard is added, such as pausing,
stuttering, duplicated playback, failed resume, or another audio glitch, first ask
the user to revert the background-audio lifecycle changes and retest. Explain that
this may restore the original bug where BGM continues playing in the background; that
background-play bug can then be solved separately with a more targeted audio design.

### Loudness Meter

A debug loudness meter (📊 button, pinned to the left side) shows:
- Short-term LUFS (3-second gated window)
- Integrated LUFS (gated running average)
- True Peak dBTP (4× oversampled)

Uses approximate ITU-R BS.1770 K-weighting. Useful for balancing audio levels before shipping.

---

## Do Not Modify

The following systems are shared UI infrastructure. Do not alter them:

- **Screen transitions** (`showScreen`, `fadeBlack`)
- **Result overlay** (`#overlay`, `overlayCard`, confetti, fireworks)
- **Settings menu** (`#settingsOverlay`)
- **Home/start screen** (`#startScreen`)
- **Localisation system** (`translations.js`, `t()`, `data-i18n`)
- **Orientation lock** (`lockPortrait()`, Capacitor ScreenOrientation call)

If you need custom UI (e.g. a score counter, move counter, timer), add it as a new element inside `#gameScreen` — don't repurpose existing elements.

---

## Orientation — Portrait Only (Force-Locked)

**The template is portrait-only and must NEVER rotate to landscape.** Orientation is force-locked so the screen never changes, rather than showing a "rotate your device" prompt.

### How it's enforced

1. **JS `lockPortrait()` (runs on load).** Uses `screen.orientation.lock("portrait-primary")` (Standard Screen Orientation API) which works inside Capacitor's webview without requiring fullscreen. Also calls the Capacitor `ScreenOrientation` plugin if installed.
2. **Native manifest (required for APK/iOS).** The Android `AndroidManifest.xml` must set `android:screenOrientation="portrait"` on the Activity, and iOS must restrict supported orientations to portrait only. This ensures the OS shell itself never rotates.

Between these two layers the device physically cannot switch to landscape.

### Rules

- **Do not** add landscape-specific layouts or any code that unlocks/rotates orientation.
- **Do not** remove `lockPortrait()` or the Capacitor `ScreenOrientation.lock()` call.
- Design all gameplay for a **portrait aspect ratio** only.
- For Capacitor builds, install `@capacitor/screen-orientation` for the most reliable lock:
  ```bash
  npm install @capacitor/screen-orientation
  npx cap sync
  ```

---

## Capacitor APK Build — Edge-to-Edge (No Bars)

By default, Capacitor's Android WebView doesn't extend under the system status bar (top) or navigation bar (bottom), leaving visible coloured strips. The template handles the JS/CSS side automatically; the native project needs the settings below.

### What the template already does

- `<meta name="viewport" ... viewport-fit=cover>` — tells the browser to extend into safe areas.
- `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` — pushes interactive elements (header, home bar, debug panel) inward so they aren't hidden behind notches or system bars.
- JS calls `StatusBar.setOverlaysWebView({ overlay: true })` and sets a transparent background if the `@capacitor/status-bar` plugin is present.

### Required native-side config

1. **Install the StatusBar plugin** (handles the top bar):
   ```bash
   npm install @capacitor/status-bar
   npx cap sync
   ```

2. **capacitor.config.ts** (or `.json`) — set the WebView background and enable edge-to-edge for the bottom navigation bar:
   ```ts
   const config: CapacitorConfig = {
     // ...
     android: {
       backgroundColor: "#FFFFFF",
     },
   };
   ```

3. **Android theme** (`android/app/src/main/res/values/styles.xml`) — make system bars transparent so the WebView draws behind them:
   ```xml
   <style name="AppTheme" parent="Theme.AppCompat.NoActionBar">
       <item name="android:windowDrawsSystemBarBackgrounds">true</item>
       <item name="android:statusBarColor">@android:color/transparent</item>
       <item name="android:navigationBarColor">@android:color/transparent</item>
       <item name="android:enforceNavigationBarContrast">false</item>
       <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
   </style>
   ```
   On Capacitor 6+, you may instead add `"edgeToEdge": true` under `android` in your config.

4. **iOS** — no extra config needed; `viewport-fit=cover` + safe-area insets handle it.

After these steps the WebView fills the entire screen and the template's `env()` padding keeps content clear of notches/home indicators.

---

## File Structure

```
KPF/
├── index.html              ← Single-file game (inline JS + CSS)
├── translations.js         ← Editable text / localisation strings
├── ARCHITECTURE.md         ← This file (contract spec)
├── .github/
│   └── copilot-instructions.md  ← AI assistant rules
├── audio/                  ← Sound files (mp3/ogg/wav)
└── [asset files]           ← PNGs for icons, logo placeholder
```

---

## Rules for Game Development

1. **Single file** — Keep all game logic in `index.html` (inline `<script>`). No bundlers, no external JS frameworks (CDN Libs are allowed)
2. **Level progression** — Call `levelComplete()` when the player wins. Call `levelFailed()` when they lose. That's it.
3. **No external dependencies** — CDN libraries (Three.js, Matter.js, etc.) are fine. No npm/node build steps.
4. **Touch-first** — All interactions must work with touch. Mouse is a bonus.
5. **Responsive** — The `.app` container handles framing. Your game scales within `.play-area`.
6. **Level variable** — Use the existing `level` variable for difficulty scaling. Don't create a parallel counter.

---

## Analytics Pipeline Summary

After development is complete, the game goes through an automated pipeline that:

1. Injects SDK scripts into `<head>`
2. Searches for `startGame()`, `levelComplete()`, and related patterns
3. Inserts `window.trackStartTrial()`, `window.trackLevelStart(level)`, `window.trackLevelComplete(level)` calls

The pipeline uses exact text pattern matching. If the lifecycle functions are renamed or the level logic is scattered across multiple locations, injection will fail.
