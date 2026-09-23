(function (global) {
  'use strict';

  // Flipped to true by POST_THEME_CLEANUP.md after unused themes / the picker
  // are removed. Optional marker for agents — boot does not block on this.
  // Keep this at assets/theme-cleanup-done.js.
  global.KPF_THEME_CLEANUP_DONE = false;
})(typeof window !== 'undefined' ? window : globalThis);
