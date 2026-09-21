(function (global) {
    'use strict';

    const PRESET_NAME = 'soft-3d-template-v1';

    function toLinearColor(THREE, hex) {
        const color = new THREE.Color(hex);
        if (typeof color.convertSRGBToLinear === 'function') {
            color.convertSRGBToLinear();
        }
        return color;
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
        if (!THREE) throw new Error('THREE is required for soft 3d template preset');

        const container = opts.container;
        if (!container) throw new Error('container is required for soft 3d template preset');

        const controlsCtor = opts.OrbitControls || global.THREE.OrbitControls || global.OrbitControls;
        const viewportWidth = () => (opts.width || global.innerWidth || container.clientWidth || 1);
        const viewportHeight = () => (opts.height || global.innerHeight || container.clientHeight || 1);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#F9F6F0');

        const camera = new THREE.PerspectiveCamera(28, viewportWidth() / viewportHeight(), 0.1, 200);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
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

        return { ambientLight, hemiLight, keyLight, fillLight };
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

    function createLiteScene(options) {
        const kit = createKit(options);
        const THREE = kit.THREE;
        const lights = addSoftTemplateLighting(kit);

        const scene = kit.scene;

        const floorMat = new THREE.MeshStandardMaterial({
            color: toLinearColor(THREE, '#C9A77D'),
            roughness: 0.9,
            metalness: 0.0
        });
        const table = new THREE.Mesh(new THREE.BoxGeometry(120, 10, 120), floorMat);
        table.position.y = -5;
        table.receiveShadow = true;
        scene.add(table);

        const wallMat = new THREE.MeshStandardMaterial({
            color: toLinearColor(THREE, '#E5C69F'),
            roughness: 0.8,
            metalness: 0.0
        });
        const board = new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 26), wallMat);
        board.position.set(0, 0.65, 8);
        board.receiveShadow = true;
        scene.add(board);

        // Starter primitive cluster so every new scene has immediate readable depth and scale.
        const starterMatA = new THREE.MeshStandardMaterial({ color: toLinearColor(THREE, '#6CC6FF'), roughness: 0.55, metalness: 0.03 });
        const starterMatB = new THREE.MeshStandardMaterial({ color: toLinearColor(THREE, '#FF9F5A'), roughness: 0.6, metalness: 0.02 });
        const starterMatC = new THREE.MeshStandardMaterial({ color: toLinearColor(THREE, '#55D89A'), roughness: 0.5, metalness: 0.03 });

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
        scene.add(testCapsule);

        const testCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.2, 24), staticMats[2]);
        testCylinder.position.set(2.6, 2.05, 10.2);
        testCylinder.castShadow = true;
        testCylinder.receiveShadow = true;
        scene.add(testCylinder);

        const testCone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 26), staticMats[4]);
        testCone.position.set(0.2, 2.0, 5.2);
        testCone.rotation.y = -0.35;
        testCone.castShadow = true;
        testCone.receiveShadow = true;
        scene.add(testCone);

        function render() {
            if (kit.controls) kit.controls.update();
            kit.renderer.render(kit.scene, kit.camera);
        }

        function applyCameraTarget(x, y, z) {
            if (kit.controls && kit.controls.target) {
                kit.controls.target.set(x, y, z);
            } else {
                kit.camera.lookAt(x, y, z);
            }
        }

        function applyDebugState(state) {
            if (!state || typeof state !== 'object') return;

            if (state.camera && typeof state.camera === 'object') {
                const cameraState = state.camera;
                if (typeof cameraState.x === 'number') kit.camera.position.x = cameraState.x;
                if (typeof cameraState.y === 'number') kit.camera.position.y = cameraState.y;
                if (typeof cameraState.z === 'number') kit.camera.position.z = cameraState.z;
                if (typeof cameraState.fov === 'number') kit.camera.fov = cameraState.fov;
                if (typeof cameraState.near === 'number') kit.camera.near = cameraState.near;
                if (typeof cameraState.far === 'number') kit.camera.far = cameraState.far;
                if (typeof cameraState.targetX === 'number' && typeof cameraState.targetY === 'number' && typeof cameraState.targetZ === 'number') {
                    applyCameraTarget(cameraState.targetX, cameraState.targetY, cameraState.targetZ);
                }
                kit.camera.updateProjectionMatrix();
            }

            if (state.lighting && typeof state.lighting === 'object') {
                const l = state.lighting;
                if (typeof l.ambientIntensity === 'number') lights.ambientLight.intensity = l.ambientIntensity;
                if (typeof l.ambientColor === 'string') lights.ambientLight.color.set(l.ambientColor);

                if (typeof l.hemiIntensity === 'number') lights.hemiLight.intensity = l.hemiIntensity;
                if (typeof l.hemiSkyColor === 'string') lights.hemiLight.color.set(l.hemiSkyColor);
                if (typeof l.hemiGroundColor === 'string') lights.hemiLight.groundColor.set(l.hemiGroundColor);

                if (typeof l.keyIntensity === 'number') lights.keyLight.intensity = l.keyIntensity;
                if (typeof l.keyColor === 'string') lights.keyLight.color.set(l.keyColor);
                if (typeof l.keyX === 'number') lights.keyLight.position.x = l.keyX;
                if (typeof l.keyY === 'number') lights.keyLight.position.y = l.keyY;
                if (typeof l.keyZ === 'number') lights.keyLight.position.z = l.keyZ;
                if (typeof l.keyShadowBias === 'number') lights.keyLight.shadow.bias = l.keyShadowBias;
                if (typeof l.keyShadowNormalBias === 'number') lights.keyLight.shadow.normalBias = l.keyShadowNormalBias;

                if (typeof l.fillIntensity === 'number') lights.fillLight.intensity = l.fillIntensity;
                if (typeof l.fillColor === 'string') lights.fillLight.color.set(l.fillColor);
                if (typeof l.fillX === 'number') lights.fillLight.position.x = l.fillX;
                if (typeof l.fillY === 'number') lights.fillLight.position.y = l.fillY;
                if (typeof l.fillZ === 'number') lights.fillLight.position.z = l.fillZ;
            }
        }

        function readDebugState() {
            const target = kit.controls && kit.controls.target
                ? kit.controls.target
                : new THREE.Vector3(0, 0, 0);

            return {
                camera: {
                    x: kit.camera.position.x,
                    y: kit.camera.position.y,
                    z: kit.camera.position.z,
                    fov: kit.camera.fov,
                    near: kit.camera.near,
                    far: kit.camera.far,
                    targetX: target.x,
                    targetY: target.y,
                    targetZ: target.z
                },
                lighting: {
                    ambientIntensity: lights.ambientLight.intensity,
                    ambientColor: '#' + lights.ambientLight.color.getHexString(),
                    hemiIntensity: lights.hemiLight.intensity,
                    hemiSkyColor: '#' + lights.hemiLight.color.getHexString(),
                    hemiGroundColor: '#' + lights.hemiLight.groundColor.getHexString(),
                    keyIntensity: lights.keyLight.intensity,
                    keyColor: '#' + lights.keyLight.color.getHexString(),
                    keyX: lights.keyLight.position.x,
                    keyY: lights.keyLight.position.y,
                    keyZ: lights.keyLight.position.z,
                    keyShadowBias: lights.keyLight.shadow.bias,
                    keyShadowNormalBias: lights.keyLight.shadow.normalBias,
                    fillIntensity: lights.fillLight.intensity,
                    fillColor: '#' + lights.fillLight.color.getHexString(),
                    fillX: lights.fillLight.position.x,
                    fillY: lights.fillLight.position.y,
                    fillZ: lights.fillLight.position.z
                }
            };
        }

        function step() {
            render();
        }

        function resize() {
            kit.resize();
            render();
        }

        function destroy() {
            kit.dispose();
        }

        render();

        return {
            preset: PRESET_NAME,
            scene: kit.scene,
            camera: kit.camera,
            renderer: kit.renderer,
            controls: kit.controls,
            lights: lights,
            render: render,
            step: step,
            applyDebugState: applyDebugState,
            readDebugState: readDebugState,
            resize: resize,
            destroy: destroy
        };
    }

    const api = {
        name: PRESET_NAME,
        createKit,
        addSoftTemplateLighting,
        createPlasticMaterials,
        createLiteScene
    };

    global.Soft3DTemplatePreset = api;

    if (global.Soft3DTemplateBridge && typeof global.Soft3DTemplateBridge.register === 'function') {
        global.Soft3DTemplateBridge.register(PRESET_NAME, function (opts) {
            return createLiteScene(opts || {});
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
