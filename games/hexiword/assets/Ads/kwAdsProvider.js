// Bridge to the Kwalee host ad API documented in kw-ads-template-api.md.
//
// Deliberately thin: the build pipeline owns mediation, ad networks, loading,
// preloading, consent and analytics behind these calls, so this file adds no
// policy of its own. The host's { shown, reason } / { earned, reason } shapes
// are already our result shapes, so there is no mapping table here.
//
// KW-only: this provider never draws FakeAds. If a kw* function is absent
// (offline, ads-stripped, cold host), the call resolves not-available / failed
// with no overlay. Simulated ads are a separate provider, chosen by Ads.init
// only when the host API is not present at all.
//
// When the ads system is disabled we must not load anything: do not call
// kwRequest* / kwShowBanner, tell kwAdPolicy to short-circuit, and destroy
// any live banner. Preloading lives in the host; refusing the request is
// the only lever we have.

(function (global) {
  "use strict";

  var Base = global.AdsProvider;

  function has(fn) {
    return typeof global[fn] === "function";
  }

  class KWAdsProvider extends Base {
    /**
     * @param {Object} [opts]
     * @param {number} [opts.bannerReserveHeightPx] layout reserve for this mediator's banner
     */
    constructor(opts) {
      super();
      opts = opts || {};
      this.reserveHeightPx =
        typeof opts.bannerReserveHeightPx === "number" ? opts.bannerReserveHeightPx : 50;
      this.bannerShown = false;
      this._adsEnabled = true;
      this._log = function () {};
      this._onAdEvent = null;
    }

    get name() {
      return "kwads";
    }

    init(ctx) {
      ctx = ctx || {};
      if (typeof ctx.log === "function") this._log = ctx.log;

      var cfg = ctx.config || global.ADS_CONFIG || {};
      this.setEnabled(cfg.enabled !== false);

      // The plugin's hide is not durable, so a refreshing banner can reappear.
      // shared.js compensates; we only listen so the layout reserve tracks what
      // is actually on screen.
      var self = this;
      this._onAdEvent = function (e) {
        var detail = e && e.detail;
        if (!detail || detail.type !== "banner") return;
        if (!self._adsEnabled) {
          self.bannerShown = false;
          self._stopHostBanner();
          return;
        }
        if (detail.event === "shown") self.bannerShown = true;
        else if (detail.event === "hidden" || detail.event === "destroyed") self.bannerShown = false;
      };
      global.addEventListener("kw:ad-event", this._onAdEvent);
    }

    /** @private Host function missing — treat as no-fill, never simulate. */
    _noFill(result) {
      return Promise.resolve(result);
    }

    /** @private Push kill switches onto the host so it does not load ads. */
    _applyHostPolicy() {
      var on = this._adsEnabled;
      var policy = global.kwAdPolicy;
      if (!policy) {
        try {
          policy = {};
          global.kwAdPolicy = policy;
        } catch (err) {
          return;
        }
      }
      policy.interstitialsEnabled = on;
      policy.bannersEnabled = on;
      policy.rewardedEnabled = on;
    }

    /** @private Drop a banner the host may still be holding. */
    _stopHostBanner() {
      this.bannerShown = false;
      if (has("kwDestroyBanner")) return global.kwDestroyBanner();
      if (has("kwHideBanner")) return global.kwHideBanner();
      return Promise.resolve(false);
    }

    showInterstitial(context) {
      this._applyHostPolicy();
      if (!this._adsEnabled) {
        this._log("kwads disabled; not requesting interstitial", context);
        return this._noFill({ shown: false, reason: "disabled" });
      }
      if (!has("kwRequestInterstitial")) {
        return this._noFill({ shown: false, reason: "not-available" });
      }
      return global.kwRequestInterstitial(context);
    }

    showRewarded(context) {
      this._applyHostPolicy();
      if (!this._adsEnabled) {
        this._log("kwads disabled; not requesting rewarded", context);
        return this._noFill({ earned: false, reason: "disabled" });
      }
      if (!has("kwRequestRewardedAd")) {
        return this._noFill({ earned: false, reason: "not-available" });
      }
      return global.kwRequestRewardedAd(context);
    }

    showBanner(context) {
      this._applyHostPolicy();
      if (!this._adsEnabled) {
        this._log("kwads disabled; not requesting banner", context);
        this.bannerShown = false;
        return this._noFill({ shown: false, reason: "disabled" });
      }
      if (!has("kwShowBanner")) {
        return this._noFill({ shown: false, reason: "failed" });
      }

      var self = this;
      return global.kwShowBanner(context).then(function (res) {
        // 'pending' is the normal cold-start answer: the banner will appear on
        // its own. Never poll or retry it. We reserve space either way, because
        // a banner that arrives later still covers the bottom of the screen.
        if (res && (res.reason === "shown" || res.reason === "pending")) {
          self.bannerShown = true;
        }
        return res;
      });
    }

    hideBanner() {
      this.bannerShown = false;
      if (!has("kwHideBanner")) return this._noFill(false);
      return global.kwHideBanner();
    }

    destroyBanner() {
      this.bannerShown = false;
      if (!has("kwDestroyBanner")) return this._noFill(false);
      return global.kwDestroyBanner();
    }

    /**
     * The plugin owns the banner view and exposes no height API, so this is a
     * declared reserve rather than a measurement. If the real banner is taller,
     * the bottom row of UI will sit under it — settle this on a device.
     */
    getBannerHeight() {
      if (!this._adsEnabled) return 0;
      return this.bannerShown ? this.reserveHeightPx : 0;
    }

    /**
     * Master / no-ads switch. False means do not load any format — including
     * rewarded. Host policy is set so shared.js can short-circuit too.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
      this._adsEnabled = !!enabled;
      this._applyHostPolicy();
      if (!this._adsEnabled) this._stopHostBanner();
    }

    /** A live host SDK cannot be told to no-fill. FakeAds owns this toggle. */
    setForceNoFill() {}

    getForceNoFill() {
      return false;
    }

    destroy() {
      if (this._onAdEvent) {
        global.removeEventListener("kw:ad-event", this._onAdEvent);
        this._onAdEvent = null;
      }
    }
  }

  global.KWAdsProvider = KWAdsProvider;
})(typeof window !== "undefined" ? window : globalThis);
