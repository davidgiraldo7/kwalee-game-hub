(function (global) {
    'use strict';

    const PRESET_NAME = 'toyfactory-polish-v1';

    function createKit(options) {
        const opts = options || {};
        const THREE = opts.THREE || global.THREE;
        if (!THREE) throw new Error('THREE is required for toyfactory scene preset');

        const container = opts.container;
        if (!container) throw new Error('container is required for toyfactory scene preset');

        const controlsCtor = opts.OrbitControls || global.THREE.OrbitControls || global.OrbitControls;
        const viewportWidth = () => (opts.width || global.innerWidth || container.clientWidth || 1);
        const viewportHeight = () => (opts.height || global.innerHeight || container.clientHeight || 1);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#F9F6F0');

        const camera = new THREE.PerspectiveCamera(28, viewportWidth() / viewportHeight(), 0.1, 200);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
        renderer.setSize(viewportWidth(), viewportHeight());
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        let controls = null;
        if (typeof controlsCtor === 'function') {
            controls = new controlsCtor(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.minPolarAngle = Math.PI / 4.2;
            controls.maxPolarAngle = Math.PI / 4.2;
            controls.enableRotate = false;
            controls.enablePan = false;
            controls.enableZoom = false;
            controls.target.set(0, -0.6, 2.0);
        }

        // Default hero framing for a pleasant first view.
        camera.position.set(0, 18, 36);
        camera.lookAt(0, 1, 8);
        if (controls) {
            controls.target.set(0, 1, 8);
            controls.update();
        }

        const camDebug = {
            angleDeg: 35,
            distance: 50,
            fov: 27,
            targetY: -1.3,
            targetZ: 9.5
        };

        function resize() {
            const w = viewportWidth();
            const h = viewportHeight();
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }

        function dispose() {
            if (renderer && renderer.domElement && renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
            renderer.dispose();
        }

        return { scene, camera, renderer, controls, camDebug, resize, dispose, THREE };
    }

    function addToyFactoryLighting(kit) {
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

        return { ambientLight, hemiLight, keyLight, fillLight };
    }

    function createPlasticMaterials(THREE, palette) {
        return (palette || []).map(function (color) {
            return new THREE.MeshStandardMaterial({
                color: new THREE.Color(color).convertSRGBToLinear(),
                roughness: 0.75,
                metalness: 0.0
            });
        });
    }

    function createLiteScene(options) {
        const kit = createKit(options);
        const THREE = kit.THREE;
        addToyFactoryLighting(kit);

        const scene = kit.scene;

        const floorMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#C9A77D').convertSRGBToLinear(),
            roughness: 0.9,
            metalness: 0.0
        });
        const table = new THREE.Mesh(new THREE.BoxGeometry(120, 10, 120), floorMat);
        table.position.y = -5;
        table.receiveShadow = true;
        scene.add(table);

        const wallMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#E5C69F').convertSRGBToLinear(),
            roughness: 0.8,
            metalness: 0.0
        });
        const board = new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 26), wallMat);
        board.position.set(0, 0.65, 8);
        board.receiveShadow = true;
        scene.add(board);

        // Starter primitive cluster so every new scene has immediate readable depth and scale.
        const starterMatA = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6CC6FF').convertSRGBToLinear(), roughness: 0.55, metalness: 0.03 });
        const starterMatB = new THREE.MeshStandardMaterial({ color: new THREE.Color('#FF9F5A').convertSRGBToLinear(), roughness: 0.6, metalness: 0.02 });
        const starterMatC = new THREE.MeshStandardMaterial({ color: new THREE.Color('#55D89A').convertSRGBToLinear(), roughness: 0.5, metalness: 0.03 });

        const starterGroup = new THREE.Group();
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

        const palette = ['#6CC6FF', '#FF5E6A', '#FFD95A', '#55D89A', '#FF9F5A'];
        const pieceMats = createPlasticMaterials(THREE, palette);

        const pieces = [];
        const radius = 0.7;
        const gravity = 26;
        const damping = 1.8;
        const minX = -8;
        const maxX = 8;
        const minZ = 0;
        const maxZ = 20;

        function spawnPiece(i) {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.7, 22), pieceMats[i % pieceMats.length]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.rotation.x = Math.PI / 2;
            mesh.position.set((Math.random() - 0.5) * 10, 1.2, -8 - i * 1.8);
            scene.add(mesh);
            pieces.push({
                mesh: mesh,
                vx: (Math.random() - 0.5) * 0.8,
                vz: 2.6 + Math.random() * 1.8
            });
        }

        for (let i = 0; i < 18; i++) spawnPiece(i);

        const clock = { last: performance.now() };

        function step(dtMs) {
            const dt = Math.min(0.05, Math.max(0.001, (dtMs || 16.67) / 1000));
            const substeps = 4;
            const h = dt / substeps;

            starterGroup.rotation.y += dt * 0.18;
            starterSphere.position.y = 1.8 + Math.sin(performance.now() * 0.0017) * 0.08;

            for (let s = 0; s < substeps; s++) {
                for (let i = 0; i < pieces.length; i++) {
                    const p = pieces[i];
                    p.vz += gravity * h;
                    const decay = Math.exp(-damping * h);
                    p.vx *= decay;
                    p.vz *= decay;

                    p.mesh.position.x += p.vx * h;
                    p.mesh.position.z += p.vz * h;

                    if (p.mesh.position.x < minX || p.mesh.position.x > maxX) {
                        p.mesh.position.x = Math.max(minX, Math.min(maxX, p.mesh.position.x));
                        p.vx = -p.vx * 0.35;
                    }

                    if (p.mesh.position.z < minZ) {
                        p.mesh.position.z = minZ;
                        p.vz = Math.abs(p.vz) * 0.25;
                    }
                    if (p.mesh.position.z > maxZ) {
                        p.mesh.position.z = maxZ;
                        p.vz = -Math.abs(p.vz) * 0.3;
                    }

                    p.mesh.rotation.z += (p.vz * h) * 0.8;
                }
            }

            if (kit.controls) kit.controls.update();
            kit.renderer.render(kit.scene, kit.camera);
            clock.last = performance.now();
        }

        function resize() {
            kit.resize();
        }

        function destroy() {
            kit.dispose();
        }

        return {
            preset: PRESET_NAME,
            scene: kit.scene,
            camera: kit.camera,
            renderer: kit.renderer,
            controls: kit.controls,
            step: step,
            resize: resize,
            destroy: destroy
        };
    }

    const api = {
        name: PRESET_NAME,
        createKit,
        addToyFactoryLighting,
        createPlasticMaterials,
        createLiteScene
    };

    global.TFScenePreset = api;

    if (global.KPFSceneBridge && typeof global.KPFSceneBridge.register === 'function') {
        global.KPFSceneBridge.register(PRESET_NAME, function (opts) {
            return createLiteScene(opts || {});
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
