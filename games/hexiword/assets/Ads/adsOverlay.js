// All ad UI owned by this module: the simulated ad card, the loading spinner,
// the fake banner strip, the on-screen debug log HUD, and the --ads-bottom-inset
// custom property that pushes bottom-anchored game UI up out of a banner's way.
// See ads.md.
//
// CSS is injected from here so the module stays one copyable folder. The only
// style edit index.html needs is its four bottom anchors reading
// var(--ads-bottom-inset) instead of env(safe-area-inset-bottom) directly.
//
// One rAF ticker drives the ad countdown, and it runs ONLY while the card is on
// screen — which is exactly when the game loop has been paused.

(function (global) {
  "use strict";

  var STYLE_ID = "kpf-ads-style";
  var Z_AD = 55;
  var Z_SPINNER = 54;
  var Z_BANNER = 40;
  // Above every in-page overlay. Native SDK ads still sit in a native view
  // over the WebView, so this cannot cover those — only our HTML.
  var Z_LOG = 2147483646;
  var LOG_LIMIT = 40;

  var mount = null;
  var translate = null;
  var debug = false;

  var adEl = null;
  var spinnerEl = null;
  var bannerEl = null;
  var logHudEl = null;
  var logHudEnabled = false;

  // Live ad card state.
  var tickerRAF = null;
  var adState = null;

  // Banner state.
  var bannerHeight = 0;
  var shrinkPlayArea = false;

  function t(key, fallback) {
    if (typeof translate === "function") {
      var out = translate(key);
      if (out && out !== key) return out;
    }
    return fallback;
  }

  function css() {
    return [
      /* ---------- shared shell ---------- */
      ".kpf-ad,.kpf-ad-spinner{position:absolute;inset:0;display:none;align-items:center;",
      "justify-content:center;background:rgba(9,6,20,.72);-webkit-backdrop-filter:blur(3px);",
      "backdrop-filter:blur(3px);touch-action:none;-webkit-user-select:none;user-select:none}",
      ".kpf-ad{z-index:" + Z_AD + "}",
      ".kpf-ad-spinner{z-index:" + Z_SPINNER + ";flex-direction:column;gap:14px;padding:24px}",
      ".kpf-ad.show,.kpf-ad-spinner.show{display:flex;animation:fade .25s ease}",

      /* ---------- ad card ---------- */
      /* A real interstitial takes the whole screen, so this one does too: the
         card IS the creative, with the chrome laid over its top and bottom. */
      ".kpf-ad-card{position:relative;width:100%;height:100%;display:flex;flex-direction:column;",
      "background:linear-gradient(160deg,#4ec1f2,#241a44);font-family:inherit;overflow:hidden}",

      /* band 1: top strip */
      ".kpf-ad-top{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;",
      "gap:10px;padding:12px 16px;padding-top:calc(12px + env(safe-area-inset-top, 0px))}",
      ".kpf-ad-pill{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;",
      "color:#fff;background:rgba(9,6,20,.45);border-radius:999px;padding:5px 11px}",
      ".kpf-ad-controls{display:flex;align-items:center;gap:10px}",
      ".kpf-ad-skip{border:none;background:rgba(9,6,20,.45);border-radius:999px;font-family:inherit;",
      "font-size:13px;font-weight:700;color:#fff;padding:6px 13px;cursor:pointer;display:none}",
      ".kpf-ad-skip.show{display:block}",
      ".kpf-ad-complete{border:none;background:rgba(46,204,113,.92);border-radius:999px;font-family:inherit;",
      "font-size:13px;font-weight:700;color:#fff;padding:6px 13px;cursor:pointer;display:none}",
      ".kpf-ad-complete.show{display:block}",

      /* the countdown ring: conic-gradient, no SVG, no per-frame layout */
      ".kpf-ad-timer{position:relative;width:32px;height:32px;border-radius:50%;flex:0 0 auto;",
      "background:conic-gradient(#4ec1f2 var(--kpf-ad-p,0%),rgba(9,6,20,.45) 0);",
      "display:flex;align-items:center;justify-content:center;border:none;padding:0;font-family:inherit}",
      ".kpf-ad-timer::before{content:'';position:absolute;inset:3px;border-radius:50%;background:#fff}",
      ".kpf-ad-timer span{position:relative;font-size:12px;font-weight:800;color:#241a44;line-height:1}",
      ".kpf-ad-timer.closable{background:rgba(9,6,20,.45);cursor:pointer}",
      ".kpf-ad-timer.closable span{font-size:14px}",

      /* band 2: creative — takes every pixel the chrome does not */
      ".kpf-ad-creative{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;",
      "justify-content:center;gap:16px;color:#fff;text-align:center;padding:24px;animation:pop .35s ease}",
      ".kpf-ad-glyph{width:112px;height:112px;border-radius:30px;background:rgba(255,255,255,.92);",
      "box-shadow:0 14px 34px rgba(9,6,20,.3);position:relative;flex:0 0 auto}",
      ".kpf-ad-glyph::before{content:'';position:absolute;inset:26px;border-radius:12px;",
      "background:linear-gradient(145deg,#4ec1f2,#241a44)}",
      ".kpf-ad-title{font-size:24px;font-weight:800;letter-spacing:.2px}",
      ".kpf-ad-stars{font-size:15px;letter-spacing:3px;opacity:.9}",

      /* band 3: bottom bar, carrying the device inset for the CTA */
      ".kpf-ad-bottom{flex:0 0 auto;padding-bottom:env(safe-area-inset-bottom, 0px)}",
      ".kpf-ad-cta{display:block;width:calc(100% - 40px);max-width:420px;margin:16px auto;border:none;",
      "border-radius:999px;background:#2ecc71;box-shadow:0 5px 0 #1fa459;color:#fff;font-family:inherit;",
      "font-size:17px;font-weight:800;padding:15px 0;cursor:pointer;",
      "transition:transform .06s ease,box-shadow .06s ease}",
      ".kpf-ad-cta:active{transform:translateY(3px);box-shadow:0 2px 0 #1fa459}",

      /* reward earned strip */
      ".kpf-ad-reward{display:none;background:#eafaf1;color:#1fa459;font-size:14px;font-weight:800;",
      "text-align:center;padding:11px 12px}",
      ".kpf-ad-reward.show{display:block;animation:fade .25s ease}",

      /* band 4: debug footer */
      ".kpf-ad-foot{display:none;align-items:center;justify-content:space-between;gap:8px;",
      "padding:0 16px 12px;font-size:10px;color:rgba(255,255,255,.55)}",
      ".kpf-ad-foot.show{display:flex}",
      ".kpf-ad-foot button{border:none;background:transparent;font-family:inherit;font-size:10px;",
      "font-weight:700;color:rgba(255,255,255,.55);text-decoration:underline;padding:2px;cursor:pointer}",

      /* ---------- spinner ---------- */
      ".kpf-ad-ring{width:44px;height:44px;border-radius:50%;border:4px solid rgba(255,255,255,.25);",
      "border-top-color:#fff;animation:kpf-ad-spin .8s linear infinite}",
      ".kpf-ad-spinner-label{color:#fff;font-size:14px;font-weight:700}",
      ".kpf-ad-spinner-cancel{display:none;border:none;background:transparent;font-family:inherit;",
      "font-size:13px;font-weight:700;color:rgba(255,255,255,.75);text-decoration:underline;padding:6px;cursor:pointer}",
      ".kpf-ad-spinner-cancel.show{display:block}",
      "@keyframes kpf-ad-spin{to{transform:rotate(360deg)}}",

      /* ---------- banner ---------- */
      ".kpf-ad-banner{position:absolute;left:0;right:0;bottom:0;z-index:" + Z_BANNER + ";display:none;",
      "align-items:center;gap:10px;padding:0 12px;background:#fff;border-top:1px solid rgba(0,0,0,.08);",
      "box-shadow:0 -4px 16px rgba(0,0,0,.06);padding-bottom:env(safe-area-inset-bottom,0px);",
      "font-family:inherit;overflow:hidden}",
      ".kpf-ad-banner.show{display:flex}",
      ".kpf-ad-banner.top{top:0;bottom:auto;border-top:none;border-bottom:1px solid rgba(0,0,0,.08);",
      "box-shadow:0 4px 16px rgba(0,0,0,.06);padding-bottom:0;padding-top:env(safe-area-inset-top,0px)}",
      ".kpf-ad-banner-copy{flex:1;min-width:0;font-size:12px;font-weight:700;color:#241a44;",
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".kpf-ad-banner-chip{flex:0 0 auto;font-size:11px;font-weight:800;color:#fff;background:#2ecc71;",
      "border-radius:999px;padding:5px 12px}",

      /* ---------- layout reserve ---------- */
      /* Pad every screen by the banner height only (safe-area is already in */
      /* --ads-bottom-inset for bottom-anchored chrome). Absolute preview */
      /* stages sit inset:0, so they need their own bottom so the canvas */
      /* actually shrinks rather than drawing under the banner. */
      ".kpf-ads-shrink .screen{padding-bottom:var(--ads-banner-height,0px)}",
      ".kpf-ads-shrink #presetPickerScreen{padding-bottom:var(--ads-banner-height,0px)}",
      ".kpf-ads-shrink .preset-preview-stage{bottom:var(--ads-banner-height,0px)}",

      /* ---------- debug log HUD (body, not .app — overflow:hidden would clip) ---------- */
      ".kpf-ads-log{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));",
      "left:calc(8px + env(safe-area-inset-left,0px));z-index:" + Z_LOG + ";",
      "width:min(280px,calc(100vw - 24px));max-height:min(42vh,280px);display:none;",
      "flex-direction:column;background:rgba(9,6,20,.92);color:#fff;border-radius:12px;",
      "font-family:inherit;font-size:11px;line-height:1.35;box-shadow:0 8px 24px rgba(0,0,0,.4);",
      "overflow:hidden;pointer-events:auto;-webkit-user-select:text;user-select:text}",
      ".kpf-ads-log.show{display:flex}",
      ".kpf-ads-log.collapsed{max-height:none}",
      ".kpf-ads-log-head{flex:0 0 auto;display:flex;align-items:center;gap:6px;",
      "padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12)}",
      ".kpf-ads-log.collapsed .kpf-ads-log-head{border-bottom:none}",
      ".kpf-ads-log-title{flex:1;min-width:0;font-size:10px;font-weight:800;letter-spacing:.6px;",
      "text-transform:uppercase;color:#fff}",
      ".kpf-ads-log-head button{border:none;background:rgba(255,255,255,.12);color:#fff;",
      "font-family:inherit;font-size:10px;font-weight:700;padding:4px 8px;border-radius:999px;",
      "cursor:pointer;flex:0 0 auto}",
      ".kpf-ads-log-list{flex:1;min-height:0;overflow-y:auto;padding:6px 10px 8px;",
      "-webkit-overflow-scrolling:touch}",
      ".kpf-ads-log.collapsed .kpf-ads-log-list{display:none}",
      ".kpf-ads-log-line{padding:4px 0 4px 8px;border-left:3px solid rgba(78,193,242,.85);",
      "margin:3px 0;word-break:break-word;color:rgba(255,255,255,.88)}",
      ".kpf-ads-log-line.warn{border-left-color:#ff5a5f;color:#ffe8e8}",
      ".kpf-ads-log-line time{display:block;font-size:9px;font-weight:700;letter-spacing:.3px;",
      "color:rgba(255,255,255,.45);margin-bottom:1px}",

      /* ---------- reduced motion ---------- */
      "@media (prefers-reduced-motion:reduce){",
      ".kpf-ad-creative{animation:none}",
      ".kpf-ad-ring{animation-duration:2s}",
      ".kpf-ad.show,.kpf-ad-spinner.show,.kpf-ad-reward.show{animation:none}}"
    ].join("");
  }

  function injectCss() {
    if (!global.document) return;
    var style = global.document.getElementById(STYLE_ID);
    if (!style) {
      style = global.document.createElement("style");
      style.id = STYLE_ID;
      global.document.head.appendChild(style);
    }
    style.textContent = css();
  }

  function el(tag, className, parent) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  /* ------------------------------------------------------------------ */
  /*  Ad card                                                           */
  /* ------------------------------------------------------------------ */

  function buildAd() {
    if (adEl) return adEl;

    adEl = el("div", "kpf-ad");
    var card = el("div", "kpf-ad-card", adEl);

    var top = el("div", "kpf-ad-top", card);
    var pill = el("span", "kpf-ad-pill", top);
    pill.textContent = t("adLabel", "Ad");

    var controls = el("div", "kpf-ad-controls", top);
    var skip = el("button", "kpf-ad-skip", controls);
    skip.type = "button";
    skip.textContent = t("adSkip", "Skip");

    var complete = el("button", "kpf-ad-complete", controls);
    complete.type = "button";
    complete.textContent = t("adComplete", "Complete instantly");

    var timer = el("button", "kpf-ad-timer", controls);
    timer.type = "button";
    var timerText = el("span", null, timer);

    var creative = el("div", "kpf-ad-creative", card);
    el("div", "kpf-ad-glyph", creative);
    var title = el("div", "kpf-ad-title", creative);
    title.textContent = "Tower Blast Saga";
    var stars = el("div", "kpf-ad-stars", creative);
    stars.textContent = "★★★★★";

    // Grouped so one padding rule keeps the CTA clear of the home indicator.
    var bottom = el("div", "kpf-ad-bottom", card);

    var reward = el("div", "kpf-ad-reward", bottom);
    reward.textContent = t("adRewardEarned", "Reward earned");

    var cta = el("button", "kpf-ad-cta", bottom);
    cta.type = "button";
    cta.textContent = t("adInstall", "Install");

    var foot = el("div", "kpf-ad-foot", bottom);
    var who = el("span", null, foot);
    var footBtns = el("span", null, foot);
    var failNoFill = el("button", null, footBtns);
    failNoFill.type = "button";
    failNoFill.textContent = "no fill";
    var failShow = el("button", null, footBtns);
    failShow.type = "button";
    failShow.textContent = "fail";

    adEl._parts = {
      card: card,
      skip: skip,
      complete: complete,
      timer: timer,
      timerText: timerText,
      reward: reward,
      cta: cta,
      foot: foot,
      who: who,
      failNoFill: failNoFill,
      failShow: failShow
    };

    // Clicks are wired once and read the live adState, so there are no
    // listeners to add and remove per ad.
    timer.addEventListener("click", function () {
      if (adState && adState.closable) finishAd(null);
    });
    skip.addEventListener("click", function () {
      if (adState && adState.skippable && !adState.completed) finishAd(null);
    });
    complete.addEventListener("click", function () {
      if (!adState || adState.format !== "rewarded" || adState.completed) return;
      adState.completed = true;
      finishAd(null);
    });
    cta.addEventListener("click", function () {
      if (!adState) return;
      adState.clicked = true;
      cta.textContent = t("adInstallOpening", "Opening store…");
    });
    failNoFill.addEventListener("click", function () {
      if (adState) finishAd("not-available");
    });
    failShow.addEventListener("click", function () {
      if (adState) finishAd("failed");
    });

    mount.appendChild(adEl);
    return adEl;
  }

  function stopTicker() {
    if (tickerRAF !== null) {
      global.cancelAnimationFrame(tickerRAF);
      tickerRAF = null;
    }
  }

  function tick(now) {
    if (!adState) {
      stopTicker();
      return;
    }
    tickerRAF = global.requestAnimationFrame(tick);

    var parts = adEl._parts;
    var elapsed = now - adState.startedAt;
    var remainMs = Math.max(0, adState.durationMs - elapsed);
    var pct = adState.durationMs > 0 ? (1 - remainMs / adState.durationMs) * 100 : 100;

    parts.timer.style.setProperty("--kpf-ad-p", pct.toFixed(1) + "%");

    if (!adState.completed) {
      parts.timerText.textContent = String(Math.ceil(remainMs / 1000));
    }

    if (!adState.skippable && adState.skipAfterMs >= 0 && elapsed >= adState.skipAfterMs && remainMs > 0) {
      adState.skippable = true;
      parts.skip.classList.add("show");
    }

    if (remainMs <= 0 && !adState.completed) {
      adState.completed = true;
      adState.closable = true;
      parts.skip.classList.remove("show");
      parts.complete.classList.remove("show");
      parts.timer.classList.add("closable");
      parts.timerText.textContent = "✕";
      if (adState.format === "rewarded") parts.reward.classList.add("show");
      stopTicker();
    }
  }

  function finishAd(forced) {
    if (!adState) return;
    var state = adState;
    adState = null;
    stopTicker();
    adEl.classList.remove("show");
    state.resolve({
      completed: !!state.completed,
      forced: forced || null,
      clicked: !!state.clicked
    });
  }

  /**
   * Show the simulated ad card and resolve once it closes.
   * @param {Object} opts
   * @param {"interstitial"|"rewarded"} opts.format
   * @param {number} opts.durationMs time until the ad is closable / the reward lands
   * @param {number} [opts.skipAfterMs] rewarded only; -1 disables the skip button
   * @param {string} [opts.providerName] shown in the debug footer
   * @returns {Promise<{completed: boolean, forced: (string|null), clicked: boolean}>}
   */
  function showAd(opts) {
    injectCss();
    buildAd();
    hideSpinner();

    var parts = adEl._parts;
    var format = opts.format === "rewarded" ? "rewarded" : "interstitial";

    parts.reward.classList.remove("show");
    parts.skip.classList.remove("show");
    parts.complete.classList.remove("show");
    parts.timer.classList.remove("closable");
    parts.timer.style.setProperty("--kpf-ad-p", "0%");
    parts.cta.textContent = t("adInstall", "Install");
    parts.foot.classList.toggle("show", !!debug);
    parts.who.textContent = (opts.providerName || "fake") + " · simulated";

    var durationMs = Math.max(0, opts.durationMs || 0);
    parts.timerText.textContent = String(Math.ceil(durationMs / 1000));

    return new Promise(function (resolve) {
      adState = {
        format: format,
        durationMs: durationMs,
        skipAfterMs: format === "rewarded" && typeof opts.skipAfterMs === "number" ? opts.skipAfterMs : -1,
        startedAt: global.performance.now(),
        completed: false,
        closable: false,
        skippable: false,
        clicked: false,
        resolve: resolve
      };

      if (format === "rewarded") {
        parts.complete.classList.add("show");
        if (adState.skipAfterMs === 0) {
          adState.skippable = true;
          parts.skip.classList.add("show");
        }
      }

      adEl.classList.add("show");
      stopTicker();
      tickerRAF = global.requestAnimationFrame(tick);
    });
  }

  /** Force the card away without resolving as a normal close. */
  function hideAd() {
    if (adState) finishAd("failed");
    if (adEl) adEl.classList.remove("show");
  }

  /* ------------------------------------------------------------------ */
  /*  Spinner                                                           */
  /* ------------------------------------------------------------------ */

  function buildSpinner() {
    if (spinnerEl) return spinnerEl;

    spinnerEl = el("div", "kpf-ad-spinner");
    el("div", "kpf-ad-ring", spinnerEl);
    var label = el("div", "kpf-ad-spinner-label", spinnerEl);
    label.textContent = t("adLoading", "Loading ad…");
    var cancel = el("button", "kpf-ad-spinner-cancel", spinnerEl);
    cancel.type = "button";
    cancel.textContent = t("adCancel", "Cancel");

    spinnerEl._parts = { label: label, cancel: cancel };
    spinnerEl._cancelTimer = null;
    spinnerEl._onCancel = null;

    cancel.addEventListener("click", function () {
      if (typeof spinnerEl._onCancel === "function") spinnerEl._onCancel();
    });

    mount.appendChild(spinnerEl);
    return spinnerEl;
  }

  /**
   * @param {Object} [opts]
   * @param {number} [opts.cancelAfterMs] show a cancel button after this long; omit for none
   * @param {Function} [opts.onCancel]
   */
  function showSpinner(opts) {
    opts = opts || {};
    injectCss();
    buildSpinner();

    spinnerEl._parts.label.textContent = t("adLoading", "Loading ad…");
    spinnerEl._parts.cancel.classList.remove("show");
    spinnerEl._onCancel = typeof opts.onCancel === "function" ? opts.onCancel : null;

    if (spinnerEl._cancelTimer) {
      global.clearTimeout(spinnerEl._cancelTimer);
      spinnerEl._cancelTimer = null;
    }
    if (spinnerEl._onCancel && typeof opts.cancelAfterMs === "number" && opts.cancelAfterMs >= 0) {
      spinnerEl._cancelTimer = global.setTimeout(function () {
        if (spinnerEl) spinnerEl._parts.cancel.classList.add("show");
      }, opts.cancelAfterMs);
    }

    spinnerEl.classList.add("show");
  }

  function hideSpinner() {
    if (!spinnerEl) return;
    if (spinnerEl._cancelTimer) {
      global.clearTimeout(spinnerEl._cancelTimer);
      spinnerEl._cancelTimer = null;
    }
    spinnerEl._onCancel = null;
    spinnerEl._parts.cancel.classList.remove("show");
    spinnerEl.classList.remove("show");
  }

  /* ------------------------------------------------------------------ */
  /*  Banner                                                            */
  /* ------------------------------------------------------------------ */

  var BANNER_SIZES = {
    regular: 50,
    large: 90,
    rectangle: 250
  };

  function buildBanner() {
    if (bannerEl) return bannerEl;

    bannerEl = el("div", "kpf-ad-banner");
    var pill = el("span", "kpf-ad-pill", bannerEl);
    pill.textContent = t("adLabel", "Ad");
    var copy = el("span", "kpf-ad-banner-copy", bannerEl);
    copy.textContent = "Tower Blast Saga — build your empire";
    var chip = el("span", "kpf-ad-banner-chip", bannerEl);
    chip.textContent = t("adInstall", "Install");

    bannerEl._parts = { pill: pill, copy: copy, chip: chip };
    mount.appendChild(bannerEl);
    return bannerEl;
  }

  /**
   * @param {Object} opts
   * @param {number} [opts.heightPx] explicit height; otherwise derived from size
   * @param {string} [opts.size] "regular" | "large" | "rectangle"
   * @param {string} [opts.position] "bottom" | "top"
   * @returns {number} measured height in CSS px
   */
  function showBanner(opts) {
    opts = opts || {};
    injectCss();
    buildBanner();

    var size = BANNER_SIZES[opts.size] ? opts.size : "regular";
    var height = typeof opts.heightPx === "number" && opts.heightPx > 0 ? opts.heightPx : BANNER_SIZES[size];

    bannerEl.style.height = height + "px";
    bannerEl.classList.toggle("top", opts.position === "top");
    bannerEl.classList.add("show");

    // Measure rather than assume, so the reserve matches what is really drawn.
    bannerHeight = Math.round(bannerEl.getBoundingClientRect().height) || height;
    return bannerHeight;
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove("show");
    bannerHeight = 0;
  }

  function destroyBanner() {
    hideBanner();
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function getBannerHeight() {
    return bannerHeight;
  }

  /* ------------------------------------------------------------------ */
  /*  Layout reserve                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Publish how much space the bottom of the layout must give up. Bottom-anchored
   * game UI reads var(--ads-bottom-inset), so one write moves all of it.
   * @param {number} heightPx banner height excluding the device inset
   */
  function setBottomInset(heightPx) {
    if (!mount) return;
    var h = Math.max(0, heightPx || 0);
    mount.style.setProperty("--ads-banner-height", h + "px");
    mount.style.setProperty(
      "--ads-bottom-inset",
      h > 0 ? "calc(" + h + "px + env(safe-area-inset-bottom, 0px))" : "env(safe-area-inset-bottom, 0px)"
    );
    mount.classList.toggle("kpf-ads-shrink", shrinkPlayArea && h > 0);
  }

  /* ------------------------------------------------------------------ */
  /*  Debug log HUD                                                     */
  /* ------------------------------------------------------------------ */

  function logHost() {
    return (global.document && global.document.body) || mount;
  }

  function clockStamp() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function buildLogHud() {
    if (logHudEl || !debug || !global.document) return logHudEl;

    var host = logHost();
    if (!host) return null;

    logHudEl = el("div", "kpf-ads-log");
    var head = el("div", "kpf-ads-log-head", logHudEl);
    var title = el("div", "kpf-ads-log-title", head);
    title.textContent = "Ads log";

    var closeBtn = el("button", null, head);
    closeBtn.type = "button";
    closeBtn.textContent = "Close";

    var clearBtn = el("button", null, head);
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";

    var list = el("div", "kpf-ads-log-list", logHudEl);

    logHudEl._parts = { title: title, closeBtn: closeBtn, clearBtn: clearBtn, list: list };

    closeBtn.addEventListener("click", function () {
      setLogHudEnabled(false);
    });
    clearBtn.addEventListener("click", function () {
      clearLogs();
    });

    host.appendChild(logHudEl);
    return logHudEl;
  }

  /**
   * Append a line to the on-screen HUD. No-op when debugLogs is off.
   * @param {"log"|"warn"} kind
   * @param {string} message
   */
  function pushLog(kind, message) {
    if (!debug) return;
    injectCss();
    buildLogHud();
    if (!logHudEl) return;

    var list = logHudEl._parts.list;
    var line = el("div", "kpf-ads-log-line" + (kind === "warn" ? " warn" : ""));
    var time = el("time", null, line);
    time.textContent = clockStamp();
    var body = el("span", null, line);
    body.textContent = message == null ? "" : String(message);
    list.appendChild(line);

    while (list.childNodes.length > LOG_LIMIT) list.removeChild(list.firstChild);
    if (logHudEnabled) logHudEl.classList.add("show");
    list.scrollTop = list.scrollHeight;
  }

  function clearLogs() {
    if (!logHudEl) return;
    logHudEl._parts.list.textContent = "";
  }

  function publishLogHudEnabled() {
    if (!global.dispatchEvent) return;
    try {
      global.dispatchEvent(new CustomEvent("kpf-ads-loghud", { detail: { enabled: logHudEnabled } }));
    } catch (err) {}
  }

  /**
   * The HUD is off until this is true. debugLogs must also be on.
   * @param {boolean} on
   */
  function setLogHudEnabled(on) {
    logHudEnabled = !!on && debug;
    if (logHudEnabled) {
      injectCss();
      buildLogHud();
      if (logHudEl) logHudEl.classList.add("show");
    } else if (logHudEl) {
      logHudEl.classList.remove("show");
    }
    publishLogHudEnabled();
  }

  function getLogHudEnabled() {
    return !!logHudEnabled;
  }

  /* ------------------------------------------------------------------ */

  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.mount element the overlays attach to (usually .app)
   * @param {Function} [opts.translate] i18n lookup
   * @param {boolean} [opts.debug] show the in-ad debug failure buttons + log HUD
   * @param {boolean} [opts.shrinkPlayArea] pad #gameScreen by the banner reserve
   */
  function init(opts) {
    opts = opts || {};
    mount = opts.mount || (global.document && global.document.body) || null;
    translate = typeof opts.translate === "function" ? opts.translate : null;
    debug = !!opts.debug;
    shrinkPlayArea = !!opts.shrinkPlayArea;
    injectCss();
    setBottomInset(0);
    if (!debug) {
      logHudEnabled = false;
      if (logHudEl) logHudEl.classList.remove("show");
    }
  }

  global.AdsOverlay = {
    init: init,
    showAd: showAd,
    hideAd: hideAd,
    showSpinner: showSpinner,
    hideSpinner: hideSpinner,
    showBanner: showBanner,
    hideBanner: hideBanner,
    destroyBanner: destroyBanner,
    getBannerHeight: getBannerHeight,
    setBottomInset: setBottomInset,
    pushLog: pushLog,
    clearLogs: clearLogs,
    setLogHudEnabled: setLogHudEnabled,
    getLogHudEnabled: getLogHudEnabled
  };
})(typeof window !== "undefined" ? window : globalThis);
