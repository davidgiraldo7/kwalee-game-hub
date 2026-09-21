/* The Claw — level catalogue (pool).
   Full level definitions keyed by stable id.
   Campaign order lives in Levels.js (CLAW_LEVEL_ORDER / pack.order).
   Auto-tags difficulty via CLAW_DIFFICULTY whenever the pool loads. */

window.CLAW_DIFFICULTY = (function () {
  var BELT_CAPACITY = 14;
  // Bands tuned for the column-aware scorer (narrow boards weigh heavier than wide ones).
  var BANDS = [
    { id: "easy", label: "Easy", max: 24 },
    { id: "medium", label: "Medium", max: 42 },
    { id: "hard", label: "Hard", max: 58 },
    { id: "veryHard", label: "Very Hard", max: Infinity }
  ];

  function score(level, ballsPerTray) {
    ballsPerTray = ballsPerTray || 3;
    var trays = (level && level.trays) || [];
    var trayCount = 0;
    var colors = {};
    var uniqueColors = 0;
    var r, c, row, ci;
    for (r = 0; r < trays.length; r++) {
      row = trays[r] || [];
      for (c = 0; c < row.length; c++) {
        ci = row[c];
        if (ci == null || ci < 0) continue;
        trayCount++;
        if (!colors[ci]) { colors[ci] = true; uniqueColors++; }
      }
    }
    var cols = level && level.cols != null ? level.cols : (trays[0] ? trays[0].length : 0);
    var rows = level && level.rows != null ? level.rows : trays.length;
    var m = (level && level.mechanics) || {};
    var rotten = m.rottenFruit || 0;
    var mystery = m.mysteryBall || 0;
    var bomb = m.bomb || 0;
    var box = m.breakableBox || 0;
    var goodBalls = trayCount * ballsPerTray;
    var wrapped = Math.min(box * 3, goodBalls);
    var pitEntities = goodBalls - wrapped + box + rotten + bomb;
    var mix = Number(level && level.pitRandomness) || 0;
    // Size: depth + load per column (not raw width — more cols alone must not look "harder").
    var size = rows * 1.35 + (trayCount / Math.max(cols, 1)) * 0.55 + goodBalls * 0.03;
    // Fewer active columns = fewer dump targets = harder. 4-wide is the softest layout.
    var colPressure = Math.max(0, 5 - cols) * 3.4;
    var layout = colPressure + Math.max(0, rows - 2) * 0.55;
    var palette = uniqueColors * 0.65;
    var clutter = rotten * 1.4 + bomb * 1.6 + box * 1.0 + mystery * 0.35;
    var chaos = mix * 9;
    var beltPressure = Math.max(0, pitEntities - BELT_CAPACITY) * 0.3;
    return size + layout + palette + clutter + chaos + beltPressure;
  }

  function bandFor(raw) {
    var i, b;
    for (i = 0; i < BANDS.length; i++) {
      b = BANDS[i];
      if (raw < b.max || b.max === Infinity) return b;
    }
    return BANDS[BANDS.length - 1];
  }

  function tag(level, ballsPerTray) {
    if (!level || typeof level !== "object") return level;
    var raw = score(level, ballsPerTray);
    var band = bandFor(raw);
    level.difficultyScore = Math.round(raw * 10) / 10;
    level.difficulty = band.id;
    level.difficultyLabel = band.label;
    return level;
  }

  function tagAll(pool, ballsPerTray) {
    var id;
    if (!pool || typeof pool !== "object") return pool;
    for (id in pool) {
      if (Object.prototype.hasOwnProperty.call(pool, id)) tag(pool[id], ballsPerTray);
    }
    return pool;
  }

  return {
    BELT_CAPACITY: BELT_CAPACITY,
    BANDS: BANDS,
    score: score,
    bandFor: bandFor,
    tag: tag,
    tagAll: tagAll
  };
})();

window.CLAW_LEVEL_POOL = /*CLAW_LEVEL_POOL*/{
  "easy_level": {
    "id": "easy_level",
    "name": "Easy Level",
    "cols": 3,
    "rows": 1,
    "trays": [
      [
        0,
        1,
        0
      ]
    ],
    "pitRandomness": 0.76,
    "pitSeed": 1,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "easy",
    "difficultyLabel": "Easy",
    "difficultyScore": 17.1
  },
  "level_2": {
    "id": "level_2",
    "name": "Level 2",
    "cols": 3,
    "rows": 2,
    "trays": [
      [
        0,
        6,
        3
      ],
      [
        2,
        1,
        7
      ]
    ],
    "pitRandomness": 0.59,
    "pitSeed": 2,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "easy",
    "difficultyLabel": "Easy",
    "difficultyScore": 21.6
  },
  "level_2_copy": {
    "id": "level_2_copy",
    "name": "Level 3",
    "cols": 3,
    "rows": 3,
    "trays": [
      [
        0,
        1,
        4
      ],
      [
        5,
        6,
        2
      ],
      [
        7,
        3,
        5
      ]
    ],
    "pitRandomness": 0.59,
    "pitSeed": 2,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 28.3
  },
  "level_3_copy": {
    "id": "level_3_copy",
    "name": "Level 4",
    "cols": 2,
    "rows": 4,
    "trays": [
      [
        3,
        2
      ],
      [
        0,
        1
      ],
      [
        7,
        5
      ],
      [
        4,
        6
      ]
    ],
    "pitRandomness": 0.59,
    "pitSeed": 3,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 33.1
  },
  "level_4_copy": {
    "id": "level_4_copy",
    "name": "Level 5",
    "cols": 2,
    "rows": 6,
    "trays": [
      [
        6,
        5
      ],
      [
        2,
        7
      ],
      [
        4,
        0
      ],
      [
        1,
        3
      ],
      [
        3,
        6
      ],
      [
        1,
        4
      ]
    ],
    "pitRandomness": 0.08,
    "pitSeed": 26,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 37.4
  },
  "level_5_copy": {
    "id": "level_5_copy",
    "name": "Level 5",
    "cols": 4,
    "rows": 5,
    "trays": [
      [
        3,
        2,
        2,
        3
      ],
      [
        0,
        1,
        3,
        4
      ],
      [
        7,
        5,
        4,
        5
      ],
      [
        4,
        6,
        5,
        6
      ],
      [
        4,
        5,
        6,
        7
      ]
    ],
    "pitRandomness": 0.59,
    "pitSeed": 3,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 40.7
  },
  "level_5_copy_2": {
    "id": "level_5_copy_2",
    "name": "Rotten Fruit Intro",
    "cols": 3,
    "rows": 4,
    "trays": [
      [
        1,
        7,
        5
      ],
      [
        3,
        6,
        2
      ],
      [
        4,
        0,
        4
      ],
      [
        5,
        6,
        0
      ]
    ],
    "pitRandomness": 0.61,
    "pitSeed": 6,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 39
  },
  "level_6_copy": {
    "id": "level_6_copy",
    "name": "Level 7",
    "cols": 4,
    "rows": 5,
    "trays": [
      [
        1,
        7,
        5,
        3
      ],
      [
        3,
        6,
        2,
        4
      ],
      [
        4,
        0,
        4,
        5
      ],
      [
        5,
        6,
        0,
        6
      ],
      [
        4,
        5,
        6,
        7
      ]
    ],
    "pitRandomness": 0.51,
    "pitSeed": 8,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 45
  },
  "level_7_copy": {
    "id": "level_7_copy",
    "name": "Level 8",
    "cols": 3,
    "rows": 6,
    "trays": [
      [
        1,
        7,
        5
      ],
      [
        3,
        6,
        2
      ],
      [
        4,
        0,
        4
      ],
      [
        5,
        6,
        0
      ],
      [
        4,
        5,
        6
      ],
      [
        5,
        6,
        7
      ]
    ],
    "pitRandomness": 0.51,
    "pitSeed": 8,
    "mechanics": {
      "rottenFruit": 6,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 54
  },
  "level_8_copy": {
    "id": "level_8_copy",
    "name": "Mystery Balls Intro",
    "cols": 2,
    "rows": 6,
    "trays": [
      [
        6,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        5
      ],
      [
        5,
        6
      ]
    ],
    "pitRandomness": 0.53,
    "pitSeed": 18,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 9,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 40.7
  },
  "level_9_copy": {
    "id": "level_9_copy",
    "name": "Level 10",
    "cols": 3,
    "rows": 6,
    "trays": [
      [
        1,
        7,
        2
      ],
      [
        3,
        6,
        3
      ],
      [
        4,
        0,
        4
      ],
      [
        5,
        6,
        5
      ],
      [
        4,
        5,
        6
      ],
      [
        5,
        6,
        7
      ]
    ],
    "pitRandomness": 0.51,
    "pitSeed": 8,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 8,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 46.6
  },
  "level_12": {
    "id": "level_12",
    "name": "Level 12",
    "cols": 4,
    "rows": 5,
    "trays": [
      [
        0,
        1,
        2,
        3
      ],
      [
        1,
        2,
        3,
        4
      ],
      [
        2,
        3,
        4,
        5
      ],
      [
        3,
        4,
        5,
        6
      ],
      [
        4,
        5,
        6,
        7
      ]
    ],
    "pitRandomness": 0.47,
    "pitSeed": 2,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 39.6
  },
  "level_12_copy": {
    "id": "level_12_copy",
    "name": "Bomb Intro",
    "cols": 3,
    "rows": 7,
    "trays": [
      [
        7,
        5,
        2
      ],
      [
        5,
        2,
        3
      ],
      [
        2,
        3,
        4
      ],
      [
        3,
        4,
        5
      ],
      [
        4,
        5,
        6
      ],
      [
        5,
        6,
        7
      ],
      [
        6,
        7,
        0
      ]
    ],
    "pitRandomness": 0.13,
    "pitSeed": 4,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 0,
      "bomb": 3,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 56
  },
  "level_14": {
    "id": "level_14",
    "name": "Glass Box Intro",
    "cols": 4,
    "rows": 2,
    "trays": [
      [
        0,
        1,
        2,
        3
      ],
      [
        1,
        2,
        3,
        4
      ]
    ],
    "pitRandomness": 0.7,
    "pitSeed": 4,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 3
    },
    "difficulty": "easy",
    "difficultyLabel": "Easy",
    "difficultyScore": 21.7
  },
  "level_15": {
    "id": "level_15",
    "name": "Level 15",
    "cols": 2,
    "rows": 10,
    "trays": [
      [
        0,
        1
      ],
      [
        1,
        2
      ],
      [
        2,
        3
      ],
      [
        3,
        4
      ],
      [
        4,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        7
      ],
      [
        7,
        0
      ],
      [
        0,
        1
      ],
      [
        1,
        2
      ]
    ],
    "pitRandomness": 0,
    "pitSeed": 1,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 2,
      "bomb": 2,
      "breakableBox": 0
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 64
  },
  "level_16": {
    "id": "level_16",
    "name": "Level 16",
    "cols": 3,
    "rows": 6,
    "trays": [
      [
        3,
        4,
        5
      ],
      [
        2,
        1,
        0
      ],
      [
        6,
        7,
        3
      ],
      [
        7,
        4,
        1
      ],
      [
        0,
        2,
        5
      ],
      [
        6,
        7,
        3
      ]
    ],
    "pitRandomness": 0,
    "pitSeed": 1,
    "mechanics": {
      "rottenFruit": 2,
      "mysteryBall": 2,
      "bomb": 0,
      "breakableBox": 1
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 43.7
  },
  "level_17": {
    "id": "level_17",
    "name": "Level 17",
    "cols": 4,
    "rows": 6,
    "trays": [
      [
        0,
        1,
        2,
        3
      ],
      [
        1,
        2,
        3,
        4
      ],
      [
        2,
        3,
        4,
        5
      ],
      [
        3,
        4,
        5,
        6
      ],
      [
        4,
        5,
        6,
        7
      ],
      [
        5,
        6,
        7,
        0
      ]
    ],
    "pitRandomness": 0.37,
    "pitSeed": 2,
    "mechanics": {
      "rottenFruit": 4,
      "mysteryBall": 2,
      "bomb": 2,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 56.4
  },
  "level_17_copy": {
    "id": "level_17_copy",
    "name": "Level 18",
    "cols": 3,
    "rows": 8,
    "trays": [
      [
        7,
        5,
        0
      ],
      [
        3,
        1,
        4
      ],
      [
        3,
        5,
        7
      ],
      [
        4,
        6,
        0
      ],
      [
        5,
        2,
        1
      ],
      [
        0,
        3,
        4
      ],
      [
        6,
        7,
        0
      ],
      [
        7,
        0,
        1
      ]
    ],
    "pitRandomness": 0.37,
    "pitSeed": 2,
    "mechanics": {
      "rottenFruit": 4,
      "mysteryBall": 0,
      "bomb": 2,
      "breakableBox": 2
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 64.8
  },
  "cursor_med_1": {
    "id": "cursor_med_1",
    "name": "Cursor_Med_1",
    "cols": 3,
    "rows": 3,
    "trays": [
      [
        0,
        0,
        0
      ],
      [
        1,
        2,
        3
      ],
      [
        2,
        2,
        0
      ]
    ],
    "pitRandomness": 0.32,
    "pitSeed": 4200,
    "mechanics": {
      "rottenFruit": 1,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 24.9
  },
  "cursor_med_2": {
    "id": "cursor_med_2",
    "name": "Cursor_Med_2",
    "cols": 3,
    "rows": 4,
    "trays": [
      [
        0,
        3,
        2
      ],
      [
        3,
        4,
        0
      ],
      [
        1,
        0,
        3
      ],
      [
        4,
        0,
        1
      ]
    ],
    "pitRandomness": 0.48,
    "pitSeed": 4297,
    "mechanics": {
      "rottenFruit": 2,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 34.2
  },
  "cursor_hard_1": {
    "id": "cursor_hard_1",
    "name": "Cursor_Hard_1",
    "cols": 3,
    "rows": 5,
    "trays": [
      [
        5,
        4,
        2
      ],
      [
        3,
        4,
        5
      ],
      [
        0,
        1,
        2
      ],
      [
        3,
        4,
        5
      ],
      [
        5,
        5,
        2
      ]
    ],
    "pitRandomness": 0.5,
    "pitSeed": 4394,
    "mechanics": {
      "rottenFruit": 4,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 43.8
  },
  "cursor_med_3": {
    "id": "cursor_med_3",
    "name": "Cursor_Med_3",
    "cols": 2,
    "rows": 5,
    "trays": [
      [
        0,
        1
      ],
      [
        3,
        1
      ],
      [
        2,
        3
      ],
      [
        0,
        0
      ],
      [
        0,
        1
      ]
    ],
    "pitRandomness": 0.28,
    "pitSeed": 4491,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 32.2
  },
  "cursor_hard_2": {
    "id": "cursor_hard_2",
    "name": "Cursor_Hard_2",
    "cols": 2,
    "rows": 6,
    "trays": [
      [
        0,
        1
      ],
      [
        2,
        1
      ],
      [
        2,
        3
      ],
      [
        4,
        3
      ],
      [
        4,
        4
      ],
      [
        0,
        5
      ]
    ],
    "pitRandomness": 0.42,
    "pitSeed": 4588,
    "mechanics": {
      "rottenFruit": 2,
      "mysteryBall": 3,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 43.6
  },
  "cursor_hard_3": {
    "id": "cursor_hard_3",
    "name": "Cursor_Hard_3",
    "cols": 4,
    "rows": 5,
    "trays": [
      [
        0,
        0,
        0,
        3
      ],
      [
        5,
        2,
        3,
        4
      ],
      [
        2,
        2,
        4,
        5
      ],
      [
        3,
        3,
        5,
        1
      ],
      [
        3,
        1,
        6,
        0
      ]
    ],
    "pitRandomness": 0.52,
    "pitSeed": 4685,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 0,
      "bomb": 2,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 48.3
  },
  "cursor_vhard_1": {
    "id": "cursor_vhard_1",
    "name": "Cursor_VHard_1",
    "cols": 2,
    "rows": 8,
    "trays": [
      [
        5,
        1
      ],
      [
        1,
        2
      ],
      [
        2,
        3
      ],
      [
        3,
        4
      ],
      [
        4,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        0
      ],
      [
        0,
        1
      ]
    ],
    "pitRandomness": 0.55,
    "pitSeed": 4782,
    "mechanics": {
      "rottenFruit": 5,
      "mysteryBall": 2,
      "bomb": 2,
      "breakableBox": 0
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 62.8
  },
  "cursor_hard_4": {
    "id": "cursor_hard_4",
    "name": "Cursor_Hard_4",
    "cols": 3,
    "rows": 6,
    "trays": [
      [
        2,
        5,
        5
      ],
      [
        1,
        3,
        3
      ],
      [
        4,
        0,
        2
      ],
      [
        1,
        1,
        6
      ],
      [
        0,
        7,
        7
      ],
      [
        7,
        7,
        0
      ]
    ],
    "pitRandomness": 0.38,
    "pitSeed": 4879,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 7,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 45.1
  },
  "cursor_vhard_2": {
    "id": "cursor_vhard_2",
    "name": "Cursor_VHard_2",
    "cols": 3,
    "rows": 7,
    "trays": [
      [
        5,
        7,
        7
      ],
      [
        3,
        4,
        4
      ],
      [
        6,
        7,
        7
      ],
      [
        7,
        2,
        3
      ],
      [
        4,
        5,
        6
      ],
      [
        7,
        0,
        1
      ],
      [
        2,
        2,
        4
      ]
    ],
    "pitRandomness": 0.62,
    "pitSeed": 4976,
    "mechanics": {
      "rottenFruit": 4,
      "mysteryBall": 0,
      "bomb": 3,
      "breakableBox": 1
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 63.1
  },
  "cursor_vhard_3": {
    "id": "cursor_vhard_3",
    "name": "Cursor_VHard_3",
    "cols": 2,
    "rows": 9,
    "trays": [
      [
        0,
        1
      ],
      [
        2,
        1
      ],
      [
        1,
        1
      ],
      [
        4,
        0
      ],
      [
        4,
        2
      ],
      [
        0,
        5
      ],
      [
        0,
        1
      ],
      [
        2,
        2
      ],
      [
        2,
        3
      ]
    ],
    "pitRandomness": 0.48,
    "pitSeed": 5073,
    "mechanics": {
      "rottenFruit": 6,
      "mysteryBall": 3,
      "bomb": 1,
      "breakableBox": 0
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 66.1
  },
  "cursor_med_4": {
    "id": "cursor_med_4",
    "name": "Cursor_Med_4",
    "cols": 4,
    "rows": 3,
    "trays": [
      [
        0,
        1,
        2,
        3
      ],
      [
        1,
        1,
        3,
        2
      ],
      [
        2,
        5,
        4,
        5
      ]
    ],
    "pitRandomness": 0.55,
    "pitSeed": 5170,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 0,
      "bomb": 0,
      "breakableBox": 2
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 27
  },
  "cursor_hard_5": {
    "id": "cursor_hard_5",
    "name": "Cursor_Hard_5",
    "cols": 2,
    "rows": 7,
    "trays": [
      [
        0,
        1
      ],
      [
        0,
        1
      ],
      [
        1,
        2
      ],
      [
        1,
        2
      ],
      [
        2,
        3
      ],
      [
        2,
        2
      ],
      [
        0,
        0
      ]
    ],
    "pitRandomness": 0.58,
    "pitSeed": 5267,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 0,
      "bomb": 1,
      "breakableBox": 1
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 51.1
  },
  "cursor_vhard_4": {
    "id": "cursor_vhard_4",
    "name": "Cursor_VHard_4",
    "cols": 3,
    "rows": 8,
    "trays": [
      [
        0,
        0,
        5
      ],
      [
        4,
        1,
        3
      ],
      [
        6,
        7,
        6
      ],
      [
        1,
        1,
        3
      ],
      [
        6,
        0,
        0
      ],
      [
        4,
        6,
        1
      ],
      [
        7,
        4,
        4
      ],
      [
        2,
        0,
        5
      ]
    ],
    "pitRandomness": 0.58,
    "pitSeed": 5364,
    "mechanics": {
      "rottenFruit": 3,
      "mysteryBall": 2,
      "bomb": 2,
      "breakableBox": 2
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 65.7
  },
  "cursor_vhard_5": {
    "id": "cursor_vhard_5",
    "name": "Cursor_VHard_5",
    "cols": 4,
    "rows": 7,
    "trays": [
      [
        0,
        0,
        0,
        3
      ],
      [
        6,
        2,
        3,
        4
      ],
      [
        5,
        3,
        4,
        5
      ],
      [
        3,
        4,
        5,
        5
      ],
      [
        0,
        0,
        0,
        3
      ],
      [
        5,
        0,
        0,
        1
      ],
      [
        4,
        4,
        4,
        2
      ]
    ],
    "pitRandomness": 0.65,
    "pitSeed": 5461,
    "mechanics": {
      "rottenFruit": 5,
      "mysteryBall": 2,
      "bomb": 3,
      "breakableBox": 1
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 68.7
  },
  "cursor_med_5": {
    "id": "cursor_med_5",
    "name": "Cursor_Med_5",
    "cols": 3,
    "rows": 4,
    "trays": [
      [
        0,
        1,
        2
      ],
      [
        0,
        1,
        4
      ],
      [
        1,
        2,
        3
      ],
      [
        1,
        1,
        3
      ]
    ],
    "pitRandomness": 0.4,
    "pitSeed": 5558,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 3,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 31.1
  },
  "cursor_vhard_6": {
    "id": "cursor_vhard_6",
    "name": "Cursor_VHard_6",
    "cols": 2,
    "rows": 10,
    "trays": [
      [
        7,
        1
      ],
      [
        0,
        1
      ],
      [
        1,
        1
      ],
      [
        1,
        6
      ],
      [
        2,
        3
      ],
      [
        2,
        2
      ],
      [
        3,
        7
      ],
      [
        3,
        3
      ],
      [
        4,
        5
      ],
      [
        4,
        5
      ]
    ],
    "pitRandomness": 0.52,
    "pitSeed": 5655,
    "mechanics": {
      "rottenFruit": 4,
      "mysteryBall": 4,
      "bomb": 3,
      "breakableBox": 0
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 73
  },
  "cursor_vhard_7": {
    "id": "cursor_vhard_7",
    "name": "Cursor_VHard_7",
    "cols": 3,
    "rows": 9,
    "trays": [
      [
        0,
        0,
        2
      ],
      [
        3,
        7,
        5
      ],
      [
        6,
        6,
        0
      ],
      [
        1,
        2,
        2
      ],
      [
        7,
        7,
        0
      ],
      [
        7,
        0,
        0
      ],
      [
        2,
        3,
        3
      ],
      [
        5,
        2,
        2
      ],
      [
        0,
        1,
        2
      ]
    ],
    "pitRandomness": 0.6,
    "pitSeed": 5752,
    "mechanics": {
      "rottenFruit": 7,
      "mysteryBall": 0,
      "bomb": 3,
      "breakableBox": 2
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 78.6
  },
  "cursor_vhard_8": {
    "id": "cursor_vhard_8",
    "name": "Cursor_VHard_8",
    "cols": 4,
    "rows": 6,
    "trays": [
      [
        6,
        5,
        2,
        3
      ],
      [
        3,
        2,
        1,
        4
      ],
      [
        2,
        3,
        2,
        5
      ],
      [
        5,
        4,
        5,
        6
      ],
      [
        4,
        5,
        5,
        7
      ],
      [
        0,
        6,
        6,
        0
      ]
    ],
    "pitRandomness": 0.28,
    "pitSeed": 5849,
    "mechanics": {
      "rottenFruit": 2,
      "mysteryBall": 6,
      "bomb": 3,
      "breakableBox": 1
    },
    "difficulty": "hard",
    "difficultyLabel": "Hard",
    "difficultyScore": 55.9
  },
  "cursor_vhard_9": {
    "id": "cursor_vhard_9",
    "name": "Cursor_VHard_9",
    "cols": 2,
    "rows": 8,
    "trays": [
      [
        6,
        3
      ],
      [
        5,
        6
      ],
      [
        6,
        4
      ],
      [
        6,
        6
      ],
      [
        4,
        2
      ],
      [
        7,
        5
      ],
      [
        7,
        1
      ],
      [
        4,
        7
      ]
    ],
    "pitRandomness": 0.55,
    "pitSeed": 5946,
    "mechanics": {
      "rottenFruit": 8,
      "mysteryBall": 1,
      "bomb": 2,
      "breakableBox": 1
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 68
  },
  "cursor_vhard_10": {
    "id": "cursor_vhard_10",
    "name": "Cursor_VHard_10",
    "cols": 4,
    "rows": 8,
    "trays": [
      [
        6,
        1,
        2,
        2
      ],
      [
        1,
        7,
        7,
        4
      ],
      [
        5,
        5,
        4,
        5
      ],
      [
        3,
        3,
        5,
        6
      ],
      [
        5,
        5,
        7,
        7
      ],
      [
        7,
        6,
        6,
        6
      ],
      [
        6,
        6,
        6,
        1
      ],
      [
        2,
        2,
        1,
        2
      ]
    ],
    "pitRandomness": 0.5,
    "pitSeed": 6043,
    "mechanics": {
      "rottenFruit": 4,
      "mysteryBall": 3,
      "bomb": 4,
      "breakableBox": 2
    },
    "difficulty": "veryHard",
    "difficultyLabel": "Very Hard",
    "difficultyScore": 74.7
  },
  "mystery_balls_intro_copy": {
    "id": "mystery_balls_intro_copy",
    "name": "MysteryBalls_hard",
    "cols": 2,
    "rows": 6,
    "trays": [
      [
        1,
        7
      ],
      [
        3,
        6
      ],
      [
        4,
        0
      ],
      [
        5,
        6
      ],
      [
        4,
        5
      ],
      [
        5,
        6
      ]
    ],
    "pitRandomness": 0.51,
    "pitSeed": 8,
    "mechanics": {
      "rottenFruit": 0,
      "mysteryBall": 3,
      "bomb": 0,
      "breakableBox": 0
    },
    "difficulty": "medium",
    "difficultyLabel": "Medium",
    "difficultyScore": 41.7
  }
}/*END_CLAW_LEVEL_POOL*/;

(function () {
  if (window.CLAW_DIFFICULTY) window.CLAW_DIFFICULTY.tagAll(window.CLAW_LEVEL_POOL, 3);
})();
