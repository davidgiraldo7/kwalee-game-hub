(function (w) {
  "use strict";
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
