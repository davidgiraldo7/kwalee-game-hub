(function (w) {
  "use strict";
  if (w.KwaleeGameplayBgm) return;
  if (w.parent && w.parent !== w) {
    w.KwaleeGameplayBgm = { start: function () {}, setEnabled: function () {} };
    return;
  }

  var NativeAC = w.AudioContext || w.webkitAudioContext;
  var script = document.currentScript;
  var sources = [];
  if (script && script.src) sources.push(new URL("audio/gameplay-loop.mp3", script.src).href);
  sources.push(new URL("audio/gameplay-loop.mp3", w.location.href).href);
  sources.push("https://davidgiraldo7.github.io/kwalee-game-hub/games/audio/gameplay-loop.mp3");

  var ctx = null;
  var buffer = null;
  var node = null;
  var gain = null;
  var wanted = true;
  var loading = false;

  function uniqueSources() {
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < sources.length; i++) {
      if (sources[i] && !seen[sources[i]]) {
        seen[sources[i]] = true;
        out.push(sources[i]);
      }
    }
    return out;
  }

  function musicToggleOn() {
    var toggle = w.document && w.document.getElementById("toggleMusic");
    if (toggle) return !!toggle.checked;
    return wanted;
  }

  function ensureCtx() {
    if (!NativeAC) return null;
    if (!ctx) ctx = new NativeAC();
    if (ctx.state === "suspended") ctx.resume().catch(function () { /* wait for a gesture */ });
    return ctx;
  }

  function stopNode() {
    if (node) {
      try { node.stop(); } catch (err) { /* ignore */ }
      try { node.disconnect(); } catch (err) { /* ignore */ }
      node = null;
    }
  }

  function connectLoop() {
    if (!buffer || !wanted || !musicToggleOn()) return;
    var c = ensureCtx();
    if (!c || c.state === "suspended") return;
    stopNode();
    if (!gain) {
      gain = c.createGain();
      gain.gain.value = 0.55;
      gain.connect(c.destination);
    }
    node = c.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.connect(gain);
    node.start();
  }

  function decode(c, raw) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function ok(buf) { if (!done) { done = true; resolve(buf); } }
      function fail(err) { if (!done) { done = true; reject(err || new Error("decode")); } }
      try {
        var p = c.decodeAudioData(raw, ok, fail);
        if (p && typeof p.then === "function") p.then(ok, fail);
      } catch (err) { fail(err); }
    });
  }

  function load(i) {
    var list = uniqueSources();
    if (buffer || loading) {
      connectLoop();
      return;
    }
    if (i >= list.length) return;
    loading = true;
    fetch(list[i], { credentials: "omit" }).then(function (res) {
      if (!res.ok) throw new Error("bgm " + res.status);
      return res.arrayBuffer();
    }).then(function (raw) {
      var c = ensureCtx();
      if (!c) throw new Error("no audio");
      return decode(c, raw.slice(0));
    }).then(function (decoded) {
      buffer = decoded;
      loading = false;
      connectLoop();
    }).catch(function () {
      loading = false;
      load(i + 1);
    });
  }

  function start() {
    ensureCtx();
    if (buffer) connectLoop();
    else load(0);
  }

  function setEnabled(on) {
    wanted = !!on;
    if (wanted && musicToggleOn()) start();
    else stopNode();
  }

  w.KwaleeGameplayBgm = { start: start, setEnabled: setEnabled };
  if (typeof w.playBackgroundAudio !== "function") w.playBackgroundAudio = start;

  w.setInterval(function () {
    if (!wanted || !musicToggleOn()) return;
    var c = ctx || ensureCtx();
    if (c && c.state === "suspended") {
      c.resume().then(function () { if (buffer && !node) connectLoop(); }).catch(function () {});
    } else if (buffer && !node) {
      connectLoop();
    }
  }, 500);

  w.addEventListener("message", function (e) {
    var data = e.data;
    if (data && data.type === "kwalee.unlockAudio") start();
    if (data && data.type === "kwalee.suspendAudio") stopNode();
  });
  if (w.document) {
    w.document.addEventListener("pointerdown", start, true);
    w.document.addEventListener("change", function (e) {
      if (e.target && e.target.id === "toggleMusic") setEnabled(e.target.checked);
    }, true);
  }
})(window);
