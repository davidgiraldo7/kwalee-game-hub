(function (global) {
  'use strict';

  // Baked lighting defaults per visual preset.
  // Regenerate via Debug → Light Editor → Export Defaults.
  // Keep this file at assets/KPF/js/light-overrides.js.
  global.KPF_LIGHT_OVERRIDES = {
  "flow-like-v1": {
    "shadows": true,
    "shadowStrength": 1,
    "shadowRadius": 3.5,
    "shadowBias": -0.0005,
    "exposure": 1.1,
    "fog": false,
    "fogNear": 60,
    "fogFar": 340,
    "lights": [
      {
        "id": "ambient",
        "name": "Ambient",
        "type": "ambient",
        "intensity": 0.3,
        "color": "#fff0dc"
      },
      {
        "id": "hemi",
        "name": "Hemisphere",
        "type": "hemisphere",
        "intensity": 0.32,
        "sky": "#fff6e8",
        "ground": "#e4c9a8"
      },
      {
        "id": "key",
        "name": "Key",
        "type": "directional",
        "intensity": 0.55,
        "color": "#fff6e8",
        "position": [
          -7.5,
          21,
          18.5
        ],
        "rotation": [
          -0.9,
          0.4,
          0
        ],
        "castShadow": true
      },
      {
        "id": "fill",
        "name": "Fill",
        "type": "directional",
        "intensity": 0.18,
        "color": "#ffe8cf",
        "position": [
          10,
          4,
          8
        ],
        "rotation": [
          -0.4,
          -0.5,
          0
        ],
        "castShadow": false
      },
      {
        "id": "rim",
        "name": "Rim",
        "type": "directional",
        "intensity": 0.06,
        "color": "#fff1de",
        "position": [
          0,
          2,
          -10
        ],
        "rotation": [
          0.2,
          0,
          0
        ],
        "castShadow": false
      },
      {
        "id": "underGlow",
        "name": "Under Glow",
        "type": "directional",
        "intensity": 0.1,
        "color": "#f3d9bc",
        "position": [
          0,
          -8,
          6
        ],
        "rotation": [
          0.5,
          0,
          0
        ],
        "castShadow": false
      }
    ]
  },
  "block-puzzle-v1": {
    "shadows": true,
    "shadowStrength": 1,
    "shadowRadius": 3.5,
    "shadowBias": -0.0005,
    "exposure": 1.08,
    "fog": false,
    "fogNear": 60,
    "fogFar": 340,
    "lights": [
      {
        "id": "ambient",
        "name": "Ambient",
        "type": "ambient",
        "intensity": 0.34,
        "color": "#f7f5ff"
      },
      {
        "id": "hemi",
        "name": "Hemisphere",
        "type": "hemisphere",
        "intensity": 0.38,
        "sky": "#ffffff",
        "ground": "#b7b3d5"
      },
      {
        "id": "key",
        "name": "Key",
        "type": "directional",
        "intensity": 0.65,
        "color": "#fffbf5",
        "position": [
          -7.5,
          21,
          18.5
        ],
        "rotation": [
          -0.9,
          0.4,
          0
        ],
        "castShadow": true
      },
      {
        "id": "fill",
        "name": "Fill",
        "type": "directional",
        "intensity": 0.22,
        "color": "#cbdcff",
        "position": [
          10,
          4,
          8
        ],
        "rotation": [
          -0.4,
          -0.5,
          0
        ],
        "castShadow": false
      },
      {
        "id": "rim",
        "name": "Rim",
        "type": "directional",
        "intensity": 0.12,
        "color": "#f0e8ff",
        "position": [
          0,
          2,
          -10
        ],
        "rotation": [
          0.2,
          0,
          0
        ],
        "castShadow": false
      },
      {
        "id": "underGlow",
        "name": "Under Glow",
        "type": "directional",
        "intensity": 0.1,
        "color": "#c8c4e8",
        "position": [
          0,
          -8,
          6
        ],
        "rotation": [
          0.5,
          0,
          0
        ],
        "castShadow": false
      }
    ]
  },
  "soft-3d-v1": {
    "shadows": true,
    "shadowStrength": 1,
    "shadowRadius": 3,
    "shadowBias": -0.0008,
    "exposure": 1,
    "fog": true,
    "fogNear": 60,
    "fogFar": 340,
    "lights": [
      {
        "id": "ambient",
        "name": "Ambient",
        "type": "ambient",
        "intensity": 0.26,
        "color": "#ffffff"
      },
      {
        "id": "hemi",
        "name": "Hemisphere",
        "type": "hemisphere",
        "intensity": 0.3,
        "sky": "#fff4e6",
        "ground": "#c9a77d"
      },
      {
        "id": "key",
        "name": "Key",
        "type": "directional",
        "intensity": 0.4,
        "color": "#fff0dd",
        "position": [
          14,
          38,
          20
        ],
        "rotation": [
          -0.9,
          0.4,
          0
        ],
        "castShadow": true
      },
      {
        "id": "fill",
        "name": "Fill",
        "type": "directional",
        "intensity": 0.14,
        "color": "#d2dae2",
        "position": [
          -10,
          20,
          -8
        ],
        "rotation": [
          -0.4,
          -0.5,
          0
        ],
        "castShadow": false
      },
      {
        "id": "rim",
        "name": "Rim",
        "type": "directional",
        "intensity": 0.2,
        "color": "#ffffff",
        "position": [
          0,
          2,
          -10
        ],
        "rotation": [
          0.2,
          0,
          0
        ],
        "castShadow": false
      }
    ]
  },
  "none-3d": {
    "shadows": true,
    "shadowStrength": 1,
    "shadowRadius": 2.5,
    "shadowBias": -0.0005,
    "exposure": 1,
    "fog": true,
    "fogNear": 40,
    "fogFar": 160,
    "lights": [
      {
        "id": "ambient",
        "name": "Ambient",
        "type": "ambient",
        "intensity": 0.3,
        "color": "#ffffff"
      },
      {
        "id": "hemi",
        "name": "Hemisphere",
        "type": "hemisphere",
        "intensity": 0.35,
        "sky": "#dfe8ff",
        "ground": "#2a2438"
      },
      {
        "id": "key",
        "name": "Key",
        "type": "directional",
        "intensity": 0.85,
        "color": "#fff4e6",
        "position": [
          -7,
          14,
          12
        ],
        "rotation": [
          -0.9,
          0.4,
          0
        ],
        "castShadow": true
      },
      {
        "id": "fill",
        "name": "Fill",
        "type": "directional",
        "intensity": 0.3,
        "color": "#b8c8e8",
        "position": [
          8,
          6,
          -6
        ],
        "rotation": [
          -0.4,
          -0.5,
          0
        ],
        "castShadow": false
      },
      {
        "id": "rim",
        "name": "Rim",
        "type": "directional",
        "intensity": 0.2,
        "color": "#ffffff",
        "position": [
          0,
          2,
          -10
        ],
        "rotation": [
          0.2,
          0,
          0
        ],
        "castShadow": false
      }
    ]
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
