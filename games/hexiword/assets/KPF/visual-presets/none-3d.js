(function (global) {
  'use strict';

  // 3D Scene: an empty WebGL stage — camera, lighting rig and a neutral
  // ground plane, with no decorative assets. Unlike the 2D Scene (which
  // creates no renderer at all), this keeps a live 3D pipeline behind the
  // game UI so gameplay objects can be dropped into contentGroup, and so the
  // camera/lighting debug tabs have a real scene to drive.
  const PRESET_ID = 'none-3d';

  function toLinearColor(THREE, hex) {
    const color = new THREE.Color(hex);
    if (typeof color.convertSRGBToLinear === 'function') {
      color.convertSRGBToLinear();
    }
    return color;
  }

  function buildScene(options) {
    const opts = options || {};
    const THREE = opts.THREE || global.THREE;
    if (!THREE) throw new Error('THREE is required for none-3d preset');

    const container = opts.container;
    if (!container) throw new Error('container is required for none-3d preset');

    const viewportWidth = function () {
      return opts.width || container.clientWidth || global.innerWidth || 1;
    };
    const viewportHeight = function () {
      return opts.height || container.clientHeight || global.innerHeight || 1;
    };

    const scene = new THREE.Scene();
    scene.background = toLinearColor(THREE, '#20243C');
    scene.fog = new THREE.Fog(toLinearColor(THREE, '#20243C').getHex(), 40, 160);

    const camera = new THREE.PerspectiveCamera(32, viewportWidth() / viewportHeight(), 0.1, 400);
    camera.position.set(0, 8, 20);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(viewportWidth(), viewportHeight());
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';

    // Lighting rig mirrors the other presets' shape so the debug lighting tab
    // can drive it, and anything added to the stage is lit straight away.
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a2438, 0.35);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4e6, 0.85);
    key.position.set(-7, 14, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 80;
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2.5;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xb8c8e8, 0.3);
    fill.position.set(10, 4, 8);
    scene.add(fill);

    // Neutral ground: gives the stage spatial read and catches shadows from
    // whatever gameplay objects get added later.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({
        color: toLinearColor(THREE, '#2A2F4C'),
        roughness: 0.95,
        metalness: 0.0
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -4;
    ground.receiveShadow = true;
    scene.add(ground);

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    let mounted = false;

    function render() {
      renderer.render(scene, camera);
    }

    function resize() {
      const w = viewportWidth();
      const h = viewportHeight();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    return {
      id: PRESET_ID,
      tier: '3d',
      scene: scene,
      camera: camera,
      renderer: renderer,
      baseFog: scene.fog,
      lights: {
        ambient: ambient,
        hemi: hemi,
        key: key,
        fill: fill
      },
      effects: {},
      contentGroup: contentGroup,
      tokens: null,
      mount: function () {
        if (!mounted && container) {
          container.appendChild(renderer.domElement);
          mounted = true;
        }
        resize();
        render();
      },
      step: function () {
        render();
      },
      resize: function () {
        resize();
        render();
      },
      dispose: function () {
        ground.geometry.dispose();
        ground.material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        mounted = false;
      }
    };
  }

  if (global.KPFVisualBridge) {
    global.KPFVisualBridge.register(PRESET_ID, buildScene);
  }
})(typeof window !== 'undefined' ? window : globalThis);
