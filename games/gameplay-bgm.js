(function (w) {
  "use strict";
  if (w.KwaleeGameplayBgm) return;

  var script = document.currentScript;
  var src = new URL("audio/gameplay-loop.mp3", script && script.src ? script.src : w.location.href).href;
  var el = new Audio();
  el.preload = "auto";
  el.loop = true;
  el.playsInline = true;
  el.crossOrigin = "anonymous";
  el.src = src;
  el.volume = 0.42;

  var wanted = true;
  var unlocked = false;

  function musicToggleOn() {
    var toggle = w.document.getElementById("toggleMusic");
    if (toggle) return !!toggle.checked;
    return wanted;
  }

  function start() {
    unlocked = true;
    if (!musicToggleOn()) {
      try { el.pause(); } catch (err) { /* ignore */ }
      return;
    }
    var play = el.play();
    if (play && play.catch) play.catch(function () { /* wait for a gesture */ });
  }

  function setEnabled(on) {
    wanted = !!on;
    if (!unlocked) return;
    if (wanted && musicToggleOn()) start();
    else try { el.pause(); } catch (err) { /* ignore */ }
  }

  w.KwaleeGameplayBgm = { start: start, setEnabled: setEnabled, el: el };

  w.addEventListener("message", function (e) {
    var data = e.data;
    if (data && data.type === "kwalee.unlockAudio") start();
    if (data && data.type === "kwalee.suspendAudio") {
      try { el.pause(); } catch (err) { /* ignore */ }
    }
  });
  if (w.document) {
    w.document.addEventListener("pointerdown", start, true);
    w.document.addEventListener("change", function (e) {
      if (e.target && e.target.id === "toggleMusic") setEnabled(e.target.checked);
    }, true);
  }
})(window);
