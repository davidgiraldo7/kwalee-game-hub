/* ============================================================================
 * Flock Feast — Cavity Level Editor
 *
 * Standalone freeform level editor for the Flock Feast game (_debug_flock.html).
 * Place pegs anywhere inside the funnel-shaped cavity, assign what each peg holds
 * (egg / cracker + colour + shape) and the lock-&-key sub-mechanic, then playtest
 * instantly in the embedded game iframe.
 *
 * Coordinate system is mirrored from the game engine so placement is WYSIWYG:
 *   - world X: board-space, clamped to the funnel wall (funnelContactX) and BOARD.x1
 *   - world Y: board-space, Y up; the game plays freeform boards without scrolling
 * ==========================================================================*/
(() => {
  'use strict';

  // ---- Palette (mirrors FOOD in _debug_flock.html) -------------------------
  const FOOD = { green: 0x8ed35c, blue: 0x4fb0f2, pink: 0xf77fbc, cream: 0xf1e58f, orange: 0xf3a24c, red: 0xe6473d, purple: 0xb579ff, brown: 0x7B3C1C, teal: 0x159e94, yellow: 0xf5c518 };
  const FOOD_KEYS = Object.keys(FOOD);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  // ---- Cavity geometry (mirrors _debug_flock.html) -------------------------
  const FUNNEL = { a: 0.30, y0: 0.34 };
  const funnelY = (x) => FUNNEL.y0 + FUNNEL.a * x * x;
  const SLOPE_LIFT = 0.5;
  const FE = {
    x0: 3.15, y0: funnelY(2.65),
    c1x: 3.15, c1y: 0.95 + SLOPE_LIFT,
    c2x: 1.08, c2y: 0.24 + SLOPE_LIFT,
    x1: 0.602, y1: 0.18 + SLOPE_LIFT,
  };
  const CONTAINER_BASE_Y = FE.y1 - 0.78;
  const CONTAINER_CORNER_Y = CONTAINER_BASE_Y + 0.09;
  const BOARD = { x1: 2.65, anchorY: 2.35 };

  const bez3 = (a, b, c, d, t) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  // |x| of the cavity wall at world height y (straight walls above the funnel,
  // bezier throat in the middle, boxy container below).
  function funnelContactX(y) {
    if (y >= FE.y0) return FE.x0;
    if (y <= FE.y1) return FE.x1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) * 0.5;
      const ym = bez3(FE.y0, FE.c1y, FE.c2y, FE.y1, m);
      if (ym > y) lo = m; else hi = m;
    }
    const t = (lo + hi) * 0.5;
    return bez3(FE.x0, FE.c1x, FE.c2x, FE.x1, t);
  }

  // Item radii in world units (ITEM_MULT = 1.3, SPREAD = 1 in portrait play).
  const ITEM_MULT = 1.3;
  const R = { egg: 0.28 * ITEM_MULT * 1.17, cracker: 0.28 * 1.15 * ITEM_MULT };
  const radiusOf = (p) => p.type === 'wood' ? (p.woodW || 1.0) * 0.35 : (R[p.type] || R.egg);

  // Wood can be placed freely across the full board width (outside the food cavity).
  function clampForPlacement(x, y, p) {
    if (p && p.type === 'wood') {
      return { x: Math.max(-WORLD.xMax - 0.3, Math.min(WORLD.xMax + 0.3, x)), y: Math.max(WORLD.yBottom, Math.min(WORLD.yTop, y)) };
    }
    return clampToCavity(x, y, radiusOf(p || {}));
  }

  // Authoring window (world). yTop is set high enough to accommodate the tallest
  // baked level (~34 world units) plus buffer. The canvas scrolls vertically.
  const WORLD = { xMax: FE.x0, yBottom: CONTAINER_BASE_Y, yTop: 40 };

  // ---- State ----------------------------------------------------------------
  let mode = 'place';                 // 'place' | 'assign'
  const brush = { type: 'cracker', color: FOOD_KEYS[0], variant: 'ring', locked: false, hasKey: false, mystery: false, woodShape: 'plank', woodChip: 'plank', woodRot: 0, woodW: 1.0, woodThick: 0.22, woodArcSweep: 140 };
  const pegs = [];                    // { id, type, color, variant, locked, hasKey, mystery, x, y }
  let sel = null;                     // selected peg or null
  let dragging = null;                // peg being dragged
  let dragMoved = false;
  let pegSeq = 1;

  // ---- Grid / snap state ----------------------------------------------------
  const grid = { show: false, snap: false, size: 0.75 };

  function snapToGrid(x, y) {
    if (!grid.snap) return { x, y };
    const s = grid.size;
    return { x: Math.round(x / s) * s, y: Math.round(y / s) * s };
  }

  // ---- Baked levels — always present in the level bank ----------------------
  // Bump bakedVer to force an in-place refresh for existing editors.
  const BAKED_LEVELS = [
    {
      name: 'Level 1',
      bakedId: 'flock-1',
      bakedVer: 2,
      layout: [
        { type: 'cracker', color: 'blue',   variant: 'ring', x: -1.987, y:  2.35 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x: -0.662, y:  2.35 },
        { type: 'egg',     color: 'blue',                    x:  0.663, y:  2.35 },
        { type: 'cracker', color: 'green',  variant: 'ring', x:  1.987, y:  2.35 },
        { type: 'egg',     color: 'green',                   x: -1.325, y:  3.85 },
        { type: 'cracker', color: 'orange', variant: 'ring', x:  0,     y:  3.85 },
        { type: 'egg',     color: 'cream',                   x:  1.325, y:  3.85 },
        { type: 'egg',     color: 'green',                   x: -1.987, y:  5.35 },
        { type: 'cracker', color: 'green',  variant: 'ring', x: -0.662, y:  5.35 },
        { type: 'egg',     color: 'orange',                  x:  0.663, y:  5.35 },
        { type: 'cracker', color: 'orange', variant: 'ring', x:  1.987, y:  5.35 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -1.325, y:  6.85 },
        { type: 'cracker', color: 'green',  variant: 'ring', x:  0,     y:  6.85 },
        { type: 'cracker', color: 'green',  variant: 'ring', x:  1.325, y:  6.85 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -1.987, y:  8.35 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.662, y:  8.35 },
        { type: 'egg',     color: 'orange',                  x:  0.663, y:  8.35 },
        { type: 'cracker', color: 'green',  variant: 'ring', x:  1.987, y:  8.35 },
        { type: 'egg',     color: 'green',                   x: -1.325, y:  9.85 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x:  0,     y:  9.85 },
        { type: 'egg',     color: 'blue',                    x:  1.325, y:  9.85 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x: -1.987, y: 11.35 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x: -0.662, y: 11.35 },
        { type: 'egg',     color: 'cream',                   x:  0.663, y: 11.35 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x:  1.987, y: 11.35 },
        { type: 'egg',     color: 'blue',                    x: -1.325, y: 12.85 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x:  0,     y: 12.85 },
        { type: 'egg',     color: 'cream',                   x:  1.325, y: 12.85 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x: -1.325, y: 14.35 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x:  0,     y: 14.35 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x:  1.325, y: 14.35 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x: -0.662, y: 15.85 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x:  0.662, y: 15.85 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -1.325, y: 17.35 },
        { type: 'cracker', color: 'green',  variant: 'ring', x:  0,     y: 17.35 },
        { type: 'egg',     color: 'orange',                  x:  1.325, y: 17.35 },
        { type: 'wood', woodShape: 'plank', woodRot: 0, woodW: 1, woodX: -0.79,  woodY:  6.011, woodThick: 0.7 },
        { type: 'wood', woodShape: 'plank', woodRot: 0, woodW: 1, woodX:  1.166, woodY:  5.967, woodThick: 0.7 },
        { type: 'wood', woodShape: 'plank', woodRot: 0, woodW: 1, woodX:  2.478, woodY:  5.973, woodThick: 0.7 },
        { type: 'wood', woodShape: 'plank', woodRot: 0, woodW: 1, woodX: -0.5,   woodY:  4.646, woodThick: 0.7 },
      ],
    },
    {
      name: 'Level 2',
      bakedId: 'flock-2',
      bakedVer: 2,
      // Freeform scatter traced from the Level 2 reference art.
      layout: [
        // Top cluster
        { type: 'cracker', color: 'blue',   variant: 'ring', x: -1.15, y: 17.67 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.10, y: 17.67 },
        { type: 'egg',     color: 'green',                   x:  0.94, y: 17.67 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x: -1.98, y: 16.73 },
        { type: 'egg',     color: 'green',                   x: -0.10, y: 16.73 },
        { type: 'cracker', color: 'cream',  variant: 'ring', x: -1.67, y: 16.21 },
        { type: 'egg',     color: 'blue',                    x: -0.83, y: 16.21 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x:  0.52, y: 16.21 },
        { type: 'cracker', color: 'blue',   variant: 'ring', x: -1.77, y: 15.48 },
        // Middle cluster — squares appear here
        { type: 'cracker', color: 'cream',  variant: 'square', x: -0.10, y: 14.75 },
        { type: 'cracker', color: 'green',  variant: 'square', x:  0.73, y: 14.75 },
        { type: 'egg',     color: 'orange',                    x:  1.56, y: 14.75 },
        { type: 'egg',     color: 'orange',                    x: -1.04, y: 14.02 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  0.10, y: 14.02 },
        { type: 'egg',     color: 'blue',                      x:  0.94, y: 14.02 },
        { type: 'cracker', color: 'blue',   variant: 'square', x:  1.77, y: 14.02 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x: -1.67, y: 13.50 },
        { type: 'cracker', color: 'blue',   variant: 'ring',   x: -0.83, y: 13.50 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  1.98, y: 13.50 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x: -1.88, y: 12.87 },
        { type: 'egg',     color: 'orange',                    x: -0.10, y: 12.87 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x: -1.98, y: 12.35 },
        { type: 'egg',     color: 'orange',                    x: -1.15, y: 11.73 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x: -0.52, y: 11.73 },
        { type: 'egg',     color: 'blue',                      x:  0.94, y: 11.00 },
        // Bottom cluster — triangles
        { type: 'cracker', color: 'orange', variant: 'triangle', x:  0.52, y: 10.17 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  1.35, y: 10.17 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x:  0.00, y:  9.44 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  0.83, y:  9.44 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x:  1.77, y:  9.44 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -1.67, y:  8.50 },
        { type: 'egg',     color: 'green',                       x: -0.83, y:  8.50 },
        { type: 'egg',     color: 'orange',                      x:  0.10, y:  8.50 },
        { type: 'egg',     color: 'orange',                      x:  0.94, y:  8.50 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x:  1.77, y:  8.50 },
      ],
    },
    {
      name: 'Level 3',
      bakedId: 'flock-3',
      bakedVer: 1,
      // Freeform scatter traced from the Level 3 reference art.
      layout: [
        // Top cluster
        { type: 'egg',     color: 'cream',                     x: -1.98, y: 16.67 },
        { type: 'egg',     color: 'blue',                      x: -0.52, y: 16.52 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  0.31, y: 16.67 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  1.25, y: 16.73 },
        { type: 'cracker', color: 'cream',  variant: 'square', x: -1.29, y: 15.96 },
        { type: 'cracker', color: 'blue',   variant: 'ring',   x:  0.31, y: 15.90 },
        { type: 'egg',     color: 'orange',                    x:  1.56, y: 15.96 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  1.63, y: 15.75 },
        { type: 'cracker', color: 'cream',  variant: 'square', x: -1.98, y: 15.33 },
        { type: 'egg',     color: 'cream',                     x: -0.73, y: 15.17 },
        { type: 'egg',     color: 'blue',                      x:  0.04, y: 15.00 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  1.29, y: 15.13 },
        // Middle band — triangles + squares
        { type: 'cracker', color: 'green',  variant: 'square',   x: -1.71, y: 14.13 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  0.31, y: 14.13 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x:  1.15, y: 14.17 },
        { type: 'cracker', color: 'blue',   variant: 'ring',     x:  1.88, y: 14.08 },
        { type: 'cracker', color: 'green',  variant: 'square',   x: -1.04, y: 13.46 },
        { type: 'egg',     color: 'green',                       x: -0.63, y: 13.13 },
        { type: 'cracker', color: 'blue',   variant: 'ring',     x:  0.52, y: 13.13 },
        { type: 'cracker', color: 'orange', variant: 'ring',     x:  1.71, y: 12.98 },
        // Lower-middle
        { type: 'cracker', color: 'green',  variant: 'square', x: -1.88, y: 12.35 },
        { type: 'egg',     color: 'green',                     x: -0.58, y: 12.25 },
        { type: 'egg',     color: 'blue',                      x:  0.52, y: 12.25 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  1.71, y: 12.35 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x: -1.15, y: 11.52 },
        { type: 'egg',     color: 'cream',                     x: -0.21, y: 11.58 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  0.79, y: 11.52 },
        // Lower
        { type: 'cracker', color: 'orange', variant: 'ring',     x: -0.63, y: 10.75 },
        { type: 'egg',     color: 'orange',                      x:  1.21, y: 10.54 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  0.52, y:  9.75 },
        // Bottom
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -0.21, y:  8.96 },
        { type: 'egg',     color: 'orange',                      x: -1.67, y:  8.46 },
        { type: 'cracker', color: 'orange', variant: 'ring',     x: -0.58, y:  8.46 },
        { type: 'cracker', color: 'orange', variant: 'ring',     x:  0.73, y:  8.54 },
        { type: 'cracker', color: 'orange', variant: 'ring',     x:  1.77, y:  8.60 },
      ],
    },
    {
      name: 'Level 11',
      bakedId: 'flock-11',
      bakedVer: 1,
      // Freeform scatter traced from the Level 11 reference art —
      // 7 colours, locked eggs + key crackers, chevron/diamond wood obstacles.
      layout: [
        { type: 'egg',     color: 'orange',                    x:  0.42, y: 21.30 },
        { type: 'egg',     color: 'pink',                      x:  1.35, y: 21.30 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.10, y: 20.48 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  0.73, y: 20.48 },
        { type: 'cracker', color: 'cream',  variant: 'square', x:  1.50, y: 20.42 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -0.52, y: 19.85 },
        { type: 'wood', woodShape: 'chevron', woodRot: 0, woodW: 0.95, woodX: 0.31, woodY: 19.85 },
        { type: 'cracker', color: 'cream',  variant: 'square', x:  1.42, y: 19.44 },
        { type: 'egg',     color: 'cream',                     x: -1.67, y: 19.02 },
        { type: 'egg',     color: 'purple',                    x: -0.83, y: 18.90 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.10, y: 18.29 },
        { type: 'cracker', color: 'cream',  variant: 'square', x:  0.73, y: 18.23 },
        { type: 'cracker', color: 'pink',   variant: 'square', x:  1.46, y: 18.40 },
        { type: 'cracker', color: 'blue',   variant: 'square', hasKey: true, x: -0.94, y: 17.77 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 1.04, woodY: 17.56 },
        { type: 'cracker', color: 'purple', variant: 'square', x: -1.50, y: 17.25 },
        { type: 'egg',     color: 'orange',                    x:  0.00, y: 17.25 },
        { type: 'cracker', color: 'blue',   variant: 'square', x: -0.63, y: 16.63 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  0.21, y: 16.56 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  0.94, y: 16.63 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  1.71, y: 16.56 },
        { type: 'egg',     color: 'orange',                    x: -1.50, y: 15.79 },
        { type: 'egg',     color: 'cream',                     x: -0.52, y: 15.72 },
        { type: 'egg',     color: 'blue',   locked: true,      x:  0.21, y: 15.70 },
        { type: 'cracker', color: 'green',  variant: 'square', x:  1.00, y: 15.79 },
        { type: 'cracker', color: 'green',  variant: 'square', x:  1.04, y: 14.96 },
        { type: 'wood', woodShape: 'chevron', woodRot: 0, woodW: 0.95, woodX: -0.31, woodY: 14.50 },
        { type: 'cracker', color: 'pink',   variant: 'square', x:  0.52, y: 14.23 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 1.50, woodY: 14.27 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.10, y: 13.71 },
        { type: 'egg',     color: 'green',                     x:  0.63, y: 12.98 },
        { type: 'cracker', color: 'blue',   variant: 'ring',   x: -0.21, y: 12.77 },
        { type: 'cracker', color: 'purple', variant: 'triangle', hasKey: true, x: 0.79, y: 12.35 },
        { type: 'egg',     color: 'cream',                     x: -1.46, y: 12.04 },
        { type: 'egg',     color: 'orange',                    x: -0.63, y: 12.00 },
        { type: 'cracker', color: 'cream',  variant: 'triangle', x: 0.21, y: 11.98 },
        { type: 'wood', woodShape: 'chevron', woodRot: 0, woodW: 0.95, woodX: 1.15, woodY: 11.90 },
        { type: 'cracker', color: 'pink',   variant: 'triangle', x: 1.67, y: 11.90 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.25, woodY: 11.20 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -0.10, y: 11.00 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  1.50, y: 11.06 },
        { type: 'egg',     color: 'green',                     x: -1.46, y: 10.27 },
        { type: 'egg',     color: 'pink',   locked: true,      x: -0.73, y: 10.40 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x: 0.10, y: 10.35 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x: 1.63, y: 10.35 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -1.15, y: 9.54 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x: -0.10, y: 9.50 },
        { type: 'cracker', color: 'cream',  variant: 'triangle', x:  1.35, y: 9.54 },
        { type: 'cracker', color: 'pink',   variant: 'ring',    x: -1.46, y: 8.65 },
        { type: 'cracker', color: 'pink',   variant: 'ring',    x: -0.58, y: 8.60 },
        { type: 'cracker', color: 'cream',  variant: 'ring',    x:  0.31, y: 8.65 },
      ],
    },
    {
      name: 'Level 12',
      bakedId: 'flock-12',
      bakedVer: 1,
      // Freeform scatter traced from the Level 12 reference art —
      // purple tray, mixed shapes, purple diamond wood obstacles.
      layout: [
        { type: 'egg',     color: 'orange',                    x:  0.21, y: 19.71 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x: -0.31, y: 19.29 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  0.52, y: 19.29 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  1.77, y: 19.29 },
        { type: 'egg',     color: 'purple',                    x: -1.25, y: 18.56 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x: -0.21, y: 18.56 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  0.73, y: 18.56 },
        { type: 'cracker', color: 'pink',   variant: 'ring',   x:  1.77, y: 18.56 },
        { type: 'egg',     color: 'orange',                    x: -1.46, y: 17.94 },
        { type: 'cracker', color: 'green',  variant: 'ring',   x: -0.31, y: 17.94 },
        { type: 'egg',     color: 'green',                     x:  0.52, y: 17.94 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  1.67, y: 17.94 },
        { type: 'cracker', color: 'pink',   variant: 'ring',   x: -1.46, y: 17.21 },
        { type: 'egg',     color: 'pink',                      x: -0.52, y: 17.21 },
        { type: 'cracker', color: 'cream',  variant: 'triangle', x: 0.31, y: 17.21 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 1.15, y: 17.21 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x: 1.88, y: 17.21 },
        { type: 'cracker', color: 'green',  variant: 'ring',   x: -0.94, y: 16.17 },
        { type: 'egg',     color: 'cream',                     x:  0.00, y: 16.17 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  0.94, y: 16.17 },
        { type: 'egg',     color: 'purple',                    x: -1.15, y: 15.33 },
        { type: 'cracker', color: 'pink',   variant: 'square', x: -0.21, y: 15.33 },
        { type: 'cracker', color: 'green',  variant: 'square', x:  0.67, y: 15.33 },
        { type: 'cracker', color: 'blue',   variant: 'square', x:  1.56, y: 15.33 },
        { type: 'egg',     color: 'pink',                      x: -0.21, y: 14.40 },
        { type: 'egg',     color: 'blue',                      x: -1.04, y: 13.46 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 0.00, y: 13.46 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.83, y: 13.46 },
        { type: 'cracker', color: 'pink',   variant: 'triangle', x: 1.71, y: 13.46 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.35, woodY: 13.98 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX:  1.25, woodY: 13.04 },
        { type: 'egg',     color: 'cream',                     x: -0.94, y: 12.10 },
        { type: 'egg',     color: 'pink',                      x: -0.10, y: 12.10 },
        { type: 'egg',     color: 'orange',                    x:  0.67, y: 12.10 },
        { type: 'egg',     color: 'orange',                    x:  1.50, y: 12.10 },
        { type: 'egg',     color: 'green',                     x: -0.83, y: 11.27 },
        { type: 'cracker', color: 'orange', variant: 'ring',   x:  1.50, y: 11.27 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.77, woodY: 11.38 },
        { type: 'egg',     color: 'green',                     x: -0.73, y: 10.44 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.10, y: 10.44 },
        { type: 'cracker', color: 'pink',   variant: 'square', x:  0.79, y: 10.44 },
        { type: 'cracker', color: 'green',  variant: 'ring',   x:  1.50, y: 10.44 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.77, woodY: 9.81 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX:  1.15, woodY: 9.81 },
        { type: 'cracker', color: 'blue',   variant: 'ring',   x:  0.31, y: 9.60 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x: -0.83, y: 8.50 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x:  0.10, y: 8.50 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  1.04, y: 8.50 },
      ],
    },
    {
      name: 'Level 13',
      bakedId: 'flock-13',
      bakedVer: 1,
      // Freeform scatter traced from the Level 13 reference art —
      // 7 colours (incl. chocolate), a key ring cracker, a locked egg,
      // a diamond + angled plank wood obstacle. Three loose clusters.
      layout: [
        // Top cluster — squares + eggs
        { type: 'cracker', color: 'brown',  variant: 'square', x: -0.10, y: 19.30 },
        { type: 'egg',     color: 'pink',                      x: -0.90, y: 18.60 },
        { type: 'egg',     color: 'green',                     x:  0.50, y: 18.70 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.50, y: 17.90 },
        { type: 'cracker', color: 'orange', variant: 'square', x:  0.35, y: 17.90 },
        { type: 'egg',     color: 'brown',                     x: -1.50, y: 17.50 },
        { type: 'cracker', color: 'pink',   variant: 'square', x:  0.15, y: 17.10 },
        { type: 'egg',     color: 'purple',                    x:  0.95, y: 16.90 },
        { type: 'egg',     color: 'pink',                      x:  1.65, y: 16.70 },
        { type: 'cracker', color: 'brown',  variant: 'square', x: -0.35, y: 16.40 },
        { type: 'cracker', color: 'pink',   variant: 'square', x:  0.35, y: 16.30 },
        { type: 'egg',     color: 'purple',                    x: -0.85, y: 15.70 },
        { type: 'egg',     color: 'orange',                    x: -0.10, y: 15.30 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  0.95, y: 15.40 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x:  1.65, y: 15.40 },
        { type: 'cracker', color: 'green',  variant: 'ring',   x:  0.35, y: 14.90 },
        // Middle cluster — key cracker, locked egg, triangles + rings
        { type: 'egg',     color: 'purple',                    x: -0.55, y: 14.20 },
        { type: 'cracker', color: 'cream',  variant: 'ring', hasKey: true, x: 0.10, y: 14.20 },
        { type: 'egg',     color: 'cream',                     x:  0.75, y: 14.25 },
        { type: 'cracker', color: 'pink',   variant: 'triangle', x: -0.25, y: 13.50 },
        { type: 'cracker', color: 'brown',  variant: 'triangle', x:  0.40, y: 13.50 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  1.10, y: 13.50 },
        { type: 'cracker', color: 'green',  variant: 'ring',   x:  0.00, y: 12.85 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  0.65, y: 12.80 },
        { type: 'cracker', color: 'blue',   variant: 'ring',   x:  1.35, y: 12.85 },
        { type: 'egg',     color: 'blue',   locked: true,      x: -0.35, y: 12.20 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x: 0.90, y: 12.10 },
        // Bottom cluster — rings, eggs, triangles + wood
        { type: 'cracker', color: 'brown',  variant: 'ring',   x:  0.35, y: 11.50 },
        { type: 'egg',     color: 'cream',                     x: -0.45, y: 11.00 },
        { type: 'cracker', color: 'purple', variant: 'ring',   x:  0.35, y: 10.95 },
        { type: 'cracker', color: 'cream',  variant: 'ring',   x:  0.95, y: 11.00 },
        { type: 'cracker', color: 'pink',   variant: 'ring',   x:  1.60, y: 11.00 },
        { type: 'egg',     color: 'blue',                      x: -0.30, y: 10.30 },
        { type: 'egg',     color: 'green',                     x:  1.25, y: 10.25 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 0.50, woodY: 10.40 },
        { type: 'egg',     color: 'orange',                    x: -1.25, y:  9.60 },
        { type: 'egg',     color: 'brown',                     x: -0.45, y:  9.55 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x:  0.40, y:  9.60 },
        { type: 'cracker', color: 'blue',   variant: 'triangle', x:  1.05, y:  9.60 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x:  1.65, y:  9.60 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.6, woodW: 1.15, woodX: 1.75, woodY: 8.90, woodThick: 0.28 },
        { type: 'cracker', color: 'brown',  variant: 'ring',   x: -0.85, y:  8.90 },
        { type: 'cracker', color: 'blue',   variant: 'ring',   x:  0.00, y:  8.90 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -1.45, y:  8.50 },
        { type: 'cracker', color: 'cream',  variant: 'triangle', x: -0.75, y:  8.50 },
        { type: 'cracker', color: 'green',  variant: 'triangle', x: -0.05, y:  8.50 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x:  0.65, y:  8.50 },
      ],
    },
    {
      name: 'Level 14',
      bakedId: 'flock-14',
      bakedVer: 1,
      layout: [
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.4, y: 19.4 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 1.1, y: 19.4 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 1.75, y: 19.4 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -1.3, y: 18.7 },
        { type: 'egg', color: 'green', x: 0.6, y: 18.7 },
        { type: 'egg', color: 'cream', x: -1.6, y: 18 },
        { type: 'cracker', color: 'cream', variant: 'square', x: -0.85, y: 18 },
        { type: 'egg', color: 'brown', x: -0.05, y: 18 },
        { type: 'egg', color: 'blue', x: 0.7, y: 18 },
        { type: 'cracker', color: 'pink', variant: 'square', x: 1.35, y: 18 },
        { type: 'cracker', color: 'blue', variant: 'square', x: 1.9, y: 18 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.5, woodW: 1.1, woodX: -1.45, woodY: 17.2, woodThick: 0.28 },
        { type: 'wood', woodShape: 'plank', woodRot: 0.5, woodW: 1.1, woodX: 1.45, woodY: 17.2, woodThick: 0.28 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.15, y: 16.6 },
        { type: 'egg', color: 'pink', x: -1.6, y: 16 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 0.5, y: 16 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.2, y: 16 },
        { type: 'egg', color: 'cream', x: -0.35, y: 15.2 },
        { type: 'cracker', color: 'orange', variant: 'triangle', hasKey: true, x: 0.35, y: 15.2 },
        { type: 'egg', color: 'blue', x: 0.95, y: 15.2 },
        { type: 'egg', color: 'brown', x: -1.5, y: 14.5 },
        { type: 'egg', color: 'purple', x: -0.8, y: 14.5 },
        { type: 'cracker', color: 'orange', variant: 'triangle', mystery: true, x: -0.05, y: 14.5 },
        { type: 'cracker', color: 'orange', variant: 'triangle', mystery: true, x: 0.6, y: 14.5 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.3, y: 14.5 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -1.5, y: 13.4 },
        { type: 'egg', color: 'pink', x: -0.8, y: 13.4 },
        { type: 'egg', color: 'orange', x: -0.1, y: 13.4 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 0.6, y: 13.4 },
        { type: 'egg', color: 'green', x: -0.4, y: 12.55 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.7, y: 12.6 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 1.5, y: 12.6 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.7, y: 11.7 },
        { type: 'egg', color: 'purple', x: -0.05, y: 11.7 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.9, y: 11.7 },
        { type: 'egg', color: 'cream', x: 0, y: 10.9 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.65, y: 10.9 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -1.5, y: 10.2 },
        { type: 'cracker', color: 'brown', variant: 'triangle', x: -0.8, y: 10.2 },
        { type: 'cracker', color: 'pink', variant: 'triangle', mystery: true, x: -0.1, y: 10.2 },
        { type: 'cracker', color: 'purple', variant: 'triangle', mystery: true, x: 0.5, y: 10.2 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 1.1, y: 10.2 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 1.7, y: 10.2 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -1.3, y: 9.4 },
        { type: 'egg', color: 'orange', x: -0.6, y: 9.4 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 0.1, woodY: 9.4 },
        { type: 'egg', color: 'brown', x: 0.7, y: 9.4 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.4, y: 9.4 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.8, y: 8.7 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.1, y: 8.7 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.6, y: 8.7 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 1.3, y: 8.7 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.69, y: 19.6 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.01, y: 19.6 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -1.04, y: 19.6 }
      ],
    },
    {
      name: 'Level 15',
      bakedId: 'flock-15',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'green', x: 0.1, y: 19.5 },
        { type: 'egg', color: 'purple', x: -0.3, y: 18.75 },
        { type: 'egg', color: 'purple', x: 0.55, y: 18.75 },
        { type: 'wood', woodShape: 'plank', woodRot: 0, woodW: 3.3, woodX: 0.1, woodY: 18.05, woodThick: 0.3 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -1.35, y: 18.05 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.7, y: 18.05 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 0.35, y: 18.05 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1, y: 18.05 },
        { type: 'cracker', color: 'pink', variant: 'square', x: 1.7, y: 18.05 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: -1.1, y: 17.2 },
        { type: 'egg', color: 'orange', x: -0.3, y: 17.15 },
        { type: 'egg', color: 'pink', x: 0.6, y: 17.15 },
        { type: 'egg', color: 'red', x: -1.35, y: 16.35 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.55, y: 16.35 },
        { type: 'cracker', color: 'purple', variant: 'ring', hasKey: true, x: 0.2, y: 16.35 },
        { type: 'egg', color: 'cream', x: 1, y: 16.3 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.55, woodY: 15.55 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.35, y: 15.55 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.05, y: 15.55 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.65, y: 15.35 },
        { type: 'cracker', color: 'blue', variant: 'square', x: -1.3, y: 14.9 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -0.6, y: 14.9 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 1.15, y: 14.85 },
        { type: 'egg', color: 'blue', locked: true, x: -1.25, y: 14.15 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -0.55, y: 14.1 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 1.6, y: 14.2 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.35, y: 13.35 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.35, y: 13.35 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.65, y: 13.25 },
        { type: 'egg', color: 'cream', x: -1.2, y: 12.55 },
        { type: 'egg', color: 'brown', x: -0.45, y: 12.55 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.3, y: 12.55 },
        { type: 'egg', color: 'pink', x: 1.15, y: 12.55 },
        { type: 'egg', color: 'green', x: -0.35, y: 11.75 },
        { type: 'cracker', color: 'brown', variant: 'triangle', x: 0.55, y: 11.75 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -1.3, y: 10.95 },
        { type: 'egg', color: 'blue', x: -0.55, y: 10.95 },
        { type: 'cracker', color: 'orange', variant: 'ring', hasKey: true, x: 0.25, y: 10.95 },
        { type: 'egg', color: 'red', x: 1, y: 10.95 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.7, y: 10.95 },
        { type: 'egg', color: 'orange', x: -0.15, y: 10.1 },
        { type: 'cracker', color: 'red', variant: 'ring', x: 0.65, y: 10.1 },
        { type: 'egg', color: 'brown', locked: true, x: -1.65, y: 9.35 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: -0.35, y: 9.35 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 0.35, y: 9.35 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 1.05, y: 9.35 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.35, y: 8.65 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.4, y: 8.65 },
        { type: 'cracker', color: 'cream', variant: 'square', x: -1.3, y: 8 },
        { type: 'cracker', color: 'red', variant: 'square', x: -0.55, y: 8 },
        { type: 'cracker', color: 'blue', variant: 'square', x: 0.2, y: 8 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 0.95, y: 8 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.4, y: 13.8 }
      ],
    },
    {
      name: 'Level 16',
      bakedId: 'flock-16',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'red', x: 0.35, y: 19.6 },
        { type: 'cracker', color: 'blue', variant: 'square', x: -0.7, y: 18.9 },
        { type: 'cracker', color: 'green', variant: 'square', x: -0.05, y: 18.9 },
        { type: 'egg', color: 'green', x: 1.1, y: 18.85 },
        { type: 'cracker', color: 'pink', variant: 'square', x: -0.95, y: 18.2 },
        { type: 'cracker', color: 'purple', variant: 'square', x: 0.1, y: 18.2 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.55, y: 18.1 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.55, y: 17.5 },
        { type: 'cracker', color: 'pink', variant: 'square', x: 0.1, y: 17.5 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 1.2, woodY: 17.55 },
        { type: 'egg', color: 'blue', x: -0.8, y: 16.75 },
        { type: 'egg', color: 'brown', x: 0.35, y: 16.75 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.45, y: 15.95 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 0.3, y: 16 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 1.15, y: 15.9 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -1.2, y: 15.3 },
        { type: 'egg', color: 'pink', x: 0.25, y: 15.2 },
        { type: 'egg', color: 'green', x: 1.15, y: 15.1 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.8, y: 15.3 },
        { type: 'egg', color: 'cream', x: -0.95, y: 14.45 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: -0.3, y: 14.45 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.35, y: 14.45 },
        { type: 'egg', color: 'green', x: 1, y: 14.45 },
        { type: 'egg', color: 'blue', x: -1.3, y: 13.7 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: -0.55, y: 13.7 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.1, y: 13.7 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.75, y: 13.7 },
        { type: 'egg', color: 'purple', x: 1.55, y: 13.7 },
        { type: 'egg', color: 'red', x: -0.3, y: 12.9 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: 0.55, y: 13 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.55, y: 12.8 },
        { type: 'cracker', color: 'cream', variant: 'ring', mystery: true, x: -1.3, y: 12.2 },
        { type: 'cracker', color: 'cream', variant: 'ring', mystery: true, x: -0.55, y: 12.2 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 0.35, woodY: 12.2 },
        { type: 'cracker', color: 'red', variant: 'ring', mystery: true, x: -0.35, y: 11.45 },
        { type: 'cracker', color: 'red', variant: 'ring', mystery: true, x: 0.35, y: 11.3 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -1.35, y: 10.65 },
        { type: 'egg', color: 'brown', x: -0.6, y: 10.65 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 0.15, y: 10.55 },
        { type: 'egg', color: 'blue', x: 0.9, y: 10.6 },
        { type: 'cracker', color: 'orange', variant: 'ring', mystery: true, x: 1.45, y: 10.55 },
        { type: 'egg', color: 'pink', x: 1.95, y: 10.6 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.3, woodY: 9.95 },
        { type: 'cracker', color: 'cream', variant: 'square', x: -0.55, y: 9.9 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.55, y: 9.95 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -1.25, y: 9.2 },
        { type: 'cracker', color: 'blue', variant: 'square', x: -0.55, y: 9.2 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.15, y: 9.25 },
        { type: 'egg', color: 'orange', x: 0.85, y: 9.25 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.55, y: 9.2 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.35, y: 8.55 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.45, y: 8.55 },
        { type: 'egg', color: 'orange', x: -1.3, y: 7.9 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.55, y: 7.9 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.2, y: 7.9 },
        { type: 'egg', color: 'cream', x: 1.2, y: 7.9 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.2, y: 19.45 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.9, y: 19.45 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.25, y: 17.3 }
      ],
    },
    {
      name: 'Level 17',
      bakedId: 'flock-17',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'orange', x: -0.55, y: 19.3 },
        { type: 'egg', color: 'brown', x: 0.15, y: 19.3 },
        { type: 'cracker', color: 'blue', variant: 'square', x: 0.85, y: 19.3 },
        { type: 'egg', color: 'green', x: 1.65, y: 19.35 },
        { type: 'cracker', color: 'purple', variant: 'square', x: -1.25, y: 18.55 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.55, y: 18.45 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 0.35, y: 18.5 },
        { type: 'egg', color: 'teal', x: 1.15, y: 18.5 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 1.85, y: 18.55 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 0.55, y: 17.75 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -1.25, y: 16.95 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 0.1, y: 16.95 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 1.3, y: 16.95 },
        { type: 'cracker', color: 'pink', variant: 'ring', hasKey: true, x: -0.85, y: 16.25 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: -0.15, y: 16.1 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.65, y: 16.1 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 1.6, y: 16.2 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -1.3, y: 15.35 },
        { type: 'cracker', color: 'blue', variant: 'square', x: -0.55, y: 15.35 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.2, y: 15.35 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 1, y: 15.35 },
        { type: 'egg', color: 'teal', locked: true, x: 1.75, y: 15.3 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -1.25, y: 14.55 },
        { type: 'egg', color: 'yellow', x: -0.45, y: 14.5 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 0.35, y: 14.55 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.55, y: 13.75 },
        { type: 'cracker', color: 'blue', variant: 'square', x: 0.2, y: 13.75 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.05, y: 13.75 },
        { type: 'egg', color: 'pink', x: 1.75, y: 13.75 },
        { type: 'cracker', color: 'purple', variant: 'square', x: -1.2, y: 12.95 },
        { type: 'cracker', color: 'purple', variant: 'square', x: -0.45, y: 12.55 },
        { type: 'egg', color: 'cream', x: -1.1, y: 11.75 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.15, y: 11.75 },
        { type: 'egg', color: 'blue', x: 0.65, y: 11.75 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 1.45, y: 11.75 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.93, y: 19.6 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 0.65, y: 19.05 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 1.35, y: 19.05 }
      ],
    },
    {
      name: 'Level 18',
      bakedId: 'flock-18',
      bakedVer: 1,
      layout: [
        { type: 'cracker', color: 'purple', variant: 'triangle', mystery: true, x: -0.35, y: 19.35 },
        { type: 'egg', color: 'purple', x: 0.35, y: 19.35 },
        { type: 'egg', color: 'brown', x: 1.05, y: 19.35 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 0.35, y: 18.6 },
        { type: 'egg', color: 'blue', x: -0.85, y: 17.95 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.15, y: 17.95 },
        { type: 'egg', color: 'cream', x: 0.55, y: 17.95 },
        { type: 'egg', color: 'orange', x: 1.25, y: 17.95 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -0.15, y: 17.2 },
        { type: 'egg', color: 'cream', x: -1.3, y: 16.45 },
        { type: 'cracker', color: 'brown', variant: 'triangle', x: -0.55, y: 16.45 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.25, y: 16.45 },
        { type: 'egg', color: 'pink', x: 1.05, y: 16.45 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 1.7, y: 16.45 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.6, woodW: 1.1, woodX: -1.55, woodY: 15.75, woodThick: 0.28 },
        { type: 'cracker', color: 'brown', variant: 'triangle', x: 0.15, y: 15.75 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 1.35, woodY: 15.75 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.85, y: 15 },
        { type: 'egg', color: 'blue', x: -0.15, y: 15 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 0.65, y: 15 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 1.35, y: 15 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -1.45, woodY: 14.3 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -0.15, y: 14.3 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.65, y: 14.3 },
        { type: 'cracker', color: 'brown', variant: 'triangle', x: -0.85, y: 13.55 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.15, y: 13.55 },
        { type: 'egg', color: 'cream', x: 0.55, y: 13.55 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.3, y: 13.55 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: -0.85, y: 12.8 },
        { type: 'egg', color: 'cream', x: -0.15, y: 12.8 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: -1.25, y: 12.05 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.55, y: 12.05 },
        { type: 'cracker', color: 'brown', variant: 'triangle', x: 0.25, y: 12.05 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.35, y: 11.3 },
        { type: 'egg', color: 'orange', x: -1.3, y: 10.55 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.55, y: 10.55 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.15, y: 10.55 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: 0.85, y: 10.55 },
        { type: 'egg', color: 'green', x: 1.55, y: 10.55 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: -1.55, y: 9.8 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -0.85, y: 9.8 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: -0.15, y: 9.75 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.85, y: 9.75 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -1.25, y: 9.05 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: -0.55, y: 9.05 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.15, y: 9.05 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -0.15, y: 8.35 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.55, y: 8.35 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.54, y: 19.15 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: 0.16, y: 19.15 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.89, y: 19.6 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.16, y: 18.5 }
      ],
    },
    {
      name: 'Level 19',
      bakedId: 'flock-19',
      bakedVer: 1,
      layout: [
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.55, y: 19.35 },
        { type: 'egg', color: 'green', x: 0.15, y: 19.4 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.85, y: 19.35 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.35, y: 18.65 },
        { type: 'egg', color: 'cream', x: -1.3, y: 17.95 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.55, y: 17.95 },
        { type: 'egg', color: 'purple', x: 0.15, y: 17.95 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 0.85, y: 17.95 },
        { type: 'egg', color: 'blue', x: 1.55, y: 17.95 },
        { type: 'cracker', color: 'pink', variant: 'square', x: -1.3, y: 17.25 },
        { type: 'cracker', color: 'pink', variant: 'square', x: -0.55, y: 17.25 },
        { type: 'cracker', color: 'purple', variant: 'square', x: 0.25, y: 17.25 },
        { type: 'cracker', color: 'pink', variant: 'square', x: 1.05, y: 17.25 },
        { type: 'egg', color: 'red', x: -1, y: 16.55 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 0.35, y: 16.55 },
        { type: 'egg', color: 'orange', x: 1.05, y: 16.55 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -1, y: 15.85 },
        { type: 'egg', color: 'brown', x: 1.55, y: 15.85 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -1.3, y: 15.1 },
        { type: 'cracker', color: 'purple', variant: 'triangle', hasKey: true, x: -0.55, y: 15.1 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 0.25, y: 15.1 },
        { type: 'egg', color: 'red', x: 1.05, y: 15.1 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -1, y: 14.35 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: -0.25, y: 14.35 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.55, y: 14.35 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -1.3, y: 13.6 },
        { type: 'egg', color: 'cream', locked: true, x: -0.05, y: 13.55 },
        { type: 'cracker', color: 'red', variant: 'ring', x: 0.55, y: 13.55 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.55, y: 13.55 },
        { type: 'egg', color: 'cream', x: -1.3, y: 12.85 },
        { type: 'egg', color: 'pink', x: -0.55, y: 12.85 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.15, y: 12.85 },
        { type: 'egg', color: 'blue', x: 0.95, y: 12.85 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.15, y: 12.1 },
        { type: 'egg', color: 'orange', x: -1.35, y: 11.35 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.55, y: 11.35 },
        { type: 'egg', color: 'green', x: 0.25, y: 11.35 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 1.05, y: 11.35 },
        { type: 'cracker', color: 'red', variant: 'ring', hasKey: true, x: -0.85, y: 10.6 },
        { type: 'cracker', color: 'blue', variant: 'square', x: 0.15, y: 10.6 },
        { type: 'cracker', color: 'green', variant: 'square', x: 0.85, y: 10.6 },
        { type: 'cracker', color: 'pink', variant: 'square', x: 1.55, y: 10.6 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -1.3, y: 9.85 },
        { type: 'egg', color: 'red', locked: true, x: -0.55, y: 9.8 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 1.55, y: 9.85 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.85, y: 9.1 },
        { type: 'egg', color: 'orange', x: -0.05, y: 9.1 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.99, y: 19.6 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.29, y: 19.6 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.46, y: 18.5 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 0.24, y: 18.5 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.81, y: 19 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 0.59, y: 19 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.53, y: 17.1 }
      ],
    },
    {
      name: 'Level 20',
      bakedId: 'flock-20',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'purple', x: 0.05, y: 19.35 },
        { type: 'egg', color: 'orange', x: -0.85, y: 18.65 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.05, y: 18.65 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.75, y: 18.65 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.45, y: 18.65 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -0.85, y: 17.85 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: -0.05, y: 17.85 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: 0.75, y: 17.85 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -0.45, y: 17.1 },
        { type: 'cracker', color: 'purple', variant: 'triangle', hasKey: true, x: 0.55, y: 17.1 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 1.25, y: 17.1 },
        { type: 'egg', color: 'cream', x: -1.1, y: 16.35 },
        { type: 'egg', color: 'purple', x: -0.35, y: 16.35 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 0.45, y: 16.35 },
        { type: 'wood', woodShape: 'plank', woodRot: 0.5, woodW: 1.15, woodX: 1.55, woodY: 16.4, woodThick: 0.28 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.85, y: 15.6 },
        { type: 'egg', color: 'blue', locked: true, x: -1.35, y: 14.85 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.35, y: 14.85 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.55, y: 14.85 },
        { type: 'egg', color: 'cream', x: 1.25, y: 14.85 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.55, woodW: 1.15, woodX: -1.35, woodY: 14.1, woodThick: 0.28 },
        { type: 'egg', color: 'green', x: 1.45, y: 14.15 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.85, y: 13.35 },
        { type: 'egg', color: 'green', x: -0.55, y: 12.55 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 0.35, y: 12.55 },
        { type: 'egg', color: 'blue', x: 1.15, y: 12.55 },
        { type: 'egg', color: 'brown', x: -0.35, y: 11.3 },
        { type: 'cracker', color: 'green', variant: 'square', x: 0.35, y: 11.3 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1.05, y: 11.3 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1.65, y: 11.3 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.85, y: 10.55 },
        { type: 'wood', woodShape: 'arc', woodRot: 0, woodW: 0.9, woodX: 0.35, woodY: 10.55 },
        { type: 'egg', color: 'green', x: -1.25, y: 9.8 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 0.65, y: 9.85 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 1.25, y: 9.8 },
        { type: 'egg', color: 'pink', x: -0.55, y: 9.05 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: 0.35, y: 9.05 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 1.05, y: 9.05 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 1.65, y: 9.05 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.36, y: 19.2 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.34, y: 19.2 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.71, y: 19.6 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.69, y: 19.6 }
      ],
    },
    {
      name: 'Level 21',
      bakedId: 'flock-21',
      bakedVer: 1,
      layout: [
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.35, y: 19.35 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.55, y: 19.4 },
        { type: 'cracker', color: 'cream', variant: 'square', x: -0.85, y: 18.65 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -0.05, y: 18.65 },
        { type: 'cracker', color: 'brown', variant: 'square', x: 0.75, y: 18.65 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.35, y: 17.95 },
        { type: 'egg', color: 'brown', x: 0.45, y: 17.95 },
        { type: 'egg', color: 'blue', x: -0.75, y: 17.2 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.05, y: 17.2 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 0.75, y: 17.2 },
        { type: 'egg', color: 'green', x: -1.2, y: 16.45 },
        { type: 'egg', color: 'cream', x: -0.45, y: 16.45 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 0.35, woodY: 16.45 },
        { type: 'egg', color: 'brown', x: 1.35, y: 16.45 },
        { type: 'cracker', color: 'orange', variant: 'ring', hasKey: true, x: -1.15, y: 15.7 },
        { type: 'egg', color: 'blue', x: 1.15, y: 15.7 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -1.2, y: 14.95 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.45, y: 14.95 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 0.35, woodY: 14.95 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: 1.15, y: 14.95 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 1.75, y: 14.95 },
        { type: 'egg', color: 'orange', x: -1.15, y: 14.2 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.55, y: 14.2 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: -0.35, woodY: 13.55 },
        { type: 'egg', color: 'cream', locked: true, x: -1.15, y: 13.5 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 1.15, y: 13.5 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -1.15, y: 12.8 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.15, y: 12.8 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.35, y: 11.9 },
        { type: 'egg', color: 'brown', x: 0.45, y: 11.9 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: -0.85, y: 11.15 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.05, y: 11.15 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.75, y: 11.15 },
        { type: 'egg', color: 'brown', x: 1.45, y: 11.15 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.35, y: 10.4 },
        { type: 'egg', color: 'green', x: 0.45, y: 10.4 },
        { type: 'cracker', color: 'green', variant: 'square', x: 1.15, y: 10.4 },
        { type: 'egg', color: 'green', x: -0.35, y: 9.65 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 0.45, y: 9.65 },
        { type: 'cracker', color: 'blue', variant: 'square', x: 1.15, y: 9.65 },
        { type: 'egg', color: 'orange', x: -0.35, y: 8.9 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 0.45, y: 8.9 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.04, y: 19.6 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.5, y: 19.2 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.2, y: 19.2 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.15, y: 19.6 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.55, y: 19.6 }
      ],
    },
    {
      name: 'Level 22',
      bakedId: 'flock-22',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'purple', x: -0.85, y: 19.35 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.35, y: 19.4 },
        { type: 'egg', color: 'blue', x: 1.15, y: 19.35 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 0.25, y: 18.65 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 0.95, y: 18.65 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -1.35, y: 17.95 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.65, y: 17.95 },
        { type: 'egg', color: 'orange', x: -0.05, y: 17.95 },
        { type: 'egg', color: 'yellow', x: 0.65, y: 17.95 },
        { type: 'egg', color: 'blue', x: 1.35, y: 17.95 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.9, y: 17.95 },
        { type: 'egg', color: 'teal', x: -1.25, y: 17.2 },
        { type: 'egg', color: 'purple', x: -0.05, y: 17.15 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.05, y: 17.2 },
        { type: 'cracker', color: 'teal', variant: 'triangle', x: -0.05, y: 16.4 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -1.3, y: 15.65 },
        { type: 'egg', color: 'teal', x: -0.05, y: 15.6 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: 0.75, y: 15.65 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.05, y: 14.85 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.75, y: 14.85 },
        { type: 'cracker', color: 'yellow', variant: 'square', x: -0.85, y: 14.1 },
        { type: 'cracker', color: 'cream', variant: 'square', x: -0.15, y: 14.1 },
        { type: 'cracker', color: 'brown', variant: 'square', x: 0.55, y: 14.1 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1.25, y: 14.1 },
        { type: 'egg', color: 'brown', x: -1.35, y: 13.3 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.55, y: 13.3 },
        { type: 'egg', color: 'red', x: 0.35, y: 13.3 },
        { type: 'cracker', color: 'yellow', variant: 'ring', hasKey: true, x: 1.35, y: 13.3 },
        { type: 'cracker', color: 'yellow', variant: 'ring', x: -0.35, y: 12.55 },
        { type: 'egg', color: 'yellow', x: 0.45, y: 12.5 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -1.3, y: 11.8 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.55, y: 11.8 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 1.25, y: 11.8 },
        { type: 'egg', color: 'brown', x: 1.85, y: 11.8 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.35, y: 11.05 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: -1.3, y: 10.3 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.55, y: 10.3 },
        { type: 'cracker', color: 'brown', variant: 'ring', hasKey: true, x: 0.15, y: 10.3 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 1.35, y: 10.3 },
        { type: 'egg', color: 'purple', x: -0.85, y: 9.55 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.15, y: 9.55 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.55, y: 9.55 },
        { type: 'egg', color: 'pink', x: 1.35, y: 9.55 },
        { type: 'egg', color: 'cream', x: -0.55, y: 8.85 },
        { type: 'cracker', color: 'red', variant: 'ring', x: 0.25, y: 8.85 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: -1.3, y: 8.1 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: -0.55, y: 8.1 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: 0.25, y: 8.1 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 1.05, y: 8.1 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 1.75, y: 8.1 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: -0.21, y: 19.6 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 0.49, y: 19.6 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.07, y: 19.6 },
        { type: 'cracker', color: 'yellow', variant: 'ring', x: -0.1, y: 18.5 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: -0.1, y: 17.75 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.04, y: 14.65 }
      ],
    },
    {
      name: 'Level 23',
      bakedId: 'flock-23',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'blue', x: 0.15, y: 19.55 },
        { type: 'wood', woodShape: 'plank', woodRot: 0.5, woodW: 1.15, woodX: -0.85, woodY: 18.85, woodThick: 0.28 },
        { type: 'egg', color: 'pink', x: -0.35, y: 18.55 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.5, woodW: 1.15, woodX: 0.95, woodY: 18.55, woodThick: 0.28 },
        { type: 'egg', color: 'purple', x: -0.05, y: 17.75 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.5, woodW: 1.15, woodX: 0.55, woodY: 16.85, woodThick: 0.28 },
        { type: 'egg', color: 'cream', x: -0.75, y: 16.05 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 0.05, y: 16.1 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 0.75, y: 16.1 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: -1.25, y: 15.35 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: -0.45, y: 15.35 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 0.35, y: 15.35 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.15, y: 15.35 },
        { type: 'cracker', color: 'red', variant: 'ring', x: -0.95, y: 14.6 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: 0.35, y: 14.65 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.15, y: 14.55 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -1.25, y: 13.85 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -0.55, y: 13.85 },
        { type: 'cracker', color: 'pink', variant: 'ring', hasKey: true, x: 0.15, y: 13.85 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.85, y: 13.85 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 1.55, y: 13.85 },
        { type: 'cracker', color: 'pink', variant: 'square', x: -1.25, y: 13.1 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 0.45, y: 13.1 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1.15, y: 13.1 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1.75, y: 13.1 },
        { type: 'cracker', color: 'blue', variant: 'square', x: -1.25, y: 12.35 },
        { type: 'cracker', color: 'purple', variant: 'square', x: -0.45, y: 12.35 },
        { type: 'cracker', color: 'purple', variant: 'square', x: 0.35, y: 12.35 },
        { type: 'cracker', color: 'pink', variant: 'square', x: 1.05, y: 12.35 },
        { type: 'egg', color: 'purple', locked: true, x: -0.05, y: 11.55 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.65, y: 10.8 },
        { type: 'egg', color: 'red', x: 0.15, y: 10.8 },
        { type: 'egg', color: 'red', x: 0.85, y: 10.8 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: -0.35, y: 10.05 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', hasKey: true, x: 0.45, y: 10.05 },
        { type: 'egg', color: 'cream', x: -1.3, y: 9.3 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.55, y: 9.3 },
        { type: 'egg', color: 'red', x: 0.25, y: 9.3 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.95, y: 9.3 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.55, y: 9.3 },
        { type: 'egg', color: 'blue', locked: true, x: -1.25, y: 8.55 },
        { type: 'cracker', color: 'blue', variant: 'ring', x: -0.45, y: 8.55 },
        { type: 'egg', color: 'blue', x: 0.35, y: 8.55 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.12, y: 15.15 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.82, y: 15.15 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: -0.23, y: 15.65 }
      ],
    },
    {
      name: 'Level 24',
      bakedId: 'flock-24',
      bakedVer: 1,
      layout: [
        { type: 'egg', color: 'red', x: 0.05, y: 19.55 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 1.15, y: 19.5 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: -1.25, y: 18.8 },
        { type: 'egg', color: 'brown', x: -1.2, y: 18.1 },
        { type: 'egg', color: 'teal', x: -0.55, y: 18.1 },
        { type: 'cracker', color: 'pink', variant: 'triangle', x: 0.15, y: 18.1 },
        { type: 'cracker', color: 'purple', variant: 'triangle', x: 0.85, y: 18.1 },
        { type: 'egg', color: 'blue', x: 1.55, y: 18.1 },
        { type: 'egg', color: 'pink', x: -0.55, y: 17.35 },
        { type: 'egg', color: 'purple', x: 0.15, y: 17.35 },
        { type: 'egg', color: 'yellow', x: 0.85, y: 17.35 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: -1.3, y: 16.6 },
        { type: 'cracker', color: 'red', variant: 'ring', x: 0.55, y: 16.6 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: 1.55, y: 16.6 },
        { type: 'cracker', color: 'pink', variant: 'square', x: -1.25, y: 15.85 },
        { type: 'egg', color: 'yellow', x: 0.05, y: 15.9 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 1.55, y: 15.85 },
        { type: 'cracker', color: 'brown', variant: 'square', mystery: true, x: -0.55, y: 15.15 },
        { type: 'cracker', color: 'brown', variant: 'square', mystery: true, x: 0.55, y: 15.15 },
        { type: 'wood', woodShape: 'plank', woodRot: 0.5, woodW: 1.15, woodX: -1.35, woodY: 14.85, woodThick: 0.28 },
        { type: 'cracker', color: 'teal', variant: 'square', mystery: true, x: 0.05, y: 14.55 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.5, woodW: 1.15, woodX: 1.25, woodY: 14.75, woodThick: 0.28 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -1.3, y: 13.95 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: -0.55, y: 13.95 },
        { type: 'egg', color: 'green', x: 0.25, y: 13.95 },
        { type: 'egg', color: 'green', x: 1.05, y: 13.95 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 1.75, y: 13.95 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -1.35, y: 13.2 },
        { type: 'egg', color: 'brown', x: -0.55, y: 13.2 },
        { type: 'cracker', color: 'red', variant: 'triangle', x: 0.25, y: 13.2 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.95, y: 13.2 },
        { type: 'egg', color: 'red', x: 1.65, y: 13.2 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: -0.35, y: 12.45 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 1.15, y: 12.45 },
        { type: 'cracker', color: 'red', variant: 'square', mystery: true, x: -1.3, y: 11.55 },
        { type: 'cracker', color: 'green', variant: 'square', mystery: true, x: -0.55, y: 11.55 },
        { type: 'cracker', color: 'blue', variant: 'square', mystery: true, x: 0.15, y: 11.55 },
        { type: 'egg', color: 'orange', x: 0.95, y: 11.55 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 1.65, y: 11.55 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.35, y: 10.8 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 0.55, y: 10.8 },
        { type: 'cracker', color: 'yellow', variant: 'ring', x: 1.55, y: 10.8 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -1.3, y: 10.05 },
        { type: 'egg', color: 'blue', x: -0.55, y: 10.05 },
        { type: 'cracker', color: 'red', variant: 'ring', x: 1.05, y: 10.05 },
        { type: 'egg', color: 'purple', x: -1.25, y: 9.3 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: -0.55, y: 9.3 },
        { type: 'cracker', color: 'pink', variant: 'ring', x: 0.35, y: 9.3 },
        { type: 'egg', color: 'orange', x: 1.15, y: 9.3 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.55, y: 8.55 },
        { type: 'cracker', color: 'brown', variant: 'ring', x: 0.35, y: 8.55 },
        { type: 'cracker', color: 'purple', variant: 'ring', x: -0.34, y: 19.35 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: -0.39, y: 18.65 },
        { type: 'cracker', color: 'blue', variant: 'triangle', x: 0.31, y: 18.65 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.66, y: 17.9 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 0.96, y: 16.4 }
      ],
    },
    {
      name: 'Level 25',
      bakedId: 'flock-25',
      bakedVer: 1,
      layout: [
        { type: 'cracker', color: 'teal', variant: 'ring', x: 0.15, y: 19.5 },
        { type: 'egg', color: 'cream', x: 0.85, y: 19.5 },
        { type: 'cracker', color: 'cream', variant: 'square', x: -0.15, y: 18.8 },
        { type: 'cracker', color: 'green', variant: 'square', x: 0.55, y: 18.8 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 1.15, y: 18.8 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: -1.3, y: 18.05 },
        { type: 'egg', color: 'green', x: -0.6, y: 18.05 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 0.1, y: 18.05 },
        { type: 'egg', color: 'teal', x: 0.8, y: 18.05 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: 1.5, y: 18.05 },
        { type: 'cracker', color: 'green', variant: 'ring', x: -0.55, y: 17.3 },
        { type: 'egg', color: 'yellow', x: 0.35, y: 17.3 },
        { type: 'cracker', color: 'orange', variant: 'square', x: -1.3, y: 16.55 },
        { type: 'egg', color: 'cream', x: -0.55, y: 16.55 },
        { type: 'cracker', color: 'cream', variant: 'square', x: 0.25, y: 16.55 },
        { type: 'cracker', color: 'orange', variant: 'square', x: 0.95, y: 16.55 },
        { type: 'wood', woodShape: 'diamond', woodRot: 0, woodW: 1.05, woodX: 1.35, woodY: 16.2 },
        { type: 'egg', color: 'teal', x: -1.2, y: 15.75 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: -0.35, y: 15.75 },
        { type: 'egg', color: 'green', x: 0.45, y: 15.75 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.05, y: 14.95 },
        { type: 'cracker', color: 'yellow', variant: 'ring', hasKey: true, x: 0.75, y: 14.95 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 1.35, y: 14.95 },
        { type: 'wood', woodShape: 'plank', woodRot: -0.5, woodW: 1.15, woodX: -1.35, woodY: 14.65, woodThick: 0.28 },
        { type: 'egg', color: 'yellow', x: -0.55, y: 14.45 },
        { type: 'egg', color: 'cream', x: 0.25, y: 14.45 },
        { type: 'cracker', color: 'cream', variant: 'ring', x: 1.05, y: 14.45 },
        { type: 'cracker', color: 'orange', variant: 'ring', x: 1.75, y: 14.45 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: -0.85, y: 13.55 },
        { type: 'cracker', color: 'cream', variant: 'triangle', x: 0.25, y: 13.55 },
        { type: 'egg', color: 'teal', locked: true, x: 0.95, y: 13.5 },
        { type: 'cracker', color: 'green', variant: 'ring', x: 1.65, y: 13.55 },
        { type: 'cracker', color: 'orange', variant: 'triangle', hasKey: true, x: -0.15, y: 12.75 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: -0.55, y: 12 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.15, y: 12 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.85, y: 12 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 1.55, y: 12 },
        { type: 'egg', color: 'orange', x: 2, y: 12.05 },
        { type: 'egg', color: 'orange', x: 0.35, y: 11.2 },
        { type: 'cracker', color: 'teal', variant: 'ring', locked: true, x: -1.3, y: 10.45 },
        { type: 'egg', color: 'orange', x: 0.15, y: 10.35 },
        { type: 'egg', color: 'orange', x: 0.85, y: 10.35 },
        { type: 'wood', woodShape: 'plank', woodRot: 0.5, woodW: 1.15, woodX: 1.55, woodY: 10.55, woodThick: 0.28 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 0.15, y: 9.35 },
        { type: 'cracker', color: 'teal', variant: 'ring', x: -0.85, y: 8.7 },
        { type: 'egg', color: 'yellow', x: -0.15, y: 8.65 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: 0.55, y: 8.65 },
        { type: 'cracker', color: 'green', variant: 'triangle', x: 1.25, y: 8.65 },
        { type: 'cracker', color: 'yellow', variant: 'triangle', x: -0.1, y: 17.85 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 0.07, y: 17.1 },
        { type: 'cracker', color: 'orange', variant: 'triangle', x: 0.77, y: 17.1 }
      ],
    },
  ];

  function mergeBakedLevels() {
    // Skip if the user has baked their own level set — don't clobber it with defaults.
    if (localStorage.getItem(BAKED_OVERRIDE_KEY) === '1') return;

    let changed = false;
    for (const baked of BAKED_LEVELS) {
      const idx = levels.findIndex(lv => lv.bakedId === baked.bakedId);
      if (idx >= 0) {
        if ((levels[idx].bakedVer || 0) < baked.bakedVer) {
          levels[idx] = { ...levels[idx], layout: baked.layout, bakedVer: baked.bakedVer };
          changed = true;
        }
      } else {
        levels.push({ name: baked.name, bakedId: baked.bakedId, bakedVer: baked.bakedVer, layout: baked.layout });
        changed = true;
      }
    }
    if (changed) saveLevelsToStorage();
  }

  // ---- Level bank state -----------------------------------------------------
  const STORAGE_KEY = 'flock-feast-levels';
  let levels = [];          // [{ name, layout }]  — sole source of truth
  let currentLevelIdx = null;         // index into `levels`, null = scratch
  let savedPegsSnapshot = '';         // JSON snapshot at last load/save (for dirty detection)
  let _lastKnownDirty = false;        // throttle DOM updates for dirty indicator

  function pegsSnapshot() {
    return JSON.stringify(pegs.map((p) => {
      if (p.type === 'wood') {
        const snap = { type: 'wood', woodShape: p.woodShape, woodRot: +(p.woodRot || 0).toFixed(3), woodW: +(p.woodW || 1).toFixed(3), woodThick: +(p.woodThick || 0.22).toFixed(3), x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
        if (p.woodShape === 'arc' && p.woodArcSweep != null) snap.woodArcSweep = p.woodArcSweep;
        return snap;
      }
      return { type: p.type, color: p.color, variant: p.variant, locked: p.locked, hasKey: p.hasKey, mystery: p.mystery, x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
    }));
  }
  function isDirty() {
    if (currentLevelIdx === null) return pegs.length > 0;
    return pegsSnapshot() !== savedPegsSnapshot;
  }
  const BAKED_OVERRIDE_KEY = 'flock-feast-custom-baked';

  function loadLevelsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      levels = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(levels)) levels = [];
    } catch { levels = []; }
  }
  function saveLevelsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
    } catch (e) {
      setValid('warn', '⚠ Could not save levels (storage full?)');
      console.error('saveLevelsToStorage failed:', e);
    }
  }

  // ---- DOM ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  const game = $('game');
  const frameStatus = $('frameStatus');

  // ---- Canvas sizing + world<->pixel mapping --------------------------------
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };

  // Scale is fixed to the stage width so the canvas is exactly as wide as the
  // stage but taller than it, making it scroll vertically like a long document.
  function layoutCanvas(preserveScroll) {
    const wrap = $('canvasScroll');
    const worldW = WORLD.xMax * 2;
    const worldH = WORLD.yTop - WORLD.yBottom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Save which world-Y is at the viewport centre before resize.
    let savedCentreY = null;
    if (preserveScroll && wrap && wrap.clientHeight > 0) {
      const centrePy = wrap.scrollTop + wrap.clientHeight / 2;
      // view.scale may still be from the previous layout; that's fine — we just
      // need an approximate world Y to restore after the new scale is computed.
      savedCentreY = view.oy - centrePy / view.scale;
    }

    // 8 px margin on each side so the cavity outline never clips the scroll bar.
    const availW = stage.clientWidth - 16;
    const scale = Math.max(8, availW / worldW);
    const w = worldW * scale;
    const h = worldH * scale;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = { scale, ox: WORLD.xMax, oy: WORLD.yTop, w, h };

    if (wrap) {
      if (savedCentreY !== null) {
        // Restore centre so the same world region stays in view after resize.
        wrap.scrollTop = wy2px(savedCentreY) - wrap.clientHeight / 2;
      } else {
        scrollToCavity(wrap);
      }
    }
    draw();
  }

  // Scroll the wrapper so the active peg zone (around anchorY) is visible
  // in the lower two-thirds of the viewport — the funnel throat is visible
  // below it and there is room to place pegs above.
  function scrollToCavity(wrap) {
    if (!wrap) wrap = $('canvasScroll');
    if (!wrap || !wrap.clientHeight) return;
    // Target: BOARD.anchorY sits 65 % down from the top of the visible window.
    const targetPy = wy2px(BOARD.anchorY);
    wrap.scrollTop = Math.max(0, targetPy - wrap.clientHeight * 0.65);
  }
  const wx2px = (x) => (x + view.ox) * view.scale;
  const wy2px = (y) => (view.oy - y) * view.scale;
  const px2wx = (px) => px / view.scale - view.ox;
  const px2wy = (py) => view.oy - py / view.scale;

  // Clamp a world point to inside the cavity for the given item radius.
  function clampToCavity(x, y, r) {
    const yy = Math.max(WORLD.yBottom + r, Math.min(WORLD.yTop - r, y));
    const wall = Math.min(BOARD.x1, funnelContactX(yy)) - r;
    const w = Math.max(0, wall);
    const xx = Math.max(-w, Math.min(w, x));
    return { x: xx, y: yy };
  }

  // ---- Drawing --------------------------------------------------------------
  function cavityPath() {
    const p = new Path2D();
    p.moveTo(wx2px(-FE.x0), wy2px(WORLD.yTop));
    p.lineTo(wx2px(-FE.x0), wy2px(FE.y0));
    p.bezierCurveTo(wx2px(-FE.c1x), wy2px(FE.c1y), wx2px(-FE.c2x), wy2px(FE.c2y), wx2px(-FE.x1), wy2px(FE.y1));
    p.lineTo(wx2px(-FE.x1), wy2px(CONTAINER_CORNER_Y));
    p.quadraticCurveTo(wx2px(-FE.x1), wy2px(CONTAINER_BASE_Y), wx2px(-0.49), wy2px(CONTAINER_BASE_Y));
    p.lineTo(wx2px(0.49), wy2px(CONTAINER_BASE_Y));
    p.quadraticCurveTo(wx2px(FE.x1), wy2px(CONTAINER_BASE_Y), wx2px(FE.x1), wy2px(CONTAINER_CORNER_Y));
    p.lineTo(wx2px(FE.x1), wy2px(FE.y1));
    p.bezierCurveTo(wx2px(FE.c2x), wy2px(FE.c2y), wx2px(FE.c1x), wy2px(FE.c1y), wx2px(FE.x0), wy2px(FE.y0));
    p.lineTo(wx2px(FE.x0), wy2px(WORLD.yTop));
    p.closePath();
    return p;
  }
  // Region actually reachable by pegs (funnel clamped to BOARD.x1).
  function placeablePath() {
    const p = new Path2D();
    const steps = 60;
    const ys = [];
    for (let i = 0; i <= steps; i++) ys.push(WORLD.yTop - (i / steps) * (WORLD.yTop - WORLD.yBottom));
    ys.forEach((y, i) => {
      const wall = Math.min(BOARD.x1, funnelContactX(y));
      const X = wx2px(-wall), Y = wy2px(y);
      if (i === 0) p.moveTo(X, Y); else p.lineTo(X, Y);
    });
    for (let i = ys.length - 1; i >= 0; i--) {
      const wall = Math.min(BOARD.x1, funnelContactX(ys[i]));
      p.lineTo(wx2px(wall), wy2px(ys[i]));
    }
    p.closePath();
    return p;
  }

  function draw() {
    ctx.clearRect(0, 0, view.w, view.h);

    // Cavity backdrop.
    const cav = cavityPath();
    ctx.save();
    ctx.fillStyle = '#2b2036';
    ctx.fill(cav);
    ctx.clip(cav);
    // subtle inner lining
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();

    // Grid lines (drawn before items so they sit behind everything).
    if (grid.show) {
      ctx.save();
      const s = grid.size;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      // Horizontal lines (constant world-Y)
      const yIdxMin = Math.floor(WORLD.yBottom / s);
      const yIdxMax = Math.ceil(WORLD.yTop / s);
      for (let i = yIdxMin; i <= yIdxMax; i++) {
        const wy = i * s;
        const py = wy2px(wy);
        if (py < -2 || py > view.h + 2) continue;
        const isInteger = Number.isInteger(Math.round(wy * 1000) / 1000);
        ctx.strokeStyle = isInteger ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(view.w, py); ctx.stroke();
      }

      // Vertical lines (constant world-X)
      const xIdxMin = Math.floor((-WORLD.xMax - 0.5) / s);
      const xIdxMax = Math.ceil((WORLD.xMax + 0.5) / s);
      for (let i = xIdxMin; i <= xIdxMax; i++) {
        const wx = i * s;
        const px = wx2px(wx);
        if (px < -2 || px > view.w + 2) continue;
        const isZero = Math.abs(wx) < s * 0.01;
        const isInteger = Number.isInteger(Math.round(wx * 1000) / 1000);
        ctx.strokeStyle = isZero
          ? 'rgba(180,160,255,0.45)'
          : isInteger ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)';
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, view.h); ctx.stroke();
      }

      // Y-coordinate labels along the left edge at integer-Y grid lines
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.font = `600 ${Math.max(8, Math.round(view.scale * 0.18))}px 'Nunito',sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      for (let i = yIdxMin; i <= yIdxMax; i++) {
        const wy = i * s;
        if (!Number.isInteger(Math.round(wy * 1000) / 1000)) continue;
        const py = wy2px(wy);
        if (py < 10 || py > view.h - 2) continue;
        ctx.fillText('y ' + wy.toFixed(wy % 1 === 0 ? 0 : 2), 4, py - 1);
      }

      ctx.restore();
    }

    // Placeable region hatch + outline.
    const place = placeablePath();
    ctx.save();
    ctx.strokeStyle = 'rgba(243,162,76,0.55)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.stroke(place);
    ctx.restore();

    // Cavity lining (cream piping) over everything.
    ctx.save();
    ctx.strokeStyle = '#f1e58f';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke(cav);
    ctx.restore();

    // Zone annotations — help authors know where the game's visible frame is.
    ctx.save();
    ctx.font = `700 ${Math.round(view.scale * 0.28)}px 'Nunito', sans-serif`;
    ctx.textBaseline = 'middle';

    // Resting line: the lowest point items normally anchor to.
    ctx.strokeStyle = 'rgba(243,162,76,0.35)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, wy2px(BOARD.anchorY));
    ctx.lineTo(view.w, wy2px(BOARD.anchorY));
    ctx.stroke();
    ctx.fillStyle = 'rgba(243,162,76,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText('↓ drop zone', view.w - 4, wy2px(BOARD.anchorY) - view.scale * 0.22);

    // Approximate top of the typical phone-portrait game view (≈ y 7.5).
    const GAME_VIS_TOP = 9.0;
    ctx.strokeStyle = 'rgba(79,176,242,0.30)';
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(0, wy2px(GAME_VIS_TOP));
    ctx.lineTo(view.w, wy2px(GAME_VIS_TOP));
    ctx.stroke();
    ctx.fillStyle = 'rgba(79,176,242,0.50)';
    ctx.textAlign = 'right';
    ctx.fillText('≈ screen top', view.w - 4, wy2px(GAME_VIS_TOP) - view.scale * 0.22);

    // Faint world-Y grid every 1.5 units (= 1 row gap) above the cavity.
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    for (let y = Math.ceil(WORLD.yBottom); y < WORLD.yTop; y += 1.5) {
      ctx.beginPath();
      ctx.moveTo(0, wy2px(y));
      ctx.lineTo(view.w, wy2px(y));
      ctx.stroke();
    }

    ctx.restore();

    // Pegs.
    for (const p of pegs) drawPeg(p);

    updateHud();
  }

  // ---- Wood obstacle rendering (2D top-down representation) -------------------
  function drawWood(p) {
    const cx    = wx2px(p.x), cy = wy2px(p.y);
    const sc    = view.scale;
    const isSel = (p === sel);
    const rot   = p.woodRot || 0;
    const WP    = (p.woodW || 1.0) * sc;   // full width in pixels
    const H     = (p.woodThick || 0.22) * sc;  // plank thickness in pixels
    const shape = (p.woodShape || 'plank').toLowerCase();

    ctx.save();
    ctx.translate(cx, cy);
    // World CCW rotation (+θ) maps to canvas clockwise → use −θ
    ctx.rotate(-rot);

    if (isSel) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(WP * 0.55, H * 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle   = '#7a4c44';
    ctx.strokeStyle = '#2a1a12';
    ctx.lineWidth   = 1.5;

    // Fill+stroke a rounded rect (plank bar) centred at origin, w×h pixels.
    function rbar(w, h) {
      const cr = h * 0.5, hw = w / 2, hh = h / 2;
      ctx.beginPath();
      ctx.moveTo(-hw + cr, -hh);
      ctx.arcTo( hw, -hh,  hw,  hh, cr);
      ctx.arcTo( hw,  hh, -hw,  hh, cr);
      ctx.arcTo(-hw,  hh, -hw, -hh, cr);
      ctx.arcTo(-hw, -hh,  hw, -hh, cr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    function drawChevronPath(isInv) {
      const armLen = WP * 0.86, armH = H * 1.15;
      const ang = Math.PI / 4;
      const sinA = Math.sin(ang), cosA = Math.cos(ang);
      const hh = armH * 0.5;
      const lcx = -armLen * sinA, lcy = -armLen * cosA;
      const rcx =  armLen * sinA, rcy = -armLen * cosA;
      const oLx = lcx - hh * cosA, oLy = lcy + hh * sinA;
      const iLx = lcx + hh * cosA, iLy = lcy - hh * sinA;
      const oRx = rcx + hh * cosA, oRy = rcy + hh * sinA;
      const iRx = rcx - hh * cosA, iRy = rcy - hh * sinA;
      const AolX = -hh * cosA, AolY = hh * sinA;
      const AorX =  hh * cosA, AorY = hh * sinA;
      const nLx = lcx - hh * sinA, nLy = lcy - hh * cosA;
      const nRx = rcx + hh * sinA, nRy = rcy - hh * cosA;
      const apexCy = hh / sinA, notchY = -hh / sinA;
      const mn = hh * 0.55;
      const noAx = -mn * sinA, noAy = notchY - mn * cosA;
      const noDx =  mn * sinA, noDy = notchY - mn * cosA;
      ctx.save();
      if (!isInv) ctx.scale(1, -1);
      ctx.beginPath();
      ctx.moveTo(AolX, AolY);
      ctx.lineTo(oLx, oLy);
      ctx.quadraticCurveTo(nLx, nLy, iLx, iLy);
      ctx.lineTo(noAx, noAy);
      ctx.quadraticCurveTo(0, notchY, noDx, noDy);
      ctx.lineTo(iRx, iRy);
      ctx.quadraticCurveTo(nRx, nRy, oRx, oRy);
      ctx.lineTo(AorX, AorY);
      ctx.quadraticCurveTo(0, apexCy, AolX, AolY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    if (shape === 'plank') {
      rbar(WP, H);
    } else if (shape === 'slab45') {
      ctx.rotate(-Math.PI / 4);
      rbar(WP, H);
    } else if (shape === 'slab_neg45') {
      ctx.rotate( Math.PI / 4);
      rbar(WP, H);
    } else if (shape === 'chevron') {
      drawChevronPath(false);
    } else if (shape === 'invchevron') {
      drawChevronPath(true);
    } else if (shape === 'box') {
      const sz = WP * 0.48;
      const cr = sz * 0.18;
      ctx.beginPath();
      ctx.moveTo(-sz + cr, -sz);
      ctx.arcTo( sz, -sz,  sz,  sz, cr);
      ctx.arcTo( sz,  sz, -sz,  sz, cr);
      ctx.arcTo(-sz,  sz, -sz, -sz, cr);
      ctx.arcTo(-sz, -sz,  sz, -sz, cr);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (shape === 'diamond') {
      const rx = WP * 0.46 * 0.95, ry = WP * 0.46 * 0.86;
      const cr = rx * 0.28;
      ctx.beginPath();
      ctx.moveTo(-cr, -ry + cr * 0.6);
      ctx.quadraticCurveTo(0, -ry, cr, -ry + cr * 0.6);
      ctx.lineTo(rx - cr * 0.6, -cr);
      ctx.quadraticCurveTo(rx, 0, rx - cr * 0.6, cr);
      ctx.lineTo(cr, ry - cr * 0.6);
      ctx.quadraticCurveTo(0, ry, -cr, ry - cr * 0.6);
      ctx.lineTo(-rx + cr * 0.6, cr);
      ctx.quadraticCurveTo(-rx, 0, -rx + cr * 0.6, -cr);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (shape === 'arc') {
      // Match the game's 3D arc: centreline R = len*0.42, full tube width 2*(len*0.075),
      // and rounded end caps (the game's ExtrudeGeometry bevel rounds the arc ends).
      const R2 = WP * 0.42, tw = Math.max(3, WP * 0.15);
      // Arc opens toward +X (right); body is centered on the left side (180°).
      const sweepDeg = (p.woodArcSweep != null ? p.woodArcSweep : 140);
      const halfSpan = (sweepDeg / 2) * (Math.PI / 180);
      // Match the game arc: centreline spans the full sweep and the rounded caps
      // (lineCap 'round', radius tw/2 = tube) bulge past each end, exactly like the
      // game's absarc end caps centred on the sweep boundary.
      const a0 = Math.PI - halfSpan;
      const a1 = Math.PI + halfSpan;
      const prevCap = ctx.lineCap;
      ctx.lineCap = 'round';
      ctx.lineWidth = tw + 2; ctx.strokeStyle = '#2a1a12';
      ctx.beginPath(); ctx.arc(0, 0, R2, a0, a1); ctx.stroke();
      ctx.lineWidth = tw; ctx.strokeStyle = '#7a4c44';
      ctx.beginPath(); ctx.arc(0, 0, R2, a0, a1); ctx.stroke();
      ctx.lineCap = prevCap;
    } else {
      rbar(WP, H);  // fallback
    }

    // Label the shape name for clarity in the editor
    ctx.rotate(rot);   // undo the outer rotation so text is always upright
    ctx.fillStyle = 'rgba(255,240,220,0.72)';
    ctx.font = `700 ${Math.max(9, sc * 0.18)}px 'Nunito',sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(shape, 0, -H / 2 - 2);

    ctx.restore();
  }

  function drawPeg(p) {
    if (p.type === 'wood') { drawWood(p); return; }
    const cx = wx2px(p.x), cy = wy2px(p.y);
    const rad = radiusOf(p) * view.scale;
    const col = hex(FOOD[p.color]);
    const isSel = p === sel;

    ctx.save();
    // selection ring
    if (isSel) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // peg pin behind
    ctx.fillStyle = '#cab48f';
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.32, 0, Math.PI * 2);
    ctx.fill();

    if (p.type === 'egg') {
      // Egg shape matching the game: wider at bottom, tapered at top.
      // Uses the same distortion formula as eggGeo: h = 1 - k*t (k=0.22),
      // where t = -1 at bottom, +1 at top (canvas y-down: sin(angle) = 1 at bottom).
      const ry = rad, rxBase = rad * 0.82, k = 0.22;
      ctx.fillStyle = col;
      ctx.beginPath();
      const STEPS = 48;
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const rx = rxBase * (1 + k * Math.sin(a));   // sin=+1 → bottom wider, sin=−1 → top narrower
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Highlight — offset to upper-left where the egg is narrowest
      ctx.fillStyle = 'rgba(255,255,255,0.40)';
      ctx.beginPath();
      ctx.ellipse(cx - rxBase * 0.30, cy - rad * 0.38, rxBase * 0.22, rad * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawCracker(cx, cy, rad, col, p.variant);
    }

    // mystery overlay
    if (p.mystery) {
      ctx.fillStyle = 'rgba(30,24,44,0.72)';
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${rad * 1.1}px 'Baloo 2', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy + 1);
    }

    // lock / key badges
    if (p.locked) drawBadge(cx + rad * 0.7, cy - rad * 0.7, rad * 0.55, '#f6b23a', '🔒');
    if (p.hasKey) drawBadge(cx + rad * 0.7, cy - rad * 0.7, rad * 0.55, '#ffd36a', '🔑');

    ctx.restore();
  }

  function drawCracker(cx, cy, rad, col, variant) {
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    if (variant === 'square') {
      const s = rad * 1.5;
      roundRect(cx - s / 2, cy - s / 2, s, s, rad * 0.28);
      ctx.fill(); ctx.stroke();
    } else if (variant === 'triangle') {
      ctx.beginPath();
      const r = rad * 1.05;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
        const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else { // ring (donut)
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.arc(cx, cy, rad * 0.42, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBadge(x, y, r, bg, glyph) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${r * 1.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y + 1);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Hit testing ----------------------------------------------------------
  function pegAt(wx, wy) {
    // topmost (last drawn) first
    for (let i = pegs.length - 1; i >= 0; i--) {
      const p = pegs[i];
      const r = radiusOf(p);
      if (Math.hypot(p.x - wx, p.y - wy) <= r * 1.05) return p;
    }
    return null;
  }

  // ---- Pointer interaction --------------------------------------------------
  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; // handled by contextmenu
    const { px, py } = localPoint(e);
    const wx = px2wx(px), wy = px2wy(py);
    const hit = pegAt(wx, wy);
    if (hit) {
      selectPeg(hit);
      dragging = hit;
      dragMoved = false;
      canvas.setPointerCapture(e.pointerId);
    } else if (mode === 'place') {
      const snapped = snapToGrid(wx, wy);
      const c = clampForPlacement(snapped.x, snapped.y, brush);
      const p = makePeg(c.x, c.y);
      pegs.push(p);
      selectPeg(p);
      dragging = p;
      dragMoved = true;
      canvas.setPointerCapture(e.pointerId);
    } else {
      selectPeg(null);
    }
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const { px, py } = localPoint(e);
    const snapped = snapToGrid(px2wx(px), px2wy(py));
    const c = clampForPlacement(snapped.x, snapped.y, dragging);
    dragging.x = c.x; dragging.y = c.y;
    dragMoved = true;
    draw();
    updatePosInputs();
  });

  const endDrag = (e) => {
    if (dragging) { try { canvas.releasePointerCapture(e.pointerId); } catch {} }
    dragging = null;
    updateDirtyState();
    updatePosInputs();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { px, py } = localPoint(e);
    const hit = pegAt(px2wx(px), px2wy(py));
    if (hit) { removePeg(hit); draw(); updateDirtyState(); }
  });

  window.addEventListener('keydown', (e) => {
    // Don't intercept Delete/Backspace when the user is typing in a text or number field
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      removePeg(sel);
      draw();
      updateDirtyState();
    }
  });

  // ---- Peg model helpers ----------------------------------------------------
  function makePeg(x, y) {
    if (brush.type === 'wood') {
      return { id: pegSeq++, type: 'wood', woodShape: brush.woodShape, woodRot: brush.woodRot, woodW: brush.woodW, woodThick: brush.woodThick, woodArcSweep: brush.woodArcSweep, color: undefined, variant: undefined, locked: false, hasKey: false, mystery: false, x, y };
    }
    const p = {
      id: pegSeq++,
      type: brush.type,
      color: brush.color,
      variant: brush.type === 'cracker' ? brush.variant : undefined,
      locked: brush.type === 'egg' ? brush.locked : false,
      hasKey: brush.type === 'cracker' ? brush.hasKey : false,
      mystery: brush.type === 'cracker' ? brush.mystery : false,
      x, y,
    };
    return p;
  }
  function removePeg(p) {
    const i = pegs.indexOf(p);
    if (i >= 0) pegs.splice(i, 1);
    if (sel === p) sel = null;
    syncControls();
  }
  function selectPeg(p) {
    sel = p;
    if (p) {
      brush.type = p.type;
      if (p.type === 'wood') {
        brush.woodShape    = p.woodShape    || 'plank';
        brush.woodRot      = p.woodRot      || 0;
        brush.woodW        = p.woodW        || 1.0;
        brush.woodThick    = p.woodThick    || 0.22;
        brush.woodArcSweep = p.woodArcSweep != null ? p.woodArcSweep : 140;
        // Resolve chip label: box+~0.81 rad was placed via the Diamond preset
        const isDiamondPreset = brush.woodShape === 'box' && Math.abs(brush.woodRot - 0.81) < 0.02;
        brush.woodChip = isDiamondPreset ? 'diamond' : brush.woodShape;
      } else {
        brush.color   = p.color;
        if (p.type === 'cracker') brush.variant = p.variant || 'ring';
        brush.locked  = !!p.locked;
        brush.hasKey  = !!p.hasKey;
        brush.mystery = !!p.mystery;
      }
    }
    syncControls();
  }

  // Sync the position inputs to the currently-selected peg's x/y values.
  function updatePosInputs() {
    if (!sel) return;
    const px = $('posX'), py = $('posY');
    if (px) px.value = sel.x.toFixed(3);
    if (py) py.value = sel.y.toFixed(3);
  }

  // Apply the current brush/flags onto the selected peg (assign edits).
  function applyBrushToSelection() {
    if (!sel) return;
    sel.type = brush.type;
    if (brush.type === 'wood') {
      sel.woodShape    = brush.woodShape;
      sel.woodRot      = brush.woodRot;
      sel.woodW        = brush.woodW;
      sel.woodThick    = brush.woodThick;
      sel.woodArcSweep = brush.woodArcSweep;
      sel.color = undefined; sel.variant = undefined;
      sel.locked = false; sel.hasKey = false; sel.mystery = false;
    } else if (brush.type === 'cracker') {
      sel.color   = brush.color;
      sel.variant = brush.variant;
      sel.locked  = false;
      sel.hasKey  = brush.hasKey;
      sel.mystery = brush.mystery;
    } else {
      sel.color   = brush.color;
      sel.variant = undefined;
      sel.hasKey  = false;
      sel.mystery = false;
      sel.locked  = brush.locked;
    }
    draw();
    updateDirtyState();
  }

  // ---- Controls wiring ------------------------------------------------------
  // Colour swatches
  const swWrap = $('swatches');
  FOOD_KEYS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'sw';
    b.style.setProperty('--sw', hex(FOOD[c]));
    b.dataset.color = c;
    b.title = c;
    b.addEventListener('click', () => { brush.color = c; syncControls(); });
    swWrap.appendChild(b);
  });

  // Mode
  $('modeSeg').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; syncControls(); draw(); });
  });
  // Type
  $('typeSeg').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => { brush.type = b.dataset.type; normalizeBrush(); syncControls(); });
  });
  // Cracker shape chips
  $('shapeChips').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => { brush.variant = b.dataset.variant; syncControls(); });
  });
  // Wood shape chips
  // "Diamond" is a UX alias for box rotated 0.81 rad (≈ 45°).
  const SHAPE_ROT_DEFAULTS = { diamond: { woodShape: 'box', woodRot: 0.81 } };
  $('woodShapeChips').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const preset = SHAPE_ROT_DEFAULTS[b.dataset.wshape];
      if (preset) {
        brush.woodShape = preset.woodShape;
        brush.woodRot   = preset.woodRot;
      } else {
        brush.woodShape = b.dataset.wshape;
      }
      brush.woodChip = b.dataset.wshape;  // track the label that was actually clicked
      syncControls();
    });
  });
  // Wood rotation — slider ↔ number input
  $('woodRotSlider').addEventListener('input', (e) => {
    brush.woodRot = parseFloat(e.target.value);
    $('woodRotNum').value = brush.woodRot.toFixed(2);
    applyBrushToSelection();
  });
  $('woodRotNum').addEventListener('change', (e) => {
    let v = parseFloat(e.target.value);
    if (isNaN(v)) { e.target.value = (brush.woodRot || 0).toFixed(2); return; }
    v = Math.max(-3.14, Math.min(3.14, v));
    brush.woodRot = v;
    $('woodRotSlider').value = v;
    e.target.value = v.toFixed(2);
    applyBrushToSelection();
  });

  // Wood length — slider ↔ number input
  $('woodWSlider').addEventListener('input', (e) => {
    brush.woodW = parseFloat(e.target.value);
    $('woodWNum').value = brush.woodW.toFixed(2);
    applyBrushToSelection();
  });
  $('woodWNum').addEventListener('change', (e) => {
    let v = parseFloat(e.target.value);
    if (isNaN(v)) { e.target.value = (brush.woodW || 1).toFixed(2); return; }
    v = Math.max(0.1, Math.min(5, v));
    brush.woodW = v;
    $('woodWSlider').value = v;
    e.target.value = v.toFixed(2);
    applyBrushToSelection();
  });

  // Arc sweep — slider ↔ number input (only visible when woodShape === 'arc')
  $('arcSweepSlider').addEventListener('input', (e) => {
    brush.woodArcSweep = parseInt(e.target.value, 10);
    $('arcSweepNum').value = brush.woodArcSweep;
    applyBrushToSelection();
  });
  $('arcSweepNum').addEventListener('change', (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v)) { e.target.value = brush.woodArcSweep != null ? brush.woodArcSweep : 140; return; }
    v = Math.max(30, Math.min(359, v));
    brush.woodArcSweep = v;
    $('arcSweepSlider').value = v;
    e.target.value = v;
    applyBrushToSelection();
  });

  // Wood thickness — slider ↔ number input
  $('woodThickSlider').addEventListener('input', (e) => {
    brush.woodThick = parseFloat(e.target.value);
    $('woodThickNum').value = brush.woodThick.toFixed(2);
    applyBrushToSelection();
  });
  $('woodThickNum').addEventListener('change', (e) => {
    let v = parseFloat(e.target.value);
    if (isNaN(v)) { e.target.value = (brush.woodThick || 0.22).toFixed(2); return; }
    v = Math.max(0.05, Math.min(1.0, v));
    brush.woodThick = v;
    $('woodThickSlider').value = v;
    e.target.value = v.toFixed(2);
    applyBrushToSelection();
  });
  // Flags
  $('ckLock').addEventListener('change', (e) => { brush.locked = e.target.checked; syncControls(); });
  $('ckKey').addEventListener('change', (e) => { brush.hasKey = e.target.checked; syncControls(); });
  $('ckMystery').addEventListener('change', (e) => { brush.mystery = e.target.checked; if (brush.mystery) brush.hasKey = false; syncControls(); });

  // ---- Grid controls --------------------------------------------------------
  function syncGridChips() {
    document.querySelectorAll('#gridPresets [data-gsize]').forEach((b) => {
      b.classList.toggle('on', Math.abs(parseFloat(b.dataset.gsize) - grid.size) < 0.001);
    });
  }
  function applyGridSize(v) {
    v = Math.max(0.05, Math.min(5, v));
    grid.size = v;
    $('gridSizeSlider').value = Math.min(2, v);   // slider capped at 2; num input is uncapped
    $('gridSizeNum').value = v.toFixed(2);
    syncGridChips();
    if (grid.show) draw();
  }

  $('ckGridLines').addEventListener('change', (e) => {
    grid.show = e.target.checked;
    draw();
  });
  $('ckSnap').addEventListener('change', (e) => {
    grid.snap = e.target.checked;
  });
  $('gridSizeSlider').addEventListener('input', (e) => {
    applyGridSize(parseFloat(e.target.value));
  });
  $('gridSizeNum').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v)) { e.target.value = grid.size.toFixed(2); return; }
    applyGridSize(v);
  });
  document.querySelectorAll('#gridPresets [data-gsize]').forEach((b) => {
    b.addEventListener('click', () => applyGridSize(parseFloat(b.dataset.gsize)));
  });

  // Position X / Y inputs — apply typed coordinates to the selected peg
  function applyPosInput(axis) {
    if (!sel) return;
    const rawX = parseFloat($('posX').value);
    const rawY = parseFloat($('posY').value);
    if (isNaN(rawX) || isNaN(rawY)) return;
    const c = clampForPlacement(rawX, rawY, sel);
    sel.x = c.x; sel.y = c.y;
    $('posX').value = c.x.toFixed(3);
    $('posY').value = c.y.toFixed(3);
    draw();
    updateDirtyState();
  }
  $('posX').addEventListener('change', () => applyPosInput('x'));
  $('posY').addEventListener('change', () => applyPosInput('y'));

  function normalizeBrush() {
    if (brush.type === 'wood' || brush.type === 'egg') { brush.hasKey = false; brush.mystery = false; }
    if (brush.type !== 'egg') { brush.locked = false; }
  }

  function syncControls() {
    normalizeBrush();
    const isWood    = brush.type === 'wood';
    const isCracker = brush.type === 'cracker';
    const isEgg     = brush.type === 'egg';

    // mode + type seg
    $('modeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('typeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.type === brush.type));

    // Cracker shape chips — visible only for cracker
    $('shapeGroup').style.display = isCracker ? '' : 'none';
    $('shapeChips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.variant === brush.variant));

    // Wood controls — visible only for wood
    $('woodShapeGroup').style.display = isWood ? '' : 'none';
    $('woodPropsGroup').style.display = isWood ? '' : 'none';
    if (isWood) {
      // Highlight the chip label the user explicitly selected (woodChip), not woodShape,
      // so "Box" and "Diamond" (a box+rotation preset) never conflict.
      $('woodShapeChips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.wshape === (brush.woodChip || brush.woodShape)));
      $('woodRotSlider').value = brush.woodRot;
      $('woodRotNum').value = (brush.woodRot || 0).toFixed(2);
      $('woodWSlider').value = brush.woodW;
      $('woodWNum').value = (brush.woodW || 1).toFixed(2);
      const isArc = brush.woodShape === 'arc';
      const hasThick = brush.woodShape === 'plank' || brush.woodShape === 'slab45' || brush.woodShape === 'slab_neg45';
      $('arcSweepRow').style.display   = isArc     ? '' : 'none';
      $('woodThickRow').style.display  = hasThick  ? '' : 'none';
      if (isArc) {
        const sv = brush.woodArcSweep != null ? brush.woodArcSweep : 140;
        $('arcSweepSlider').value = sv;
        $('arcSweepNum').value = sv;
      }
      if (hasThick) {
        const tv = brush.woodThick != null ? brush.woodThick : 0.22;
        $('woodThickSlider').value = tv;
        $('woodThickNum').value = tv.toFixed(2);
      }
    }

    // Position group — show whenever a peg is selected
    const posGroup = $('posGroup');
    if (posGroup) {
      posGroup.style.display = sel ? '' : 'none';
      if (sel) updatePosInputs();
    }

    // Colour + flags — hidden for wood
    $('colourGroup').style.display = isWood ? 'none' : '';
    $('flagsGroup').style.display  = isWood ? 'none' : '';
    if (!isWood) {
      swWrap.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.color === brush.color));
      $('ckLock').checked   = brush.locked;
      $('ckKey').checked    = brush.hasKey;
      $('ckMystery').checked = brush.mystery;
      $('flagLock').classList.toggle('dis', !isEgg);
      $('ckLock').disabled  = !isEgg;
      $('flagKey').classList.toggle('dis', isEgg || brush.mystery);
      $('ckKey').disabled   = isEgg || brush.mystery;
      $('flagMystery').classList.toggle('dis', isEgg);
      $('ckMystery').disabled = isEgg;
    }

    updateHud();
    updateReadout();
  }

  // ---- Readout / validation -------------------------------------------------
  function updateHud() {
    $('hudMode').textContent = (mode === 'place' ? 'PLACE MODE' : 'ASSIGN MODE');
    $('hudCount').textContent = pegs.length + (pegs.length === 1 ? ' peg' : ' pegs');
    $('hintBar').textContent = mode === 'place'
      ? 'Click inside the cavity to drop a peg · drag to move · right-click to delete'
      : 'Click a peg to select · edit its element on the left · right-click to delete';
  }

  function stats() {
    const byColor = {};
    let eggs = 0, crackers = 0, locks = 0, keys = 0, woods = 0;
    for (const p of pegs) {
      if (p.type === 'wood') { woods++; continue; }
      byColor[p.color] = byColor[p.color] || { eggs: 0, crackers: 0 };
      if (p.type === 'egg') { byColor[p.color].eggs++; eggs++; if (p.locked) locks++; }
      else { byColor[p.color].crackers++; crackers++; if (p.hasKey) keys++; }
    }
    return { byColor, eggs, crackers, locks, keys, woods };
  }

  function updateReadout() {
    const s = stats();
    const colors = Object.keys(s.byColor);
    if (!pegs.length) {
      $('readout').innerHTML = 'No pegs yet.';
      setValid('ok', 'Empty');
      return;
    }
    let html = `<b>${s.eggs}</b> eggs · <b>${s.crackers}</b> crackers`;
    if (s.woods) html += ` · <b>${s.woods}</b> obstacle${s.woods !== 1 ? 's' : ''}`;
    html += ` · <b>${colors.length}</b> colour${colors.length !== 1 ? 's' : ''}<br>`;
    html += colors.map((c) => `${c}: ${s.byColor[c].eggs}🥚 / ${s.byColor[c].crackers}🍩`).join('<br>');
    if (s.locks || s.keys) html += `<br>🔒 ${s.locks} locks · 🔑 ${s.keys} keys`;
    $('readout').innerHTML = html;

    // Solvability warnings (soft — the game auto-balances flock counts, but flag intent).
    const warns = [];
    for (const c of colors) {
      const b = s.byColor[c];
      if (b.eggs === 0 && b.crackers > 0) warns.push(`${c} has crackers but no egg to hatch a bird`);
      if (b.eggs > 0 && b.crackers < b.eggs * 2) warns.push(`${c}: need ${b.eggs * 2} crackers for ${b.eggs} birds (has ${b.crackers})`);
    }
    if (s.locks > 0 && s.keys === 0) warns.push('locked eggs but no key cracker to free them');
    if (warns.length) setValid('warn', '⚠ ' + warns[0]);
    else setValid('ok', '✓ Ready to play');
  }
  function setValid(kind, text) {
    const el = $('valid');
    el.className = 'valid ' + (kind === 'warn' ? 'warn' : 'ok');
    el.textContent = text;
  }

  // ---- Build a game level from the pegs -------------------------------------
  function buildLayout() {
    return pegs.map((p) => {
      if (p.type === 'wood') {
        const item = { type: 'wood', woodShape: p.woodShape || 'plank', woodRot: +(p.woodRot || 0).toFixed(3), woodW: +(p.woodW || 1).toFixed(3), woodX: +p.x.toFixed(3), woodY: +p.y.toFixed(3) };
        if ((p.woodShape || 'plank') === 'arc' && p.woodArcSweep != null) item.woodArcSweep = p.woodArcSweep;
        const sh = p.woodShape || 'plank';
        if (sh === 'plank' || sh === 'slab45' || sh === 'slab_neg45') item.woodThick = +(p.woodThick || 0.22).toFixed(3);
        return item;
      }
      const it = { type: p.type, color: p.color, x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
      if (p.type === 'cracker') it.variant = p.variant || 'ring';
      if (p.mystery) it.mystery = true;
      if (p.locked) it.locked = true;
      if (p.hasKey) it.hasKey = true;
      return it;
    });
  }
  function buildLevel() {
    const lv = currentLevelIdx !== null ? levels[currentLevelIdx] : null;
    const id = lv ? (lv.id ?? currentLevelIdx + 1) : 999;
    const name = lv ? lv.name : undefined;
    return { id, freeform: true, ...(name ? { name } : {}), layout: buildLayout() };
  }

  // ---- Load a layout array into the editor canvas ---------------------------
  function loadLayout(layout) {
    pegs.length = 0; sel = null;
    if (!Array.isArray(layout)) { syncControls(); draw(); return; }
    for (const it of layout) {
      if (!it) continue;
      if (it.type === 'wood') {
        // Wood uses woodX/woodY; fall back to x/y for editor-authored items
        const x = it.woodX != null ? +it.woodX : (it.x != null ? +it.x : 0);
        const y = it.woodY != null ? +it.woodY : (it.y != null ? +it.y : BOARD.anchorY);
        pegs.push({
          id: pegSeq++, type: 'wood',
          woodShape: it.woodShape || 'plank',
          woodRot: it.woodRot || 0,
          woodW: it.woodW || 1.0,
          woodThick: it.woodThick || 0.22,
          woodArcSweep: it.woodArcSweep != null ? it.woodArcSweep : 140,
          color: undefined, variant: undefined,
          locked: false, hasKey: false, mystery: false,
          x, y,
        });
        continue;
      }
      if (it.type !== 'egg' && it.type !== 'cracker') continue;
      const color = FOOD[it.color] != null ? it.color : FOOD_KEYS[0];
      const x = it.x != null ? +it.x : 0;
      const y = it.y != null ? +it.y : BOARD.anchorY;
      const c = clampToCavity(x, y, R[it.type] || R.egg);
      pegs.push({
        id: pegSeq++,
        type: it.type,
        color,
        variant: it.type === 'cracker' ? (it.variant || 'ring') : undefined,
        locked: it.type === 'egg' ? !!it.locked : false,
        hasKey: it.type === 'cracker' ? !!it.hasKey : false,
        mystery: it.type === 'cracker' ? !!it.mystery : false,
        x: c.x, y: c.y,
      });
    }
    syncControls();
    draw();
  }

  // ---- Level bank operations ------------------------------------------------
  function openLevel(idx) {
    if (idx < 0 || idx >= levels.length) return;
    // Warn about unsaved changes on the current level before switching
    if (currentLevelIdx !== null && isDirty()) {
      if (!confirm('You have unsaved changes on the current level. Discard and switch?')) return;
    }
    currentLevelIdx = idx;
    loadLayout(levels[idx].layout);
    savedPegsSnapshot = pegsSnapshot();
    _lastKnownDirty = false;
    renderLevelCards();
    // Auto-send to playtest
    if (gameReady) post({ type: 'flock-feast:playCustom', level: buildLevel() });
  }

  function saveCurrentLevel() {
    if (currentLevelIdx === null) return;
    levels[currentLevelIdx] = {
      ...levels[currentLevelIdx],
      layout: buildLayout(),
      savedAt: Date.now(),
    };
    savedPegsSnapshot = pegsSnapshot();
    _lastKnownDirty = false;
    saveLevelsToStorage();
    renderLevelCards();
  }

  function addNewLevel() {
    const name = `Level ${levels.length + 1}`;
    const layout = buildLayout();
    levels.push({ name, layout, savedAt: Date.now() });
    currentLevelIdx = levels.length - 1;
    savedPegsSnapshot = pegsSnapshot();
    _lastKnownDirty = false;
    saveLevelsToStorage();
    renderLevelCards();
  }

  function deleteLevel(idx) {
    const lvName = levels[idx].name || ('Level ' + (idx + 1));
    if (!confirm('Delete ' + lvName + '?')) return;
    levels.splice(idx, 1);
    if (currentLevelIdx === idx) {
      currentLevelIdx = null;
      savedPegsSnapshot = '';
    } else if (currentLevelIdx !== null && currentLevelIdx > idx) {
      currentLevelIdx--;
    }
    saveLevelsToStorage();
    renderLevelCards();
  }

  function moveLevel(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= levels.length) return;
    [levels[idx], levels[newIdx]] = [levels[newIdx], levels[idx]];
    if (currentLevelIdx === idx) currentLevelIdx = newIdx;
    else if (currentLevelIdx === newIdx) currentLevelIdx = idx;
    saveLevelsToStorage();
    renderLevelCards();
  }

  function exportAllLevels() {
    if (!levels.length) { setValid('warn', '⚠ No levels to export'); return; }
    const bundle = levels.map((lv, i) => ({ name: lv.name || `Level ${i + 1}`, layout: lv.layout || [] }));
    const data = JSON.stringify(bundle, null, 2);
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
      download: 'levels-bundle.json',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function bakeCurrentLevels() {
    if (!levels.length) { setValid('warn', '⚠ No levels to bake'); return; }
    const hasDefault = levels.some((lv) => lv.bakedId);
    const msg = hasDefault
      ? `Bake ${levels.length} level${levels.length !== 1 ? 's' : ''} as your permanent set?\n\nThis will replace the built-in default levels and persist across refreshes. A backup bundle will be downloaded.`
      : `Bake ${levels.length} level${levels.length !== 1 ? 's' : ''} as your permanent set?\n\nThese will persist across refreshes. A backup bundle will be downloaded.`;
    if (!confirm(msg)) return;

    // Download a backup bundle before making changes
    exportAllLevels();

    // Strip bakedId/bakedVer so the hardcoded levels are no longer treated as defaults
    levels = levels.map((lv) => {
      const { bakedId, bakedVer, gameId, ...rest } = lv;
      return { ...rest, savedAt: lv.savedAt || Date.now() };
    });

    // Set the override flag so mergeBakedLevels() never re-adds old defaults on reload
    try { localStorage.setItem(BAKED_OVERRIDE_KEY, '1'); } catch {}

    saveLevelsToStorage();
    renderLevelCards();
    setValid('ok', `✓ ${levels.length} level${levels.length !== 1 ? 's' : ''} baked — reload to confirm`);
  }

  function renameLevelInline(idx, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === levels[idx].name) return;
    levels[idx].name = trimmed;
    saveLevelsToStorage();
  }

  // ---- Level card rendering -------------------------------------------------
  function getLevelColorDots(layout) {
    const seen = new Set();
    if (Array.isArray(layout)) {
      layout.forEach((it) => { if (it && it.type !== 'wood' && it.color && FOOD[it.color]) seen.add(it.color); });
    }
    return [...seen];
  }

  function renderLevelCards() {
    const container = document.getElementById('levelsList');
    if (!container) return;
    container.innerHTML = '';

    if (levels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'levels-empty';
      empty.textContent = 'No levels yet — design something and click + Add Level';
      container.appendChild(empty);
      return;
    }

    levels.forEach((lv, idx) => {
      const isActive = idx === currentLevelIdx;
      const dirty = isActive && isDirty();
      const layout = lv.layout || [];
      const colors = getLevelColorDots(layout);
      const eggCount     = layout.filter((p) => p.type === 'egg').length;
      const crackerCount = layout.filter((p) => p.type === 'cracker').length;
      const woodCount    = layout.filter((p) => p.type === 'wood').length;

      const card = document.createElement('div');
      card.className = 'level-card' + (isActive ? ' active' : '') + (dirty ? ' dirty' : '');

      // Header row
      const header = document.createElement('div');
      header.className = 'lc-header';

      const num = document.createElement('span');
      num.className = 'lc-num';
      num.textContent = `Lv ${idx + 1}`;

      const name = document.createElement('span');
      name.className = 'lc-name';
      name.textContent = lv.name || `Level ${idx + 1}`;
      name.title = 'Double-click to rename';
      name.contentEditable = 'false';
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        name.contentEditable = 'true';
        name.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(name);
        const sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(range);
      });
      name.addEventListener('blur', () => {
        name.contentEditable = 'false';
        renameLevelInline(idx, name.textContent);
        name.textContent = levels[idx] ? levels[idx].name : name.textContent;
      });
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
        if (e.key === 'Escape') { name.textContent = lv.name || `Level ${idx + 1}`; name.blur(); }
      });
      // Stop card click while editing
      name.addEventListener('click', (e) => { if (name.contentEditable === 'true') e.stopPropagation(); });

      header.append(num, name);

      // Info row
      const info = document.createElement('div');
      info.className = 'lc-info';

      const pegInfo = document.createElement('span');
      pegInfo.textContent = `${layout.length} pegs`;

      const colorsWrap = document.createElement('span');
      colorsWrap.className = 'lc-colors';
      colors.forEach((c) => {
        const dot = document.createElement('span');
        dot.className = 'lc-dot';
        dot.style.background = hex(FOOD[c]);
        dot.title = c;
        colorsWrap.appendChild(dot);
      });

      const typeInfo = document.createElement('span');
      typeInfo.style.marginLeft = 'auto';
      typeInfo.style.fontSize = '10px';
      typeInfo.textContent = `${eggCount}🥚 ${crackerCount}🍩${woodCount ? ' ' + woodCount + '🪵' : ''}`;

      info.append(pegInfo, colorsWrap, typeInfo);

      // Actions row
      const actions = document.createElement('div');
      actions.className = 'lc-actions';

      const btnLoad = document.createElement('button');
      btnLoad.className = 'lca-btn';
      btnLoad.title = isActive ? 'Reload from saved' : 'Load level';
      btnLoad.textContent = isActive ? '↺' : '▶';
      btnLoad.addEventListener('click', (e) => { e.stopPropagation(); openLevel(idx); });

      const btnSave = document.createElement('button');
      btnSave.className = 'lca-btn lca-save' + (dirty ? ' has-changes' : '');
      btnSave.title = dirty ? 'Save unsaved changes' : 'Save level';
      btnSave.textContent = '💾';
      btnSave.disabled = !isActive;
      btnSave.addEventListener('click', (e) => { e.stopPropagation(); if (isActive) saveCurrentLevel(); });

      const btnUp = document.createElement('button');
      btnUp.className = 'lca-btn';
      btnUp.title = 'Move up';
      btnUp.textContent = '↑';
      btnUp.disabled = idx === 0;
      btnUp.addEventListener('click', (e) => { e.stopPropagation(); moveLevel(idx, -1); });

      const btnDown = document.createElement('button');
      btnDown.className = 'lca-btn';
      btnDown.title = 'Move down';
      btnDown.textContent = '↓';
      btnDown.disabled = idx === levels.length - 1;
      btnDown.addEventListener('click', (e) => { e.stopPropagation(); moveLevel(idx, 1); });

      const btnDel = document.createElement('button');
      btnDel.className = 'lca-btn lca-del';
      btnDel.title = 'Delete level';
      btnDel.textContent = '✕';
      btnDel.addEventListener('click', (e) => { e.stopPropagation(); deleteLevel(idx); });

      const btnExportCard = document.createElement('button');
      btnExportCard.className = 'lca-btn';
      btnExportCard.title = 'Export level as JSON';
      btnExportCard.textContent = '↧';
      btnExportCard.addEventListener('click', (e) => {
        e.stopPropagation();
        // Use live canvas when this level is active so unsaved edits are included
        const layout = currentLevelIdx === idx ? buildLayout() : lv.layout;
        const data = JSON.stringify({ id: idx + 1, freeform: true, name: lv.name, layout }, null, 2);
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
          download: (lv.name || `level-${idx + 1}`).replace(/\s+/g, '-').toLowerCase() + '.json',
        });
        a.click();
        URL.revokeObjectURL(a.href);
      });

      const btnImportCard = document.createElement('button');
      btnImportCard.className = 'lca-btn';
      btnImportCard.title = 'Import JSON into this level';
      btnImportCard.textContent = '↥';
      btnImportCard.addEventListener('click', (e) => {
        e.stopPropagation();
        const fi = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
        fi.addEventListener('change', async () => {
          const file = fi.files && fi.files[0];
          if (!file) return;
          try {
            const obj = JSON.parse(await file.text());
            const layout = Array.isArray(obj) ? obj : (obj && obj.layout);
            if (!Array.isArray(layout)) { setValid('warn', '⚠ No layout in file'); return; }
            levels[idx] = { ...levels[idx], layout, savedAt: Date.now() };
            saveLevelsToStorage();
            // If this card is active, reload into the canvas
            if (currentLevelIdx === idx) { loadLayout(layout); savedPegsSnapshot = pegsSnapshot(); _lastKnownDirty = false; }
            renderLevelCards();
          } catch { setValid('warn', '⚠ Could not read file'); }
        });
        fi.click();
      });

      actions.append(btnLoad, btnSave, btnUp, btnDown, btnExportCard, btnImportCard, btnDel);
      card.append(header, info, actions);

      // Click anywhere on card = load it
      card.addEventListener('click', () => { if (!isActive) openLevel(idx); });

      container.appendChild(card);
    });
  }

  // Lightweight dirty-state update — called after any peg modification
  // without rebuilding the whole card list.
  function updateDirtyState() {
    const dirty = isDirty();
    if (dirty === _lastKnownDirty) return;
    _lastKnownDirty = dirty;

    const container = document.getElementById('levelsList');
    if (!container || currentLevelIdx === null) return;
    const cards = container.querySelectorAll('.level-card');
    const card = cards[currentLevelIdx];
    if (!card) return;
    card.classList.toggle('dirty', dirty);
    const btnSave = card.querySelector('.lca-save');
    if (btnSave) {
      btnSave.classList.toggle('has-changes', dirty);
      btnSave.title = dirty ? 'Save unsaved changes' : 'Save level';
    }
    const btnLoad = card.querySelector('.lca-btn');
    if (btnLoad) btnLoad.textContent = dirty ? '↺' : (currentLevelIdx !== null ? '↺' : '▶');
  }

  // ---- Embedded game bridge (postMessage) -----------------------------------
  let gameReady = false;
  let pendingPlay = false;

  function post(msg) { try { game.contentWindow.postMessage(msg, '*'); } catch {} }

  window.addEventListener('message', (e) => {
    if (e.source !== game.contentWindow || !e.data) return;
    if (e.data.type === 'flock-feast:ready') {
      gameReady = true;
      frameStatus.classList.add('hide');
      if (pendingPlay) { pendingPlay = false; playInGame(); }
      // Request game levels if bank is empty OR any game level still lacks x/y positions
      const needsPositions = levels.length === 0 || levels.some(
        (lv) => lv.gameId && Array.isArray(lv.layout) && lv.layout.some((it) => it.x == null || it.y == null)
      );
      if (needsPositions) post({ type: 'flock-feast:requestLevels' });
    }
    if (e.data.type === 'flock-feast:levelsData') {
      if (!Array.isArray(e.data.levels) || !e.data.levels.length) return;
      if (levels.length === 0) {
        // Fresh seed — use game data directly
        levels = e.data.levels;
      } else {
        // Patch only game levels whose stored layout items are missing positions
        let changed = false;
        const patchedIndices = new Set();
        for (const gameLv of e.data.levels) {
          const idx = levels.findIndex((lv) => lv.gameId === gameLv.gameId);
          if (idx >= 0 && levels[idx].layout.some((it) => it.x == null || it.y == null)) {
            levels[idx] = { ...levels[idx], layout: gameLv.layout };
            patchedIndices.add(idx);
            changed = true;
          }
        }
        if (!changed) return;
        // If the currently-active level was patched, reload it into the canvas
        if (currentLevelIdx !== null && patchedIndices.has(currentLevelIdx)) {
          loadLayout(levels[currentLevelIdx].layout);
          savedPegsSnapshot = pegsSnapshot();
          _lastKnownDirty = false;
        }
      }
      saveLevelsToStorage();
      renderLevelCards();
    }
  });

  // Poll for readiness (in case the ready message fired before we attached).
  const pingIv = setInterval(() => { if (gameReady) { clearInterval(pingIv); return; } post({ type: 'flock-feast:ping' }); }, 400);

  // Drive frames — embedded game only renders when the parent sends ticks.
  let last = performance.now();
  function tick(now) {
    const dt = now - last; last = now;
    if (gameReady) post({ type: 'flock-feast:tick', dt });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function playInGame() {
    if (!pegs.length) { setValid('warn', '⚠ Place some pegs first'); return; }
    if (!gameReady) { pendingPlay = true; frameStatus.classList.remove('hide'); frameStatus.textContent = 'Starting…'; return; }
    post({ type: 'flock-feast:playCustom', level: buildLevel() });
  }

  // ---- Actions --------------------------------------------------------------
  $('btnPlay').addEventListener('click', playInGame);
  $('btnClear').addEventListener('click', () => {
    if (!pegs.length || confirm('Clear all pegs?')) {
      pegs.length = 0; sel = null; syncControls(); draw(); updateDirtyState();
    }
  });
  $('btnDelete').addEventListener('click', () => {
    if (sel) { removePeg(sel); draw(); updateDirtyState(); }
  });

  $('btnExport').addEventListener('click', () => {
    const level = buildLevel();
    const data = JSON.stringify(level, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const lv = currentLevelIdx !== null ? levels[currentLevelIdx] : null;
    a.download = (lv ? (lv.name || `level-${currentLevelIdx + 1}`) : 'flock-level').replace(/\s+/g, '-').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('btnImport').addEventListener('click', () => $('fileImport').click());
  $('fileImport').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const layout = Array.isArray(obj) ? obj : (obj && obj.layout);
      if (!Array.isArray(layout)) { setValid('warn', '⚠ No layout in file'); return; }
      loadLayout(layout);
      updateDirtyState();
    } catch (err) {
      setValid('warn', '⚠ Could not read file');
    }
    e.target.value = '';
  });

  // Level bank buttons
  $('btnAddLevel').addEventListener('click', () => addNewLevel());
  $('btnExportAll').addEventListener('click', () => exportAllLevels());
  $('btnBakeLevels').addEventListener('click', () => bakeCurrentLevels());

  // ---- Levels drag-and-drop import ------------------------------------------
  (function setupLevelsDropZone() {
    const dropEl = document.getElementById('levelsList');
    if (!dropEl) return;

    let dragCount = 0;

    dropEl.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      dragCount++;
      dropEl.classList.add('drag-over');
    });

    dropEl.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    dropEl.addEventListener('dragleave', () => {
      dragCount = Math.max(0, dragCount - 1);
      if (dragCount === 0) dropEl.classList.remove('drag-over');
    });

    dropEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCount = 0;
      dropEl.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.endsWith('.json') || f.type === 'application/json'
      );
      if (!files.length) {
        setValid('warn', '⚠ Drop .json files to import levels');
        return;
      }

      const incoming = [];
      let isBundleDrop = false; // true when at least one file is a multi-level bundle

      for (const file of files) {
        try {
          const obj = JSON.parse(await file.text());

          // Array of level objects each with a `layout` key — treat as a bundle
          if (Array.isArray(obj) && obj.length > 0 && obj[0] && Array.isArray(obj[0].layout)) {
            isBundleDrop = true;
            for (const levelData of obj) {
              const layout = Array.isArray(levelData.layout) ? levelData.layout : null;
              if (!layout) continue;
              const name = levelData.name || `Level ${incoming.length + 1}`;
              incoming.push({ name, layout, savedAt: Date.now() });
            }
          }
          // Single level object with a `layout` key
          else if (obj && Array.isArray(obj.layout)) {
            const baseName = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
            const name = obj.name || baseName || `Level ${incoming.length + 1}`;
            incoming.push({ name, layout: obj.layout, savedAt: Date.now() });
          }
          // Bare layout array (each item has a `type` field)
          else if (Array.isArray(obj) && obj.every((it) => it && it.type)) {
            const name = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ') || `Level ${incoming.length + 1}`;
            incoming.push({ name, layout: obj, savedAt: Date.now() });
          }
          else {
            setValid('warn', `⚠ ${file.name}: no valid layout found`);
          }
        } catch {
          setValid('warn', `⚠ Could not parse ${file.name}`);
        }
      }

      if (!incoming.length) return;

      // Sort by the leading number in the name (e.g. "Level 3" → 3).
      const levelNum = (name) => { const m = (name || '').match(/\d+/); return m ? parseInt(m[0], 10) : Infinity; };
      incoming.sort((a, b) => levelNum(a.name) - levelNum(b.name));

      // For a bundle drop offer Replace vs Append; single-file drops always append.
      let doReplace = false;
      if (isBundleDrop && levels.length > 0) {
        doReplace = confirm(
          `Replace all ${levels.length} existing level${levels.length !== 1 ? 's' : ''} with the ${incoming.length} imported level${incoming.length !== 1 ? 's' : ''}?\n\nOK = Replace   ·   Cancel = Append`
        );
      }

      if (doReplace) {
        levels = incoming;
        currentLevelIdx = null;
        savedPegsSnapshot = '';
        _lastKnownDirty = false;
        // Lock out mergeBakedLevels so the default levels don't come back on refresh
        try { localStorage.setItem(BAKED_OVERRIDE_KEY, '1'); } catch {}
      } else {
        levels.push(...incoming);
      }

      saveLevelsToStorage();
      renderLevelCards();
      const container = document.getElementById('levelsList');
      if (container) container.scrollTop = doReplace ? 0 : container.scrollHeight;
      setValid('ok', `✓ ${doReplace ? 'Replaced with' : 'Imported'} ${incoming.length} level${incoming.length !== 1 ? 's' : ''}`);
    });
  })();

  // ---- Boot -----------------------------------------------------------------
  // Show current world-Y in the HUD during pointer movement so authors know
  // where they are in the cavity even when scrolled far up.
  canvas.addEventListener('pointermove', (e) => {
    const { py } = localPoint(e);
    const wy = px2wy(py);
    const el = $('hudY');
    if (el) el.textContent = 'y ' + wy.toFixed(1);
  });
  canvas.addEventListener('pointerleave', () => { const el = $('hudY'); if (el) el.textContent = ''; });

  window.addEventListener('resize', () => layoutCanvas(true));
  new ResizeObserver(() => layoutCanvas(true)).observe(stage);

  // Load saved levels, merge baked ones, then render cards
  loadLevelsFromStorage();
  mergeBakedLevels();
  renderLevelCards();

  syncControls();
  layoutCanvas(false);
})();
