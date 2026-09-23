// Locks the app shell to a stable pixel size so transient viewport shrinks
// (Android screenshot share sheet, soft keyboard) do not reflow the game canvas.

(function (global) {
  "use strict";

  var root = null;
  var onResize = null;
  var lockedW = 0;
  var lockedH = 0;

  function measure() {
    var doc = global.document && global.document.documentElement;
    return {
      width: Math.max(1, Math.round(global.innerWidth || (doc && doc.clientWidth) || 1)),
      height: Math.max(1, Math.round(global.innerHeight || (doc && doc.clientHeight) || 1))
    };
  }

  function applySize(w, h) {
    if (!root) return;
    lockedW = w;
    lockedH = h;
    root.style.width = w + "px";
    root.style.height = h + "px";
  }

  // Apply when width changes or height grows; ignore height-only shrinks.
  function shouldApply(nextW, nextH) {
    if (!lockedW || !lockedH) return true;
    if (nextW !== lockedW) return true;
    if (nextH >= lockedH) return true;
    return false;
  }

  function sync(force) {
    var size = measure();
    if (!force && !shouldApply(size.width, size.height)) return;
    if (size.width === lockedW && size.height === lockedH) return;
    applySize(size.width, size.height);
    if (typeof onResize === "function") onResize();
  }

  function init(opts) {
    opts = opts || {};
    root = opts.root || null;
    onResize = typeof opts.onResize === "function" ? opts.onResize : null;
    if (!root) return;

    // Pin to the top so an oversized shell (taller than a shrunk WebView) is
    // not vertically centered — which would look like the canvas shifting up.
    if (global.document && global.document.body) {
      global.document.body.style.alignItems = "flex-start";
    }

    var size = measure();
    applySize(size.width, size.height);

    global.addEventListener("resize", function () {
      sync(false);
    });

    if (global.visualViewport && typeof global.visualViewport.addEventListener === "function") {
      global.visualViewport.addEventListener("resize", function () {
        sync(false);
      });
    }

    var capacitorApp =
      global.Capacitor &&
      global.Capacitor.Plugins &&
      global.Capacitor.Plugins.App;
    if (capacitorApp && typeof capacitorApp.addListener === "function") {
      try {
        capacitorApp.addListener("appStateChange", function (state) {
          if (state && state.isActive) sync(true);
        });
      } catch (e) {
        /* plugin may throw if unavailable */
      }
    }
  }

  global.ViewportLock = {
    init: init
  };
})(typeof window !== "undefined" ? window : this);
