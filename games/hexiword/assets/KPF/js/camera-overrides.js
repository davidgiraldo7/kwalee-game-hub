(function (global) {
  'use strict';

  // Baked camera orbit defaults per visual preset.
  // Regenerate via Debug → Camera Editor → Export Defaults.
  // Keep this file at assets/KPF/js/camera-overrides.js.
  global.KPF_CAMERA_OVERRIDES = {
  "flow-like-v1": {
    "rotX": 0.43,
    "rotY": 0.01,
    "dist": 29.5,
    "height": -9,
    "fov": 32,
    "panX": 0,
    "panY": -4
  },
  "block-puzzle-v1": {
    "rotX": 0.43,
    "rotY": 0.01,
    "dist": 29.5,
    "height": -9,
    "fov": 32,
    "panX": 0,
    "panY": -4
  },
  "soft-3d-v1": {
    "rotX": 0.25,
    "rotY": 0,
    "dist": 59,
    "height": 39.2,
    "fov": 28,
    "panX": 0,
    "panY": 2.6
  },
  "none-3d": {
    "rotX": 0.35,
    "rotY": 0,
    "dist": 20,
    "height": 8.5,
    "fov": 32,
    "panX": 0,
    "panY": 0
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
