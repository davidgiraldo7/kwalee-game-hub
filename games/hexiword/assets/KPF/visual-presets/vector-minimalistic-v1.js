(function (global) {
  'use strict';

  // gridScale is the fraction of the play area's shortest side taken up by the
  // grid; the remainder becomes the margin on that axis.
  const DEFAULT_APPEARANCE = {
    gridSize: 8,
    gridScale: 0.82,
    posX: 0,
    posY: 0,
    lineWidth: 1,
    lineColor: '#B8B1A5',
    tileSize: 0.8,
    tileColor: '#B8B1A5',
    background: '#FFFFFF',
    showLines: true,
    showTiles: true
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function asBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    return fallback;
  }

  function hexRgba(hex, alpha) {
    const raw = String(hex || '').replace('#', '');
    const full = raw.length === 3
      ? raw.split('').map(function (ch) { return ch + ch; }).join('')
      : raw;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return 'rgba(184,177,165,' + alpha + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function roundRectPath(ctx, x, y, size, radius) {
    const r = Math.min(radius, size / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.closePath();
  }

  function createRunner(options) {
    const opts = options || {};
    const container = opts.container;
    if (!container) {
      throw new Error('container is required for vector-minimalistic-v1 preset');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const appearance = Object.assign({}, DEFAULT_APPEARANCE);
    let mounted = false;
    let width = 1;
    let height = 1;
    let dpr = 1;

    canvas.className = 'vector-minimalistic-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';

    function draw() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = appearance.background;
      ctx.fillRect(0, 0, width, height);

      const cells = clamp(Math.round(appearance.gridSize), 2, 16);
      const scale = clamp(Number(appearance.gridScale) || 0.82, 0.2, 1);
      const extent = Math.min(width, height) * scale;
      // Snap the cell to whole device pixels so every gridline is identically
      // crisp instead of some landing on fractional coordinates.
      const cell = Math.max(1, Math.floor((extent / cells) * dpr) / dpr);
      const span = cell * cells;
      const posX = clamp(Number(appearance.posX) || 0, -0.5, 0.5);
      const posY = clamp(Number(appearance.posY) || 0, -0.5, 0.5);
      const left = Math.round(((width - span) / 2 + posX * width) * dpr) / dpr;
      const top = Math.round(((height - span) / 2 + posY * height) * dpr) / dpr;
      const stroke = clamp(Number(appearance.lineWidth) || 1, 0.5, 4);
      const showLines = asBool(appearance.showLines, true);
      const showTiles = asBool(appearance.showTiles, true);

      if (showTiles) {
        const tileScale = clamp(Number(appearance.tileSize) || 0.8, 0.2, 1);
        const tile = Math.max(1, cell * tileScale);
        const inset = (cell - tile) / 2;
        const radius = Math.max(2, tile * 0.225);
        ctx.fillStyle = hexRgba(appearance.tileColor, 0.18);
        for (let row = 0; row < cells; row += 1) {
          for (let col = 0; col < cells; col += 1) {
            const x = left + col * cell + inset;
            const y = top + row * cell + inset;
            ctx.beginPath();
            roundRectPath(ctx, x, y, tile, radius);
            ctx.fill();
          }
        }
      }

      if (showLines) {
        const align = (Math.round(stroke * dpr) % 2) / (2 * dpr);
        const xs = [];
        const ys = [];
        for (let i = 0; i <= cells; i += 1) {
          const offset = Math.round(i * cell * dpr) / dpr;
          xs.push(left + offset + align);
          ys.push(top + offset + align);
        }

        ctx.strokeStyle = appearance.lineColor;
        ctx.lineWidth = stroke;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        xs.forEach(function (x) {
          ctx.moveTo(x, ys[0]);
          ctx.lineTo(x, ys[ys.length - 1]);
        });
        ys.forEach(function (y) {
          ctx.moveTo(xs[0], y);
          ctx.lineTo(xs[xs.length - 1], y);
        });
        ctx.stroke();
      }
    }

    function resize() {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width || container.clientWidth || 1));
      height = Math.max(1, Math.round(rect.height || container.clientHeight || 1));
      dpr = clamp(global.devicePixelRatio || 1, 1, 3);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      draw();
    }

    function setAppearance(next) {
      if (!next || typeof next !== 'object') return;
      if (Number.isFinite(Number(next.gridSize))) {
        appearance.gridSize = clamp(Math.round(Number(next.gridSize)), 2, 16);
      }
      if (Number.isFinite(Number(next.gridScale))) {
        appearance.gridScale = clamp(Number(next.gridScale), 0.2, 1);
      }
      if (Number.isFinite(Number(next.posX))) {
        appearance.posX = clamp(Number(next.posX), -0.5, 0.5);
      }
      if (Number.isFinite(Number(next.posY))) {
        appearance.posY = clamp(Number(next.posY), -0.5, 0.5);
      }
      if (Number.isFinite(Number(next.lineWidth))) {
        appearance.lineWidth = clamp(Number(next.lineWidth), 0.5, 4);
      }
      if (typeof next.lineColor === 'string') appearance.lineColor = next.lineColor;
      if (Number.isFinite(Number(next.tileSize))) {
        appearance.tileSize = clamp(Number(next.tileSize), 0.2, 1);
      }
      if (typeof next.tileColor === 'string') appearance.tileColor = next.tileColor;
      if (typeof next.background === 'string') appearance.background = next.background;
      if (typeof next.showLines === 'boolean') appearance.showLines = next.showLines;
      if (typeof next.showTiles === 'boolean') appearance.showTiles = next.showTiles;
      draw();
    }

    return {
      id: 'vector-minimalistic-v1',
      tier: '2d',
      canvas: canvas,
      tokens: {
        appearance: appearance
      },
      getAppearance: function () {
        return Object.assign({}, appearance);
      },
      setAppearance: setAppearance,
      mount: function () {
        if (!mounted) {
          container.appendChild(canvas);
          mounted = true;
        }
        resize();
      },
      step: function () {},
      resize: resize,
      dispose: function () {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        mounted = false;
      }
    };
  }

  if (!global.KPFVisualBridge) {
    throw new Error('KPFVisualBridge must load before vector-minimalistic-v1');
  }
  global.KPFVisualBridge.register('vector-minimalistic-v1', createRunner);
})(typeof window !== 'undefined' ? window : globalThis);
