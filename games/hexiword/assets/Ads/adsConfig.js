/*
 * ============================================================
 *  Ads Config
 * ============================================================
 *  Ad POLICY for this game: when an interstitial is allowed,
 *  how often, and what the loading spinner does. The mechanism
 *  (mediation, networks, loading, consent, analytics) belongs to
 *  the build pipeline — see kw-ads-template-api.md.
 *
 *  Tweak these values here — do not hard-code ad policy inside
 *  index.html. Read ads.md before changing behaviour.
 *
 *  All times are milliseconds. All level numbers are game levels.
 * ============================================================
 */

window.ADS_CONFIG = {
  /**
   * Master switch. False = do not load ads of any kind (interstitial,
   * rewarded, banner). KWAds will not call the host SDK.
   */
  enabled: false,

  /**
   * "auto"   — KWAds only when any kw* host function exists; FakeAds only when
   *            none do (browser preview). KW never falls back to FakeAds:
   *            offline / no fill / missing function → not-available, no overlay.
   * "kwads"  — force the host mediator. Same no-FakeAds rule.
   * "fake"   — force simulated ads, even in a real build
   */
  provider: "auto",

  /** Console logging + the in-ad debug failure buttons. Turn off for release.
   *  The on-screen Ads log HUD is a separate toggle (off by default). */
  debugLogs: true,

  /** Interstitial frequency. Level-based only — there are no time cooldowns. */
  interstitial: {
    /** Level at which the module starts paying attention. Below this, nothing counts. */
    startLevel: 3,

    /** One interstitial per N counted opportunities, measured since the last ad SHOWN. */
    everyLevels: 2,

    /** A rewarded ad consumes the next interstitial slot. Session-only flag. */
    skipNextAfterRewarded: true,

    /** Placement must be listed AND true to be allowed. Keys are snake_case. */
    placements: {
      level_complete: true,
      level_fail: true,
      home_return: false,
      debug: true
    }
  },

  /** Rewarded ads are player-initiated, so there is no frequency gating at all. */
  rewarded: {
    placements: {
      extra_moves: true,
      double_coins: true,
      debug: true
    }
  },

  /** Banners are never frequency-gated — they show when you ask and hide when you say. */
  banner: {
    enabled: true,

    /** true = play area and screens shrink so the banner never covers the canvas. */
    shrinkPlayArea: true
  },
  // Banner reserve height is declared per mediator (see kwAdsProvider.js), not here.

  /** Our loading spinner. Never shown for blocked requests. */
  loading: {
    /** Player didn't ask for an interstitial, so stay silent if none is ready. */
    spinnerForInterstitial: false,

    /** Player tapped for a reward, so a spinner is the right feedback. */
    spinnerForRewarded: true,

    /** Don't flash a spinner for an ad that arrives instantly. */
    spinnerAfterMs: 250,

    /**
     * Hide the spinner by now at the latest. This does NOT resolve the request —
     * the provider's promise is the only terminal signal.
     */
    timeoutMs: 5000
  },

  /** FakeAds only: everything the simulator has to invent because no SDK is present. */
  fake: {
    interstitial: {
      loadDelayMs: 600,
      durationMs: 2000,
      noFillRate: 0,
      showFailRate: 0
    },
    rewarded: {
      loadDelayMs: 600,
      durationMs: 3000,
      skipAfterMs: 0,
      noFillRate: 0,
      showFailRate: 0
    },
    banner: {
      loadDelayMs: 600,
      noFillRate: 0,
      heightPx: 50,
      reloadMs: 30000,

      /** "bottom" | "top" */
      position: "bottom",

      /** "regular" 320x50 | "large" 320x90 | "rectangle" 300x250 */
      size: "regular"
    },

    /** Spinner cancel button. Only safe when we own the request, so FakeAds only. */
    cancelButtonAfterMs: 2000,

    /**
     * Offline = no-fill. Probe a Google connectivity URL (204, empty body).
     * navigator.onLine === false skips the request. Used only by FakeAds.
     */
    connectivity: {
      checkUrl: "https://www.gstatic.com/generate_204",
      timeoutMs: 2000,
      cacheMs: 8000
    }
  }
};
