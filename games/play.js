(function (global) {
  "use strict";

  function el(tag, opts, kids) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    if (opts.style) Object.keys(opts.style).forEach(function (k) { node.style[k] = opts.style[k]; });
    if (opts.onClick) node.addEventListener("click", opts.onClick);
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function sendScore(score, streak) {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "kwalee.reward", xp: 10, coins: 1, score: Number(score) || 0, streak: Number(streak) || 0 }, "*");
  }

  function statsStrip(defs) {
    var refs = {};
    var wrap = el("div", { className: "stats" }, defs.map(function (d) {
      var value = el("div", { className: "stat-v" + (d.tone ? " " + d.tone : ""), text: d.value });
      refs[d.key] = value;
      return el("div", null, [value, el("div", { className: "stat-l", text: d.label })]);
    }));
    return {
      el: wrap,
      set: function (key, value, tone) {
        var node = refs[key];
        if (!node) return;
        node.textContent = value;
        node.className = "stat-v" + (tone ? " " + tone : "");
      }
    };
  }

  function makeStage(logicalW, logicalH) {
    var canvas = el("canvas", { className: "stage" });
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    canvas.style.aspectRatio = logicalW + " / " + logicalH;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {
      canvas: canvas,
      ctx: ctx,
      w: logicalW,
      h: logicalH,
      point: function (clientX, clientY) {
        var r = canvas.getBoundingClientRect();
        return {
          x: (clientX - r.left) / r.width * logicalW,
          y: (clientY - r.top) / r.height * logicalH
        };
      },
      clear: function () {
        ctx.fillStyle = "#141414";
        ctx.fillRect(0, 0, logicalW, logicalH);
      }
    };
  }

  global.Play = { el: el, sendScore: sendScore, statsStrip: statsStrip, makeStage: makeStage };
})(this);
