(function (global) {
  'use strict';

  if (!global.KPFVisualBridge) return;

  global.KPFVisualBridge.register('none', function () {
    return global.KPFVisualBridge.createNoneRunner();
  });
})(typeof window !== 'undefined' ? window : globalThis);
