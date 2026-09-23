(function (global) {
  'use strict';

  // Baked visual-preset debug tuning (effects / appearance), keyed by preset id.
  // Camera → assets/KPF/js/camera-overrides.js ; Lights → assets/KPF/js/light-overrides.js
  // Regenerate effects/appearance via the theme picker Export Overrides.
  global.KPF_PRESET_OVERRIDES = {
  "effects": {
    "flow-like-v1": {
      "bloomStrength": 0.04,
      "bloomRadius": 0.25,
      "bloomThreshold": 0.98,
      "saturation": 1.06,
      "contrast": 1,
      "specular": 0.35,
      "roughness": 1,
      "rim": 1,
      "env": 1,
      "contactShadow": 1,
      "bg": "#f4e0c6"
    },
    "block-puzzle-v1": {
      "bloomStrength": 0.08,
      "bloomRadius": 0.2,
      "bloomThreshold": 0.95,
      "saturation": 1.08,
      "contrast": 1.03,
      "specular": 0.75,
      "roughness": 0.9,
      "rim": 1.1,
      "env": 1.2,
      "contactShadow": 1,
      "bg": "#e9e8f6"
    },
    "soft-3d-v1": {
      "bloomStrength": 0.2,
      "bloomRadius": 0.35,
      "bloomThreshold": 0.9,
      "saturation": 1.15,
      "contrast": 1.05,
      "specular": 1,
      "roughness": 1,
      "rim": 1,
      "env": 1,
      "contactShadow": 1,
      "bg": "#262b47"
    },
    "none-3d": {
      "bloomStrength": 0.2,
      "bloomRadius": 0.35,
      "bloomThreshold": 0.9,
      "saturation": 1.15,
      "contrast": 1.05,
      "specular": 1,
      "roughness": 1,
      "rim": 1,
      "env": 1,
      "contactShadow": 1,
      "bg": "#03040b"
    }
  },
  "appearance": {
    "vector-minimalistic-v1": {
      "gridSize": 8,
      "gridScale": 0.82,
      "posX": 0,
      "posY": 0,
      "lineWidth": 1,
      "lineColor": "#b8b1a5",
      "tileSize": 0.8,
      "tileColor": "#b8b1a5",
      "background": "#ffffff",
      "showLines": true,
      "showTiles": true
    },
    "casual-stylised-v1": {
      "gridSize": 8,
      "gridScale": 0.74,
      "posX": 0,
      "posY": 0,
      "lineWidth": 1,
      "lineColor": "#d0a84f",
      "tileSize": 0.82,
      "tileColor": "#fffdf8",
      "background": "#f4e8d2",
      "showLines": true,
      "showTiles": true
    }
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
