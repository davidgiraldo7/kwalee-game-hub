(function (global) {
  'use strict';

  const PRESET_ID = 'soft-3d-v1';

  function toLinearColor(THREE, hex) {
    const color = new THREE.Color(hex);
    if (typeof color.convertSRGBToLinear === 'function') {
      color.convertSRGBToLinear();
    }
    return color;
  }

  const SKY_COLOR = '#F9F6F0';
  const HORIZON_COLOR = '#E3C49C';

  // A flat ground plane always meets the sky at the horizon, so no amount of
  // extra size fills the frame. This inverted sphere acts as an infinity cove,
  // blending the horizon into the ground colour from every camera angle.
  function createBackdrop(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, SKY_COLOR);
    gradient.addColorStop(0.52, SKY_COLOR);
    gradient.addColorStop(0.74, HORIZON_COLOR);
    gradient.addColorStop(1, HORIZON_COLOR);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    if ('colorSpace' in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if ('encoding' in texture && THREE.sRGBEncoding) {
      texture.encoding = THREE.sRGBEncoding;
    }

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 24), material);
    mesh.renderOrder = -1;
    return { mesh: mesh, texture: texture, material: material };
  }

  function createCapsuleLikeGeometry(THREE, radius, length) {
    if (typeof THREE.CapsuleGeometry === 'function') {
      return new THREE.CapsuleGeometry(radius, length, 7, 16);
    }
    return new THREE.CylinderGeometry(radius, radius, length + (radius * 2), 16);
  }

  function createKit(options) {
    const opts = options || {};
    const THREE = opts.THREE || global.THREE;
    if (!THREE) throw new Error('THREE is required for soft-3d-v1 preset');

    const container = opts.container;
    if (!container) throw new Error('container is required for soft-3d-v1 preset');

    const viewportWidth = function () {
      return opts.width || container.clientWidth || global.innerWidth || 1;
    };
    const viewportHeight = function () {
      return opts.height || container.clientHeight || global.innerHeight || 1;
    };

    const scene = new THREE.Scene();
    // Fog matches the backdrop horizon tone so the ground dissolves into it
    // instead of ending on a hard edge.
    scene.fog = new THREE.Fog(new THREE.Color(HORIZON_COLOR), 60, 340);

    const camera = new THREE.PerspectiveCamera(28, viewportWidth() / viewportHeight(), 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(viewportWidth(), viewportHeight());
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    camera.position.set(0, 18, 36);
    camera.lookAt(0, 1, 8);

    function resize() {
      const w = viewportWidth();
      const h = viewportHeight();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    function dispose() {
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      renderer.dispose();
    }

    return { scene: scene, camera: camera, renderer: renderer, resize: resize, dispose: dispose, THREE: THREE };
  }

  function addSoftTemplateLighting(kit) {
    const THREE = kit.THREE;
    const scene = kit.scene;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.26);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfff4e6, 0xc9a77d, 0.30);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff0dd, 0.40);
    keyLight.position.set(14, 38, 20);
    keyLight.castShadow = true;
    keyLight.target.position.set(0, 0, 8);
    scene.add(keyLight.target);
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 130;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.normalBias = 0.18;
    keyLight.shadow.radius = 3;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd2dae2, 0.14);
    fillLight.position.set(-15, 25, -12);
    scene.add(fillLight);

    return { ambientLight: ambientLight, hemiLight: hemiLight, keyLight: keyLight, fillLight: fillLight };
  }

  function createPlasticMaterials(THREE, palette) {
    return (palette || []).map(function (color) {
      return new THREE.MeshStandardMaterial({
        color: toLinearColor(THREE, color),
        roughness: 0.75,
        metalness: 0.0
      });
    });
  }

  function buildScene(options) {
    const kit = createKit(options);
    const THREE = kit.THREE;
    const lightRig = addSoftTemplateLighting(kit);
    // Minimal mode is the in-game backdrop: ground and horizon only, no props.
    const minimal = !!(options && options.minimal);

    const scene = kit.scene;
    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    const backdrop = createBackdrop(THREE);
    scene.add(backdrop.mesh);

    const floorMat = new THREE.MeshStandardMaterial({
      color: toLinearColor(THREE, '#C9A77D'),
      roughness: 0.9,
      metalness: 0.0
    });
    const table = new THREE.Mesh(new THREE.BoxGeometry(1200, 10, 1200), floorMat);
    table.position.y = -5;
    table.receiveShadow = true;
    scene.add(table);

    const starterGroup = new THREE.Group();

    if (!minimal) {
      const wallMat = new THREE.MeshStandardMaterial({
        color: toLinearColor(THREE, '#E5C69F'),
        roughness: 0.8,
        metalness: 0.0
      });
      const board = new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 26), wallMat);
      board.position.set(0, 0.65, 8);
      board.receiveShadow = true;
      scene.add(board);

      const starterMatA = new THREE.MeshStandardMaterial({ color: toLinearColor(THREE, '#6CC6FF'), roughness: 0.55, metalness: 0.03 });
      const starterMatB = new THREE.MeshStandardMaterial({ color: toLinearColor(THREE, '#FF9F5A'), roughness: 0.6, metalness: 0.02 });
      const starterMatC = new THREE.MeshStandardMaterial({ color: toLinearColor(THREE, '#55D89A'), roughness: 0.5, metalness: 0.03 });

      scene.add(starterGroup);

      const starterBox = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 2.8), starterMatA);
      starterBox.position.set(-5.6, 2.2, 6.8);
      starterBox.castShadow = true;
      starterBox.receiveShadow = true;
      starterGroup.add(starterBox);

      const starterSphere = new THREE.Mesh(new THREE.SphereGeometry(1.7, 28, 18), starterMatB);
      starterSphere.position.set(0.2, 1.8, 8.6);
      starterSphere.castShadow = true;
      starterSphere.receiveShadow = true;
      starterGroup.add(starterSphere);

      const starterTorus = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.48, 18, 36), starterMatC);
      starterTorus.position.set(5.4, 1.9, 6.2);
      starterTorus.rotation.x = Math.PI / 2.7;
      starterTorus.castShadow = true;
      starterTorus.receiveShadow = true;
      starterGroup.add(starterTorus);

      const staticPalette = ['#6CC6FF', '#FF5E6A', '#FFD95A', '#55D89A', '#FF9F5A'];
      const staticMats = createPlasticMaterials(THREE, staticPalette);

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.2, 0.9, 36), wallMat);
      pedestal.position.set(0, 0.95, 8.0);
      pedestal.receiveShadow = true;
      scene.add(pedestal);

      const testCapsule = new THREE.Mesh(createCapsuleLikeGeometry(THREE, 0.95, 2.2), staticMats[1]);
      testCapsule.position.set(-2.8, 2.4, 9.8);
      testCapsule.rotation.z = 0.22;
      testCapsule.castShadow = true;
      testCapsule.receiveShadow = true;
      starterGroup.add(testCapsule);

      const testCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.2, 24), staticMats[2]);
      testCylinder.position.set(2.6, 2.05, 10.2);
      testCylinder.castShadow = true;
      testCylinder.receiveShadow = true;
      starterGroup.add(testCylinder);

      const testCone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 26), staticMats[4]);
      testCone.position.set(0.2, 2.0, 5.2);
      testCone.rotation.y = -0.35;
      testCone.castShadow = true;
      testCone.receiveShadow = true;
      starterGroup.add(testCone);
    }

    let mounted = false;
    const container = options.container;

    function render() {
      kit.renderer.render(scene, kit.camera);
    }

    return {
      id: PRESET_ID,
      tier: '3d',
      scene: scene,
      camera: kit.camera,
      renderer: kit.renderer,
      baseFog: scene.fog,
      lights: {
        ambient: lightRig.ambientLight,
        hemi: lightRig.hemiLight,
        key: lightRig.keyLight,
        fill: lightRig.fillLight
      },
      contentGroup: contentGroup,
      starterGroup: starterGroup,
      tokens: null,
      mount: function () {
        if (!mounted && container) {
          container.appendChild(kit.renderer.domElement);
          mounted = true;
        }
        kit.resize();
        render();
      },
      step: function () {
        render();
      },
      resize: function () {
        kit.resize();
        render();
      },
      dispose: function () {
        backdrop.texture.dispose();
        backdrop.material.dispose();
        backdrop.mesh.geometry.dispose();
        kit.dispose();
        mounted = false;
      },
      createPlasticMaterials: function (palette) {
        return createPlasticMaterials(THREE, palette);
      },
      toLinearColor: function (hex) {
        return toLinearColor(THREE, hex);
      }
    };
  }

  if (global.KPFVisualBridge) {
    global.KPFVisualBridge.register(PRESET_ID, buildScene);
  }
})(typeof window !== 'undefined' ? window : globalThis);
