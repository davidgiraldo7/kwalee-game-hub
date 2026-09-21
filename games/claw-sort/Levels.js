/* The Claw — campaign order + shared helpers.
   Level definitions live in LevelsPool.js (CLAW_LEVEL_POOL).
   This file holds CLAW_MECHANICS, the campaign order (pack.order),
   resolves window.CLAW_LEVELS for the game, and CLAW_PIT helpers.
   Edited by LevelEditor/index.html.

   Ball/tray hex colours are LEVEL_CFG.palette in index.html — pack palette is editor-only.
   Tray grid: trays[row][col] colour index. Row 0 = active (front). Higher rows = stacked behind.

   Mechanic IDs (window.CLAW_MECHANICS) are stable client ids for tutorials / FTUEs.
   `flag` is the ball-record field the FTUE coach uses to find a target.
   Copy for a first-seen spotlight lives in translations.js as ftueCopy_<field> (en + pl).
   Level.mechanics[field] is the per-level count (0 = off). */

window.CLAW_MECHANICS = {
  ROTTEN_FRUIT: {
    id: "rottenFruit",
    clientId: "claw.mechanic.rottenFruit",
    field: "rottenFruit",
    flag: "rotten",
    max: 20
  },
  MYSTERY_BALL: {
    id: "mysteryBall",
    clientId: "claw.mechanic.mysteryBall",
    field: "mysteryBall",
    flag: "mystery",
    max: 20
  },
  BOMB: {
    id: "bomb",
    clientId: "claw.mechanic.bomb",
    field: "bomb",
    flag: "bomb",
    max: 20
  },
  BREAKABLE_BOX: {
    id: "breakableBox",
    clientId: "claw.mechanic.breakableBox",
    field: "breakableBox",
    flag: "crate",
    max: 20,
    hold: 3
  }
};


window.CLAW_LEVEL_PACK = /*CLAW_LEVELS*/{
  "version": 1,
  "updatedAt": "2026-08-27T10:16:22.776Z",
  "ballsPerTray": 3,
  "loopTail": 20,
  "palette": [
    {
      "hex": "#FF7396",
      "name": "Pink"
    },
    {
      "hex": "#FFD23F",
      "name": "Yellow"
    },
    {
      "hex": "#6B8AFF",
      "name": "Blue"
    },
    {
      "hex": "#5FD1A0",
      "name": "Mint"
    },
    {
      "hex": "#FF9F5A",
      "name": "Orange"
    },
    {
      "hex": "#B98CFF",
      "name": "Purple"
    },
    {
      "hex": "#3FC7D4",
      "name": "Teal"
    },
    {
      "hex": "#A0E548",
      "name": "Lime"
    }
  ],
  "order": [
    "easy_level",
    "level_2",
    "level_2_copy",
    "level_3_copy",
    "level_5_copy_2",
    "level_6_copy",
    "level_4_copy",
    "level_7_copy",
    "level_14",
    "level_5_copy",
    "level_8_copy",
    "level_9_copy",
    "level_12_copy",
    "level_17",
    "level_12",
    "level_15",
    "level_16",
    "level_17_copy",
    "cursor_med_1",
    "cursor_med_2",
    "cursor_hard_1",
    "cursor_med_3",
    "cursor_hard_2",
    "cursor_hard_3",
    "cursor_vhard_1",
    "cursor_hard_4",
    "cursor_vhard_2",
    "cursor_vhard_3",
    "cursor_med_4",
    "cursor_hard_5",
    "cursor_vhard_4",
    "cursor_vhard_5",
    "cursor_med_5",
    "cursor_vhard_6",
    "cursor_vhard_8",
    "cursor_vhard_9",
    "cursor_vhard_10",
    "cursor_vhard_7"
  ]
}/*END_CLAW_LEVELS*/;

(function (root) {
  var pack = root.CLAW_LEVEL_PACK || {};
  var pool = root.CLAW_LEVEL_POOL || {};
  var order = pack.order || [];
  var levels = [];
  var i, id, lv, copy;
  var loopTail = Math.max(0, pack.loopTail | 0);

  /** Map 1-based progress level → campaign index.
   *  After the ordered list ends, replay the last `loopTail` entries forever.
   *  `loopTail` 0 (or >= length) clamps to the final level / full-list wrap. */
  function indexFor(levelNum, count, tail) {
    var n = Math.max(1, count | 0);
    var lv = Math.max(1, levelNum | 0);
    var loop = Math.max(0, tail | 0);
    if (lv <= n) return lv - 1;
    if (loop <= 0) return n - 1;
    loop = Math.min(loop, n);
    return (n - loop) + ((lv - n - 1) % loop);
  }

  for (i = 0; i < order.length; i++) {
    id = order[i];
    lv = pool[id];
    if (!lv) {
      console.warn("[The Claw] Missing pool level:", id);
      continue;
    }
    copy = JSON.parse(JSON.stringify(lv));
    if (!copy.id) copy.id = id;
    if (root.CLAW_DIFFICULTY) root.CLAW_DIFFICULTY.tag(copy, pack.ballsPerTray || 3);
    levels.push(copy);
  }
  root.CLAW_LEVELS = {
    version: pack.version || 1,
    updatedAt: pack.updatedAt || new Date().toISOString(),
    ballsPerTray: pack.ballsPerTray || 3,
    loopTail: loopTail,
    palette: pack.palette || [],
    order: order.slice(),
    levels: levels,
    indexFor: function (levelNum) {
      return indexFor(levelNum, levels.length, loopTail);
    }
  };
  root.CLAW_LEVEL_ORDER = order.slice();
  root.CLAW_LEVEL_INDEX_FOR = indexFor;
})(window);


(function (root) {
  var MECHANICS = root.CLAW_MECHANICS || {};
  var MYSTERY_SALT = 0x4D595354; // 'MYST' — separate stream from pit mix
  var SPECIAL_SALT = 0x53504543; // 'SPEC' — spread specials through the pit
  var CI_ROTTEN = -1;
  var CI_BOMB = -2;
  var CI_CRATE = -4;
  var CRATE_HOLD = (MECHANICS.BREAKABLE_BOX && MECHANICS.BREAKABLE_BOX.hold) || 3;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function mechanicDef(idOrDef) {
    if (!idOrDef) return null;
    if (typeof idOrDef === "object") return idOrDef;
    var key;
    for (key in MECHANICS) {
      if (!Object.prototype.hasOwnProperty.call(MECHANICS, key)) continue;
      var def = MECHANICS[key];
      if (def.id === idOrDef || def.clientId === idOrDef || def.field === idOrDef) return def;
    }
    return null;
  }

  function normalizeMechanics(level) {
    var src = (level && level.mechanics) || {};
    var out = {};
    var key, def, val;
    for (key in MECHANICS) {
      if (!Object.prototype.hasOwnProperty.call(MECHANICS, key)) continue;
      def = MECHANICS[key];
      val = src[def.field];
      if (typeof val !== "number") {
        if (def.field === "rottenFruit" && level && typeof level.rotten === "number") val = level.rotten;
        else val = 0;
      }
      out[def.field] = Math.max(0, val | 0);
    }
    return out;
  }

  function mechanicCount(level, idOrDef) {
    var def = mechanicDef(idOrDef);
    if (!def) return 0;
    var m = normalizeMechanics(level);
    return m[def.field] || 0;
  }

  function levelHasMechanic(level, idOrDef) {
    return mechanicCount(level, idOrDef) > 0;
  }

  function activeMechanics(level) {
    var m = normalizeMechanics(level);
    var list = [];
    var key, def, count;
    for (key in MECHANICS) {
      if (!Object.prototype.hasOwnProperty.call(MECHANICS, key)) continue;
      def = MECHANICS[key];
      count = m[def.field] || 0;
      if (count > 0) {
        list.push({
          id: def.id,
          clientId: def.clientId,
          field: def.field,
          count: count
        });
      }
    }
    return list;
  }

  function rottenCount(level) {
    return mechanicCount(level, MECHANICS.ROTTEN_FRUIT || "rottenFruit");
  }

  function mysteryCount(level) {
    return mechanicCount(level, MECHANICS.MYSTERY_BALL || "mysteryBall");
  }

  function bombCount(level) {
    return mechanicCount(level, MECHANICS.BOMB || "bomb");
  }

  function breakableBoxCount(level) {
    return mechanicCount(level, MECHANICS.BREAKABLE_BOX || "breakableBox");
  }

  function trayGrid(level) {
    if (level && Array.isArray(level.trays) && level.trays.length) {
      return level.trays;
    }
    var cols = (level && level.cols) || 2;
    var rows = (level && level.rows) || 1;
    var nColors = (level && level.colors) || cols;
    var trays = [];
    var i = 0;
    var r, c, row;
    for (r = 0; r < rows; r++) {
      row = [];
      for (c = 0; c < cols; c++) row.push((i++) % nColors);
      trays.push(row);
    }
    return trays;
  }

  function countTrays(level) {
    var trays = trayGrid(level);
    var n = 0;
    var r, c, row, ci;
    for (r = 0; r < trays.length; r++) {
      row = trays[r] || [];
      for (c = 0; c < row.length; c++) {
        ci = row[c];
        if (ci != null && ci >= 0) n++;
      }
    }
    return n;
  }

  function insertItemsEvenly(list, items) {
    if (!items || !items.length) return list.slice();
    if (!list.length) return items.slice();
    var spaced = [];
    var step = list.length / items.length;
    var nextAt = step / 2;
    var oi = 0;
    var ri, target;
    for (ri = 0; ri < items.length; ri++) {
      target = Math.round(nextAt);
      while (oi < target && oi < list.length) spaced.push(list[oi++]);
      spaced.push(items[ri]);
      nextAt += step;
    }
    while (oi < list.length) spaced.push(list[oi++]);
    return spaced;
  }

  function insertEvenly(list, item, count) {
    if (count <= 0) return list.slice();
    var items = [];
    var k;
    for (k = 0; k < count; k++) items.push(item);
    return insertItemsEvenly(list, items);
  }

  /**
   * Fold `count` glass crates out of existing coloured balls.
   * Each crate removes `hold` coloured balls (default 3) and stores them
   * as cargo. Rotten / bombs / other crates are left alone.
   */
  function wrapBreakableBoxes(balls, count, hold) {
    hold = hold || CRATE_HOLD;
    count = count | 0;
    if (count <= 0 || !balls || !balls.length) return balls ? balls.slice() : [];
    var colored = [];
    var rest = [];
    var i, spec;
    for (i = 0; i < balls.length; i++) {
      spec = balls[i];
      if (spec && spec.ci >= 0 && !spec.bomb && !spec.rotten && !spec.crate) {
        colored.push(spec);
      } else {
        rest.push(spec);
      }
    }
    count = Math.min(count, Math.floor(colored.length / hold));
    if (count <= 0) return balls.slice();

    var crates = [];
    var c, k, pick, cargo;
    var boxId = (MECHANICS.BREAKABLE_BOX && MECHANICS.BREAKABLE_BOX.id) || "breakableBox";
    var boxClient = (MECHANICS.BREAKABLE_BOX && MECHANICS.BREAKABLE_BOX.clientId) || "claw.mechanic.breakableBox";
    for (c = 0; c < count; c++) {
      cargo = [];
      for (k = 0; k < hold; k++) {
        pick = Math.round((k + 0.5) * colored.length / hold - 0.5);
        pick = Math.max(0, Math.min(colored.length - 1, pick));
        cargo.push(colored.splice(pick, 1)[0]);
      }
      crates.push({
        ci: CI_CRATE,
        mystery: false,
        bomb: false,
        rotten: false,
        crate: true,
        cargo: cargo.map(function (b) { return { ci: b.ci }; }),
        mechanicId: boxId,
        mechanicClientId: boxClient
      });
    }
    return insertItemsEvenly(colored.concat(rest), crates);
  }

  function markMystery(balls, level) {
    var count = mysteryCount(level);
    if (count <= 0 || !balls.length) return balls;
    var candidates = [];
    var i, pick, idx, phase, used, guard;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].ci >= 0 && !balls[i].crate) candidates.push(i);
    }
    if (!candidates.length) return balls;
    count = Math.min(count, candidates.length);
    var rng = mulberry32(((level && level.pitSeed) || 1) ^ MYSTERY_SALT);
    // Spread evenly across the pit list (editor + gameplay share this order).
    // Seeded phase rotates the pattern so levels still differ.
    phase = Math.floor(rng() * candidates.length);
    used = {};
    var mysteryId = (MECHANICS.MYSTERY_BALL && MECHANICS.MYSTERY_BALL.id) || "mysteryBall";
    var mysteryClient = (MECHANICS.MYSTERY_BALL && MECHANICS.MYSTERY_BALL.clientId) || "claw.mechanic.mysteryBall";
    for (i = 0; i < count; i++) {
      if (count === 1) idx = Math.floor(rng() * candidates.length);
      else idx = Math.round((i + 0.5) * candidates.length / count - 0.5);
      idx = ((idx + phase) % candidates.length + candidates.length) % candidates.length;
      guard = 0;
      while (used[idx] && guard < candidates.length) {
        idx = (idx + 1) % candidates.length;
        guard++;
      }
      used[idx] = true;
      pick = balls[candidates[idx]];
      pick.mystery = true;
      pick.mechanicId = mysteryId;
      pick.mechanicClientId = mysteryClient;
    }
    return balls;
  }

  /**
   * Build the pit spawn list.
   * Index 0 is buried at the bottom of the pit; the last index sits on top
   * and is grabbed first.
   *
   * Each entry: { ci, mystery, bomb, crate, cargo?, mechanicId?, mechanicClientId? }
   * ci >= 0 is a palette colour; ci === -1 rotten; ci === -2 bomb;
   * ci === -4 glass crate.
   *
   * Mystery wraps existing coloured balls (not extras, not rotten, not bombs).
   * Glass crates swallow 3 coloured balls into cargo (not extras).
   * Which balls are mystery — and therefore which colour they reveal as — is
   * derived from pitSeed so every player sees the same result. Mysteries are
   * spaced evenly through the final pit list (not clumped via the specials shuffle).
   *
   * randomness 0 = furthest-back trays first, active trays last (on top).
   * randomness 1 = fully shuffled. In between, colours from other trays
   * are thrown in now and then.
   */
  function buildPitBalls(level, ballsPerTray) {
    ballsPerTray = ballsPerTray || 3;
    var trays = trayGrid(level);
    var ordered = [];
    var r, c, b, row, ci;
    for (r = trays.length - 1; r >= 0; r--) {
      row = trays[r] || [];
      for (c = 0; c < row.length; c++) {
        ci = row[c];
        if (ci == null || ci < 0) continue;
        for (b = 0; b < ballsPerTray; b++) ordered.push(ci);
      }
    }
    ordered = insertEvenly(ordered, CI_ROTTEN, rottenCount(level));
    ordered = insertEvenly(ordered, CI_BOMB, bombCount(level));

    var n = ordered.length;
    var rng = mulberry32((level && level.pitSeed) || 1);
    var mix = clamp(Number(level && level.pitRandomness) || 0, 0, 1);
    var i, j, tmp;
    if (n >= 2) {
      for (i = n - 1; i > 0; i--) {
        if (rng() < mix) {
          j = Math.floor(rng() * (i + 1));
          tmp = ordered[i];
          ordered[i] = ordered[j];
          ordered[j] = tmp;
        }
      }
    }

    var balls = [];
    for (i = 0; i < ordered.length; i++) {
      balls.push({
        ci: ordered[i],
        mystery: false,
        bomb: ordered[i] === CI_BOMB,
        rotten: ordered[i] === CI_ROTTEN,
        crate: false
      });
    }
    balls = wrapBreakableBoxes(balls, breakableBoxCount(level));
    var specials = [];
    var normals = [];
    for (i = 0; i < balls.length; i++) {
      // Place bombs / rotten / crates first, then mark mystery on the final
      // list so evenly-spaced picks aren't collapsed when specials re-insert.
      if (balls[i].rotten || balls[i].bomb || balls[i].crate || balls[i].ci < 0) {
        specials.push(balls[i]);
      } else {
        normals.push(balls[i]);
      }
    }
    if (specials.length > 1) {
      rng = mulberry32(((level && level.pitSeed) || 1) ^ SPECIAL_SALT);
      for (i = specials.length - 1; i > 0; i--) {
        j = Math.floor(rng() * (i + 1));
        tmp = specials[i];
        specials[i] = specials[j];
        specials[j] = tmp;
      }
    }
    balls = insertItemsEvenly(normals, specials);
    return markMystery(balls, level);
  }

  function buildPitOrder(level, ballsPerTray) {
    var balls = buildPitBalls(level, ballsPerTray);
    var order = [];
    var i;
    for (i = 0; i < balls.length; i++) order.push(balls[i].ci);
    return order;
  }

  root.CLAW_PIT = {
    CI_ROTTEN: CI_ROTTEN,
    CI_BOMB: CI_BOMB,
    CI_CRATE: CI_CRATE,
    trayGrid: trayGrid,
    countTrays: countTrays,
    rottenCount: rottenCount,
    mysteryCount: mysteryCount,
    bombCount: bombCount,
    breakableBoxCount: breakableBoxCount,
    mechanicCount: mechanicCount,
    mechanicDef: mechanicDef,
    levelHasMechanic: levelHasMechanic,
    activeMechanics: activeMechanics,
    normalizeMechanics: normalizeMechanics,
    wrapBreakableBoxes: wrapBreakableBoxes,
    markMystery: markMystery,
    buildPitOrder: buildPitOrder,
    buildPitBalls: buildPitBalls,
    mulberry32: mulberry32
  };
})(window);
