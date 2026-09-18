// window.Ads — the only thing gameplay talks to. Owns ad POLICY: which
// placements are allowed, how often an interstitial may appear, the loading
// spinner, and pausing/restoring the game around an ad. The mediator behind it
// owns the mechanism. See ads.md.
//
// Results use the host vocabulary from kw-ads-template-api.md, plus one
// addition — reason "blocked" for requests this module stops before the
// provider is ever asked, with `detail` naming the gate.
//
// Nothing here ever rejects, and nothing here persists: the frequency counter
// and the rewarded-skip flag are per-session by design.

(function (global) {
  "use strict";

  /** Why a request was blocked before reaching the provider. */
  var DETAIL = {
    ADS_DISABLED: "ads_disabled",
    BEFORE_START_LEVEL: "before_start_level",
    LEVEL_INTERVAL: "level_interval",
    AFTER_REWARDED: "after_rewarded",
    PLACEMENT_DISABLED: "placement_disabled",
    PLACEMENT_UNKNOWN: "placement_unknown",
    AD_ALREADY_SHOWING: "ad_already_showing",
    NO_PROVIDER: "no_provider"
  };

  var cfg = null;
  var provider = null;
  var getLevel = null;
  var onAdOpen = null;
  var onAdClose = null;
  var onBannerHeightChange = null;
  var initialised = false;

  // Session state. Zero at boot, on purpose: a new session counts its own
  // level ends from scratch rather than inheriting a nearly-complete interval.
  var adsEnabled = true;
  var sinceLastShown = 0;
  var skipNextPending = false;

  // Exactly one ad session may be open at a time, spinner included.
  var sessionOpen = false;
  var requestInFlight = false;
  var spinnerShowTimer = null;
  var spinnerHideTimer = null;

  var bannerWanted = false;

  function log() {
    if (!cfg || !cfg.debugLogs || !global.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[Ads]");
    global.console.log.apply(global.console, args);
  }

  function blocked(detail, placement, extra) {
    var res = { reason: "blocked", detail: detail, placement: placement };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) res[k] = extra[k];
      }
    }
    return res;
  }

  function currentLevel() {
    if (typeof getLevel !== "function") return Number.MAX_SAFE_INTEGER;
    var lvl = getLevel();
    return typeof lvl === "number" && isFinite(lvl) ? lvl : Number.MAX_SAFE_INTEGER;
  }

  function placementAllowed(group, placement) {
    var table = (cfg && cfg[group] && cfg[group].placements) || {};
    if (!Object.prototype.hasOwnProperty.call(table, placement)) return DETAIL.PLACEMENT_UNKNOWN;
    if (!table[placement]) return DETAIL.PLACEMENT_DISABLED;
    return null;
  }

  /** Debug-menu requests use this placement so they never touch the real cadence. */
  function isDebugPlacement(placement) {
    return placement === "debug";
  }

  /* ------------------------------------------------------------------ */
  /*  Interstitial gate                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Evaluate every local gate in order. The order matters twice over:
   * startLevel is checked before the counter moves, so onboarding level ends
   * contribute nothing to the first interval; and skipNextAfterRewarded is
   * checked last, so only an otherwise-eligible opportunity can consume it.
   *
   * @param {string} placement
   * @param {boolean} mutate false for a dry run (canShowInterstitial)
   * @returns {{detail: (string|null), counter: number}}
   */
  function evaluateInterstitial(placement, mutate) {
    var int = (cfg && cfg.interstitial) || {};
    var counter = sinceLastShown;

    if (requestInFlight || sessionOpen) return { detail: DETAIL.AD_ALREADY_SHOWING, counter: counter };

    var placementIssue = placementAllowed("interstitial", placement);
    if (placementIssue) return { detail: placementIssue, counter: counter };

    if (!adsEnabled || !cfg || !cfg.enabled) return { detail: DETAIL.ADS_DISABLED, counter: counter };
    if (!provider) return { detail: DETAIL.NO_PROVIDER, counter: counter };

    // Debug placement is a test tap, not a level-end opportunity: skip the
    // frequency counter, startLevel, and the rewarded-skip flag entirely.
    if (isDebugPlacement(placement)) return { detail: null, counter: counter };

    var startLevel = typeof int.startLevel === "number" ? int.startLevel : 1;
    if (currentLevel() < startLevel) {
      // Blocked WITHOUT touching the counter.
      return { detail: DETAIL.BEFORE_START_LEVEL, counter: counter };
    }

    counter = counter + 1;
    if (mutate) sinceLastShown = counter;

    var everyLevels = typeof int.everyLevels === "number" && int.everyLevels > 0 ? int.everyLevels : 1;
    if (counter < everyLevels) return { detail: DETAIL.LEVEL_INTERVAL, counter: counter };

    if (int.skipNextAfterRewarded && skipNextPending) {
      // The slot is consumed, not deferred: the cadence carries on unchanged
      // instead of this ad sliding into the next level end.
      if (mutate) {
        skipNextPending = false;
        sinceLastShown = 0;
        log("interstitial suppressed after rewarded; slot consumed");
      }
      return { detail: DETAIL.AFTER_REWARDED, counter: 0 };
    }

    return { detail: null, counter: counter };
  }

  /* ------------------------------------------------------------------ */
  /*  Ad session: pause / spinner / restore                             */
  /* ------------------------------------------------------------------ */

  function clearSpinnerTimers() {
    if (spinnerShowTimer) {
      global.clearTimeout(spinnerShowTimer);
      spinnerShowTimer = null;
    }
    if (spinnerHideTimer) {
      global.clearTimeout(spinnerHideTimer);
      spinnerHideTimer = null;
    }
  }

  /**
   * Opened for any request that got past the gates — we cannot know in advance
   * whether an ad will actually arrive, and pausing is the safe default. An ad
   * appearing over a running game is far worse than a brief pause.
   */
  function openSession(wantSpinner) {
    if (sessionOpen) return;
    sessionOpen = true;
    if (typeof onAdOpen === "function") onAdOpen();

    if (!wantSpinner) return;

    var loading = (cfg && cfg.loading) || {};
    var showAfter = typeof loading.spinnerAfterMs === "number" ? loading.spinnerAfterMs : 250;
    var timeout = typeof loading.timeoutMs === "number" ? loading.timeoutMs : 5000;

    // Cancelling only makes sense when we own the request. A host request
    // cannot be recalled, so offering Cancel there could resume gameplay just
    // before the ad lands.
    var ownsRequest = provider && provider.name === "fake";
    var cancelAfter =
      ownsRequest && cfg && cfg.fake && typeof cfg.fake.cancelButtonAfterMs === "number"
        ? cfg.fake.cancelButtonAfterMs
        : -1;

    spinnerShowTimer = global.setTimeout(function () {
      spinnerShowTimer = null;
      if (!sessionOpen) return;
      global.AdsOverlay.showSpinner({
        cancelAfterMs: cancelAfter >= 0 ? cancelAfter : undefined,
        onCancel:
          cancelAfter >= 0
            ? function () {
                // Abandon the visuals only. The provider promise still owns
                // resolution, so no result is invented here.
                global.AdsOverlay.hideSpinner();
                global.AdsOverlay.hideAd();
              }
            : undefined
      });
    }, showAfter);

    // The spinner must never hang, but hiding it does NOT resolve the request:
    // the provider's promise is the only terminal signal.
    spinnerHideTimer = global.setTimeout(function () {
      spinnerHideTimer = null;
      global.AdsOverlay.hideSpinner();
    }, Math.max(showAfter, timeout));
  }

  function closeSession() {
    if (!sessionOpen) return;
    clearSpinnerTimers();
    global.AdsOverlay.hideSpinner();
    sessionOpen = false;
    if (typeof onAdClose === "function") onAdClose();
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * @param {Object} opts
   * @param {Object} [opts.config] defaults to window.ADS_CONFIG
   * @param {AdsProvider} [opts.provider] defaults to config.provider resolution
   * @param {Function} [opts.getLevel] live level number, drives startLevel gating
   * @param {HTMLElement} [opts.mount] overlay host, usually .app
   * @param {Function} [opts.translate] i18n lookup
   * @param {Function} [opts.onAdOpen] pause gameplay + audio
   * @param {Function} [opts.onAdClose] restore gameplay + audio
   * @param {Function} [opts.onBannerHeightChange] px reserved at the bottom
   */
  function init(opts) {
    opts = opts || {};
    cfg = opts.config || global.ADS_CONFIG || {};
    getLevel = typeof opts.getLevel === "function" ? opts.getLevel : null;
    onAdOpen = typeof opts.onAdOpen === "function" ? opts.onAdOpen : null;
    onAdClose = typeof opts.onAdClose === "function" ? opts.onAdClose : null;
    onBannerHeightChange =
      typeof opts.onBannerHeightChange === "function" ? opts.onBannerHeightChange : null;

    provider = opts.provider || resolveProvider();

    global.AdsOverlay.init({
      mount: opts.mount || null,
      translate: opts.translate || null,
      debug: !!cfg.debugLogs,
      shrinkPlayArea: !!(cfg.banner && cfg.banner.shrinkPlayArea)
    });

    if (provider && typeof provider.init === "function") {
      provider.init({ config: cfg, log: log });
    }

    initialised = true;
    log("init provider=" + (provider ? provider.name : "none"));
  }

  /** @private Honour config.provider, defaulting to KWAds-with-FakeAds-fallback. */
  function resolveProvider() {
    var want = (cfg && cfg.provider) || "auto";
    var hasFake = typeof global.FakeAdsProvider === "function";
    var hasKW = typeof global.KWAdsProvider === "function";

    if (want === "fake") return hasFake ? new global.FakeAdsProvider() : null;
    if (!hasKW) return hasFake ? new global.FakeAdsProvider() : null;

    return new global.KWAdsProvider({
      fallback: hasFake ? new global.FakeAdsProvider() : null
    });
  }

  /**
   * Synchronous answer to "would an interstitial show right now". Pure: it does
   * not move the frequency counter.
   * @param {string} placement
   * @returns {boolean}
   */
  function canShowInterstitial(placement) {
    if (!initialised) return false;
    return evaluateInterstitial(placement, false).detail === null;
  }

  /**
   * Request an interstitial. Resolves when the ad is dismissed, or immediately
   * when policy blocks it. Never rejects.
   * @param {string} placement snake_case, passed through as the host `context`
   * @param {Function} [cb] sugar for .then()
   * @returns {Promise<{shown: boolean, reason: string, detail: (string|undefined), placement: string}>}
   */
  function showInterstitial(placement, cb) {
    var settle = function (res) {
      if (typeof cb === "function") cb(res);
      return res;
    };

    if (!initialised) {
      return Promise.resolve(settle(blocked(DETAIL.NO_PROVIDER, placement, { shown: false })));
    }

    var gate = evaluateInterstitial(placement, true);
    if (gate.detail) {
      // Nothing is drawn and the provider is never asked.
      log("interstitial blocked:", gate.detail, placement);
      return Promise.resolve(settle(blocked(gate.detail, placement, { shown: false })));
    }

    var loading = (cfg && cfg.loading) || {};
    requestInFlight = true;
    openSession(!!loading.spinnerForInterstitial);

    return Promise.resolve(provider.showInterstitial(placement))
      .catch(function (err) {
        log("interstitial threw", err);
        return { shown: false, reason: "failed" };
      })
      .then(function (res) {
        res = res || { shown: false, reason: "failed" };
        if (res.reason === "shown" && !isDebugPlacement(placement)) sinceLastShown = 0;
        requestInFlight = false;
        closeSession();
        log("interstitial", res.reason, placement);
        return settle({
          shown: !!res.shown,
          reason: res.reason || (res.shown ? "shown" : "failed"),
          placement: placement
        });
      });
  }

  /**
   * Request a rewarded video. Grant the reward on `earned` only — `declined`
   * resolves too. Never rejects.
   * @param {string} placement
   * @param {Function} [cb] sugar for .then()
   * @returns {Promise<{earned: boolean, reason: string, detail: (string|undefined), placement: string}>}
   */
  function showRewardedAd(placement, cb) {
    var settle = function (res) {
      if (typeof cb === "function") cb(res);
      return res;
    };

    if (!initialised || !provider) {
      return Promise.resolve(settle(blocked(DETAIL.NO_PROVIDER, placement, { earned: false })));
    }
    if (requestInFlight || sessionOpen) {
      return Promise.resolve(settle(blocked(DETAIL.AD_ALREADY_SHOWING, placement, { earned: false })));
    }

    var placementIssue = placementAllowed("rewarded", placement);
    if (placementIssue) {
      log("rewarded blocked:", placementIssue, placement);
      return Promise.resolve(settle(blocked(placementIssue, placement, { earned: false })));
    }

    // Note: no `adsEnabled` gate. A no-ads purchase kills interstitials and
    // banners, but rewarded is opt-in and usually the reward economy.

    var loading = (cfg && cfg.loading) || {};
    requestInFlight = true;
    openSession(loading.spinnerForRewarded !== false);

    return Promise.resolve(provider.showRewarded(placement))
      .catch(function (err) {
        log("rewarded threw", err);
        return { earned: false, reason: "failed" };
      })
      .then(function (res) {
        res = res || { earned: false, reason: "failed" };

        // Any rewarded ad that reached the screen consumes the next
        // interstitial slot — 'declined' means they watched part of one.
        if ((res.reason === "earned" || res.reason === "declined") && !isDebugPlacement(placement)) {
          if (cfg.interstitial && cfg.interstitial.skipNextAfterRewarded) skipNextPending = true;
        }

        requestInFlight = false;
        closeSession();
        log("rewarded", res.reason, placement);
        return settle({
          earned: !!res.earned,
          reason: res.reason || (res.earned ? "earned" : "failed"),
          placement: placement
        });
      });
  }

  /* ---------------------------- banners ---------------------------- */

  function publishBannerHeight() {
    var h = provider && typeof provider.getBannerHeight === "function" ? provider.getBannerHeight() : 0;
    global.AdsOverlay.setBottomInset(h);
    if (typeof onBannerHeightChange === "function") onBannerHeightChange(h);
    return h;
  }

  /**
   * Ask for a banner. Nothing raises one on its own.
   * @param {string} [context]
   * @returns {Promise<{shown: boolean, reason: string}>}
   */
  function showBanner(context) {
    if (!initialised || !provider) return Promise.resolve({ shown: false, reason: "failed" });
    if (!cfg.enabled || !adsEnabled || !(cfg.banner && cfg.banner.enabled)) {
      return Promise.resolve({ shown: false, reason: "disabled" });
    }

    bannerWanted = true;
    return Promise.resolve(provider.showBanner(context || "default"))
      .catch(function () {
        return { shown: false, reason: "failed" };
      })
      .then(function (res) {
        publishBannerHeight();
        log("banner", (res && res.reason) || "failed");
        return res || { shown: false, reason: "failed" };
      });
  }

  function hideBanner() {
    if (!initialised || !provider) return Promise.resolve(false);
    bannerWanted = false;
    return Promise.resolve(provider.hideBanner())
      .catch(function () {
        return false;
      })
      .then(function (out) {
        publishBannerHeight();
        return out;
      });
  }

  function destroyBanner() {
    if (!initialised || !provider) return Promise.resolve(false);
    bannerWanted = false;
    return Promise.resolve(provider.destroyBanner())
      .catch(function () {
        return false;
      })
      .then(function (out) {
        publishBannerHeight();
        return out;
      });
  }

  function getBannerHeight() {
    return provider && typeof provider.getBannerHeight === "function" ? provider.getBannerHeight() : 0;
  }

  /* ---------------------------- misc ---------------------------- */

  /**
   * No-ads purchase. Kills banners and interstitials; rewarded stays available.
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    adsEnabled = !!enabled;
    if (provider && typeof provider.setEnabled === "function") provider.setEnabled(adsEnabled);
    if (!adsEnabled) destroyBanner();
    else if (bannerWanted) showBanner("restore");
    log("setEnabled", adsEnabled);
  }

  /**
   * Debug-menu kill switch. Next FakeAds request resolves not-available after
   * the usual load delay. A live host SDK cannot be told to no-fill, so this
   * is a no-op when KWAds is actually mediating.
   * @param {boolean} on
   */
  function setForceNoFill(on) {
    if (provider && typeof provider.setForceNoFill === "function") provider.setForceNoFill(on);
    log("forceNoFill", !!on);
  }

  function getForceNoFill() {
    return !!(provider && typeof provider.getForceNoFill === "function" && provider.getForceNoFill());
  }

  /** True from onAdOpen to onAdClose, spinner included. */
  function isAdShowing() {
    return sessionOpen;
  }

  /**
   * Read-only view of why the next interstitial will or will not show. Reports
   * the frequency gates only — placement is per-call, so it is not considered.
   */
  function getInterstitialGate() {
    var int = (cfg && cfg.interstitial) || {};
    var startLevel = typeof int.startLevel === "number" ? int.startLevel : 1;
    var everyLevels = typeof int.everyLevels === "number" && int.everyLevels > 0 ? int.everyLevels : 1;
    var level = currentLevel();
    var detail = null;

    if (!cfg || !cfg.enabled || !adsEnabled) detail = DETAIL.ADS_DISABLED;
    else if (!provider) detail = DETAIL.NO_PROVIDER;
    else if (sessionOpen || requestInFlight) detail = DETAIL.AD_ALREADY_SHOWING;
    else if (level < startLevel) detail = DETAIL.BEFORE_START_LEVEL;
    else if (sinceLastShown + 1 < everyLevels) detail = DETAIL.LEVEL_INTERVAL;
    else if (int.skipNextAfterRewarded && skipNextPending) detail = DETAIL.AFTER_REWARDED;

    return {
      allowed: detail === null,
      detail: detail,
      level: level === Number.MAX_SAFE_INTEGER ? null : level,
      startLevel: startLevel,
      sinceLastShown: sinceLastShown,
      everyLevels: everyLevels,
      skipNextPending: skipNextPending
    };
  }

  global.Ads = {
    init: init,
    canShowInterstitial: canShowInterstitial,
    showInterstitial: showInterstitial,
    showRewardedAd: showRewardedAd,
    showBanner: showBanner,
    hideBanner: hideBanner,
    destroyBanner: destroyBanner,
    getBannerHeight: getBannerHeight,
    setEnabled: setEnabled,
    setForceNoFill: setForceNoFill,
    getForceNoFill: getForceNoFill,
    isAdShowing: isAdShowing,
    getInterstitialGate: getInterstitialGate,
    DETAIL: DETAIL
  };
})(typeof window !== "undefined" ? window : globalThis);
