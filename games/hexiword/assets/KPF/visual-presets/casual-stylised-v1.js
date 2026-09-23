(function (global) {
  'use strict';

  const DEFAULT_APPEARANCE = {
    gridSize: 8,
    gridScale: 0.74,
    posX: 0,
    posY: 0,
    lineWidth: 1,
    lineColor: '#D0A84F',
    tileSize: 0.82,
    tileColor: '#FFFDF8',
    background: '#F4E8D2',
    showLines: true,
    showTiles: true
  };

  const GEM_SOURCE_COLUMNS = 3;
  const GEM_SOURCE_ROWS = 2;
  const GEM_COUNT = GEM_SOURCE_COLUMNS * GEM_SOURCE_ROWS;
  const GEM_ASSET_PATH = 'assets/KPF/visual-presets/assets/casual-stylised-gems.png';
  const FALLBACK_GEM_COLOURS = ['#F13D45', '#159BEA', '#46C83D', '#FFC72C', '#A33BE0', '#FF7D21'];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function asBool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function hexRgba(hex, alpha) {
    const raw = String(hex || '').replace('#', '');
    const full = raw.length === 3
      ? raw.split('').map(function (ch) { return ch + ch; }).join('')
      : raw;
    const number = parseInt(full, 16);
    if (!Number.isFinite(number)) return 'rgba(208,168,79,' + alpha + ')';
    return 'rgba(' + ((number >> 16) & 255) + ',' + ((number >> 8) & 255) + ',' + (number & 255) + ',' + alpha + ')';
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.beginPath();
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawFallbackGem(ctx, type, x, y, size) {
    const colour = FALLBACK_GEM_COLOURS[type % FALLBACK_GEM_COLOURS.length];
    const centreX = x + size / 2;
    const centreY = y + size / 2;
    const radius = size * 0.42;
    const points = type === 1 ? 24 : type === 3 ? 5 : 6;
    const gradient = ctx.createRadialGradient(
      centreX - size * 0.12, centreY - size * 0.16, size * 0.04,
      centreX, centreY, radius
    );
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(0.18, colour);
    gradient.addColorStop(1, '#6E1E93');
    ctx.save();
    ctx.shadowColor = 'rgba(77,52,36,0.28)';
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.05;
    ctx.beginPath();
    for (let i = 0; i < points; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / points;
      const pointX = centreX + Math.cos(angle) * radius;
      const pointY = centreY + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    ctx.arc(centreX - size * 0.14, centreY - size * 0.15, size * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }

  function createRunner(options) {
    const opts = options || {};
    const container = opts.container;
    if (!container) {
      throw new Error('container is required for casual-stylised-v1 preset');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const gemImage = new Image();
    const appearance = Object.assign({}, DEFAULT_APPEARANCE);
    let mounted = false;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let gemFrames = [];

    canvas.className = 'casual-stylised-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';

    function buildGemFrames() {
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = gemImage.naturalWidth;
      sourceCanvas.height = gemImage.naturalHeight;
      const sourceCtx = sourceCanvas.getContext('2d');
      if (!sourceCtx) return [];
      sourceCtx.drawImage(gemImage, 0, 0);
      const pixels = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
      const sourceCellWidth = sourceCanvas.width / GEM_SOURCE_COLUMNS;
      const sourceCellHeight = sourceCanvas.height / GEM_SOURCE_ROWS;
      const frames = [];

      for (let type = 0; type < GEM_COUNT; type += 1) {
        const column = type % GEM_SOURCE_COLUMNS;
        const row = Math.floor(type / GEM_SOURCE_COLUMNS);
        const edgeMargin = Math.max(4, Math.round(Math.min(sourceCellWidth, sourceCellHeight) * 0.025));
        const startX = Math.floor(column * sourceCellWidth) + edgeMargin;
        const endX = Math.min(sourceCanvas.width, Math.ceil((column + 1) * sourceCellWidth) - edgeMargin);
        const startY = Math.floor(row * sourceCellHeight) + edgeMargin;
        const endY = Math.min(sourceCanvas.height, Math.ceil((row + 1) * sourceCellHeight) - edgeMargin);
        let minX = endX;
        let minY = endY;
        let maxX = startX;
        let maxY = startY;

        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const pixel = (y * sourceCanvas.width + x) * 4;
            const red = pixels[pixel];
            const green = pixels[pixel + 1];
            const blue = pixels[pixel + 2];
            const brightest = Math.max(red, green, blue);
            const darkest = Math.min(red, green, blue);
            if (brightest - darkest > 18 || brightest < 165) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        if (minX === endX) {
          frames.push({ sx: startX, sy: startY, sw: endX - startX, sh: endY - startY });
        } else {
          frames.push({
            sx: minX,
            sy: minY,
            sw: maxX - minX + 1,
            sh: maxY - minY + 1
          });
        }
      }
      return frames;
    }

    gemImage.onload = function () {
      gemFrames = buildGemFrames();
      draw();
    };
    gemImage.src = GEM_ASSET_PATH;

    function drawDecorations() {
      const glow = ctx.createRadialGradient(width * 0.18, height * 0.12, 0, width * 0.18, height * 0.12, width * 0.55);
      glow.addColorStop(0, 'rgba(255,255,255,0.76)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    function drawGem(ctxX, ctxY, size, type) {
      const frame = gemFrames[type];
      if (frame) {
        const maxSize = size * 0.94;
        const scale = Math.min(maxSize / frame.sw, maxSize / frame.sh);
        const drawWidth = frame.sw * scale;
        const drawHeight = frame.sh * scale;
        const drawX = ctxX + (size - drawWidth) / 2;
        const drawY = ctxY + (size - drawHeight) / 2;
        ctx.drawImage(gemImage, frame.sx, frame.sy, frame.sw, frame.sh, drawX, drawY, drawWidth, drawHeight);
      } else {
        drawFallbackGem(ctx, type, ctxX, ctxY, size);
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = appearance.background;
      ctx.fillRect(0, 0, width, height);
      drawDecorations();

      const cells = clamp(Math.round(appearance.gridSize), 2, 16);
      const scale = clamp(Number(appearance.gridScale) || DEFAULT_APPEARANCE.gridScale, 0.2, 1);
      const extent = Math.min(width, height) * scale;
      const cell = Math.max(1, Math.floor((extent / cells) * dpr) / dpr);
      const span = cell * cells;
      const posX = clamp(Number(appearance.posX) || 0, -0.5, 0.5);
      const posY = clamp(Number(appearance.posY) || 0, -0.5, 0.5);
      const boardX = Math.round(((width - span) / 2 + posX * width) * dpr) / dpr;
      const boardY = Math.round(((height - span) / 2 + posY * height) * dpr) / dpr;
      const radius = Math.max(14, cell * 0.34);
      const showLines = asBool(appearance.showLines, true);
      const showTiles = asBool(appearance.showTiles, true);
      const stroke = clamp(Number(appearance.lineWidth) || 1, 0.5, 4);
      const tileScale = clamp(Number(appearance.tileSize) || DEFAULT_APPEARANCE.tileSize, 0.2, 1);

      ctx.save();
      ctx.shadowColor = 'rgba(90,61,38,0.22)';
      ctx.shadowBlur = Math.max(8, cell * 0.28);
      ctx.shadowOffsetY = cell * 0.08;
      fillRoundRect(ctx, boardX, boardY, span, span, radius, '#FFFDF7');
      ctx.restore();

      const panelGradient = ctx.createLinearGradient(0, boardY, 0, boardY + span);
      panelGradient.addColorStop(0, '#FFFDF7');
      panelGradient.addColorStop(1, '#F7E8C8');
      fillRoundRect(ctx, boardX, boardY, span, span, radius, panelGradient);

      if (showTiles) {
        const tileInset = Math.max(2, cell * 0.08);
        const tileSize = Math.max(1, cell - tileInset * 2);
        for (let row = 0; row < cells; row += 1) {
          for (let col = 0; col < cells; col += 1) {
            const tileX = boardX + col * cell + tileInset;
            const tileY = boardY + row * cell + tileInset;
            fillRoundRect(ctx, tileX, tileY, tileSize, tileSize, Math.max(4, cell * 0.16), hexRgba(appearance.tileColor, 0.86));
            const gemSize = tileSize * tileScale;
            const gemInset = (tileSize - gemSize) / 2;
            const type = (col * 2 + row * 3 + Math.floor(row / 2)) % GEM_COUNT;
            drawGem(tileX + gemInset, tileY + gemInset, gemSize, type);
          }
        }
      }

      if (showLines) {
        ctx.strokeStyle = hexRgba(appearance.lineColor, 0.46);
        ctx.lineWidth = stroke;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 1; i < cells; i += 1) {
          const offset = Math.round(i * cell * dpr) / dpr;
          ctx.moveTo(boardX + offset, boardY);
          ctx.lineTo(boardX + offset, boardY + span);
          ctx.moveTo(boardX, boardY + offset);
          ctx.lineTo(boardX + span, boardY + offset);
        }
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
      id: 'casual-stylised-v1',
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
    throw new Error('KPFVisualBridge must load before casual-stylised-v1');
  }
  global.KPFVisualBridge.register('casual-stylised-v1', createRunner);
})(typeof window !== 'undefined' ? window : globalThis);
