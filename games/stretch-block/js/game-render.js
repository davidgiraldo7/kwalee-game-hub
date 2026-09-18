// OWNER: artist — Three.js scene, materials, draw, VFX, Soft-3D debug
"use strict";

const CS3D = {
    ok: false, renderer: null, scene: null, camera: null, boardGroup: null,
    dir: null, fill: null, ambient: null, hemi: null, platform: null,
    tileGeo: null, decalGeo: null,
    tileMesh: null, tileMaterial: null, tileCells: [], blockMeshes: [],
    arrowTemplate: null, arrowBounds: null, arrowMaterial: null,
    arrowLoadStarted: false, arrowLoadFailed: false,
    glowGroup: null, seamGeo: null, seams: [], bursts: [], glowTex: null,
    snapMesh: null, tutorialDestinationFillMesh: null, tutorialDestinationOutlineMesh: null,
    _snapKey: null, _tutorialDestinationFillKey: null, _tutorialDestinationOutlineKey: null,
    _occ: null, _occMap: null,
    _moveSig: 0, _shadowSettle: 3, _rectDirty: true,
    hintMeshes: [], // pool of tinted overlay panels for active hints
    ray: null, ndc: null, plane: null, hit: null, cA: null, cB: null, cTile: null,
    sheenU: null, // shared win-sheen uniforms for block surface shaders
};



function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
// amt in [-1,1]: positive lightens toward white, negative darkens toward black.
function shade(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const mix = (c) => Math.round(c + (t - c) * p);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const CS3D_ARROW_ASSET = "./Assets/Arrow.glb";
const CS3D_ARROW_COLOR = 0xf7f1e6;

function cs3dAccessorSize(type) {
    return type === "SCALAR" ? 1 : type === "VEC2" ? 2 : type === "VEC3" ? 3 : type === "VEC4" ? 4 : 16;
}

function cs3dComponentInfo(componentType) {
    switch (componentType) {
        case 5120: return { ArrayType: Int8Array, bytes: 1 };
        case 5121: return { ArrayType: Uint8Array, bytes: 1 };
        case 5122: return { ArrayType: Int16Array, bytes: 2 };
        case 5123: return { ArrayType: Uint16Array, bytes: 2 };
        case 5125: return { ArrayType: Uint32Array, bytes: 4 };
        case 5126: return { ArrayType: Float32Array, bytes: 4 };
        default: throw new Error("Unsupported GLB component type " + componentType);
    }
}

function cs3dReadAccessor(json, bin, index) {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const itemSize = cs3dAccessorSize(accessor.type);
    const info = cs3dComponentInfo(accessor.componentType);
    const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const elementBytes = itemSize * info.bytes;
    const byteStride = view.byteStride || elementBytes;
    if (byteStride === elementBytes) {
        return new info.ArrayType(bin, byteOffset, accessor.count * itemSize);
    }
    const source = new info.ArrayType(bin, view.byteOffset || 0, view.byteLength / info.bytes);
    const packed = new info.ArrayType(accessor.count * itemSize);
    const start = (accessor.byteOffset || 0) / info.bytes;
    const stride = byteStride / info.bytes;
    for (let i = 0; i < accessor.count; i++) {
        const src = start + i * stride;
        for (let j = 0; j < itemSize; j++) packed[i * itemSize + j] = source[src + j];
    }
    return packed;
}

function cs3dArrowMaterial() {
    const T = window.THREE;
    if (!CS3D.arrowMaterial) {
        CS3D.arrowMaterial = new T.MeshStandardMaterial({
            color: CS3D_ARROW_COLOR,
            roughness: 0.58,
            metalness: 0,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            // Sit visually on top of character planes (ears use depthTest:false too).
            depthTest: false,
        });
    }
    return CS3D.arrowMaterial;
}

/** 0..1 opacity for axis arrows; fades out quickly once the level is won. */
function cs3dArrowWinOpacity() {
    if (typeof csLevelDone === "undefined" || !csLevelDone) return 1;
    const fadeMs = Math.max(1, CS3D_CFG.ARROW_WIN_FADE_MS || 180);
    const t = (typeof csSheen !== "undefined" && csSheen && csSheen.t != null)
        ? csSheen.t
        : fadeMs;
    return Math.max(0, 1 - t / fadeMs);
}

function cs3dCreateArrowTemplate(buffer) {
    const T = window.THREE;
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
        throw new Error("Unsupported GLB file");
    }
    let json = null, bin = null, offset = 12;
    while (offset < buffer.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        offset += 8;
        if (chunkType === 0x4e4f534a) {
            json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset, chunkLength)));
        } else if (chunkType === 0x004e4942) {
            bin = buffer.slice(offset, offset + chunkLength);
        }
        offset += chunkLength;
    }
    if (!json || !bin) throw new Error("GLB is missing JSON or BIN chunks");

    const root = new T.Group();
    const material = cs3dArrowMaterial();
    const buildNode = (nodeIndex, parent) => {
        const node = json.nodes[nodeIndex];
        const group = new T.Group();
        group.name = node.name || "ArrowNode";
        if (node.matrix) group.matrix.fromArray(node.matrix), group.matrix.decompose(group.position, group.quaternion, group.scale);
        if (node.translation) group.position.fromArray(node.translation);
        if (node.rotation) group.quaternion.fromArray(node.rotation);
        if (node.scale) group.scale.fromArray(node.scale);
        parent.add(group);
        if (Number.isInteger(node.mesh)) {
            const meshDef = json.meshes[node.mesh];
            for (const primitive of meshDef.primitives || []) {
                const geometry = new T.BufferGeometry();
                const attrs = primitive.attributes || {};
                if (Number.isInteger(attrs.POSITION)) geometry.setAttribute("position", new T.BufferAttribute(cs3dReadAccessor(json, bin, attrs.POSITION), 3));
                if (Number.isInteger(attrs.NORMAL)) geometry.setAttribute("normal", new T.BufferAttribute(cs3dReadAccessor(json, bin, attrs.NORMAL), 3));
                if (Number.isInteger(attrs.TEXCOORD_0)) geometry.setAttribute("uv", new T.BufferAttribute(cs3dReadAccessor(json, bin, attrs.TEXCOORD_0), 2));
                if (Number.isInteger(primitive.indices)) geometry.setIndex(new T.BufferAttribute(cs3dReadAccessor(json, bin, primitive.indices), 1));
                geometry.computeBoundingBox();
                if (!geometry.attributes.normal) geometry.computeVertexNormals();
                const mesh = new T.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.raycast = () => {};
                mesh.userData.cs3dArrowMarker = true;
                group.add(mesh);
            }
        }
        for (const child of node.children || []) buildNode(child, group);
    };
    const scene = json.scenes[json.scene || 0] || json.scenes[0];
    for (const nodeIndex of scene.nodes || []) buildNode(nodeIndex, root);
    root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(root);
    const center = new T.Vector3();
    const size = new T.Vector3();
    box.getCenter(center);
    box.getSize(size);
    root.position.sub(center);
    root.userData.cs3dArrowMarker = true;
    root.userData.cs3dArrowBounds = { size };
    return root;
}

function cs3dBeginArrowLoad() {
    if (CS3D.arrowLoadStarted || !window.THREE || !window.fetch) return;
    CS3D.arrowLoadStarted = true;
    fetch(CS3D_ARROW_ASSET)
        .then((response) => {
            if (!response.ok) throw new Error(response.status + " " + response.statusText);
            return response.arrayBuffer();
        })
        .then((buffer) => {
            const template = cs3dCreateArrowTemplate(buffer);
            CS3D.arrowTemplate = template;
            CS3D.arrowBounds = template.userData.cs3dArrowBounds;
            for (const b of blocks || []) b._decalSig = null;
            if (CS3D.renderer) { CS3D.renderer.shadowMap.needsUpdate = true; CS3D._shadowSettle = 3; }
        })
        .catch((error) => {
            CS3D.arrowLoadFailed = true;
            console.warn("[CS3D] Arrow GLB could not be loaded; using canvas fallback.", error);
            for (const b of blocks || []) b._decalSig = null;
        });
}

function cs3dRemoveArrowMarkers(b) {
    if (!b._arrowGroup || !b._mesh) return;
    b._mesh.remove(b._arrowGroup);
    b._arrowGroup = null;
}

function cs3dCloneArrowMarker() {
    const marker = CS3D.arrowTemplate.clone(true);
    marker.traverse((o) => {
        o.userData.cs3dArrowMarker = true;
        if (o.isMesh) {
            o.material = cs3dArrowMaterial();
            o.castShadow = true;
            o.receiveShadow = true;
            o.raycast = () => {};
        }
    });
    return marker;
}

function cs3dUpdateArrowMarkers(b) {
    if (!b.moveAxis || !CS3D.arrowTemplate || !CS3D.arrowBounds) {
        cs3dRemoveArrowMarkers(b);
        return;
    }
    const opacity = cs3dArrowWinOpacity();
    const mat = cs3dArrowMaterial();
    if (mat.opacity !== opacity) {
        mat.opacity = opacity;
        mat.transparent = true;
        mat.needsUpdate = true;
    }
    if (opacity <= 0.01) {
        if (b._arrowGroup) b._arrowGroup.visible = false;
        return;
    }
    const T = window.THREE;
    if (!b._arrowGroup) {
        b._arrowGroup = new T.Group();
        b._arrowGroup.userData.cs3dArrowMarker = true;
        b._mesh.add(b._arrowGroup);
    }
    while (b._arrowGroup.children.length < 2) b._arrowGroup.add(cs3dCloneArrowMarker());
    while (b._arrowGroup.children.length > 2) b._arrowGroup.remove(b._arrowGroup.children[2]);

    const size = CS3D.arrowBounds.size;
    const markerCross = Math.min(0.42, Math.max(0.28, Math.min(b._geoW || 1, b._geoH || 1) * 0.36));
    const scale = (markerCross / Math.max(size.z || 1, 0.001)) * 0.8;
    const tipOffset = (size.x || 1) * scale * 0.5;
    // Sit on top of character head/ear planes (same slab-local Y basis as BlockCharacters).
    const charCfg = (typeof window !== "undefined" && window.BLOCK_CHARACTERS_CFG) || {};
    const yLift = charCfg.yLift != null ? charCfg.yLift : 0.014;
    const earYLift = charCfg.earYLift != null ? charCfg.earYLift : 0.02;
    const clearance = CS3D_CFG.ARROW_CHAR_CLEARANCE != null ? CS3D_CFG.ARROW_CHAR_CLEARANCE : 0.05;
    const charTop = yLift + earYLift + 0.002;
    const y = CS3D_CFG.BLOCK_H / 2 + charTop + clearance + (size.y || 0.1) * scale * 0.5;
    const inset = b.preExpanded ? CS3D_CFG.CRATE_MARKER_INSET : 0.11;
    const w = Math.max(0.04, b._geoW || 1);
    const h = Math.max(0.04, b._geoH || 1);
    const renderOrder = CS3D_CFG.ARROW_RENDER_ORDER != null ? CS3D_CFG.ARROW_RENDER_ORDER : 40;
    const specs = b.moveAxis === "horizontal" ? [
        { tipX: -w / 2 + inset, tipZ: 0, dirX: -1, dirZ: 0, rotY: Math.PI },
        { tipX: w / 2 - inset, tipZ: 0, dirX: 1, dirZ: 0, rotY: 0 },
    ] : [
        { tipX: 0, tipZ: -h / 2 + inset, dirX: 0, dirZ: -1, rotY: Math.PI / 2 },
        { tipX: 0, tipZ: h / 2 - inset, dirX: 0, dirZ: 1, rotY: -Math.PI / 2 },
    ];
    b._arrowGroup.visible = true;
    for (let i = 0; i < 2; i++) {
        const marker = b._arrowGroup.children[i];
        const spec = specs[i];
        marker.visible = true;
        marker.position.set(spec.tipX - spec.dirX * tipOffset, y, spec.tipZ - spec.dirZ * tipOffset);
        marker.rotation.set(0, spec.rotY, 0);
        marker.scale.setScalar(scale);
        marker.traverse((o) => {
            if (!o.isMesh) return;
            o.renderOrder = renderOrder;
            o.material = mat;
        });
        marker.updateMatrix();
    }
}


// ================= 3D rendering (Three.js) =================
// Builds a WebGL scene from the same block data the 2D renderer used. All
// motion (wobble, drag squish, elastic snap) is read from the cosmetic render
// floats produced by csUpdate and expressed as slab scale / squash-&-stretch /
// bob / tilt so the "jelly" feel carries into 3D.

function cs3dFootprintShape(w, h, r) {
    // A rounded rectangle of size w x h centred on the origin, in the XY plane.
    // r is an absolute corner radius (in cells), clamped so it never exceeds the
    // half-extent — so growing w/h extends the straight sides, not the corners.
    // r may be a single number (all four corners equal) or an array of per-corner
    // radii [BL, BR, TR, TL] (draw order), used to keep interior seams sharp while
    // the exposed outer corners stay rounded.
    const T = window.THREE;
    const s = new T.Shape();
    const half = Math.min(w, h) * 0.5;
    const cl = (v) => Math.max(0, Math.min(v, half));
    let rBL, rBR, rTR, rTL;
    if (Array.isArray(r)) {
        rBL = cl(r[0]); rBR = cl(r[1]); rTR = cl(r[2]); rTL = cl(r[3]);
    } else {
        rBL = rBR = rTR = rTL = cl(r);
    }
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + rBL, y);
    s.lineTo(x + w - rBR, y);
    if (rBR > 0) s.quadraticCurveTo(x + w, y, x + w, y + rBR); else s.lineTo(x + w, y);
    s.lineTo(x + w, y + h - rTR);
    if (rTR > 0) s.quadraticCurveTo(x + w, y + h, x + w - rTR, y + h); else s.lineTo(x + w, y + h);
    s.lineTo(x + rTL, y + h);
    if (rTL > 0) s.quadraticCurveTo(x, y + h, x, y + h - rTL); else s.lineTo(x, y + h);
    s.lineTo(x, y + rBL);
    if (rBL > 0) s.quadraticCurveTo(x, y, x + rBL, y); else s.lineTo(x, y);
    return s;
}

// Occupancy of every block's logical cells, "col,row" keyed → owning block.
// Rebuilt once per frame (in csDraw) so corner-sharpening and seam detection
// share one pass.
function cs3dBuildOccupancy() {
    // Reuse one Map with numeric keys (col*rows+row) instead of allocating a new
    // Map and string keys every frame — this ran per-frame in csDraw and was a
    // steady source of GC pressure. Cleared and repopulated in place.
    const occ = CS3D._occMap || (CS3D._occMap = new Map());
    occ.clear();
    const rows = gridRows || 1;
    for (const b of blocks) {
        for (let r = 0; r < b.h; r++)
            for (let c = 0; c < b.w; c++) occ.set((b.x + c) * rows + (b.y + r), b);
    }
    return occ;
}

// Per-corner radius for a block: a corner squares off only when this block is
// itself expanded AND another *expanded* block sits flush against a face
// meeting at that corner. Unexpanded (1×1) blocks stay fully rounded, and an
// expanded block stays rounded where it meets an unexpanded neighbour or a
// board edge. Returns [BL,BR,TR,TL].
function cs3dCornerRadii(b, baseR) {
    if (!cs3dExpanded(b)) return [baseR, baseR, baseR, baseR];
    const occ = CS3D._occ || (CS3D._occ = cs3dBuildOccupancy());
    // An expanded neighbour (not b itself) occupies cell (c,r)?
    const exp = (c, r) => {
        const o = occ.get(c * (gridRows || 1) + r);
        return !!o && o !== b && cs3dExpanded(o);
    };
    const x = b.x, y = b.y, w = b.w, h = b.h;
    const rBL = (exp(x - 1, y + h - 1) || exp(x, y + h)) ? 0 : baseR;
    const rBR = (exp(x + w, y + h - 1) || exp(x + w - 1, y + h)) ? 0 : baseR;
    const rTR = (exp(x + w, y) || exp(x + w - 1, y - 1)) ? 0 : baseR;
    const rTL = (exp(x - 1, y) || exp(x, y - 1)) ? 0 : baseR;
    return [rBL, rBR, rTR, rTL];
}

// Unit (1x1) rounded tile shape, used for the flat board tiles.
function cs3dRoundedFootprint(r) {
    return cs3dFootprintShape(1, 1, r);
}

// Rebuild the snap-socket geometry (a flat rounded panel a little larger than
// the block) whenever the held piece's footprint changes.
function cs3dEnsureSnapGeo(w, h) {
    const key = w + "x" + h;
    if (CS3D._snapKey === key) return;
    CS3D._snapKey = key;
    const T = window.THREE;
    const m = CS3D_CFG.SNAP_MARGIN;
    const geo = new T.ShapeGeometry(
        cs3dFootprintShape(w + 2 * m, h + 2 * m, CS3D_CFG.CORNER_R + m)
    );
    geo.rotateX(-Math.PI / 2);
    if (CS3D.snapMesh.geometry) CS3D.snapMesh.geometry.dispose();
    CS3D.snapMesh.geometry = geo;
}

function cs3dEnsureTutorialDestinationFillGeo(w, h) {
    const key = w + "x" + h;
    if (CS3D._tutorialDestinationFillKey === key) return;
    CS3D._tutorialDestinationFillKey = key;
    const T = window.THREE;
    const geo = new T.ShapeGeometry(
        cs3dFootprintShape(w, h, CS3D_CFG.CORNER_R)
    );
    geo.rotateX(-Math.PI / 2);
    if (CS3D.tutorialDestinationFillMesh.geometry) {
        CS3D.tutorialDestinationFillMesh.geometry.dispose();
    }
    CS3D.tutorialDestinationFillMesh.geometry = geo;
}

function cs3dCreateTutorialDestinationMeshes() {
    if (!CS3D.glowGroup || CS3D.tutorialDestinationFillMesh) return;
    const T = window.THREE;
    const fillMesh = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
            color: 0xffffff, transparent: true,
            opacity: CS3D_CFG.SNAP_OPACITY, depthWrite: false, toneMapped: false,
        })
    );
    fillMesh.raycast = () => {};
    fillMesh.renderOrder = 1;
    fillMesh.visible = false;
    CS3D.glowGroup.add(fillMesh);
    CS3D.tutorialDestinationFillMesh = fillMesh;
    CS3D._tutorialDestinationFillKey = null;

    const outlineMesh = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
        })
    );
    outlineMesh.raycast = () => {};
    outlineMesh.renderOrder = 1;
    outlineMesh.visible = false;
    CS3D.glowGroup.add(outlineMesh);
    CS3D.tutorialDestinationOutlineMesh = outlineMesh;
    CS3D._tutorialDestinationOutlineKey = null;
}

function cs3dDestroyTutorialDestinationMeshes() {
    for (const key of ["tutorialDestinationFillMesh", "tutorialDestinationOutlineMesh"]) {
        const mesh = CS3D[key];
        if (!mesh) continue;
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
        mesh.geometry.dispose();
        CS3D[key] = null;
    }
    CS3D._tutorialDestinationFillKey = null;
    CS3D._tutorialDestinationOutlineKey = null;
}

function cs3dEnsureTutorialDestinationOutlineGeo(w, h) {
    const key = w + "x" + h;
    if (CS3D._tutorialDestinationOutlineKey === key) return;
    CS3D._tutorialDestinationOutlineKey = key;
    const T = window.THREE;
    const pad = 0.24;
    const unit = 256;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((w + 2 * pad) * unit);
    canvas.height = Math.ceil((h + 2 * pad) * unit);
    const ctx = canvas.getContext("2d");
    ctx.scale(unit, unit);
    const radius = Math.min(0.14, w / 2, h / 2);
    const path = () => {
        ctx.beginPath();
        ctx.moveTo(pad + radius, pad);
        ctx.lineTo(pad + w - radius, pad);
        ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + radius);
        ctx.lineTo(pad + w, pad + h - radius);
        ctx.quadraticCurveTo(pad + w, pad + h, pad + w - radius, pad + h);
        ctx.lineTo(pad + radius, pad + h);
        ctx.quadraticCurveTo(pad, pad + h, pad, pad + h - radius);
        ctx.lineTo(pad, pad + radius);
        ctx.quadraticCurveTo(pad, pad, pad + radius, pad);
        ctx.closePath();
    };
    path();
    ctx.setLineDash([0.07, 0.055]);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(197, 40, 56, .38)";
    ctx.lineWidth = 0.055;
    ctx.shadowColor = "rgba(213, 47, 64, .58)";
    ctx.shadowBlur = 0.08 * unit;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    path();
    ctx.strokeStyle = "#d52f40";
    ctx.lineWidth = 0.026;
    ctx.stroke();
    const texture = new T.CanvasTexture(canvas);
    if ("colorSpace" in texture && T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
    const geo = new T.PlaneGeometry(w + 2 * pad, h + 2 * pad);
    geo.rotateX(-Math.PI / 2);
    const mesh = CS3D.tutorialDestinationOutlineMesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material.map) mesh.material.map.dispose();
    mesh.geometry = geo;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
}

// Build an extruded slab (footprint w x h, corner radius r) standing BLOCK_H
// tall and centred on Y, ready to drop into the board group.
// Optional `hole` = { x, y, radius, segments } in footprint (shape) space —
// used by locked blocks for the stake well.
function cs3dSlabGeo(w, h, r, rigid, hole) {
    const T = window.THREE;
    const shape = cs3dFootprintShape(w, h, r);
    if (hole && hole.radius > 0.01) {
        const path = new T.Path();
        // Shape lives in XY then rotateX(-π/2) maps shapeY → -localZ. Negate so
        // the cutout lands on the same local Z as stake/plug (hole.y).
        path.absarc(hole.x, -hole.y, hole.radius, 0, Math.PI * 2, true);
        shape.holes.push(path);
    }
    const geo = new T.ExtrudeGeometry(shape, {
        depth: CS3D_CFG.BLOCK_H, bevelEnabled: false, steps: 1,
        curveSegments: Math.max(rigid ? 1 : 6, hole ? (hole.segments || 24) : 6),
    });
    geo.translate(0, 0, -CS3D_CFG.BLOCK_H / 2); // centre on the extrude axis
    geo.rotateX(-Math.PI / 2);                  // extrude axis -> world Y (up)
    geo.computeVertexNormals();
    return geo;
}

// Stake-well hole in locked-slab local space (matches the pinned original cell).
// Computed against the *current geo footprint* when baking; callers must reuse
// b._holeLocal while that geo is live so fail-expand lunges don't drift the
// stake / plug away from the cutout.
function cs3dLockStakeHole(b, geoW, geoH) {
    if (!b || !b.locked) return null;
    const ax = b.x + (b.initialOffsetX || 0) + (b.initW || 1) / 2;
    const az = b.y + (b.initialOffsetY || 0) + (b.initH || 1) / 2;
    const cx = b.renderX + b.renderW / 2;
    const cz = b.renderY + b.renderH / 2;
    const pad = CS3D_CFG.CELL_PAD || 0;
    const fpW = Math.max(0.02, b.renderW - 2 * pad);
    const fpH = Math.max(0.02, b.renderH - 2 * pad);
    let hx = (ax - cx) * (geoW / fpW);
    let hz = (az - cz) * (geoH / fpH);

    const margin = 0.03;
    let holeR = CS3D_CFG.LOCKED_STAKE_INDENT_RADIUS || 0.15;
    const maxR = Math.min(geoW, geoH) * 0.5 - margin;
    holeR = Math.min(holeR, Math.max(0.02, maxR));
    const limX = Math.max(0, geoW / 2 - holeR - margin);
    const limZ = Math.max(0, geoH / 2 - holeR - margin);
    hx = Math.max(-limX, Math.min(limX, hx));
    hz = Math.max(-limZ, Math.min(limZ, hz));
    if (holeR < 0.02) return null;
    return {
        x: hx,
        y: hz,
        radius: holeR,
        segments: Math.max(8, Math.round(CS3D_CFG.LOCKED_STAKE_SEGMENTS || 24)),
    };
}

// Plug the through-hole from below so only a shallow top well remains.
// Uses an annular (tube) plug — open in the middle — so the stake can pass
// through without clipping a coplanar floor disc.
function cs3dEnsureIndentWell(b, hole) {
    const T = window.THREE;
    const mesh = b._mesh;
    if (!mesh || !hole) {
        if (b._indentPlug) b._indentPlug.visible = false;
        if (b._indentFloor) b._indentFloor.visible = false;
        if (b._indentSeal) b._indentSeal.visible = false;
        if (b._indentHit) b._indentHit.visible = false;
        return;
    }

    const H = CS3D_CFG.BLOCK_H;
    const indentD = Math.min(
        Math.max(0.02, CS3D_CFG.LOCKED_STAKE_INDENT_DEPTH || 0.03),
        H * 0.45
    );
    const plugH = Math.max(0.02, H - indentD);
    const segs = hole.segments || 24;
    const stakeR = Math.max(
        0.02,
        (CS3D_CFG.LOCKED_STAKE_RADIUS || 0.1) *
            Math.max(1, CS3D_CFG.LOCKED_STAKE_TAPER || 1)
    );
    // Clearance so the tube never shares a surface with the stake shaft.
    const innerR = Math.min(hole.radius * 0.9, stakeR * 1.12);
    const outerR = hole.radius * 0.995;

    if (!b._indentPlug) {
        const plugMat = new T.MeshStandardMaterial({
            color: cs3dColor(
                CS3D_CFG.LOCKED_STAKE_INDENT_COLOR ||
                    CS3D_CFG.LOCKED_STAKE_INDENT_CENTER_COLOR ||
                    CS3D_CFG.LOCKED_STONE_COLOR
            ),
            roughness: Math.min(1, (CS3D_CFG.LOCKED_STONE_ROUGHNESS || 0.8) + 0.05),
            metalness: 0,
        });
        const plug = new T.Mesh(
            new T.LatheGeometry([
                new T.Vector2(0.5, 0),
                new T.Vector2(1, 0),
                new T.Vector2(1, 1),
                new T.Vector2(0.5, 1),
            ], segs),
            plugMat
        );
        plug.name = "indentPlug";
        plug.castShadow = false;
        plug.receiveShadow = true;
        plug.raycast = () => {};
        mesh.add(plug);
        b._indentPlug = plug;
        b._indentPlugMat = plugMat;
    }
    // Hide any legacy full-disc floor from older builds.
    if (b._indentFloor) b._indentFloor.visible = false;

    if (!b._indentSeal) {
        // Caps the shaft under the stake so the hole isn't see-through.
        const sealMat = new T.MeshStandardMaterial({
            color: cs3dColor(
                CS3D_CFG.LOCKED_STAKE_INDENT_CENTER_COLOR ||
                    CS3D_CFG.LOCKED_STONE_COLOR
            ),
            roughness: CS3D_CFG.LOCKED_STONE_ROUGHNESS,
            metalness: 0,
        });
        const seal = new T.Mesh(new T.CircleGeometry(1, 24), sealMat);
        seal.name = "indentSeal";
        seal.rotation.x = -Math.PI / 2;
        seal.castShadow = false;
        seal.receiveShadow = true;
        seal.raycast = () => {};
        mesh.add(seal);
        b._indentSeal = seal;
        b._indentSealMat = sealMat;
    }

    // Invisible pick volume filling the well + stake so clicks there count as
    // the block (slab geometry has a hole, and decorative stake meshes no-op raycast).
    if (!b._indentHit) {
        const hitMat = new T.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            colorWrite: false,
        });
        const hit = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 16), hitMat);
        hit.name = "indentHit";
        hit.userData.block = b;
        hit.castShadow = false;
        hit.receiveShadow = false;
        // Keep visible=true so Raycaster still tests it; opacity/colorWrite hide it.
        hit.visible = true;
        mesh.add(hit);
        b._indentHit = hit;
    }

    const plug = b._indentPlug;
    const plugSig = [innerR.toFixed(4), outerR.toFixed(4), segs].join("|");
    if (plug.userData.sig !== plugSig) {
        plug.userData.sig = plugSig;
        if (plug.geometry) plug.geometry.dispose();
        // Closed annular profile: well floor is the top ring face (no disc under stake).
        plug.geometry = new T.LatheGeometry([
            new T.Vector2(innerR, 0),
            new T.Vector2(outerR, 0),
            new T.Vector2(outerR, 1),
            new T.Vector2(innerR, 1),
        ], segs);
        plug.geometry.computeVertexNormals();
    }
    // Unit-height lathe scaled to plugH; top flush with well floor.
    plug.scale.set(1, plugH, 1);
    plug.position.set(hole.x, -H / 2, hole.y);
    plug.visible = true;
    if (b._indentPlugMat) {
        b._indentPlugMat.color.copy(cs3dColor(
            CS3D_CFG.LOCKED_STAKE_INDENT_COLOR ||
                CS3D_CFG.LOCKED_STAKE_INDENT_CENTER_COLOR ||
                CS3D_CFG.LOCKED_STONE_COLOR
        ));
        b._indentPlugMat.roughness = Math.min(
            1,
            (CS3D_CFG.LOCKED_STONE_ROUGHNESS || 0.8) + 0.05
        );
    }

    const seal = b._indentSeal;
    if (!seal.geometry || seal.userData.segs !== segs) {
        if (seal.geometry) seal.geometry.dispose();
        seal.geometry = new T.CircleGeometry(1, segs);
        seal.userData.segs = segs;
    }
    seal.scale.set(innerR, innerR, 1);
    // Sit the seal just under the stake tip so embed never hits a coplanar plane.
    const embed = Math.max(0, CS3D_CFG.LOCKED_STAKE_EMBED || 0);
    const sealY = Math.max(-H / 2 + 0.01, H / 2 - embed - 0.04);
    seal.position.set(hole.x, sealY, hole.y);
    seal.visible = true;
    if (b._indentSealMat) {
        b._indentSealMat.color.copy(cs3dColor(
            CS3D_CFG.LOCKED_STAKE_INDENT_CENTER_COLOR ||
                CS3D_CFG.LOCKED_STONE_COLOR
        ));
        b._indentSealMat.roughness = CS3D_CFG.LOCKED_STONE_ROUGHNESS;
    }

    const hit = b._indentHit;
    const rise = Math.max(0, CS3D_CFG.LOCKED_STAKE_HEIGHT || 0);
    const hitH = Math.max(H * 0.5, embed + rise + indentD);
    // Cover the well opening and the stake shaft for picking.
    hit.scale.set(Math.max(outerR, stakeR * 1.05), hitH, Math.max(outerR, stakeR * 1.05));
    hit.position.set(hole.x, H / 2 - embed + hitH / 2 - indentD * 0.25, hole.y);
    hit.userData.block = b;
    hit.visible = true;
}

function cs3dPlatformGeo(w, h) {
    const T = window.THREE;
    const geo = new T.ExtrudeGeometry(
        cs3dFootprintShape(w, h, CS3D_CFG.PLATFORM_R),
        { depth: CS3D_CFG.PLATFORM_H, bevelEnabled: false, steps: 1, curveSegments: 6 }
    );
    geo.translate(0, 0, -CS3D_CFG.PLATFORM_H / 2);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
}

// (Re)build a block's slab geometry with a fixed world-space corner radius.
// At rest it uses the exact integer footprint (crisp corners). While animating
// (expand / shrink / fail lunge) it follows the *animated* footprint, quantised
// to QSTEP so rebuilds stay infrequent — the sub-step remainder is bridged by
// scale in cs3dUpdateBlock. This makes the fail-expand lunge extend the sides
// instead of stretch-scaling the corners.
function cs3dEnsureGeo(b) {
    const rigid = !!b.preExpanded;
    let radii, cornerSig;
    if (rigid) {
        radii = CS3D_CFG.RIGID_CORNER_R; cornerSig = "R";
    } else {
        radii = cs3dCornerRadii(b, CS3D_CFG.CORNER_R);
        cornerSig = radii.map((v) => (v > 0 ? "1" : "0")).join("");
    }
    const pad = CS3D_CFG.CELL_PAD, QSTEP = 0.1;
    const atRest = rigid ||
        (Math.abs(b.renderW - b.w) < 0.02 && Math.abs(b.renderH - b.h) < 0.02);
    let aw, ah, key;
    // Keep the rigid frame at the exact gameplay footprint, but inset its colored
    // slab slightly so the overlapping faces cannot z-fight. Character config can
    // tighten that inset further via blockInteriorScale (preExpanded only).
    let interiorScale = 1;
    let interiorSig = "1";
    if (rigid) {
        interiorScale = CS3D_CFG.CRATE_INTERIOR_SCALE;
        interiorSig = "C" + interiorScale.toFixed(3);
        if (window.BlockCharacters && typeof BlockCharacters.interiorScaleFor === "function") {
            const charScale = BlockCharacters.interiorScaleFor(b);
            if (charScale < interiorScale) {
                interiorScale = charScale;
                interiorSig = "B" + Number(interiorScale).toFixed(3);
            }
        }
    }
    if (atRest) {
        aw = b.w; ah = b.h; key = "I" + b.w + "x" + b.h + cornerSig + interiorSig;
    } else {
        aw = Math.round(b.renderW / QSTEP) * QSTEP;
        ah = Math.round(b.renderH / QSTEP) * QSTEP;
        key = "A" + aw.toFixed(2) + "x" + ah.toFixed(2) + cornerSig + interiorSig;
    }
    b._geoW = Math.max(0.04, aw - 2 * pad);
    b._geoH = Math.max(0.04, ah - 2 * pad);

    // Locked stake well: bake hole offset into the key so the recess tracks the
    // original cell as the slab expands around it.
    let hole = null;
    if (b.locked) {
        hole = cs3dLockStakeHole(b, b._geoW * interiorScale, b._geoH * interiorScale);
        if (hole) {
            const hq = 0.05;
            key += "Hv2" +
                (Math.round(hole.x / hq) * hq).toFixed(2) + "," +
                (Math.round(hole.y / hq) * hq).toFixed(2) + "," +
                hole.radius.toFixed(3);
        } else {
            key += "H0";
        }
    }

    if (b._geoKey === key) {
        // Keep plug / stake on the *baked* cutout — never the live fail-lunge
        // offset, or the hole drifts away from the dowel mid-animation.
        if (b.locked) cs3dEnsureIndentWell(b, b._holeLocal || null);
        return;
    }
    b._geoKey = key;
    b._holeLocal = hole;
    const T = window.THREE;
    const geo = cs3dSlabGeo(
        b._geoW * interiorScale,
        b._geoH * interiorScale,
        radii,
        rigid,
        hole
    );
    if (b._mesh.geometry && b._mesh.geometry.dispose) b._mesh.geometry.dispose();
    b._mesh.geometry = geo;
    if (b._crateFrame) cs3dResizeCrateFrame(b);
    if (b.locked) cs3dEnsureIndentWell(b, hole);
}

// Rigid blocks get a cardboard-box wall around their footprint: four kraft
// perimeter rails with a lighter cut-edge highlight strip along the top.
// Every element is inset from the logical footprint so neighbours meet flush.
function cs3dResizeCrateFrame(b) {
    const frame = b._crateFrame;
    if (!frame) return;
    const t = CS3D_CFG.CRATE_FRAME_T, inset = CS3D_CFG.CRATE_FRAME_INSET;
    const w = Math.max(0.04, b._geoW - inset * 2);
    const h = Math.max(0.04, b._geoH - inset * 2);
    const railH = CS3D_CFG.BLOCK_H + t * 0.7;
    const railY = t * 0.08;
    const setRail = (rail, accent, horizontal, sign) => {
        if (horizontal) {
            rail.scale.set(w, railH, t);
            rail.position.set(0, railY, sign * (h - t) / 2);
            accent.scale.set(Math.max(0.01, w - t * 1.35), t * 0.22, t * 0.22);
            accent.position.set(0, CS3D_CFG.BLOCK_H / 2 + t * 0.37, sign * (h - t * 1.3) / 2);
        } else {
            rail.scale.set(t, railH, Math.max(0.01, h - t * 2));
            rail.position.set(sign * (w - t) / 2, railY, 0);
            accent.scale.set(t * 0.22, t * 0.22, Math.max(0.01, h - t * 3.35));
            accent.position.set(sign * (w - t * 1.3) / 2, CS3D_CFG.BLOCK_H / 2 + t * 0.37, 0);
        }
    };
    setRail(frame.userData.rails[0], frame.userData.accents[0], true, -1);
    setRail(frame.userData.rails[1], frame.userData.accents[1], false, 1);
    setRail(frame.userData.rails[2], frame.userData.accents[2], true, 1);
    setRail(frame.userData.rails[3], frame.userData.accents[3], false, -1);

    const bracketSpan = Math.min(0.42, Math.max(t * 2.5, Math.min(w, h) * 0.32));
    for (const [i, bracket] of frame.userData.corners.entries()) {
        // L-corner caps removed — rails alone read cleaner with character overlays.
        bracket.visible = false;
        const xSign = i === 0 || i === 3 ? -1 : 1;
        const zSign = i < 2 ? -1 : 1;
        const [horizontal, vertical] = bracket.children;
        const y = CS3D_CFG.BLOCK_H / 2 + t * 0.26;
        horizontal.scale.set(bracketSpan, t * 1.15, t * 1.45);
        horizontal.position.set(xSign * (w / 2 - bracketSpan / 2), y, zSign * (h / 2 - t * 0.725));
        vertical.scale.set(t * 1.45, t * 1.15, bracketSpan);
        vertical.position.set(xSign * (w / 2 - t * 0.725), y, zSign * (h / 2 - bracketSpan / 2));
    }

    // Shipping stamps sit flat on the box body's exterior wall faces.
    const stamps = frame.userData.stamps;
    if (stamps) {
        const stampH = Math.min(0.34, CS3D_CFG.BLOCK_H * 0.7);
        for (const s of stamps) {
            const tex = s.mesh.material.map;
            const aspect = tex && tex.image ? tex.image.width / tex.image.height : 1;
            const wallLen = s.horizontal ? w : Math.max(0.04, h - t * 2);
            let sh = stampH, sw = sh * aspect;
            const maxW = wallLen * 0.7;
            if (sw > maxW) { sh *= maxW / sw; sw = maxW; }
            if (s.horizontal) {
                s.mesh.rotation.set(0, s.sign > 0 ? 0 : Math.PI, 0);
                s.mesh.position.set(0, railY, s.sign * (h / 2 + 0.008));
            } else {
                s.mesh.rotation.set(0, s.sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
                s.mesh.position.set(s.sign * (w / 2 + 0.008), railY, 0);
            }
            s.mesh.scale.set(sw, sh, 1);
        }
    }

    // The frame's parts are static relative to the block between resizes; bake
    // their local matrices once so only the animated parent recomputes per frame.
    frame.matrixAutoUpdate = false; frame.updateMatrix();
    frame.traverse((o) => { if (o !== frame) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
}

// Lathe profile for a tapered wooden dowel with a rounded top fillet.
// Intentionally omits axis (x=0) points — those collapse a whole ring of
// vertices onto one spot and wreck averaged normals / lighting on the bevel.
function cs3dStakeProfile(bottomR, topR, height, bevel, bevelSegs) {
    const T = window.THREE;
    const b = Math.min(
        Math.max(0, bevel),
        height * 0.45,
        Math.max(0.001, topR * 0.95)
    );
    const shaftH = Math.max(0.01, height - b);
    const segs = Math.max(1, Math.round(bevelSegs));
    const pts = [];

    // Shaft: a few samples so a taper still gets smooth side normals.
    const shaftSteps = 4;
    for (let i = 0; i <= shaftSteps; i++) {
        const t = i / shaftSteps;
        pts.push(new T.Vector2(
            bottomR + (topR - bottomR) * t,
            shaftH * t
        ));
    }

    // Quarter-circle fillet: side → top flat rim (not the axis).
    // Skip i=0 (duplicates the last shaft point).
    for (let i = 1; i <= segs; i++) {
        const ang = (i / segs) * (Math.PI / 2);
        pts.push(new T.Vector2(
            Math.max(0.001, (topR - b) + b * Math.cos(ang)),
            shaftH + b * Math.sin(ang)
        ));
    }
    return pts;
}

// Shared radial-gradient texture for the driven-stake indent (darker in the middle).
function cs3dEnsureStakeIndentTexture() {
    const T = window.THREE;
    const center = CS3D_CFG.LOCKED_STAKE_INDENT_CENTER_COLOR || "#3a3530";
    const edge = CS3D_CFG.LOCKED_STAKE_INDENT_COLOR || "#6e675c";
    const sig = "solid|" + center + "|" + edge;
    if (CS3D._stakeIndentTex && CS3D._stakeIndentTexSig === sig) return CS3D._stakeIndentTex;

    const S = 128;
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = S;
    const ctx = cvs.getContext("2d");
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, center);
    g.addColorStop(0.55, edge);
    g.addColorStop(1, edge);
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.fill();

    if (CS3D._stakeIndentTex) CS3D._stakeIndentTex.dispose();
    const tex = new T.CanvasTexture(cvs);
    if ("encoding" in tex) tex.encoding = T.sRGBEncoding;
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.needsUpdate = true;
    CS3D._stakeIndentTex = tex;
    CS3D._stakeIndentTexSig = sig;
    return tex;
}

// Shared procedural kraft-cardboard texture for rigid pre-expanded "box" walls.
// Neutral white base (so CRATE_WALL_COLOR tints the hue) with a sparse
// recycled-paper fleck, so the rim reads as a cardboard box rather than metal.
function cs3dEnsureCardboardTexture() {
    if (CS3D._cardboardTex) return CS3D._cardboardTex;
    const T = window.THREE;
    const S = 128;
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = S;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, S, S);
    // Recycled-kraft grain: sparse light and dark paper fibres.
    for (let i = 0; i < 1100; i++) {
        const x = Math.random() * S, y = Math.random() * S;
        ctx.fillStyle = Math.random() < 0.5
            ? `rgba(70,45,22,${0.05 + Math.random() * 0.12})`
            : `rgba(255,250,235,${0.05 + Math.random() * 0.10})`;
        ctx.fillRect(x, y, 1, 1);
    }
    const tex = new T.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(2, 2);
    if ("encoding" in tex) tex.encoding = T.sRGBEncoding;
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = CS3D.renderer ? CS3D.renderer.capabilities.getMaxAnisotropy() : 1;
    tex.needsUpdate = true;
    CS3D._cardboardTex = tex;
    return tex;
}

// Shared ink-stamp textures (transparent background) printed on the cardboard
// box exterior to sell the shipping-box look: a "this way up / FRAGILE" mark
// and an on-theme cat-paw postmark.
function cs3dEnsureStampTexture(kind) {
    CS3D._stampTex = CS3D._stampTex || {};
    if (CS3D._stampTex[kind]) return CS3D._stampTex[kind];
    const T = window.THREE;
    const cvs = document.createElement("canvas");
    const ctx = cvs.getContext("2d");
    if (kind === "fragile") {
        cvs.width = 256; cvs.height = 148;
        const ink = "rgba(178,58,46,0.9)";   // faded shipping red
        const black = "rgba(40,32,26,0.88)";
        ctx.fillStyle = black;                // two "this way up" arrows
        for (let a = 0; a < 2; a++) {
            const cx = 42 + a * 44, top = 28, base = 104;
            ctx.beginPath();
            ctx.moveTo(cx, top);
            ctx.lineTo(cx + 22, top + 28);
            ctx.lineTo(cx + 8, top + 28);
            ctx.lineTo(cx + 8, base);
            ctx.lineTo(cx - 8, base);
            ctx.lineTo(cx - 8, top + 28);
            ctx.lineTo(cx - 22, top + 28);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = ink;
        ctx.font = "700 33px 'Nunito', sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText("FRAGILE", 116, 72);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 5;
        ctx.strokeRect(10, 12, 236, 124);
    } else { // cat-paw postmark
        cvs.width = cvs.height = 220;
        const ink = "rgba(44,58,85,0.85)"; // navy postmark ink
        const cx = 110, cy = 110;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(cx, cy, 96, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 82, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = ink;               // paw pad + four toe beans
        ctx.beginPath(); ctx.ellipse(cx, cy + 22, 34, 28, 0, 0, Math.PI * 2); ctx.fill();
        for (const [dx, dy] of [[-40, -16], [-15, -40], [15, -40], [40, -16]]) {
            ctx.beginPath();
            ctx.ellipse(cx + dx, cy + dy, 15, 19, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Light distress so the ink reads stamped, not printed.
    const img = ctx.getImageData(0, 0, cvs.width, cvs.height);
    for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] > 0 && Math.random() < 0.16) img.data[i + 3] *= 0.35;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new T.CanvasTexture(cvs);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = CS3D.renderer ? CS3D.renderer.capabilities.getMaxAnisotropy() : 1;
    tex.needsUpdate = true;
    CS3D._stampTex[kind] = tex;
    return tex;
}


// Wooden stake driven into a locked block. Built once; cs3dUpdateLockStake keeps
// it pinned to the original cell while the slab expands around it.
function cs3dCreateLockStake(b) {
    const T = window.THREE;

    const woodMat = new T.MeshStandardMaterial({
        color: cs3dColor(CS3D_CFG.LOCKED_STAKE_COLOR),
        roughness: CS3D_CFG.LOCKED_STAKE_ROUGHNESS,
        metalness: 0,
        flatShading: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
    const topMat = new T.MeshStandardMaterial({
        color: cs3dColor(CS3D_CFG.LOCKED_STAKE_TOP_COLOR || CS3D_CFG.LOCKED_STAKE_COLOR),
        roughness: Math.min(1, CS3D_CFG.LOCKED_STAKE_ROUGHNESS + 0.04),
        metalness: 0,
        flatShading: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });

    const group = new T.Group();
    group.name = "lockStake";

    // Side + bevel only (open lathe). Flat top is a separate disc so its normals
    // stay clean and lighting on the bevel doesn't break.
    const post = new T.Mesh(
        new T.LatheGeometry(cs3dStakeProfile(1, 1, 1, 0.1, 4), 16),
        woodMat
    );
    post.castShadow = true;
    post.receiveShadow = true;
    post.raycast = () => {};
    group.add(post);

    const cap = new T.Mesh(new T.CircleGeometry(1, 16), topMat);
    cap.rotation.x = -Math.PI / 2;
    cap.castShadow = false;
    cap.receiveShadow = true;
    cap.raycast = () => {};
    group.add(cap);

    // Number sits on the stake's flat top (not on the slab decal).
    const labelCvs = document.createElement("canvas");
    labelCvs.width = labelCvs.height = 128;
    const labelTex = new T.CanvasTexture(labelCvs);
    if ("encoding" in labelTex) labelTex.encoding = T.sRGBEncoding;
    if ("colorSpace" in labelTex && T.SRGBColorSpace) labelTex.colorSpace = T.SRGBColorSpace;
    const label = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
            map: labelTex, transparent: true, depthWrite: false,
        })
    );
    label.rotation.x = -Math.PI / 2;
    label.renderOrder = 4;
    label.raycast = () => {};
    group.add(label);

    b._mesh.add(group);
    b._stake = {
        group, post, cap, label,
        labelCanvas: labelCvs,
        labelTex,
        labelCtx: labelCvs.getContext("2d"),
        labelSig: null,
        geoSig: null,
        woodMat, topMat,
    };
    // Well (hole + plug) is owned by the slab geo path; pin to baked cutout.
    b._holeLocal = cs3dLockStakeHole(b, b._geoW || 1, b._geoH || 1);
    cs3dEnsureIndentWell(b, b._holeLocal);
    cs3dUpdateLockStake(b);
}

// Stake rides as a true child of the slab mesh so wobble / bob / intro all
// carry through. Local XZ matches the baked well cutout (b._holeLocal) so a
// fail-expand lunge can't slide the dowel off the hole.
function cs3dUpdateLockStake(b) {
    const st = b._stake;
    const mesh = b._mesh;
    if (!st || !mesh) return;

    const r = CS3D_CFG.LOCKED_STAKE_RADIUS;
    const rise = CS3D_CFG.LOCKED_STAKE_HEIGHT;
    const embed = CS3D_CFG.LOCKED_STAKE_EMBED;
    const taper = CS3D_CFG.LOCKED_STAKE_TAPER;
    const segments = Math.max(3, Math.round(CS3D_CFG.LOCKED_STAKE_SEGMENTS || 24));
    const bevel = Math.max(0, CS3D_CFG.LOCKED_STAKE_BEVEL || 0);
    const bevelSegs = Math.max(1, Math.round(CS3D_CFG.LOCKED_STAKE_BEVEL_SEGMENTS || 6));
    const stakeLen = Math.max(0.04, rise + embed);
    const topR = Math.max(0.01, r * taper);
    const topFlatR = Math.max(0.01, topR - Math.min(bevel, topR * 0.95, stakeLen * 0.45));

    const hole = b._holeLocal;
    const hx = hole ? hole.x : 0;
    const hz = hole ? hole.y : 0;

    // Fully parented: inherit slab rotation / scale / bob. No counter-scale.
    st.group.scale.set(1, 1, 1);
    st.group.position.set(hx, 0, hz);

    // Local slab top is +BLOCK_H/2; drive the stake down by embed.
    const postBaseY = CS3D_CFG.BLOCK_H / 2 - embed;
    const capY = postBaseY + stakeLen + 0.001;
    const labelY = capY + 0.012;

    const geoSig = [
        r.toFixed(4), topR.toFixed(4), stakeLen.toFixed(4),
        bevel.toFixed(4), segments, bevelSegs
    ].join("|");
    if (st.geoSig !== geoSig) {
        st.geoSig = geoSig;
        const T = window.THREE;
        if (st.post.geometry) st.post.geometry.dispose();
        const geo = new T.LatheGeometry(
            cs3dStakeProfile(r, topR, stakeLen, bevel, bevelSegs),
            segments
        );
        geo.computeVertexNormals();
        st.post.geometry = geo;
        st.post.scale.set(1, 1, 1);

        if (st.cap.geometry) st.cap.geometry.dispose();
        st.cap.geometry = new T.CircleGeometry(1, segments);
    }
    // Lathe spans y=0..stakeLen; base at embed depth below the slab top.
    st.post.position.set(0, postBaseY, 0);

    st.cap.scale.set(topFlatR, topFlatR, 1);
    st.cap.position.set(0, capY, 0);
    st.cap.visible = true;

    const labelSize = Math.max(0.04, topFlatR * 2 * CS3D_CFG.LOCKED_STAKE_LABEL_SCALE);
    st.label.scale.set(labelSize, labelSize, 1);
    st.label.position.set(0, labelY, 0);

    if (st.woodMat) {
        st.woodMat.color.copy(cs3dColor(CS3D_CFG.LOCKED_STAKE_COLOR));
        st.woodMat.roughness = CS3D_CFG.LOCKED_STAKE_ROUGHNESS;
        if (st.topMat) {
            st.topMat.color.copy(cs3dColor(CS3D_CFG.LOCKED_STAKE_TOP_COLOR || CS3D_CFG.LOCKED_STAKE_COLOR));
            st.topMat.roughness = Math.min(1, CS3D_CFG.LOCKED_STAKE_ROUGHNESS + 0.04);
        }
    }

    // Target size on the stake top; hide once the block is full.
    const full = isFull(b);
    if (full || b.preExpanded) {
        st.label.visible = false;
        st.labelSig = "hide";
        return;
    }
    st.label.visible = true;
    const sig = String(b.targetSize);
    if (sig === st.labelSig) return;
    st.labelSig = sig;

    const cvs = st.labelCanvas;
    const ctx = st.labelCtx;
    const S = cvs.width;
    ctx.clearRect(0, 0, S, S);
    let fontPx = S * 0.62;
    ctx.font = `700 ${fontPx}px "Nunito", sans-serif`;
    const tw = ctx.measureText(sig).width;
    if (tw > S * 0.78) {
        fontPx *= (S * 0.78) / tw;
        ctx.font = `700 ${fontPx}px "Nunito", sans-serif`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fontPx * 0.14);
    ctx.strokeStyle = "rgba(60, 40, 20, 0.55)";
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.strokeText(sig, S / 2, S / 2);
    ctx.fillText(sig, S / 2, S / 2);
    st.labelTex.needsUpdate = true;
}

// Interpret an authoring hex/CSS colour as sRGB and return the linear-space
// THREE.Color the renderer expects, so blocks read vivid (not washed out).
function cs3dColor(c) {
    const col = new window.THREE.Color(c);
    return col.convertSRGBToLinear ? col.convertSRGBToLinear() : col;
}

// Keep the shadow penumbra a constant real-world size regardless of map
// resolution: a smaller map means each texel covers more world, so the blur
// radius must scale down proportionally to look identical.
function cs3dShadowRadius() {
    return CS3D_CFG.SHADOW_RADIUS * (CS3D_CFG.SHADOW_MAP_SIZE / CS3D_CFG.SHADOW_MAP_REF);
}

function cs3dContextLost() {
    if (!CS3D.renderer || !CS3D.ok || CS3D._contextLost) return true;
    try {
        const gl = CS3D.renderer.getContext && CS3D.renderer.getContext();
        if (gl && typeof gl.isContextLost === "function" && gl.isContextLost()) return true;
    } catch (_) {
        return true;
    }
    return false;
}

/**
 * Actually free a WebGL context. Three.js r128 dispose() does not call
 * loseContext — without this, Capacitor keeps counting dead contexts.
 */
function cs3dReleaseRenderer(renderer) {
    if (!renderer) return;
    try {
        if (typeof renderer.forceContextLoss === "function") renderer.forceContextLoss();
    } catch (_) { /* ignore */ }
    try { renderer.dispose(); } catch (_) { /* ignore */ }
}

/** Release the game WebGL context so home / Spine can claim GPU slots on Capacitor. */
function cs3dDispose() {
    if (window.BlockCharacters && typeof BlockCharacters.detach === "function" && Array.isArray(blocks)) {
        for (const b of blocks) {
            try { BlockCharacters.detach(b); } catch (_) { /* ignore */ }
            if (!b) continue;
            b._mesh = null;
            b._crateFrame = null;
            b._stake = null;
            b._geoKey = null;
        }
    }
    if (CS3D.boardGroup) {
        try { cs3dClearGroup(); } catch (_) { /* ignore */ }
    }
    const drop = (o) => { try { if (o && o.dispose) o.dispose(); } catch (_) { /* ignore */ } };
    drop(CS3D.tileGeo);
    drop(CS3D.decalGeo);
    drop(CS3D.seamGeo);
    drop(CS3D.glowTex);
    drop(CS3D._cardboardTex);
    if (CS3D._stampTex) {
        for (const key of Object.keys(CS3D._stampTex)) drop(CS3D._stampTex[key]);
    }
    if (CS3D.snapMesh) {
        drop(CS3D.snapMesh.geometry);
        drop(CS3D.snapMesh.material);
    }
    if (Array.isArray(CS3D.hintMeshes)) {
        for (const mesh of CS3D.hintMeshes) {
            if (!mesh) continue;
            drop(mesh.geometry);
            drop(mesh.material);
        }
        CS3D.hintMeshes.length = 0;
    }
    drop(CS3D.arrowMaterial);
    if (CS3D.arrowTemplate && CS3D.arrowTemplate.geometry) drop(CS3D.arrowTemplate.geometry);

    cs3dReleaseRenderer(CS3D.renderer);
    // loseContext leaves the DOM canvas unusable — swap it before the next init.
    if (typeof csReplaceGameCanvas === "function") csReplaceGameCanvas();

    CS3D.ok = false;
    CS3D._contextLost = false;
    CS3D.renderer = null;
    CS3D.scene = null;
    CS3D.camera = null;
    CS3D.boardGroup = null;
    CS3D.dir = null;
    CS3D.fill = null;
    CS3D.ambient = null;
    CS3D.hemi = null;
    CS3D.platform = null;
    CS3D.tileGeo = null;
    CS3D.decalGeo = null;
    CS3D.tileMesh = null;
    CS3D.tileMaterial = null;
    CS3D.tileCells.length = 0;
    CS3D.blockMeshes.length = 0;
    CS3D.glowGroup = null;
    CS3D.seamGeo = null;
    CS3D.seams.length = 0;
    CS3D.bursts.length = 0;
    CS3D.glowTex = null;
    CS3D.snapMesh = null;
    CS3D.tutorialDestinationFillMesh = null;
    CS3D.tutorialDestinationOutlineMesh = null;
    CS3D._snapKey = null;
    CS3D._tutorialDestinationFillKey = null;
    CS3D._tutorialDestinationOutlineKey = null;
    CS3D._cardboardTex = null;
    CS3D._stampTex = null;
    CS3D.arrowTemplate = null;
    CS3D.arrowBounds = null;
    CS3D.arrowMaterial = null;
    CS3D.arrowLoadStarted = false;
    CS3D.arrowLoadFailed = false;
    CS3D.sheenU = null;
    CS3D.hintShineU = null;
    CS3D.ray = null;
    CS3D.ndc = null;
    CS3D.plane = null;
    CS3D.hit = null;

    // CPU-side images stay valid; mark THREE textures for re-upload on next context.
    if (window.BlockCharacters && typeof BlockCharacters.invalidateTextureCaches === "function") {
        BlockCharacters.invalidateTextureCaches();
    }
}

/** Re-create the game renderer after quit / WebGL context loss. */
function cs3dEnsureReady() {
    if (!cs3dContextLost()) return true;
    console.warn("[CS3D] WebGL not ready — disposing and reinitialising");
    cs3dDispose();
    cs3dInit();
    return !!CS3D.ok;
}

function cs3dInit() {
    const T = window.THREE;
    if (!T) { console.warn("THREE.js not loaded — 3D rendering disabled."); return; }
    if (CS3D.renderer) {
        cs3dReleaseRenderer(CS3D.renderer);
        CS3D.renderer = null;
        CS3D.ok = false;
        if (typeof csReplaceGameCanvas === "function") csReplaceGameCanvas();
    }
    cs3dBeginArrowLoad();

    let renderer;
    try {
        renderer = new T.WebGLRenderer({ canvas: csCanvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
        console.error("[CS3D] Failed to create WebGLRenderer", err);
        CS3D.ok = false;
        return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    // Shadows are re-rasterised only when the scene actually moves (see csDraw).
    // The board is static at rest, so this skips the shadow pass most frames.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    if ("outputColorSpace" in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    else if ("outputEncoding" in renderer) renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.NoToneMapping;

    const scene = new T.Scene();
    // Orthographic camera: parallel projection (no perspective foreshortening).
    // The frustum bounds are (re)computed each resize in cs3dResize.
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const group = new T.Group();
    scene.add(group);

    // Soft 3D template lighting: warm key/sky light with a restrained cool fill.
    const ambient = new T.AmbientLight(0xffffff, 0.26);
    const hemi = new T.HemisphereLight(0xfff4e6, 0xc9a77d, 0.31);
    scene.add(ambient);
    scene.add(hemi);
    const dir = new T.DirectionalLight(0xfff0dd, 0.61);
    dir.castShadow = true;
    dir.shadow.mapSize.set(CS3D_CFG.SHADOW_MAP_SIZE, CS3D_CFG.SHADOW_MAP_SIZE);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 130;
    dir.shadow.bias = 0.0;
    dir.shadow.normalBias = 0.261;
    // Blur radius scales with map resolution so a smaller map keeps the same
    // real-world softness instead of reading blurrier.
    dir.shadow.radius = cs3dShadowRadius();
    scene.add(dir);
    scene.add(dir.target);
    const fill = new T.DirectionalLight(0xc0cad6, 0.26);
    scene.add(fill);

    // Shared geometry: a flat rounded tile for cells and a flat top-decal plane
    // (labels/arrows/lock markers). Block slabs are built per-block (in
    // cs3dEnsureGeo) so their corner radius stays fixed as they grow.
    const foot = cs3dRoundedFootprint(CS3D_CFG.CORNER_R);
    const tileGeo = new T.ShapeGeometry(foot);
    tileGeo.rotateX(-Math.PI / 2);    // lie flat on the board plane

    const decalGeo = new T.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);

    // Persistent group holding the between-block seam glow strips. It rides with
    // the board (child of boardGroup) but is preserved across level rebuilds so
    // its pooled meshes are never disposed by cs3dClearGroup.
    const glowGroup = new T.Group();
    group.add(glowGroup);
    const seamGeo = new T.PlaneGeometry(1, 1);
    seamGeo.rotateX(-Math.PI / 2);

    // Soft radial glow sprite texture: bright core fading smoothly to nothing, so
    // the additive seam planes read as blooming light rather than a flat quad.
    const gcvs = document.createElement("canvas");
    gcvs.width = gcvs.height = 64;
    const gctx = gcvs.getContext("2d");
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    const glowTex = new T.CanvasTexture(gcvs);
    if ("colorSpace" in glowTex && T.SRGBColorSpace) glowTex.colorSpace = T.SRGBColorSpace;
    CS3D.glowTex = glowTex;

    // Snap-target socket: a soft tinted rounded panel that sits under a held
    // piece to show the cell(s) it will drop into. Lives in the glow group so it
    // survives level rebuilds; geometry is rebuilt on demand for each size.
    const snapMesh = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
            color: 0xffffff, transparent: true,
            opacity: CS3D_CFG.HINT_OPACITY, depthWrite: false, toneMapped: false,
        })
    );
    snapMesh.raycast = () => {};
    snapMesh.renderOrder = 1;
    snapMesh.visible = false;
    glowGroup.add(snapMesh);
    CS3D.snapMesh = snapMesh; CS3D._snapKey = null;
    CS3D.renderer = renderer; CS3D.scene = scene; CS3D.camera = camera;
    CS3D.boardGroup = group; CS3D.dir = dir; CS3D.fill = fill;
    CS3D.glowGroup = glowGroup; CS3D.seamGeo = seamGeo;
    cs3dCreateTutorialDestinationMeshes();
    CS3D.ambient = ambient; CS3D.hemi = hemi;
    CS3D.tileGeo = tileGeo; CS3D.decalGeo = decalGeo;
    CS3D.ray = new T.Raycaster(); CS3D.ndc = new T.Vector2();
    CS3D.plane = new T.Plane(
        new T.Vector3(0, 1, 0), -(CS3D_CFG.BLOCK_BASE_Y + CS3D_CFG.BLOCK_H)
    );
    CS3D.hit = new T.Vector3();
    CS3D.cA = new T.Color(); CS3D.cB = new T.Color(); CS3D.cTile = new T.Color();
    // Shared uniforms for the win sheen line (patched into every block material).
    CS3D.sheenU = {
        front: { value: -1 },
        band: { value: CS_WIN.SHEEN_BAND },
        strength: { value: 0 },
        boardHalf: { value: new T.Vector2(1, 1) },
        boardSize: { value: new T.Vector2(2, 2) },
        boardScale: { value: 1 },
        boardYaw: { value: 0 },
    };
    // Shared time-driven phase for the hint shine sweep; each hint panel adds
    // its own local half-extent uniform so all active hints gleam together.
    CS3D.hintShineU = { phase: { value: 0 } };
    CS3D.ok = true;

    // Seed CSS so Soft 3D Background and the play-area stay in sync from boot.
    if (typeof CS3D_CFG.BG_COLOR === "string") {
        document.documentElement.style.setProperty("--game-bg", CS3D_CFG.BG_COLOR);
        if (typeof gameScreen !== "undefined" && gameScreen) {
            gameScreen.style.backgroundColor = CS3D_CFG.BG_COLOR;
        }
    }

    // If another WebGL user (e.g. many Spine players) steals the context, the
    // canvas goes blank with 0 draws. preventDefault allows restore; rebuild
    // the Three scene when the browser gives the context back.
    if (!csCanvas._cs3dContextHooks) {
        csCanvas._cs3dContextHooks = true;
        csCanvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            console.warn("[CS3D] WebGL context lost — board will rebuild on restore");
            CS3D.ok = false;
            CS3D._contextLost = true;
        }, false);
        csCanvas.addEventListener("webglcontextrestored", () => {
            console.warn("[CS3D] WebGL context restored — rebuilding board");
            CS3D._contextLost = false;
            if (window.BlockCharacters) {
                if (typeof BlockCharacters.disposeAllSharedSpinePlayers === "function") {
                    BlockCharacters.disposeAllSharedSpinePlayers();
                }
                if (typeof BlockCharacters.invalidateTextureCaches === "function") {
                    BlockCharacters.invalidateTextureCaches();
                }
            }
            cs3dReleaseRenderer(CS3D.renderer);
            CS3D.ok = false;
            CS3D.renderer = null;
            if (typeof csReplaceGameCanvas === "function") csReplaceGameCanvas();
            cs3dInit();
            if (typeof cs3dBuildLevel === "function" && Array.isArray(blocks) && blocks.length) {
                cs3dBuildLevel();
            }
            if (typeof csResize === "function") csResize(true);
        }, false);
    }

}

// Patch a block material so the win sheen is a thin light band that travels
// across the mesh surface (world diagonal) instead of flashing the whole slab.
function cs3dAttachSheenShader(mat) {
    const u = CS3D.sheenU;
    if (!u) return;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSheenFront = u.front;
        shader.uniforms.uSheenBand = u.band;
        shader.uniforms.uSheenStrength = u.strength;
        shader.uniforms.uBoardHalf = u.boardHalf;
        shader.uniforms.uBoardSize = u.boardSize;
        shader.uniforms.uBoardScale = u.boardScale;
        shader.uniforms.uBoardYaw = u.boardYaw;

        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                "#include <common>\nvarying vec3 vSheenWorld;"
            )
            .replace(
                "#include <project_vertex>",
                "#include <project_vertex>\nvSheenWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
uniform float uSheenFront;
uniform float uSheenBand;
uniform float uSheenStrength;
uniform vec2 uBoardHalf;
uniform vec2 uBoardSize;
uniform float uBoardScale;
uniform float uBoardYaw;
varying vec3 vSheenWorld;`
            )
            .replace(
                "#include <emissivemap_fragment>",
                `#include <emissivemap_fragment>
if (uSheenStrength > 0.001 && uSheenBand > 0.0001) {
  float scale = max(uBoardScale, 0.0001);
  // Un-rotate into board space so the line stays locked while the board orbits.
  float cy = cos(-uBoardYaw);
  float sy = sin(-uBoardYaw);
  float lx = (vSheenWorld.x * cy - vSheenWorld.z * sy) / scale;
  float lz = (vSheenWorld.x * sy + vSheenWorld.z * cy) / scale;
  float diag = 0.5 * (
    (lx + uBoardHalf.x) / uBoardSize.x +
    (lz + uBoardHalf.y) / uBoardSize.y
  );
  float d = abs(diag - uSheenFront);
  // Softer edge falloff: smootherstep shoulders + a gentle wide halo.
  float t = clamp(1.0 - d / uSheenBand, 0.0, 1.0);
  float soft = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  float coreT = clamp(1.0 - d / (uSheenBand * 0.45), 0.0, 1.0);
  float core = coreT * coreT * (3.0 - 2.0 * coreT);
  float line = soft * 0.7 + core * 0.45;
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.88) * (line * uSheenStrength);
}`
            );
    };
    mat.customProgramCacheKey = () => "csSheenLine3";
}

// Patch a hint panel material so a soft diagonal highlight band sweeps across
// its footprint on a loop, giving the highlighted cells a gentle glossy shine.
// Each panel carries its own half-extent uniform (so the band spans that
// footprint exactly) and shares the time-driven phase advanced in csDraw.
function cs3dAttachHintShine(mat, halfU) {
    const phaseU = CS3D.hintShineU && CS3D.hintShineU.phase;
    if (!phaseU) return;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHintPhase = phaseU;
        shader.uniforms.uHintHalf = halfU;
        shader.uniforms.uHintBand = { value: CS3D_CFG.HINT_SHINE_BAND };
        shader.uniforms.uHintStrength = { value: CS3D_CFG.HINT_SHINE_STRENGTH };

        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                "#include <common>\nvarying vec3 vHintLocal;"
            )
            .replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\nvHintLocal = position;"
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
uniform float uHintPhase;
uniform vec2 uHintHalf;
uniform float uHintBand;
uniform float uHintStrength;
varying vec3 vHintLocal;`
            )
            .replace(
                "#include <color_fragment>",
                `#include <color_fragment>
if (uHintStrength > 0.001 && uHintBand > 0.0001) {
  float lx = clamp(vHintLocal.x / max(uHintHalf.x, 0.0001), -1.0, 1.0);
  float lz = clamp(vHintLocal.z / max(uHintHalf.y, 0.0001), -1.0, 1.0);
  // Diagonal sweep coordinate in 0..1 across the footprint (top-left to
  // bottom-right), then a moving band with soft smootherstep shoulders.
  float diag = 0.25 * ((lx + 1.0) + (lz + 1.0));
  float front = -uHintBand + uHintPhase * (1.0 + 2.0 * uHintBand);
  float d = abs(diag - front);
  float t = clamp(1.0 - d / uHintBand, 0.0, 1.0);
  float shine = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  diffuseColor.rgb += vec3(1.0) * (shine * uHintStrength);
  diffuseColor.a = clamp(diffuseColor.a + shine * uHintStrength * 0.5, 0.0, 1.0);
}`
            );
    };
    mat.customProgramCacheKey = () => "csHintShine1";
}

function cs3dUpdateSheenUniforms() {
    const u = CS3D.sheenU;
    if (!u || !gridCols) return;
    u.boardHalf.value.set(gridCols * 0.5, gridRows * 0.5);
    u.boardSize.value.set(gridCols, gridRows);
    u.boardScale.value = csBoardScale || 1;
    u.boardYaw.value = csWinYaw || 0;
    if (!csSheen.active) {
        u.strength.value = 0;
        return;
    }
    const sheenT = csSheen.t - CS_WIN.SHEEN_DELAY_MS;
    if (sheenT < 0) {
        u.strength.value = 0;
        return;
    }
    const band = CS_WIN.SHEEN_BAND;
    const p = clampCS(sheenT / CS_WIN.SHEEN_MS, 0, 1);
    u.front.value = -band + p * (1 + 2 * band);
    u.band.value = band;
    u.strength.value = CS_WIN.SHEEN_STRENGTH;
}

function cs3dResize(cssW, cssH) {
    if (!CS3D.ok) return;
    CS3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    CS3D.renderer.setSize(cssW, cssH, false);
    const cam = CS3D.camera;
    const renderOverscan = Math.min(CS3D_CFG.RENDER_OVERSCAN_PX, (cssH - 1) / 2);
    const boardFrameH = cssH - renderOverscan * 2;
    const aspect = cssW / boardFrameH;
    const tilt = CS3D_CFG.TILT_DEG * Math.PI / 180;
    if (!gridCols) { cam.updateProjectionMatrix(); return; }

    // Orthographic framing: size the frustum so the whole board fits. The board
    // spans gridCols horizontally; vertically it is foreshortened by the tilt
    // (rows*cos) plus the raised block/platform height (*sin).
    // Win yaw spins the board in XZ — use the yawed ground AABB so corners/ears
    // stay inside the frustum instead of clipping on the canvas edge.
    // Do NOT fold csBoardScale in here: intro zoom relies on scaling the board
    // inside a fixed play frustum.
    const yaw = csWinYaw || 0;
    const yawC = Math.abs(Math.cos(yaw));
    const yawS = Math.abs(Math.sin(yaw));
    const groundX = gridCols * yawC + gridRows * yawS;
    const groundZ = gridCols * yawS + gridRows * yawC;
    const spanX = groundX;
    const spanY = groundZ * Math.cos(tilt) +
        (CS3D_CFG.PLATFORM_H + CS3D_CFG.BLOCK_H) * Math.sin(tilt);
    let halfW = spanX / 2, halfH = spanY / 2;
    // Grow the smaller axis so the frustum aspect matches the viewport aspect.
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    const m = CS3D_CFG.FIT_MARGIN / (CS3D_CFG.ORTHO_ZOOM || 1);
    halfW *= m; halfH *= m;
    // Fit the board against the original play-area height, then extend only the
    // render frustum equally above and below it for animated overscan.
    const renderHalfH = halfH * cssH / boardFrameH;
    cam.left = -halfW; cam.right = halfW;
    cam.top = renderHalfH;
    cam.bottom = -renderHalfH;

    // Distance doesn't change ortho scale, but keeps the board inside near/far
    // and positions the parallel view at the desired downward tilt.
    const dist = Math.max(gridCols, gridRows) * 2 + 50;
    cam.near = 0.1; cam.far = dist * 2 + 200;
    // Deterministic camera pose: always reset up/rotation before aiming.
    // Repeated lookAt() without this can slowly drift the view on some
    // GPU/browser combos (and HTML-compiler iframes resize often).
    cam.up.set(0, 1, 0);
    cam.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
    cam.quaternion.identity();
    cam.rotation.set(0, 0, 0);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    // Keep the board rooted at the origin — never let a stale transform linger.
    if (CS3D.boardGroup) {
        CS3D.boardGroup.position.set(0, 0, 0);
        CS3D.boardGroup.rotation.x = 0;
        CS3D.boardGroup.rotation.z = 0;
    }
    // Frame the Soft 3D template's warm key and cool fill lights to the board.
    const ext = Math.max(gridCols, gridRows);
    CS3D.dir.position.set(ext * CS3D_CFG.KEY_X, ext * CS3D_CFG.KEY_Y, ext * CS3D_CFG.KEY_Z);
    CS3D.dir.target.position.set(0, 0, 0);
    CS3D.fill.position.set(ext * CS3D_CFG.FILL_X, ext * CS3D_CFG.FILL_Y, ext * CS3D_CFG.FILL_Z);
    const sc = CS3D.dir.shadow.camera, s = ext * 0.95 + 3;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    // Tighten the depth range to the light's actual distance from the board so
    // the shadow map spends its precision on the scene instead of empty space.
    // A generous board radius (diagonal + platform/block/lift height) guarantees
    // nothing clips.
    const lightDist = CS3D.dir.position.length();
    const boardRadius = Math.hypot(gridCols, gridRows) / 2 +
        CS3D_CFG.PLATFORM_H + CS3D_CFG.BLOCK_H + CS3D_CFG.ACTIVE_LIFT + 2;
    sc.near = Math.max(0.1, lightDist - boardRadius);
    sc.far = lightDist + boardRadius;
    sc.updateProjectionMatrix();
    if (CS3D.renderer) CS3D.renderer.shadowMap.needsUpdate = true;
}

function cs3dMapIsShared(map) {
    if (!map) return false;
    if (map === CS3D.glowTex || map === CS3D._cardboardTex) return true;
    const stamps = CS3D._stampTex;
    if (stamps) {
        for (const key in stamps) {
            if (Object.prototype.hasOwnProperty.call(stamps, key) && stamps[key] === map) {
                return true;
            }
        }
    }
    return false;
}

function cs3dClearGroup() {
    const g = CS3D.boardGroup;
    if (!g) return;
    // Detach the persistent glow group so its pooled meshes survive the wipe.
    if (CS3D.glowGroup) g.remove(CS3D.glowGroup);
    g.traverse((o) => {
        if (o.userData && o.userData.cs3dArrowMarker) return;
        if (o.material) {
            // Never dispose shared cardboard / stamp / glow maps — rebuilds
            // would leave CS3D._cardboardTex pointing at a dead texture.
            if (o.material.map && o.material.map.dispose && !cs3dMapIsShared(o.material.map)) {
                o.material.map.dispose();
            }
            if (o.material.dispose) o.material.dispose();
        }
        if (o.geometry && o.geometry !== CS3D.tileGeo &&
            o.geometry !== CS3D.decalGeo && o.geometry.dispose) o.geometry.dispose();
    });
    while (g.children.length) g.remove(g.children[0]);
    CS3D.platform = null;
    CS3D.tileMesh = null;
    CS3D.tileMaterial = null;
    CS3D.tileCells.length = 0;
    if (CS3D.glowGroup) g.add(CS3D.glowGroup);
}

function cs3dBuildLevel() {
    if (!CS3D.ok || !gridCols) return;
    // Detach character overlays first so cs3dClearGroup does not dispose
    // shared/cached character textures or the shared plane geometry.
    if (window.BlockCharacters && typeof BlockCharacters.detach === "function") {
        for (const b of blocks) BlockCharacters.detach(b);
    }
    const T = window.THREE, g = CS3D.boardGroup;
    cs3dClearGroup();
    CS3D.blockMeshes.length = 0;
    const tilePad = CS3D_CFG.TILE_PAD;
    const platform = new T.Mesh(
        cs3dPlatformGeo(gridCols + 2 * CS3D_CFG.PLATFORM_PAD, gridRows + 2 * CS3D_CFG.PLATFORM_PAD),
        new T.MeshStandardMaterial({
            color: cs3dColor(CS3D_CFG.PLATFORM_COLOR),
            roughness: CS3D_CFG.PLATFORM_ROUGHNESS, metalness: 0,
        })
    );
    platform.position.y = -CS3D_CFG.PLATFORM_H / 2;
    platform.receiveShadow = true;
    platform.raycast = () => {};
    platform.matrixAutoUpdate = false; platform.updateMatrix();
    g.add(platform);
    CS3D.platform = platform;

    const tileCells = [];
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            if (grid[r][c] !== 1) continue;
            tileCells.push([r, c]);
        }
    }
    if (tileCells.length) {
        const tileMaterial = new T.MeshStandardMaterial({
            color: 0xffffff,
            roughness: CS3D_CFG.TILE_ROUGHNESS, metalness: 0,
        });
        const tileMesh = new T.InstancedMesh(CS3D.tileGeo, tileMaterial, tileCells.length);
        const tileTransform = new T.Object3D();
        const tileScale = 1 - 2 * tilePad;
        const tileColor = cs3dColor(CS3D_CFG.TILE_COLOR);
        tileMesh.receiveShadow = true;
        for (let i = 0; i < tileCells.length; i++) {
            const [r, c] = tileCells[i];
            tileTransform.position.set(
                c + 0.5 - gridCols / 2,
                CS3D_CFG.TILE_Y,
                r + 0.5 - gridRows / 2
            );
            tileTransform.scale.set(tileScale, 1, tileScale);
            tileTransform.updateMatrix();
            tileMesh.setMatrixAt(i, tileTransform.matrix);
            tileMesh.setColorAt(i, tileColor);
        }
        tileMesh.instanceMatrix.needsUpdate = true;
        tileMesh.instanceColor.setUsage(T.DynamicDrawUsage);
        tileMesh.instanceColor.needsUpdate = true;
        tileMesh.matrixAutoUpdate = false; tileMesh.updateMatrix();
        g.add(tileMesh);
        CS3D.tileMesh = tileMesh;
        CS3D.tileMaterial = tileMaterial;
        CS3D.tileCells = tileCells;
    }

    for (const b of blocks) {
        const rigid = !!b.preExpanded;
        const locked = !!b.locked;
        const mat = new T.MeshStandardMaterial({
            color: cs3dColor(locked ? CS3D_CFG.LOCKED_STONE_COLOR : b.color),
            roughness: locked ? CS3D_CFG.LOCKED_STONE_ROUGHNESS : CS3D_CFG.BLOCK_ROUGHNESS,
            metalness: CS3D_CFG.BLOCK_METALNESS,
            emissive: new T.Color(0x000000), emissiveIntensity: 1,
            flatShading: rigid,
        });
        cs3dAttachSheenShader(mat);
        // Start with a placeholder slab; cs3dEnsureGeo rebuilds it at the real
        // footprint each frame (fixed corner radius, extending sides).
        const mesh = new T.Mesh(cs3dSlabGeo(1, 1, rigid ? CS3D_CFG.RIGID_CORNER_R : CS3D_CFG.CORNER_R, rigid), mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.block = b;

        const cvs = document.createElement("canvas");
        cvs.width = cvs.height = CS3D_CFG.DECAL_UNIT;
        const tex = new T.CanvasTexture(cvs);
        if ("encoding" in tex) tex.encoding = T.sRGBEncoding;
        tex.anisotropy = CS3D.renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = T.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        const decal = new T.Mesh(CS3D.decalGeo, new T.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
        }));
        decal.position.y = CS3D_CFG.BLOCK_H / 2 + 0.012;
        decal.renderOrder = 2;
        decal.raycast = () => {};
        mesh.add(decal);

        b._mesh = mesh; b._baseColor = mat.color.clone();
        b._decalCanvas = cvs; b._decalTex = tex;
        b._decalCtx = cvs.getContext("2d"); b._decalSig = null;
        b._decal = decal; b._geoKey = null; b._crateFrame = null;
        b._arrowGroup = null;
        b._character = null; b._stake = null; b._holeLocal = null;
        b._indentPlug = null; b._indentFloor = null; b._indentSeal = null; b._indentHit = null;
        b._indentPlugMat = null; b._indentFloorMat = null; b._indentSealMat = null;

        if (locked) cs3dCreateLockStake(b);

        if (rigid) {
            const frame = new T.Group();
            const frameMat = new T.MeshStandardMaterial({
                color: cs3dColor(CS3D_CFG.CRATE_WALL_COLOR),
                roughness: CS3D_CFG.CRATE_WALL_ROUGHNESS, metalness: 0,
                map: cs3dEnsureCardboardTexture(),
            });
            const accentMat = new T.MeshStandardMaterial({
                color: cs3dColor(CS3D_CFG.CRATE_EDGE_COLOR), roughness: 0.82, metalness: 0,
            });
            frame.userData.rails = [];
            frame.userData.accents = [];
            frame.userData.corners = [];
            for (let i = 0; i < 4; i++) {
                const rail = new T.Mesh(new T.BoxGeometry(1, 1, 1), frameMat);
                rail.castShadow = true;
                rail.raycast = () => {};
                frame.add(rail);
                frame.userData.rails.push(rail);
                const accent = new T.Mesh(new T.BoxGeometry(1, 1, 1), accentMat);
                accent.raycast = () => {};
                frame.add(accent);
                frame.userData.accents.push(accent);
            }
            for (let i = 0; i < 4; i++) {
                const bracket = new T.Group();
                for (let j = 0; j < 2; j++) {
                    const segment = new T.Mesh(new T.BoxGeometry(1, 1, 1), frameMat);
                    segment.castShadow = true;
                    segment.raycast = () => {};
                    bracket.add(segment);
                }
                frame.add(bracket);
                frame.userData.corners.push(bracket);
            }
            // Shipping stamps printed on the box body (two exterior wall faces).
            frame.userData.stamps = [];
            for (const spec of [
                { kind: "fragile", horizontal: true, sign: 1 },
                { kind: "paw", horizontal: false, sign: 1 },
            ]) {
                const stamp = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({
                    map: cs3dEnsureStampTexture(spec.kind),
                    transparent: true, roughness: 0.9, metalness: 0, depthWrite: false,
                    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
                }));
                stamp.raycast = () => {};
                stamp.renderOrder = 3;
                frame.add(stamp);
                frame.userData.stamps.push(Object.assign({ mesh: stamp }, spec));
            }
            mesh.add(frame);
            b._crateFrame = frame;
            cs3dResizeCrateFrame(b);
        }

        g.add(mesh); CS3D.blockMeshes.push(mesh);
    }
    // Deal expressions across the level so every face is used before any repeats.
    if (window.BlockCharacters) {
        if (typeof BlockCharacters.beginLevel === "function") {
            BlockCharacters.beginLevel(blocks);
        }
        if (typeof BlockCharacters.attach === "function") {
            for (const b of blocks) BlockCharacters.attach(b);
        }
    }
    // Geometry changed wholesale — force the (manually-driven) shadow map to
    // rebuild for the new blocks over the next few frames.
    if (CS3D.renderer) { CS3D.renderer.shadowMap.needsUpdate = true; CS3D._shadowSettle = 3; }
}

const CS3D_DEBUG_STORAGE = "colorstretch_soft3d_debug";
let cs3dDebugRefresh = null;

// Push the current material/softness config onto the live meshes without a
// full rebuild (cheap enough to run on every debug slider tick).
function cs3dApplyMaterials() {
    if (!CS3D.ok) return;
    for (const mesh of CS3D.blockMeshes) {
        const mat = mesh.material;
        if (!mat) continue;
        const locked = mesh.userData && mesh.userData.block && mesh.userData.block.locked;
        mat.roughness = locked ? CS3D_CFG.LOCKED_STONE_ROUGHNESS : CS3D_CFG.BLOCK_ROUGHNESS;
        mat.metalness = CS3D_CFG.BLOCK_METALNESS;
        if (mat.emissive) {
            // The per-frame flash writes the emissive colour (see cs3dUpdateBlock),
            // so here we only keep the intensity at full strength.
            mat.emissiveIntensity = 1;
        }
        mat.needsUpdate = true;
    }
    if (CS3D.tileMaterial) {
        CS3D.tileMaterial.roughness = CS3D_CFG.TILE_ROUGHNESS;
        CS3D.tileMaterial.needsUpdate = true;
        cs3dUpdateTileColors();
    }
    if (CS3D.platform) {
        CS3D.platform.material.color.copy(cs3dColor(CS3D_CFG.PLATFORM_COLOR));
        CS3D.platform.material.roughness = CS3D_CFG.PLATFORM_ROUGHNESS;
        CS3D.platform.material.needsUpdate = true;
    }
    if (CS3D.dir) { CS3D.dir.shadow.radius = cs3dShadowRadius(); CS3D.renderer.shadowMap.needsUpdate = true; }
}

function cs3dDebugState() {
    const hex = (color) => "#" + color.getHexString();
    const cfgHex = (c) => "#" + new window.THREE.Color(c).getHexString();
    return {
        camera: {
            tilt: CS3D_CFG.TILT_DEG,
            zoom: CS3D_CFG.ORTHO_ZOOM,
            fitMargin: CS3D_CFG.FIT_MARGIN,
        },
        lighting: {
            ambientIntensity: CS3D.ambient.intensity,
            ambientColor: hex(CS3D.ambient.color),
            hemiIntensity: CS3D.hemi.intensity,
            hemiSkyColor: hex(CS3D.hemi.color),
            hemiGroundColor: hex(CS3D.hemi.groundColor),
            keyIntensity: CS3D.dir.intensity,
            keyColor: hex(CS3D.dir.color),
            keyX: CS3D_CFG.KEY_X,
            keyY: CS3D_CFG.KEY_Y,
            keyZ: CS3D_CFG.KEY_Z,
            shadowRadius: CS3D_CFG.SHADOW_RADIUS,
            shadowBias: CS3D.dir.shadow.bias,
            shadowNormalBias: CS3D.dir.shadow.normalBias,
            fillIntensity: CS3D.fill.intensity,
            fillColor: hex(CS3D.fill.color),
            fillX: CS3D_CFG.FILL_X,
            fillY: CS3D_CFG.FILL_Y,
            fillZ: CS3D_CFG.FILL_Z,
        },
        scene: {
            background: CS3D_CFG.BG_COLOR,
            platformColor: CS3D_CFG.PLATFORM_COLOR,
            tileColor: cfgHex(CS3D_CFG.TILE_COLOR),
            platformPad: CS3D_CFG.PLATFORM_PAD,
            platformHeight: CS3D_CFG.PLATFORM_H,
        },
        material: {
            blockRoughness: CS3D_CFG.BLOCK_ROUGHNESS,
            blockMetalness: CS3D_CFG.BLOCK_METALNESS,
            blockEmissive: CS3D_CFG.BLOCK_EMISSIVE,
            cornerRadius: CS3D_CFG.CORNER_R,
            cellPad: CS3D_CFG.CELL_PAD,
            tileRoughness: CS3D_CFG.TILE_ROUGHNESS,
            platformRoughness: CS3D_CFG.PLATFORM_ROUGHNESS,
            stakeRadius: CS3D_CFG.LOCKED_STAKE_RADIUS,
            stakeHeight: CS3D_CFG.LOCKED_STAKE_HEIGHT,
            stakeEmbed: CS3D_CFG.LOCKED_STAKE_EMBED,
            stakeIndentRadius: CS3D_CFG.LOCKED_STAKE_INDENT_RADIUS,
            stakeIndentDepth: CS3D_CFG.LOCKED_STAKE_INDENT_DEPTH,
            stakeTaper: CS3D_CFG.LOCKED_STAKE_TAPER,
            stakeSegments: CS3D_CFG.LOCKED_STAKE_SEGMENTS,
            stakeBevel: CS3D_CFG.LOCKED_STAKE_BEVEL,
            stakeBevelSegments: CS3D_CFG.LOCKED_STAKE_BEVEL_SEGMENTS,
            stakeLabelScale: CS3D_CFG.LOCKED_STAKE_LABEL_SCALE,
        },
        expand: {
            speed: CS.EXPAND_K,
            pop: CS.EXPAND_POP,
            popAmp: CS.POP_AMP,
            popFreq: CS.POP_FREQ,
            popDecay: CS.POP_DECAY,
            springStiffness: CS.SPRING_K,
            springDamping: CS.SPRING_D,
            seamGlow: CS3D_CFG.SEAM_GLOW,
            seamWidth: CS3D_CFG.SEAM_WIDTH,
            seamCore: CS3D_CFG.SEAM_CORE,
            seamRise: CS3D_CFG.SEAM_RISE,
            seamGrow: CS3D_CFG.SEAM_GROW,
            seamLifeMs: CS3D_CFG.SEAM_LIFE_MS,
            seamLift: CS3D_CFG.SEAM_LIFT,
            seamColor: cfgHex(CS3D_CFG.SEAM_COLOR),
        },
    };
}

function cs3dDebugApply(state) {
    if (!CS3D.ok || !state || typeof state !== "object") return;
    const number = (obj, key, target, targetKey, min, max) => {
        if (!obj || !Number.isFinite(obj[key])) return;
        target[targetKey] = clampCS(obj[key], min, max);
    };
    const color = (obj, key, target) => {
        if (obj && typeof obj[key] === "string") target.set(obj[key]);
    };
    const camera = state.camera || {}, lighting = state.lighting || {},
        scene = state.scene || {}, material = state.material || {},
        expand = state.expand || {};

    // Snapshot geometry-affecting values so we only rebuild the board meshes
    // when something that changes their shape actually moves.
    const geoBefore = [CS3D_CFG.PLATFORM_PAD, CS3D_CFG.PLATFORM_H,
        CS3D_CFG.CORNER_R, CS3D_CFG.CELL_PAD];

    number(camera, "tilt", CS3D_CFG, "TILT_DEG", 0, 80);
    number(camera, "zoom", CS3D_CFG, "ORTHO_ZOOM", 0.3, 3);
    number(camera, "fitMargin", CS3D_CFG, "FIT_MARGIN", 1, 2.5);

    number(lighting, "ambientIntensity", CS3D.ambient, "intensity", 0, 4);
    color(lighting, "ambientColor", CS3D.ambient.color);
    number(lighting, "hemiIntensity", CS3D.hemi, "intensity", 0, 4);
    color(lighting, "hemiSkyColor", CS3D.hemi.color);
    color(lighting, "hemiGroundColor", CS3D.hemi.groundColor);
    number(lighting, "keyIntensity", CS3D.dir, "intensity", 0, 5);
    color(lighting, "keyColor", CS3D.dir.color);
    number(lighting, "keyX", CS3D_CFG, "KEY_X", -3, 3);
    number(lighting, "keyY", CS3D_CFG, "KEY_Y", -3, 3);
    number(lighting, "keyZ", CS3D_CFG, "KEY_Z", -3, 3);
    number(lighting, "shadowRadius", CS3D_CFG, "SHADOW_RADIUS", 0, 20);
    number(lighting, "shadowBias", CS3D.dir.shadow, "bias", -0.02, 0.02);
    number(lighting, "shadowNormalBias", CS3D.dir.shadow, "normalBias", 0, 2);
    number(lighting, "fillIntensity", CS3D.fill, "intensity", 0, 5);
    color(lighting, "fillColor", CS3D.fill.color);
    number(lighting, "fillX", CS3D_CFG, "FILL_X", -3, 3);
    number(lighting, "fillY", CS3D_CFG, "FILL_Y", -3, 3);
    number(lighting, "fillZ", CS3D_CFG, "FILL_Z", -3, 3);

    if (typeof scene.background === "string") {
        CS3D_CFG.BG_COLOR = scene.background;
        gameScreen.style.backgroundColor = scene.background;
        document.documentElement.style.setProperty("--game-bg", scene.background);
        const playArea = document.querySelector("#gameScreen .play-area");
        if (playArea) playArea.style.backgroundColor = scene.background;
    }
    if (typeof scene.platformColor === "string") CS3D_CFG.PLATFORM_COLOR = scene.platformColor;
    if (typeof scene.tileColor === "string") CS3D_CFG.TILE_COLOR = scene.tileColor;
    number(scene, "platformPad", CS3D_CFG, "PLATFORM_PAD", 0, 1.5);
    number(scene, "platformHeight", CS3D_CFG, "PLATFORM_H", 0.05, 1);

    number(material, "blockRoughness", CS3D_CFG, "BLOCK_ROUGHNESS", 0, 1);
    number(material, "blockMetalness", CS3D_CFG, "BLOCK_METALNESS", 0, 1);
    number(material, "blockEmissive", CS3D_CFG, "BLOCK_EMISSIVE", 0, 1);
    number(material, "cornerRadius", CS3D_CFG, "CORNER_R", 0, 0.5);
    number(material, "cellPad", CS3D_CFG, "CELL_PAD", 0, 0.35);
    number(material, "tileRoughness", CS3D_CFG, "TILE_ROUGHNESS", 0, 1);
    number(material, "platformRoughness", CS3D_CFG, "PLATFORM_ROUGHNESS", 0, 1);
    number(material, "stakeRadius", CS3D_CFG, "LOCKED_STAKE_RADIUS", 0.04, 0.5);
    number(material, "stakeHeight", CS3D_CFG, "LOCKED_STAKE_HEIGHT", 0.04, 0.6);
    number(material, "stakeEmbed", CS3D_CFG, "LOCKED_STAKE_EMBED", 0.01, 0.35);
    number(material, "stakeIndentRadius", CS3D_CFG, "LOCKED_STAKE_INDENT_RADIUS", 0.05, 0.55);
    number(material, "stakeIndentDepth", CS3D_CFG, "LOCKED_STAKE_INDENT_DEPTH", 0.005, 0.12);
    number(material, "stakeTaper", CS3D_CFG, "LOCKED_STAKE_TAPER", 0.4, 1.5);
    number(material, "stakeSegments", CS3D_CFG, "LOCKED_STAKE_SEGMENTS", 3, 64);
    number(material, "stakeBevel", CS3D_CFG, "LOCKED_STAKE_BEVEL", 0, 0.2);
    number(material, "stakeBevelSegments", CS3D_CFG, "LOCKED_STAKE_BEVEL_SEGMENTS", 1, 16);
    number(material, "stakeLabelScale", CS3D_CFG, "LOCKED_STAKE_LABEL_SCALE", 0.4, 1.6);

    number(expand, "speed", CS, "EXPAND_K", 1, 60);
    number(expand, "pop", CS, "EXPAND_POP", 0, 3);
    number(expand, "popAmp", CS, "POP_AMP", 0, 0.6);
    number(expand, "popFreq", CS, "POP_FREQ", 1, 40);
    number(expand, "popDecay", CS, "POP_DECAY", 0.5, 20);
    number(expand, "springStiffness", CS, "SPRING_K", 20, 600);
    number(expand, "springDamping", CS, "SPRING_D", 2, 60);
    number(expand, "seamGlow", CS3D_CFG, "SEAM_GLOW", 0, 3);
    number(expand, "seamWidth", CS3D_CFG, "SEAM_WIDTH", 0.02, 1);
    number(expand, "seamCore", CS3D_CFG, "SEAM_CORE", 0.01, 0.5);
    number(expand, "seamRise", CS3D_CFG, "SEAM_RISE", 0, 1.5);
    number(expand, "seamGrow", CS3D_CFG, "SEAM_GROW", 0, 4);
    number(expand, "seamLifeMs", CS3D_CFG, "SEAM_LIFE_MS", 120, 1200);
    number(expand, "seamLift", CS3D_CFG, "SEAM_LIFT", 0, 0.3);
    if (typeof expand.seamColor === "string") CS3D_CFG.SEAM_COLOR = expand.seamColor;

    const geoAfter = [CS3D_CFG.PLATFORM_PAD, CS3D_CFG.PLATFORM_H,
        CS3D_CFG.CORNER_R, CS3D_CFG.CELL_PAD];
    const needRebuild = CS3D.platform && geoAfter.some((v, i) => v !== geoBefore[i]);
    if (needRebuild) cs3dBuildLevel();
    cs3dApplyMaterials();
    if (csCanvas.clientWidth && csCanvas.clientHeight) {
        cs3dResize(csCanvas.clientWidth, csCanvas.clientHeight);
        csDraw();
    }
}

function cs3dCreateDebugPanel() {
    const panel = document.createElement("div");
    panel.className = "cs3d-debug-panel";
    panel.id = "cs3dDebugPanel";
    const inputs = [];
    const getValue = (state, path) => path.split(".").reduce((value, key) => value && value[key], state);
    const setValue = (state, path, value) => {
        const keys = path.split(".");
        let target = state;
        for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]];
        target[keys[keys.length - 1]] = value;
    };
    let defaults = cs3dDebugState();
    let state = JSON.parse(JSON.stringify(defaults));

    const apply = () => {
        cs3dDebugApply(state);
        refresh();
    };

    const heading = document.createElement("h3");
    heading.textContent = "Soft 3D Controls (D to toggle)";
    panel.appendChild(heading);

    // ---- Tabbed layout: Camera / Lighting / Scene / Material ----
    const tabbar = document.createElement("div");
    tabbar.className = "cs3d-tabbar";
    panel.appendChild(tabbar);
    const pages = {}, tabButtons = {};
    const selectTab = (name) => {
        for (const key in pages) {
            pages[key].style.display = key === name ? "flex" : "none";
            tabButtons[key].classList.toggle("active", key === name);
        }
    };
    const addTab = (name) => {
        const page = document.createElement("div");
        page.className = "cs3d-tabpage";
        panel.appendChild(page);
        pages[name] = page;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cs3d-tab";
        btn.textContent = name;
        btn.addEventListener("click", () => selectTab(name));
        tabbar.appendChild(btn);
        tabButtons[name] = btn;
        return page;
    };

    // `page` is the container the section/range/color helpers append into; it is
    // reassigned as each tab is populated below.
    let page = null;
    const section = (label) => {
        const el = document.createElement("div");
        el.className = "cs3d-section";
        el.textContent = label;
        page.appendChild(el);
    };
    const range = (label, path, min, max, step) => {
        const container = page;
        const row = document.createElement("label");
        row.className = "cs3d-row";
        const name = document.createElement("span");
        name.textContent = label;
        const slider = document.createElement("input");
        slider.type = "range"; slider.min = min; slider.max = max; slider.step = step;
        const value = document.createElement("input");
        value.type = "number"; value.min = min; value.max = max; value.step = step;
        const update = (raw) => {
            const next = Number(raw);
            if (!Number.isFinite(next)) return;
            setValue(state, path, next);
            apply();
        };
        slider.addEventListener("input", () => update(slider.value));
        value.addEventListener("change", () => update(value.value));
        row.append(name, slider, value);
        container.appendChild(row);
        inputs.push(() => {
            const next = getValue(state, path);
            slider.value = next; value.value = next;
        });
    };
    const color = (label, path) => {
        const container = page;
        const row = document.createElement("label");
        row.className = "cs3d-row";
        const name = document.createElement("span");
        name.textContent = label;
        const picker = document.createElement("input");
        picker.type = "color";
        picker.addEventListener("input", () => {
            setValue(state, path, picker.value);
            apply();
        });
        row.append(name, picker);
        container.appendChild(row);
        inputs.push(() => { picker.value = getValue(state, path); });
    };
    const refresh = () => inputs.forEach((update) => update());
    cs3dDebugRefresh = refresh;

    page = addTab("Camera");
    section("Orthographic Camera");
    range("Tilt", "camera.tilt", 0, 80, 0.5);
    range("Zoom", "camera.zoom", 0.3, 3, 0.01);
    range("Frame Margin", "camera.fitMargin", 1, 2.5, 0.01);
    section("Colours");
    color("Background", "scene.background");

    page = addTab("Lighting");
    section("Ambient");
    range("Intensity", "lighting.ambientIntensity", 0, 4, 0.01);
    color("Colour", "lighting.ambientColor");
    section("Hemisphere");
    range("Intensity", "lighting.hemiIntensity", 0, 4, 0.01);
    color("Sky Colour", "lighting.hemiSkyColor");
    color("Ground Colour", "lighting.hemiGroundColor");
    section("Key Light");
    range("Intensity", "lighting.keyIntensity", 0, 5, 0.01);
    color("Colour", "lighting.keyColor");
    range("X", "lighting.keyX", -3, 3, 0.01);
    range("Y", "lighting.keyY", -3, 3, 0.01);
    range("Z", "lighting.keyZ", -3, 3, 0.01);
    section("Shadows");
    range("Softness", "lighting.shadowRadius", 0, 20, 0.1);
    range("Bias", "lighting.shadowBias", -0.02, 0.02, 0.0001);
    range("Normal Bias", "lighting.shadowNormalBias", 0, 2, 0.001);
    section("Fill Light");
    range("Intensity", "lighting.fillIntensity", 0, 5, 0.01);
    color("Colour", "lighting.fillColor");
    range("X", "lighting.fillX", -3, 3, 0.01);
    range("Y", "lighting.fillY", -3, 3, 0.01);
    range("Z", "lighting.fillZ", -3, 3, 0.01);

    page = addTab("Scene");
    section("Colours");
    color("Background", "scene.background");
    color("Platform", "scene.platformColor");
    color("Tiles", "scene.tileColor");
    section("Platform");
    range("Pad", "scene.platformPad", 0, 1.5, 0.01);
    range("Height", "scene.platformHeight", 0.05, 1, 0.01);

    page = addTab("Material");
    section("Blocks (softness)");
    range("Roughness", "material.blockRoughness", 0, 1, 0.01);
    range("Metalness", "material.blockMetalness", 0, 1, 0.01);
    range("Glow", "material.blockEmissive", 0, 1, 0.01);
    range("Corner Radius", "material.cornerRadius", 0, 0.5, 0.005);
    range("Cell Gap", "material.cellPad", 0, 0.35, 0.005);
    section("Surfaces");
    range("Tile Roughness", "material.tileRoughness", 0, 1, 0.01);
    range("Platform Roughness", "material.platformRoughness", 0, 1, 0.01);
    section("Locked Stake");
    range("Radius", "material.stakeRadius", 0.04, 0.5, 0.005);
    range("Height Above", "material.stakeHeight", 0.04, 0.6, 0.005);
    range("Embed Depth", "material.stakeEmbed", 0.01, 0.35, 0.005);
    range("Indent Radius", "material.stakeIndentRadius", 0.05, 0.55, 0.005);
    range("Indent Depth", "material.stakeIndentDepth", 0.005, 0.12, 0.001);
    range("Taper", "material.stakeTaper", 0.4, 1.5, 0.01);
    range("Segments", "material.stakeSegments", 3, 64, 1);
    range("Top Bevel", "material.stakeBevel", 0, 0.2, 0.001);
    range("Bevel Segments", "material.stakeBevelSegments", 1, 16, 1);
    range("Label Scale", "material.stakeLabelScale", 0.4, 1.6, 0.01);

    page = addTab("Expand");
    section("Tap Expand Feel");
    range("Expand Speed", "expand.speed", 1, 60, 0.5);
    range("Pop Strength", "expand.pop", 0, 3, 0.05);
    range("Pop Amount", "expand.popAmp", 0, 0.6, 0.005);
    range("Pop Wobble Speed", "expand.popFreq", 1, 40, 0.5);
    range("Pop Settle", "expand.popDecay", 0.5, 20, 0.1);
    section("Wobble Spring");
    range("Stiffness", "expand.springStiffness", 20, 600, 1);
    range("Damping", "expand.springDamping", 2, 60, 0.5);
    section("Seam Glow (between blocks)");
    range("Glow", "expand.seamGlow", 0, 3, 0.01);
    range("Halo Width", "expand.seamWidth", 0.02, 1, 0.01);
    range("Core Width", "expand.seamCore", 0.01, 0.5, 0.005);
    range("Rise", "expand.seamRise", 0, 1.5, 0.01);
    range("Bloom", "expand.seamGrow", 0, 4, 0.05);
    range("Duration (ms)", "expand.seamLifeMs", 120, 1200, 10);
    range("Lift", "expand.seamLift", 0, 0.3, 0.005);
    color("Colour", "expand.seamColor");

    const actions = document.createElement("div");
    actions.className = "cs3d-debug-actions";
    const action = (label, handler) => {
        const button = document.createElement("button");
        button.textContent = label;
        button.addEventListener("click", handler);
        actions.appendChild(button);
    };
    action("Save", () => localStorage.setItem(CS3D_DEBUG_STORAGE, JSON.stringify(state)));
    action("Copy", async () => {
        const text = JSON.stringify(state, null, 2);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                window.prompt("Copy 3D settings", text);
            }
        } catch (error) {
            window.prompt("Copy 3D settings", text);
        }
    });
    action("Load", () => {
        const saved = localStorage.getItem(CS3D_DEBUG_STORAGE);
        if (!saved) return;
        try {
            state = Object.assign(JSON.parse(JSON.stringify(defaults)), JSON.parse(saved));
        } catch (error) {
            console.warn("Soft 3D debug settings could not be loaded.", error);
            return;
        }
        apply();
    });
    action("Reset", () => {
        state = JSON.parse(JSON.stringify(defaults));
        apply();
    });
    action("Close", () => debugPanel.classList.remove("cs3d-open"));
    panel.appendChild(actions);
    debugPanel.appendChild(panel);
    selectTab("Camera");
    refresh();
}

// Screen point (canvas-local px) -> fractional grid cell (col,row) on the
// block-top plane. Replaces the old offset/cellSize inverse mapping.
function cs3dCellAt(px, py) {
    if (!CS3D.ok) return null;
    const rect = csCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    CS3D.ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    CS3D.ray.setFromCamera(CS3D.ndc, CS3D.camera);
    const hit = CS3D.ray.ray.intersectPlane(CS3D.plane, CS3D.hit);
    if (!hit) return null;
    const s = csBoardScale || 1;
    return { col: hit.x / s + gridCols / 2, row: hit.z / s + gridRows / 2 };
}

// Trace a rounded-rect path on a 2D canvas context (roundRect polyfill so the
// hatch clip works on older WebViews).
function cs3dCanvasRoundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function cs3dLabelStyle(ctx, S) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
}

function cs3dUpdateDecal(b) {
    const full = isFull(b);
    // Include the baked-geometry key so the decal follows the animated footprint
    // (e.g. the fail-expand lunge) and its features never stretch on the widened
    // plane.
    const sig = b.preExpanded ? ("expanded|" + (b._geoKey || "") + (b.locked ? "|L" : ""))
        : full ? ("full|" + (b._geoKey || "") + (b.locked ? "|L" : ""))
            : b.targetSize + "|" + (b.locked ? "L" : "") + "|" + (b.moveAxis || "") +
            "|" + (b._geoKey || "");
    if (sig === b._decalSig) return;
    b._decalSig = sig;

    // Size the canvas to the baked footprint's aspect so the decal plane (scaled
    // to geoW x geoH) never distorts the drawn features. Feature sizes are
    // derived from `u` (px per cell) so arrow heads and borders stay a
    // constant real size while only shafts/edges span the block.
    const pad = CS3D_CFG.CELL_PAD;
    const wCells = (b._geoW || 1) + 2 * pad, hCells = (b._geoH || 1) + 2 * pad;
    // Keep one shared px-per-cell scale when the texture reaches its size cap.
    // Capping only the long side would make the decal plane stretch its features
    // back out in world space on tall or wide expanded blocks.
    const cap = 1024;
    const u = Math.min(CS3D_CFG.DECAL_UNIT, cap / Math.max(wCells, hCells));
    const cw = Math.max(1, Math.round(wCells * u));
    const ch = Math.max(1, Math.round(hCells * u));
    const cvs = b._decalCanvas;
    if (cvs.width !== cw || cvs.height !== ch) { cvs.width = cw; cvs.height = ch; }
    const ctx = b._decalCtx;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();

    // Locked blocks wear a diagonal machined hatch on the slab top so a pinned
    // piece reads as "fixed" at a glance. Clipped to the rounded footprint so
    // stripes never spill past the slab corners.
    if (b.locked) {
        const r = CS3D_CFG.CORNER_R * u;
        ctx.save();
        ctx.beginPath();
        cs3dCanvasRoundRect(ctx, 0, 0, cw, ch, Math.min(r, cw / 2, ch / 2));
        ctx.clip();
        const rad = (CS3D_CFG.LOCKED_HATCH_ANGLE || -45) * Math.PI / 180;
        const dx = Math.cos(rad), dy = Math.sin(rad);
        const len = cw + ch;
        const step = Math.max(1, CS3D_CFG.LOCKED_HATCH_SPACING * u);
        ctx.globalAlpha = CS3D_CFG.LOCKED_HATCH_OPACITY;
        ctx.strokeStyle = CS3D_CFG.LOCKED_HATCH_COLOR;
        ctx.lineWidth = Math.max(1, CS3D_CFG.LOCKED_HATCH_WIDTH * u);
        ctx.lineCap = "butt";
        ctx.beginPath();
        // March the stripe origin along the perpendicular so lines evenly tile
        // the whole canvas regardless of the chosen angle.
        for (let o = -len; o <= len; o += step) {
            const ox = -dy * o + cw / 2, oy = dx * o + ch / 2;
            ctx.moveTo(ox - dx * len, oy - dy * len);
            ctx.lineTo(ox + dx * len, oy + dy * len);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Large edge arrows make an axis-constrained block readable at a glance.
    // They stay a fixed size per cell while their tips remain on the permitted
    // movement edges, leaving the planning label clear in the middle.
    if (b.moveAxis && !CS3D.arrowTemplate) {
        const arrowLength = u * 0.28, arrowWidth = u * 0.38;
        const inset = u * (b.preExpanded ? CS3D_CFG.CRATE_MARKER_INSET : 0.11);
        const arrow = (tipX, tipY, dx, dy) => {
            const baseX = tipX - dx * arrowLength, baseY = tipY - dy * arrowLength;
            const px = -dy * arrowWidth / 2, py = dx * arrowWidth / 2;
            ctx.save();
            ctx.shadowColor = "rgba(72, 49, 29, 0.3)";
            ctx.shadowBlur = u * 0.035;
            ctx.shadowOffsetY = u * 0.025;
            ctx.fillStyle = "rgba(255,255,255,0.96)";
            ctx.strokeStyle = "rgba(116, 82, 49, 0.3)";
            ctx.lineWidth = u * 0.022;
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(baseX + px, baseY + py);
            ctx.quadraticCurveTo(baseX, baseY, baseX - px, baseY - py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        };
        if (b.moveAxis === "horizontal") {
            arrow(inset, ch / 2, -1, 0);
            arrow(cw - inset, ch / 2, 1, 0);
        } else {
            arrow(cw / 2, inset, 0, -1);
            arrow(cw / 2, ch - inset, 0, 1);
        }
    }

    // Target cell count (hidden once the block is full), fixed size, centred.
    // Locked blocks show the number on the wooden stake instead.
    if (!full && !b.preExpanded && !b.locked) {
        const label = String(b.targetSize);
        let fontPx = u * 0.46;
        ctx.font = `700 ${fontPx}px "Nunito", sans-serif`;
        const w = ctx.measureText(label).width;
        const maxW = Math.min(cw, ch) * 0.62;
        if (w > maxW) { fontPx *= maxW / w; ctx.font = `700 ${fontPx}px "Nunito", sans-serif`; }
        cs3dLabelStyle(ctx, u);
        ctx.lineWidth = Math.max(2, fontPx * 0.13);
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.fillStyle = "rgba(255,255,255,0.96)";
        ctx.strokeText(label, cw / 2, ch / 2);
        ctx.fillText(label, cw / 2, ch / 2);
    }

    ctx.restore();
    b._decalTex.needsUpdate = true;
}

function cs3dUpdateBlock(b) {
    const mesh = b._mesh;
    if (!mesh) return;
    const introScale = b.introScale == null ? 1 : b.introScale;
    const winPopScale = b.winPopScale == null ? 1 : b.winPopScale;
    if (introScale * winPopScale <= 0.001) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.material.color.copy(b._baseColor);

    const pad = CS3D_CFG.CELL_PAD;
    const rigid = !!b.preExpanded;
    const popWob = Math.sin(b.wigglePhase) * CS.POP_AMP * b.wiggle;
    const moveWob = Math.sin(b.moveWobblePhase) * CS.MOVE_WOBBLE * b.moveWobble;
    const failReturnWob = Math.sin(b.failReturnWobblePhase) * CS.MOVE_WOBBLE * b.failReturnWobble;
    const wob = rigid ? 0 : (popWob + moveWob + failReturnWob);
    const jigX = rigid ? 0 : b.jiggleX;
    const jigY = rigid ? 0 : b.jiggleY;
    const pX = rigid ? 0 : (b.pressX || 0);
    const pY = rigid ? 0 : (b.pressY || 0);
    const apX = Math.abs(pX), apY = Math.abs(pY);
    const snapSquashX = rigid ? 0 : b.failReturnSquashX * b.failReturnSquash;
    const snapSquashY = rigid ? 0 : b.failReturnSquashY * b.failReturnSquash;
    const winSquash = rigid ? 0 : (b.winPopSquash || 0);

    // Footprint scale on the two board axes (mirrors the 2D sx/sy). World Z is
    // the old vertical axis (rows).
    const sx = 1 + jigX + wob - apX + apY * CS.DRAG_SQUISH_CROSS - snapSquashX - winSquash;
    const sz = 1 + jigY - wob - apY + apX * CS.DRAG_SQUISH_CROSS - snapSquashY - winSquash;
    // Volume preservation: a squashed footprint bulges the slab taller (and a
    // stretched one flattens it), so the elastic snap reads vertically too.
    const vScale = clampCS(1 - ((sx - 1) + (sz - 1)) * CS3D_CFG.HEIGHT_SQUASH, 0.55, 1.7);

    const S = b.renderScale * introScale * winPopScale;
    const pad2 = 2 * pad;
    const fpW = Math.max(0.02, b.renderW - pad2); // animated footprint
    const fpH = Math.max(0.02, b.renderH - pad2);
    // Geometry follows the (quantised) footprint via cs3dEnsureGeo, so growth and
    // the fail-expand lunge extend the sides. Scale only bridges the sub-step
    // remainder (fpW/geoW ~= 1) and carries the jelly squish (sx/sz), so the
    // wobble/snap bounce reads without per-frame geometry rebuilds.
    cs3dEnsureGeo(b);
    const geoW = b._geoW, geoH = b._geoH;
    const worldH = CS3D_CFG.BLOCK_H * vScale * S;
    mesh.scale.set((fpW / geoW) * sx * S, vScale * S, (fpH / geoH) * sz * S);
    b._decal.scale.set(geoW, 1, geoH);
    cs3dUpdateArrowMarkers(b);

    if (window.BlockCharacters && typeof BlockCharacters.update === "function") {
        BlockCharacters.update(b);
    }

    const active = (b === activeBlock && isDragging);
    // Keep the pressed face anchored as the slab compresses toward the finger.
    const cxCell = b.renderX + b.renderW / 2 - gridCols / 2 + (b.shakeDX || 0) + (fpW / 2) * pX;
    const czCell = b.renderY + b.renderH / 2 - gridRows / 2 + (fpH / 2) * pY;
    const bob = rigid ? 0 : wob * CS3D_CFG.BLOCK_H * CS3D_CFG.BOB;
    const introLift = b.introLift || 0;
    const winPopLift = b.winPopLift || 0;
    const introPitch = b.introPitch || 0;
    const introTilt = b.introTilt || 0;
    mesh.position.set(
        cxCell,
        CS3D_CFG.BLOCK_BASE_Y + worldH / 2 + bob + introLift + winPopLift +
        (active ? CS3D_CFG.ACTIVE_LIFT : 0),
        czCell
    );
    // Wobble springs plus intro lean: side roll + a tiny random forward/back tilt.
    mesh.rotation.set(
        jigY * CS3D_CFG.WOBBLE_ROT + introTilt,
        0,
        -jigX * CS3D_CFG.WOBBLE_ROT + introPitch
    );

    if (b._stake) cs3dUpdateLockStake(b);

    // Fail slam-flash only (no pickup highlight). Win sheen is a traveling
    // surface line driven by the shared sheen shader uniforms, not whole-mesh
    // emissive, so it reads as light crossing the blocks rather than a flash.
    const e = Math.min(1, b.failFlash || 0);
    const glow = CS3D_CFG.BLOCK_EMISSIVE * (b.locked ? 0.35 : 1);
    mesh.material.emissive.copy(mesh.material.color).multiplyScalar(glow);
    mesh.material.emissive.setRGB(
        Math.min(1, mesh.material.emissive.r + e),
        Math.min(1, mesh.material.emissive.g + e),
        Math.min(1, mesh.material.emissive.b + e)
    );

    cs3dUpdateDecal(b);
}

// Create one pooled seam entry: a soft wide halo plane plus a bright thin core
// plane, both additive and textured with a soft radial falloff so they read as
// a glow of light (not a flat white quad) regardless of scene lighting.
function cs3dMakeSeam() {
    const T = window.THREE;
    const mk = () => {
        const m = new T.Mesh(CS3D.seamGeo, new T.MeshBasicMaterial({
            color: 0xffffff, map: CS3D.glowTex,
            transparent: true, opacity: 1,
            blending: T.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        m.raycast = () => {};
        m.renderOrder = 3;
        m.visible = false;
        CS3D.glowGroup.add(m);
        return m;
    };
    return { halo: mk(), core: mk() };
}

// A block counts as "expanded" once it has grown past its starting footprint
// (or is a rigid pre-expanded block).
function cs3dExpanded(b) {
    return b.preExpanded || (b.w * b.h) > (b.initW * b.initH);
}

// Spawn a transient glow burst on each seam where the just-expanded block `b`
// meets an already-expanded neighbour, so a sheet of light blooms from the
// crevice between the two blocks and then collapses back into the gap.
function cs3dSpawnSeamBursts(b) {
    if (!CS3D.ok || !gridCols || !cs3dExpanded(b)) return;
    for (const o of blocks) {
        if (o === b || !cs3dExpanded(o)) continue;
        const avg = cs3dColor(b.color).lerp(cs3dColor(o.color), 0.5);
        // Vertical seam: side-by-side, sharing a column boundary.
        let seamCol = null;
        if (b.x + b.w === o.x) seamCol = o.x;
        else if (o.x + o.w === b.x) seamCol = b.x;
        if (seamCol !== null) {
            const r0 = Math.max(b.y, o.y), r1 = Math.min(b.y + b.h, o.y + o.h);
            if (r1 > r0) CS3D.bursts.push({
                vertical: true, world: seamCol - gridCols / 2,
                center: (r0 + r1) / 2 - gridRows / 2, len: r1 - r0,
                avg: avg.clone(), t: 0,
            });
        }
        // Horizontal seam: stacked, sharing a row boundary.
        let seamRow = null;
        if (b.y + b.h === o.y) seamRow = o.y;
        else if (o.y + o.h === b.y) seamRow = b.y;
        if (seamRow !== null) {
            const c0 = Math.max(b.x, o.x), c1 = Math.min(b.x + b.w, o.x + o.w);
            if (c1 > c0) CS3D.bursts.push({
                vertical: false, world: seamRow - gridRows / 2,
                center: (c0 + c1) / 2 - gridCols / 2, len: c1 - c0,
                avg: avg.clone(), t: 0,
            });
        }
    }
}

// Render the live glow bursts: a sheet blooms out from the seam gap then
// collapses back into it (timers are advanced in csUpdate). Stays seated on
// the block tops so it always reads as light coming from between the pieces.
function cs3dUpdateSeams() {
    if (!CS3D.ok || !gridCols) return;
    const bursts = CS3D.bursts;
    while (CS3D.seams.length < bursts.length) CS3D.seams.push(cs3dMakeSeam());
    const life = CS3D_CFG.SEAM_LIFE_MS / 1000;
    const baseY = CS3D_CFG.BLOCK_BASE_Y + CS3D_CFG.BLOCK_H + CS3D_CFG.SEAM_LIFT;
    const tint = cs3dColor(CS3D_CFG.SEAM_COLOR);
    for (let k = 0; k < CS3D.seams.length; k++) {
        const entry = CS3D.seams[k];
        if (k >= bursts.length) { entry.halo.visible = false; entry.core.visible = false; continue; }
        const s = bursts[k];
        const u = clampCS(s.t / life, 0, 1);
        // Soft sine envelope: gentle bloom from the gap, gentle collapse back.
        // sin²(πu) has soft shoulders on both sides (no sharp peak or cutoff).
        const bell = Math.sin(u * Math.PI);
        const soft = bell * bell;
        const eff = CS3D_CFG.SEAM_GLOW * soft;
        const grow = 1 + CS3D_CFG.SEAM_GROW * soft;
        entry.halo.visible = true; entry.core.visible = true;
        entry.halo.material.color.copy(tint).lerp(s.avg, 0.45).multiplyScalar(eff * 0.5);
        entry.core.material.color.copy(tint).lerp(s.avg, 0.12).multiplyScalar(eff * 0.75);
        const y = baseY; // always flush with the gap — never floats above it
        const hw = CS3D_CFG.SEAM_WIDTH * grow, cw = CS3D_CFG.SEAM_CORE * grow;
        const extend = soft * 0.2; // slight end bleed as it blooms
        let x, z;
        if (s.vertical) {
            x = s.world; z = s.center;
            entry.halo.scale.set(hw, 1, s.len + extend);
            entry.core.scale.set(cw, 1, s.len);
        } else {
            x = s.center; z = s.world;
            entry.halo.scale.set(s.len + extend, 1, hw);
            entry.core.scale.set(s.len, 1, cw);
        }
        entry.halo.position.set(x, y, z);
        entry.core.position.set(x, y + 0.001, z);
    }
}

function cs3dUpdateTileColors() {
    const mesh = CS3D.tileMesh;
    if (!mesh || !mesh.instanceColor) return;
    const dim = axisGuideBlock && axisGuideAlpha > 0;
    CS3D.cA.copy(cs3dColor(CS3D_CFG.TILE_COLOR));
    CS3D.cB.copy(cs3dColor(CS3D_CFG.TILE_DIM));
    for (let i = 0; i < CS3D.tileCells.length; i++) {
        const [r, c] = CS3D.tileCells[i];
        let inLane = true;
        if (dim) {
            if (axisGuideBlock.locked) {
                inLane = c >= axisGuideBlock.x && c < axisGuideBlock.x + axisGuideBlock.w &&
                    r >= axisGuideBlock.y && r < axisGuideBlock.y + axisGuideBlock.h;
            } else {
                inLane = axisGuideBlock.moveAxis === "horizontal"
                    ? (r >= axisGuideBlock.y && r < axisGuideBlock.y + axisGuideBlock.h)
                    : (c >= axisGuideBlock.x && c < axisGuideBlock.x + axisGuideBlock.w);
            }
        }
        const t = (dim && !inLane) ? axisGuideAlpha : 0;
        mesh.setColorAt(i, CS3D.cTile.copy(CS3D.cA).lerp(CS3D.cB, t));
    }
    mesh.instanceColor.needsUpdate = true;
}

// Per-frame: apply the intro board zoom, constraint guides, and every
// block's transform, then render.
function csDraw() {
    if (!CS3D.ok || !gridCols) return;
    // Pin board root each frame so a stale translate/rotate can never creep in.
    CS3D.boardGroup.position.set(0, 0, 0);
    CS3D.boardGroup.rotation.x = 0;
    CS3D.boardGroup.rotation.z = 0;
    CS3D.boardGroup.scale.setScalar(csBoardScale);
    CS3D.boardGroup.rotation.y = csWinYaw;
    // Fresh occupancy snapshot shared by corner-sharpening and seam detection.
    CS3D._occ = cs3dBuildOccupancy();

    const dim = axisGuideBlock && axisGuideAlpha > 0;
    if (dim || CS3D._wasDim) cs3dUpdateTileColors();
    CS3D._wasDim = dim;

    // Level 1 uses its own filled destination plus the tutorial overlay's
    // outline, leaving the regular translucent socket available for red.
    const tutorialTarget = csTutorial && csTutorial.phase === "move-red" ? csTutorial.target : null;
    if (tutorialTarget) {
        cs3dEnsureTutorialDestinationFillGeo(tutorialTarget.w, tutorialTarget.h);
        cs3dEnsureTutorialDestinationOutlineGeo(tutorialTarget.w, tutorialTarget.h);
        const destinationX = TUTORIAL_RED_TARGET.x + tutorialTarget.w / 2 - gridCols / 2;
        const destinationZ = TUTORIAL_RED_TARGET.y + tutorialTarget.h / 2 - gridRows / 2;
        CS3D.tutorialDestinationFillMesh.position.set(
            destinationX,
            CS3D_CFG.TILE_Y + 0.02,
            destinationZ
        );
        CS3D.tutorialDestinationFillMesh.material.color
            .copy(cs3dColor(tutorialTarget.color)).lerp(cs3dColor("#ffffff"), 0.35);
        CS3D.tutorialDestinationFillMesh.material.opacity = CS3D_CFG.SNAP_OPACITY;
        CS3D.tutorialDestinationFillMesh.visible = true;
        const outlinePulse = 0.9 + 0.18 * (0.5 + 0.5 *
            Math.sin(performance.now() * Math.PI / 1000));
        CS3D.tutorialDestinationOutlineMesh.position.set(
            destinationX, CS3D_CFG.TILE_Y + 0.025, destinationZ
        );
        CS3D.tutorialDestinationOutlineMesh.scale.setScalar(outlinePulse);
        CS3D.tutorialDestinationOutlineMesh.material.opacity = 1;
        CS3D.tutorialDestinationOutlineMesh.visible = true;
    } else {
        if (CS3D.tutorialDestinationFillMesh) CS3D.tutorialDestinationFillMesh.visible = false;
        if (CS3D.tutorialDestinationOutlineMesh) CS3D.tutorialDestinationOutlineMesh.visible = false;
    }

    if (isDragging && activeBlock && !activeBlock.locked) {
        const b = activeBlock;
        const x = b.x;
        const y = b.y;
        cs3dEnsureSnapGeo(b.w, b.h);
        CS3D.snapMesh.position.set(
            x + b.w / 2 - gridCols / 2,
            CS3D_CFG.TILE_Y + 0.02,
            y + b.h / 2 - gridRows / 2
        );
        CS3D.snapMesh.material.color
            .copy(cs3dColor(b.color)).lerp(cs3dColor("#ffffff"), 0.35);
        CS3D.snapMesh.material.opacity = CS3D_CFG.SNAP_OPACITY;
        CS3D.snapMesh.visible = true;
    } else if (CS3D.snapMesh) {
        CS3D.snapMesh.visible = false;
    }

    for (const b of blocks) cs3dUpdateBlock(b);
    cs3dUpdateHints();
    cs3dUpdateSheenUniforms();
    cs3dUpdateSeams();
    // Shadows only need re-rasterising when a shadow-casting block actually
    // moves. Blocks are the sole casters, so fold their transform-affecting
    // render state into a cheap signature and compare with last frame; a drag or
    // intro always counts. Two settle frames after motion capture the final rest
    // pose. renderer.shadowMap.autoUpdate is false, so most frames skip the pass.
    let moveSig = csWinYaw * 1000 + csBoardScale * 100;
    for (const b of blocks) {
        moveSig += b.renderX + b.renderY * 3.1 + b.renderW * 7.3 + b.renderH * 11.7 +
            b.jiggleX + b.jiggleY + (b.pressX || 0) + (b.pressY || 0) +
            b.wiggle + b.moveWobble + (b.failReturnWobble || 0) +
            (b.failReturnSquash || 0) + (b.introScale == null ? 1 : b.introScale) +
            (b.introLift || 0) + (b.introPitch || 0) + (b.introTilt || 0) +
            (b.winPopScale == null ? 1 : b.winPopScale) + (b.winPopLift || 0) +
            (b.winPopSquash || 0);
    }
    const moving = isDragging || !!csIntro || !!(csWinWave && csWinWave.active) ||
        Math.abs(moveSig - CS3D._moveSig) > 1e-5;
    CS3D._moveSig = moveSig;
    if (moving) CS3D._shadowSettle = 2;
    if (CS3D._shadowSettle > 0) {
        CS3D.renderer.shadowMap.needsUpdate = true;
        CS3D._shadowSettle--;
    }
    CS3D.renderer.render(CS3D.scene, CS3D.camera);
    cs3dUpdatePerfHud();
}

// Dev-only live performance readout (draw calls, triangles, avg frame ms/fps).
// Present only when the debug panel is available (hidden in shipping builds),
// so it never runs for players. Toggle it from the debug menu's "FPS" button.
// Helps distinguish a game-side frame-cost problem from environmental/
// background load on the test device.
let csPerfEl = null, csPerfLast = 0, csPerfAccum = 0, csPerfFrames = 0, csPerfPrev = 0;
let csPerfOn = true;
function cs3dSetPerfHud(on) {
    csPerfOn = on;
    if (!on && csPerfEl) csPerfEl.style.display = "none";
    csPerfPrev = 0; csPerfAccum = 0; csPerfFrames = 0;
    const btn = document.getElementById("debugFpsToggle");
    if (btn) btn.classList.toggle("active", on);
}
function cs3dUpdatePerfHud() {
    if (!csPerfOn || !debugPanel || debugPanel.style.display === "none") return;
    const now = performance.now();
    if (csPerfPrev) { csPerfAccum += now - csPerfPrev; csPerfFrames++; }
    csPerfPrev = now;
    if (now - csPerfLast < 250) return;
    csPerfLast = now;
    if (!csPerfEl) {
        csPerfEl = document.createElement("div");
        csPerfEl.id = "csPerfStat";
        csPerfEl.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99999;" +
            "font:11px/1.35 monospace;color:#8f8;background:rgba(0,0,0,0.55);" +
            "padding:3px 6px;border-radius:4px;pointer-events:none;white-space:pre;";
        document.body.appendChild(csPerfEl);
    }
    csPerfEl.style.display = "block";
    const info = CS3D.renderer.info.render;
    const ms = csPerfFrames ? csPerfAccum / csPerfFrames : 0;
    csPerfEl.textContent =
        `${ms.toFixed(1)}ms  ${(1000 / (ms || 1)).toFixed(0)}fps\n` +
        `calls ${info.calls}  tris ${info.triangles}`;
    csPerfAccum = 0; csPerfFrames = 0;
}



function cs3dUpdateHints() {
    hintReconcileEquivalentSteps();
    if (!CS3D.ok) return;
    const T = window.THREE;
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 320);
    // Advance the shared shine sweep (loops 0→1 over one period).
    if (CS3D.hintShineU) {
        const period = CS3D_CFG.HINT_SHINE_PERIOD_MS || 1500;
        CS3D.hintShineU.phase.value = (performance.now() % period) / period;
    }
    let meshIndex = 0;
    for (let k = 0; k < activeHints.length; k++) {
        const step = hintSolution[activeHints[k]];
        if (hintStepSolved(step)) continue;
        let mesh = CS3D.hintMeshes[meshIndex];
        if (!mesh) {
            mesh = new T.Mesh(
                new T.PlaneGeometry(1, 1),
                new T.MeshBasicMaterial({
                    color: 0xffffff, transparent: true,
                    opacity: CS3D_CFG.SNAP_OPACITY, depthWrite: false, toneMapped: false,
                })
            );
            mesh.raycast = () => {};
            mesh.renderOrder = 1;
            mesh._hintKey = null;
            mesh._shineHalf = { value: new T.Vector2(1, 1) };
            cs3dAttachHintShine(mesh.material, mesh._shineHalf);
            CS3D.glowGroup.add(mesh);
            CS3D.hintMeshes[meshIndex] = mesh;
        }
        const margins = hintEdgeMargins(step, activeHints[k]);
        const key = [
            step.w, step.h, margins.left, margins.right, margins.top, margins.bottom
        ].join("x");
        if (mesh._hintKey !== key) {
            mesh._hintKey = key;
            const width = step.w + margins.left + margins.right;
            const height = step.h + margins.top + margins.bottom;
            const r = CS3D_CFG.CORNER_R;
            const geo = new T.ShapeGeometry(
                cs3dFootprintShape(width, height, [
                    r + Math.min(margins.left, margins.bottom),
                    r + Math.min(margins.right, margins.bottom),
                    r + Math.min(margins.right, margins.top),
                    r + Math.min(margins.left, margins.top),
                ])
            );
            geo.rotateX(-Math.PI / 2);
            if (mesh.geometry) mesh.geometry.dispose();
            mesh.geometry = geo;
            mesh._shineHalf.value.set(width / 2, height / 2);
        }
        mesh.position.set(
            step.x + step.w / 2 + (margins.right - margins.left) / 2 - gridCols / 2,
            CS3D_CFG.TILE_Y + 0.03,
            step.y + step.h / 2 + (margins.bottom - margins.top) / 2 - gridRows / 2
        );
        const b = hintBlockById(step.id);
        const col = b ? (b.locked ? CS3D_CFG.LOCKED_STONE_COLOR : b.color) : "#ffffff";
        mesh.material.color.copy(cs3dColor(col)).lerp(cs3dColor("#ffffff"), CS3D_CFG.HINT_COLOR_LERP);
        mesh.material.opacity = CS3D_CFG.HINT_OPACITY * pulse;
        mesh.visible = true;
        meshIndex++;
    }
    for (let k = meshIndex; k < CS3D.hintMeshes.length; k++) {
        if (CS3D.hintMeshes[k]) CS3D.hintMeshes[k].visible = false;
    }
}


window.CSApp = window.CSApp || {};
window.CSApp.render = {
    init: typeof cs3dInit === "function" ? cs3dInit : null,
    dispose: typeof cs3dDispose === "function" ? cs3dDispose : null,
    ensureReady: typeof cs3dEnsureReady === "function" ? cs3dEnsureReady : null,
    createDebugPanel: typeof cs3dCreateDebugPanel === "function" ? cs3dCreateDebugPanel : null,
    resize: typeof cs3dResize === "function" ? cs3dResize : null,
    buildLevel: typeof cs3dBuildLevel === "function" ? cs3dBuildLevel : null,
    draw: typeof csDraw === "function" ? csDraw : null,
    updateHints: typeof cs3dUpdateHints === "function" ? cs3dUpdateHints : null,
    cellAt: typeof cs3dCellAt === "function" ? cs3dCellAt : null,
    getCS3D: () => CS3D,
};
