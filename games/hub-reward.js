(function (w) {
  // vis6-hidden-fix: never re-read patched document.hidden
  "use strict";

  var NativeAC = w.AudioContext || w.webkitAudioContext;
  var contexts = [];
  if (NativeAC && !NativeAC.__kwaleeWrapped) {
    function WrappedAudioContext(opts) {
      var ctx = new NativeAC(opts);
      contexts.push(ctx);
      return ctx;
    }
    WrappedAudioContext.prototype = NativeAC.prototype;
    WrappedAudioContext.__kwaleeWrapped = true;
    w.AudioContext = WrappedAudioContext;
    if ("webkitAudioContext" in w) w.webkitAudioContext = WrappedAudioContext;
  }

  var unlocking = false;
  var silenced = false;
  var nativeHiddenGet = null;
  var nativeVisGet = null;
  try {
    var hiddenDesc = Object.getOwnPropertyDescriptor(w.Document.prototype, "hidden")
      || Object.getOwnPropertyDescriptor(w.HTMLDocument.prototype, "hidden");
    nativeHiddenGet = hiddenDesc && hiddenDesc.get;
    var visDesc = Object.getOwnPropertyDescriptor(w.Document.prototype, "visibilityState")
      || Object.getOwnPropertyDescriptor(w.HTMLDocument.prototype, "visibilityState");
    nativeVisGet = visDesc && visDesc.get;
  } catch (err) { /* ignore */ }

  function nativeDocHidden() {
    try {
      if (nativeHiddenGet) return !!nativeHiddenGet.call(w.document);
    } catch (err) { /* ignore */ }
    return false;
  }

  function parentHidden() {
    try {
      if (w.parent && w.parent !== w) return !!w.parent.document.hidden;
    } catch (err) {
      // Cross-origin hub (Game Vault wrapping GitHub games). Never read
      // this document.hidden here — the patched getter would recurse.
      return false;
    }
    return nativeDocHidden();
  }

  if (w.parent && w.parent !== w) {
    try {
      Object.defineProperty(w.document, "hidden", {
        configurable: true,
        get: function () { return parentHidden(); }
      });
      Object.defineProperty(w.document, "visibilityState", {
        configurable: true,
        get: function () {
          if (parentHidden()) return "hidden";
          try {
            if (nativeVisGet) return nativeVisGet.call(w.document) || "visible";
          } catch (err) { /* ignore */ }
          return "visible";
        }
      });
    } catch (err) { /* ignore */ }
    w.addEventListener("pagehide", function (e) {
      if (!parentHidden()) e.stopImmediatePropagation();
    }, true);
  }

  function eachMedia(fn) {
    try {
      var media = w.document && w.document.querySelectorAll("audio, video");
      if (!media) return;
      var i;
      for (i = 0; i < media.length; i++) fn(media[i]);
    } catch (err) { /* ignore */ }
  }

  function pingChildFrames(type) {
    try {
      var frames = w.document && w.document.querySelectorAll("iframe");
      if (!frames) return;
      var i;
      for (i = 0; i < frames.length; i++) {
        try { frames[i].contentWindow.postMessage({ type: type }, "*"); } catch (err) { /* ignore */ }
      }
    } catch (err) { /* ignore */ }
  }

  function suspendAudio() {
    silenced = true;
    var i;
    for (i = 0; i < contexts.length; i++) {
      try {
        if (contexts[i] && contexts[i].state !== "closed") contexts[i].suspend();
      } catch (err) { /* ignore */ }
    }
    eachMedia(function (el) {
      try { el.pause(); } catch (err) { /* ignore */ }
      try { el.currentTime = 0; } catch (err) { /* ignore */ }
    });
    pingChildFrames("kwalee.suspendAudio");
  }

  function unlockAudio() {
    if (unlocking || silenced) return;
    unlocking = true;
    var i;
    for (i = 0; i < contexts.length; i++) {
      try {
        if (contexts[i] && contexts[i].state === "suspended") contexts[i].resume();
      } catch (err) { /* ignore */ }
    }
    eachMedia(function (el) {
      if (el.paused && el.hasAttribute("autoplay")) {
        el.play().catch(function () { /* autoplay still blocked */ });
      }
    });
    pingChildFrames("kwalee.unlockAudio");
    try {
      if (typeof w.playBackgroundAudio === "function") w.playBackgroundAudio();
    } catch (err) { /* ignore */ }
    try {
      var opts = { bubbles: true, cancelable: true };
      if (w.PointerEvent) w.document.dispatchEvent(new w.PointerEvent("pointerdown", opts));
      else w.document.dispatchEvent(new w.Event("pointerdown", opts));
    } catch (err) { /* ignore */ }
    unlocking = false;
  }

  w.KwaleeUnlockAudio = unlockAudio;
  w.KwaleeSuspendAudio = suspendAudio;

  w.addEventListener("message", function (e) {
    var data = e.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (err) { return; }
    }
    if (!data || typeof data !== "object") return;
    if ((data.type === "kwalee.reward" || data.type === "kwalee.score") && w.parent !== w && e.source !== w.parent) {
      try { w.parent.postMessage(data, "*"); } catch (err) { /* ignore */ }
    }
    if (data.type === "kwalee.unlockAudio") {
      silenced = false;
      unlockAudio();
    }
    if (data.type === "kwalee.suspendAudio") suspendAudio();
  });
  if (w.document) {
    w.document.addEventListener("pointerdown", function () {
      if (!silenced) unlockAudio();
    }, true);
  }

  var last = 0;
  function send() {
    if (w.parent === w) return;
    var now = Date.now();
    if (now - last < 800) return;
    last = now;
    try {
      w.parent.postMessage({ type: "kwalee.reward", xp: 10, coins: 1 }, "*");
    } catch (err) { /* ignore */ }
  }
  w.KwaleeHubReward = send;
  function wrap(name) {
    var orig = w[name];
    if (typeof orig !== "function" || orig._kwaleeReward) return;
    var wrapped = function () {
      send();
      return orig.apply(this, arguments);
    };
    wrapped._kwaleeReward = true;
    w[name] = wrapped;
  }
  function tryWrap() {
    wrap("levelComplete");
  }
  tryWrap();
  if (w.document) {
    w.document.addEventListener("kpf:levelCompleted", send);
  }
  w.setInterval(tryWrap, 500);

  w.setInterval(function () {
    if (silenced || parentHidden()) return;
    var i;
    for (i = 0; i < contexts.length; i++) {
      try {
        if (contexts[i] && contexts[i].state === "suspended") contexts[i].resume();
      } catch (err) { /* ignore */ }
    }
  }, 400);
})(window);
