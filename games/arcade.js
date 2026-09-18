(function (global) {
  "use strict";

  function el(tag, opts, kids) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.html) node.innerHTML = opts.html;
    if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    if (opts.style) Object.keys(opts.style).forEach(function (k) { node.style[k] = opts.style[k]; });
    if (opts.onClick) node.addEventListener("click", opts.onClick);
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function sendScore(score, streak) {
    if (window.parent === window) return;
    window.parent.postMessage({
      type: "kwalee.score",
      score: Number(score) || 0,
      streak: Number(streak) || 0
    }, "*");
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function pointer(target, handlers) {
    function local(e) {
      var r = target.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId };
    }
    target.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try { target.setPointerCapture(e.pointerId); } catch (err) {}
      if (handlers.down) handlers.down(local(e), e);
    });
    target.addEventListener("pointermove", function (e) {
      if (handlers.move) handlers.move(local(e), e);
    });
    function up(e) {
      if (handlers.up) handlers.up(local(e), e);
    }
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function boot(opts) {
    document.body.dataset.theme = opts.theme || "sand";
    document.body.innerHTML = "";
    var level = 0;
    var score = 0;
    var handlers = { undo: null, extra: null };
    var undoBtn = el("button", { className: "pill icon", text: "↩", attrs: { type: "button", "aria-label": "Undo" } });
    var restartBtn = el("button", { className: "pill icon", text: "↻", attrs: { type: "button", "aria-label": "Restart" } });
    var levelPill = el("div", { className: "pill", text: "1/" + opts.levelCount });
    var title = el("div", { className: "title", text: opts.title });
    var hint = el("p", { className: "hint", text: opts.hint || "" });
    var board = el("div", { className: "board" });
    var overlay = el("div", { className: "overlay" });
    var cardTitle = el("h2", { text: "Nice!" });
    var cardText = el("p", { text: "" });
    var cardBtn = el("button", { text: "Next" });
    overlay.appendChild(el("div", { className: "card" }, [cardTitle, cardText, cardBtn]));
    var hudKids = [levelPill, title, undoBtn, restartBtn];
    if (opts.extra) hudKids.splice(2, 0, opts.extra);
    var shell = el("div", { className: "shell" }, [
      el("div", { className: "hud" }, hudKids),
      hint,
      board
    ]);
    shell.appendChild(overlay);
    document.body.appendChild(shell);

    function setLevelLabel() {
      levelPill.textContent = (level + 1) + "/" + opts.levelCount;
    }

    function startLevel() {
      overlay.classList.remove("show");
      board.innerHTML = "";
      hint.textContent = opts.hint || "";
      setLevelLabel();
      opts.start(level, api);
    }

    var api = {
      board: board,
      hint: hint,
      extra: opts.extra || null,
      setHint: function (text) { hint.textContent = text; },
      onUndo: function (fn) { handlers.undo = fn; },
      win: function (pts) {
        score += pts || 100;
        sendScore(score, level + 1);
        var last = level + 1 >= opts.levelCount;
        cardTitle.textContent = last ? "Cleared!" : "Nice!";
        cardText.textContent = last
          ? "Score " + score + " · every board done."
          : "Level " + (level + 1) + " clear · score " + score;
        cardBtn.textContent = last ? "Play again" : "Next";
        overlay.classList.add("show");
        cardBtn.onclick = function () {
          if (last) { level = 0; score = 0; }
          else level += 1;
          startLevel();
        };
      },
      fail: function (msg) {
        cardTitle.textContent = "Stuck";
        cardText.textContent = msg || "No moves left. Try again.";
        cardBtn.textContent = "Restart";
        overlay.classList.add("show");
        cardBtn.onclick = startLevel;
      }
    };

    undoBtn.addEventListener("click", function () { if (handlers.undo) handlers.undo(); });
    restartBtn.addEventListener("click", startLevel);
    requestAnimationFrame(startLevel);
    return api;
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function rectFill(opts) {
    boot({
      title: opts.title,
      theme: opts.theme,
      hint: opts.hint,
      levelCount: opts.levels.length,
      start: function (index, api) {
        var L = opts.levels[index];
        var pieces = L.pieces.map(function (p) {
          return { r: p.r, c: p.c, n: p.n, color: p.color, cells: [{ r: p.r, c: p.c }] };
        });
        var history = [];
        var drag = null;
        var canvas = el("canvas", { className: "stage" });
        api.board.appendChild(canvas);
        var ctx = canvas.getContext("2d");

        function snapshot() {
          return JSON.stringify(pieces.map(function (p) {
            return p.cells.map(function (c) { return c.r + "," + c.c; });
          }));
        }

        function occupied(skip) {
          var map = {};
          pieces.forEach(function (p, i) {
            if (i === skip) return;
            p.cells.forEach(function (c) { map[c.r + "," + c.c] = i; });
          });
          return map;
        }

        function pieceAt(r, c) {
          for (var i = 0; i < pieces.length; i++) {
            for (var j = 0; j < pieces[i].cells.length; j++) {
              var cell = pieces[i].cells[j];
              if (cell.r === r && cell.c === c) return i;
            }
          }
          return -1;
        }

        function metrics() {
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          var w = api.board.clientWidth;
          var h = api.board.clientHeight;
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
          canvas.style.width = w + "px";
          canvas.style.height = h + "px";
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          var pad = 14;
          var gap = 6;
          var size = Math.min((w - pad * 2) / L.cols, (h - pad * 2) / L.rows);
          var gw = size * L.cols;
          var gh = size * L.rows;
          return { padX: (w - gw) / 2, padY: (h - gh) / 2, size: size, gap: gap, w: w, h: h };
        }

        function cellFrom(pt, m) {
          var c = Math.floor((pt.x - m.padX) / m.size);
          var r = Math.floor((pt.y - m.padY) / m.size);
          if (r < 0 || c < 0 || r >= L.rows || c >= L.cols) return null;
          return { r: r, c: c };
        }

        function validRect(piece, r0, c0, r1, c1, skip) {
          var minR = Math.min(r0, r1);
          var maxR = Math.max(r0, r1);
          var minC = Math.min(c0, c1);
          var maxC = Math.max(c0, c1);
          var h = maxR - minR + 1;
          var w = maxC - minC + 1;
          if (w * h !== piece.n) return null;
          if (piece.r < minR || piece.r > maxR || piece.c < minC || piece.c > maxC) return null;
          var used = occupied(skip);
          var cells = [];
          for (var r = minR; r <= maxR; r++) {
            for (var c = minC; c <= maxC; c++) {
              if (used[r + "," + c] != null) return null;
              cells.push({ r: r, c: c });
            }
          }
          return cells;
        }

        function allFilled() {
          var n = 0;
          for (var i = 0; i < pieces.length; i++) {
            if (pieces[i].cells.length !== pieces[i].n) return false;
            n += pieces[i].cells.length;
          }
          return n === L.cols * L.rows;
        }

        function draw() {
          var m = metrics();
          ctx.clearRect(0, 0, m.w, m.h);
          roundRect(ctx, m.padX - 8, m.padY - 8, L.cols * m.size + 16, L.rows * m.size + 16, 22);
          ctx.fillStyle = opts.board || "#e8d3ae";
          ctx.fill();
          var g = m.gap;
          var inn = m.size - g;
          var r;
          var c;
          for (r = 0; r < L.rows; r++) {
            for (c = 0; c < L.cols; c++) {
              roundRect(ctx, m.padX + c * m.size + g / 2, m.padY + r * m.size + g / 2, inn, inn, 10);
              ctx.fillStyle = "rgba(255,255,255,.35)";
              ctx.fill();
            }
          }
          var preview = drag && drag.cells;
          pieces.forEach(function (p, i) {
            var cells = (drag && drag.index === i && preview) ? preview : p.cells;
            if (!cells.length) return;
            var minR = cells[0].r, maxR = cells[0].r, minC = cells[0].c, maxC = cells[0].c;
            cells.forEach(function (cell) {
              minR = Math.min(minR, cell.r); maxR = Math.max(maxR, cell.r);
              minC = Math.min(minC, cell.c); maxC = Math.max(maxC, cell.c);
            });
            var x = m.padX + minC * m.size + g / 2;
            var y = m.padY + minR * m.size + g / 2;
            var w = (maxC - minC + 1) * m.size - g;
            var h = (maxR - minR + 1) * m.size - g;
            var ok = !drag || drag.index !== i || drag.ok !== false;
            roundRect(ctx, x, y + 5, w, h - 5, 14);
            ctx.fillStyle = shade(p.color, -40);
            ctx.fill();
            roundRect(ctx, x, y, w, h - 5, 14);
            ctx.fillStyle = ok ? p.color : "#ff6b6b";
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "900 " + Math.max(18, Math.min(w, h) * 0.42) + "px Trebuchet MS, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(p.n), x + w / 2, y + (h - 5) / 2);
          });
        }

        pointer(canvas, {
          down: function (pt) {
            var m = metrics();
            var cell = cellFrom(pt, m);
            if (!cell) return;
            var i = pieceAt(cell.r, cell.c);
            if (i < 0) return;
            history.push(snapshot());
            pieces[i].cells = [{ r: pieces[i].r, c: pieces[i].c }];
            drag = { index: i, cells: pieces[i].cells, ok: true };
            draw();
          },
          move: function (pt) {
            if (!drag) return;
            var m = metrics();
            var cell = cellFrom(pt, m);
            var p = pieces[drag.index];
            if (!cell) {
              drag.cells = [{ r: p.r, c: p.c }];
              drag.ok = false;
              draw();
              return;
            }
            var cells = validRect(p, p.r, p.c, cell.r, cell.c, drag.index);
            drag.ok = !!cells;
            drag.cells = cells || [{ r: p.r, c: p.c }];
            draw();
          },
          up: function () {
            if (!drag) return;
            if (drag.ok && drag.cells.length === pieces[drag.index].n) {
              pieces[drag.index].cells = drag.cells;
            } else {
              history.pop();
              pieces[drag.index].cells = [{ r: pieces[drag.index].r, c: pieces[drag.index].c }];
            }
            drag = null;
            draw();
            if (allFilled()) api.win(120);
          }
        });

        api.onUndo(function () {
          if (!history.length) return;
          var prev = JSON.parse(history.pop());
          pieces.forEach(function (p, i) {
            p.cells = prev[i].map(function (s) {
              var parts = s.split(",");
              return { r: +parts[0], c: +parts[1] };
            });
          });
          drag = null;
          draw();
        });

        window.addEventListener("resize", draw);
        draw();
      }
    });
  }

  global.Arcade = {
    el: el,
    boot: boot,
    pointer: pointer,
    sendScore: sendScore,
    roundRect: roundRect,
    shade: shade,
    rectFill: rectFill
  };
})(window);
