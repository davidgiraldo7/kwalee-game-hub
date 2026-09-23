(function (global) {
  'use strict';

  // Flexible light-list editor for 3D visual presets. Owns schema migrate /
  // capture / apply plus the debug overlay (hierarchy + properties).

  var ENV_ID = '__environment__';
  var ADDABLE_TYPES = ['directional', 'point', 'spot'];
  var CONVERTIBLE = { directional: true, point: true, spot: true };

  var _opts = null;
  var _settings = null;
  var _selectedId = ENV_ID;
  var _open = false;
  var _root = null;
  var _listEl = null;
  var _propsEl = null;
  var _emptyEl = null;
  var _idSeq = 1;

  function colorToHex(color) {
    return color && color.getHexString ? '#' + color.getHexString() : '#ffffff';
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function defaultEnv() {
    return {
      shadows: true,
      shadowStrength: 1,
      shadowRadius: 3,
      shadowBias: -0.0008,
      exposure: 1,
      fog: false,
      fogNear: 60,
      fogFar: 340
    };
  }

  function emptySettings() {
    return Object.assign(defaultEnv(), { lights: [] });
  }

  function isLegacyLights(s) {
    return !!(s && !Array.isArray(s.lights) && (
      typeof s.ambInt === 'number' ||
      typeof s.keyInt === 'number' ||
      typeof s.fillInt === 'number'
    ));
  }

  function isNewLights(s) {
    return !!(s && Array.isArray(s.lights));
  }

  function lightTypeOfObject(obj) {
    if (!obj) return null;
    if (obj.isAmbientLight) return 'ambient';
    if (obj.isHemisphereLight) return 'hemisphere';
    if (obj.isDirectionalLight) return 'directional';
    if (obj.isPointLight) return 'point';
    if (obj.isSpotLight) return 'spot';
    return null;
  }

  function captureRotation(light) {
    if (!light || !light.target) return [0, 0, 0];
    var THREE = global.THREE;
    if (!THREE) return [0, 0, 0];
    var dummy = new THREE.Object3D();
    dummy.position.copy(light.position);
    dummy.lookAt(light.target.getWorldPosition(new THREE.Vector3()));
    return [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z];
  }

  function applyLookRotation(light, rotation, scene) {
    var THREE = global.THREE;
    if (!THREE || !light || !rotation) return;
    var e = new THREE.Euler(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0, 'XYZ');
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
    if (!light.target) return;
    light.target.position.copy(light.position).add(dir.multiplyScalar(20));
    if (scene && light.target.parent !== scene) scene.add(light.target);
    light.target.updateMatrixWorld();
  }

  function entryFromLight(id, name, light) {
    var type = lightTypeOfObject(light);
    if (!type) return null;
    var entry = {
      id: id,
      name: name || id,
      type: type,
      intensity: typeof light.intensity === 'number' ? light.intensity : 1
    };
    if (type === 'ambient') {
      entry.color = colorToHex(light.color);
    } else if (type === 'hemisphere') {
      entry.sky = colorToHex(light.color);
      entry.ground = colorToHex(light.groundColor);
    } else if (type === 'directional') {
      entry.color = colorToHex(light.color);
      entry.position = [light.position.x, light.position.y, light.position.z];
      entry.rotation = captureRotation(light);
      entry.castShadow = !!light.castShadow;
    } else if (type === 'point') {
      entry.color = colorToHex(light.color);
      entry.position = [light.position.x, light.position.y, light.position.z];
      entry.distance = typeof light.distance === 'number' ? light.distance : 0;
    } else if (type === 'spot') {
      entry.color = colorToHex(light.color);
      entry.position = [light.position.x, light.position.y, light.position.z];
      entry.rotation = captureRotation(light);
      entry.angle = typeof light.angle === 'number' ? light.angle : Math.PI / 6;
      entry.distance = typeof light.distance === 'number' ? light.distance : 0;
      entry.penumbra = typeof light.penumbra === 'number' ? light.penumbra : 0;
      entry.castShadow = !!light.castShadow;
    }
    return entry;
  }

  function migrateLegacy(s) {
    if (!s) return emptySettings();
    if (isNewLights(s)) return normalizeSettings(s);
    if (!isLegacyLights(s)) return emptySettings();

    var lights = [];
    if (typeof s.ambInt === 'number' || s.ambCol) {
      lights.push({
        id: 'ambient',
        name: 'Ambient',
        type: 'ambient',
        intensity: typeof s.ambInt === 'number' ? s.ambInt : 0.3,
        color: s.ambCol || '#ffffff'
      });
    }
    if (typeof s.hemiInt === 'number' || s.hemiSky) {
      lights.push({
        id: 'hemi',
        name: 'Hemisphere',
        type: 'hemisphere',
        intensity: typeof s.hemiInt === 'number' ? s.hemiInt : 0.3,
        sky: s.hemiSky || '#ffffff',
        ground: s.hemiGround || '#888888'
      });
    }
    if (typeof s.keyInt === 'number' || s.keyCol) {
      lights.push({
        id: 'key',
        name: 'Key',
        type: 'directional',
        intensity: typeof s.keyInt === 'number' ? s.keyInt : 0.6,
        color: s.keyCol || '#ffffff',
        position: [
          typeof s.keyX === 'number' ? s.keyX : 14,
          typeof s.keyY === 'number' ? s.keyY : 38,
          typeof s.keyZ === 'number' ? s.keyZ : 20
        ],
        rotation: [ -0.9, 0.4, 0 ],
        castShadow: true
      });
    }
    if (typeof s.fillInt === 'number' || s.fillCol) {
      lights.push({
        id: 'fill',
        name: 'Fill',
        type: 'directional',
        intensity: typeof s.fillInt === 'number' ? s.fillInt : 0.2,
        color: s.fillCol || '#ffffff',
        position: [10, 4, 8],
        rotation: [ -0.4, -0.5, 0 ],
        castShadow: false
      });
    }
    if (typeof s.rimInt === 'number' || s.rimCol) {
      lights.push({
        id: 'rim',
        name: 'Rim',
        type: 'directional',
        intensity: typeof s.rimInt === 'number' ? s.rimInt : 0.2,
        color: s.rimCol || '#ffffff',
        position: [0, 2, -10],
        rotation: [0.2, 0, 0],
        castShadow: false
      });
    }

    return normalizeSettings({
      shadows: s.shadows !== undefined ? !!s.shadows : true,
      shadowStrength: typeof s.shadowStrength === 'number' ? s.shadowStrength : 1,
      shadowRadius: typeof s.shadowRadius === 'number' ? s.shadowRadius : 3,
      shadowBias: typeof s.shadowBias === 'number' ? s.shadowBias : -0.0008,
      exposure: typeof s.exposure === 'number' ? s.exposure : 1,
      fog: !!s.fog,
      fogNear: typeof s.fogNear === 'number' ? s.fogNear : 60,
      fogFar: typeof s.fogFar === 'number' ? s.fogFar : 340,
      lights: lights
    });
  }

  function normalizeSettings(s) {
    var env = defaultEnv();
    var out = {
      shadows: s.shadows !== undefined ? !!s.shadows : env.shadows,
      shadowStrength: typeof s.shadowStrength === 'number' ? s.shadowStrength : env.shadowStrength,
      shadowRadius: typeof s.shadowRadius === 'number' ? s.shadowRadius : env.shadowRadius,
      shadowBias: typeof s.shadowBias === 'number' ? s.shadowBias : env.shadowBias,
      exposure: typeof s.exposure === 'number' ? s.exposure : env.exposure,
      fog: !!s.fog,
      fogNear: typeof s.fogNear === 'number' ? s.fogNear : env.fogNear,
      fogFar: typeof s.fogFar === 'number' ? s.fogFar : env.fogFar,
      lights: []
    };
    (s.lights || []).forEach(function (L) {
      if (!L || !L.type) return;
      out.lights.push(clone(L));
    });
    return out;
  }

  function captureFrom(runner) {
    var env = defaultEnv();
    if (!runner) return Object.assign(env, { lights: [] });

    var renderer = runner.renderer;
    var fog = runner.scene && runner.scene.fog;
    if (renderer) {
      env.shadows = !!renderer.shadowMap.enabled;
      if (typeof renderer.toneMappingExposure === 'number') {
        env.exposure = renderer.toneMappingExposure;
      }
    }
    env.fog = !!fog;
    if (fog) {
      if (typeof fog.near === 'number') env.fogNear = fog.near;
      if (typeof fog.far === 'number') env.fogFar = fog.far;
    }

    var map = runner.lights || {};
    var lights = [];
    var keys = Object.keys(map);
    var shadowFrom = null;
    keys.forEach(function (key) {
      var light = map[key];
      var entry = entryFromLight(key, titleCase(key), light);
      if (!entry) return;
      if (light && light.castShadow && light.shadow) shadowFrom = light;
      // Prefer stable display names for known slots
      if (key === 'ambient') entry.name = 'Ambient';
      if (key === 'hemi') entry.name = 'Hemisphere';
      if (key === 'key') entry.name = 'Key';
      if (key === 'fill') entry.name = 'Fill';
      if (key === 'rim') entry.name = 'Rim';
      if (key === 'underGlow') entry.name = 'Under Glow';
      lights.push(entry);
    });

    if (shadowFrom && shadowFrom.shadow) {
      env.shadowRadius = shadowFrom.shadow.radius;
      env.shadowBias = shadowFrom.shadow.bias;
    }
    env.shadowStrength = 1;

    return Object.assign(env, { lights: lights });
  }

  function titleCase(id) {
    return String(id || 'Light').replace(/([A-Z])/g, ' $1')
      .replace(/[-_]+/g, ' ')
      .replace(/^\w/, function (c) { return c.toUpperCase(); })
      .trim();
  }

  function mergeNativeWithOverlay(native, overlay) {
    var base = normalizeSettings(native || emptySettings());
    if (!overlay) return base;
    var over = migrateLegacy(overlay);
    var byId = {};
    base.lights.forEach(function (L) { byId[L.id] = clone(L); });
    // Overlay list is authoritative for membership when present and non-empty,
    // but native-only ids (e.g. underGlow) are kept unless overlay explicitly
    // listed a full replacement that already includes them — for saved/baked
    // full lists, use overlay membership only.
    var useOverlayMembership = over.lights && over.lights.length > 0;
    if (useOverlayMembership) {
      byId = {};
      over.lights.forEach(function (L) { byId[L.id] = clone(L); });
      // Keep native-only extras that legacy migrate never knew about when
      // overlay came from legacy (no underGlow). Detect legacy-origin by
      // checking overlay was migrated from flat: if overlay originally had
      // lights array, trust it; if we only have migrated flat + native,
      // merge extras.
    }
    // Always take env from overlay when provided
    return normalizeSettings({
      shadows: over.shadows,
      shadowStrength: over.shadowStrength,
      shadowRadius: over.shadowRadius,
      shadowBias: over.shadowBias,
      exposure: over.exposure,
      fog: over.fog,
      fogNear: over.fogNear,
      fogFar: over.fogFar,
      lights: Object.keys(byId).map(function (id) { return byId[id]; })
    });
  }

  function mergeWithNativeExtras(native, overlay, overlayWasLegacy) {
    var merged = mergeNativeWithOverlay(native, overlay);
    if (!overlayWasLegacy || !native) return merged;
    var ids = {};
    merged.lights.forEach(function (L) { ids[L.id] = true; });
    (native.lights || []).forEach(function (L) {
      if (!ids[L.id]) merged.lights.push(clone(L));
    });
    return merged;
  }

  function createThreeLight(entry) {
    var THREE = global.THREE;
    if (!THREE || !entry) return null;
    var light = null;
    if (entry.type === 'ambient') {
      light = new THREE.AmbientLight(entry.color || '#ffffff', entry.intensity);
    } else if (entry.type === 'hemisphere') {
      light = new THREE.HemisphereLight(
        entry.sky || '#ffffff',
        entry.ground || '#888888',
        entry.intensity
      );
    } else if (entry.type === 'directional') {
      light = new THREE.DirectionalLight(entry.color || '#ffffff', entry.intensity);
      light.castShadow = !!entry.castShadow;
      if (light.castShadow) {
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.camera.near = 2;
        light.shadow.camera.far = 80;
        light.shadow.camera.left = -20;
        light.shadow.camera.right = 20;
        light.shadow.camera.top = 20;
        light.shadow.camera.bottom = -20;
        light.shadow.normalBias = 0.02;
      }
    } else if (entry.type === 'point') {
      light = new THREE.PointLight(
        entry.color || '#ffffff',
        entry.intensity,
        typeof entry.distance === 'number' ? entry.distance : 0
      );
    } else if (entry.type === 'spot') {
      light = new THREE.SpotLight(
        entry.color || '#ffffff',
        entry.intensity,
        typeof entry.distance === 'number' ? entry.distance : 0,
        typeof entry.angle === 'number' ? entry.angle : Math.PI / 6,
        typeof entry.penumbra === 'number' ? entry.penumbra : 0.2
      );
      light.castShadow = !!entry.castShadow;
      if (light.castShadow) {
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.normalBias = 0.02;
      }
    }
    if (light) {
      light.userData.kpfLightId = entry.id;
      light.name = entry.name || entry.id;
    }
    return light;
  }

  function updateThreeLight(light, entry, scene, env) {
    if (!light || !entry) return;
    light.intensity = entry.intensity;
    if (entry.type === 'ambient') {
      if (entry.color) light.color.set(entry.color);
    } else if (entry.type === 'hemisphere') {
      if (entry.sky) light.color.set(entry.sky);
      if (entry.ground) light.groundColor.set(entry.ground);
    } else if (entry.type === 'directional' || entry.type === 'point' || entry.type === 'spot') {
      if (entry.color) light.color.set(entry.color);
      if (entry.position) {
        light.position.set(entry.position[0], entry.position[1], entry.position[2]);
      }
      if (entry.type === 'point' && typeof entry.distance === 'number') {
        light.distance = entry.distance;
      }
      if (entry.type === 'spot') {
        if (typeof entry.angle === 'number') light.angle = entry.angle;
        if (typeof entry.distance === 'number') light.distance = entry.distance;
        if (typeof entry.penumbra === 'number') light.penumbra = entry.penumbra;
      }
      if (entry.type === 'directional' || entry.type === 'spot') {
        light.castShadow = !!entry.castShadow;
        applyLookRotation(light, entry.rotation || [0, 0, 0], scene);
      }
      if (light.castShadow && light.shadow && env) {
        light.shadow.radius = env.shadowRadius;
        light.shadow.bias = env.shadowBias;
      }
    }
    light.userData.kpfLightId = entry.id;
  }

  function disposeLight(light, scene) {
    if (!light) return;
    if (light.target && light.target.parent) {
      light.target.parent.remove(light.target);
    }
    if (light.parent) light.parent.remove(light);
    else if (scene) scene.remove(light);
  }

  function applyTo(runner, settings) {
    if (!runner || !runner.scene || !settings) return;
    var THREE = global.THREE;
    if (!THREE) return;

    var s = normalizeSettings(migrateLegacy(settings));
    var scene = runner.scene;
    var prevMap = runner.lights || {};
    var nextMap = {};

    // Index existing by kpfLightId and by previous map key
    var existingById = {};
    Object.keys(prevMap).forEach(function (key) {
      var L = prevMap[key];
      if (!L) return;
      var id = (L.userData && L.userData.kpfLightId) || key;
      existingById[id] = L;
      L.userData.kpfLightId = id;
    });
    // Also pick up tagged lights still in the scene
    scene.traverse(function (obj) {
      if (obj.isLight && obj.userData && obj.userData.kpfLightId) {
        existingById[obj.userData.kpfLightId] = obj;
      }
    });

    var keep = {};
    s.lights.forEach(function (entry) {
      var existing = existingById[entry.id];
      var sameType = existing && lightTypeOfObject(existing) === entry.type;
      var light = sameType ? existing : createThreeLight(entry);
      if (!light) return;
      if (!sameType) {
        disposeLight(existing, scene);
        scene.add(light);
        if ((entry.type === 'directional' || entry.type === 'spot') && light.target) {
          scene.add(light.target);
        }
      }
      updateThreeLight(light, entry, scene, s);
      nextMap[entry.id] = light;
      keep[entry.id] = true;
    });

    Object.keys(existingById).forEach(function (id) {
      if (!keep[id]) disposeLight(existingById[id], scene);
    });

    runner.lights = nextMap;

    // Alias legacy slot names when present so older code paths keep working
    if (nextMap.ambient) runner.lights.ambient = nextMap.ambient;
    if (nextMap.hemi) runner.lights.hemi = nextMap.hemi;
    if (nextMap.key) runner.lights.key = nextMap.key;
    if (nextMap.fill) runner.lights.fill = nextMap.fill;
    if (nextMap.rim) runner.lights.rim = nextMap.rim;
    if (nextMap.underGlow) runner.lights.underGlow = nextMap.underGlow;

    var needsRecompile = false;
    if (runner.renderer) {
      if (runner.renderer.shadowMap.enabled !== !!s.shadows) {
        runner.renderer.shadowMap.enabled = !!s.shadows;
        needsRecompile = true;
      }
      if (typeof runner.renderer.toneMappingExposure === 'number') {
        runner.renderer.toneMappingExposure = s.exposure;
      }
    }

    if (_opts && typeof _opts.applyShadowStrength === 'function') {
      _opts.applyShadowStrength(runner, s.shadowStrength);
    }

    if (runner.scene) {
      var hadFog = !!runner.scene.fog;
      if (s.fog && runner.baseFog) {
        runner.scene.fog = runner.baseFog;
        runner.scene.fog.near = s.fogNear;
        runner.scene.fog.far = s.fogFar;
      } else if (!s.fog) {
        runner.scene.fog = null;
      }
      if (hadFog !== !!runner.scene.fog) needsRecompile = true;
    }

    if (needsRecompile && runner.scene) {
      runner.scene.traverse(function (obj) {
        if (!obj.material) return;
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) { m.needsUpdate = true; });
      });
    }
  }

  function fieldPairs(runner, s) {
    s = normalizeSettings(migrateLegacy(s || {}));
    var map = (runner && runner.lights) || {};
    var pairs = {};
    (s.lights || []).forEach(function (entry) {
      var L = map[entry.id];
      if (!L) return;
      var prefix = entry.id;
      pairs[prefix + '.intensity'] = { expected: entry.intensity, actual: L.intensity };
      if (entry.type === 'ambient') {
        pairs[prefix + '.colour'] = { expected: entry.color, actual: colorToHex(L.color) };
      } else if (entry.type === 'hemisphere') {
        pairs[prefix + '.sky'] = { expected: entry.sky, actual: colorToHex(L.color) };
        pairs[prefix + '.ground'] = { expected: entry.ground, actual: colorToHex(L.groundColor) };
      } else {
        pairs[prefix + '.colour'] = { expected: entry.color, actual: colorToHex(L.color) };
        if (entry.position) {
          pairs[prefix + '.x'] = { expected: entry.position[0], actual: L.position.x };
          pairs[prefix + '.y'] = { expected: entry.position[1], actual: L.position.y };
          pairs[prefix + '.z'] = { expected: entry.position[2], actual: L.position.z };
        }
      }
    });
    if (typeof s.shadowStrength === 'number' && runner && runner.scene) {
      var patched = [];
      runner.scene.traverse(function (obj) {
        if (!obj.material) return;
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) {
          if (m && m.userData && typeof m.userData.kpfShadowStrength === 'number' &&
              patched.indexOf(m) === -1) {
            patched.push(m);
          }
        });
      });
      if (patched.length) {
        var consistent = patched.every(function (m) {
          return Math.abs(m.userData.kpfShadowStrength - s.shadowStrength) < 0.01;
        });
        pairs.shadowStrength = {
          expected: s.shadowStrength,
          actual: consistent ? s.shadowStrength : NaN
        };
      }
    }
    return pairs;
  }

  // ---------- UI ----------

  function ensureDom() {
    if (_root) return;
    var host = document.getElementById('lightEditorOverlay');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lightEditorOverlay';
      document.body.appendChild(host);
    }
    host.innerHTML =
      '<div class="light-editor-panel">' +
        '<div class="light-editor-header">' +
          '<span class="light-editor-title">Light Editor</span>' +
          '<button type="button" class="light-editor-close" id="lightEditorClose" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="light-editor-empty" id="lightEditorEmpty">No 3D scene active.</div>' +
        '<div class="light-editor-body" id="lightEditorBody">' +
          '<div class="light-editor-hierarchy">' +
            '<div class="light-editor-section-label">Hierarchy</div>' +
            '<div class="light-editor-list" id="lightEditorList"></div>' +
            '<div class="light-editor-hier-actions">' +
              '<select id="lightEditorAddType" title="Add light type">' +
                '<option value="directional">Directional</option>' +
                '<option value="point">Point</option>' +
                '<option value="spot">Spot</option>' +
              '</select>' +
              '<button type="button" id="lightEditorAdd">Add</button>' +
              '<button type="button" id="lightEditorDelete">Delete</button>' +
            '</div>' +
          '</div>' +
          '<div class="light-editor-props">' +
            '<div class="light-editor-section-label">Properties</div>' +
            '<div class="light-editor-props-form" id="lightEditorProps"></div>' +
          '</div>' +
        '</div>' +
        '<div class="light-editor-footer">' +
          '<button type="button" id="lightEditorExport" title="Download light-overrides.js for the project">Export Defaults</button>' +
        '</div>' +
      '</div>';
    _root = host;
    _listEl = document.getElementById('lightEditorList');
    _propsEl = document.getElementById('lightEditorProps');
    _emptyEl = document.getElementById('lightEditorEmpty');

    document.getElementById('lightEditorClose').addEventListener('click', function () {
      close();
    });
    document.getElementById('lightEditorAdd').addEventListener('click', function () {
      var type = document.getElementById('lightEditorAddType').value;
      addLight(type);
    });
    document.getElementById('lightEditorDelete').addEventListener('click', function () {
      deleteSelected();
    });
    document.getElementById('lightEditorExport').addEventListener('click', function () {
      var btn = document.getElementById('lightEditorExport');
      var ok = false;
      if (_opts && typeof _opts.onExport === 'function') ok = !!_opts.onExport();
      if (!btn) return;
      var prev = btn.textContent;
      btn.textContent = ok ? 'Downloaded!' : 'Export failed';
      setTimeout(function () { btn.textContent = prev; }, 1400);
    });
  }

  function getRunner() {
    return _opts && typeof _opts.getRunner === 'function' ? _opts.getRunner() : null;
  }

  function notifyChange() {
    if (_opts && typeof _opts.onChange === 'function') {
      _opts.onChange(clone(_settings));
    }
  }

  function applyLive() {
    var runner = getRunner();
    if (runner && _settings) applyTo(runner, _settings);
    notifyChange();
  }

  function renderList() {
    if (!_listEl || !_settings) return;
    _listEl.innerHTML = '';

    var envBtn = document.createElement('button');
    envBtn.type = 'button';
    envBtn.className = 'light-editor-item' + (_selectedId === ENV_ID ? ' selected' : '');
    envBtn.textContent = 'Environment';
    envBtn.addEventListener('click', function () {
      _selectedId = ENV_ID;
      renderList();
      renderProps();
    });
    _listEl.appendChild(envBtn);

    _settings.lights.forEach(function (L) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'light-editor-item' + (_selectedId === L.id ? ' selected' : '');
      btn.textContent = (L.name || L.id) + ' (' + L.type + ')';
      btn.addEventListener('click', function () {
        _selectedId = L.id;
        renderList();
        renderProps();
      });
      _listEl.appendChild(btn);
    });
  }

  function numInput(label, value, min, max, step, onInput) {
    var wrap = document.createElement('label');
    wrap.className = 'light-editor-field';
    wrap.appendChild(document.createTextNode(label + ' '));
    var input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    var val = document.createElement('span');
    val.className = 'light-editor-val';
    val.textContent = formatNum(value);
    input.addEventListener('input', function () {
      var n = parseFloat(input.value);
      val.textContent = formatNum(n);
      onInput(n);
    });
    wrap.appendChild(input);
    wrap.appendChild(val);
    return wrap;
  }

  function formatNum(n) {
    if (!isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 100) return n.toFixed(0);
    if (a >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }

  function colorInput(label, value, onInput) {
    var wrap = document.createElement('label');
    wrap.className = 'light-editor-field';
    wrap.appendChild(document.createTextNode(label + ' '));
    var input = document.createElement('input');
    input.type = 'color';
    input.value = value || '#ffffff';
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function checkboxInput(label, checked, onInput) {
    var wrap = document.createElement('label');
    wrap.className = 'light-editor-field inline';
    wrap.appendChild(document.createTextNode(label + ' '));
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.addEventListener('change', function () { onInput(input.checked); });
    wrap.appendChild(input);
    return wrap;
  }

  function findLight(id) {
    if (!_settings) return null;
    for (var i = 0; i < _settings.lights.length; i++) {
      if (_settings.lights[i].id === id) return _settings.lights[i];
    }
    return null;
  }

  function renderProps() {
    if (!_propsEl || !_settings) return;
    _propsEl.innerHTML = '';

    if (_selectedId === ENV_ID) {
      _propsEl.appendChild(checkboxInput('Shadows', _settings.shadows, function (v) {
        _settings.shadows = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Strength', _settings.shadowStrength, 0, 2, 0.01, function (v) {
        _settings.shadowStrength = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Softness', _settings.shadowRadius, 0, 16, 0.5, function (v) {
        _settings.shadowRadius = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Bias', _settings.shadowBias, -0.005, 0.001, 0.0001, function (v) {
        _settings.shadowBias = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Exposure', _settings.exposure, 0.1, 3, 0.01, function (v) {
        _settings.exposure = v; applyLive();
      }));
      _propsEl.appendChild(checkboxInput('Fog', _settings.fog, function (v) {
        _settings.fog = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Fog Near', _settings.fogNear, 0, 400, 1, function (v) {
        _settings.fogNear = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Fog Far', _settings.fogFar, 10, 1200, 5, function (v) {
        _settings.fogFar = v; applyLive();
      }));
      return;
    }

    var L = findLight(_selectedId);
    if (!L) {
      _propsEl.textContent = 'Select a light.';
      return;
    }

    // Type
    var typeWrap = document.createElement('label');
    typeWrap.className = 'light-editor-field';
    typeWrap.appendChild(document.createTextNode('Type '));
    var typeSel = document.createElement('select');
    if (L.type === 'ambient' || L.type === 'hemisphere') {
      var opt = document.createElement('option');
      opt.value = L.type;
      opt.textContent = L.type;
      typeSel.appendChild(opt);
      typeSel.disabled = true;
    } else {
      ADDABLE_TYPES.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        if (t === L.type) o.selected = true;
        typeSel.appendChild(o);
      });
      typeSel.addEventListener('change', function () {
        convertLightType(L, typeSel.value);
      });
    }
    typeWrap.appendChild(typeSel);
    _propsEl.appendChild(typeWrap);

    _propsEl.appendChild(numInput('Intensity', L.intensity, 0, 4, 0.01, function (v) {
      L.intensity = v; applyLive();
    }));

    if (L.type === 'hemisphere') {
      _propsEl.appendChild(colorInput('Sky', L.sky, function (v) {
        L.sky = v; applyLive();
      }));
      _propsEl.appendChild(colorInput('Ground', L.ground, function (v) {
        L.ground = v; applyLive();
      }));
    } else if (L.type !== 'ambient') {
      _propsEl.appendChild(colorInput('Colour', L.color, function (v) {
        L.color = v; applyLive();
      }));
    } else {
      _propsEl.appendChild(colorInput('Colour', L.color, function (v) {
        L.color = v; applyLive();
      }));
    }

    if (L.type === 'directional' || L.type === 'point' || L.type === 'spot') {
      if (!L.position) L.position = [0, 10, 0];
      _propsEl.appendChild(numInput('Pos X', L.position[0], -60, 60, 0.5, function (v) {
        L.position[0] = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Pos Y', L.position[1], -60, 60, 0.5, function (v) {
        L.position[1] = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Pos Z', L.position[2], -60, 60, 0.5, function (v) {
        L.position[2] = v; applyLive();
      }));
    }

    if (L.type === 'directional' || L.type === 'spot') {
      if (!L.rotation) L.rotation = [0, 0, 0];
      _propsEl.appendChild(numInput('Rot X', L.rotation[0], -3.14, 3.14, 0.01, function (v) {
        L.rotation[0] = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Rot Y', L.rotation[1], -3.14, 3.14, 0.01, function (v) {
        L.rotation[1] = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Rot Z', L.rotation[2], -3.14, 3.14, 0.01, function (v) {
        L.rotation[2] = v; applyLive();
      }));
      _propsEl.appendChild(checkboxInput('Cast Shadow', L.castShadow, function (v) {
        L.castShadow = v; applyLive();
      }));
    }

    if (L.type === 'point') {
      _propsEl.appendChild(numInput('Radius', typeof L.distance === 'number' ? L.distance : 0, 0, 200, 1, function (v) {
        L.distance = v; applyLive();
      }));
    }
    if (L.type === 'spot') {
      var deg = ((typeof L.angle === 'number' ? L.angle : Math.PI / 6) * 180) / Math.PI;
      _propsEl.appendChild(numInput('Radius', deg, 1, 90, 1, function (v) {
        L.angle = (v * Math.PI) / 180; applyLive();
      }));
      _propsEl.appendChild(numInput('Distance', typeof L.distance === 'number' ? L.distance : 0, 0, 200, 1, function (v) {
        L.distance = v; applyLive();
      }));
      _propsEl.appendChild(numInput('Penumbra', typeof L.penumbra === 'number' ? L.penumbra : 0, 0, 1, 0.01, function (v) {
        L.penumbra = v; applyLive();
      }));
    }
  }

  function convertLightType(entry, newType) {
    if (!CONVERTIBLE[entry.type] || !CONVERTIBLE[newType] || entry.type === newType) return;
    entry.type = newType;
    if (newType === 'point') {
      delete entry.rotation;
      delete entry.castShadow;
      delete entry.angle;
      delete entry.penumbra;
      if (typeof entry.distance !== 'number') entry.distance = 0;
    } else if (newType === 'directional') {
      if (!entry.rotation) entry.rotation = [-0.8, 0.3, 0];
      if (entry.castShadow === undefined) entry.castShadow = false;
      delete entry.angle;
      delete entry.penumbra;
      delete entry.distance;
    } else if (newType === 'spot') {
      if (!entry.rotation) entry.rotation = [-0.8, 0.3, 0];
      if (typeof entry.angle !== 'number') entry.angle = Math.PI / 6;
      if (typeof entry.distance !== 'number') entry.distance = 40;
      if (typeof entry.penumbra !== 'number') entry.penumbra = 0.2;
      if (entry.castShadow === undefined) entry.castShadow = false;
    }
    applyLive();
    renderList();
    renderProps();
  }

  function addLight(type) {
    if (!_settings) return;
    if (ADDABLE_TYPES.indexOf(type) === -1) type = 'directional';
    var id = type + '-' + (_idSeq++);
    var entry = {
      id: id,
      name: titleCase(type) + ' ' + _idSeq,
      type: type,
      intensity: type === 'directional' ? 0.4 : 1,
      color: '#ffffff',
      position: [8, 16, 10]
    };
    if (type === 'directional') {
      entry.rotation = [-0.9, 0.4, 0];
      entry.castShadow = false;
    } else if (type === 'point') {
      entry.distance = 40;
    } else if (type === 'spot') {
      entry.rotation = [-0.9, 0.4, 0];
      entry.angle = Math.PI / 6;
      entry.distance = 50;
      entry.penumbra = 0.25;
      entry.castShadow = false;
    }
    _settings.lights.push(entry);
    _selectedId = id;
    applyLive();
    renderList();
    renderProps();
  }

  function deleteSelected() {
    if (!_settings || _selectedId === ENV_ID) return;
    var idx = -1;
    for (var i = 0; i < _settings.lights.length; i++) {
      if (_settings.lights[i].id === _selectedId) { idx = i; break; }
    }
    if (idx < 0) return;
    _settings.lights.splice(idx, 1);
    _selectedId = ENV_ID;
    applyLive();
    renderList();
    renderProps();
  }

  function refreshUi() {
    ensureDom();
    var runner = getRunner();
    var ok = !!(runner && runner.tier === '3d');
    var body = document.getElementById('lightEditorBody');
    if (_emptyEl) _emptyEl.style.display = ok ? 'none' : 'block';
    if (body) body.style.display = ok ? 'flex' : 'none';
    if (!ok) return;
    if (!_settings) {
      _settings = captureFrom(runner);
    }
    renderList();
    renderProps();
  }

  function open() {
    ensureDom();
    _open = true;
    _root.classList.add('open');
    if (_opts && typeof _opts.onOpen === 'function') _opts.onOpen();
    // Prefer syncing from module settings already held by host; else capture
    var runner = getRunner();
    if (runner && runner.tier === '3d' && !_settings) {
      _settings = captureFrom(runner);
    }
    refreshUi();
  }

  function close() {
    _open = false;
    if (_root) _root.classList.remove('open');
    if (_opts && typeof _opts.onClose === 'function') _opts.onClose();
  }

  function isOpen() {
    return _open;
  }

  function getSettings() {
    return _settings ? clone(_settings) : null;
  }

  function setSettings(s) {
    _settings = s ? normalizeSettings(migrateLegacy(s)) : null;
    if (_open) refreshUi();
  }

  function syncFromRunner(runner) {
    _settings = captureFrom(runner);
    if (_open) refreshUi();
    return clone(_settings);
  }

  function init(opts) {
    _opts = opts || {};
    ensureDom();
  }

  global.KPFLightEditor = {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    captureFrom: captureFrom,
    applyTo: applyTo,
    migrateLegacy: migrateLegacy,
    isLegacyLights: isLegacyLights,
    isNewLights: isNewLights,
    normalizeSettings: normalizeSettings,
    mergeNativeWithOverlay: mergeNativeWithOverlay,
    mergeWithNativeExtras: mergeWithNativeExtras,
    getSettings: getSettings,
    setSettings: setSettings,
    syncFromRunner: syncFromRunner,
    fieldPairs: fieldPairs,
    emptySettings: emptySettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
