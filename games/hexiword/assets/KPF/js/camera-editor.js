(function (global) {
  'use strict';

  // Compact camera debug editor: orbit sliders, free-cam (WASD / drag / scroll),
  // and snap-to-grid for position / rotation.

  var _opts = null;
  var _settings = null;
  var _open = false;
  var _root = null;
  var _bodyEl = null;
  var _emptyEl = null;
  var _freeCam = false;
  var _snapGrid = 1;
  var _keys = Object.create(null);
  var _dragging = false;
  var _lastPtr = null;
  var _raf = 0;
  var _lastTs = 0;
  var _yaw = 0;
  var _pitch = 0;
  var _freeTarget = null;
  var _sliderSyncAt = 0;
  var _notifyAt = 0;
  var _gizmo = null;
  var _gizmoRunner = null;
  var _gizmoDragging = false;
  var _gizmoPlaneY = 0;
  var _gizmoOffset = null;
  var _boundKeyDown = null;
  var _boundKeyUp = null;
  var _boundBlur = null;
  var _boundPtrDown = null;
  var _boundPtrMove = null;
  var _boundPtrUp = null;
  var _boundWheel = null;

  var MOVE_SPEED = 12;
  var LOOK_SENS = 0.005;
  var ZOOM_SPEED = 0.08;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function defaultSettings() {
    return {
      rotX: 0.35,
      rotY: 0,
      dist: 18,
      height: 6.5,
      fov: 32,
      panX: 0,
      panY: 0
    };
  }

  function normalizeSettings(s) {
    var d = defaultSettings();
    if (!s) return d;
    return {
      rotX: typeof s.rotX === 'number' ? s.rotX : d.rotX,
      rotY: typeof s.rotY === 'number' ? s.rotY : d.rotY,
      dist: typeof s.dist === 'number' ? s.dist : d.dist,
      height: typeof s.height === 'number' ? s.height : d.height,
      fov: typeof s.fov === 'number' ? s.fov : d.fov,
      panX: typeof s.panX === 'number' ? s.panX : d.panX,
      panY: typeof s.panY === 'number' ? s.panY : d.panY
    };
  }

  function getRunner() {
    return _opts && typeof _opts.getRunner === 'function' ? _opts.getRunner() : null;
  }

  function orbitTargetY() {
    return _opts && typeof _opts.orbitTargetY === 'number' ? _opts.orbitTargetY : -0.5;
  }

  function applyOrbitTo(runner, s) {
    if (!runner || !runner.camera || !s) return;
    var cam = runner.camera;
    var panRight = { x: Math.cos(s.rotY), z: -Math.sin(s.rotY) };
    var target = {
      x: panRight.x * s.panX,
      y: orbitTargetY() + s.panY,
      z: panRight.z * s.panX
    };
    cam.position.set(
      target.x + Math.sin(s.rotY) * s.dist,
      target.y + s.height,
      target.z + Math.cos(s.rotY) * s.dist
    );
    if (cam.isPerspectiveCamera && typeof s.fov === 'number') {
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(target.x, target.y, target.z);
    cam.rotateX(s.rotX - 0.35);
  }

  function captureFrom(runner) {
    var cam = runner && runner.camera;
    if (!cam) return defaultSettings();
    var dx = cam.position.x;
    var dz = cam.position.z;
    return normalizeSettings({
      rotX: (_settings && typeof _settings.rotX === 'number') ? _settings.rotX : 0.35,
      rotY: Math.atan2(dx, dz),
      dist: Math.sqrt(dx * dx + dz * dz) || 18,
      height: cam.position.y - orbitTargetY() - ((_settings && _settings.panY) || 0),
      fov: cam.isPerspectiveCamera ? cam.fov : 32,
      panX: (_settings && typeof _settings.panX === 'number') ? _settings.panX : 0,
      panY: (_settings && typeof _settings.panY === 'number') ? _settings.panY : 0
    });
  }

  function orbitTargetFromSettings(s) {
    s = s || _settings || defaultSettings();
    var panRight = { x: Math.cos(s.rotY), z: -Math.sin(s.rotY) };
    return {
      x: panRight.x * s.panX,
      y: orbitTargetY() + s.panY,
      z: panRight.z * s.panX
    };
  }

  function settingsFromWorldTarget(target, s) {
    s = normalizeSettings(s || _settings || defaultSettings());
    var rotY = s.rotY;
    var panRightX = Math.cos(rotY);
    var panRightZ = -Math.sin(rotY);
    s.panX = target.x * panRightX + target.z * panRightZ;
    s.panY = target.y - orbitTargetY();
    return s;
  }

  function hideTargetGizmo() {
    detachGizmoDrag();
    if (_gizmo && _gizmo.parent) _gizmo.parent.remove(_gizmo);
    if (_gizmo) {
      _gizmo.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(function (m) { if (m && m.dispose) m.dispose(); });
          } else if (obj.material.dispose) {
            obj.material.dispose();
          }
        }
      });
    }
    _gizmo = null;
    _gizmoRunner = null;
  }

  function makeAxis(THREE, axis, color, len) {
    var geo = new THREE.BufferGeometry();
    var end = [0, 0, 0];
    if (axis === 'x') end[0] = len;
    if (axis === 'y') end[1] = len;
    if (axis === 'z') end[2] = len;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, end[0], end[1], end[2]], 3));
    var mat = new THREE.LineBasicMaterial({
      color: color,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    var line = new THREE.Line(geo, mat);
    line.renderOrder = 999;
    line.userData.kpfCameraGizmo = true;
    return line;
  }

  function ensureTargetGizmo(runner) {
    var THREE = global.THREE;
    if (!THREE || !runner || !runner.scene || runner.tier !== '3d') {
      hideTargetGizmo();
      return;
    }
    if (_gizmo && _gizmoRunner === runner && _gizmo.parent === runner.scene) {
      updateTargetGizmo();
      return;
    }
    hideTargetGizmo();

    var group = new THREE.Group();
    group.name = 'KPFCameraOrbitTarget';
    group.userData.kpfCameraGizmo = true;

    var axisLen = 2.4;
    group.add(makeAxis(THREE, 'x', 0xff4d4d, axisLen));
    group.add(makeAxis(THREE, 'y', 0x4dff88, axisLen));
    group.add(makeAxis(THREE, 'z', 0x4d9bff, axisLen));

    var handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      })
    );
    handle.renderOrder = 1000;
    handle.userData.kpfCameraGizmo = true;
    handle.userData.kpfCameraGizmoHandle = true;
    group.add(handle);

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 999;
    ring.userData.kpfCameraGizmo = true;
    group.add(ring);

    // Camera → target guide line (updated each frame)
    var linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
    var link = new THREE.Line(linkGeo, new THREE.LineBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      transparent: true,
      opacity: 0.35
    }));
    link.renderOrder = 998;
    link.userData.kpfCameraGizmo = true;
    link.userData.kpfCameraGizmoLink = true;
    group.add(link);

    runner.scene.add(group);
    _gizmo = group;
    _gizmoRunner = runner;
    attachGizmoDrag();
    updateTargetGizmo();
  }

  function updateTargetGizmo() {
    if (!_gizmo || !_settings) return;
    var runner = getRunner();
    var t = orbitTargetFromSettings(_settings);
    _gizmo.position.set(t.x, t.y, t.z);

    // Scale with distance so the widget stays readable
    var scale = Math.max(0.6, Math.min(3.5, (_settings.dist || 18) * 0.045));
    _gizmo.scale.setScalar(scale);

    var link = null;
    _gizmo.children.forEach(function (c) {
      if (c.userData && c.userData.kpfCameraGizmoLink) link = c;
    });
    if (link && runner && runner.camera && link.geometry) {
      var pos = link.geometry.attributes.position;
      // Line is in gizmo local space: from camera relative to target → origin
      pos.setXYZ(0, (runner.camera.position.x - t.x) / scale, (runner.camera.position.y - t.y) / scale, (runner.camera.position.z - t.z) / scale);
      pos.setXYZ(1, 0, 0, 0);
      pos.needsUpdate = true;
    }
  }

  function detachGizmoDrag() {
    var canvas = getCanvas();
    if (canvas && _boundGizmoDown) {
      canvas.removeEventListener('pointerdown', _boundGizmoDown);
    }
    window.removeEventListener('pointermove', _boundGizmoMove);
    window.removeEventListener('pointerup', _boundGizmoUp);
    window.removeEventListener('pointercancel', _boundGizmoUp);
    _gizmoDragging = false;
  }

  var _boundGizmoDown = null;
  var _boundGizmoMove = null;
  var _boundGizmoUp = null;
  var _raycaster = null;

  function attachGizmoDrag() {
    detachGizmoDrag();
    var THREE = global.THREE;
    if (!THREE) return;
    if (!_raycaster) _raycaster = new THREE.Raycaster();

    _boundGizmoDown = function (e) {
      if (!_open || !_gizmo || e.button !== 0) return;
      if (_freeCam) return;
      if (_root && _root.contains(e.target)) return;
      var runner = getRunner();
      var canvas = getCanvas();
      if (!runner || !runner.camera || !canvas) return;

      var rect = canvas.getBoundingClientRect();
      var ndc = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1
      };
      _raycaster.setFromCamera(ndc, runner.camera);
      var hits = _raycaster.intersectObject(_gizmo, true);
      var hitHandle = null;
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].object && hits[i].object.userData && hits[i].object.userData.kpfCameraGizmoHandle) {
          hitHandle = hits[i];
          break;
        }
      }
      if (!hitHandle) return;

      _gizmoDragging = true;
      _gizmoPlaneY = _gizmo.position.y;
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -_gizmoPlaneY);
      var pt = new THREE.Vector3();
      _raycaster.ray.intersectPlane(plane, pt);
      _gizmoOffset = pt ? pt.clone().sub(_gizmo.position) : new THREE.Vector3();
      e.preventDefault();
      e.stopPropagation();
    };

    _boundGizmoMove = function (e) {
      if (!_gizmoDragging || !_gizmo || !_settings) return;
      var runner = getRunner();
      var canvas = getCanvas();
      var THREE = global.THREE;
      if (!runner || !runner.camera || !canvas || !THREE) return;

      var rect = canvas.getBoundingClientRect();
      var ndc = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1
      };
      _raycaster.setFromCamera(ndc, runner.camera);
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -_gizmoPlaneY);
      var pt = new THREE.Vector3();
      if (!_raycaster.ray.intersectPlane(plane, pt)) return;
      if (_gizmoOffset) pt.sub(_gizmoOffset);
      // Keep Y on the orbit target's current height; horizontal drag pans XZ
      var next = { x: pt.x, y: _gizmoPlaneY, z: pt.z };
      _settings = settingsFromWorldTarget(next, _settings);
      applyOrbitTo(runner, _settings);
      syncSlidersFromSettings();
      updateTargetGizmo();
      notifyChange();
    };

    _boundGizmoUp = function () {
      if (_gizmoDragging) {
        _gizmoDragging = false;
        notifyChange();
      }
    };

    var canvas = getCanvas();
    if (canvas) canvas.addEventListener('pointerdown', _boundGizmoDown);
    window.addEventListener('pointermove', _boundGizmoMove);
    window.addEventListener('pointerup', _boundGizmoUp);
    window.addEventListener('pointercancel', _boundGizmoUp);
  }

  // Encode the live camera into orbit settings that applyOrbitTo round-trips.
  // Pick a look-at target on the view ray that also lies in the orbit pan
  // subspace, then solve dist / height / rotY / pan from that pair.
  function captureOrbitFromLiveCamera(runner) {
    var THREE = global.THREE;
    var cam = runner && runner.camera;
    if (!cam || !THREE) return captureFrom(runner);

    var forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    else forward.normalize();

    var cx = cam.position.x;
    var cy = cam.position.y;
    var cz = cam.position.z;
    var fx = forward.x;
    var fy = forward.y;
    var fz = forward.z;
    var l2 = fx * fx + fz * fz;

    var target;
    if (l2 < 1e-6) {
      // Looking almost straight up/down — fall back to prior orbit target.
      var fallback = _freeTarget || orbitTargetFromSettings(_settings);
      target = new THREE.Vector3(fallback.x, fallback.y, fallback.z);
    } else {
      // t puts the target on the look ray and in the orbit pan plane.
      var t = -(cx * fx + cz * fz) / l2;
      if (t < 1) t = Math.max(2, (_settings && _settings.dist) || 18);
      target = new THREE.Vector3(cx + fx * t, cy + fy * t, cz + fz * t);
    }

    var dx = cx - target.x;
    var dy = cy - target.y;
    var dz = cz - target.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) dist = 0.001;
    var rotY = Math.atan2(dx, dz);
    var panRightX = Math.cos(rotY);
    var panRightZ = -Math.sin(rotY);
    var panX = target.x * panRightX + target.z * panRightZ;
    var panY = target.y - orbitTargetY();

    // lookAt(target) matches the freecam view ray; keep tilt at the orbit baseline.
    return normalizeSettings({
      rotX: 0.35,
      rotY: rotY,
      dist: dist,
      height: dy,
      fov: cam.isPerspectiveCamera ? cam.fov : 32,
      panX: panX,
      panY: panY
    });
  }

  function syncSlidersFromSettings() {
    var form = document.getElementById('cameraEditorForm');
    if (!form || !_settings) return;
    var inputs = form.querySelectorAll('input[data-cam-key]');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var key = input.getAttribute('data-cam-key');
      if (!_settings.hasOwnProperty(key)) continue;
      var n = _settings[key];
      if (!isFinite(n)) continue;
      var min = parseFloat(input.min);
      var max = parseFloat(input.max);
      if (n < min) input.min = String(Math.floor(n - 10));
      if (n > max) input.max = String(Math.ceil(n + 10));
      if (String(input.value) !== String(n)) input.value = String(n);
      var val = input.parentNode && input.parentNode.querySelector('.camera-editor-val');
      if (val) val.textContent = formatNum(n);
    }
  }

  function syncFreeCamToSliders(force) {
    if (!_freeCam) return;
    var runner = getRunner();
    if (!runner || !runner.camera) return;
    var now = performance.now();
    if (!force && now - _sliderSyncAt < 33) return;
    _sliderSyncAt = now;
    _settings = captureOrbitFromLiveCamera(runner);
    syncSlidersFromSettings();
    updateTargetGizmo();
    if (force || now - _notifyAt > 150) {
      _notifyAt = now;
      notifyChange();
    }
  }

  function notifyChange() {
    if (_opts && typeof _opts.onChange === 'function') {
      _opts.onChange(clone(_settings));
    }
  }

  function applyLive() {
    if (_freeCam) return;
    var runner = getRunner();
    if (runner && _settings) applyOrbitTo(runner, _settings);
    updateTargetGizmo();
    notifyChange();
  }

  function snapValue(v, grid) {
    if (!grid || grid <= 0) return v;
    return Math.round(v / grid) * grid;
  }

  function syncYawPitchFromCamera(cam) {
    var THREE = global.THREE;
    if (!THREE || !cam) return;
    var euler = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    _yaw = euler.y;
    _pitch = euler.x;
  }

  function applyFreeLook(cam) {
    var THREE = global.THREE;
    if (!THREE || !cam) return;
    var maxPitch = Math.PI / 2 - 0.05;
    if (_pitch > maxPitch) _pitch = maxPitch;
    if (_pitch < -maxPitch) _pitch = -maxPitch;
    cam.quaternion.setFromEuler(new THREE.Euler(_pitch, _yaw, 0, 'YXZ'));
  }

  function getCanvas() {
    var runner = getRunner();
    if (runner && runner.renderer && runner.renderer.domElement) {
      return runner.renderer.domElement;
    }
    return null;
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || el.isContentEditable) return true;
    if (tag === 'select') return true;
    if (tag !== 'input') return false;
    var type = (el.type || 'text').toLowerCase();
    // Range / checkbox / button focus must not block WASD free-cam.
    return type === 'text' || type === 'search' || type === 'number' ||
      type === 'password' || type === 'email' || type === 'url' || type === '';
  }

  function stopFreeCamLoop() {
    if (_raf) {
      cancelAnimationFrame(_raf);
      _raf = 0;
    }
    _lastTs = 0;
  }

  function freeCamTick(ts) {
    if (!_freeCam || !_open) {
      stopFreeCamLoop();
      return;
    }
    var runner = getRunner();
    var cam = runner && runner.camera;
    if (!cam) {
      _raf = requestAnimationFrame(freeCamTick);
      return;
    }
    var dt = _lastTs ? Math.min(0.05, (ts - _lastTs) / 1000) : 0;
    _lastTs = ts;

    if (dt > 0) {
      var THREE = global.THREE;
      var forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      forward.y = 0;
      if (forward.lengthSq() > 1e-6) forward.normalize();
      var right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      right.y = 0;
      if (right.lengthSq() > 1e-6) right.normalize();
      var up = new THREE.Vector3(0, 1, 0);
      var speed = MOVE_SPEED * ((_keys.ShiftLeft || _keys.ShiftRight) ? 2.5 : 1);
      var move = new THREE.Vector3();
      if (_keys.KeyW || _keys.ArrowUp) move.add(forward);
      if (_keys.KeyS || _keys.ArrowDown) move.sub(forward);
      if (_keys.KeyD || _keys.ArrowRight) move.add(right);
      if (_keys.KeyA || _keys.ArrowLeft) move.sub(right);
      if (_keys.KeyE || _keys.Space) move.add(up);
      if (_keys.KeyQ || _keys.ControlLeft || _keys.ControlRight) move.sub(up);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        cam.position.add(move);
      }
    }

    syncFreeCamToSliders(false);
    _raf = requestAnimationFrame(freeCamTick);
  }

  function detachFreeCamListeners() {
    window.removeEventListener('keydown', _boundKeyDown, true);
    window.removeEventListener('keyup', _boundKeyUp, true);
    window.removeEventListener('blur', _boundBlur);
    var canvas = getCanvas();
    if (canvas) {
      canvas.removeEventListener('pointerdown', _boundPtrDown);
      canvas.removeEventListener('wheel', _boundWheel);
    }
    window.removeEventListener('pointermove', _boundPtrMove);
    window.removeEventListener('pointerup', _boundPtrUp);
    window.removeEventListener('pointercancel', _boundPtrUp);
    _keys = Object.create(null);
    _dragging = false;
    _lastPtr = null;
  }

  function attachFreeCamListeners() {
    detachFreeCamListeners();

    _boundKeyDown = function (e) {
      if (!_freeCam || !_open) return;
      // Only ignore real text fields — the Free Cam button keeps focus after
      // click, so we must still accept WASD while the panel is focused.
      if (isTypingTarget(e.target)) return;
      _keys[e.code] = true;
      if (/^(Key[WASDQE]|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space|ShiftLeft|ShiftRight)$/.test(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    _boundKeyUp = function (e) {
      if (!_freeCam || !_open) return;
      _keys[e.code] = false;
    };
    _boundBlur = function () {
      _keys = Object.create(null);
      _dragging = false;
    };
    _boundPtrDown = function (e) {
      if (!_freeCam || !_open || e.button !== 0) return;
      if (_root && _root.contains(e.target)) return;
      _dragging = true;
      _lastPtr = { x: e.clientX, y: e.clientY };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    };
    _boundPtrMove = function (e) {
      if (!_dragging || !_freeCam) return;
      var runner = getRunner();
      var cam = runner && runner.camera;
      if (!cam || !_lastPtr) return;
      var dx = e.clientX - _lastPtr.x;
      var dy = e.clientY - _lastPtr.y;
      _lastPtr = { x: e.clientX, y: e.clientY };
      _yaw -= dx * LOOK_SENS;
      _pitch -= dy * LOOK_SENS;
      applyFreeLook(cam);
      syncFreeCamToSliders(false);
    };
    _boundPtrUp = function () {
      _dragging = false;
      _lastPtr = null;
      syncFreeCamToSliders(true);
    };
    _boundWheel = function (e) {
      if (!_freeCam || !_open) return;
      if (_root && _root.contains(e.target)) return;
      var runner = getRunner();
      var cam = runner && runner.camera;
      var THREE = global.THREE;
      if (!cam || !THREE) return;
      e.preventDefault();
      var forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      var delta = -e.deltaY * ZOOM_SPEED * 0.05;
      if (e.deltaMode === 1) delta *= 16;
      cam.position.addScaledVector(forward, delta * 4);
      syncFreeCamToSliders(false);
    };

    window.addEventListener('keydown', _boundKeyDown, true);
    window.addEventListener('keyup', _boundKeyUp, true);
    window.addEventListener('blur', _boundBlur);
    window.addEventListener('pointermove', _boundPtrMove);
    window.addEventListener('pointerup', _boundPtrUp);
    window.addEventListener('pointercancel', _boundPtrUp);
    var canvas = getCanvas();
    if (canvas) {
      canvas.addEventListener('pointerdown', _boundPtrDown);
      canvas.addEventListener('wheel', _boundWheel, { passive: false });
    }
  }

  function setFreeCam(on) {
    var runner = getRunner();
    if (on) {
      if (!runner || !runner.camera || runner.tier !== '3d') return;
      _freeCam = true;
      if (!_settings) _settings = captureFrom(runner);
      _freeTarget = orbitTargetFromSettings(_settings);
      syncYawPitchFromCamera(runner.camera);
      applyFreeLook(runner.camera);
      attachFreeCamListeners();
      // Drop focus from the Free Cam button so keys go to the window.
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      stopFreeCamLoop();
      _lastTs = 0;
      _sliderSyncAt = 0;
      syncFreeCamToSliders(true);
      _raf = requestAnimationFrame(freeCamTick);
    } else {
      if (_freeCam && runner && runner.camera) {
        // Bake a round-trippable orbit pose, then apply it so the live camera
        // matches the sliders — otherwise the first slider tweak jumps.
        _settings = captureOrbitFromLiveCamera(runner);
        applyOrbitTo(runner, _settings);
        syncYawPitchFromCamera(runner.camera);
        syncSlidersFromSettings();
        updateTargetGizmo();
        notifyChange();
      }
      _freeCam = false;
      _freeTarget = null;
      detachFreeCamListeners();
      stopFreeCamLoop();
    }
    updateFreeCamUi();
  }

  function updateFreeCamUi() {
    if (!_root) return;
    var btn = _root.querySelector('#cameraEditorFreeCam');
    if (btn) btn.classList.toggle('active', _freeCam);
    var hint = _root.querySelector('#cameraEditorFreeHint');
    if (hint) hint.style.display = _freeCam ? 'block' : 'none';
    var grid = _root.querySelectorAll('[data-snap-grid]');
    for (var i = 0; i < grid.length; i++) {
      grid[i].classList.toggle('active', parseFloat(grid[i].getAttribute('data-snap-grid')) === _snapGrid);
    }
  }

  function snapPosition() {
    var runner = getRunner();
    var cam = runner && runner.camera;
    if (!cam) return;
    cam.position.x = snapValue(cam.position.x, _snapGrid);
    cam.position.y = snapValue(cam.position.y, _snapGrid);
    cam.position.z = snapValue(cam.position.z, _snapGrid);
    if (_freeCam) {
      syncYawPitchFromCamera(cam);
      applyFreeLook(cam);
    } else {
      _settings = captureOrbitFromLiveCamera(runner);
      renderForm();
      applyOrbitTo(runner, _settings);
      notifyChange();
    }
  }

  function snapRotation() {
    var runner = getRunner();
    var cam = runner && runner.camera;
    var THREE = global.THREE;
    if (!cam || !THREE) return;
    var euler = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    var gridDeg = _snapGrid;
    var gridRad = (gridDeg * Math.PI) / 180;
    euler.x = snapValue(euler.x, gridRad);
    euler.y = snapValue(euler.y, gridRad);
    euler.z = snapValue(euler.z, gridRad);
    cam.quaternion.setFromEuler(euler);
    _yaw = euler.y;
    _pitch = euler.x;
    if (_freeCam) {
      applyFreeLook(cam);
    } else {
      _settings = captureOrbitFromLiveCamera(runner);
      renderForm();
      applyOrbitTo(runner, _settings);
      notifyChange();
    }
  }

  function ensureDom() {
    if (_root) return;
    var host = document.getElementById('cameraEditorOverlay');
    if (!host) {
      host = document.createElement('div');
      host.id = 'cameraEditorOverlay';
      document.body.appendChild(host);
    }
    host.innerHTML =
      '<div class="camera-editor-panel">' +
        '<div class="camera-editor-header">' +
          '<span class="camera-editor-title">Camera Editor</span>' +
          '<button type="button" class="camera-editor-close" id="cameraEditorClose" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="camera-editor-empty" id="cameraEditorEmpty">No 3D scene active.</div>' +
        '<div class="camera-editor-body" id="cameraEditorBody">' +
          '<div class="camera-editor-section">' +
            '<div class="camera-editor-section-label">Free Cam</div>' +
            '<button type="button" class="camera-editor-tog" id="cameraEditorFreeCam">Free Cam</button>' +
            '<p class="camera-editor-hint" id="cameraEditorFreeHint">WASD move · Q/E up/down · drag look · scroll zoom · Shift faster</p>' +
          '</div>' +
          '<div class="camera-editor-section">' +
            '<div class="camera-editor-section-label">Snap Grid</div>' +
            '<div class="camera-editor-grid-row">' +
              '<button type="button" data-snap-grid="1">1x</button>' +
              '<button type="button" data-snap-grid="5">5x</button>' +
              '<button type="button" data-snap-grid="10">10x</button>' +
            '</div>' +
            '<div class="camera-editor-grid-row">' +
              '<button type="button" id="cameraEditorSnapPos">Snap Position</button>' +
              '<button type="button" id="cameraEditorSnapRot">Snap Rotation</button>' +
            '</div>' +
          '</div>' +
            '<div class="camera-editor-section">' +
            '<div class="camera-editor-section-label">Orbit Target</div>' +
            '<p class="camera-editor-hint" style="display:block">Yellow handle = look-at / orbit point. Drag it (Free Cam off) to pan. RGB axes = world X/Y/Z.</p>' +
          '</div>' +
          '<div class="camera-editor-section">' +
            '<div class="camera-editor-section-label">Orbit</div>' +
            '<div class="camera-editor-form" id="cameraEditorForm"></div>' +
          '</div>' +
        '</div>' +
        '<div class="camera-editor-footer">' +
          '<button type="button" id="cameraEditorExport" title="Download camera-overrides.js for the project">Export Defaults</button>' +
        '</div>' +
      '</div>';
    _root = host;
    _bodyEl = document.getElementById('cameraEditorBody');
    _emptyEl = document.getElementById('cameraEditorEmpty');

    document.getElementById('cameraEditorClose').addEventListener('click', function () {
      close();
    });
    document.getElementById('cameraEditorFreeCam').addEventListener('click', function () {
      setFreeCam(!_freeCam);
    });
    document.getElementById('cameraEditorSnapPos').addEventListener('click', function () {
      snapPosition();
    });
    document.getElementById('cameraEditorSnapRot').addEventListener('click', function () {
      snapRotation();
    });
    document.getElementById('cameraEditorExport').addEventListener('click', function () {
      var btn = document.getElementById('cameraEditorExport');
      var ok = false;
      if (_opts && typeof _opts.onExport === 'function') ok = !!_opts.onExport();
      if (!btn) return;
      var prev = btn.textContent;
      btn.textContent = ok ? 'Downloaded!' : 'Export failed';
      setTimeout(function () { btn.textContent = prev; }, 1400);
    });
    var gridBtns = host.querySelectorAll('[data-snap-grid]');
    for (var i = 0; i < gridBtns.length; i++) {
      gridBtns[i].addEventListener('click', function (ev) {
        _snapGrid = parseFloat(ev.currentTarget.getAttribute('data-snap-grid')) || 1;
        updateFreeCamUi();
      });
    }
  }

  function formatNum(n) {
    if (!isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 100) return n.toFixed(0);
    if (a >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }

  function addSlider(form, label, key, min, max, step) {
    var wrap = document.createElement('label');
    wrap.className = 'camera-editor-field';
    wrap.appendChild(document.createTextNode(label + ' '));
    var input = document.createElement('input');
    input.type = 'range';
    input.setAttribute('data-cam-key', key);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(_settings[key]);
    var val = document.createElement('span');
    val.className = 'camera-editor-val';
    val.textContent = formatNum(_settings[key]);
    input.addEventListener('input', function () {
      if (_freeCam) setFreeCam(false);
      var n = parseFloat(input.value);
      _settings[key] = n;
      val.textContent = formatNum(n);
      applyLive();
    });
    wrap.appendChild(input);
    wrap.appendChild(val);
    form.appendChild(wrap);
  }

  function renderForm() {
    var form = document.getElementById('cameraEditorForm');
    if (!form || !_settings) return;
    form.innerHTML = '';
    addSlider(form, 'Orbit', 'rotY', -3.14, 3.14, 0.01);
    addSlider(form, 'Tilt', 'rotX', -3.14, 3.14, 0.01);
    addSlider(form, 'Distance', 'dist', 2, 120, 0.5);
    addSlider(form, 'Height', 'height', -80, 80, 0.1);
    addSlider(form, 'Pan X', 'panX', -80, 80, 0.1);
    addSlider(form, 'Pan Y', 'panY', -80, 80, 0.1);
    addSlider(form, 'FOV', 'fov', 10, 120, 1);
    updateFreeCamUi();
  }

  function refreshUi() {
    ensureDom();
    var runner = getRunner();
    var ok = !!(runner && runner.tier === '3d');
    if (_emptyEl) _emptyEl.style.display = ok ? 'none' : 'block';
    if (_bodyEl) _bodyEl.style.display = ok ? 'flex' : 'none';
    if (!ok) {
      if (_freeCam) setFreeCam(false);
      hideTargetGizmo();
      return;
    }
    if (!_settings) _settings = captureFrom(runner);
    renderForm();
    if (_open) ensureTargetGizmo(runner);
  }

  function open() {
    ensureDom();
    _open = true;
    _root.classList.add('open');
    if (_opts && typeof _opts.onOpen === 'function') _opts.onOpen();
    var runner = getRunner();
    if (runner && runner.tier === '3d' && !_settings) {
      _settings = (_opts && _opts.getHostSettings && _opts.getHostSettings()) || captureFrom(runner);
    }
    refreshUi();
    if (!_freeCam && runner && _settings) applyOrbitTo(runner, _settings);
    if (runner) ensureTargetGizmo(runner);
  }

  function close() {
    if (_freeCam) setFreeCam(false);
    hideTargetGizmo();
    _open = false;
    if (_root) _root.classList.remove('open');
    if (_opts && typeof _opts.onClose === 'function') _opts.onClose();
  }

  function isOpen() {
    return _open;
  }

  function getSettings() {
    if (_freeCam) {
      var runner = getRunner();
      if (runner && runner.camera) {
        _settings = captureOrbitFromLiveCamera(runner);
      }
    }
    return _settings ? clone(_settings) : null;
  }

  function setSettings(s) {
    _settings = normalizeSettings(s);
    if (_open) {
      if (_freeCam) setFreeCam(false);
      renderForm();
      applyLive();
    }
  }

  function init(opts) {
    _opts = opts || {};
    ensureDom();
  }

  global.KPFCameraEditor = {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    getSettings: getSettings,
    setSettings: setSettings,
    applyTo: applyOrbitTo,
    captureFrom: captureFrom,
    normalizeSettings: normalizeSettings,
    defaultSettings: defaultSettings,
    isFreeCam: function () { return _freeCam; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
