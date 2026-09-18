# Progress Reward System

Portable milestone-unlock UI for HTML5 games. Drop the `ProgressRewards/` folder
into a project, wire a few tags + an init call, and trigger the popup from a
button or level-complete hook.

This folder is self-contained (JS, CSS, assets, editor, this doc). Host games
only need to load the scripts/styles and call the public API.

**Integrating into another project?** Copy-paste prompt:
[`INTEGRATION_PROMPT.md`](INTEGRATION_PROMPT.md)

---

## Folder layout

```
ProgressRewards/
├── README.md                      ← this file
├── ProgressRewardsEditor.html     ← author enum + tiers
├── js/
│   ├── progress-rewards-config.js ← PROGRESS_REWARDS_CFG (show mode, timing)
│   ├── progress-rewards-data.js   ← ProgressRewardId + PROGRESS_REWARD_TIERS
│   └── progress-rewards.js        ← runtime module → window.ProgressRewards
├── styles/
│   └── progress-rewards.css       ← overlay / bar / center stage
└── Assets/
    ├── chest_closed.png
    ├── chest_open.png
    └── prize_*.png                ← sample prize sprites
```

Asset paths in data are **from the game root** (e.g.
`ProgressRewards/Assets/prize_a.png`), assuming the folder sits next to
`index.html`.

---

## How it works

### Idea

Players complete levels toward absolute unlock thresholds. A popup shows a
progress bar (“Only X levels left!”) with a small chest at the bar end and a
larger **center stage** chest for the claim animation. When the player reaches a
tier’s `unlockLevel`, the center chest opens, the prize sprite is showcased, and
the reward id is saved as unlocked. The UI then advances to the next tier.

`#prCenterStage` is the stable hook for replacing the placeholder chest `<img>`
with Spine (or other) animation later without rewriting the flow.

### Data model

**Enum** (`ProgressRewardId`) — extendable string ids used by gameplay:

```js
ProgressRewards.HasUnlockedProgressReward(ProgressRewardId.SAMPLE_PRIZE_A);
```

**Tiers** (`PROGRESS_REWARD_TIERS`) — absolute unlock levels, sorted ascending:

```js
{ unlockLevel: 5, rewardId: ProgressRewardId.SAMPLE_PRIZE_A,
  sprite: "ProgressRewards/Assets/prize_a.png", label: "Sample Prize A" }
```

- `unlockLevel` = completed-level threshold (how many levels the player has finished).
- Editor validates unique `rewardId`, unique `unlockLevel`, known enum ids, non-empty sprite.

### Saved state

`localStorage["progress_rewards"]` (no game-name prefix by default):

```js
{
  completedLevel: 0,   // highest finished level reported to the module
  unlocked: [],        // claimed rewardId strings
  lastShownLevel: 0    // last level the bar animation acknowledged (from→to fill)
}
```

Override the key via `init({ storageKey: "…" })` if needed.

### Progress math

Tiers use **absolute** `unlockLevel` (not deltas). Sample data `5 / 15 / 30` means:

| completedLevel | Next prize at | “Levels left” | Notes |
|----------------|---------------|---------------|--------|
| 0 | 5 | **5** | First popup on a fresh save |
| 4 | 5 | 1 | |
| 5 | 15 (after claim) | **10** | Next absolute unlock is 15 |
| 6 | 15 | **9** | Same tier; not the “5” from data |

Formula for the current unclaimed tier (`prevUnlock` = 0 or previous unlock):

- `levelsLeft = max(0, unlockLevel - completedLevel)`
- `fill = (completedLevel - prevUnlock) / (unlockLevel - prevUnlock)` clamped 0–1

`completedLevel` is a **clear count** (+1 on each `kpf:levelComplete` / `UpdateProgress`),
not `max(game level id)`. Syncing to the KPF level number froze the counter when
saved progress was already ahead of the current level (e.g. stuck at 10 left toward
unlock 15).

If you see stale numbers after testing, use debug **Delete Progress** (also clears
this save) or `ProgressRewards.ResetProgress()`.

### Config (`PROGRESS_REWARDS_CFG` in `progress-rewards-config.js`)

```js
const PROGRESS_REWARDS_CFG = {
  showOnLevelComplete: "every",       // or "sessionFirst"
  levelCompleteEvent: "kpf:levelComplete",
  listenToLevelComplete: true,
  // Timing (ms)
  barAnimDelay: 350,        // pause before the bar moves
  barAnimMs: 580,           // fill duration per level-section
  barSectionPopMs: 280,     // pop after each section lands
  chestOpenMs: 3200,        // fallback wait if Spine "open complete" never fires
  chestFlyMs: 550,          // bar → center chest flight
  chestPrizeRevealMs: 650,  // open start → prize pops out
  prizeEmergeMs: 700,       // item-out-of-chest motion before the feature card
  prizeSettleMs: 420,       // emerge → feature-card cross-fade
  claimOutMs: 300,          // card exit after Claim, before the bar returns
  prizeShowMs: 1400,        // unused leftover (claim waits on the Claim button)
  // Sizes (px)
  chestBarSizePx: 128,
  chestCenterSizePx: 760,
  chestSkin: "Green",       // RewardBox skin: Green | Blue | Red
  nextTierPeekMs: 700,      // hold on next-tier bar after claim
  statusHoldMs: 1700,       // hold on status-only popup before auto-close
  nextTierBarAnimMs: 600,   // (legacy) unused when section anim is used for peeks
  // Juice — set counts to 0 / flags false to strip it back
  confettiCount: 26,        // pieces launched from the chest as it opens
  confettiMs: 1700,         // confetti flight duration
  confettiColors: ["#f3c33d", "#f09a42", "…"],
  showUnlockFlash: true,    // white flash + shockwave ring on the open beat
  titleLetterPop: true      // per-letter pop on the "New Feature!" title
};
```

`prizeSettleMs` and `claimOutMs` are mirrored into CSS as `--pr-settle-ms` and
`--pr-claim-out-ms` on init, so the reveal cascade (prize → label → desc → CTA)
and the claim exit stay in step with the JS waits instead of drifting past them.

| `showOnLevelComplete` | Behaviour |
|-----------------------|-----------|
| `"every"` | Popup after every level clear (and always on prize unlock) |
| `"sessionFirst"` | Popup only on the first clear each session; **prize unlocks still show** |

Override any of these in `ProgressRewards.init({ showOnLevelComplete, … })`.

### Level-complete event

The host dispatches a `CustomEvent` (default name `kpf:levelComplete`):

```js
document.dispatchEvent(new CustomEvent("kpf:levelComplete", {
  detail: { completedLevel: finishedLevel } // 1-based level just cleared
}));
```

The module listens on init (when `listenToLevelComplete` is true) and calls
`OnLevelComplete(detail)`, which updates saved progress then applies the show
policy. Stretch Block fires this from `showLevelCompleteUI()` in `kpf-app.js`.

Helpers: `ProgressRewards.emitLevelComplete(n)`, `OnLevelComplete(detail)`,
`setShowOnLevelComplete("every"|"sessionFirst")`.

---

## Public API (`window.ProgressRewards`)

| Method | Purpose |
|--------|---------|
| `init({ root?, storageKey?, getCopy?, onClose? })` | Mount DOM, load save. Call once at boot. |
| `UpdateProgress()` | `completedLevel += 1`, then apply show policy. Returns whether a popup opened. |
| `OnLevelComplete({ completedLevel? })` | Sync/advance progress from a host clear; apply show policy. |
| `emitLevelComplete(n)` | Dispatch the configured level-complete CustomEvent. |
| `setShowOnLevelComplete("every"\|"sessionFirst")` | Change show policy at runtime. |
| `ShowSessionProgressPopup({ force? })` | Once per session progress peek. Returns `true` if shown. |
| `ShowProgressPopup({ completedLevel?, autoClose? })` | Always open the UI (status and/or claim). Auto-closes by default. |
| `NotifyLevelCompleted(finishedLevel, { onlyIfPrize?, show? })` | Set absolute completed level (max); show unless opted out. |
| `HasUnlockedProgressReward(rewardId)` | `true` if claimed. |
| `hasClaimablePrize()` | Unclaimed tier reachable at current `completedLevel`. |
| `GetState()` | `{ completedLevel, unlocked, lastShownLevel, sessionProgressShown, hasClaimablePrize }` |
| `ResetProgress()` | Clear save + session flag (debug). |
| `DebugArmNextUnlock({ runUpSections? })` | Rewind the save so the **next** clear lands on the current tier's `unlockLevel`, with `runUpSections` (default 3) sections still to fill. Returns the armed tier. |
| `DebugRunUnlockFlow({ runUpSections? })` | Arm, then immediately play bar-fill → chest → claim. |
| `isOpen()` / `hide()` | Query / dismiss overlay. |

**Typical host wiring**

```js
// Config in ProgressRewards/js/progress-rewards-config.js:
//   showOnLevelComplete: "every" | "sessionFirst"

// On win (or let the module listen to "kpf:levelComplete"):
document.dispatchEvent(new CustomEvent("kpf:levelComplete", {
  detail: { completedLevel: finishedLevel }
}));
```

**Level contract:** `completedLevel` is how many levels the player has finished.
`UpdateProgress()` increments that count by one per clear.

Aliases: `showProgressPopup`, `notifyLevelCompleted`, `hasUnlockedProgressReward`, etc.

### Debugging the unlock flow

`DebugArmNextUnlock()` and `DebugRunUnlockFlow()` are split because embedded
hosts need to run their own level-complete presentation around the bar:

```js
// Standalone overlay — arm and play in one call.
ProgressRewards.DebugRunUnlockFlow();

// Embedded — arm, then trigger the host's own win presentation.
ProgressRewards.DebugArmNextUnlock();
presentLevelCompleteUI(level);
startProgressRewardFlow({ completedLevel: level });
```

Both wipe `unlocked` once every tier is claimed, so the flow can be replayed
from the first tier without a full **Delete Progress**.

### Callbacks (all optional, passed to `init`)

| Callback | Fires |
|----------|-------|
| `onBarProgress()` | Before each level-section starts filling |
| `onBarFilled()` | The section that reaches `unlockLevel` lands |
| `onChestUnlockStart(tier)` | Crate leaves the bar for the centre stage |
| `onChestOpen(tier)` | Crate has landed and the lid opens — sync the open sting here, **not** on `onChestUnlockStart` (that's a whole `chestFlyMs` earlier) |
| `onFeaturePopup(tier)` | Feature + Claim card is revealed |
| `onClaimPress()` | Claim button pressed (button SFX / haptic) |
| `onClaim(rewardId, tier)` | Reward saved and grants applied |
| `onComplete()` | Flow finished (embedded hosts reveal their Continue here) |
| `onClose()` | Overlay dismissed |

### Motion and theming

Colours, sizes and the two new motion durations are CSS custom properties on
`.pr-overlay` (`--pr-fill`, `--pr-track`, `--pr-copy`, `--pr-settle-ms`,
`--pr-claim-out-ms`, `--pr-ease-spring`, …), so a host can re-skin without
touching the module. `@media (prefers-reduced-motion: reduce)` drops every
animation and the FX layer; because the flow is driven by JS waits rather than
animation events, the beats still step through in order.

---

## Host wiring (this project)

In `index.html` (paths relative to the page):

```html
<link rel="stylesheet" href="ProgressRewards/styles/progress-rewards.css" />
<!-- … after translations … -->
<script src="ProgressRewards/js/progress-rewards-config.js"></script>
<script src="ProgressRewards/js/progress-rewards-data.js"></script>
<script src="ProgressRewards/js/progress-rewards.js"></script>
```

In boot code (e.g. `js/kpf-app.js`):

```js
ProgressRewards.init({
  root: document.querySelector(".app") || document.body,
  getCopy: (key) => t(key)   // optional; falls back to English in-module
});
```

**Stretch Block today:** `ProgressRewards.init` sets `listenToLevelComplete: false`.
`DailyStreak` listens for `kpf:levelComplete`, shows its celebration when the day
ticks, then calls `ProgressRewards.OnLevelComplete(detail)` via
`onStreakFlowDone` so the progress popup still runs after streak (or immediately
on same-day extra wins). Debug **Delete Progress** also clears this save.

Debug **Reward Flow** arms the next unlock then replays the win-card path, so the
inline bar, chest takeover and claim all read exactly as they do in game.

### Suggested localisation keys

| Key | EN example |
|-----|------------|
| `prLevelsLeft` | `Only {n} levels left!` |
| `prLevelsLeftOne` | `Only 1 level left!` |
| `prClaimContinue` | `Continue` |
| `prRewardUnlocked` | `Reward unlocked!` |
| `prAllComplete` | `All rewards collected!` |
| `prClose` | `Close` |

Pass via `getCopy` or a global `t(key)`. The module ships English fallbacks so it
runs without host i18n.

---

## Authoring

1. Open `ProgressRewards/ProgressRewardsEditor.html` in a browser.
2. Add enum ids and tiers (unlock level, reward, sprite path, label).
3. Export / copy → overwrite `ProgressRewards/js/progress-rewards-data.js`.
4. Drop prize art into `ProgressRewards/Assets/` and point sprite paths at them.

---

## Out of scope (by design)

- Auto-show on host level-complete (host must call the API).
- Applying unlocked rewards to gameplay visuals (query API only).
- Spine / final art (placeholders + `#prCenterStage` swap hook).
- Win-card / “surpassed % of players” UI (stays in the host game).

---

## Integration prompt (other projects)

See [`INTEGRATION_PROMPT.md`](INTEGRATION_PROMPT.md) — copy-paste task for an agent
or developer porting this module.

---
