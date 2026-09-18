// Simulated mediator for browser preview and ads-disabled builds. Draws real
// overlays via AdsOverlay and resolves the same { shown, reason } /
// { earned, reason } shapes as the host API, so call sites never know which
// provider answered. Timings live in ADS_CONFIG.fake. See ads.md.

(function (global) {
  "use strict";

  var Base = global.AdsProvider;

  class FakeAdsProvider extends Base {
    /**
     * @param {Object} [opts]
     * @param {Object} [opts.fake] override the ADS_CONFIG.fake block
     */
    constructor(opts) {
      super();
      opts = opts || {};
      this._fakeOverride = opts.fake || null;
      this._cfg = null;
      this._log = function () {};
      this._bannerTimer = null;
      this._bannerWanted = false;
      this._forceNoFill = false;
    }

    get name() {
      return "fake";
    }

    init(ctx) {
      ctx = ctx || {};
      this._cfg = ctx.config || global.ADS_CONFIG || {};
      if (typeof ctx.log === "function") this._log = ctx.log;
    }

    /** @private */
    _fake(section) {
      var fake = this._fakeOverride || (this._cfg && this._cfg.fake) || {};
      return fake[section] || {};
    }

    /**
     * Debug-menu kill switch. Next interstitial / rewarded / banner request
     * resolves not-available after the usual load delay. Session-only.
     * @param {boolean} on
     */
    setForceNoFill(on) {
      this._forceNoFill = !!on;
    }

    getForceNoFill() {
      return this._forceNoFill;
    }

    /**
     * Simulated network round trip, then a fill / failure dice roll.
     * @private
     * @returns {Promise<string|null>} a failure reason, or null when it filled
     */
    _load(section) {
      var cfg = this._fake(section);
      var delay = Math.max(0, cfg.loadDelayMs || 0);
      var noFill = this._forceNoFill ? 1 : cfg.noFillRate || 0;
      var showFail = this._forceNoFill ? 0 : cfg.showFailRate || 0;

      return new Promise(function (resolve) {
        global.setTimeout(function () {
          if (Math.random() < noFill) return resolve("not-available");
          if (Math.random() < showFail) return resolve("failed");
          resolve(null);
        }, delay);
      });
    }

    showInterstitial(context) {
      var self = this;
      var cfg = this._fake("interstitial");

      return this._load("interstitial").then(function (failure) {
        if (failure) {
          self._log("fake interstitial " + failure + " (" + context + ")");
          return { shown: false, reason: failure };
        }
        return global.AdsOverlay.showAd({
          format: "interstitial",
          durationMs: cfg.durationMs,
          providerName: self.name
        }).then(function (out) {
          // The debug footer can end an ad as a failure mid-flight.
          if (out.forced) return { shown: false, reason: out.forced };
          return { shown: true, reason: "shown" };
        });
      });
    }

    showRewarded(context) {
      var self = this;
      var cfg = this._fake("rewarded");

      return this._load("rewarded").then(function (failure) {
        if (failure) {
          self._log("fake rewarded " + failure + " (" + context + ")");
          return { earned: false, reason: failure };
        }
        return global.AdsOverlay.showAd({
          format: "rewarded",
          durationMs: cfg.durationMs,
          skipAfterMs: cfg.skipAfterMs,
          providerName: self.name
        }).then(function (out) {
          if (out.forced) return { earned: false, reason: out.forced };
          // Closing after the countdown earns it; skipping before does not.
          if (out.completed) return { earned: true, reason: "earned" };
          return { earned: false, reason: "declined" };
        });
      });
    }

    showBanner(context) {
      var self = this;
      var cfg = this._fake("banner");
      this._bannerWanted = true;

      return this._load("banner").then(function (failure) {
        if (!self._bannerWanted) return { shown: false, reason: "failed" };
        if (failure) {
          self._log("fake banner " + failure);
          return { shown: false, reason: "not-available" };
        }

        global.AdsOverlay.showBanner({
          heightPx: cfg.heightPx,
          size: cfg.size,
          position: cfg.position
        });
        self._scheduleReload();
        return { shown: true, reason: "shown" };
      });
    }

    /**
     * Simulated auto-refresh, so a long session exercises the same reload path
     * a real SDK would take.
     * @private
     */
    _scheduleReload() {
      var self = this;
      var cfg = this._fake("banner");
      var every = cfg.reloadMs || 0;

      this._clearReload();
      if (every <= 0) return;

      this._bannerTimer = global.setTimeout(function () {
        self._bannerTimer = null;
        if (!self._bannerWanted) return;
        global.AdsOverlay.showBanner({
          heightPx: cfg.heightPx,
          size: cfg.size,
          position: cfg.position
        });
        self._scheduleReload();
      }, every);
    }

    /** @private */
    _clearReload() {
      if (this._bannerTimer) {
        global.clearTimeout(this._bannerTimer);
        this._bannerTimer = null;
      }
    }

    hideBanner() {
      this._bannerWanted = false;
      this._clearReload();
      global.AdsOverlay.hideBanner();
      return Promise.resolve(true);
    }

    destroyBanner() {
      this._bannerWanted = false;
      this._clearReload();
      global.AdsOverlay.destroyBanner();
      return Promise.resolve(true);
    }

    getBannerHeight() {
      return global.AdsOverlay.getBannerHeight();
    }

    destroy() {
      this._clearReload();
      global.AdsOverlay.hideAd();
      global.AdsOverlay.destroyBanner();
    }
  }

  global.FakeAdsProvider = FakeAdsProvider;
})(typeof window !== "undefined" ? window : globalThis);
