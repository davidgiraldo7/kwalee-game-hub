# Daily Win Streak — Integration Prompt

Copy everything below into a chat with an agent (or hand to a developer) when
adding this module to **another** HTML5 game project.

---

## Task: Integrate the Daily Win Streak System

Copy the entire `DailyStreak/` folder from the Stretch Block repo into this
project’s root (same internal layout: `js/`, `styles/`, `Assets/`, `README.md`).

This is a **portable, self-contained** Duolingo-style daily win streak. The host
loads CSS/JS, calls `init()` once, mounts a home-screen pill, and dispatches a
level-complete event on wins. The module owns its own `localStorage` save and
overlay DOM.

### What it does

- **First win of each local calendar day** increments `streakCount` and shows a
  celebration overlay (badge + 7-day track + Continue).
- **Same-day extra wins** do not re-tick or re-show celebration.
- **Miss a day** → next win silently resets streak to 0 then sets to 1 (no
  “streak lost” UI anywhere).
- **Day 7 only** grants a one-shot sample reward id; streak count may keep rising
  with no further rewards.
- **Home pill** (top-left, `xN`) opens detail view; tap Day-7 crate toggles
  “New Animal” preview bubble.
- Day-7 crate uses the same **Spine RewardBox** as ProgressRewards (idle anim),
  with PNG fallback.

### 1. HTML — load assets

Add to the main game page (paths relative to `index.html`):

```html
<link rel="stylesheet" href="DailyStreak/styles/daily-streak.css" />

<!-- After any i18n helper; Spine required for animated Day-7 crate -->
<link rel="stylesheet" href="ProgressRewards/js/vendor/spine-player.min.css" />

<script src="DailyStreak/js/daily-streak-config.js"></script>
<script src="DailyStreak/js/daily-streak-data.js"></script>
<script src="ProgressRewards/js/vendor/spine-player.min.js"></script>
<script src="DailyStreak/js/daily-streak.js"></script>
```

**Spine dependency:** Day-7 crate references assets under
`ProgressRewards/Assets/RewardChests/` and `ProgressRewards/Assets/chest_closed.png`.
Either copy those ProgressRewards asset paths into the project, or keep the
`ProgressRewards/Assets/` folder available at the same relative paths.

No bundler required — classic `<link>` / `<script>` only.

### 2. Boot — init once

```js
DailyStreak.init({
  root: document.querySelector(".app") || document.body,
  homeRoot: document.getElementById("startScreen"),  // pill mounts top-left here
  getCopy: (key) => t(key),                          // optional; English fallbacks
  storageKey: "daily_streak",                        // default; override if needed
  listenToLevelComplete: true,
  onStreakFlowDone: (detail) => {
    // Forward to next post-win UI (e.g. ProgressRewards) — see §4
  },
  onClose: null
});
```

Refresh pill when returning home:

```js
function showHomeScreen() {
  // … your existing screen switch …
  if (window.DailyStreak) DailyStreak.RefreshHomePill();
}
```

Tune behaviour in `DailyStreak/js/daily-streak-config.js`:

```js
cycleLength: 7,
chestSkin: "Green",    // RewardBox skin: Green | Blue | Red
giftSizePx: 52           // visual crate scale only — does NOT resize track pill
```

### 3. Level-complete hook (host-owned)

When the player **wins a level**, dispatch:

```js
document.dispatchEvent(new CustomEvent("kpf:levelComplete", {
  detail: { completedLevel: finishedLevel }
}));
```

Default event name: `kpf:levelComplete` (configurable in `DAILY_STREAK_CFG`).

With `listenToLevelComplete: true`, the module:

1. Ticks streak if today’s first win (or resets after gap).
2. Shows celebration overlay when ticked.
3. On **Continue**, calls `onStreakFlowDone(detail)`.
4. On same-day repeat wins, skips streak UI and calls `onStreakFlowDone` immediately.

### 4. Recommended — sequence before Progress Rewards

```js
ProgressRewards.init({
  root: document.querySelector(".app") || document.body,
  getCopy: (key) => t(key),
  listenToLevelComplete: false
});

DailyStreak.init({
  root: document.querySelector(".app") || document.body,
  homeRoot: document.getElementById("startScreen"),
  getCopy: (key) => t(key),
  onStreakFlowDone: (detail) => {
    if (window.ProgressRewards) {
      ProgressRewards.OnLevelComplete(detail || {});
    }
  }
});
```

Host dispatches **one** event per win; do not call both modules’
`OnLevelComplete` directly unless you disable auto-listen on one of them.

See `ProgressRewards/INTEGRATION_PROMPT.md` for the progress-reward side.

### 5. Gameplay unlock checks (Day 7)

Reward defined in `DailyStreak/js/daily-streak-data.js`:

```js
if (DailyStreak.HasUnlockedStreakReward(DailyStreakRewardId.STREAK_ANIMAL_1)) {
  // enable animal / cosmetic
}
```

Granted automatically the first time `streakCount` reaches `cycleLength` (7).
No further rewards after that, even if streak continues to 8, 9, …

Do **not** duplicate streak unlock state in the host save.

### 6. Localisation keys (if project has i18n)

| Key | EN example |
|-----|------------|
| `streakFirstWin` | `First Win` |
| `streakMovedUp` | `Your streak just moved up!` |
| `streakMovedUpTitle` | `Streak Up!` |
| `streakNotLit` | `Your Day Streak isn't lit yet!` |
| `streakComePlay` | `Come play a round!` |
| `streakNewAnimal` | `New Animal` |
| `streakClose` | `Close` |
| `streakContinue` | `Continue` |
| `streakHomeAria` | `Daily win streak` |

Missing keys fall back to English.

### 7. Home pill placement

The module injects `.ds-home-pill` into `homeRoot` (expected: start/home screen).
It uses safe-area insets (`top: calc(16px + env(safe-area-inset-top))`, `left: 16px`).

Ensure top-left is free (settings often occupy top-right). No extra host markup
required.

### 8. Manual / debug API

```js
DailyStreak.ShowStreakPopup({ mode: "home" });       // detail from pill tap
DailyStreak.ShowStreakPopup({ mode: "celebrate" });  // force celebration UI
DailyStreak.GetStreakCount();                        // display streak (0 if gap)
DailyStreak.GetState();                              // full snapshot
DailyStreak.Reset();                                 // clear save (debug)
```

Wire debug “delete progress” to `DailyStreak.Reset()` alongside any other resets.

### 9. Constraints — do not

- Rename or remove public API methods on `window.DailyStreak`.
- Invent a parallel save for streak / day-7 unlock.
- Show a “streak lost” banner or modal — resets are silent by design.
- Grant rewards on days 1–6 — Day 7 only, one-shot.
- Re-grant Day-7 reward when streak cycles or count exceeds 7.
- Let ProgressRewards and DailyStreak both auto-listen to the same event without
  sequencing (use `listenToLevelComplete: false` on PR + `onStreakFlowDone`).
- Assume `giftSizePx` changes track pill size — it scales the crate graphic only.

### 10. Layout / z-index

- Overlay z-index: **85** (above ProgressRewards at 80).
- Track nodes stay fixed 36px; crate overflows visually via `giftSizePx`.
- Day keys use **device local midnight** (`YYYY-MM-DD` from local date).

### 11. Verify integration

- [ ] Home shows pill `x0` on fresh save; tap opens “not lit yet” state.
- [ ] First win of day → celebration → Continue → downstream UI (if wired).
- [ ] Second win same day → no streak overlay; downstream UI still runs.
- [ ] Simulate missed day → next win shows streak 1, no lost message.
- [ ] Seven distinct win-days → `HasUnlockedStreakReward` true once only.
- [ ] Day 8+ → count rises, track full, no new unlock.
- [ ] Tap Day-7 crate → New Animal bubble.
- [ ] Debug reset clears pill and save.

### Reference

Full behaviour, data model, and API tables:
`DailyStreak/README.md`
