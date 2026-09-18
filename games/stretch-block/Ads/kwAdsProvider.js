// Bridge to the Kwalee host ad API documented in kw-ads-template-api.md.
//
// Deliberately thin: the build pipeline owns mediation, ad networks, loading,
// preloading, consent and analytics behind these calls, so this file adds no
// policy of its own. The host's { shown, reason } / { earned, reason } shapes
// are already our result shapes, so there is no mapping table here.
//
// The kw* functions are genuinely ABSENT in browser preview and in builds with
// ads stripped out. They are never stubbed (a stub would resolve
// "not-available" and destroy the simulated-ad path), so every call
// feature-detects and falls back to the provider passed in as `fallback`.

(function (global) {
  "use strict";

  var Base = global.AdsProvider;

  function has(fn) {
    return typeof global[fn] === "function";
  }

  class KWAdsProvider extends Base {
    /**
     * @param {Object} [opts]
     * @param {AdsProvider} [opts.fallback] used per call when the kw* API is absent
     * @param {number} [opts.bannerReserveHeightPx] layout reserve for this mediator's banner
     */
    constructor(opts) {
      super();
      opts = opts || {};
      this._fallback = opts.fallback || null;
      this.reserveHeightPx =
        typeof opts.bannerReserveHeightPx === "number" ? opts.bannerReserveHeightPx : 50;
      this.bannerShown = false;
      this._log = function () {};
      this._onAdEvent = null;
    }

    get name() {
      return "kwads";
    }

    init(ctx) {
      ctx = ctx || {};
      if (typeof ctx.log === "function") this._log = ctx.log;
      if (this._fallback && typeof this._fallback.init === "function") {
        this._fallback.init(ctx);
      }

      // The plugin's hide is not durable, so a refreshing banner can reappear.
      // shared.js compensates; we only listen so the layout reserve tracks what
      // is actually on screen.
      var self = this;
      this._onAdEvent = function (e) {
        var detail = e && e.detail;
        if (!detail || detail.type !== "banner") return;
        if (detail.event === "shown") self.bannerShown = true;
        else if (detail.event === "hidden" || detail.event === "destroyed") self.bannerShown = false;
      };
      global.addEventListener("kw:ad-event", this._onAdEvent);
    }

    /** @private Route to the fallback provider, or resolve a safe default. */
    _viaFallback(method, args, fallbackResult) {
      if (this._fallback && typeof this._fallback[method] === "function") {
        return this._fallback[method].apply(this._fallback, args);
      }
      return Promise.resolve(fallbackResult);
    }

    showInterstitial(context) {
      if (!has("kwRequestInterstitial")) {
        return this._viaFallback("showInterstitial", [context], {
          shown: false,
          reason: "not-available"
        });
      }
      return global.kwRequestInterstitial(context);
    }

    showRewarded(context) {
      if (!has("kwRequestRewardedAd")) {
        return this._viaFallback("showRewarded", [context], {
          earned: false,
          reason: "not-available"
        });
      }
      return global.kwRequestRewardedAd(context);
    }

    showBanner(context) {
      if (!has("kwShowBanner")) {
        return this._viaFallback("showBanner", [context], { shown: false, reason: "failed" });
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
      if (!has("kwHideBanner")) return this._viaFallback("hideBanner", [], false);
      return global.kwHideBanner();
    }

    destroyBanner() {
      this.bannerShown = false;
      if (!has("kwDestroyBanner")) return this._viaFallback("destroyBanner", [], false);
      return global.kwDestroyBanner();
    }

    /**
     * The plugin owns the banner view and exposes no height API, so this is a
     * declared reserve rather than a measurement. If the real banner is taller,
     * the bottom row of UI will sit under it — settle this on a device.
     */
    getBannerHeight() {
      if (this._fallback && !has("kwShowBanner")) return this._fallback.getBannerHeight();
      return this.bannerShown ? this.reserveHeightPx : 0;
    }

    /**
     * Optional hook the manager calls for a no-ads purchase. Rewarded stays
     * available on purpose — it is opt-in and usually the reward economy.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
      if (!global.kwAdPolicy) return;
      global.kwAdPolicy.interstitialsEnabled = !!enabled;
      global.kwAdPolicy.bannersEnabled = !!enabled;
    }

    /** Forwards to the FakeAds fallback. A live host SDK cannot be told to no-fill. */
    setForceNoFill(on) {
      if (this._fallback && typeof this._fallback.setForceNoFill === "function") {
        this._fallback.setForceNoFill(on);
      }
    }

    getForceNoFill() {
      return !!(this._fallback && typeof this._fallback.getForceNoFill === "function" && this._fallback.getForceNoFill());
    }

    destroy() {
      if (this._onAdEvent) {
        global.removeEventListener("kw:ad-event", this._onAdEvent);
        this._onAdEvent = null;
      }
      if (this._fallback && typeof this._fallback.destroy === "function") {
        this._fallback.destroy();
      }
    }
  }

  global.KWAdsProvider = KWAdsProvider;
})(typeof window !== "undefined" ? window : globalThis);
