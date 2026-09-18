# Ads Module

Self-contained ad **policy** layer for Stretch Block. Mediation, networks, loading,
consent and analytics belong to the build pipeline (`kw-ads-template-api.md`).

## Files

| File | Role |
|------|------|
| `adsConfig.js` | Policy: start level, interval, placements, spinner, FakeAds timings |
| `adsProvider.js` | Base provider interface |
| `fakeAdsProvider.js` | Simulated fullscreen ads for browser / no-SDK builds |
| `kwAdsProvider.js` | Host `kw*` mediator bridge |
| `adsOverlay.js` | Loading spinner + FakeAds chrome |
| `adsManager.js` | `window.Ads` — gates, pause/resume hooks, public API |

## Host glue (this game)

- Scripts load from `Ads/` (not `assets/Ads/`) immediately before `js/kpf-app.js`.
- `Ads.init` lives in `js/kpf-app.js` with `getLevel` preferring `adsOpportunityLevel`
  so win-card Continue still gates on the level that just ended (progress already
  incremented in `showLevelCompleteUI`).
- Interstitials: Next Level (`level_complete`), Retry / Restart (`level_fail`).
- Rewarded: Times Up +30s (`extra_time`), Add Hint ×3 (`add_hints`), Keep streak
  (`keep_streak`).
- Offer UI: `js/ad-offers.js` + DailyStreak danger mode.
- Bottom safe-area tokens use `var(--ads-bottom-inset)` (defaults to the device
  inset). No banner is shown yet (`banner.enabled: false`).

## Public API (short)

```js
Ads.showInterstitial(placement)  // → { shown, reason, detail? }
Ads.showRewardedAd(placement)    // → { earned, reason, … }
Ads.showBanner(context) / Ads.hideBanner()
Ads.isAdShowing()
Ads.getInterstitialGate()
```

Gate rewards on `res.earned` only. Promises never reject; blocked / declined /
not-available all resolve so gameplay always continues.

## Module memory

### 2026-09-17 — Stretch Block first wire

- Folder path: `Ads/` at repo root (prompt’s `assets/Ads/` adapted).
- No `ViewportLock` / `resizeVisualPreset`; `onBannerHeightChange` is a no-op.
- Loop handle: `_gameRAF` via `isLoopRunning()` next to `startLoop` / `stopLoop`.
- Visibility: `Ads.isAdShowing()` early-return on the audio-context
  `visibilitychange` handler and HomeBoard’s loop visibility handler.
- Win flow increments `level` before Continue; interstitial uses
  `adsOpportunityLevel = finishedLevel` (or `level - 1` on the win card).
- Fail UX replaced by Times Up → Give Up → Retry (old fail card unused).
- Streak danger: boot +1s after home; `DailyStreak` danger / recover mode.
- Banner not requested; `banner.enabled: false`. Safe-area CSS still prepared.
- Locales: `en` + `pl` ad + offer strings in `translations.js`.
