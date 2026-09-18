# Daily Win Streak

Portable Duolingo-style **daily win streak** for HTML5 games. Drop the
`DailyStreak/` folder into a project, wire styles + scripts + an `init` call,
and listen for the host’s level-complete event.

This folder is self-contained (JS, CSS, assets, this doc). Host games only need
to load the scripts/styles and call the public API.

**Integrating into another project?** Copy-paste prompt:
[`INTEGRATION_PROMPT.md`](INTEGRATION_PROMPT.md)

Winning a level ticks **at most once per local calendar day**. Missing a day
resets the streak count (no “streak lost” UI). Day 7 grants a **one-shot sample
animal** reward; the streak number may keep rising after that with no further
rewards.

---

## Folder layout

```
DailyStreak/
├── README.md                      ← this file
├── js/
│   ├── daily-streak-config.js     ← DAILY_STREAK_CFG (event, cycle, timing)
│   ├── daily-streak-data.js       ← DailyStreakRewardId + DAILY_STREAK_DAY7
│   └── daily-streak.js            ← runtime → window.DailyStreak
├── styles/
│   └── daily-streak.css           ← overlay + home pill
└── Assets/
    └── animal_sample.png          ← Day-7 sample prize sprite
```

Asset paths in data are **from the game root** (e.g.
`DailyStreak/Assets/animal_sample.png`), assuming the folder sits next to
`index.html`.

---

## How it works

### Idea

- First win of a local day increments `streakCount` and shows a celebration
  overlay (badge + 7-day track + Continue).
- Cooldown / next tick unlocks at **local midnight**.
- If `lastWinDay` is neither today nor yesterday, the next win resets the count
  to 0 then sets it to 1 (silent — no lost banner).
- Track days 1–6 are cosmetic; **only day 7** unlocks a reward (once).
- Home screen shows a top-left pill (`xN`); tap opens the detail overlay.
- Tapping the gift slot toggles a “New Animal” preview bubble.

### Saved state

`localStorage["daily_streak"]` (no game-name prefix by default):

```js
{
  streakCount: 0,          // consecutive win-days
  lastWinDay: null,        // "YYYY-MM-DD" local, or null
  unlocked: [],            // claimed rewardId strings (Day 7 sample)
  lastCelebratedDay: null  // avoids re-showing celebration same day
}
```

Override the key via `init({ storageKey: "…" })` if needed.

### Day-7 reward

Defined in `daily-streak-data.js`:

```js
DailyStreak.HasUnlockedStreakReward(DailyStreakRewardId.STREAK_ANIMAL_1);
```

Granted automatically the first time `streakCount` reaches `cycleLength` (7).
After that, streak count can keep climbing; the track stays fully filled and
no new rewards are granted.

### Config (`DAILY_STREAK_CFG`)

```js
const DAILY_STREAK_CFG = {
  levelCompleteEvent: "kpf:levelComplete",
  listenToLevelComplete: true,
  cycleLength: 7,
  badgePopMs: 420,
  trackFillMs: 280,
  openFadeMs: 280,
  chestSkin: "Green",   // RewardBox skin: Green | Blue | Red
  giftSizePx: 52        // visual crate scale only (pill/track size unchanged)
};
```

Override any of these in `DailyStreak.init({ … })`.

---

## Public API (`window.DailyStreak`)

| Method | Purpose |
|--------|---------|
| `init({ root?, homeRoot?, storageKey?, getCopy?, onClose?, onStreakFlowDone?, listenToLevelComplete? })` | Mount overlay + home pill, load save. Call once at boot. |
| `OnLevelComplete(detail?)` | Tick today’s streak if needed; show celebration or forward via `onStreakFlowDone`. |
| `ShowStreakPopup({ mode? })` | Open UI. `mode: "home"` (default) or `"celebrate"`. |
| `RefreshHomePill()` | Update `xN` from effective streak (treats a missed day as 0 for display). |
| `GetStreakCount()` | Effective display streak (0 if gap since last win day). |
| `GetState()` | Snapshot for debug / host UI. |
| `HasUnlockedStreakReward(id)` | `true` if Day-7 (or other) id claimed. |
| `Reset()` | Clear save (debug). |
| `isOpen()` / `hide()` | Query / dismiss overlay. |

Aliases: `showStreakPopup`, `refreshHomePill`, `hasUnlockedStreakReward`, etc.

---

## Host wiring (this project)

### Sequencing with ProgressRewards

Streak celebration should appear **before** ProgressRewards on a streak-tick win.
Disable ProgressRewards’ own listener and forward from streak:

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
    if (window.ProgressRewards) ProgressRewards.OnLevelComplete(detail);
  }
});
```

Same-day extra wins skip the streak UI and call `onStreakFlowDone` immediately
so ProgressRewards still runs every clear.

### HTML

```html
<link rel="stylesheet" href="DailyStreak/styles/daily-streak.css" />
<!-- after translations -->
<script src="DailyStreak/js/daily-streak-config.js"></script>
<script src="DailyStreak/js/daily-streak-data.js"></script>
<script src="DailyStreak/js/daily-streak.js"></script>
```

Host still dispatches:

```js
document.dispatchEvent(new CustomEvent("kpf:levelComplete", {
  detail: { completedLevel: finishedLevel }
}));
```

### Suggested localisation keys

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

Pass via `getCopy` or a global `t(key)`. English fallbacks ship in-module.

### Debug

Stretch Block **Delete Progress** should also call `DailyStreak.Reset()`.

---

## UI notes

- Overlay z-index **85** (above ProgressRewards at 80).
- Home pill mirrors settings button safe-area insets, top-**left**.
- Badge / gift / paw are CSS approximations of the mockups; swap Assets later
  without changing the API.
- Day-7 track end uses the same Spine **RewardBox** as ProgressRewards
  (`ProgressRewards/Assets/RewardChests/`, idle anim), with
  `chest_closed.png` as fallback if Spine is unavailable. Skin/size via
  `chestSkin` / `giftSizePx` in config.
- No streak-lost screen by design.

---

## Integration prompt (other projects)

See [`INTEGRATION_PROMPT.md`](INTEGRATION_PROMPT.md) — copy-paste task for an agent
or developer porting this module (includes ProgressRewards sequencing).

---
