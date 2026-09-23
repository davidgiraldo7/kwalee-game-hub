(function (global) {
  'use strict';

  const registry = Object.create(null);
  const loadedScripts = Object.create(null);
  const loadedDeps = Object.create(null);

  const CATALOG_FALLBACK = {
    presets: [
      {
        id: 'none',
        label: '2D Scene',
        tier: 'none',
        description: 'Flat 2D play area — no WebGL scene is created, keeping the DOM/canvas pipeline at its lightest.',
        deps: [],
        script: 'assets/KPF/visual-presets/none.js'
      },
      {
        id: 'vector-minimalistic-v1',
        label: 'Clean Grid',
        tier: '2d',
        description: 'Clean warm canvas with a crisp, finely drawn grid and adjustable 2D styling.',
        deps: [],
        script: 'assets/KPF/visual-presets/vector-minimalistic-v1.js'
      },
      {
        id: 'casual-stylised-v1',
        label: 'Casual Stylised',
        tier: '2d',
        description: 'Polished jewel board with bright gem pieces and a warm, playful match-three feel.',
        deps: [],
        script: 'assets/KPF/visual-presets/casual-stylised-v1.js'
      },
      {
        id: 'none-3d',
        label: '3D Scene',
        tier: '3d',
        description: 'Empty WebGL stage with a camera, lighting rig and ground plane, ready for 3D gameplay objects.',
        deps: [
          {
            url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
            global: 'THREE'
          }
        ],
        script: 'assets/KPF/visual-presets/none-3d.js'
      },
      {
        id: 'soft-3d-v1',
        label: 'Soft 3D',
        tier: '3d',
        description: 'Warm soft-plastic look with tuned lighting, soft shadows, and starter scale props.',
        deps: [
          {
            url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
            global: 'THREE'
          }
        ],
        script: 'assets/KPF/visual-presets/soft-3d-v1.js'
      },
      {
        id: 'flow-like-v1',
        label: 'Flow-Like',
        tier: '3d',
        description: 'Warm flat-toy aesthetic with matte coin discs and three-hole collection plates.',
        deps: [
          {
            url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
            global: 'THREE'
          }
        ],
        script: 'assets/KPF/visual-presets/flow-like-v1.js'
      },
      {
        id: 'block-puzzle-v1',
        label: 'Block Puzzle',
        tier: '3d',
        description: 'Cool lavender puzzle board with four clean, tactile red, blue, and yellow tetromino pieces.',
        deps: [
          {
            url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
            global: 'THREE'
          }
        ],
        script: 'assets/KPF/visual-presets/block-puzzle-v1.js'
      }
    ]
  };

  let catalogCache = null;

  function register(id, factory) {
    if (!id || typeof factory !== 'function') return;
    registry[id] = factory;
  }

  function has(id) {
    return !!registry[id];
  }

  function getActiveName() {
    const raw = global.KPF_VISUAL_PRESET;
    if (typeof raw !== 'string') return 'none';
    const trimmed = raw.trim();
    return trimmed || 'none';
  }

  function list() {
    return Object.keys(registry).sort();
  }

  function findPresetMeta(catalog, id) {
    return (catalog.presets || []).find(function (entry) {
      return entry.id === id;
    }) || null;
  }

  function loadCatalog() {
    if (catalogCache) return Promise.resolve(catalogCache);
    return fetch('assets/KPF/visual-presets/catalog.json')
      .then(function (resp) {
        if (!resp.ok) throw new Error('catalog fetch failed');
        return resp.json();
      })
      .then(function (json) {
        catalogCache = json;
        return catalogCache;
      })
      .catch(function () {
        catalogCache = CATALOG_FALLBACK;
        return catalogCache;
      });
  }

  function loadScript(url) {
    if (loadedScripts[url]) return loadedScripts[url];
    loadedScripts[url] = new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = url;
      el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(el);
    });
    return loadedScripts[url];
  }

  function ensureDependency(dep) {
    if (!dep || !dep.url) return Promise.resolve();
    if (dep.global && global[dep.global]) return Promise.resolve();
    if (loadedDeps[dep.url]) return loadedDeps[dep.url];

    loadedDeps[dep.url] = loadScript(dep.url).then(function () {
      if (dep.global && !global[dep.global]) {
        throw new Error('Dependency did not expose global ' + dep.global);
      }
    });
    return loadedDeps[dep.url];
  }

  function ensurePresetReady(meta) {
    if (!meta || meta.id === 'none') return Promise.resolve();
    const deps = Array.isArray(meta.deps) ? meta.deps : [];
    return deps.reduce(function (chain, dep) {
      return chain.then(function () { return ensureDependency(dep); });
    }, Promise.resolve()).then(function () {
      if (!meta.script || has(meta.id)) return;
      return loadScript(meta.script);
    });
  }

  function createNoneRunner() {
    return {
      id: 'none',
      tier: 'none',
      scene: null,
      contentGroup: null,
      tokens: null,
      mount: function () {},
      step: function () {},
      resize: function () {},
      dispose: function () {}
    };
  }

  function createActive(options) {
    options = options || {};
    // Optional id override so previews can mount a preset without mutating
    // window.KPF_VISUAL_PRESET (which would race with Apply / boot).
    const override = typeof options.id === 'string' ? options.id.trim() : '';
    const id = override || getActiveName();
    if (id === 'none') return Promise.resolve(createNoneRunner());

    return loadCatalog().then(function (catalog) {
      const meta = findPresetMeta(catalog, id);
      if (!meta) {
        console.warn('[KPFVisualBridge] Unknown preset:', id);
        return createNoneRunner();
      }
      return ensurePresetReady(meta).then(function () {
        const factory = registry[id];
        if (!factory) {
          console.warn('[KPFVisualBridge] Preset not registered:', id);
          return createNoneRunner();
        }
        return factory(options || {});
      });
    });
  }

  global.KPFVisualBridge = {
    register: register,
    has: has,
    list: list,
    getActiveName: getActiveName,
    loadCatalog: loadCatalog,
    createActive: createActive,
    createNoneRunner: createNoneRunner
  };
})(typeof window !== 'undefined' ? window : globalThis);
