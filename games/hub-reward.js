(function (w) {
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

  function unlockAudio() {
    var i;
    for (i = 0; i < contexts.length; i++) {
      try {
        if (contexts[i] && contexts[i].state === "suspended") contexts[i].resume();
      } catch (err) { /* ignore */ }
    }
    try {
      var media = w.document && w.document.querySelectorAll("audio, video");
      if (media) {
        for (i = 0; i < media.length; i++) {
          var el = media[i];
          if (el.paused) el.play().catch(function () { /* autoplay still blocked */ });
        }
      }
    } catch (err) { /* ignore */ }
  }
  w.KwaleeUnlockAudio = unlockAudio;

  w.addEventListener("message", function (e) {
    var data = e.data;
    if (data && data.type === "kwalee.unlockAudio") unlockAudio();
  });
  if (w.document) {
    w.document.addEventListener("pointerdown", unlockAudio, true);
    w.document.addEventListener("touchstart", unlockAudio, true);
    w.document.addEventListener("click", unlockAudio, true);
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
  var n = 0;
  var timer = w.setInterval(function () {
    tryWrap();
    n += 1;
    if (n > 40) w.clearInterval(timer);
  }, 200);
})(window);
