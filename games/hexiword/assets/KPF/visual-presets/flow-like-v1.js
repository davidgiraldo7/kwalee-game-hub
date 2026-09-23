(function (global) {
  'use strict';

  const PRESET_ID = 'flow-like-v1';

  // Warm cream stage with flat toy colours. The look is graphic rather than
  // photographic: the board and trays sit only slightly darker than the
  // background, so shape reads from soft shadow and silhouette instead of
  // gloss. Coin colours stay saturated because almost nothing washes them out.
  const COLORS = {
    bg: '#F4E0C6',
    stage: '#F1DCBF',
    boardFrame: '#E0BE95',
    trayHolder: '#FFFBF4',
    coinYellow: '#F0B01C',
    coinBlue: '#3766D4',
    coinRed: '#E5486A'
  };

  // Approximate coin layout from reference (7 cols × 9 rows)
  const COIN_GRID = [
    'bbyyybb',
    'byyyyb',
    'byyyyb',
    'yyrrryy',
    'yyrrryy',
    'yyryryy',
    'yyrrryy',
    'byyyyb',
    'bbyyybb'
  ];

  function toLinearColor(THREE, hex) {
    const color = new THREE.Color(hex);
    if (typeof color.convertSRGBToLinear === 'function') {
      color.convertSRGBToLinear();
    }
    return color;
  }

  // ---------- Toy / plastic shading ----------

  // Combined shader injection for the satin toy look:
  //  - Fresnel rim: a hairline emissive edge (high power, low strength), not
  //    a broad halo.
  //  - Baked vertical diffuse gradient: the face darkens towards the bottom,
  //    which fakes rich top-down lighting in the base colour and keeps the
  //    faces saturated instead of washed out by specular glare.
  // Base values are kept on userData so the debug panel can scale rim/env per
  // material without losing each surface's own tuning.
  function applyToyShader(THREE, material, opts) {
    const rim = toLinearColor(THREE, opts.rimColor);
    material.userData.rimBase = opts.rimStrength;
    material.userData.rimPower = opts.rimPower;
    material.onBeforeCompile = function (shader) {
      shader.uniforms.uRimColor = { value: rim };
      shader.uniforms.uRimPower = { value: opts.rimPower };
      shader.uniforms.uRimStrength = { value: opts.rimStrength };
      shader.uniforms.uGradMin = { value: opts.gradMin };
      shader.uniforms.uGradMax = { value: opts.gradMax };
      shader.uniforms.uGradScale = { value: opts.gradScale };
      material.userData.rimUniforms = shader.uniforms;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vGradY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGradY = position.y;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;\nuniform float uGradMin;\nuniform float uGradMax;\nuniform float uGradScale;\nvarying float vGradY;'
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n' +
          '{\n' +
          '  float gradT = smoothstep( -1.0, 1.0, clamp( vGradY * uGradScale, -1.0, 1.0 ) );\n' +
          '  diffuseColor.rgb *= mix( uGradMin, uGradMax, gradT );\n' +
          '}'
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
          '{\n' +
          '  vec3 rimView = normalize( vViewPosition );\n' +
          '  float rimF = pow( 1.0 - saturate( dot( normalize( normal ), rimView ) ), uRimPower );\n' +
          '  totalEmissiveRadiance += uRimColor * rimF * uRimStrength;\n' +
          '}'
        );
    };
    material.customProgramCacheKey = function () { return 'toy-shading'; };
  }

  function toyMat(THREE, hex, opts) {
    const o = opts || {};
    const envIntensity = o.envMapIntensity != null ? o.envMapIntensity : 0.08;
    const material = new THREE.MeshStandardMaterial({
      color: toLinearColor(THREE, hex),
      roughness: o.roughness != null ? o.roughness : 0.9,
      metalness: o.metalness != null ? o.metalness : 0.0,
      envMapIntensity: envIntensity
    });
    material.userData.envBase = envIntensity;
    applyToyShader(THREE, material, {
      rimColor: o.rimColor || '#ffffff',
      rimPower: o.rimPower != null ? o.rimPower : 5.0,
      rimStrength: o.rimStrength != null ? o.rimStrength : 0.02,
      gradMin: o.gradMin != null ? o.gradMin : 1.0,
      gradMax: o.gradMax != null ? o.gradMax : 1.0,
      gradScale: o.gradScale != null ? o.gradScale : 1.0
    });
    return material;
  }

  // Procedural environment: an evenly lit warm room with no small bright
  // sources. Deliberately flat and low-contrast — a tight bright softbox is
  // what produces crisp specular arcs, so the gradient here spans only cream
  // to sand and the materials sample it at a very low envMapIntensity. Its
  // job is to keep shadowed faces warm rather than to add visible reflections.
  function createStudioEnvironment(THREE, renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, '#FFF6E8');
    base.addColorStop(0.55, '#F2E1CA');
    base.addColorStop(1, '#DFC5A4');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Very broad, very low-contrast warm sky lift; no hard-edged highlight.
    const sky = ctx.createRadialGradient(256, 20, 40, 256, 20, 300);
    sky.addColorStop(0, 'rgba(255, 250, 240, 0.35)');
    sky.addColorStop(1, 'rgba(255, 250, 240, 0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    pmrem.dispose();
    return envMap;
  }

  // ---------- Geometry ----------

  // Shared corner radius for the board, the tray base and the collection
  // plates, so all three read as the same moulded family. The plates are the
  // limiting piece: at 1.12 tall anything approaching 0.56 turns them into
  // plain pills, so this sits well short of that ceiling.
  const CORNER_RADIUS = 0.4;

  function roundedRectShape(THREE, w, h, r) {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  function extrudeRoundedRect(THREE, w, h, r, depth, bevel) {
    const opts = {
      depth: depth,
      bevelEnabled: !!bevel,
      bevelThickness: bevel ? 0.08 : 0,
      bevelSize: bevel ? 0.08 : 0,
      bevelSegments: 3,
      curveSegments: 12
    };
    return new THREE.ExtrudeGeometry(roundedRectShape(THREE, w, h, r), opts);
  }

  // Lathe-turned coin profile: a narrow chamfer around the rim (a fine,
  // distinct line of edge light rather than a wide rounded bevel) and a
  // shallow dish pressed into the centre of each face.
  function createCoinGeometry(THREE, radius, thickness) {
    const bevel = 0.035;
    const h = thickness / 2;
    const dishR = radius * 0.52;
    const dishD = 0.045;
    const pts = [];
    const seg = 3;
    const dishSeg = 8;

    // Back face, centre outwards: dish, then flat field to the rim.
    pts.push(new THREE.Vector2(0, -h + dishD));
    for (let i = 1; i <= dishSeg; i++) {
      const a = (i / dishSeg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(dishR * Math.sin(a), -h + dishD * Math.cos(a)));
    }
    pts.push(new THREE.Vector2(radius - bevel, -h));

    // Underside chamfer.
    for (let i = 1; i <= seg; i++) {
      const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(
        radius - bevel + Math.cos(a) * bevel,
        -h + bevel + Math.sin(a) * bevel
      ));
    }
    pts.push(new THREE.Vector2(radius, h - bevel));

    // Top chamfer.
    for (let i = 1; i <= seg; i++) {
      const a = (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(
        radius - bevel + Math.cos(a) * bevel,
        h - bevel + Math.sin(a) * bevel
      ));
    }

    // Front face: flat field, then the dish down to the centre.
    pts.push(new THREE.Vector2(dishR, h));
    for (let i = 1; i <= dishSeg; i++) {
      const a = (i / dishSeg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(dishR * Math.cos(a), h - dishD * Math.sin(a)));
    }

    const geo = new THREE.LatheGeometry(pts, 44);
    geo.rotateX(Math.PI / 2);
    return geo;
  }

  // ---------- Fake occlusion ----------

  // Soft radial contact shadow, cheaper and more controllable than relying on
  // the shadow map alone for the dark halo each coin casts onto the recess.
  function createContactShadowTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(90, 58, 30, 0.3)');
    g.addColorStop(0.55, 'rgba(90, 58, 30, 0.13)');
    g.addColorStop(1, 'rgba(90, 58, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  // ---------- Coins ----------

  const COIN_RADIUS = 0.44;
  const COIN_THICKNESS = 0.3;

  function createCoin(THREE, type, shared) {
    const palette = {
      y: { base: COLORS.coinYellow, rim: '#FFE9B4' },
      b: { base: COLORS.coinBlue, rim: '#BBD0FF' },
      r: { base: COLORS.coinRed, rim: '#FFC2CE' }
    };
    const spec = palette[type] || palette.y;

    const group = new THREE.Group();

    // Matte moulded-plastic finish: high roughness plus a near-zero
    // environment contribution removes the specular arc entirely, so each
    // face reads as one flat colour. The vertical gradient is kept but very
    // shallow (0.94 bottom → 1.04 top) — just enough to stop the coins
    // looking like flat 2D discs. gradScale normalises local Y by the radius.
    const bodyMat = toyMat(THREE, spec.base, {
      roughness: 0.92,
      envMapIntensity: 0.06,
      rimColor: spec.rim,
      rimStrength: 0.02,
      gradMin: 0.94,
      gradMax: 1.04,
      gradScale: 1 / COIN_RADIUS
    });
    const body = new THREE.Mesh(createCoinGeometry(THREE, COIN_RADIUS, COIN_THICKNESS), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    if (shared) {
      // Sits just above the board face, directly behind the coin; depth
      // testing hides the covered part, leaving a soft halo around its
      // silhouette.
      const shadow = new THREE.Mesh(shared.shadowGeo, shared.shadowMaterial);
      shadow.position.set(0.06, -0.07, -(COIN_THICKNESS / 2) + 0.006);
      shadow.renderOrder = 1;
      group.add(shadow);
    }

    return group;
  }

  // ---------- Kit ----------

  function createKit(options) {
    const opts = options || {};
    const THREE = opts.THREE || global.THREE;
    if (!THREE) throw new Error('THREE is required for flow-like-v1 preset');

    const container = opts.container;
    if (!container) throw new Error('container is required for flow-like-v1 preset');

    const viewportWidth = function () {
      return opts.width || container.clientWidth || global.innerWidth || 1;
    };
    const viewportHeight = function () {
      return opts.height || container.clientHeight || global.innerHeight || 1;
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);

    const camera = new THREE.PerspectiveCamera(32, viewportWidth() / viewportHeight(), 0.1, 200);
    camera.position.set(0, 6.5, 18);
    camera.lookAt(0, -0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(viewportWidth(), viewportHeight());
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    // ACES still guards the cream background from clipping, but the scene is
    // now lit well below the roll-off knee, so colours stay flat and graphic
    // rather than picking up a filmic shoulder.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    function resize() {
      camera.aspect = viewportWidth() / viewportHeight();
      camera.updateProjectionMatrix();
      renderer.setSize(viewportWidth(), viewportHeight());
    }

    function dispose() {
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      renderer.dispose();
    }

    return {
      scene: scene,
      camera: camera,
      renderer: renderer,
      resize: resize,
      dispose: dispose,
      viewportWidth: viewportWidth,
      viewportHeight: viewportHeight,
      THREE: THREE
    };
  }

  function addLighting(kit) {
    const THREE = kit.THREE;
    const scene = kit.scene;

    // Flat-lit and warm: ambient plus hemisphere carry most of the exposure so
    // surfaces are evenly bright, and the key is dialled back to roughly half
    // its previous strength. It now exists mainly to cast the soft drop shadow
    // that separates coins from the board, not to model form with falloff.
    // Total irradiance is deliberately held near 1.0 — pushing past that
    // desaturates the toy colours toward white instead of brightening them.
    const ambient = new THREE.AmbientLight(0xfff0dc, 0.3);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xfff6e8, 0xe4c9a8, 0.32);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff6e8, 0.55);
    key.position.set(-7.5, 21, 18.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3.5;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffe8cf, 0.18);
    fill.position.set(10, 4, 8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xfff1de, 0.06);
    rim.position.set(0, 2, -10);
    scene.add(rim);

    // Warm floor bounce, replacing the cool under-glow that used to tint the
    // undersides blue-grey.
    const underGlow = new THREE.DirectionalLight(0xf3d9bc, 0.1);
    underGlow.position.set(0, -8, 6);
    scene.add(underGlow);

    return {
      ambient: ambient,
      hemi: hemi,
      key: key,
      fill: fill,
      rim: rim,
      underGlow: underGlow
    };
  }

  // ---------- Post-processing ----------

  const ColorGradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uSaturation: { value: 1.06 },
      uContrast: { value: 1.0 },
      uLift: { value: 0.0 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float uSaturation;',
      'uniform float uContrast;',
      'uniform float uLift;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 c = texture2D(tDiffuse, vUv);',
      '  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));',
      '  c.rgb = mix(vec3(l), c.rgb, uSaturation);',
      '  c.rgb = (c.rgb - 0.5) * uContrast + 0.5 + uLift;',
      '  gl_FragColor = c;',
      '}'
    ].join('\n')
  };

  // Chain: scene → bloom → grade (saturation/contrast) → gamma back to sRGB →
  // FXAA. EffectComposer render targets get no MSAA in r128, so without the
  // FXAA pass edges alias and then bloom smears them — that combination is
  // what made details look blurry. Bloom is now close to off: on a cream
  // background any glow reads as haze rather than sparkle, and the flat
  // materials no longer produce highlights worth blooming.
  function setupPostProcessing(THREE, kit) {
    const hasPost = !!(
      THREE.EffectComposer &&
      THREE.RenderPass &&
      THREE.ShaderPass &&
      THREE.UnrealBloomPass &&
      THREE.GammaCorrectionShader &&
      THREE.FXAAShader
    );
    if (!hasPost) return null;

    const composer = new THREE.EffectComposer(kit.renderer);
    composer.addPass(new THREE.RenderPass(kit.scene, kit.camera));

    const bloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(kit.viewportWidth(), kit.viewportHeight()),
      0.04,
      0.25,
      0.98
    );
    composer.addPass(bloom);

    const grade = new THREE.ShaderPass(ColorGradeShader);
    composer.addPass(grade);

    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));

    const fxaa = new THREE.ShaderPass(THREE.FXAAShader);
    const pr = kit.renderer.getPixelRatio();
    fxaa.material.uniforms.resolution.value.set(
      1 / (kit.viewportWidth() * pr),
      1 / (kit.viewportHeight() * pr)
    );
    composer.addPass(fxaa);

    return { composer: composer, bloom: bloom, grade: grade, fxaa: fxaa };
  }

  // ---------- Scene ----------

  // Slab whose front face (bevel included) sits exactly on z=0 with the body
  // extending backwards. Everything else layers in front of it, so no two
  // solids ever intersect — the previous build buried coins, recesses and
  // well floors inside the slabs, which is what caused all the clipping.
  function slabGeometry(THREE, w, h, r, depth) {
    const geo = extrudeRoundedRect(THREE, w, h, r, depth, true);
    geo.translate(0, 0, -(depth + 0.08));
    return geo;
  }

  // Simple flat board with the coins resting on its face.
  function buildBoard(THREE, shared) {
    const board = new THREE.Group();
    board.position.y = 3.4;

    const frameMat = toyMat(THREE, COLORS.boardFrame, {
      roughness: 0.95,
      envMapIntensity: 0.05,
      rimStrength: 0.015,
      gradMin: 0.97,
      gradMax: 1.02,
      gradScale: 1 / 5.2
    });
    const frame = new THREE.Mesh(slabGeometry(THREE, 8.6, 10.4, CORNER_RADIUS, 0.5), frameMat);
    frame.castShadow = true;
    frame.receiveShadow = true;
    board.add(frame);

    const cols = 7;
    const rows = COIN_GRID.length;
    const startX = -((cols - 1) * 1.02) / 2;
    const startY = 3.4;
    const coinZ = COIN_THICKNESS / 2 + 0.01;

    for (let row = 0; row < rows; row++) {
      const line = COIN_GRID[row];
      for (let col = 0; col < cols; col++) {
        const type = line.charAt(col);
        if (type === ' ') continue;
        const coin = createCoin(THREE, type, shared);
        coin.position.set(startX + col * 1.02, startY - row * 1.0, coinZ);
        board.add(coin);
      }
    }

    return board;
  }

  // ---------- Collection plates ----------

  // Flat three-hole bars laid out in a grid, with the active row sitting on a
  // white holder. Holes are punched right through, so whatever is behind the
  // plate shows in them.
  const PLATE_W = 2.4;
  const PLATE_H = 1.12;
  const PLATE_DEPTH = 0.42;
  // Three holes share the width two used to, so both the radius and spacing
  // tighten rather than the plate growing — a wider plate pushes the outer
  // column past the frame edge at the picker's camera.
  const PLATE_HOLE_R = 0.26;
  const PLATE_HOLE_DX = 0.72;

  const PLATE_COLUMNS = [-2.78, 0, 2.78];
  // The active row sits further off the pair below it, matching the reference's
  // wider gap under the holder.
  const PLATE_ROWS = [1.95, -0.15, -1.62];
  const PLATE_LAYOUT = [
    ['b', 'r', 'r'],
    ['r', 'y', 'b'],
    ['y', 'y', 'b']
  ];

  function plateGeometry(THREE) {
    const shape = roundedRectShape(THREE, PLATE_W, PLATE_H, CORNER_RADIUS);
    [-PLATE_HOLE_DX, 0, PLATE_HOLE_DX].forEach(function (x) {
      const hole = new THREE.Path();
      hole.absarc(x, 0, PLATE_HOLE_R, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    });
    // No bevel: the plates take a square edge, which also keeps the holes
    // crisp. Without it the extrusion spans 0..depth, so the offset that puts
    // the front face on z=0 is just the depth.
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: PLATE_DEPTH,
      bevelEnabled: false,
      curveSegments: 18
    });
    geo.translate(0, 0, -PLATE_DEPTH);
    return geo;
  }

  function plateMaterial(THREE, type) {
    const base = {
      y: COLORS.coinYellow,
      b: COLORS.coinBlue,
      r: COLORS.coinRed
    }[type] || COLORS.coinYellow;

    return toyMat(THREE, base, {
      roughness: 0.93,
      envMapIntensity: 0.05,
      rimStrength: 0.02,
      gradMin: 0.95,
      gradMax: 1.03,
      gradScale: 1 / (PLATE_H / 2)
    });
  }

  function buildTrays(THREE) {
    const trays = new THREE.Group();
    trays.position.y = -6.3;

    // Shared across every plate — the geometry is identical, only the colour
    // and position change.
    const geo = plateGeometry(THREE);
    const materials = {};

    // White holder behind the active row, generous corners and slightly wider
    // than the row it carries. Its front face is set to the plate backs so the
    // plates read as resting on it.
    const holderMat = toyMat(THREE, COLORS.trayHolder, {
      roughness: 0.96,
      envMapIntensity: 0.03,
      rimStrength: 0.01,
      gradMin: 0.98,
      gradMax: 1.01,
      gradScale: 1 / 0.9
    });
    const holder = new THREE.Mesh(slabGeometry(THREE, 8.62, 1.86, CORNER_RADIUS, 0.3), holderMat);
    holder.position.set(0, PLATE_ROWS[0], -(PLATE_DEPTH + 0.02));
    holder.castShadow = true;
    holder.receiveShadow = true;
    trays.add(holder);

    PLATE_ROWS.forEach(function (y, row) {
      PLATE_COLUMNS.forEach(function (x, col) {
        const type = PLATE_LAYOUT[row][col];
        if (!materials[type]) materials[type] = plateMaterial(THREE, type);

        const plate = new THREE.Mesh(geo, materials[type]);
        plate.position.set(x, y, 0);
        plate.castShadow = true;
        plate.receiveShadow = true;
        trays.add(plate);
      });
    });

    return trays;
  }

  function buildScene(options) {
    const kit = createKit(options);
    const THREE = kit.THREE;
    const lightRig = addLighting(kit);
    const minimal = !!(options && options.minimal);

    const scene = kit.scene;
    scene.environment = createStudioEnvironment(THREE, kit.renderer);

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    const shadowTexture = createContactShadowTexture(THREE);
    const shared = {
      shadowMaterial: new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false
      }),
      shadowGeo: new THREE.PlaneGeometry(COIN_RADIUS * 2.7, COIN_RADIUS * 2.7)
    };

    // Minimal mode (in-game backdrop) carries no geometry at all — just the
    // background, lighting and post chain behind the game's own UI.
    if (!minimal) {
      // Cream stage behind everything. The plates have no panel under them
      // any more, so without this surface their cast shadows would have
      // nothing to land on. It is oversized so it fills the frame and takes
      // over from the flat background colour entirely.
      const stageMat = new THREE.MeshStandardMaterial({
        color: toLinearColor(THREE, COLORS.stage),
        roughness: 0.97,
        metalness: 0.0,
        envMapIntensity: 0.03
      });
      stageMat.userData.envBase = 0.03;
      // Sits just behind the deepest tray part. Pushing it further back
      // displaces and enlarges every cast shadow, which stops the plates
      // reading as resting on the surface.
      const stage = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), stageMat);
      stage.position.z = -0.92;
      stage.receiveShadow = true;
      contentGroup.add(stage);

      contentGroup.add(buildBoard(THREE, shared));
      contentGroup.add(buildTrays(THREE));
    }

    const post = setupPostProcessing(THREE, kit);
    const composer = post ? post.composer : null;

    let mounted = false;
    const container = options.container;

    function render() {
      if (composer) composer.render();
      else kit.renderer.render(scene, kit.camera);
    }

    function resizePost() {
      if (!post) return;
      post.composer.setSize(kit.viewportWidth(), kit.viewportHeight());
      const pr = kit.renderer.getPixelRatio();
      post.fxaa.material.uniforms.resolution.value.set(
        1 / (kit.viewportWidth() * pr),
        1 / (kit.viewportHeight() * pr)
      );
    }

    return {
      id: PRESET_ID,
      tier: '3d',
      scene: scene,
      camera: kit.camera,
      renderer: kit.renderer,
      baseFog: scene.fog,
      lights: lightRig,
      effects: {
        bloom: post ? post.bloom : null,
        grade: post ? post.grade : null,
        shadowMaterial: shared.shadowMaterial
      },
      contentGroup: contentGroup,
      tokens: {
        colors: COLORS
      },
      mount: function () {
        if (!mounted && container) {
          container.appendChild(kit.renderer.domElement);
          mounted = true;
        }
        kit.resize();
        resizePost();
        render();
      },
      step: function () {
        render();
      },
      resize: function () {
        kit.resize();
        resizePost();
        render();
      },
      dispose: function () {
        if (composer) {
          if (composer.renderTarget1) composer.renderTarget1.dispose();
          if (composer.renderTarget2) composer.renderTarget2.dispose();
        }
        if (scene.environment) scene.environment.dispose();
        shadowTexture.dispose();
        shared.shadowMaterial.dispose();
        shared.shadowGeo.dispose();
        kit.dispose();
        mounted = false;
      }
    };
  }

  if (global.KPFVisualBridge) {
    global.KPFVisualBridge.register(PRESET_ID, buildScene);
  }
})(typeof window !== 'undefined' ? window : globalThis);
