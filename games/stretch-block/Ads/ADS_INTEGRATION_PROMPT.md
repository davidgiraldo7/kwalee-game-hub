# Ads Module — Integration Prompt

> **Copy the `assets/Ads/` folder into the target project, then copy everything below the line and paste it as your first message.**

The module is self-contained: six files in one folder, no dependencies, no build step. Everything else below is glue.

---

## Prompt

```
Add the KPF Ads module to this project. The `assets/Ads/` folder has already been
copied in. Read `assets/Ads/adsManager.js` and `ads.md` (copy it in too if it is
missing) before changing anything — the module owns ad POLICY only, and the build
pipeline owns mediation, networks, loading, consent and analytics. Do not add a
waterfall, preloading, ad-event plumbing or ad analytics.

Do these eight things, then report back with what you wired and anything you had
to adapt.

### 1. Load the scripts

Add these six tags to `index.html`, in this exact order, immediately before the
inline gameplay `<script>`:

    <script src="assets/Ads/adsConfig.js"></script>
    <script src="assets/Ads/adsProvider.js"></script>
    <script src="assets/Ads/fakeAdsProvider.js"></script>
    <script src="assets/Ads/kwAdsProvider.js"></script>
    <script src="assets/Ads/adsOverlay.js"></script>
    <script src="assets/Ads/adsManager.js"></script>

Order matters: config, base class, subclasses, overlay, manager.

### 2. Add a loop-state helper

Next to `startLoop()` / `stopLoop()`, add:

    function isLoopRunning() { return _gameRAF !== null; }

If this project names the rAF handle something else, use that. If it has no game
loop at all, skip this and drop the loop lines from step 3.

### 3. Initialise

Next to the other init calls (near `ViewportLock.init` if present), add:

    let _loopWasRunningBeforeAd = false;

    if (window.Ads) {
      Ads.init({
        config: window.ADS_CONFIG,
        getLevel: () => level,
        mount: document.querySelector(".app"),
        translate: t,
        onAdOpen: () => {
          _loopWasRunningBeforeAd = isLoopRunning();
          stopLoop();
          stopBackgroundAudio();
        },
        onAdClose: () => {
          if (_actx && _actx.state === "suspended") _actx.resume();
          if (_loopWasRunningBeforeAd) { startLoop(); playBackgroundAudio(); }
        },
        onBannerHeightChange: () => {
          resizeVisualPreset();
        }
      });
    }

Adapt the names: `level` must be the live level number, `translate` the i18n
lookup, and the audio calls whatever this project uses. Snapshot the loop state
rather than calling `startLoop()` unconditionally — the level-end flow has usually
already stopped the loop, so resuming blindly would run the game underneath the
result screen.

`mount` must be the **full-size app shell**, the element the screens are pinned
inside. Simulated ads are full screen and are positioned `inset: 0` against this
element, so mounting them on anything smaller makes them a floating panel instead
of an ad. It also needs to be a positioned element (the KPF `.app` is
`position: relative`); if this project's shell is not, use `document.body`.

### 4. Guard the visibility handlers

A fullscreen interstitial backgrounds the webview, so any `visibilitychange`
handler that stops and restarts the BGM will fight `onAdClose` and play the music
twice. Add this as the first line of both the backgrounded and foregrounded
handlers:

    if (window.Ads && Ads.isAdShowing()) return;

### 5. Request an interstitial at the level-end beat

In the handler behind the result overlay's continue/retry button (often
`onOverlayContinue()`), wrap the existing body so it runs after the ad:

    const won = /* existing win check */;
    const advance = () => { /* the existing body, unchanged */ };
    if (window.Ads) Ads.showInterstitial(won ? "level_complete" : "level_fail").then(advance);
    else advance();

Two requirements:
  - Ask BEFORE the level number increments, so the frequency gate reads the level
    that just ended.
  - `advance()` must run on every path. The promise never rejects and every reason
    other than 'shown' means "carry on" — an ad must never be able to strand the
    player.

### 6. Reserve space for a banner

Find every bottom-anchored element using `env(safe-area-inset-bottom, 0px)` and
switch each to `var(--ads-bottom-inset)`. Then declare the default on the app
shell rule so nothing changes visually when no banner is up:

    .app { --ads-bottom-inset: env(safe-area-inset-bottom, 0px); }

Report any gameplay-critical bottom UI positioned by percentage (e.g.
`bottom: 15%`), since a percentage cannot know about a banner and can end up
behind one on a short viewport.

### 7. Add the UI strings

Add these to EVERY language block in the translations file, translated properly —
do not leave non-English values in English:

    adLabel, adLoading, adCancel, adSkip, adComplete, adInstall, adInstallOpening,
    adRewardEarned, adRewardMissed, adUnavailable

English reference: "Ad", "Loading ad…", "Cancel", "Skip", "Complete instantly", "Install",
"Opening store…", "Reward earned", "Watch the full ad to get your reward",
"No ad available right now".

### 8. Set the policy

Edit `assets/Ads/adsConfig.js` for this game, and ASK ME before guessing at any
of it:
  - `interstitial.startLevel` and `interstitial.everyLevels`
  - `interstitial.placements` — a placement must be listed AND true; an unlisted
    one resolves blocked/'placement_unknown' rather than showing anything
  - `rewarded.placements` — one key per rewarded button this game actually has
  - `banner.enabled` and `banner.shrinkPlayArea`
  - `debugLogs: false` before release (it also hides the in-ad debug failure buttons)

### Rewarded ads

Only wire these where the game already has a "watch an ad for X" button. For each
one, add its placement to `rewarded.placements` and call:

    Ads.showRewardedAd("extra_moves").then((res) => {
      if (res.earned) { grantReward(); }
      else if (res.reason === "declined") { toast(t("adRewardMissed")); }
      else { toast(t("adUnavailable")); }
    });

Gate the reward on `res.earned`, never on the promise resolving — 'declined'
resolves too. Do not add a readiness check to enable/disable the button; the host
exposes no readiness query, so leave it enabled and let 'not-available' drive a
toast.

### Banners

Nothing raises a banner on its own. Call `Ads.showBanner("gameplay")` where this
game wants one and `Ads.hideBanner()` where it does not. If you do, tell me what
`bannerReserveHeightPx` should be for the mediator — it is a declared estimate,
not a measurement, because the plugin owns the banner view.

### Do NOT

- Declare or stub any `kw*` function. `window.kwRequestInterstitial =
  window.kwRequestInterstitial || ...` would resolve 'not-available' in preview
  and destroy the simulated-ad path. The module feature-detects per call and falls
  back to FakeAds.
- Send ad analytics. The pipeline already emits ad_requested / ad_shown /
  ad_unavailable / ad_failed and the rewarded equivalents; duplicating them would
  double-report every impression.
- Add `localStorage` to the module. The frequency counter and the rewarded-skip
  flag are per-session by design.
- Resolve a request from a timeout. The spinner's `timeoutMs` hides the spinner
  only — the provider's promise is the only terminal signal, because an
  interstitial promise resolves on dismissal and may legitimately take 30+ seconds.
- Block level progression on an ad, or move gameplay code inside `onAdOpen` /
  `onAdClose` beyond pause and restore.

### Verify before reporting back

Serve the project and open it in a browser. With no `kw*` API present the module
resolves to FakeAds automatically, so:
  1. Console is clean and `typeof window.Ads === "object"`.
  2. `Ads.getInterstitialGate()` reports the level, counter and interval.
  3. Below `startLevel`, `Ads.showInterstitial("level_complete")` resolves
     blocked/'before_start_level' and draws NOTHING.
  4. Debug → Ads opens a separate panel. Interstitial / Rewarded / Show banner
     fire immediately at placement `"debug"` (a 2-second interstitial by default)
     without moving the frequency counter. Force no fill, then tap Interstitial —
     it should resolve `not-available`.
  5. Past `startLevel`, finishing levels raises a simulated ad on the configured
     cadence. It must be FULL SCREEN — covering the mount edge to edge with no
     game visible around it — with the "Ad" pill and countdown clear of the top
     inset and the Install button clear of the home indicator. The countdown ring
     turns into a close button, and closing it resolves
     { shown: true, reason: "shown" }.
  6. A rewarded ad's Skip gives 'declined' and letting it finish gives 'earned'.
  7. Gameplay is paused behind the ad and running again afterwards — and is NOT
     running underneath the result screen after an interstitial closes.
  8. If you wired a banner: bottom UI moves up by its height and back down on hide.

Then append a dated entry to the `## Module memory` section at the bottom of
`ads.md` recording what you adapted for this project, and add one line to
`memory.md` pointing at it.
```
