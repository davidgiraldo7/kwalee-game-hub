// Soft-3D settings toggles — same slab language + expand/pop feel as gameplay.
//
// Tunables live on SETTINGS_TOGGLE_CFG at the top of this file.
// Edit values there, then refresh (or call SettingsBlockToggles.applyConfig()).
(function () {
    const SETTINGS_TOGGLE_CFG = {
        // ---- Sand tile track (the only background) ----
        tileColor: null,          // null = use CS3D_CFG.TILE_COLOR
        viewSpanX: 2.92,          // framed track width (cells)
        viewSpanZ: 1.14,          // framed track depth (cells)
        tileHeight: 0.14,         // sand tile thickness scale
        tileYOffset: 0.04,        // sand tile Y lift
        tileCorner: null,         // null = use CS3D_CFG.CORNER_R

        // ---- Camera / block travel ----
        cameraZoom: 1.02,
        edgePad: 0.07,            // gap between block ends and track ends
        offW: 1,                  // compact (off) block width

        // ---- CSS chrome ----
        cssWidth: 92,             // toggle width (px)
        cssHeight: 36,            // toggle height (px)
        cssRadius: 10,            // toggle border-radius (px)

        // ---- Hollow circle ----
        socketSize: 14,           // circle diameter (px)
        socketBorder: 2,          // circle stroke (px)
    };
    window.SETTINGS_TOGGLE_CFG = SETTINGS_TOGGLE_CFG;
    const CFG = SETTINGS_TOGGLE_CFG;

    const COLORS = {
        off: "#f04e66", // red when off
        on: "#45c977",  // green when on
    };

    /** @type {Array<ReturnType<typeof makeToggle>>} */
    let toggles = [];
    let raf = 0;
    let lastTs = 0;
    let running = false;

    function tileSpanX() {
        return CFG.viewSpanX;
    }

    function tileColorHex() {
        return CFG.tileColor || CS3D_CFG.TILE_COLOR;
    }

    function onW() {
        return Math.max(CFG.offW + 0.05, tileSpanX() - CFG.edgePad * 2);
    }

    function applyCssChrome() {
        const track = tileColorHex();
        document.querySelectorAll(".settings-card .toggle").forEach((el) => {
            el.style.setProperty("--toggle-w", `${CFG.cssWidth}px`);
            el.style.setProperty("--toggle-h", `${CFG.cssHeight}px`);
            el.style.setProperty("--toggle-radius", `${CFG.cssRadius}px`);
            el.style.setProperty("--toggle-track", track);
            el.style.setProperty("--toggle-socket-size", `${CFG.socketSize}px`);
            el.style.setProperty("--toggle-socket-border", `${CFG.socketBorder}px`);
        });
    }

    function rebuildSlotGeo(state) {
        const T = window.THREE;
        const tileCorner = CFG.tileCorner == null ? CS3D_CFG.CORNER_R : CFG.tileCorner;
        const hex = tileColorHex();

        // No platform rim — sand tile is the full track background.
        if (state.platform) state.platform.visible = false;

        if (state.tile.geometry) state.tile.geometry.dispose();
        state.tile.geometry = cs3dSlabGeo(CFG.viewSpanX, CFG.viewSpanZ, tileCorner, false);
        state.tile.scale.y = CFG.tileHeight;
        state.tile.position.y = CS3D_CFG.TILE_Y + CFG.tileYOffset;
        state.tile.material.color.copy(cs3dColor(hex));
        state.tile.material.needsUpdate = true;

        state.renderer.setClearColor(new T.Color(hex), 1);
    }

    function makeToggle(label) {
        const T = window.THREE;
        const input = label.querySelector("input");
        let canvas = label.querySelector("canvas.knob");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.className = "knob";
            canvas.setAttribute("aria-hidden", "true");
            label.appendChild(canvas);
        }

        let renderer;
        try {
            renderer = new T.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
                powerPreference: "low-power",
            });
        } catch (err) {
            console.error("[SettingsBlockToggles] WebGLRenderer failed", err);
            return null;
        }
        renderer.setClearColor(new T.Color(tileColorHex()), 1);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        if ("outputColorSpace" in renderer && T.SRGBColorSpace) {
            renderer.outputColorSpace = T.SRGBColorSpace;
        } else if ("outputEncoding" in renderer) {
            renderer.outputEncoding = T.sRGBEncoding;
        }
        renderer.toneMapping = T.NoToneMapping;

        const scene = new T.Scene();
        const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
        const root = new T.Group();
        scene.add(root);

        scene.add(new T.AmbientLight(0xffffff, 0.26));
        scene.add(new T.HemisphereLight(0xfff4e6, 0xc9a77d, 0.31));
        const key = new T.DirectionalLight(0xfff0dd, 0.61);
        key.position.set(2.2, 5.5, 1.4);
        key.castShadow = true;
        key.shadow.mapSize.set(256, 256);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 20;
        key.shadow.camera.left = -3;
        key.shadow.camera.right = 3;
        key.shadow.camera.top = 3;
        key.shadow.camera.bottom = -3;
        key.shadow.radius = 4;
        scene.add(key);
        const fill = new T.DirectionalLight(0xc0cad6, 0.26);
        fill.position.set(-2.4, 2.2, -1.6);
        scene.add(fill);

        const platformMat = new T.MeshStandardMaterial({
            color: cs3dColor(CFG.platformColor),
            roughness: CS3D_CFG.PLATFORM_ROUGHNESS,
            metalness: 0,
        });
        const platform = new T.Mesh(cs3dSlabGeo(1, 1, CFG.platformCorner, false), platformMat);
        platform.receiveShadow = true;
        root.add(platform);

        const tileMat = new T.MeshStandardMaterial({
            color: cs3dColor(CS3D_CFG.TILE_COLOR),
            roughness: CS3D_CFG.TILE_ROUGHNESS,
            metalness: 0,
        });
        const tile = new T.Mesh(cs3dSlabGeo(1, 1, CS3D_CFG.CORNER_R, false), tileMat);
        tile.receiveShadow = true;
        root.add(tile);

        const hex = input.checked ? COLORS.on : COLORS.off;
        const mat = new T.MeshStandardMaterial({
            color: cs3dColor(hex),
            roughness: CS3D_CFG.BLOCK_ROUGHNESS,
            metalness: CS3D_CFG.BLOCK_METALNESS,
            emissive: cs3dColor(hex).multiplyScalar(CS3D_CFG.BLOCK_EMISSIVE),
            emissiveIntensity: 1,
        });
        const mesh = new T.Mesh(
            cs3dSlabGeo(1, 1, CS3D_CFG.CORNER_R, false),
            mat
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);

        let socket = label.querySelector(".toggle-socket");
        if (!socket) {
            socket = document.createElement("span");
            socket.className = "toggle-socket";
            socket.setAttribute("aria-hidden", "true");
            label.appendChild(socket);
        }

        const target = input.checked ? onW() : CFG.offW;
        const state = {
            label,
            input,
            canvas,
            socket,
            renderer,
            scene,
            camera,
            mesh,
            mat,
            platform,
            tile,
            _proj: new T.Vector3(),
            _colOff: cs3dColor(COLORS.off),
            _colOn: cs3dColor(COLORS.on),
            _colMix: new T.Color(),
            targetW: target,
            renderW: target,
            geoW: 1,
            jiggleX: 0,
            jiggleVX: 0,
            jiggleY: 0,
            jiggleVY: 0,
            wiggle: 0,
            wigglePhase: 0,
            wiggleDecay: CS.POP_DECAY,
        };

        rebuildSlotGeo(state);

        if (!input._sbtChangeBound) {
            input._sbtChangeBound = true;
            input.addEventListener("change", () => {
                const live = toggles.find((t) => t && t.input === input);
                if (!live) return;
                const on = input.checked;
                live.targetW = on ? onW() : CFG.offW;
                live.wiggle = on ? CS.EXPAND_POP : CS.EXPAND_POP * 0.55;
                live.wigglePhase = 0;
                live.wiggleDecay = CS.POP_DECAY;
                live.jiggleVX += on ? 0.55 : -0.35;
                live.jiggleVY += on ? 0.25 : 0.45;
                startLoop();
            });
        }

        return state;
    }

    function disposeToggle(state) {
        if (!state) return;
        const drop = (o) => { try { if (o && o.dispose) o.dispose(); } catch (_) { /* ignore */ } };
        if (state.mesh) {
            drop(state.mesh.geometry);
            drop(state.mat);
        }
        if (state.tile) {
            drop(state.tile.geometry);
            drop(state.tile.material);
        }
        if (state.platform) {
            drop(state.platform.geometry);
            drop(state.platform.material);
        }
        if (typeof cs3dReleaseRenderer === "function") {
            cs3dReleaseRenderer(state.renderer);
        } else {
            try { state.renderer.dispose(); } catch (_) { /* ignore */ }
        }
        if (state.canvas && state.canvas.parentNode) {
            const next = document.createElement("canvas");
            next.className = "knob";
            next.setAttribute("aria-hidden", "true");
            state.canvas.parentNode.replaceChild(next, state.canvas);
        }
    }

    function disposeAll() {
        if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
        running = false;
        lastTs = 0;
        for (const state of toggles) disposeToggle(state);
        toggles = [];
    }

    function ensureToggles() {
        if (toggles.length) return true;
        const labels = document.querySelectorAll(".settings-card .toggle");
        if (!labels.length) return false;
        toggles = Array.from(labels).map(makeToggle).filter(Boolean);
        return toggles.length > 0;
    }

    function layoutCamera(state, cssW, cssH) {
        const cam = state.camera;
        const tilt = CS3D_CFG.TILT_DEG * Math.PI / 180;
        const aspect = cssW / cssH;
        let halfW = CFG.viewSpanX / 2;
        let halfH = (CFG.viewSpanZ * Math.cos(tilt) + CS3D_CFG.BLOCK_H * Math.sin(tilt)) / 2;
        if (halfW / halfH > aspect) halfH = halfW / aspect;
        else halfW = halfH * aspect;
        const zoom = CFG.cameraZoom;
        halfW *= zoom;
        halfH *= zoom;
        cam.left = -halfW;
        cam.right = halfW;
        cam.top = halfH;
        cam.bottom = -halfH;
        const dist = 18;
        cam.near = 0.1;
        cam.far = 80;
        cam.up.set(0, 1, 0);
        cam.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
        cam.quaternion.identity();
        cam.rotation.set(0, 0, 0);
        cam.lookAt(0, CS3D_CFG.BLOCK_H * 0.15, 0);
        cam.updateProjectionMatrix();
        state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        state.renderer.setSize(cssW, cssH, false);
    }

    function ensureGeo(state) {
        const QSTEP = 0.1;
        const aw = Math.round(state.renderW / QSTEP) * QSTEP;
        if (Math.abs(aw - state.geoW) < 0.001) return;
        state.geoW = Math.max(0.04, aw);
        const geo = cs3dSlabGeo(state.geoW, 1, CS3D_CFG.CORNER_R, false);
        if (state.mesh.geometry) state.mesh.geometry.dispose();
        state.mesh.geometry = geo;
    }

    function updateBlock(state, dtSec) {
        const offW = CFG.offW;
        const expandedW = onW();
        // Keep target in sync if CFG changed while a toggle was mid-state.
        state.targetW = state.input.checked ? expandedW : offW;

        const smoothW = 1 - Math.exp(-CS.EXPAND_K * dtSec);
        state.renderW += (state.targetW - state.renderW) * smoothW;

        state.jiggleVX += (-CS.SPRING_K * state.jiggleX - CS.SPRING_D * state.jiggleVX) * dtSec;
        state.jiggleX += state.jiggleVX * dtSec;
        state.jiggleVY += (-CS.SPRING_K * state.jiggleY - CS.SPRING_D * state.jiggleVY) * dtSec;
        state.jiggleY += state.jiggleVY * dtSec;
        state.jiggleX = Math.max(-0.35, Math.min(0.35, state.jiggleX));
        state.jiggleY = Math.max(-0.35, Math.min(0.35, state.jiggleY));

        if (state.wiggle > 0.0005) {
            state.wigglePhase += dtSec * CS.POP_FREQ;
            state.wiggle *= Math.exp(-state.wiggleDecay * dtSec);
        } else {
            state.wiggle = 0;
        }

        const wob = Math.sin(state.wigglePhase) * CS.POP_AMP * state.wiggle;
        const sx = 1 + state.jiggleX + wob;
        const sz = 1 + state.jiggleY - wob;
        const vScale = Math.max(0.55, Math.min(1.7,
            1 - ((sx - 1) + (sz - 1)) * CS3D_CFG.HEIGHT_SQUASH));

        ensureGeo(state);
        const fpW = state.renderW;
        const geoW = state.geoW;
        const bob = wob * CS3D_CFG.BLOCK_H * CS3D_CFG.BOB;
        const leftEdge = -CFG.viewSpanX * 0.5 + CFG.edgePad;
        const cx = leftEdge + fpW * 0.5;

        state.mesh.scale.set((fpW / geoW) * sx, vScale, sz);
        const by = CS3D_CFG.BLOCK_BASE_Y + CS3D_CFG.BLOCK_H * vScale / 2 + bob;
        state.mesh.position.set(cx, by, 0);
        state.mesh.rotation.set(
            state.jiggleY * CS3D_CFG.WOBBLE_ROT,
            0,
            -state.jiggleX * CS3D_CFG.WOBBLE_ROT
        );

        const expandT = Math.max(0, Math.min(1, (fpW - offW) / (expandedW - offW)));
        state._colMix.copy(state._colOff).lerp(state._colOn, expandT);
        state.mat.color.copy(state._colMix);
        const glow = CS3D_CFG.BLOCK_EMISSIVE;
        state.mat.emissive.copy(state.mat.color).multiplyScalar(glow);

        const edgeInset = offW * 0.5;
        const circleLocalX = expandT * (fpW * 0.5 - edgeInset);
        syncSocket(state, cx + circleLocalX, by);
    }

    function syncSocket(state, cx, by) {
        const socket = state.socket;
        if (!socket) return;
        const cssW = state.label.clientWidth || CFG.cssWidth;
        const cssH = state.label.clientHeight || CFG.cssHeight;
        state._proj.set(cx, by + CS3D_CFG.BLOCK_H * 0.15, 0);
        state._proj.project(state.camera);
        const px = (state._proj.x * 0.5 + 0.5) * cssW;
        const py = (-state._proj.y * 0.5 + 0.5) * cssH;
        socket.style.left = `${px}px`;
        socket.style.top = `${py}px`;
    }

    function settled(state) {
        return Math.abs(state.renderW - state.targetW) < 0.015
            && state.wiggle < 0.01
            && Math.abs(state.jiggleX) < 0.004
            && Math.abs(state.jiggleY) < 0.004
            && Math.abs(state.jiggleVX) < 0.02
            && Math.abs(state.jiggleVY) < 0.02;
    }

    function frame(ts) {
        raf = 0;
        if (!toggles.length) {
            running = false;
            lastTs = 0;
            return;
        }
        if (!lastTs) lastTs = ts;
        const dtSec = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;

        const open = document.getElementById("settingsOverlay")?.classList.contains("show");
        let needsMore = false;
        for (const state of toggles) {
            if (!open && settled(state)) continue;
            updateBlock(state, dtSec);
            state.renderer.shadowMap.needsUpdate = true;
            state.renderer.render(state.scene, state.camera);
            if (!settled(state) || open) needsMore = true;
        }

        if (needsMore && (open || toggles.some((s) => !settled(s)))) {
            raf = requestAnimationFrame(frame);
        } else {
            running = false;
            lastTs = 0;
        }
    }

    function startLoop() {
        if (running || !toggles.length) return;
        running = true;
        lastTs = 0;
        raf = requestAnimationFrame(frame);
    }

    function resizeAll() {
        if (!toggles.length) return;
        applyCssChrome();
        for (const state of toggles) {
            const cssW = state.label.clientWidth || CFG.cssWidth;
            const cssH = state.label.clientHeight || CFG.cssHeight;
            layoutCamera(state, cssW, cssH);
            updateBlock(state, 0);
            state.renderer.shadowMap.needsUpdate = true;
            state.renderer.render(state.scene, state.camera);
        }
    }

    function applyConfig() {
        applyCssChrome();
        if (!toggles.length) return;
        for (const state of toggles) {
            rebuildSlotGeo(state);
            state.targetW = state.input.checked ? onW() : CFG.offW;
            if (Math.abs(state.renderW - state.targetW) < 0.02) {
                state.renderW = state.targetW;
            }
        }
        resizeAll();
        startLoop();
    }

    function refresh() {
        if (!ensureToggles()) return;
        resizeAll();
        startLoop();
    }

    function init() {
        if (!window.THREE || typeof cs3dSlabGeo !== "function" || typeof CS3D_CFG === "undefined" || typeof CS === "undefined") {
            return;
        }
        applyCssChrome();
        // WebGL knobs are created only while settings are open — three permanent
        // contexts at boot was exhausting Capacitor's WebGL budget.

        const overlay = document.getElementById("settingsOverlay");
        if (overlay) {
            const mo = new MutationObserver(() => {
                if (overlay.classList.contains("show")) {
                    refresh();
                } else {
                    disposeAll();
                }
            });
            mo.observe(overlay, { attributes: true, attributeFilter: ["class"] });
        }
        window.addEventListener("resize", () => {
            if (toggles.length) resizeAll();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        setTimeout(init, 0);
    }

    window.SettingsBlockToggles = {
        cfg: CFG,
        refresh,
        dispose: disposeAll,
        applyConfig,
    };
})();
