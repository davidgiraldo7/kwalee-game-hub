// Interactive home-screen Soft-3D podium board. Reuses gameplay slab helpers
// + BlockCharacters. Tiered platforms, sparse white-space tiles (never a
// solvable packing), and a fresh random layout each home visit.
(function () {
    const HOME_BOARD_CFG = {
        // Flip to false to restore the video / Home_Art.png background.
        enabled: true,

        // Soft cream behind the board (also paints #startScreen).
        bgColor: "#faf1e2",

        // ---- Camera (Debug → Home / HomeBoard.applyCamera) ----
        camera: {
            tiltDeg: 35,
            orthoZoom: 1.0,
            fitMargin: 1.22,
            lookLift: 1.55,
            // Screen anchor: 0 = centered. +X right, +Y up (fraction of half-view).
            anchorX: 0,
            anchorY: -0.1,
            idleYawDeg: 4.5,
            idleYawPeriodSec: 14,
        },

        // Random expand ↔ collapse. Per-block `autoExpand: false` opts out.
        idleExpand: {
            enabled: true,
            expandedMinSec: 8,
            expandedMaxSec: 12,
            collapsedMinSec: 6,
            collapsedMaxSec: 20,
            startCollapsedMin: 1,
            startCollapsedMax: 4,
        },

        // Podium: 2 layers in Z. Back layer is split left/right — one half higher
        // (like a stepped podium). Front layer is the full-width low step.
        podium: {
            cols: 6,
            rows: 6,
            // Live-editable heights (Debug → Home). backHigh/backLow swap sides
            // when randomizeHighSide flips which half is taller.
            layerHeights: {
                backHigh: 2,
                backLow: 1,
                front: 0.0,
            },
            // col0/col1 inclusive. Back Z = rows 0–1 (split), front Z = rows 2–3.
            // Platform edges use PLATFORM_PAD; adjoining steps inset by the same
            // amount so step walls clear neighboring playable squares.
            tiers: [
                { id: "backL", row0: 0, row1: 1, col0: 0, col1: 2, elev: 0.9 },
                { id: "backR", row0: 0, row1: 1, col0: 3, col1: 5, elev: 0.42 },
                { id: "front", row0: 2, row1: 3, col0: 0, col1: 5, elev: 0.0 },
            ],
            // Flip which back half is taller each home visit.
            randomizeHighSide: true,
            // Always leave ≥1 uncovered playable cell per tier so home can't be "solved".
            gapsPerTier: 2,
            // Extra decorative holes only on cells outside expand footprints + gaps.
            holeChance: 0.2,
            minHoles: 3,
            blockCountMin: 3,
            blockCountMax: 5,
            // Keep sizes that can fit on 3×2 / 6×2 tier plates.
            sizes: [2, 2, 3, 3, 4],
            overfillCells: 2,
        },
    };
    window.HOME_BOARD_CFG = HOME_BOARD_CFG;

    const HOME_VISUAL_STORAGE = "stretchblock_home_board_visual";
    const COLOR_NAMES = ["red", "blue", "green", "orange", "purple", "yellow", "cyan", "pink"];
    const AXES = ["horizontal", "vertical", "square"];

    /** @type {null | object} */
    let sceneState = null;
    let raf = 0;
    let lastTs = 0;
    let running = false;
    let visibilityBound = false;
    let debugPanelEl = null;
    let debugRefresh = null;

    function cam() { return HOME_BOARD_CFG.camera; }

    function podiumCfg() { return HOME_BOARD_CFG.podium; }

    function bgHex() {
        return HOME_BOARD_CFG.bgColor
            || (typeof CS3D_CFG !== "undefined" && CS3D_CFG.BG_COLOR)
            || "#faf1e2";
    }

    function applyBackground() {
        const hex = bgHex();
        HOME_BOARD_CFG.bgColor = hex;
        document.documentElement.style.setProperty("--home-bg", hex);
        const start = document.getElementById("startScreen");
        if (start) start.style.backgroundColor = hex;
        if (sceneState && sceneState.renderer) {
            sceneState.renderer.setClearColor(cs3dColor(hex), 1);
            sceneState.dirtyShadow = true;
        }
        if (debugRefresh) debugRefresh();
    }

    function colorHex(name) {
        const p = (typeof PALETTE !== "undefined" && PALETTE) || {};
        return p[name] || "#f09a42";
    }

    function randRange(min, max) {
        return min + Math.random() * Math.max(0, max - min);
    }

    function randInt(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    function pick(arr) {
        return arr[(Math.random() * arr.length) | 0];
    }

    function idleExpandCfg() {
        return HOME_BOARD_CFG.idleExpand || {};
    }

    function scheduleIdleExpand(block) {
        const p = idleExpandCfg();
        if (block.expanded) {
            block.expandTimer = randRange(p.expandedMinSec || 4, p.expandedMaxSec || 12);
        } else {
            block.expandTimer = randRange(p.collapsedMinSec || 2.5, p.collapsedMaxSec || 7.5);
        }
    }

    function expandedFootprint(size, axis) {
        const n = Math.max(1, size | 0);
        if (n === 1) return { w: 1, h: 1 };
        if (axis === "square") {
            const side = Math.ceil(Math.sqrt(n));
            return { w: side, h: Math.ceil(n / side) };
        }
        if (axis === "vertical") return { w: 1, h: n };
        return { w: n, h: 1 };
    }

    function pauseHomeVideo(paused) {
        const video = document.querySelector("#startScreen video.bg-scroll");
        if (!video) return;
        try {
            if (paused) video.pause();
            else if (video.paused) video.play().catch(() => {});
        } catch (_) { /* ignore */ }
    }

    function applyModeClass(root, on) {
        if (!root) return;
        root.classList.toggle("home-board-mode", !!on);
        pauseHomeVideo(!!on);
    }

    function paintLabel(block) {
        const cvs = block.labelCanvas;
        const ctx = block.labelCtx;
        const u = 256;
        if (cvs.width !== u || cvs.height !== u) {
            cvs.width = u;
            cvs.height = u;
        }
        ctx.clearRect(0, 0, u, u);
        block.labelTex.needsUpdate = true;
        if (block.label) block.label.visible = false;
    }

    function shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function tierForCell(col, row) {
        const tiers = podiumCfg().tiers || [];
        for (const t of tiers) {
            const c0 = t.col0 != null ? t.col0 : 0;
            const c1 = t.col1 != null ? t.col1 : ((podiumCfg().cols | 0) - 1);
            if (row >= t.row0 && row <= t.row1 && col >= c0 && col <= c1) return t;
        }
        return tiers[tiers.length - 1] || { elev: 0, row0: 0, row1: 0, col0: 0, col1: 0 };
    }

    function elevForCell(col, row) {
        return tierForCell(col, row).elev || 0;
    }

    function cellInTierBounds(col, row) {
        const tiers = podiumCfg().tiers || [];
        for (const t of tiers) {
            const c0 = t.col0 != null ? t.col0 : 0;
            const c1 = t.col1 != null ? t.col1 : ((podiumCfg().cols | 0) - 1);
            if (row >= t.row0 && row <= t.row1 && col >= c0 && col <= c1) return true;
        }
        return false;
    }

    /** Optionally swap which back half is taller for variety. */
    function applyHighSide() {
        const P = podiumCfg();
        const H = P.layerHeights || {};
        const hi = H.backHigh != null ? H.backHigh : 0.9;
        const lo = H.backLow != null ? H.backLow : 0.42;
        const left = (P.tiers || []).find((t) => t.id === "backL");
        const right = (P.tiers || []).find((t) => t.id === "backR");
        const front = (P.tiers || []).find((t) => t.id === "front");
        if (front && H.front != null) front.elev = H.front;
        if (!left || !right) return;
        const leftHigh = P.randomizeHighSide ? Math.random() < 0.5 : left.elev >= right.elev;
        left.elev = leftHigh ? hi : lo;
        right.elev = leftHigh ? lo : hi;
    }

    function syncTierElevs() {
        const P = podiumCfg();
        const H = P.layerHeights || {};
        const left = (P.tiers || []).find((t) => t.id === "backL");
        const right = (P.tiers || []).find((t) => t.id === "backR");
        const front = (P.tiers || []).find((t) => t.id === "front");
        if (front && H.front != null) front.elev = H.front;
        if (!left || !right) return;
        const leftIsHigh = left.elev >= right.elev;
        const hi = H.backHigh != null ? H.backHigh : 0.9;
        const lo = H.backLow != null ? H.backLow : 0.42;
        left.elev = leftIsHigh ? hi : lo;
        right.elev = leftIsHigh ? lo : hi;
    }

    function rebuildPodiumVisuals() {
        if (!sceneState) return;
        syncTierElevs();
        const state = sceneState;
        disposePodium(state);
        const built = buildPodium(state.root, state.cols, state.rows);
        state.podium = built.group;
        state.podiumMat = built.mat;
        if (state.mask) buildTiles(state, state.mask);
        for (const block of state.blocks) {
            block.elev = elevForCell(block.cellX, block.cellY);
        }
        state.dirtyShadow = true;
        resize();
        if (debugRefresh) debugRefresh();
    }

    function footprintCells(x, y, w, h) {
        const cells = [];
        for (let r = y; r < y + h; r++) {
            for (let c = x; c < x + w; c++) cells.push({ c, r });
        }
        return cells;
    }

    /** Expanded rect must sit on playable same-elevation cells (no holes / tier edges). */
    function footprintFits(mask, x, y, w, h) {
        const cols = mask[0] ? mask[0].length : 0;
        const rows = mask.length;
        if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
        const elev0 = elevForCell(x, y);
        for (let r = y; r < y + h; r++) {
            for (let c = x; c < x + w; c++) {
                if (!mask[r] || !mask[r][c]) return false;
                if (Math.abs(elevForCell(c, r) - elev0) > 0.001) return false;
            }
        }
        return true;
    }

    function cellsFree(cells, reserved) {
        for (const cell of cells) {
            if (reserved.has(cell.c + "," + cell.r)) return false;
        }
        return true;
    }

    function reserveCells(cells, reserved) {
        for (const cell of cells) reserved.add(cell.c + "," + cell.r);
    }

    /**
     * Find anchor + axis so the full expanded footprint fits on the mask
     * without overlapping reserved expand cells.
     */
    function findExpandPlacement(mask, size, reserved) {
        const cols = mask[0] ? mask[0].length : 0;
        const rows = mask.length;
        const axes = shuffleInPlace(AXES.slice());
        const anchors = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (mask[r][c]) anchors.push({ c, r });
            }
        }
        shuffleInPlace(anchors);

        // Prefer exact size; fall back to smaller sizes so we still place something.
        for (let trySize = size; trySize >= 2; trySize--) {
            for (const axis of axes) {
                const fp = expandedFootprint(trySize, axis);
                for (const a of anchors) {
                    if (!footprintFits(mask, a.c, a.r, fp.w, fp.h)) continue;
                    const cells = footprintCells(a.c, a.r, fp.w, fp.h);
                    if (!cellsFree(cells, reserved)) continue;
                    return {
                        x: a.c,
                        y: a.r,
                        size: trySize,
                        expandAxis: axis,
                        cells,
                        elev: elevForCell(a.c, a.r),
                    };
                }
            }
        }
        return null;
    }

    /** Build sparse playable mask + random unsolvable block specs. */
    function generateLayout() {
        const P = podiumCfg();
        const cols = P.cols | 0;
        const rows = P.rows | 0;
        const tiers = P.tiers || [];
        // Start fully tiled on tiers — forced gaps + holes come next.
        const mask = [];
        for (let r = 0; r < rows; r++) {
            mask[r] = [];
            for (let c = 0; c < cols; c++) {
                mask[r][c] = cellInTierBounds(c, r) ? 1 : 0;
            }
        }

        // Per-tier forced gaps: playable cells that blocks may never cover.
        const gapsPerTier = Math.max(1, P.gapsPerTier | 0);
        const gapKeys = new Set();
        for (const tier of tiers) {
            const c0 = tier.col0 != null ? tier.col0 : 0;
            const c1 = tier.col1 != null ? tier.col1 : cols - 1;
            const cells = [];
            for (let r = tier.row0; r <= tier.row1; r++) {
                for (let c = c0; c <= c1; c++) {
                    if (mask[r] && mask[r][c]) cells.push({ c, r });
                }
            }
            if (!cells.length) continue;
            shuffleInPlace(cells);
            const n = Math.min(gapsPerTier, Math.max(1, cells.length - 1));
            for (let i = 0; i < n; i++) {
                gapKeys.add(cells[i].c + "," + cells[i].r);
            }
        }

        const blockCount = randInt(P.blockCountMin | 5, P.blockCountMax | 7);
        const sizesPool = (P.sizes && P.sizes.length) ? P.sizes.slice() : [2, 2, 3, 3, 4];
        const sizes = [];
        while (sizes.length < blockCount) sizes.push(pick(sizesPool));

        // Gaps are reserved so expand footprints can never fill a whole layer.
        const reserved = new Set(gapKeys);
        const specs = [];
        shuffleInPlace(sizes);
        for (let i = 0; i < sizes.length; i++) {
            const place = findExpandPlacement(mask, sizes[i], reserved);
            if (!place) continue;
            reserveCells(place.cells, reserved);
            specs.push({
                id: "hb_" + i + "_" + pick(COLOR_NAMES) + "_" + place.x + "_" + place.y,
                color: pick(COLOR_NAMES),
                x: place.x,
                y: place.y,
                size: place.size,
                expandAxis: place.expandAxis,
                elev: place.elev,
            });
        }

        // Footprint coverage only (exclude forced gaps from "filled" set).
        const covered = new Set();
        for (const key of reserved) {
            if (!gapKeys.has(key)) covered.add(key);
        }

        // Decorative holes on leftover free cells — never remove a tier's last gap.
        const holeChance = P.holeChance != null ? P.holeChance : 0.2;
        const minHoles = P.minHoles | 0;
        const free = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const key = c + "," + r;
                if (mask[r][c] && !covered.has(key) && !gapKeys.has(key)) {
                    free.push({ c, r });
                }
            }
        }
        shuffleInPlace(free);
        let holes = 0;
        for (const cell of free) {
            if (holes >= minHoles && Math.random() > holeChance) continue;
            mask[cell.r][cell.c] = 0;
            holes++;
        }

        // Safety: every tier still has ≥1 uncovered playable cell.
        for (const tier of tiers) {
            const c0 = tier.col0 != null ? tier.col0 : 0;
            const c1 = tier.col1 != null ? tier.col1 : cols - 1;
            let gapOk = false;
            const candidates = [];
            for (let r = tier.row0; r <= tier.row1; r++) {
                for (let c = c0; c <= c1; c++) {
                    const key = c + "," + r;
                    if (!mask[r] || !mask[r][c]) {
                        candidates.push({ c, r });
                        continue;
                    }
                    if (!covered.has(key)) gapOk = true;
                }
            }
            if (gapOk) continue;
            // Restore / claim a cell as an uncovered playable gap.
            shuffleInPlace(candidates);
            let picked = candidates[0];
            if (!picked) {
                // Tier fully covered — steal one covered cell back into a gap.
                const coveredHere = [];
                for (let r = tier.row0; r <= tier.row1; r++) {
                    for (let c = c0; c <= c1; c++) {
                        const key = c + "," + r;
                        if (mask[r] && mask[r][c] && covered.has(key)) {
                            coveredHere.push({ c, r, key });
                        }
                    }
                }
                shuffleInPlace(coveredHere);
                picked = coveredHere[0];
                if (picked) covered.delete(picked.key);
            }
            if (!picked) continue;
            mask[picked.r][picked.c] = 1;
            gapKeys.add(picked.c + "," + picked.r);
            // Drop any block whose expand footprint needed that cell.
            for (let i = specs.length - 1; i >= 0; i--) {
                const s = specs[i];
                const fp = expandedFootprint(s.size, s.expandAxis);
                const cells = footprintCells(s.x, s.y, fp.w, fp.h);
                if (cells.some((cell) => cell.c === picked.c && cell.r === picked.r)) {
                    specs.splice(i, 1);
                }
            }
        }

        return { cols, rows, mask, specs };
    }

    function pickCollapsedIds(specs) {
        const ids = new Set();
        if (!specs.length) return ids;
        const idleCfg = idleExpandCfg();
        const minC = Math.max(0, idleCfg.startCollapsedMin | 0);
        const maxC = Math.max(minC, idleCfg.startCollapsedMax != null
            ? idleCfg.startCollapsedMax | 0
            : 2);
        let count = minC === maxC ? minC : randInt(minC, maxC);
        count = Math.min(specs.length - 1, Math.max(0, count));
        if (count <= 0 && specs.length > 1) count = 1;
        const order = shuffleInPlace(specs.map((s) => s.id));
        for (let i = 0; i < count; i++) ids.add(order[i]);
        return ids;
    }

    function applyExpandState(block, expanded, { snap = false, reschedule = true } = {}) {
        block.expanded = !!expanded;
        const fp = block.expanded
            ? expandedFootprint(block.size, block.expandAxis)
            : { w: 1, h: 1 };
        block.w = fp.w;
        block.h = fp.h;
        block.targetW = fp.w;
        block.targetH = fp.h;
        if (snap) {
            block.renderW = block.targetW;
            block.renderH = block.targetH;
            ensureBlockGeo(block);
        }
        paintLabel(block);
        if (reschedule && block.autoExpand) scheduleIdleExpand(block);
    }

    function setBlockExpanded(block, expanded, { fromTap = false } = {}) {
        const next = !!expanded;
        if (block.expanded === next) return;
        applyExpandState(block, next, { snap: false, reschedule: false });
        block.wiggle = next ? CS.EXPAND_POP : CS.EXPAND_POP * 0.55;
        block.wigglePhase = 0;
        block.wiggleDecay = CS.POP_DECAY;
        block.jiggleVX += next ? 0.45 : -0.3;
        block.jiggleVY += next ? 0.28 : 0.4;
        if (fromTap) {
            if (typeof haptic === "function") haptic("resize");
            if (typeof playSound === "function") {
                const n = Math.min(11, Math.max(1, block.size | 0));
                playSound(next ? ("expand_" + n) : "expand_1");
            }
        }
    }

    function ensureBlockGeo(block) {
        const QSTEP = 0.1;
        const aw = Math.round(block.renderW / QSTEP) * QSTEP;
        const ah = Math.round(block.renderH / QSTEP) * QSTEP;
        if (Math.abs(aw - block.geoW) < 0.001 && Math.abs(ah - block.geoH) < 0.001) return;
        block.geoW = Math.max(0.04, aw);
        block.geoH = Math.max(0.04, ah);
        block._geoW = block.geoW;
        block._geoH = block.geoH;
        const geo = cs3dSlabGeo(block.geoW, block.geoH, CS3D_CFG.CORNER_R, false);
        if (block.mesh.geometry) block.mesh.geometry.dispose();
        block.mesh.geometry = geo;
    }

    function attachCharacters(blocks) {
        const BC = window.BlockCharacters;
        if (!BC || typeof BC.attach !== "function") return;
        if (typeof BC.beginLevel === "function") BC.beginLevel(blocks);
        for (const b of blocks) BC.attach(b);
    }

    function updateCharacters(blocks) {
        const BC = window.BlockCharacters;
        if (!BC || typeof BC.update !== "function") return;
        for (const b of blocks) BC.update(b);
    }

    function detachCharacters(blocks) {
        const BC = window.BlockCharacters;
        if (!BC || typeof BC.detach !== "function") return;
        for (const b of blocks) BC.detach(b);
    }

    function disposeBlocks(blocks) {
        if (!blocks) return;
        detachCharacters(blocks);
        for (const block of blocks) {
            if (block.mesh) {
                if (block.mesh.parent) block.mesh.parent.remove(block.mesh);
                if (block.mesh.geometry) block.mesh.geometry.dispose();
            }
            if (block.mat) block.mat.dispose();
            if (block.label && block.label.material) block.label.material.dispose();
            if (block.labelTex) block.labelTex.dispose();
        }
    }

    function disposeTiles(state) {
        if (!state.tileMesh) return;
        if (state.tileMesh.parent) state.tileMesh.parent.remove(state.tileMesh);
        if (state.tileMesh.geometry && state.tileMesh.geometry !== state.tileGeo) {
            // InstancedMesh shares tileGeo — don't dispose shared geo here.
        }
        if (state.tileMesh.material) state.tileMesh.material.dispose();
        state.tileMesh = null;
    }

    function disposePodium(state) {
        if (!state || !state.podium) return;
        state.podium.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            // Shared material — dispose once via flag.
        });
        if (state.podiumMat) {
            state.podiumMat.dispose();
            state.podiumMat = null;
        }
        if (state.podium.parent) state.podium.parent.remove(state.podium);
        state.podium = null;
    }

    function buildPodium(root, cols, rows) {
        const T = window.THREE;
        const group = new T.Group();
        group.name = "homePodium";
        const tiers = podiumCfg().tiers || [];
        const mat = new T.MeshStandardMaterial({
            color: cs3dColor(CS3D_CFG.PLATFORM_COLOR),
            roughness: CS3D_CFG.PLATFORM_ROUGHNESS,
            metalness: 0,
        });
        const pad = CS3D_CFG.PLATFORM_PAD;

        for (const tier of tiers) {
            const c0 = tier.col0 != null ? tier.col0 : 0;
            const c1 = tier.col1 != null ? tier.col1 : cols - 1;
            const r0 = tier.row0;
            const r1 = tier.row1;
            const elev = tier.elev || 0;
            // Playable content inset by PLATFORM_PAD on edges that drop to a
            // lower step (front + sides), then the platform grows +PLATFORM_PAD
            // around that content — same lip as the outer board border.
            let x0 = c0;
            let x1 = c1 + 1;
            let z0 = r0;
            let z1 = r1 + 1;
            for (const other of tiers) {
                if (other === tier) continue;
                const oc0 = other.col0 != null ? other.col0 : 0;
                const oc1 = other.col1 != null ? other.col1 : cols - 1;
                const or0 = other.row0;
                const or1 = other.row1;
                const oElev = other.elev || 0;
                if (!(elev > oElev + 1e-6)) continue;
                const rowOverlap = !(r1 < or0 || r0 > or1);
                const colOverlap = !(c1 < oc0 || c0 > oc1);
                if (rowOverlap && c1 + 1 === oc0) x1 -= pad;
                if (rowOverlap && c0 === oc1 + 1) x0 += pad;
                if (colOverlap && r1 + 1 === or0) z1 -= pad;
                if (colOverlap && r0 === or1 + 1) z0 += pad;
            }
            const px0 = x0 - pad;
            const px1 = x1 + pad;
            const pz0 = z0 - pad;
            const pz1 = z1 + pad;
            const tw = Math.max(0.2, px1 - px0);
            const th = Math.max(0.2, pz1 - pz0);
            const bodyH = Math.max(CS3D_CFG.PLATFORM_H, elev + CS3D_CFG.PLATFORM_H);
            const geo = new T.ExtrudeGeometry(
                cs3dFootprintShape(tw, th, CS3D_CFG.PLATFORM_R),
                { depth: bodyH, bevelEnabled: false, steps: 1, curveSegments: 6 }
            );
            geo.translate(0, 0, -bodyH / 2);
            geo.rotateX(-Math.PI / 2);
            geo.computeVertexNormals();
            const mesh = new T.Mesh(geo, mat);
            mesh.position.set(
                (px0 + px1) / 2 - cols / 2,
                elev - bodyH / 2,
                (pz0 + pz1) / 2 - rows / 2
            );
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            mesh.raycast = () => {};
            group.add(mesh);
        }
        root.add(group);
        return { group, mat };
    }

    function buildTiles(state, mask) {
        const T = window.THREE;
        disposeTiles(state);
        const cols = state.cols;
        const rows = state.rows;
        const cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (mask[r] && mask[r][c]) cells.push({ c, r });
            }
        }
        if (!cells.length) return;

        const tileMat = new T.MeshStandardMaterial({
            color: cs3dColor(CS3D_CFG.TILE_COLOR),
            roughness: CS3D_CFG.TILE_ROUGHNESS,
            metalness: 0,
        });
        const tileScale = 1 - 2 * CS3D_CFG.TILE_PAD;
        const tileMesh = new T.InstancedMesh(state.tileGeo, tileMat, cells.length);
        const tileObj = new T.Object3D();
        for (let i = 0; i < cells.length; i++) {
            const { c, r } = cells[i];
            const elev = elevForCell(c, r);
            tileObj.position.set(
                c + 0.5 - cols / 2,
                elev + CS3D_CFG.TILE_Y,
                r + 0.5 - rows / 2
            );
            tileObj.scale.set(tileScale, 1, tileScale);
            tileObj.updateMatrix();
            tileMesh.setMatrixAt(i, tileObj.matrix);
        }
        tileMesh.instanceMatrix.needsUpdate = true;
        tileMesh.receiveShadow = true;
        tileMesh.raycast = () => {};
        state.root.add(tileMesh);
        state.tileMesh = tileMesh;
    }

    function makeBlock(state, spec, expanded) {
        const T = window.THREE;
        const hex = colorHex(spec.color);
        const mat = new T.MeshStandardMaterial({
            color: cs3dColor(hex),
            roughness: CS3D_CFG.BLOCK_ROUGHNESS,
            metalness: CS3D_CFG.BLOCK_METALNESS,
            emissive: cs3dColor(hex).multiplyScalar(CS3D_CFG.BLOCK_EMISSIVE),
            emissiveIntensity: 1,
        });
        const mesh = new T.Mesh(cs3dSlabGeo(1, 1, CS3D_CFG.CORNER_R, false), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = labelCanvas.height = 256;
        const labelTex = new T.CanvasTexture(labelCanvas);
        if ("encoding" in labelTex) labelTex.encoding = T.sRGBEncoding;
        if ("colorSpace" in labelTex && T.SRGBColorSpace) {
            labelTex.colorSpace = T.SRGBColorSpace;
        }
        const label = new T.Mesh(
            state.decalGeo,
            new T.MeshBasicMaterial({
                map: labelTex,
                transparent: true,
                depthWrite: false,
            })
        );
        label.position.y = CS3D_CFG.BLOCK_H / 2 + 0.012;
        label.renderOrder = 2;
        label.raycast = () => {};
        label.visible = false;
        mesh.add(label);
        state.root.add(mesh);

        const fp = expanded
            ? expandedFootprint(spec.size, spec.expandAxis || "horizontal")
            : { w: 1, h: 1 };
        const idleOn = idleExpandCfg().enabled !== false;
        const block = {
            id: spec.id,
            color: hex,
            colorName: spec.color,
            size: spec.size,
            expandAxis: spec.expandAxis || "horizontal",
            cellX: spec.x,
            cellY: spec.y,
            elev: spec.elev != null ? spec.elev : elevForCell(spec.x, spec.y),
            expanded,
            w: fp.w,
            h: fp.h,
            targetW: fp.w,
            targetH: fp.h,
            renderW: fp.w,
            renderH: fp.h,
            geoW: 1,
            geoH: 1,
            _geoW: 1,
            _geoH: 1,
            _mesh: mesh,
            mesh,
            mat,
            label,
            labelCanvas,
            labelTex,
            labelCtx: labelCanvas.getContext("2d"),
            jiggleX: 0,
            jiggleVX: 0,
            jiggleY: 0,
            jiggleVY: 0,
            wiggle: 0,
            wigglePhase: 0,
            wiggleDecay: CS.POP_DECAY,
            autoExpand: idleOn,
            expandTimer: 0,
        };
        if (block.autoExpand) scheduleIdleExpand(block);
        mesh.userData.homeBlock = block;
        ensureBlockGeo(block);
        paintLabel(block);
        return block;
    }

    /** Fresh podium layout: new holes, shapes, colors, positions, expand mix. */
    function randomizeHomeLayout() {
        if (!sceneState) return;
        const state = sceneState;
        applyHighSide();
        disposePodium(state);
        const built = buildPodium(state.root, state.cols || podiumCfg().cols, state.rows || podiumCfg().rows);
        state.podium = built.group;
        state.podiumMat = built.mat;

        const layout = generateLayout();
        state.cols = layout.cols;
        state.rows = layout.rows;
        state.mask = layout.mask;

        disposeBlocks(state.blocks);
        state.blocks = [];
        buildTiles(state, layout.mask);

        const collapsed = pickCollapsedIds(layout.specs);
        const idleOn = idleExpandCfg().enabled !== false;
        state.blocks = layout.specs.map((spec) => {
            const block = makeBlock(state, spec, !collapsed.has(spec.id));
            block.autoExpand = idleOn;
            if (block.autoExpand) scheduleIdleExpand(block);
            return block;
        });
        attachCharacters(state.blocks);
        state.dirtyShadow = true;
        resize();
    }

    function createScene(canvas) {
        const T = window.THREE;
        const P = podiumCfg();
        const cols = P.cols;
        const rows = P.rows;

        let renderer;
        try {
            renderer = new T.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
                powerPreference: "low-power",
            });
        } catch (err) {
            console.error("[HomeBoard] WebGLRenderer failed", err);
            return null;
        }
        renderer.setClearColor(cs3dColor(bgHex()), 1);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
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
        const ext = Math.max(cols, rows);
        key.position.set(ext * CS3D_CFG.KEY_X, ext * CS3D_CFG.KEY_Y, ext * CS3D_CFG.KEY_Z);
        key.castShadow = true;
        key.shadow.mapSize.set(512, 512);
        key.shadow.radius = 6;
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 80;
        const s = ext * 0.95 + 4;
        key.shadow.camera.left = -s;
        key.shadow.camera.right = s;
        key.shadow.camera.top = s;
        key.shadow.camera.bottom = -s;
        scene.add(key);
        scene.add(key.target);
        const fill = new T.DirectionalLight(0xc0cad6, 0.26);
        fill.position.set(ext * CS3D_CFG.FILL_X, ext * CS3D_CFG.FILL_Y, ext * CS3D_CFG.FILL_Z);
        scene.add(fill);

        const podiumBuilt = buildPodium(root, cols, rows);

        const foot = cs3dRoundedFootprint(CS3D_CFG.CORNER_R);
        const tileGeo = new T.ShapeGeometry(foot);
        tileGeo.rotateX(-Math.PI / 2);

        const decalGeo = new T.PlaneGeometry(1, 1);
        decalGeo.rotateX(-Math.PI / 2);

        const state = {
            canvas,
            renderer,
            scene,
            camera,
            root,
            key,
            podium: podiumBuilt.group,
            podiumMat: podiumBuilt.mat,
            blocks: [],
            cols,
            rows,
            mask: null,
            ray: new T.Raycaster(),
            ndc: new T.Vector2(),
            decalGeo,
            tileGeo,
            tileMesh: null,
            time: 0,
            dirtyShadow: true,
        };

        // First layout; show() will reshuffle again on each visit.
        sceneState = state;
        randomizeHomeLayout();
        return state;
    }

    function layoutCamera(state, cssW, cssH) {
        const CFG = cam();
        const cam3 = state.camera;
        const tilt = CFG.tiltDeg * Math.PI / 180;
        const aspect = cssW / Math.max(1, cssH);
        const maxElev = Math.max(0, ...(podiumCfg().tiers || []).map((t) => t.elev || 0));
        const spanX = state.cols;
        const spanY = state.rows * Math.cos(tilt) +
            (CS3D_CFG.PLATFORM_H + CS3D_CFG.BLOCK_H + maxElev) * Math.sin(tilt);
        let halfW = spanX / 2;
        let halfH = spanY / 2;
        if (halfW / halfH > aspect) halfH = halfW / aspect;
        else halfW = halfH * aspect;
        const m = CFG.fitMargin / (CFG.orthoZoom || 1);
        halfW *= m;
        halfH *= m;
        // Shift frustum so the board sits at the anchored screen position.
        const ox = (CFG.anchorX || 0) * halfW;
        const oy = (CFG.anchorY || 0) * halfH;
        cam3.left = -halfW - ox;
        cam3.right = halfW - ox;
        cam3.top = halfH - oy;
        cam3.bottom = -halfH - oy;
        const dist = Math.max(state.cols, state.rows) * 2 + 40;
        cam3.near = 0.1;
        cam3.far = dist * 2 + 200;
        cam3.up.set(0, 1, 0);
        cam3.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
        cam3.quaternion.identity();
        cam3.rotation.set(0, 0, 0);
        cam3.lookAt(0, CFG.lookLift, 0);
        cam3.updateProjectionMatrix();
        state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        state.renderer.setSize(cssW, cssH, false);
        state.dirtyShadow = true;
    }

    function applyCamera() {
        if (!sceneState) return;
        resize();
        if (debugRefresh) debugRefresh();
    }

    function applyVisuals() {
        applyBackground();
        applyCamera();
    }

    function updateBlock(state, block, dtSec) {
        const smooth = 1 - Math.exp(-CS.EXPAND_K * dtSec);
        block.renderW += (block.targetW - block.renderW) * smooth;
        block.renderH += (block.targetH - block.renderH) * smooth;

        block.jiggleVX += (-CS.SPRING_K * block.jiggleX - CS.SPRING_D * block.jiggleVX) * dtSec;
        block.jiggleX += block.jiggleVX * dtSec;
        block.jiggleVY += (-CS.SPRING_K * block.jiggleY - CS.SPRING_D * block.jiggleVY) * dtSec;
        block.jiggleY += block.jiggleVY * dtSec;
        block.jiggleX = Math.max(-0.35, Math.min(0.35, block.jiggleX));
        block.jiggleY = Math.max(-0.35, Math.min(0.35, block.jiggleY));

        if (block.wiggle > 0.0005) {
            block.wigglePhase += dtSec * CS.POP_FREQ;
            block.wiggle *= Math.exp(-block.wiggleDecay * dtSec);
        } else {
            block.wiggle = 0;
        }

        const wob = Math.sin(block.wigglePhase) * CS.POP_AMP * block.wiggle;
        const sx = 1 + block.jiggleX + wob;
        const sz = 1 + block.jiggleY - wob;
        const vScale = Math.max(0.55, Math.min(1.7,
            1 - ((sx - 1) + (sz - 1)) * CS3D_CFG.HEIGHT_SQUASH));

        ensureBlockGeo(block);
        const bob = wob * CS3D_CFG.BLOCK_H * CS3D_CFG.BOB;
        const elev = block.elev || 0;
        const originX = block.cellX - state.cols / 2;
        const originZ = block.cellY - state.rows / 2;
        const cx = originX + block.renderW / 2;
        const cz = originZ + block.renderH / 2;
        const by = elev + CS3D_CFG.BLOCK_BASE_Y + CS3D_CFG.BLOCK_H * vScale / 2 + bob;

        block.mesh.visible = true;
        block.mesh.scale.set(
            (block.renderW / block.geoW) * sx,
            vScale,
            (block.renderH / block.geoH) * sz
        );
        block.mesh.position.set(cx, by, cz);
        block.mesh.rotation.set(
            block.jiggleY * CS3D_CFG.WOBBLE_ROT,
            0,
            -block.jiggleX * CS3D_CFG.WOBBLE_ROT
        );
        const labelSpan = Math.min(block.geoW, block.geoH);
        block.label.scale.set(labelSpan, 1, labelSpan);
    }

    function blockSettled(block) {
        return Math.abs(block.renderW - block.targetW) < 0.01
            && Math.abs(block.renderH - block.targetH) < 0.01
            && Math.abs(block.jiggleX) < 0.002
            && Math.abs(block.jiggleY) < 0.002
            && block.wiggle < 0.002;
    }

    function toggleBlock(block) {
        setBlockExpanded(block, !block.expanded, { fromTap: true });
        if (block.autoExpand) scheduleIdleExpand(block);
    }

    function tickIdleExpand(state, dtSec) {
        if (idleExpandCfg().enabled === false) return;
        for (const block of state.blocks) {
            if (!block.autoExpand) continue;
            if (!blockSettled(block)) continue;
            block.expandTimer -= dtSec;
            if (block.expandTimer > 0) continue;
            setBlockExpanded(block, !block.expanded, { fromTap: false });
            scheduleIdleExpand(block);
            state.dirtyShadow = true;
        }
    }

    function onPointer(e) {
        if (!sceneState || !running) return;
        const rect = sceneState.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / Math.max(1, rect.width);
        const y = (e.clientY - rect.top) / Math.max(1, rect.height);
        sceneState.ndc.set(x * 2 - 1, -(y * 2 - 1));
        sceneState.ray.setFromCamera(sceneState.ndc, sceneState.camera);
        const meshes = sceneState.blocks.map((b) => b.mesh);
        const hits = sceneState.ray.intersectObjects(meshes, false);
        if (!hits.length) return;
        const block = hits[0].object.userData.homeBlock;
        if (!block) return;
        e.preventDefault();
        toggleBlock(block);
        startLoop();
    }

    function resize() {
        if (!sceneState) return;
        const parent = sceneState.canvas.parentElement || sceneState.canvas;
        const w = Math.max(1, parent.clientWidth || window.innerWidth);
        const h = Math.max(1, parent.clientHeight || window.innerHeight);
        layoutCamera(sceneState, w, h);
    }

    function frame(ts) {
        raf = 0;
        if (!running || !sceneState) return;
        const dtSec = Math.min(0.05, ((ts - lastTs) || 16) / 1000);
        lastTs = ts;
        sceneState.time += dtSec;

        const c = cam();
        const yaw = (c.idleYawDeg * Math.PI / 180)
            * Math.sin((sceneState.time * Math.PI * 2) / Math.max(0.5, c.idleYawPeriodSec));
        sceneState.root.rotation.y = yaw;

        let busy = Math.abs(yaw) > 0.0005;
        tickIdleExpand(sceneState, dtSec);
        for (const block of sceneState.blocks) {
            updateBlock(sceneState, block, dtSec);
            if (!blockSettled(block)) busy = true;
        }
        updateCharacters(sceneState.blocks);

        if (sceneState.dirtyShadow || busy) {
            sceneState.renderer.shadowMap.needsUpdate = true;
            sceneState.dirtyShadow = false;
        }
        sceneState.renderer.render(sceneState.scene, sceneState.camera);
        raf = requestAnimationFrame(frame);
    }

    function startLoop() {
        if (raf || !running) {
            if (running && !raf) raf = requestAnimationFrame(frame);
            return;
        }
        lastTs = performance.now();
        raf = requestAnimationFrame(frame);
    }

    function stopLoop() {
        running = false;
        if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
    }

    function disposeScene() {
        stopLoop();
        if (!sceneState) return;
        const state = sceneState;
        sceneState = null;
        state.canvas.removeEventListener("pointerdown", onPointer);
        disposeBlocks(state.blocks);
        disposeTiles(state);
        disposePodium(state);
        if (state.decalGeo) state.decalGeo.dispose();
        if (state.tileGeo) state.tileGeo.dispose();
        if (typeof cs3dReleaseRenderer === "function") {
            cs3dReleaseRenderer(state.renderer);
        } else {
            try { state.renderer.dispose(); } catch (_) { /* ignore */ }
        }
        // loseContext leaves this canvas unusable — swap for a fresh node.
        if (state.canvas && state.canvas.parentNode) {
            const next = document.createElement("canvas");
            next.id = state.canvas.id || "homeBoardCanvas";
            next.className = state.canvas.className || "home-board-canvas";
            next.setAttribute("aria-hidden", "true");
            state.canvas.parentNode.replaceChild(next, state.canvas);
        }
        if (window.BlockCharacters && typeof BlockCharacters.invalidateTextureCaches === "function") {
            BlockCharacters.invalidateTextureCaches();
        }
    }

    function loadSavedVisuals() {
        try {
            const raw = localStorage.getItem(HOME_VISUAL_STORAGE)
                || localStorage.getItem("stretchblock_home_board_camera");
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== "object") return;
            if (saved.camera && typeof saved.camera === "object") {
                Object.assign(cam(), saved.camera);
                if (typeof saved.bgColor === "string") HOME_BOARD_CFG.bgColor = saved.bgColor;
                if (saved.layerHeights && typeof saved.layerHeights === "object") {
                    podiumCfg().layerHeights = Object.assign(
                        podiumCfg().layerHeights || {},
                        saved.layerHeights
                    );
                    syncTierElevs();
                }
            } else {
                Object.assign(cam(), saved);
            }
        } catch (_) { /* ignore */ }
    }

    function saveVisuals() {
        try {
            localStorage.setItem(HOME_VISUAL_STORAGE, JSON.stringify({
                camera: cam(),
                bgColor: bgHex(),
                layerHeights: podiumCfg().layerHeights,
            }));
        } catch (_) { /* ignore */ }
    }

    function createDebugPanel() {
        if (debugPanelEl) return debugPanelEl;
        const host = document.getElementById("debugPanel");
        if (!host) return null;

        const panel = document.createElement("div");
        panel.className = "home-board-debug-panel";
        panel.id = "homeBoardDebugPanel";

        const heading = document.createElement("h3");
        heading.textContent = "Home Board";
        panel.appendChild(heading);

        const defaults = {
            camera: JSON.parse(JSON.stringify(cam())),
            bgColor: bgHex(),
            layerHeights: JSON.parse(JSON.stringify(podiumCfg().layerHeights || {
                backHigh: 0.9, backLow: 0.42, front: 0.0,
            })),
        };
        const inputs = [];

        const section = (label) => {
            const el = document.createElement("div");
            el.className = "cs3d-section";
            el.textContent = label;
            panel.appendChild(el);
        };

        const range = (label, key, min, max, step) => {
            const row = document.createElement("label");
            row.className = "cs3d-row";
            const name = document.createElement("span");
            name.textContent = label;
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = String(min);
            slider.max = String(max);
            slider.step = String(step);
            const value = document.createElement("input");
            value.type = "number";
            value.min = String(min);
            value.max = String(max);
            value.step = String(step);
            const update = (raw) => {
                const next = Number(raw);
                if (!Number.isFinite(next)) return;
                cam()[key] = next;
                applyCamera();
            };
            slider.addEventListener("input", () => update(slider.value));
            value.addEventListener("change", () => update(value.value));
            row.append(name, slider, value);
            panel.appendChild(row);
            inputs.push(() => {
                const next = cam()[key];
                slider.value = String(next);
                value.value = String(next);
            });
        };

        const heightRange = (label, key, min, max, step) => {
            const row = document.createElement("label");
            row.className = "cs3d-row";
            const name = document.createElement("span");
            name.textContent = label;
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = String(min);
            slider.max = String(max);
            slider.step = String(step);
            const value = document.createElement("input");
            value.type = "number";
            value.min = String(min);
            value.max = String(max);
            value.step = String(step);
            const update = (raw) => {
                const next = Number(raw);
                if (!Number.isFinite(next)) return;
                if (!podiumCfg().layerHeights) podiumCfg().layerHeights = {};
                podiumCfg().layerHeights[key] = next;
                rebuildPodiumVisuals();
            };
            slider.addEventListener("input", () => update(slider.value));
            value.addEventListener("change", () => update(value.value));
            row.append(name, slider, value);
            panel.appendChild(row);
            inputs.push(() => {
                const H = podiumCfg().layerHeights || {};
                const next = H[key] != null ? H[key] : 0;
                slider.value = String(next);
                value.value = String(next);
            });
        };

        const color = (label, get, set) => {
            const row = document.createElement("label");
            row.className = "cs3d-row";
            const name = document.createElement("span");
            name.textContent = label;
            const picker = document.createElement("input");
            picker.type = "color";
            picker.addEventListener("input", () => set(picker.value));
            row.append(name, picker);
            panel.appendChild(row);
            inputs.push(() => { picker.value = get(); });
        };

        section("Colours");
        color("Background", () => bgHex(), (hex) => {
            HOME_BOARD_CFG.bgColor = hex;
            applyBackground();
        });
        section("Layer Heights");
        heightRange("Back High", "backHigh", 0, 2.5, 0.01);
        heightRange("Back Low", "backLow", 0, 2.5, 0.01);
        heightRange("Front", "front", 0, 2.5, 0.01);
        section("Framing");
        range("Tilt (°)", "tiltDeg", 0, 80, 0.5);
        range("Zoom", "orthoZoom", 0.3, 3, 0.01);
        range("Frame Margin", "fitMargin", 1, 2.5, 0.01);
        range("Look Lift", "lookLift", -2, 6, 0.05);
        range("Anchor X", "anchorX", -1, 1, 0.01);
        range("Anchor Y", "anchorY", -1, 1, 0.01);
        section("Idle Motion");
        range("Yaw (°)", "idleYawDeg", 0, 20, 0.1);
        range("Yaw Period (s)", "idleYawPeriodSec", 2, 40, 0.5);

        const actions = document.createElement("div");
        actions.className = "cs3d-debug-actions";
        const action = (label, handler) => {
            const button = document.createElement("button");
            button.textContent = label;
            button.addEventListener("click", handler);
            actions.appendChild(button);
        };
        action("Save", () => saveVisuals());
        action("Copy", async () => {
            const text = JSON.stringify({
                camera: cam(),
                bgColor: bgHex(),
                layerHeights: podiumCfg().layerHeights,
            }, null, 2);
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    window.prompt("Copy home board visuals", text);
                }
            } catch (_) {
                window.prompt("Copy home board visuals", text);
            }
        });
        action("Load", () => {
            loadSavedVisuals();
            applyVisuals();
            rebuildPodiumVisuals();
        });
        action("Reset", () => {
            Object.assign(cam(), JSON.parse(JSON.stringify(defaults.camera)));
            HOME_BOARD_CFG.bgColor = defaults.bgColor;
            podiumCfg().layerHeights = JSON.parse(JSON.stringify(defaults.layerHeights));
            applyVisuals();
            rebuildPodiumVisuals();
        });
        action("Close", () => {
            host.classList.remove("home-open");
        });
        panel.appendChild(actions);
        host.appendChild(panel);

        debugRefresh = () => inputs.forEach((fn) => fn());
        debugRefresh();
        debugPanelEl = panel;
        return panel;
    }

    function toggleDebugPanel(force) {
        const host = document.getElementById("debugPanel");
        if (!host) return;
        createDebugPanel();
        const open = force == null ? !host.classList.contains("home-open") : !!force;
        host.classList.remove("mixer-open", "cs3d-open", "collapsed");
        host.classList.toggle("home-open", open);
        if (open && debugRefresh) debugRefresh();
    }

    function ensureDebugChrome() {
        const host = document.getElementById("debugPanel");
        if (!host || host.querySelector("#debugHomeToggle")) return;
        const row = host.querySelector(".debug-icon-row");
        if (!row) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "debug-icon-btn";
        btn.id = "debugHomeToggle";
        btn.title = "Home board camera";
        btn.textContent = "Home";
        btn.addEventListener("click", () => toggleDebugPanel());
        row.appendChild(btn);

        window.addEventListener("keydown", (event) => {
            if (event.key !== "h" && event.key !== "H") return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const tag = (event.target && event.target.tagName) || "";
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            toggleDebugPanel();
        });
    }

    function ensure() {
        if (!HOME_BOARD_CFG.enabled) return null;
        if (typeof THREE === "undefined" || typeof cs3dSlabGeo !== "function") return null;
        const root = document.getElementById("startScreen");
        const canvas = document.getElementById("homeBoardCanvas");
        if (!root || !canvas) return null;
        applyModeClass(root, true);
        ensureDebugChrome();
        if (!sceneState) {
            loadSavedVisuals();
            sceneState = createScene(canvas);
            if (!sceneState) return null;
            applyBackground();
            canvas.addEventListener("pointerdown", onPointer, { passive: false });
            if (!visibilityBound) {
                visibilityBound = true;
                document.addEventListener("visibilitychange", () => {
                    if (window.Ads && Ads.isAdShowing()) return;
                    if (document.hidden) stopLoop();
                    else if (root.classList.contains("active") && HOME_BOARD_CFG.enabled) {
                        running = true;
                        startLoop();
                    }
                });
                window.addEventListener("resize", () => {
                    resize();
                    if (running) startLoop();
                });
            }
        }
        return sceneState;
    }

    function show() {
        if (!HOME_BOARD_CFG.enabled) {
            applyModeClass(document.getElementById("startScreen"), false);
            disposeScene();
            return;
        }
        if (!ensure()) return;
        // New podium packing every visit: holes, colors, shapes, positions, expand mix.
        randomizeHomeLayout();
        applyBackground();
        resize();
        running = true;
        startLoop();
    }

    function hide() {
        // Fully release the home WebGL context when leaving the start screen.
        // Keeping a live Three.js renderer under gameplay (plus Spine) often
        // loses the game context on Capacitor WebViews after quit → replay.
        disposeScene();
        const host = document.getElementById("debugPanel");
        if (host) host.classList.remove("home-open");
    }

    window.HomeBoard = {
        cfg: HOME_BOARD_CFG,
        show,
        hide,
        dispose: disposeScene,
        applyCamera,
        applyBackground,
        applyVisuals,
        toggleDebugPanel,
        isEnabled() { return !!HOME_BOARD_CFG.enabled; },
    };
})();
