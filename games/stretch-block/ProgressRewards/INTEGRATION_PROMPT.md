# Progress Rewards — Integration Prompt

Copy everything below into a chat with an agent (or hand to a developer) when
adding this module to **another** HTML5 game project.

---

## Task: Integrate the Progress Reward System

Copy the entire `ProgressRewards/` folder from the Stretch Block repo into this
project’s root (same internal layout: `js/`, `styles/`, `Assets/`,
`ProgressRewardsEditor.html`, `README.md`).

This is a **portable, self-contained** milestone-unlock UI. The host game loads
CSS/JS, calls `init()` once, and fires a level-complete hook. The module owns
its own `localStorage` save and overlay DOM.

### What it does

- Tracks **how many levels the player has cleared** (a +1 counter per win, not
  “current level id”).
- Shows a bottom progress bar (“Only X levels left!”) toward the next unlock tier.
- When a tier threshold is reached, a **Spine RewardBox** opens on a center stage,
  reveals the prize sprite, and saves the reward id as unlocked after the player
  taps **Claim**.
- Gameplay must query unlocks via API — the module does **not** apply cosmetics.

### 1. HTML — load assets

Add to the main game page (paths relative to `index.html`):

```html
<link rel="stylesheet" href="ProgressRewards/styles/progress-rewards.css" />
<link rel="stylesheet" href="ProgressRewards/js/vendor/spine-player.min.css" />

<!-- After any i18n helper, before main app boot -->
<script src="ProgressRewards/js/progress-rewards-config.js"></script>
<script src="ProgressRewards/js/progress-rewards-data.js"></script>
<script src="ProgressRewards/js/vendor/spine-player.min.js"></script>
<script src="ProgressRewards/js/progress-rewards.js"></script>
```

No bundler required — classic `<link>` / `<script>` only.

### 2. Boot — init once

```js
ProgressRewards.init({
  root: document.querySelector(".app") || document.body,
  getCopy: (key) => t(key),           // optional; English fallbacks in-module
  storageKey: "progress_rewards",      // default; override if namespacing saves
  listenToLevelComplete: true,         // see §4 if pairing with DailyStreak
  showOnLevelComplete: "every",        // or "sessionFirst" — also in config file
  onClose: null                        // optional callback when overlay closes
});
```

Tune behaviour/timing in `ProgressRewards/js/progress-rewards-config.js` or pass
overrides in `init()`.

### 3. Level-complete hook (host-owned)

When the player **wins a level**, dispatch:

```js
document.dispatchEvent(new CustomEvent("kpf:levelComplete", {
  detail: { completedLevel: finishedLevel }  // 1-based level just cleared (informational)
}));
```

Default event name is `kpf:levelComplete` (configurable via
`PROGRESS_REWARDS_CFG.levelCompleteEvent`).

**If `listenToLevelComplete: true`** (standalone setup): the module listens and
calls `OnLevelComplete(detail)` automatically (+1 clear count, then show policy).

**If calling manually** instead of listening:

```js
ProgressRewards.OnLevelComplete({ completedLevel: finishedLevel });
// or
ProgressRewards.UpdateProgress();  // +1 without needing detail
```

### 4. Optional — pair with Daily Win Streak

If the project also uses `DailyStreak/`, streak celebration should run **first**:

```js
ProgressRewards.init({
  root: document.querySelector(".app") || document.body,
  getCopy: (key) => t(key),
  listenToLevelComplete: false   // streak forwards after its UI
});

DailyStreak.init({
  root: document.querySelector(".app") || document.body,
  homeRoot: document.getElementById("startScreen"),
  getCopy: (key) => t(key),
  onStreakFlowDone: (detail) => {
    ProgressRewards.OnLevelComplete(detail || {});
  }
});
```

Host still dispatches **one** `kpf:levelComplete` per win. Streak handles
first-win-of-day UI; ProgressRewards runs on Continue or immediately on same-day
extra wins.

See `DailyStreak/INTEGRATION_PROMPT.md` for the streak side.

### 5. Gameplay unlock checks

Author reward ids in `ProgressRewards/js/progress-rewards-data.js` (or via
`ProgressRewardsEditor.html`):

```js
if (ProgressRewards.HasUnlockedProgressReward(ProgressRewardId.SAMPLE_PRIZE_A)) {
  // enable feature / show cosmetic
}
```

Do **not** duplicate unlock state in the host save.

### 6. Authoring tiers

1. Open `ProgressRewards/ProgressRewardsEditor.html` in a browser.
2. Edit enum ids + tiers (`unlockLevel`, `rewardId`, sprite path, label).
3. Export → replace `ProgressRewards/js/progress-rewards-data.js`.
4. Put prize art in `ProgressRewards/Assets/`; paths are **game-root relative**
   (e.g. `ProgressRewards/Assets/prize_a.png`).

`unlockLevel` is an **absolute** completed-level threshold (not a delta).

### 7. Localisation keys (if project has i18n)

| Key | EN example |
|-----|------------|
| `prLevelsLeft` | `Only {n} levels left!` |
| `prLevelsLeftOne` | `Only 1 level left!` |
| `prClaim` | `Claim` |
| `prClaimContinue` | `Continue` |
| `prRewardUnlocked` | `Reward unlocked!` |
| `prNewFeature` | `New Feature!` |
| `prAllComplete` | `All rewards collected!` |
| `prClose` | `Close` |

`{n}` is interpolated by the module. Missing keys fall back to English.

### 8. Show policy

| `showOnLevelComplete` | Behaviour |
|-----------------------|-----------|
| `"every"` | Popup after every level clear |
| `"sessionFirst"` | Popup only on first clear per session; **prize unlocks always show** |

Prize tiers at threshold always open the claim flow regardless of mode.

Manual triggers for debug / home entry:

```js
ProgressRewards.ShowProgressPopup();           // always open UI
ProgressRewards.ShowSessionProgressPopup();  // once per session peek
ProgressRewards.hasClaimablePrize();         // query before forcing UI
```

### 9. Debug / reset

Wire debug “delete progress” (or similar) to:

```js
ProgressRewards.ResetProgress();
```

Clears `localStorage["progress_rewards"]` and session flags.

### 10. Constraints — do not

- Rename or remove public API methods on `window.ProgressRewards`.
- Invent a parallel save for unlock progress.
- Auto-apply unlocked rewards to gameplay — query `HasUnlockedProgressReward` only.
- Change `completedLevel` semantics to “max game level id” — it must +1 per clear.
- Remove `#prCenterStage` / bar chest hooks without replacing the claim flow.
- Assume a bundler — keep script tags as above.

### 11. Layout / z-index

- Overlay z-index: **80** (above typical win cards ~10; below DailyStreak ~85).
- Spine chest uses `ProgressRewards/Assets/RewardChests/RewardBox.*` with PNG
  fallback (`chest_closed.png` / `chest_open.png`).
- Skin: `chestSkin: "Green" | "Blue" | "Red"` in config or `init()`.

### 12. Verify integration

- [ ] Fresh save: first win shows progress bar toward tier 1.
- [ ] Reach `unlockLevel`: claim flow opens, reward id saved after Claim.
- [ ] `HasUnlockedProgressReward(id)` returns true after claim.
- [ ] Second win same session respects `showOnLevelComplete` policy.
- [ ] Debug reset clears bar state.
- [ ] If DailyStreak present: PR runs after streak Continue, not in parallel.

### Reference

Full behaviour, data model, and API tables:
`ProgressRewards/README.md`
