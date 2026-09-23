// Base class every ad mediator inherits from. Nine members, shaped like the
// kw* host API so an adapter is almost nothing. See ads.md.
//
// Contract: no method ever rejects. Failures resolve with a `reason`, using the
// host vocabulary from kw-ads-template-api.md. The defaults below resolve
// "not-available", so a half-implemented provider degrades instead of throwing.

(function (global) {
  "use strict";

  class AdsProvider {
    /** Short id used in logs and the fake ad's debug footer. */
    get name() {
      return "base";
    }

    /**
     * Called once by Ads.init().
     * @param {{config: Object, log: Function}} ctx
     */
    init(ctx) {}

    /**
     * Request an interstitial. Resolves when the ad is DISMISSED, not when shown.
     * @param {string} context snake_case placement label
     * @returns {Promise<{shown: boolean, reason: string}>}
     */
    showInterstitial(context) {
      return Promise.resolve({ shown: false, reason: "not-available" });
    }

    /**
     * Request a rewarded video. `earned` decides the reward — never the mere
     * fact that the promise resolved.
     * @param {string} context snake_case placement label
     * @returns {Promise<{earned: boolean, reason: string}>}
     */
    showRewarded(context) {
      return Promise.resolve({ earned: false, reason: "not-available" });
    }

    /**
     * Start loading a banner and show any already-loaded one.
     * @param {string} [context]
     * @returns {Promise<{shown: boolean, reason: string}>}
     */
    showBanner(context) {
      return Promise.resolve({ shown: false, reason: "failed" });
    }

    /** Hide the banner but keep it loaded, so re-showing is instant. */
    hideBanner() {
      return Promise.resolve(false);
    }

    /** Release the banner. The next showBanner() has to load from scratch. */
    destroyBanner() {
      return Promise.resolve(false);
    }

    /**
     * Space to reserve at the bottom of the layout, in CSS px. Zero when no
     * banner is up. Providers that cannot measure a native view return their
     * own declared reserve instead.
     * @returns {number}
     */
    getBannerHeight() {
      return 0;
    }

    /** Tear down listeners and DOM. */
    destroy() {}

    /**
     * Kill switch. False = do not load or show ads of any format.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {}
  }

  global.AdsProvider = AdsProvider;
})(typeof window !== "undefined" ? window : globalThis);
