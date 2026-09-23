(function (global) {
  'use strict';

  const PRESET_ID = 'block-puzzle-v1';

  // Block Jam-inspired palette: a cool lavender play surface with a raised
  // containing wall. Built from primitive geometry, not copied game artwork.
  const COLORS = {
    bg: '#E9E8F6',
    stage: '#E2E1F1',
    boardFrame: '#D4D3E8',
    boardWall: '#DCDBEE',
    boardInset: '#C1C0DA',
    gridLine: 'rgba(78, 74, 118, 0.16)',
    blockRed: '#F05B62',
    blockBlue: '#3E9DE8',
    blockYellow: '#F4C84A'
  };

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

  // Procedural environment: an evenly lit cool studio with no small bright
  // sources. The broad white lift gives the candy-plastic blocks a restrained
  // satin highlight while the lavender base keeps their shadowed faces clean.
  function createStudioEnvironment(THREE, renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, '#F8F7FF');
    base.addColorStop(0.55, '#E7E6F5');
    base.addColorStop(1, '#CAC8E2');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Very broad white sky lift; no hard-edged highlight.
    const sky = ctx.createRadialGradient(180, 20, 40, 180, 20, 300);
    sky.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    sky.addColorStop(1, 'rgba(255, 255, 255, 0)');
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

  // ---------- Kit ----------

  function createKit(options) {
    const opts = options || {};
    const THREE = opts.THREE || global.THREE;
    if (!THREE) throw new Error('THREE is required for block-puzzle-v1 preset');

    const container = opts.container;
    if (!container) throw new Error('container is required for block-puzzle-v1 preset');

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
    // ACES keeps the pale lavender background and bright block colours from
    // clipping while retaining their soft toy-like roll-off.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
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

    // Bright, cool toy-store lighting gives the blocks enough face modelling
    // to read as chunky characters without introducing hard reflections.
    const ambient = new THREE.AmbientLight(0xf7f5ff, 0.34);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb7b3d5, 0.38);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffbf5, 0.65);
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

    const fill = new THREE.DirectionalLight(0xcbdcff, 0.22);
    fill.position.set(10, 4, 8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xf0e8ff, 0.12);
    rim.position.set(0, 2, -10);
    scene.add(rim);

    const underGlow = new THREE.DirectionalLight(0xc9c6ea, 0.1);
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
      uSaturation: { value: 1.08 },
      uContrast: { value: 1.03 },
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
  // FXAA keeps the small faces and rounded block silhouettes clean. Bloom stays
  // restrained so the pale background does not turn hazy.
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
      0.08,
      0.2,
      0.95
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
  // extending backwards, letting the wall and floor layers stack cleanly.
  function slabGeometry(THREE, w, h, r, depth) {
    const geo = extrudeRoundedRect(THREE, w, h, r, depth, true);
    geo.translate(0, 0, -(depth + 0.08));
    return geo;
  }

  // ---------- Block Jam-inspired board ----------

  const WALL_THICKNESS = 0.28;
  const GRID_COLS = 8;
  const GRID_ROWS = 9;
  const GRID_CELL = 1.14;
  const GRID_W = GRID_COLS * GRID_CELL;
  const GRID_H = GRID_ROWS * GRID_CELL;
  const BOARD_W = GRID_W + WALL_THICKNESS * 2;
  const BOARD_H = GRID_H + WALL_THICKNESS * 2;
  const BOARD_CORNER = 0.58;
  const BOARD_BASE_DEPTH = 0.46;
  // The wall reads as a containing rim, so it stands well proud of the floor
  // rather than sitting flush with it.
  const WALL_HEIGHT = 0.98;
  const WALL_BEVEL = 0.05;
  const WALL_BEVEL_SEGMENTS = 3;
  const GRID_CORNER = Math.max(0.12, BOARD_CORNER - WALL_THICKNESS * 0.5);
  const GRID_FLOOR_Z = 0.02;
  const BLOCK_DEPTH = 0.38;
  const BLOCK_BEVEL = 0.07;
  // Gap between a piece's silhouette and its cell boundary, and the radius
  // applied to every corner of that silhouette.
  const BLOCK_INSET = GRID_CELL * 0.06;
  const BLOCK_CORNER = GRID_CELL * 0.2;

  // Four pieces only. Coordinates are local cell offsets from each piece's
  // top-left origin; placements are grid columns/rows measured from top-left.
  const BLOCK_LAYOUTS = [
    { color: 'blockRed', col: 1, row: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { color: 'blockBlue', col: 5, row: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { color: 'blockYellow', col: 2, row: 4, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { color: 'blockBlue', col: 5, row: 5, cells: [[0, 0], [0, 1], [0, 2], [1, 2]] }
  ];

  // Exit gates: one per piece colour, drawn as a coloured run of the wall.
  // `cell` is the index along that edge (column for top/bottom, row for
  // left/right) counted from the grid's top-left, and `span` is in whole cells.
  // Keep gates clear of the rounded corners so they sit on a straight run.
  const GATE_LAYOUTS = [
    { color: 'blockRed', edge: 'right', cell: 1, span: 1 },
    { color: 'blockBlue', edge: 'bottom', cell: 5, span: 2 },
    { color: 'blockYellow', edge: 'left', cell: 4, span: 2 }
  ];
  // How far a gate's surface stands clear of the wall's. Sitting a gate exactly
  // on the wall makes its faces coplanar, and no depth bias orders coplanar
  // faces reliably: the driver scales polygonOffsetFactor by the polygon's
  // depth slope, and even a constant polygonOffsetUnits shifts a face that is
  // near edge-on — which the wall faces are under a top-down camera — far
  // enough sideways to show the gate's own sides over the wall. Standing the
  // gate clear by a fraction of a pixel removes the ambiguity instead of
  // arbitrating it: 0.0025 is roughly a twentieth of the wall bevel and about a
  // tenth of a pixel on screen, so the gate still reads as flush.
  const GATE_SWELL = 0.0025;

  // Annulus between the board outline and the grid opening, extruded forward
  // from the board face so the top of the wall overlooks the play field.
  function createWallGeometry(THREE) {
    const shape = roundedRectShape(THREE, BOARD_W, BOARD_H, BOARD_CORNER);
    shape.holes.push(roundedRectShape(THREE, GRID_W, GRID_H, GRID_CORNER));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: WALL_HEIGHT,
      bevelEnabled: true,
      bevelThickness: WALL_BEVEL,
      bevelSize: WALL_BEVEL,
      bevelSegments: WALL_BEVEL_SEGMENTS,
      curveSegments: 12
    });
    // The bevel extends behind z=0, so push the ring forward to seat its base
    // on the board face instead of sinking into it.
    geo.translate(0, 0, WALL_BEVEL + GRID_FLOOR_Z);
    return geo;
  }

  // Silhouette of one side of the wall, from its base up to its top face.
  // ExtrudeGeometry rounds a bevel along a quarter circle rather than cutting a
  // flat chamfer, and samples it at bevelSegments steps, so walking the same arc
  // at the same steps is what makes a gate's faces land exactly on the wall's.
  // Offsetting the profile outward is a matter of growing the lip radius while
  // its centres stay put, which moves every face out by the same amount.
  function wallProfilePoints(swell) {
    const flat = WALL_THICKNESS / 2;
    const lip = WALL_BEVEL + (swell || 0);
    const bodyLow = GRID_FLOOR_Z + WALL_BEVEL;
    const bodyHigh = bodyLow + WALL_HEIGHT;
    const points = [];
    for (let i = 0; i < WALL_BEVEL_SEGMENTS; i++) {
      const t = ((i / WALL_BEVEL_SEGMENTS) * Math.PI) / 2;
      points.push([
        flat + lip * Math.sin(t),
        bodyLow - lip * Math.cos(t)
      ]);
    }
    points.push([flat + lip, bodyLow]);
    points.push([flat + lip, bodyHigh]);
    for (let i = WALL_BEVEL_SEGMENTS - 1; i >= 0; i--) {
      const t = ((i / WALL_BEVEL_SEGMENTS) * Math.PI) / 2;
      points.push([
        flat + lip * Math.sin(t),
        bodyHigh + lip * Math.cos(t)
      ]);
    }
    return points;
  }

  // The wall's full cross-section: thickness across (x), height in y.
  function wallProfileShape(THREE, swell) {
    const side = wallProfilePoints(swell);
    const shape = new THREE.Shape();
    shape.moveTo(side[0][0], side[0][1]);
    for (let i = 1; i < side.length; i++) {
      shape.lineTo(side[i][0], side[i][1]);
    }
    for (let i = side.length - 1; i >= 0; i--) {
      shape.lineTo(-side[i][0], side[i][1]);
    }
    shape.closePath();
    return shape;
  }

  // Sweeping the wall's cross-section along the edge gives a gate whose faces
  // follow the wall's and whose ends are flat cuts exactly on the cell
  // boundaries, with no geometry buried inside the wall. Extruding a footprint
  // along z instead leaves sloped end faces sitting a hair inside the wall.
  // GATE_SWELL then lifts the whole sweep clear of the wall surface — see the
  // constant for why that beats sorting the two coplanar surfaces in depth.
  function createGateGeometry(THREE, layout) {
    const length = layout.span * GRID_CELL;
    const geo = new THREE.ExtrudeGeometry(wallProfileShape(THREE, GATE_SWELL), {
      depth: length,
      bevelEnabled: false,
      curveSegments: 1
    });
    geo.translate(0, 0, -length / 2);
    // Sweep direction runs along local z; stand the profile up so its height
    // maps to world z, then turn it to lie along a horizontal edge.
    geo.rotateX(Math.PI / 2);
    if (layout.edge === 'top' || layout.edge === 'bottom') {
      geo.rotateZ(-Math.PI / 2);
    }
    return geo;
  }

  function gatePosition(layout) {
    const along = (layout.cell + layout.span / 2) * GRID_CELL;
    const offset = WALL_THICKNESS / 2;
    if (layout.edge === 'top') {
      return [-GRID_W / 2 + along, GRID_H / 2 + offset];
    }
    if (layout.edge === 'bottom') {
      return [-GRID_W / 2 + along, -GRID_H / 2 - offset];
    }
    if (layout.edge === 'left') {
      return [-GRID_W / 2 - offset, GRID_H / 2 - along];
    }
    return [GRID_W / 2 + offset, GRID_H / 2 - along];
  }

  function addWallGates(THREE, board) {
    const materials = {};
    const geometries = [];
    GATE_LAYOUTS.forEach(function (layout) {
      if (!materials[layout.color]) {
        // Wall-like finish in the piece colour, with no vertical gradient so
        // gates read evenly whichever edge they sit on.
        const material = toyMat(THREE, COLORS[layout.color], {
          roughness: 0.8,
          envMapIntensity: 0.13,
          rimStrength: 0.03
        });
        materials[layout.color] = material;
      }
      const geometry = createGateGeometry(THREE, layout);
      geometries.push(geometry);
      const gate = new THREE.Mesh(geometry, materials[layout.color]);
      const position = gatePosition(layout);
      gate.position.set(position[0], position[1], 0);
      gate.castShadow = true;
      gate.receiveShadow = true;
      board.add(gate);
    });

    return {
      geometries: geometries,
      materials: Object.keys(materials).map(function (key) {
        return materials[key];
      })
    };
  }

  function roundedRectPath(ctx, x, y, w, h, rx, ry) {
    const rX = Math.min(rx, w / 2);
    const rY = Math.min(ry, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rX, y);
    ctx.lineTo(x + w - rX, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rY);
    ctx.lineTo(x + w, y + h - rY);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rX, y + h);
    ctx.lineTo(x + rX, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rY);
    ctx.lineTo(x, y + rY);
    ctx.quadraticCurveTo(x, y, x + rX, y);
    ctx.closePath();
  }

  // Canvas overlay of square cells, clipped to the same rounded opening as the
  // wall so the lines stop at the corners instead of running under the rim.
  function createGridOverlay(THREE) {
    const canvas = document.createElement('canvas');
    const tw = 512;
    const th = Math.round(tw * (GRID_H / GRID_W));
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    const rx = (GRID_CORNER / GRID_W) * tw;
    const ry = (GRID_CORNER / GRID_H) * th;
    roundedRectPath(ctx, 0.5, 0.5, tw - 1, th - 1, rx, ry);
    ctx.clip();
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'butt';
    for (let col = 1; col < GRID_COLS; col++) {
      const x = (col / GRID_COLS) * tw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, th);
      ctx.stroke();
    }
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = (row / GRID_ROWS) * th;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(tw, y);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W, GRID_H), mat);
    mesh.position.z = GRID_FLOOR_Z + 0.018;
    mesh.renderOrder = 2;
    return { mesh: mesh, texture: texture };
  }

  // Walks the boundary of a piece's cells and returns its corners, wound
  // counter-clockwise in cell units where cell (c, r) spans x [c, c+1] and
  // y [-r-1, -r]. Cells must be edge-connected; two cells meeting only at a
  // diagonal would pinch the boundary and are not supported.
  function traceCellOutline(cells) {
    const filled = {};
    cells.forEach(function (cell) {
      filled[cell[0] + ',' + cell[1]] = true;
    });
    const has = function (c, r) {
      return filled[c + ',' + r] === true;
    };
    const keyOf = function (point) {
      return point[0] + ',' + point[1];
    };

    // Each exposed cell side contributes one directed edge. Wound so the
    // interior always lies to the left of travel.
    const edges = {};
    cells.forEach(function (cell) {
      const c = cell[0];
      const r = cell[1];
      const topLeft = [c, -r];
      const topRight = [c + 1, -r];
      const bottomRight = [c + 1, -r - 1];
      const bottomLeft = [c, -r - 1];
      if (!has(c, r + 1)) edges[keyOf(bottomLeft)] = [bottomLeft, bottomRight];
      if (!has(c + 1, r)) edges[keyOf(bottomRight)] = [bottomRight, topRight];
      if (!has(c, r - 1)) edges[keyOf(topRight)] = [topRight, topLeft];
      if (!has(c - 1, r)) edges[keyOf(topLeft)] = [topLeft, bottomLeft];
    });

    const loop = [];
    let cursor = Object.keys(edges)[0];
    while (cursor && edges[cursor]) {
      const edge = edges[cursor];
      delete edges[cursor];
      loop.push(edge[0]);
      cursor = keyOf(edge[1]);
    }

    // Drop the points where travel continues straight, leaving only corners.
    return loop.filter(function (point, i) {
      const prev = loop[(i - 1 + loop.length) % loop.length];
      const next = loop[(i + 1) % loop.length];
      const inX = point[0] - prev[0];
      const inY = point[1] - prev[1];
      const outX = next[0] - point[0];
      const outY = next[1] - point[1];
      return inX * outY - inY * outX !== 0;
    });
  }

  function cornerUnit(from, to) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / len, dy / len];
  }

  // One continuous silhouette: every corner of the traced outline is rounded,
  // so outer corners read as soft plastic and inner corners as fillets rather
  // than as the seam between two tiles.
  function roundedOutlineShape(THREE, points, radius) {
    const shape = new THREE.Shape();
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const point = points[i];
      const next = points[(i + 1) % n];
      const toPrev = cornerUnit(point, prev);
      const toNext = cornerUnit(point, next);
      const lenPrev = Math.abs(point[0] - prev[0]) + Math.abs(point[1] - prev[1]);
      const lenNext = Math.abs(point[0] - next[0]) + Math.abs(point[1] - next[1]);
      const r = Math.min(radius, lenPrev / 2, lenNext / 2);
      const start = [point[0] + toPrev[0] * r, point[1] + toPrev[1] * r];
      const end = [point[0] + toNext[0] * r, point[1] + toNext[1] * r];
      if (i === 0) shape.moveTo(start[0], start[1]);
      else shape.lineTo(start[0], start[1]);
      shape.quadraticCurveTo(point[0], point[1], end[0], end[1]);
    }
    shape.closePath();
    return shape;
  }

  // Extrudes the whole piece as a single solid. Returns the geometry recentred
  // on its own bounds, plus the offset needed to put it back in place, so the
  // toy shader's vertical gradient is symmetrical on every piece.
  function createPieceGeometry(THREE, cells) {
    const corners = traceCellOutline(cells).map(function (point) {
      return [point[0] * GRID_CELL, point[1] * GRID_CELL];
    });
    const n = corners.length;
    // Both edges at a corner are axis-aligned and perpendicular, so summing
    // their inward offsets lands exactly on the inset corner.
    const inset = corners.map(function (point, i) {
      const prev = corners[(i - 1 + n) % n];
      const next = corners[(i + 1) % n];
      const inbound = cornerUnit(prev, point);
      const outbound = cornerUnit(point, next);
      return [
        point[0] + (-inbound[1] + -outbound[1]) * BLOCK_INSET,
        point[1] + (inbound[0] + outbound[0]) * BLOCK_INSET
      ];
    });

    const geo = new THREE.ExtrudeGeometry(
      roundedOutlineShape(THREE, inset, BLOCK_CORNER),
      {
        depth: BLOCK_DEPTH,
        bevelEnabled: true,
        bevelThickness: BLOCK_BEVEL,
        bevelSize: BLOCK_BEVEL,
        bevelSegments: 4,
        curveSegments: 10
      }
    );
    // Seat the back bevel just above the grid overlay.
    geo.translate(0, 0, BLOCK_BEVEL);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const centreX = (box.min.x + box.max.x) / 2;
    const centreY = (box.min.y + box.max.y) / 2;
    geo.translate(-centreX, -centreY, 0);
    return { geometry: geo, offsetX: centreX, offsetY: centreY };
  }

  function addPuzzleBlocks(THREE, board) {
    const materials = {};
    ['blockRed', 'blockBlue', 'blockYellow'].forEach(function (key) {
      materials[key] = toyMat(THREE, COLORS[key], {
        roughness: 0.74,
        envMapIntensity: 0.16,
        rimStrength: 0.035,
        gradMin: 0.91,
        gradMax: 1.08,
        gradScale: 1 / (GRID_CELL * 1.2)
      });
    });

    // A layout's cell coordinates start at the corner of its first cell, not
    // the centre, so placement is measured from the grid's top-left corner.
    const originX = -GRID_W / 2;
    const originY = GRID_H / 2;
    const geometries = [];
    BLOCK_LAYOUTS.forEach(function (layout) {
      const piece = createPieceGeometry(THREE, layout.cells);
      geometries.push(piece.geometry);
      const mesh = new THREE.Mesh(piece.geometry, materials[layout.color]);
      mesh.position.set(
        originX + layout.col * GRID_CELL + piece.offsetX,
        originY - layout.row * GRID_CELL + piece.offsetY,
        GRID_FLOOR_Z + 0.045
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      board.add(mesh);
    });

    return {
      geometries: geometries,
      materials: Object.keys(materials).map(function (key) {
        return materials[key];
      })
    };
  }

  function buildBoard(THREE) {
    const board = new THREE.Group();
    // The baked look-at is y −4.5, but applyPresetCameraTo then rotateX(rotX −
    // 0.35) pitches the view so a board on that point sits low in the frame.
    // −2.9 is the empirical centre between the old high placement (−0.3) and
    // the look-at.
    board.position.y = -2.9;

    const frameMat = toyMat(THREE, COLORS.boardFrame, {
      roughness: 0.86,
      envMapIntensity: 0.1,
      rimStrength: 0.02,
      gradMin: 0.96,
      gradMax: 1.03,
      gradScale: 1 / 4.6
    });
    const frame = new THREE.Mesh(
      slabGeometry(THREE, BOARD_W, BOARD_H, BOARD_CORNER, BOARD_BASE_DEPTH),
      frameMat
    );
    frame.castShadow = true;
    frame.receiveShadow = true;
    board.add(frame);

    const floorMat = toyMat(THREE, COLORS.boardInset, {
      roughness: 0.92,
      envMapIntensity: 0.06,
      rimStrength: 0.01,
      gradMin: 0.98,
      gradMax: 1.02,
      gradScale: 1 / 4
    });
    // Slightly oversized so its edge tucks under the wall base instead of
    // leaving a seam of frame colour around the opening.
    const floor = new THREE.Mesh(
      slabGeometry(THREE, GRID_W + 0.16, GRID_H + 0.16, GRID_CORNER, 0.12),
      floorMat
    );
    floor.position.z = GRID_FLOOR_Z;
    floor.receiveShadow = true;
    board.add(floor);

    const wallMat = toyMat(THREE, COLORS.boardWall, {
      roughness: 0.84,
      envMapIntensity: 0.12,
      rimStrength: 0.025,
      gradMin: 0.94,
      gradMax: 1.06,
      gradScale: 1 / 4.6
    });
    const wall = new THREE.Mesh(createWallGeometry(THREE), wallMat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    board.add(wall);

    const overlay = createGridOverlay(THREE);
    board.add(overlay.mesh);
    board.userData.gridTexture = overlay.texture;
    board.userData.blockResources = addPuzzleBlocks(THREE, board);
    board.userData.gateResources = addWallGates(THREE, board);

    return board;
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

    let gridTexture = null;
    const boardResources = [];

    // Minimal mode (in-game backdrop) carries no geometry at all — just the
    // background, lighting and post chain behind the game's own UI.
    if (!minimal) {
      // Cool oversized stage catches the soft board shadow while filling the
      // camera frame.
      const stageMat = new THREE.MeshStandardMaterial({
        color: toLinearColor(THREE, COLORS.stage),
        roughness: 0.97,
        metalness: 0.0,
        envMapIntensity: 0.03
      });
      stageMat.userData.envBase = 0.03;
      const stage = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), stageMat);
      stage.position.z = -0.92;
      stage.receiveShadow = true;
      contentGroup.add(stage);

      const board = buildBoard(THREE);
      gridTexture = board.userData.gridTexture || null;
      [board.userData.blockResources, board.userData.gateResources].forEach(
        function (bundle) {
          if (bundle) boardResources.push(bundle);
        }
      );
      contentGroup.add(board);
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
        grade: post ? post.grade : null
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
        if (gridTexture) gridTexture.dispose();
        boardResources.forEach(function (bundle) {
          bundle.geometries.forEach(function (geometry) {
            geometry.dispose();
          });
          bundle.materials.forEach(function (material) {
            material.dispose();
          });
        });
        kit.dispose();
        mounted = false;
      }
    };
  }

  if (global.KPFVisualBridge) {
    global.KPFVisualBridge.register(PRESET_ID, buildScene);
  }
})(typeof window !== 'undefined' ? window : globalThis);
