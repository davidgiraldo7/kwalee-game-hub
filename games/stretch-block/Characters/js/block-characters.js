// OWNER: shared — Block character overlays on expanded Soft-3D slabs.
// Config: block-characters-config.js. Catalog: block-characters-data.js.
// Host: call attach from cs3dBuildLevel, update from cs3dUpdateBlock.
"use strict";

(function () {
    const PARTS = ["mask", "head", "feet", "feetUnderHead", "tail"];
    const DEFAULT_UNLOCKED = ["Cat"];

    /** @type {null | { planeGeo: object }} */
    let shared = null;
    /** "path|hex|mode" → CanvasTexture for processed/tinted maps */
    const processedCache = new Map();
    /** path → HTMLImageElement | Promise */
    const imageCache = new Map();

    /** Offscreen host root for SpinePlayer canvases (must stay laid out). */
    let spineHostRoot = null;
    const SPINE_CANVAS_SIZE = 256;
    /**
     * One SpinePlayer (one WebGL context) per skeleton asset. Each block gets
     * its own Skeleton + AnimationState; we render them all each frame into the
     * shared canvas and copy onto that block's texture (so every face animates).
     * @type {Map<string, object>}
     */
    const sharedSpinePlayers = new Map();
    /** assetKey|idleAnim → { canvas } raw Spine frames (tint applied per block). */
    const spineIdleCache = new Map();

    function isSpineHeadDef(head) {
        return !!(head && typeof head === "object" && head.type === "spine" && head.json);
    }

    function spinePlaybackEnabled() {
        return readCfg().useSpine !== false;
    }

    /** True only when this is a Spine head AND playback is enabled. */
    function isSpineHead(head) {
        return isSpineHeadDef(head) && spinePlaybackEnabled();
    }

    /** Static PNG path for texture processing / Spine fallback. */
    function headStaticPath(head) {
        if (typeof head === "string") return head;
        if (isSpineHeadDef(head)) return head.fallback || null;
        return null;
    }

    function spineApiAvailable() {
        return !!(window.spine && typeof window.spine.SpinePlayer === "function");
    }

    function spineAssetKey(def) {
        return String(def && def.json || "") + "|" + String(def && def.atlas || "");
    }

    function ensureSpineHostRoot() {
        if (spineHostRoot && spineHostRoot.isConnected) return spineHostRoot;
        const el = document.createElement("div");
        el.id = "bcSpineHosts";
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = [
            "position:fixed",
            "left:-9999px",
            "top:0",
            "width:0",
            "height:0",
            "overflow:hidden",
            "pointer-events:none",
            "opacity:0",
            "visibility:hidden",
            "z-index:-1"
        ].join(";");
        document.body.appendChild(el);
        spineHostRoot = el;
        return el;
    }

    function spineViewportFor(def) {
        const vp = def && def.viewport;
        if (vp && typeof vp === "object") return vp;
        const cfg = spineHeadCfg(def);
        // CatFace1 AABB is ~725×776 centered near (-1.3, -2.6). Prefer a slightly
        // larger square with a lower center so the chin isn't flush with the crop.
        const cx = Number.isFinite(Number(cfg.viewportCenterX)) ? Number(cfg.viewportCenterX) : -1.3;
        const cy = Number.isFinite(Number(cfg.viewportCenterY)) ? Number(cfg.viewportCenterY) : -28;
        const sideRaw = Number(cfg.viewportSize);
        const side = Number.isFinite(sideRaw) && sideRaw > 32 ? sideRaw : 860;
        const pad = (key, fallback) => {
            const v = cfg[key];
            return (v == null || v === "") ? fallback : v;
        };
        return {
            x: cx - side / 2,
            y: cy - side / 2,
            width: side,
            height: side,
            padLeft: pad("viewportPadLeft", "0%"),
            padRight: pad("viewportPadRight", "0%"),
            padTop: pad("viewportPadTop", "0%"),
            padBottom: pad("viewportPadBottom", "0%"),
            transitionTime: 0
        };
    }

    /** Global spineHead cfg merged with optional per-skeleton overrides on the head def. */
    function spineHeadCfg(def) {
        const base = readCfg().spineHead || {};
        const over = def && def.spineHead && typeof def.spineHead === "object" ? def.spineHead : null;
        return over ? Object.assign({}, base, over) : base;
    }

    function earBoneNamesFromCfg(cfg) {
        if (Array.isArray(cfg.earBones) && cfg.earBones.length) return cfg.earBones;
        return [cfg.earBone || "Ears"];
    }

    /** One-shot skeleton tweaks so pink Ears sit in the ear-mask pockets. */
    function applyEarAlignToSkeleton(sk, def) {
        if (!sk) return;
        const cfg = spineHeadCfg(def);
        if (cfg.hideEarSlots) {
            const names = Array.isArray(cfg.earSlotNames) ? cfg.earSlotNames : ["Ears"];
            names.forEach((name) => {
                const slot = sk.findSlot(name);
                if (!slot) return;
                try {
                    if (typeof slot.setAttachment === "function") slot.setAttachment(null);
                    else if (slot.color) slot.color.a = 0;
                } catch (_) { /* ignore */ }
            });
            return;
        }
        const boneNames = earBoneNamesFromCfg(cfg);
        const oy = Number(cfg.earBoneOffsetY);
        const sc = Number(cfg.earBoneScale);
        for (let i = 0; i < boneNames.length; i++) {
            const bone = typeof sk.findBone === "function" ? sk.findBone(boneNames[i]) : null;
            if (!bone) continue;
            if (bone._bcEarBaseY == null) {
                bone._bcEarBaseY = bone.y;
                bone._bcEarBaseSX = bone.scaleX;
                bone._bcEarBaseSY = bone.scaleY;
            }
            bone.y = bone._bcEarBaseY + (Number.isFinite(oy) ? oy : 0);
            if (Number.isFinite(sc) && sc > 0) {
                bone.scaleX = bone._bcEarBaseSX * sc;
                bone.scaleY = bone._bcEarBaseSY * sc;
            } else {
                bone.scaleX = bone._bcEarBaseSX;
                bone.scaleY = bone._bcEarBaseSY;
            }
        }
    }

    function applySpineEarAlign(player, def) {
        if (!player || !player.skeleton) return;
        applyEarAlignToSkeleton(player.skeleton, def);
        try { player.skeleton.updateWorldTransform(); } catch (_) { /* ignore */ }
    }

    /**
     * Face / expression slots that anims toggle. IdleChad / IdleAngry / etc. only
     * SET their own attachments — they never clear leftovers from the previous anim.
     * Includes Cat + Dog slot names (missing slots are skipped).
     *
     * Do NOT list Cat "Ears" here — pink inner ears are setup-pose only and no
     * Cat Intro/Idle keys that slot. Clearing it made ears vanish for the whole
     * Intro, then "pop in" when a still/cache with ears returned.
     * Dog ear leftovers are cleared separately via spineHead.earSlotNames when
     * more than one ear slot is configured (expression-switched ears).
     */
    const SPINE_FACE_SLOTS = [
        // Cat
        "Eye", "Eye2", "NoseMouth",
        "AngryEyeLeft", "AngryEyeRight", "AngryNoseMouth",
        "AweEyeLeft", "AweEyeRight", "AweMouth",
        "ChadEye", "ChadEye2", "ChadMouth", "ChadNose",
        "HappyEye", "HappyEye2", "HappyMouth",
        "TongueMouth", "WinkMouth",
        // Dog face parts (ears cleared via earSlotNames — see clearSpineFaceSlots)
        "Eyes", "Eyes2", "Nose",
        "Dog_Eye_Patch", "Dog_Eye_Wink", "Dog_Eye_Wink2", "Dog_Eye_Wink3",
        "Dog_Eye_Frown_L", "Dog_Eye_Frown_R",
        "Dog_Nose_Tongue", "Dog_Nose_Sad", "Dog_Nose_Chad",
        "Dog_Whisker", "Dog_Whisker2"
    ];

    function clearSlotAttachment(skeleton, name) {
        if (!skeleton || !name || typeof skeleton.findSlot !== "function") return;
        const slot = skeleton.findSlot(name);
        if (!slot) return;
        try {
            if (typeof slot.setAttachment === "function") slot.setAttachment(null);
            else slot.attachment = null;
        } catch (_) { /* ignore */ }
    }

    function clearSpineFaceSlots(skeleton, def) {
        if (!skeleton) return;
        for (let i = 0; i < SPINE_FACE_SLOTS.length; i++) {
            clearSlotAttachment(skeleton, SPINE_FACE_SLOTS[i]);
        }
        // Dog (and any multi-ear skeleton): each expression enables one ear
        // attachment and never clears the others — wipe them before apply.
        // Cat has a single setup-pose Ears slot; leave it alone.
        const cfg = spineHeadCfg(def);
        const earSlots = Array.isArray(cfg.earSlotNames) ? cfg.earSlotNames : null;
        if (earSlots && earSlots.length > 1) {
            for (let i = 0; i < earSlots.length; i++) {
                clearSlotAttachment(skeleton, earSlots[i]);
            }
        }
    }

    function resetSkeletonAnim(skeleton, state, def) {
        if (state && typeof state.clearTracks === "function") {
            try { state.clearTracks(); } catch (_) { /* ignore */ }
        }
        if (!skeleton) return;
        try {
            if (typeof skeleton.setBonesToSetupPose === "function") skeleton.setBonesToSetupPose();
            if (typeof skeleton.setSlotsToSetupPose === "function") skeleton.setSlotsToSetupPose();
            clearSpineFaceSlots(skeleton, def);
        } catch (_) { /* ignore */ }
    }

    function takeSpineRenderControl(player) {
        if (!player) return;
        try {
            if (typeof player.stopRendering === "function") player.stopRendering();
        } catch (_) { /* ignore */ }
        try { player.paused = true; } catch (_) { /* ignore */ }
    }

    function driveSpineFrame(player) {
        if (!player) return;
        try { player.paused = false; } catch (_) { /* ignore */ }
        try {
            if (typeof player.drawFrame === "function") player.drawFrame(false);
        } catch (_) { /* ignore */ }
        try { player.paused = true; } catch (_) { /* ignore */ }
    }

    /** Used only while warming idle stills on the bootstrap player skeleton. */
    function setSpineAnimation(player, name, loop, def) {
        if (!player || !name) return;
        takeSpineRenderControl(player);
        resetSkeletonAnim(player.skeleton, player.animationState, def);
        try { player.setAnimation(name, !!loop); } catch (_) { /* ignore */ }
        applySpineEarAlign(player, def);
        driveSpineFrame(player);
    }

    // ---- Multi-skeleton face playback (all cats animate together) ----
    // One WebGL SpinePlayer provides atlas + SceneRenderer. Each expanded block
    // gets its own Skeleton + AnimationState. Every frame we update all of them,
    // render each into the shared canvas, and copy onto that block's texture.

    /** @type {Map<object, { shared: object, ch: object, sp: object, skeleton: object, state: object, def: object }>} */
    const spineActors = new Map(); // key = sp
    let spineAnimRaf = 0;
    let spineAnimLastTs = 0;

    function spineWorldUpdate(skeleton) {
        if (!skeleton) return;
        try {
            const Physics = window.spine && spine.Physics;
            if (Physics && Physics.update != null && typeof skeleton.updateWorldTransform === "function") {
                skeleton.updateWorldTransform(Physics.update);
            } else if (typeof skeleton.updateWorldTransform === "function") {
                skeleton.updateWorldTransform();
            }
        } catch (_) {
            try { skeleton.updateWorldTransform(); } catch (__) { /* ignore */ }
        }
    }

    function disposeBlockSpineTextures(sp) {
        if (!sp) return;
        if (sp.tex) {
            try { sp.tex.dispose(); } catch (_) { /* ignore */ }
            sp.tex = null;
        }
        sp.procCanvas = null;
        sp.procCtx = null;
        sp.srcCanvas = null;
        sp.snapCanvas = null;
        sp.snapCtx = null;
        sp._layoutBound = false;
    }

    function removeSpineActor(sp) {
        if (!sp) return;
        spineActors.delete(sp);
        if (!spineActors.size && spineAnimRaf) {
            try { cancelAnimationFrame(spineAnimRaf); } catch (_) { /* ignore */ }
            spineAnimRaf = 0;
            spineAnimLastTs = 0;
        }
    }

    function clearIdlePulse(sp) {
        if (!sp || !sp._idlePulseTimer) return;
        try { clearTimeout(sp._idlePulseTimer); } catch (_) { /* ignore */ }
        sp._idlePulseTimer = 0;
    }

    /** Invalidate a pending deferred startLive (expand→shrink race). */
    function cancelPendingSpineStart(sp) {
        if (!sp) return;
        clearIdlePulse(sp);
        sp.gen = (sp.gen || 0) + 1;
        removeSpineActor(sp);
    }

    function spineFreezeAfterIntroEnabled() {
        return readCfg().spineFreezeAfterIntro !== false;
    }

    function spineIdlePulseEnabled() {
        return spineFreezeAfterIntroEnabled() && readCfg().spineIdlePulse !== false;
    }

    function idlePulseDelayMs() {
        const cfg = readCfg();
        const min = Math.max(400, Number(cfg.spineIdlePulseMinMs) || 2800);
        const max = Math.max(min, Number(cfg.spineIdlePulseMaxMs) || 7200);
        return min + Math.random() * (max - min);
    }

    function countPulseActors() {
        let n = 0;
        for (const actor of spineActors.values()) {
            if (actor && actor.pulseIdle) n++;
        }
        return n;
    }

    function scheduleIdlePulse(sp) {
        clearIdlePulse(sp);
        if (!sp || !sp.wasExpanded || !spineIdlePulseEnabled()) return;
        const delay = idlePulseDelayMs();
        sp._idlePulseTimer = setTimeout(() => {
            sp._idlePulseTimer = 0;
            tryStartIdlePulse(sp);
        }, delay);
    }

    /** Retry soon (slot busy / transient fail) without burning a full random gap. */
    function scheduleIdlePulseSoon(sp) {
        clearIdlePulse(sp);
        if (!sp || !sp.wasExpanded || !spineIdlePulseEnabled()) return;
        sp._idlePulseTimer = setTimeout(() => {
            sp._idlePulseTimer = 0;
            tryStartIdlePulse(sp);
        }, 400 + Math.random() * 500);
    }

    function poseActorSkeleton(actor, dtSec) {
        if (!actor || !actor.skeleton || !actor.state) return;
        const dt = Math.max(0, dtSec || 0);
        try {
            if (dt > 0 && typeof actor.skeleton.update === "function") actor.skeleton.update(dt);
            if (typeof actor.state.update === "function") actor.state.update(dt);
            actor.state.apply(actor.skeleton);
            applyEarAlignToSkeleton(actor.skeleton, actor.def);
            spineWorldUpdate(actor.skeleton);
        } catch (_) { /* ignore */ }
    }

    function tryStartIdlePulse(sp) {
        if (!sp || !sp.wasExpanded || !spineIdlePulseEnabled()) return;
        const ch = sp.hostCharacter;
        const def = sp.def;
        if (!ch || ch.spine !== sp || !def) {
            // Character mid-rebuild — try again shortly if still expanded.
            if (sp.wasExpanded) scheduleIdlePulseSoon(sp);
            return;
        }
        if (spineActors.has(sp)) {
            scheduleIdlePulseSoon(sp);
            return;
        }
        const max = Math.max(1, parseInt(readCfg().spineIdlePulseMaxConcurrent, 10) || 1);
        if (countPulseActors() >= max) {
            scheduleIdlePulseSoon(sp);
            return;
        }
        const gen = sp.gen;
        ensureSharedSpinePlayer(def).then((shared) => {
            if (!sp.wasExpanded || !spineIdlePulseEnabled()) return;
            if (ch.spine !== sp) {
                scheduleIdlePulseSoon(sp);
                return;
            }
            if (sp.gen !== gen) return; // superseded by expand/shrink/dispose
            if (!shared || shared.failed) {
                scheduleIdlePulse(sp);
                return;
            }
            if (!shared.skeletonData || !shared.stateData) {
                scheduleIdlePulseSoon(sp);
                return;
            }
            if (shared.warming) {
                warmSharedIdles(shared, shared.expressions || def.expressions, () => {
                    tryStartIdlePulse(sp);
                });
                return;
            }
            if (countPulseActors() >= max || spineActors.has(sp)) {
                scheduleIdlePulseSoon(sp);
                return;
            }
            const actor = ensureSpineActor(shared, ch, sp, def);
            if (!actor) {
                scheduleIdlePulseSoon(sp);
                return;
            }
            // Keep the resting still on-mesh; pose Idle at t=0 (matches still) then
            // stream — never capture a setup-pose frame (that was the flicker).
            playActorIdlePulse(actor, def);
            poseActorSkeleton(actor, 0);
            takeSpineRenderControl(shared.player);
            if (renderSkeletonToShared(shared, actor.skeleton)) {
                captureActorFrame(shared, actor, { fast: true });
                // Keep the shared rest still on Idle t=0 (never the end pose).
                stashIdleCache(shared, spineIdleName(def));
            }
            ensureSpineAnimLoop();
        }).catch(() => {
            scheduleIdlePulse(sp);
        });
    }

    /** Capture / restore resting Idle still and leave the live RAF. */
    function freezeSpineActorToIdle(shared, actor) {
        if (!shared || !actor || !actor.sp || !actor.ch) return;
        const sp = actor.sp;
        const def = actor.def || sp.def;
        const wasPulse = !!actor.pulseIdle;
        actor.pulseIdle = false;
        actor.freezeAfterIntro = false;
        if (wasPulse) {
            // Snap back to the resting still (Idle start), not the last anim frame —
            // otherwise the next pulse jumps end→start and reads as a flicker.
            if (def) applyIdleCacheToBlock(actor.ch, sp, def);
        } else {
            poseActorSkeleton(actor, 0);
            takeSpineRenderControl(shared.player);
            if (renderSkeletonToShared(shared, actor.skeleton)) {
                captureActorFrame(shared, actor, { fast: true });
                // Only stash on Intro→rest so the shared idle cache stays the start pose.
                if (def) stashIdleCache(shared, spineIdleName(def));
            }
        }
        removeSpineActor(sp);
        scheduleIdlePulse(sp);
    }

    function disposeSharedSpinePlayer(shared) {
        if (!shared) return;
        if (shared.key) sharedSpinePlayers.delete(shared.key);
        try {
            if (shared.player && typeof shared.player.dispose === "function") {
                shared.player.dispose();
            }
        } catch (_) { /* ignore */ }
        shared.player = null;
        shared.srcCanvas = null;
        shared.skeletonData = null;
        shared.stateData = null;
        shared.ready = false;
        shared.failed = true;
        shared.loadPromise = null;
        if (shared.host && shared.host.parentNode) {
            try { shared.host.parentNode.removeChild(shared.host); } catch (_) { /* ignore */ }
        }
        shared.host = null;
    }

    /** Tear down every shared Spine WebGL player (debug / useSpine off / quit). */
    function disposeAllSharedSpinePlayers() {
        for (const sp of Array.from(spineActors.keys())) removeSpineActor(sp);
        for (const shared of Array.from(sharedSpinePlayers.values())) {
            disposeSharedSpinePlayer(shared);
        }
        spineIdleCache.clear();
        if (spineHostRoot && spineHostRoot.isConnected) {
            while (spineHostRoot.firstChild) {
                try { spineHostRoot.removeChild(spineHostRoot.firstChild); } catch (_) { /* ignore */ }
            }
        }
    }

    /** Drop THREE textures tied to a previous WebGL context (after hard failure). */
    function clearTextureCaches() {
        for (const tex of processedCache.values()) {
            try { if (tex && tex.dispose) tex.dispose(); } catch (_) { /* ignore */ }
        }
        processedCache.clear();
        spineIdleCache.clear();
    }

    /**
     * Keep CPU canvases/images; mark GPU uploads dirty so the next renderer
     * re-uploads. Prefer this over clearTextureCaches on quit↔play.
     */
    function invalidateTextureCaches() {
        for (const tex of processedCache.values()) {
            if (tex) tex.needsUpdate = true;
        }
        spineIdleCache.clear();
    }

    function disposeSpineHead(ch) {
        if (!ch || !ch.spine) return;
        const sp = ch.spine;
        ch.spine = null;
        clearIdlePulse(sp);
        sp.gen = (sp.gen || 0) + 1;
        removeSpineActor(sp);
        disposeBlockSpineTextures(sp);
    }

    function spineIdleCacheKey(assetKey, idleName) {
        return String(assetKey || "") + "|" + String(idleName || "IdleFace1");
    }

    function stashIdleCache(shared, idleName) {
        if (!shared || !shared.srcCanvas) return null;
        const src = shared.srcCanvas;
        const w = Math.max(1, src.width | 0);
        const h = Math.max(1, src.height | 0);
        const key = spineIdleCacheKey(shared.key, idleName);
        let entry = spineIdleCache.get(key);
        if (!entry) {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            entry = { canvas: canvas, ctx: canvas.getContext("2d") };
            spineIdleCache.set(key, entry);
        }
        if (entry.canvas.width !== w || entry.canvas.height !== h) {
            entry.canvas.width = w;
            entry.canvas.height = h;
        }
        try {
            entry.ctx.clearRect(0, 0, w, h);
            entry.ctx.drawImage(src, 0, 0);
        } catch (_) {
            return null;
        }
        return entry;
    }

    function applyIdleCacheToBlock(ch, sp, def) {
        if (!ch || !sp || !def) return false;
        const idleName = spineIdleName(def);
        const key = spineIdleCacheKey(sp.assetKey || spineAssetKey(def), idleName);
        const entry = spineIdleCache.get(key);
        if (!entry || !entry.canvas) return false;
        sp.srcCanvas = entry.canvas;
        bindSpineHeadTexture(ch, sp, { fast: true });
        sp.ready = true;
        sp.failed = false;
        return true;
    }

    /** Allocate snap/proc canvases + CanvasTexture early (level attach / warm). */
    function ensureSpineFrameSurfaces(ch, sp) {
        if (!ch || !sp || !window.THREE) return;
        const w = SPINE_CANVAS_SIZE;
        const h = SPINE_CANVAS_SIZE;
        if (!sp.snapCanvas) {
            sp.snapCanvas = document.createElement("canvas");
            sp.snapCanvas.width = w;
            sp.snapCanvas.height = h;
            sp.snapCtx = sp.snapCanvas.getContext("2d");
        }
        if (!sp.procCanvas) {
            sp.procCanvas = document.createElement("canvas");
            sp.procCanvas.width = w;
            sp.procCanvas.height = h;
            sp.procCtx = sp.procCanvas.getContext("2d");
        }
        if (!sp.tex) {
            sp.tex = canvasTexture(sp.procCanvas);
            if (ch.parts && ch.parts.head && ch.parts.head.material) {
                ch.parts.head.material.map = sp.tex;
                ch.parts.head.material.premultipliedAlpha = false;
                if (ch.parts.head.material.color) ch.parts.head.material.color.set(0xffffff);
                ch.parts.head.material.needsUpdate = true;
            }
        }
    }

    function warmSharedIdles(shared, expressions, onDone) {
        const done = typeof onDone === "function" ? onDone : function () {};
        if (!shared || !shared.ready || !shared.player || shared.failed) {
            done();
            return;
        }
        const list = Array.isArray(expressions) ? expressions.slice() : [];
        if (!list.length) {
            list.push({ idle: spineIdleName(shared.def) });
        }
        const cacheComplete = () => {
            for (let i = 0; i < list.length; i++) {
                const idleName = (list[i] && list[i].idle) || spineIdleName(shared.def);
                if (!spineIdleCache.has(spineIdleCacheKey(shared.key, idleName))) return false;
            }
            return list.length > 0;
        };
        if (shared.warmed && cacheComplete()) {
            done();
            return;
        }
        if (shared.warming) {
            (shared.warmWaiters || (shared.warmWaiters = [])).push(done);
            return;
        }
        shared.warming = true;
        shared.warmed = false;
        shared.warmWaiters = [done];
        for (const key of Array.from(spineIdleCache.keys())) {
            if (String(key).indexOf(shared.key + "|") === 0) spineIdleCache.delete(key);
        }
        let i = 0;
        const finishWarm = (ok) => {
            shared.warming = false;
            if (ok) shared.warmed = true;
            const waiters = shared.warmWaiters || [];
            shared.warmWaiters = [];
            for (let w = 0; w < waiters.length; w++) {
                try { waiters[w](); } catch (_) { /* ignore */ }
            }
        };
        const step = () => {
            if (!shared.ready || shared.failed) {
                finishWarm(false);
                return;
            }
            if (i >= list.length) {
                finishWarm(true);
                return;
            }
            const e = list[i++] || {};
            const idleName = e.idle || spineIdleName(shared.def);
            setSpineAnimation(shared.player, idleName, true, shared.def);
            requestAnimationFrame(() => {
                driveSpineFrame(shared.player);
                stashIdleCache(shared, idleName);
                step();
            });
        };
        step();
    }

    function spineHeadDefForCharacter(characterId) {
        const entry = catalog()[characterId || selectedCharacterId()];
        if (!entry || !entry.heads || !entry.heads.length) return null;
        const head = entry.heads[0];
        return isSpineHead(head) ? head : null;
    }

    function preloadSelectedSpine() {
        const def = spineHeadDefForCharacter(selectedCharacterId());
        if (!def) return Promise.resolve(null);
        return ensureSharedSpinePlayer(def);
    }

    function ensureSharedSpinePlayer(def) {
        if (!isSpineHead(def)) return Promise.resolve(null);
        const key = spineAssetKey(def);
        let shared = sharedSpinePlayers.get(key);
        if (def && def.expressions && shared) {
            shared.expressions = def.expressions;
            if (shared.def && !shared.def.expressions) shared.def.expressions = def.expressions;
        }
        if (shared && shared.ready && shared.player) {
            return new Promise((resolve) => {
                const exprs = def.expressions || shared.expressions ||
                    (shared.def && shared.def.expressions);
                warmSharedIdles(shared, exprs, () => resolve(shared));
            });
        }
        if (shared && shared.loadPromise) return shared.loadPromise;
        if (!spineApiAvailable()) {
            console.warn("[BlockCharacters] Spine player missing — using head fallback PNG.");
            return Promise.resolve(null);
        }

        const root = ensureSpineHostRoot();
        const host = document.createElement("div");
        host.className = "bc-spine-host bc-spine-shared";
        host.style.cssText = "width:" + SPINE_CANVAS_SIZE + "px;height:" + SPINE_CANVAS_SIZE +
            "px;position:absolute;left:0;top:0;";
        root.appendChild(host);

        shared = {
            key: key,
            def: def,
            expressions: (def && def.expressions) || null,
            host: host,
            player: null,
            srcCanvas: null,
            skeletonData: null,
            stateData: null,
            ready: false,
            failed: false,
            loadPromise: null
        };
        sharedSpinePlayers.set(key, shared);

        shared.loadPromise = new Promise((resolve) => {
            let settled = false;
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                resolve(ok ? shared : null);
            };
            try {
                const idleName = spineIdleName(def);
                const player = new window.spine.SpinePlayer(host, {
                    jsonUrl: def.json,
                    atlasUrl: def.atlas,
                    animation: idleName,
                    showControls: false,
                    showLoading: false,
                    alpha: true,
                    backgroundColor: "#00000000",
                    premultipliedAlpha: false,
                    preserveDrawingBuffer: true,
                    viewport: spineViewportFor(def),
                    success: (p) => {
                        const live = sharedSpinePlayers.get(key);
                        if (!live || live !== shared) {
                            try { if (p && p.dispose) p.dispose(); } catch (_) { /* ignore */ }
                            finish(false);
                            return;
                        }
                        shared.player = p;
                        shared.ready = true;
                        shared.srcCanvas = host.querySelector("canvas") || p.canvas || null;
                        if (def.expressions) shared.expressions = def.expressions;
                        try {
                            shared.skeletonData = p.skeleton && p.skeleton.data;
                            if (shared.skeletonData && window.spine.AnimationStateData) {
                                shared.stateData = new spine.AnimationStateData(shared.skeletonData);
                                shared.stateData.defaultMix = 0;
                            } else if (p.animationState && p.animationState.data) {
                                shared.stateData = p.animationState.data;
                            }
                        } catch (_) { /* ignore */ }
                        takeSpineRenderControl(p);
                        applySpineEarAlign(p, def);
                        setSpineAnimation(p, idleName, true, def);
                        finish(true);
                        warmSharedIdles(shared, shared.expressions || def.expressions, function () {});
                    },
                    error: (_p, msg) => {
                        console.warn("[BlockCharacters] Spine head failed:", msg || "load error",
                            "(need CatFace1.png next to atlas? Spine 4.2 player vs 4.3 export?)");
                        shared.failed = true;
                        shared.ready = false;
                        finish(false);
                    }
                });
                shared.player = player;
            } catch (err) {
                console.warn("[BlockCharacters] Spine head init error:", err);
                shared.failed = true;
                finish(false);
            }
        });

        return shared.loadPromise;
    }

    function captureActorFrame(shared, actor, opts) {
        if (!shared || !shared.srcCanvas || !actor || !actor.sp || !actor.ch) return;
        const fast = !opts || opts.fast !== false;
        const sp = actor.sp;
        const src = shared.srcCanvas;
        const w = Math.max(1, src.width | 0);
        const h = Math.max(1, src.height | 0);
        if (!sp.snapCanvas) {
            sp.snapCanvas = document.createElement("canvas");
            sp.snapCtx = sp.snapCanvas.getContext("2d");
        }
        if (sp.snapCanvas.width !== w || sp.snapCanvas.height !== h) {
            sp.snapCanvas.width = w;
            sp.snapCanvas.height = h;
        }
        try {
            sp.snapCtx.clearRect(0, 0, w, h);
            sp.snapCtx.drawImage(src, 0, 0);
            sp.srcCanvas = sp.snapCanvas;
        } catch (_) {
            sp.srcCanvas = src;
        }
        bindSpineHeadTexture(actor.ch, sp, { fast: fast });
        sp.ready = true;
        sp.failed = false;
    }

    /** Draw one skeleton into the shared player's WebGL canvas. */
    function renderSkeletonToShared(shared, skeleton) {
        const player = shared && shared.player;
        if (!player || !skeleton || !player.sceneRenderer) return false;
        const renderer = player.sceneRenderer;
        const canvas = player.canvas || shared.srcCanvas;
        if (!canvas) return false;

        // Prefer the viewport SpinePlayer already computed from our config.
        const cv = player.currentViewport || spineViewportFor(shared.def);
        const padL = Number(cv.padLeft) || 0;
        const padR = Number(cv.padRight) || 0;
        const padT = Number(cv.padTop) || 0;
        const padB = Number(cv.padBottom) || 0;
        const vx = (cv.x != null ? cv.x : 0) - padL;
        const vy = (cv.y != null ? cv.y : 0) - padB;
        const vw = (cv.width != null ? cv.width : 860) + padL + padR;
        const vh = (cv.height != null ? cv.height : 860) + padB + padT;

        try {
            renderer.camera.zoom = canvas.height / canvas.width > vh / vw
                ? vw / canvas.width
                : vh / canvas.height;
            renderer.camera.position.x = vx + vw / 2;
            renderer.camera.position.y = vy + vh / 2;
            const ResizeMode = window.spine && spine.ResizeMode;
            if (typeof renderer.resize === "function") {
                const mode = (cv.clip && ResizeMode && ResizeMode.FitClip != null)
                    ? ResizeMode.FitClip
                    : (ResizeMode && ResizeMode.Expand != null ? ResizeMode.Expand : 1);
                renderer.resize(mode, vw, vh);
            }
            const gl = player.context && player.context.gl;
            if (gl) {
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            renderer.begin();
            renderer.drawSkeleton(skeleton);
            renderer.end();
            return true;
        } catch (err) {
            console.warn("[BlockCharacters] Spine render error:", err);
            return false;
        }
    }

    function ensureSpineAnimLoop() {
        if (spineAnimRaf) return;
        spineAnimLastTs = 0;
        const tick = (ts) => {
            spineAnimRaf = 0;
            if (!spineActors.size) {
                spineAnimLastTs = 0;
                return;
            }
            const now = ts || performance.now();
            let dt = spineAnimLastTs ? (now - spineAnimLastTs) / 1000 : 1 / 60;
            spineAnimLastTs = now;
            if (dt > 0.05) dt = 0.05;
            if (dt < 0) dt = 0;

            /** @type {Map<object, Array>} */
            const byShared = new Map();
            for (const actor of Array.from(spineActors.values())) {
                if (!actor || !actor.shared || !actor.skeleton || !actor.state) {
                    if (actor && actor.sp) spineActors.delete(actor.sp);
                    continue;
                }
                const sp = actor.sp;
                const ch = actor.ch;
                // Drop orphans: detached, shrunk, or cancelled deferred starts.
                if (!ch || ch.spine !== sp || !sp.wasExpanded ||
                    !ch.group || !ch.group.parent) {
                    clearIdlePulse(sp);
                    spineActors.delete(sp);
                    continue;
                }
                if (!ch.group.visible) {
                    // Hidden this frame (e.g. mid-layout) — keep actor but skip work.
                    continue;
                }
                let list = byShared.get(actor.shared);
                if (!list) {
                    list = [];
                    byShared.set(actor.shared, list);
                }
                list.push(actor);
            }

            if (!spineActors.size) {
                spineAnimLastTs = 0;
                return;
            }

            for (const [shared, list] of byShared) {
                if (!shared.ready || shared.failed || shared.warming) continue;
                if (!shared.player || !shared.player.sceneRenderer) continue;
                takeSpineRenderControl(shared.player);
                for (let i = 0; i < list.length; i++) {
                    const actor = list[i];
                    if (!spineActors.has(actor.sp)) continue;
                    try {
                        if (typeof actor.skeleton.update === "function") actor.skeleton.update(dt);
                        actor.state.update(dt);
                        actor.state.apply(actor.skeleton);
                        applyEarAlignToSkeleton(actor.skeleton, actor.def);
                        spineWorldUpdate(actor.skeleton);
                    } catch (_) { /* ignore */ }

                    // Expand path: freeze once Intro ends (first Idle frame).
                    // Pulse path: play one-shot Idle to completion, then freeze.
                    if (actor.freezeAfterIntro) {
                        const track = actor.state.getCurrent && actor.state.getCurrent(0);
                        const animName = track && track.animation && track.animation.name;
                        const introName = spineIntroName(actor.def);
                        if (!animName || animName !== introName) {
                            freezeSpineActorToIdle(shared, actor);
                            continue;
                        }
                    } else if (actor.pulseIdle) {
                        const track = actor.state.getCurrent && actor.state.getCurrent(0);
                        const minMs = 120;
                        const born = actor.pulseBornAt || 0;
                        const playedLongEnough = !born || (performance.now() - born) >= minMs;
                        let done = false;
                        if (playedLongEnough) {
                            if (!track) done = true;
                            else if (typeof track.isComplete === "function") done = track.isComplete();
                            else if (track.animationEnd != null) {
                                done = track.trackTime >= track.animationEnd - 0.0005;
                            }
                        }
                        if (done) {
                            freezeSpineActorToIdle(shared, actor);
                            continue;
                        }
                    }

                    if (renderSkeletonToShared(shared, actor.skeleton)) {
                        captureActorFrame(shared, actor, { fast: true });
                    }
                }
            }

            if (!spineActors.size) {
                spineAnimLastTs = 0;
                return;
            }
            spineAnimRaf = requestAnimationFrame(tick);
        };
        spineAnimRaf = requestAnimationFrame(tick);
    }

    function playActorExpression(actor, def, playIntro) {
        if (!actor || !actor.state || !def) return;
        const introName = spineIntroName(def);
        const idleName = spineIdleName(def);
        const freeze = spineFreezeAfterIntroEnabled();
        resetSkeletonAnim(actor.skeleton, actor.state, def);
        actor.pulseIdle = false;
        try {
            if (playIntro && introName) {
                actor.state.setAnimation(0, introName, false);
                // Queue Idle (non-looping) so freeze-after-intro can land on rest;
                // random Idle pulses keep faces alive afterward.
                actor.state.addAnimation(0, idleName, false, 0);
                actor.freezeAfterIntro = freeze;
            } else if (freeze) {
                actor.state.setAnimation(0, idleName, false);
                actor.freezeAfterIntro = false;
                actor.pulseIdle = true;
                actor.pulseBornAt = performance.now();
            } else {
                actor.state.setAnimation(0, idleName, true);
                actor.freezeAfterIntro = false;
            }
        } catch (err) {
            try { actor.state.setAnimation(0, idleName, !freeze); } catch (_) { /* ignore */ }
            actor.freezeAfterIntro = false;
            actor.pulseIdle = freeze;
            if (freeze) actor.pulseBornAt = performance.now();
        }
        poseActorSkeleton(actor, 0);
        actor.def = def;
    }

    /** One-shot Idle for the random “alive” pulse while mostly frozen. */
    function playActorIdlePulse(actor, def) {
        if (!actor || !actor.state || !def) return;
        const idleName = spineIdleName(def);
        // Do not clearTracks/setupPose here — that flashed a bind-pose frame.
        try {
            actor.state.setAnimation(0, idleName, false);
        } catch (_) { /* ignore */ }
        actor.freezeAfterIntro = false;
        actor.pulseIdle = true;
        actor.pulseBornAt = performance.now();
        actor.def = def;
        poseActorSkeleton(actor, 0);
    }

    function ensureSpineActor(shared, ch, sp, def) {
        if (!shared || !shared.skeletonData || !shared.stateData) return null;
        if (!window.spine || !spine.Skeleton || !spine.AnimationState) return null;
        let actor = spineActors.get(sp);
        if (!actor || actor.shared !== shared) {
            actor = {
                shared: shared,
                ch: ch,
                sp: sp,
                skeleton: new spine.Skeleton(shared.skeletonData),
                state: new spine.AnimationState(shared.stateData),
                def: def
            };
            spineActors.set(sp, actor);
        } else {
            actor.ch = ch;
            actor.sp = sp;
            actor.def = def;
        }
        return actor;
    }

    function ensureSpineHeadPlayer(b, def) {
        const ch = b && b._character;
        if (!ch || !isSpineHead(def)) return Promise.resolve(null);
        if (!spineApiAvailable()) {
            console.warn("[BlockCharacters] Spine player missing — using head fallback PNG.");
            return Promise.resolve(null);
        }
        const key = spineAssetKey(def);
        if (!ch.spine || ch.spine.assetKey !== key) {
            if (ch.spine) disposeSpineHead(ch);
            ch.spine = {
                assetKey: key,
                def: def,
                tex: null,
                procCanvas: null,
                procCtx: null,
                srcCanvas: null,
                ready: false,
                failed: false,
                wasExpanded: false,
                gen: 1,
                shared: true,
                hostCharacter: ch
            };
        } else {
            ch.spine.def = def;
            ch.spine.hostCharacter = ch;
        }
        return ensureSharedSpinePlayer(def).then((shared) => {
            if (!ch.spine || ch.spine.assetKey !== key) return null;
            if (!shared || shared.failed) {
                ch.spine.failed = true;
                return null;
            }
            ch.spine.failed = false;
            ensureSpineFrameSurfaces(ch, ch.spine);
            if (ch.spine.wasExpanded) applyIdleCacheToBlock(ch, ch.spine, def);
            return shared.player;
        });
    }

    /**
     * Start (or restart) Intro→Idle on this block's own skeleton instance.
     * Shows a warmed idle still immediately, then starts live Spine on the next
     * animation frame so expand/tap juice isn't stalled by GL + canvas setup.
     */
    function queueSpineCapture(b, def, opts) {
        const ch = b && b._character;
        const sp = ch && ch.spine;
        if (!sp || !def) return;
        const playIntro = !opts || opts.playIntro !== false;
        const key = spineAssetKey(def);
        sp.def = def;
        sp.assetKey = key;
        sp.hostCharacter = ch;
        sp.gen = (sp.gen || 0) + 1;
        const gen = sp.gen;
        // Instant face from warm cache — expand never waits on a blank/GL hitch.
        applyIdleCacheToBlock(ch, sp, def);
        ensureSharedSpinePlayer(def).then((shared) => {
            if (!shared || !ch.spine || ch.spine !== sp || sp.gen !== gen) return;
            if (!shared.skeletonData || !shared.stateData) {
                console.warn("[BlockCharacters] Spine skeleton data missing — cannot animate all faces.");
                return;
            }
            const startLive = () => {
                if (!shared || !ch.spine || ch.spine !== sp || sp.gen !== gen) return;
                // Shrunk (or detach) before deferred start — do not revive the actor.
                if (!sp.wasExpanded) return;
                if (!shared.ready || shared.failed) return;
                if (shared.warming) {
                    // First expand can race the splash warm — wait, then retry.
                    warmSharedIdles(shared, shared.expressions || (def && def.expressions), () => {
                        requestAnimationFrame(startLive);
                    });
                    return;
                }
                applyIdleCacheToBlock(ch, sp, def);
                const actor = ensureSpineActor(shared, ch, sp, def);
                if (!actor) return;
                playActorExpression(actor, def, playIntro);
                // fast:true — no getImageData/bleed on the kickoff frame (GPU tint covers pink).
                takeSpineRenderControl(shared.player);
                if (renderSkeletonToShared(shared, actor.skeleton)) {
                    captureActorFrame(shared, actor, { fast: true });
                }
                // If freezing with no Intro, one more RAF tick will stash idle + leave.
                ensureSpineAnimLoop();
            };
            // Yield past the expand/tap frame (and past any in-flight idle warm).
            requestAnimationFrame(() => {
                requestAnimationFrame(startLive);
            });
        });
    }

    function applySpineExpression(b, def, opts) {
        const ch = b && b._character;
        const sp = ch && ch.spine;
        if (!sp || !def) return false;
        sp.def = def;
        if (!sp.wasExpanded && !(opts && opts.force)) return true;
        queueSpineCapture(b, def, opts);
        return true;
    }

    function tickSpineHead(b, expanded) {
        const ch = b && b._character;
        const sp = ch && ch.spine;
        if (!sp || sp.failed) return;
        if (expanded && !sp.wasExpanded) {
            sp.wasExpanded = true;
            queueSpineCapture(b, sp.def || (ch.paths && ch.paths.head), { playIntro: true });
            return;
        }
        if (!expanded) {
            // Cancel deferred startLive + drop any live actor (expand→shrink race).
            if (sp.wasExpanded || spineActors.has(sp)) cancelPendingSpineStart(sp);
            sp.wasExpanded = false;
            return;
        }
        sp.wasExpanded = true;
    }

    /**
     * Copy Spine canvas → CanvasTexture (content scale/offset only).
     * Pink ear/nose tint runs on the GPU (see patchHeadFeatureMaterial) so the
     * live path never getImageData/putImageData — that was the Capacitor killer.
     */
    function bindSpineHeadTexture(ch, sp, opts) {
        if (!ch || !sp || !sp.srcCanvas || !window.THREE) return;
        const src = sp.srcCanvas;
        const w = Math.max(1, src.width | 0);
        const h = Math.max(1, src.height | 0);
        if (!sp.procCanvas) {
            sp.procCanvas = document.createElement("canvas");
            // No willReadFrequently — we no longer read pixels back on the live path.
            sp.procCtx = sp.procCanvas.getContext("2d");
        }
        if (sp.procCanvas.width !== w || sp.procCanvas.height !== h) {
            sp.procCanvas.width = w;
            sp.procCanvas.height = h;
        }
        if (!sp.tex) {
            sp.tex = canvasTexture(sp.procCanvas);
            if (ch.parts && ch.parts.head && ch.parts.head.material) {
                ch.parts.head.material.map = sp.tex;
                ch.parts.head.material.premultipliedAlpha = false;
                if (ch.parts.head.material.color) ch.parts.head.material.color.set(0xffffff);
                ch.parts.head.material.needsUpdate = true;
            }
        } else if (ch.parts && ch.parts.head && ch.parts.head.material &&
            ch.parts.head.material.map !== sp.tex) {
            ch.parts.head.material.map = sp.tex;
            ch.parts.head.material.needsUpdate = true;
        }
        if (ch.parts && ch.parts.head) {
            ch.parts.head.visible = true;
            enableHeadFeatureTint(ch.parts.head.material, ch.tintHex);
        }
        // Invalidate layout only when the head first gets a live texture — not every
        // streamed frame (that forced per-face layout work every RAF).
        if (!sp._layoutBound) {
            sp._layoutBound = true;
            ch.sig = null;
        }
        refreshSpineHeadTexture(ch, sp, opts);
    }

    function refreshSpineHeadTexture(ch, sp, opts) {
        if (!ch || !sp || !sp.srcCanvas || !sp.procCanvas || !sp.procCtx) return;
        const src = sp.srcCanvas;
        const w = sp.procCanvas.width;
        const h = sp.procCanvas.height;
        if (!w || !h) return;
        const ctx = sp.procCtx;
        const cfg = spineHeadCfg(sp && sp.def);
        const contentScale = Number(cfg.contentScale);
        const scale = Number.isFinite(contentScale) && contentScale > 0.1 ? contentScale : 1;
        const ox = Number(cfg.contentOffsetX) || 0;
        const oy = Number(cfg.contentOffsetY) || 0;
        const dw = w * scale;
        const dh = h * scale;
        const dx = (w - dw) / 2 + ox * w;
        const dy = (h - dh) / 2 + oy * h;
        ctx.clearRect(0, 0, w, h);
        try {
            ctx.drawImage(src, dx, dy, dw, dh);
        } catch (_) {
            return;
        }
        // Optional one-shot edge bleed for non-live captures (intro / warm).
        // Live RAF passes skip this — tint is GPU-side and bleed needs a readback.
        if (!(opts && opts.fast)) {
            try {
                const imageData = ctx.getImageData(0, 0, w, h);
                bleedOpaqueRgb(imageData.data, w, h, 2);
                ctx.putImageData(imageData, 0, 0);
            } catch (_) { /* tainted or unsupported — raw pixels are fine */ }
        }
        if (sp.tex) sp.tex.needsUpdate = true;
    }

    // ---- GPU pink-feature tint (Spine live path) ----
    // Mirrors applyHeadFeatureBlend in the fragment shader so streaming frames
    // only need drawImage + tex.needsUpdate.
    const HEAD_BLEND_MODE = { none: 0, normal: 0, lighten: 1, multiply: 2, additive: 3 };

    function patchHeadFeatureMaterial(mat) {
        if (!mat || mat.userData.headFeaturePatched || !window.THREE) return mat;
        const T = window.THREE;
        mat.userData.headFeaturePatched = true;
        const uniforms = {
            uBlockTint: { value: new T.Color(1, 1, 1) },
            uBlendMode: { value: 0 }
        };
        mat.userData.headFeatureUniforms = uniforms;
        const prevCompile = mat.onBeforeCompile;
        mat.onBeforeCompile = (shader) => {
            if (typeof prevCompile === "function") prevCompile(shader);
            shader.uniforms.uBlockTint = uniforms.uBlockTint;
            shader.uniforms.uBlendMode = uniforms.uBlendMode;
            shader.fragmentShader = shader.fragmentShader.replace(
                "uniform float opacity;",
                "uniform float opacity;\nuniform vec3 uBlockTint;\nuniform float uBlendMode;"
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                [
                    "#ifdef USE_MAP",
                    "	vec4 sampledDiffuseColor = texture2D( map, vUv );",
                    // Tint in authored/canvas space (matches CPU applyHeadFeatureBlend),
                    // then decode like the stock map_fragment.
                    "	if ( uBlendMode > 0.5 && sampledDiffuseColor.a >= 0.03125 ) {",
                    "		vec3 fc = sampledDiffuseColor.rgb;",
                    "		bool isFeature = fc.r >= 0.62745 && fc.g >= 0.47059 && fc.b >= 0.39216",
                    "			&& !( fc.r > 0.90196 && fc.g > 0.90196 && fc.b > 0.90196 )",
                    "			&& fc.r >= fc.g && fc.g >= ( fc.b - 0.09412 );",
                    "		if ( isFeature ) {",
                    "			if ( uBlendMode < 1.5 ) {",
                    "				sampledDiffuseColor.rgb = uBlockTint + ( vec3( 1.0 ) - uBlockTint ) * fc;",
                    "			} else if ( uBlendMode < 2.5 ) {",
                    "				sampledDiffuseColor.rgb = fc * uBlockTint;",
                    "			} else {",
                    "				sampledDiffuseColor.rgb = min( fc + uBlockTint, vec3( 1.0 ) );",
                    "			}",
                    "		}",
                    "	}",
                    "	sampledDiffuseColor = mapTexelToLinear( sampledDiffuseColor );",
                    "	diffuseColor *= sampledDiffuseColor;",
                    "#endif"
                ].join("\n")
            );
        };
        mat.customProgramCacheKey = () => "bcHeadFeatureTint1";
        return mat;
    }

    function enableHeadFeatureTint(mat, tintHex) {
        if (!mat) return;
        patchHeadFeatureMaterial(mat);
        const u = mat.userData.headFeatureUniforms;
        if (!u) return;
        const blend = readCfg().headFeatureBlend || "lighten";
        const mode = HEAD_BLEND_MODE[blend];
        u.uBlendMode.value = mode != null ? mode : HEAD_BLEND_MODE.lighten;
        if (tintHex) {
            const rgb = hexToRgb(tintHex);
            u.uBlockTint.value.setRGB(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        }
    }

    /** Static PNG heads bake tint in processToCanvas — disable the shader pass. */
    function disableHeadFeatureTint(mat) {
        if (!mat || !mat.userData.headFeatureUniforms) return;
        mat.userData.headFeatureUniforms.uBlendMode.value = 0;
    }

    function readCfg() {
        return (typeof window !== "undefined" && window.BLOCK_CHARACTERS_CFG) || {};
    }

    function catalog() {
        return (typeof window !== "undefined" && window.CHARACTER_CATALOG) || {};
    }

    function mergeCfg(target, src) {
        if (!src || typeof src !== "object") return target;
        for (const key of Object.keys(src)) {
            const v = src[key];
            if (v && typeof v === "object" && !Array.isArray(v) &&
                target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
                mergeCfg(target[key], v);
            } else {
                target[key] = v;
            }
        }
        return target;
    }

    function ensureShared() {
        const T = window.THREE;
        if (!T || shared) return shared;
        const planeGeo = new T.PlaneGeometry(1, 1);
        planeGeo.rotateX(-Math.PI / 2);
        shared = { planeGeo };
        return shared;
    }

    // ---- persistence (unlock / selected character) ----

    function storageKey() {
        return readCfg().storageKey || "stretchblock_block_characters";
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(storageKey());
            if (!raw) return { unlocked: DEFAULT_UNLOCKED.slice(), selected: null };
            const parsed = JSON.parse(raw);
            const unlocked = Array.isArray(parsed.unlocked) && parsed.unlocked.length
                ? parsed.unlocked.map(String)
                : DEFAULT_UNLOCKED.slice();
            return {
                unlocked,
                selected: parsed.selected != null ? String(parsed.selected) : null
            };
        } catch (e) {
            return { unlocked: DEFAULT_UNLOCKED.slice(), selected: null };
        }
    }

    function saveState(state) {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                unlocked: state.unlocked,
                selected: state.selected
            }));
        } catch (e) { /* ignore quota / private mode */ }
    }

    let persist = loadState();

    // ---- hashing / facing / expression ----

    function hashStr(s) {
        let h = 2166136261 >>> 0;
        const str = String(s == null ? "" : s);
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function blockColorKey(b) {
        // Runtime blocks store hex on b.color; level authoring uses palette names.
        // Prefer an explicit name if present, else the hex string.
        if (b.colorName) return String(b.colorName);
        return String(b.color || "");
    }

    function blockHash(b) {
        return hashStr(String(b.id) + "|" + blockColorKey(b));
    }

    /**
     * Facing: 1 = left (mirror), 0 = right (default).
     * Deterministic from block id + color.
     */
    function facingLeft(b) {
        const cfg = readCfg();
        const rightBit = cfg.facingRightBit === 1 ? 1 : 0;
        const bit = blockHash(b) & 1;
        return bit !== rightBit;
    }

    /**
     * perBlock expression deal: shuffle all head indices, hand each out once,
     * then reshuffle a fresh full set. Seeded from the level's blocks so rebuilds
     * of the same level stay stable. Call beginLevel() before attaching a set.
     * @type {{ seed: number, bags: Map<number, { bag: number[], round: number }> }}
     */
    let exprDeal = { seed: 1, bags: new Map() };

    function mulberry32(a) {
        return function () {
            let t = (a += 0x6D2B79F5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffleInPlace(arr, rand) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function getUnlockedCharacters() {
        const cat = catalog();
        const out = [];
        const seen = Object.create(null);
        for (const id of DEFAULT_UNLOCKED.concat(persist.unlocked)) {
            if (seen[id] || !cat[id]) continue;
            seen[id] = true;
            out.push(id);
        }
        return out;
    }

    /**
     * Unlocked characters that are safe to show in gameplay. Dino is excluded
     * until its Spine face assets ship (SP-1057 / SP-1044).
     */
    function characterAssetsReady(id) {
        if (!id) return false;
        if (id === "Dino" || (window.CharacterId && id === CharacterId.DINO)) return false;
        return !!catalog()[id];
    }

    function getPlayableUnlockedCharacters() {
        return getUnlockedCharacters().filter(characterAssetsReady);
    }

    /** When 2+ playable animals are unlocked, cycle them by level (SP-1057). */
    function rotateSelectedForLevel(levelNum) {
        const pool = getPlayableUnlockedCharacters();
        if (pool.length <= 1) return;
        const n = Math.max(1, levelNum | 0);
        const id = pool[(n - 1) % pool.length];
        if (!id || id === selectedCharacterId()) return;
        persist.selected = id;
        readCfg().selectedCharacterId = id;
        saveState(persist);
    }

    /**
     * Reset the expression deal for a new level. Pass the level's blocks so the
     * shuffle seed is deterministic for that set.
     */
    function beginLevel(blocks) {
        const levelNum = (typeof window !== "undefined" && (window.level | 0)) || 1;
        rotateSelectedForLevel(levelNum);
        let h = 2166136261 >>> 0;
        if (Array.isArray(blocks)) {
            for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (!b) continue;
                h ^= blockHash(b);
                h = Math.imul(h, 16777619) >>> 0;
                if (b._exprAssign) delete b._exprAssign;
            }
        }
        exprDeal = { seed: h || 1, bags: new Map() };
        // Drop idle snapshots so a hard refresh of the level re-captures with
        // the current pose-reset / slot-clear logic (avoids stale Happy→Chad).
        spineIdleCache.clear();
        for (const shared of sharedSpinePlayers.values()) {
            shared.warmed = false;
        }
        // Start Spine + idle-cache warm immediately at level boot (don't wait
        // until the first expand / texture attach finishes).
        preloadSelectedSpine();
    }

    function takeFromExprDeal(n) {
        // Build bag [0, 1, ..., n-1] — inclusive of the last expression (Chad = 6 when n = 7).
        let state = exprDeal.bags.get(n);
        if (!state || state.bag.length === 0) {
            const bag = [];
            for (let i = 0; i < n; i++) bag.push(i);
            const round = state ? state.round + 1 : 0;
            const rand = mulberry32(
                (exprDeal.seed ^
                    Math.imul(n + 1, 0x9E3779B1) ^
                    Math.imul(round + 1, 0x85EBCA6B)) >>> 0
            );
            shuffleInPlace(bag, rand);
            state = { bag, round };
            exprDeal.bags.set(n, state);
        }
        return state.bag.pop();
    }

    function pickExpressionIndex(b, headsLen) {
        const cfg = readCfg();
        const n = Math.max(1, headsLen | 0);
        if (cfg.expressionMode === "fixed") {
            const i = parseInt(cfg.expressionIndex, 10) || 0;
            return ((i % n) + n) % n;
        }
        // Sticky per block so texture reloads do not consume another deal slot.
        if (b && b._exprAssign && b._exprAssign.n === n) {
            return ((b._exprAssign.i % n) + n) % n;
        }
        const i = takeFromExprDeal(n);
        if (b) b._exprAssign = { n, i };
        return i;
    }

    // ---- palette name resolve (for colorVariants) ----

    function paletteNameForBlock(b) {
        if (b.colorName) return String(b.colorName);
        const pal = window.PALETTE;
        if (!pal || !b.color) return null;
        const hex = String(b.color).toLowerCase();
        for (const key of Object.keys(pal)) {
            if (String(pal[key]).toLowerCase() === hex) return key;
        }
        return null;
    }

    /**
     * Spine heads may author an expressions[] list (Intro/Idle animation pairs).
     * When present, that list is the deal bag — not one head entry per face PNG.
     */
    function spineExpressionsOf(head) {
        if (!isSpineHeadDef(head)) return null;
        const list = head.expressions;
        return (Array.isArray(list) && list.length) ? list : null;
    }

    /** Prefer def.idle; else first expressions[].idle (catalog heads omit top-level idle). */
    function spineIdleName(def, fallback) {
        if (def && def.idle) return def.idle;
        const exprs = spineExpressionsOf(def);
        if (exprs && exprs[0] && exprs[0].idle) return exprs[0].idle;
        return fallback || "IdleFace1";
    }

    function spineIntroName(def, fallback) {
        if (def && def.intro) return def.intro;
        const exprs = spineExpressionsOf(def);
        if (exprs && exprs[0] && exprs[0].intro) return exprs[0].intro;
        return fallback || "IntroFace1";
    }

    function blockShowsCharacterFace(b) {
        if (!b || b.locked) return false;
        // Faces only appear once the footprint is larger than 1×1 (or authored
        // pre-expanded). Defer expression deals until then so unexpanded 1×1s
        // don't consume Chad / unique faces while duplicates show on expanded ones.
        if (b.preExpanded) return true;
        return (b.w | 0) > 1 || (b.h | 0) > 1;
    }

    /**
     * Resolve asset paths for a character + block color + expression index.
     * @returns {{ head: string|object|null, mask: string|null, feet: string|null, tail: string|null, expressionIndex: number, expressionId: string|null }}
     */
    function resolveParts(characterId, blockColorOrBlock, expressionIndex) {
        const cat = catalog();
        const id = characterId || readCfg().selectedCharacterId || "Cat";
        const entry = cat[id];
        if (!entry) {
            return {
                head: null, mask: null, feet: null, tail: null,
                expressionIndex: 0, expressionId: null
            };
        }

        let block = null;
        let colorName = null;
        if (blockColorOrBlock && typeof blockColorOrBlock === "object") {
            block = blockColorOrBlock;
            colorName = paletteNameForBlock(block);
        } else if (typeof blockColorOrBlock === "string") {
            colorName = blockColorOrBlock;
        }

        const variant = (colorName && entry.colorVariants && entry.colorVariants[colorName])
            ? entry.colorVariants[colorName]
            : null;

        const heads = (variant && variant.heads && variant.heads.length) ? variant.heads : (entry.heads || []);
        const masks = (variant && variant.masks && variant.masks.length) ? variant.masks : (entry.masks || []);
        const feetArr = (variant && variant.feet && variant.feet.length) ? variant.feet : (entry.feet || []);
        const tails = (variant && variant.tails && variant.tails.length) ? variant.tails : (entry.tails || []);

        const primary = heads[0] || null;
        const exprs = spineExpressionsOf(primary);

        let expr = expressionIndex;
        if (exprs) {
            if (expr == null && block) {
                if (blockShowsCharacterFace(block)) {
                    expr = pickExpressionIndex(block, exprs.length);
                } else {
                    // Placeholder only — do not sticky-assign or consume the deal bag.
                    expr = 0;
                }
            }
            if (expr == null) expr = parseInt(readCfg().expressionIndex, 10) || 0;
            const n = exprs.length;
            expr = ((expr % n) + n) % n;
            const e = exprs[expr] || exprs[0];
            const head = {
                type: "spine",
                json: primary.json,
                atlas: primary.atlas,
                fallback: primary.fallback || null,
                intro: e.intro,
                idle: e.idle,
                expressionId: e.id || null,
                // Keep full list on every per-expression def so shared-player
                // warm never collapses to a single idle when this def is first.
                expressions: exprs,
                // Per-skeleton framing / ear align (Dog vs Cat).
                spineHead: primary.spineHead || null,
                viewport: primary.viewport || null
            };
            return {
                head,
                mask: e.mask || masks[0] || null,
                feet: feetArr[0] || null,
                tail: tails[0] || null,
                expressionIndex: expr,
                expressionId: e.id || null
            };
        }

        // Legacy: one catalog head entry per expression (PNG path or single-anim Spine).
        if (expr == null && block) {
            if (blockShowsCharacterFace(block)) {
                expr = pickExpressionIndex(block, heads.length || 1);
            } else {
                expr = 0;
            }
        }
        if (expr == null) expr = parseInt(readCfg().expressionIndex, 10) || 0;
        const n = Math.max(1, heads.length || 1);
        expr = ((expr % n) + n) % n;

        const head = heads[expr] || heads[0] || null;
        const mask = masks[expr] || masks[0] || null;
        const feet = feetArr[expr] || feetArr[0] || null;
        const tail = tails[expr] || tails[0] || null;
        const expressionId = isSpineHead(head)
            ? (head.expressionId || null)
            : (typeof head === "string" ? head : null);

        return { head, mask, feet, tail, expressionIndex: expr, expressionId };
    }

    // ---- image / texture processing ----

    function loadImage(path) {
        if (!path) return Promise.resolve(null);
        if (imageCache.has(path)) {
            const cached = imageCache.get(path);
            if (cached && cached.then) return cached;
            return Promise.resolve(cached);
        }
        const p = new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
                imageCache.set(path, img);
                resolve(img);
            };
            img.onerror = () => {
                imageCache.set(path, null);
                resolve(null);
            };
            img.src = path;
        });
        imageCache.set(path, p);
        return p;
    }

    function hexToRgb(hex) {
        let h = String(hex || "#ffffff").replace("#", "");
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        const n = parseInt(h, 16);
        if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    /** amt in [-1,1]: positive lightens, negative darkens (matches game-render shade). */
    function shadeHex(hex, amt) {
        const { r, g, b } = hexToRgb(hex);
        const t = amt < 0 ? 0 : 255;
        const p = Math.abs(amt);
        const mix = (c) => Math.round(c + (t - c) * p);
        const rr = mix(r).toString(16).padStart(2, "0");
        const gg = mix(g).toString(16).padStart(2, "0");
        const bb = mix(b).toString(16).padStart(2, "0");
        return "#" + rr + gg + bb;
    }

    /**
     * Copy opaque RGB into neighbouring transparent texels (alpha stays 0).
     * Stops filtered samples from picking (0,0,0) at sprite edges — that was
     * the fragmented black pixel outline around ears.
     */
    function bleedOpaqueRgb(d, w, h, passes) {
        const n = Math.max(1, passes | 0);
        const src = new Uint8ClampedArray(d);
        for (let pass = 0; pass < n; pass++) {
            if (pass > 0) src.set(d);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    if (src[i + 3] >= 8) continue;
                    let r = 0, g = 0, b = 0, c = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (!dx && !dy) continue;
                            const xx = x + dx, yy = y + dy;
                            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                            const j = (yy * w + xx) * 4;
                            if (src[j + 3] < 8) continue;
                            r += src[j]; g += src[j + 1]; b += src[j + 2]; c++;
                        }
                    }
                    if (!c) continue;
                    d[i] = Math.round(r / c);
                    d[i + 1] = Math.round(g / c);
                    d[i + 2] = Math.round(b / c);
                    // alpha stays 0 — only RGB padding for the filter kernel
                }
            }
        }
    }

    /** Expand opaque alpha by 1px so soft mask edges fully sit under the head art. */
    function dilateAlpha(d, w, h) {
        const srcA = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) srcA[p] = d[i + 3];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const p = y * w + x;
                if (srcA[p] >= 8) continue;
                let maxA = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                        const a = srcA[yy * w + xx];
                        if (a > maxA) maxA = a;
                    }
                }
                if (maxA < 8) continue;
                const i = p * 4;
                d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
                d[i + 3] = maxA;
            }
        }
    }

    /**
     * Light warm pink (inner ears / nose). Skip dark strokes and white sparkles.
     */
    function isHeadFeatureTintTarget(r, g, b) {
        if (r < 160 || g < 120 || b < 100) return false;
        if (r > 230 && g > 230 && b > 230) return false;
        return r >= g && g >= b - 24;
    }

    /**
     * Mix authored pink ear/nose pixels with the block colour so they still
     * read on bright slabs (e.g. yellow). Eyes / sparkles untouched.
     * "lighten" = lift block toward white by the pink (inner ear highlight).
     */
    function applyHeadFeatureBlend(d, tintHex, mode) {
        if (!mode || mode === "none" || mode === "normal") return;
        if (!tintHex) return;
        const { r: br, g: bg, b: bb } = hexToRgb(tintHex);
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 8) continue;
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (!isHeadFeatureTintTarget(r, g, b)) continue;
            if (mode === "lighten") {
                // out = block + (white - block) * (feature / 255)
                d[i] = Math.round(br + (255 - br) * (r / 255));
                d[i + 1] = Math.round(bg + (255 - bg) * (g / 255));
                d[i + 2] = Math.round(bb + (255 - bb) * (b / 255));
            } else if (mode === "multiply") {
                d[i] = Math.round((r * br) / 255);
                d[i + 1] = Math.round((g * bg) / 255);
                d[i + 2] = Math.round((b * bb) / 255);
            } else if (mode === "additive") {
                d[i] = Math.min(255, r + br);
                d[i + 1] = Math.min(255, g + bg);
                d[i + 2] = Math.min(255, b + bb);
            }
        }
    }

    /**
     * @param {"mask"|"feet"|"raw"} mode
     * mask: luminance → alpha, RGB white (tint via lit material.color = block colour)
     * feet: keep alpha, replace RGB with white (tint via material.color)
     * raw: copy as-is (head), then optionally multiply/add pink features with tintHex
     */
    function processToCanvas(img, mode, tintHex) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const cvs = document.createElement("canvas");
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        if (mode === "mask") {
            for (let i = 0; i < d.length; i += 4) {
                const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
                const aIn = d[i + 3] / 255;
                let a = Math.round((lum / 255) * aIn * 255);
                // Drop dusty low-alpha fringe (reads as speckled black when filtered)
                if (a < 24) a = 0;
                d[i] = 255;
                d[i + 1] = 255;
                d[i + 2] = 255;
                d[i + 3] = a;
            }
            dilateAlpha(d, w, h);
        } else if (mode === "feet") {
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 2) continue;
                d[i] = 255;
                d[i + 1] = 255;
                d[i + 2] = 255;
            }
        } else if (mode === "raw") {
            // Keep authored pixels (incl. near-black chin stroke); tint pink features.
            const blend = readCfg().headFeatureBlend || "lighten";
            applyHeadFeatureBlend(d, tintHex, blend);
        }

        bleedOpaqueRgb(d, w, h, mode === "mask" ? 2 : 2);
        ctx.putImageData(imageData, 0, 0);
        return cvs;
    }

    function canvasTexture(cvs) {
        const T = window.THREE;
        const tex = new T.CanvasTexture(cvs);
        if ("encoding" in tex && T.sRGBEncoding != null) tex.encoding = T.sRGBEncoding;
        if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = (window.CS3D && CS3D.renderer)
            ? CS3D.renderer.capabilities.getMaxAnisotropy()
            : 1;
        // No mipmaps + straight alpha with RGB edge bleed (see bleedOpaqueRgb).
        tex.generateMipmaps = false;
        tex.minFilter = T.LinearFilter;
        tex.magFilter = T.LinearFilter;
        tex.premultiplyAlpha = false;
        tex.needsUpdate = true;
        return tex;
    }

    function getProcessedTexture(path, mode, tintHex) {
        const blend = (mode === "raw")
            ? (readCfg().headFeatureBlend || "lighten")
            : "";
        // v4: pink ear/nose blended with block colour (headFeatureBlend)
        const key = path + "|v4|" + mode + "|" + (tintHex || "") + "|" + blend;
        if (processedCache.has(key)) return Promise.resolve(processedCache.get(key));
        return loadImage(path).then((img) => {
            if (!img) return null;
            if (processedCache.has(key)) return processedCache.get(key);
            const cvs = processToCanvas(img, mode, tintHex);
            const tex = canvasTexture(cvs);
            processedCache.set(key, tex);
            return tex;
        });
    }

    // ---- placement rules ----

    /**
     * Compute which parts show and their cell coords (col/row within block,
     * col 0 = left, row 0 = top).
     * @returns {null | {
     *   head: {col,row}|null, feet: {col,row}|null,
     *   feetUnderHead: {col,row}|null, tail: {col,row}|null,
     *   mirror: boolean, kind: string
     * }}
     */
    function layoutForSize(w, h, preferLeft) {
        w = w | 0;
        h = h | 0;
        if (w < 1 || h < 1 || (w === 1 && h === 1)) return null;

        // 1-wide vertical strip — head + bottom feet (no tail).
        // At 1×3+, also place a second paw pair in the cell under the head.
        if (w === 1 && h >= 2) {
            return {
                kind: "vertical",
                head: { col: 0, row: 0 },
                feet: { col: 0, row: h - 1 },
                feetUnderHead: h >= 3 ? { col: 0, row: 1 } : null,
                tail: null,
                mirror: false
            };
        }

        // 1-tall horizontal strip — head on one end, tail on the opposite end (no feet)
        if (h === 1 && w >= 2) {
            const headCol = preferLeft ? 0 : w - 1;
            const tailCol = preferLeft ? w - 1 : 0;
            return {
                kind: "horizontal",
                head: { col: headCol, row: 0 },
                feet: null,
                feetUnderHead: null,
                tail: { col: tailCol, row: 0 },
                mirror: preferLeft
            };
        }

        // Large: both dimensions ≥ 2
        if (w >= 2 && h >= 2) {
            const headCol = preferLeft ? 0 : w - 1;
            const feetCol = headCol;
            const tailCol = preferLeft ? w - 1 : 0;
            return {
                kind: "large",
                head: { col: headCol, row: 0 },
                feet: { col: feetCol, row: h - 1 },
                feetUnderHead: null,
                tail: { col: tailCol, row: h - 1 },
                mirror: preferLeft
            };
        }

        return null;
    }

    // ---- mesh helpers ----

    function blockHex(b) {
        // Use the authored/runtime sRGB hex on the block — NOT _baseColor.
        // Soft-3D stores linear-converted colour on the mesh material, and
        // getHexString() of that reads much darker than the visible slab.
        if (b.color != null && String(b.color).charAt(0) === "#") {
            return String(b.color);
        }
        if (b.color != null && window.PALETTE && window.PALETTE[b.color]) {
            return String(window.PALETTE[b.color]);
        }
        return String(b.color || "#ffffff");
    }

    /** Linear THREE.Color matching Soft-3D block albedo (same as cs3dColor). */
    function toLinearColor(hex) {
        const T = window.THREE;
        if (typeof window.cs3dColor === "function") {
            return window.cs3dColor(hex).clone();
        }
        const col = new T.Color(hex);
        return col.convertSRGBToLinear ? col.convertSRGBToLinear() : col;
    }

    /**
     * Apply slab-matching surface colour to a lit character part (mask/feet/tail).
     * Uses the same linear albedo + emissive glow as Soft-3D blocks so the
     * tint reads like the lit top face, not a flat unlit hex.
     */
    function applyBlockSurfaceColor(mesh, hex) {
        if (!mesh || !mesh.material) return;
        const col = toLinearColor(hex);
        mesh.material.color.copy(col);
        if (mesh.material.emissive) {
            const glow = (window.CS3D_CFG && CS3D_CFG.BLOCK_EMISSIVE != null)
                ? CS3D_CFG.BLOCK_EMISSIVE
                : 0.13;
            mesh.material.emissive.copy(col).multiplyScalar(glow);
            mesh.material.emissiveIntensity = 1;
        }
        if (window.CS3D_CFG) {
            if (mesh.material.roughness != null) {
                mesh.material.roughness = CS3D_CFG.BLOCK_ROUGHNESS;
            }
            if (mesh.material.metalness != null) {
                mesh.material.metalness = CS3D_CFG.BLOCK_METALNESS;
            }
        }
        mesh.material.needsUpdate = true;
    }

    /**
     * Coloured-slab inset for preExpanded (rigid) crates only (1 = no extra inset).
     * Normal expandable blocks are unaffected.
     */
    function interiorScaleFor(b) {
        const cfg = readCfg();
        if (cfg.enabled === false) return 1;
        if (!b || !b.preExpanded) return 1;
        if (((b.w | 0) <= 1) && ((b.h | 0) <= 1)) return 1;
        const s = Number(cfg.blockInteriorScale);
        if (!Number.isFinite(s) || s <= 0.05) return 1;
        return Math.min(1, s);
    }

    function isEarPart(name) {
        return name === "mask" || name === "head";
    }

    function makePartMesh(name) {
        const T = window.THREE;
        const { planeGeo } = ensureShared();
        const lit = (name === "mask" || name === "feet" || name === "feetUnderHead" || name === "tail");
        const ear = isEarPart(name);
        let mat;
        if (lit) {
            // Lit like the slab so mask/feet/tail match the top-face appearance.
            mat = new T.MeshStandardMaterial({
                map: null,
                color: 0xffffff,
                roughness: (window.CS3D_CFG && CS3D_CFG.BLOCK_ROUGHNESS) || 0.16,
                metalness: (window.CS3D_CFG && CS3D_CFG.BLOCK_METALNESS) || 0,
                emissive: new T.Color(0x000000),
                emissiveIntensity: 1,
                transparent: true,
                depthWrite: false,
                // Ears must paint over neighbouring slabs / feet; skip depth test.
                depthTest: !ear,
                premultipliedAlpha: false
            });
        } else {
            mat = new T.MeshBasicMaterial({
                map: null,
                transparent: true,
                depthWrite: false,
                depthTest: !ear,
                opacity: 1,
                toneMapped: false,
                premultipliedAlpha: false
            });
            // Head only: pink ear/nose tint runs in the fragment shader so live
            // Spine frames never need getImageData.
            if (name === "head") patchHeadFeatureMaterial(mat);
        }
        const mesh = new T.Mesh(planeGeo, mat);
        mesh.name = "bc_" + name;
        mesh.raycast = () => {};
        mesh.visible = false;
        const cfg = readCfg();
        if (ear) {
            const earOrder = cfg.earRenderOrder != null ? cfg.earRenderOrder : 28;
            // Mask under head within the ear stack
            mesh.renderOrder = name === "mask" ? earOrder : earOrder + 1;
        } else {
            mesh.renderOrder = cfg.renderOrder != null ? cfg.renderOrder : 3;
        }
        return mesh;
    }

    function disposePartMaterial(mesh) {
        if (!mesh || !mesh.material) return;
        // Textures live in processedCache — clear the ref so board teardown
        // never disposes a shared map if a part is somehow still parented.
        mesh.material.map = null;
        mesh.material.dispose();
        mesh.material = null;
    }

    function detach(b) {
        if (!b || !b._character) return;
        const ch = b._character;
        disposeSpineHead(ch);
        if (ch.group) {
            if (ch.group.parent) ch.group.parent.remove(ch.group);
            for (const name of PARTS) {
                const part = ch.parts[name];
                disposePartMaterial(part);
                if (part && part.parent) part.parent.remove(part);
            }
        }
        b._character = null;
    }

    /**
     * Cell centre in block-local space (geometry units).
     * X: left → right, Z: top → bottom (top = negative Z).
     */
    function cellLocal(col, row, w, h, geoW, geoH) {
        const cw = geoW / Math.max(1, w);
        const ch = geoH / Math.max(1, h);
        return {
            x: (col + 0.5 - w / 2) * cw,
            z: (row + 0.5 - h / 2) * ch,
            cw,
            ch
        };
    }

    function applyPartTransform(mesh, cell, partName, mirror, meshScaleX, meshScaleZ, geoW, geoH, w, h) {
        const cfg = readCfg();
        const offsets = partOffsetsForSelected();
        // feetUnderHead falls back to feet offsets when not authored separately
        const off = offsets[partName]
            || (partName === "feetUnderHead" ? offsets.feet : null)
            || { offsetX: 0, offsetY: 0, scale: 1 };
        const yLift = cfg.yLift != null ? cfg.yLift : 0.014;
        const earYLift = cfg.earYLift != null ? cfg.earYLift : 0.02;
        // Keep mask under head by a hair so overlapping ear edges don't z-fight.
        // Ears get extra lift so overhang clears the slab rim / neighbours.
        const partLift = (partName === "mask") ? earYLift
            : (partName === "head") ? earYLift + 0.002
            : 0.0015;
        const blockH = (window.CS3D_CFG && CS3D_CFG.BLOCK_H) || 0.62;

        const cw = geoW / Math.max(1, w);
        const ch = geoH / Math.max(1, h);
        // offsetY positive → toward top of board → −Z
        const lx = cell.x + (off.offsetX || 0) * cw;
        const lz = cell.z - (off.offsetY || 0) * ch;

        mesh.position.set(lx, blockH / 2 + yLift + partLift, lz);

        // Keep sprites visually square despite jelly non-uniform parent scale.
        const s = off.scale != null ? off.scale : 1;
        const worldTarget = Math.min(cw, ch) * s;
        const invX = 1 / Math.max(1e-6, meshScaleX);
        const invZ = 1 / Math.max(1e-6, meshScaleZ);
        const sx = worldTarget * invX * (mirror ? -1 : 1);
        const sz = worldTarget * invZ;
        mesh.scale.set(sx, 1, sz);
        mesh.visible = true;
    }

    /** Global offsets merged with optional CHARACTER_CATALOG[id].offsets. */
    function partOffsetsForSelected() {
        const base = readCfg().offsets || {};
        const entry = catalog()[selectedCharacterId()];
        const over = entry && entry.offsets && typeof entry.offsets === "object" ? entry.offsets : null;
        if (!over) return base;
        const out = Object.assign({}, base);
        for (const key of Object.keys(over)) {
            const part = over[key];
            if (!part || typeof part !== "object") continue;
            out[key] = Object.assign({}, base[key] || {}, part);
        }
        return out;
    }

    function hidePart(mesh) {
        if (mesh) mesh.visible = false;
    }

    // ---- public attach / update / detach ----

    function selectedCharacterId() {
        const cfg = readCfg();
        if (persist.selected && catalog()[persist.selected]) return persist.selected;
        return cfg.selectedCharacterId || "Cat";
    }

    function attach(b) {
        if (!b || !b._mesh || !window.THREE) return;
        // Locked (static) blocks use a stone material instead of character art.
        if (b.locked) return;
        const cfg = readCfg();
        if (cfg.enabled === false) return;
        if (b._character) detach(b);

        ensureShared();
        const T = window.THREE;
        const group = new T.Group();
        group.name = "blockCharacter";
        const parts = {};
        for (const name of PARTS) {
            const m = makePartMesh(name);
            group.add(m);
            parts[name] = m;
        }
        b._mesh.add(group);
        b._character = {
            group,
            parts,
            sig: null,
            tintHex: null,
            paths: null,
            ready: false
        };
        loadTexturesForBlock(b);
    }

    /**
     * Swap only the ear-mask texture (used when Spine expression changes but the
     * skeleton asset stays the same — e.g. Dog Happy Droop → Angry Flop).
     */
    function applyMaskTexture(ch, maskPath, hex) {
        if (!ch || !ch.parts || !ch.parts.mask) return Promise.resolve(null);
        if (!maskPath) {
            ch.parts.mask.material.map = null;
            ch.parts.mask.material.needsUpdate = true;
            return Promise.resolve(null);
        }
        return getProcessedTexture(maskPath, "mask", "").then((maskTex) => {
            if (!ch.parts || !ch.parts.mask) return null;
            ch.parts.mask.material.map = maskTex;
            ch.parts.mask.material.needsUpdate = true;
            applyBlockSurfaceColor(ch.parts.mask, hex || ch.tintHex || "#ffffff");
            return maskTex;
        });
    }

    function loadTexturesForBlock(b) {
        const ch = b._character;
        if (!ch) return;
        const charId = selectedCharacterId();
        const parts = resolveParts(charId, b);
        const hex = blockHex(b);
        const feetShade = readCfg().feetTintShade != null ? readCfg().feetTintShade : -0.18;
        const feetHex = shadeHex(hex, feetShade);

        disposeSpineHead(ch);
        ch.paths = parts;
        ch.tintHex = hex;
        ch.ready = false;

        const spineHead = isSpineHead(parts.head);
        // Never stamp the Spine atlas sheet onto the head mesh — it flashes as a
        // raw sprite sheet until the first capture. Spine heads stay blank until
        // the shared player snapshots an expression frame.
        const headPath = spineHead ? null : headStaticPath(parts.head);
        const jobs = [
            // Mask: white+alpha only; colour comes from lit material (matches slab top).
            parts.mask ? getProcessedTexture(parts.mask, "mask", "") : Promise.resolve(null),
            // Head: pink ears/nose optionally × block colour (see headFeatureBlend).
            headPath ? getProcessedTexture(headPath, "raw", hex) : Promise.resolve(null),
            parts.feet ? getProcessedTexture(parts.feet, "feet", "") : Promise.resolve(null),
            // Tail art is a black+alpha silhouette (same as feet) — tint with block color.
            parts.tail ? getProcessedTexture(parts.tail, "feet", "") : Promise.resolve(null)
        ];

        Promise.all(jobs).then(([maskTex, headTex, feetTex, tailTex]) => {
            if (!b._character || b._character !== ch) return;
            const assignMap = (mesh, tex) => {
                if (!mesh) return;
                mesh.material.map = tex;
                mesh.material.needsUpdate = true;
            };
            assignMap(ch.parts.mask, maskTex);
            assignMap(ch.parts.head, spineHead ? null : headTex);
            assignMap(ch.parts.feet, feetTex);
            assignMap(ch.parts.feetUnderHead, feetTex);
            assignMap(ch.parts.tail, tailTex);

            applyBlockSurfaceColor(ch.parts.mask, hex);
            if (ch.parts.head && ch.parts.head.material.color) {
                ch.parts.head.material.color.set(0xffffff);
            }
            // Static PNG heads already bake pink×block in processToCanvas.
            // Spine heads tint on the GPU — enable that path only for them.
            if (ch.parts.head) {
                if (spineHead) enableHeadFeatureTint(ch.parts.head.material, hex);
                else disableHeadFeatureTint(ch.parts.head.material);
            }
            if (spineHead && ch.parts.head) ch.parts.head.visible = false;
            applyBlockSurfaceColor(ch.parts.feet, feetHex);
            applyBlockSurfaceColor(ch.parts.feetUnderHead, feetHex);
            applyBlockSurfaceColor(ch.parts.tail, feetHex);
            ch.ready = true;
            ch.sig = null; // force layout refresh

            if (spineHead) {
                ensureSpineHeadPlayer(b, parts.head);
            }
        });
    }

    function update(b) {
        const ch = b && b._character;
        if (!ch || !ch.group) return;
        const cfg = readCfg();
        if (cfg.enabled === false) {
            ch.group.visible = false;
            return;
        }

        const w = b.w | 0;
        const h = b.h | 0;
        const preferLeft = facingLeft(b);
        const layout = layoutForSize(w, h, preferLeft);

        if (!layout || !ch.ready) {
            ch.group.visible = false;
            tickSpineHead(b, false);
            return;
        }
        ch.group.visible = true;

        const hex = blockHex(b);

        // First time this block shows a face: consume a deal-bag expression now
        // (1×1 placeholders must not have taken Chad / uniques earlier).
        if (!b._exprAssign && blockShowsCharacterFace(b)) {
            const prevMask = ch.paths && ch.paths.mask;
            const parts = resolveParts(selectedCharacterId(), b);
            ch.paths = parts;
            ch.sig = null;
            if (parts.mask && parts.mask !== prevMask) {
                applyMaskTexture(ch, parts.mask, ch.tintHex || hex);
            }
            if (isSpineHead(parts.head)) {
                if (ch.spine) {
                    ch.spine.def = parts.head;
                    ch.spine.wasExpanded = false; // play Intro for the real deal
                    applyIdleCacheToBlock(ch, ch.spine, parts.head);
                } else {
                    ensureSpineHeadPlayer(b, parts.head);
                }
            }
        }

        const geoW = b._geoW || Math.max(0.04, w);
        const geoH = b._geoH || Math.max(0.04, h);
        // Match the coloured fill inset on rigid crates (blockInteriorScale).
        const fillScale = interiorScaleFor(b);
        const fillW = geoW * fillScale;
        const fillH = geoH * fillScale;
        const mesh = b._mesh;
        const msx = mesh ? mesh.scale.x : 1;
        const msz = mesh ? mesh.scale.z : 1;

        // If block tint changed (unusual), reload mask/feet.
        if (ch.tintHex && ch.tintHex !== hex) {
            loadTexturesForBlock(b);
            return;
        }

        const paths = ch.paths || resolveParts(selectedCharacterId(), b);
        const sig = [w, h, preferLeft ? 1 : 0, paths.expressionIndex,
            fillW.toFixed(3), fillH.toFixed(3), fillScale.toFixed(3),
            msx.toFixed(3), msz.toFixed(3)].join("|");

        // Always refresh transforms (jelly scale changes every frame).
        const place = (partName, cell, path, allowMirror) => {
            const meshPart = ch.parts[partName];
            if (!meshPart) return;
            if (!cell || !path) {
                hidePart(meshPart);
                return;
            }
            const c = cellLocal(cell.col, cell.row, w, h, fillW, fillH);
            applyPartTransform(
                meshPart, c, partName,
                !!(allowMirror && layout.mirror),
                msx, msz, fillW, fillH, w, h
            );
        };

        // Mask shares head cell + mirror exactly.
        place("mask", layout.head, paths.mask, true);
        // Spine heads: show only after a captured expression frame (avoid atlas flash).
        const spineHead = isSpineHead(paths.head);
        const spineReady = !!(spineHead && ch.spine && ch.spine.ready && ch.spine.tex);
        place(
            "head",
            layout.head,
            spineHead ? (spineReady ? "__spine__" : null) : headStaticPath(paths.head),
            true
        );
        place("feet", layout.feet, paths.feet, false);
        place("feetUnderHead", layout.feetUnderHead, paths.feet, false);
        // Tail only when asset path exists (layouts still supply a cell when used).
        place("tail", layout.tail, paths.tail, true);

        tickSpineHead(b, true);

        ch.sig = sig;
    }

    // ---- API ----

    function init(overrides) {
        if (overrides && typeof overrides === "object") {
            mergeCfg(window.BLOCK_CHARACTERS_CFG || (window.BLOCK_CHARACTERS_CFG = {}), overrides);
        }
        persist = loadState();
        // Drop stale selections / unlocks for characters removed from the catalog
        // (e.g. old Animal1 saves) so gameplay stays on Cat.
        const cat = catalog();
        persist.unlocked = (persist.unlocked || []).filter((id) =>
            DEFAULT_UNLOCKED.indexOf(id) !== -1 || !!cat[id]
        );
        if (persist.selected && !cat[persist.selected]) {
            persist.selected = null;
            saveState(persist);
        }
        if (persist.selected && cat[persist.selected]) {
            readCfg().selectedCharacterId = persist.selected;
        } else {
            readCfg().selectedCharacterId = DEFAULT_UNLOCKED[0] || "Cat";
        }
        // Warm Spine as soon as the module boots so the first expand isn't cold.
        preloadSelectedSpine();
        return api;
    }

    function getSelectedCharacter() {
        return selectedCharacterId();
    }

    function setSelectedCharacter(characterId, opts) {
        const id = String(characterId || "");
        if (!catalog()[id]) return false;
        if (opts && opts.unlock) UnlockCharacter(id);
        if (!HasUnlockedCharacter(id)) return false;
        const prev = selectedCharacterId();
        persist.selected = id;
        readCfg().selectedCharacterId = id;
        saveState(persist);

        const list = (opts && Array.isArray(opts.blocks)) ? opts.blocks : null;
        if (list && id !== prev) {
            for (let i = 0; i < list.length; i++) {
                const b = list[i];
                if (!b) continue;
                // New character → new expression bag / mask set.
                delete b._exprAssign;
                if (b._character) loadTexturesForBlock(b);
            }
        }
        if (id !== prev) preloadSelectedSpine();
        return true;
    }

    function setExpressionMode(mode) {
        if (mode === "fixed" || mode === "perBlock") {
            readCfg().expressionMode = mode;
        }
    }

    function setExpressionIndex(i) {
        readCfg().expressionIndex = parseInt(i, 10) || 0;
    }

    function getUseSpine() {
        return spinePlaybackEnabled();
    }

    /**
     * Enable/disable live Spine head playback. When off, heads use the static
     * fallback PNG and all Spine WebGL players are disposed — useful for
     * Capacitor perf A/B. Pass { blocks } to refresh attached overlays now.
     */
    function setUseSpine(enabled, opts) {
        const on = !!enabled;
        const cfg = readCfg();
        const wasOn = cfg.useSpine !== false;
        cfg.useSpine = on;
        if (!on) disposeAllSharedSpinePlayers();

        const list = (opts && Array.isArray(opts.blocks)) ? opts.blocks : null;
        if (list) {
            for (let i = 0; i < list.length; i++) {
                const b = list[i];
                if (b && b._character) loadTexturesForBlock(b);
            }
        }
        if (on && !wasOn) preloadSelectedSpine();
        return on;
    }

    /**
     * Heads array (with colorVariants) for the selected character + block.
     */
    function headsForBlock(b) {
        const charId = selectedCharacterId();
        const entry = catalog()[charId];
        if (!entry) return [];
        const colorName = b ? paletteNameForBlock(b) : null;
        const variant = (colorName && entry.colorVariants && entry.colorVariants[colorName])
            ? entry.colorVariants[colorName]
            : null;
        return (variant && variant.heads && variant.heads.length)
            ? variant.heads
            : (entry.heads || []);
    }

    function expressionCountForHeads(heads) {
        if (!heads || !heads.length) return 1;
        const exprs = spineExpressionsOf(heads[0]);
        if (exprs) return exprs.length;
        return Math.max(1, heads.length);
    }

    /** Expression ids (or fallback labels) for the selected character. */
    function listExpressions(b) {
        const heads = headsForBlock(b || null);
        if (!heads.length) return [];
        const exprs = spineExpressionsOf(heads[0]);
        if (exprs) {
            return exprs.map((e, i) => ({
                index: i,
                id: e.id || ("expr" + i),
                intro: e.intro || null,
                idle: e.idle || null
            }));
        }
        return heads.map((h, i) => ({
            index: i,
            id: isSpineHead(h)
                ? (h.expressionId || ("spine" + i))
                : (typeof h === "string" ? h.split("/").pop() : ("head" + i)),
            intro: isSpineHead(h) ? (h.intro || null) : null,
            idle: isSpineHead(h) ? (h.idle || null) : null
        }));
    }

    /**
     * Force a specific expression on one block. Same Spine skeleton → switch
     * Intro/Idle animations in place; otherwise reload textures.
     */
    function setBlockExpression(b, expressionIndex, opts) {
        if (!b) return false;
        const heads = headsForBlock(b);
        const n = expressionCountForHeads(heads);
        let i = parseInt(expressionIndex, 10);
        if (!Number.isFinite(i)) return false;
        i = ((i % n) + n) % n;
        b._exprAssign = { n, i };
        if (!b._character) return true;

        const parts = resolveParts(selectedCharacterId(), b, i);
        const ch = b._character;
        const prev = ch.paths;
        const sameSpine = isSpineHead(parts.head) && prev && isSpineHead(prev.head) &&
            parts.head.json === prev.head.json &&
            ch.spine && !ch.spine.failed;

        if (sameSpine) {
            const prevMask = prev && prev.mask;
            ch.paths = parts;
            ch.sig = null;
            if (parts.mask !== prevMask) {
                applyMaskTexture(ch, parts.mask, ch.tintHex || blockHex(b));
            }
            // Debug / forced swaps should play even if the block hasn't expanded yet.
            if (opts && opts.force && ch.spine) ch.spine.wasExpanded = true;
            applySpineExpression(b, parts.head, opts);
            return true;
        }

        loadTexturesForBlock(b);
        return true;
    }

    /**
     * Set the same expression on every live block that has a character.
     * Pass opts.blocks (level block array); falls back to global `blocks` if present.
     * Returns { index, id, count, total } or null.
     */
    function setAllBlockExpressions(expressionIndex, opts) {
        const list = listExpressions(null);
        if (!list.length) return null;
        let i = parseInt(expressionIndex, 10);
        if (!Number.isFinite(i)) i = 0;
        i = ((i % list.length) + list.length) % list.length;
        const o = Object.assign({ playIntro: true, force: true }, opts || {});
        const board = Array.isArray(o.blocks) ? o.blocks
            : ((typeof blocks !== "undefined" && Array.isArray(blocks)) ? blocks : []);
        delete o.blocks;
        let count = 0;
        for (let b = 0; b < board.length; b++) {
            const block = board[b];
            if (!block || block.locked) continue;
            if (!block._character) continue;
            if (setBlockExpression(block, i, o)) count++;
        }
        return { index: i, id: list[i].id, count: count, total: list.length };
    }

    /**
     * Pick the first expression whose id / intro / idle / path contains `match`.
     * Returns the index, or -1 if none matched.
     */
    function findExpressionIndex(b, match) {
        const needle = String(match || "");
        if (!needle) return -1;
        const heads = headsForBlock(b);
        const exprs = heads.length ? spineExpressionsOf(heads[0]) : null;
        if (exprs) {
            for (let i = 0; i < exprs.length; i++) {
                const e = exprs[i] || {};
                if (String(e.id || "").indexOf(needle) !== -1) return i;
                if (String(e.intro || "").indexOf(needle) !== -1) return i;
                if (String(e.idle || "").indexOf(needle) !== -1) return i;
            }
            return -1;
        }
        for (let i = 0; i < heads.length; i++) {
            const path = headStaticPath(heads[i]) ||
                (isSpineHead(heads[i]) ? String(heads[i].json || "") : "");
            if (path.indexOf(needle) !== -1) return i;
            if (isSpineHead(heads[i])) {
                const h = heads[i];
                if (String(h.expressionId || "").indexOf(needle) !== -1) return i;
                if (String(h.intro || "").indexOf(needle) !== -1) return i;
                if (String(h.idle || "").indexOf(needle) !== -1) return i;
            }
        }
        return -1;
    }

    /**
     * Switch a block to a happy (or otherwise matched) face expression.
     * Prefer `index` when >= 0; otherwise search expressions for `match`.
     */
    function setBlockHappyFace(b, opts) {
        if (!b || b.locked) return false;
        const o = opts || {};
        let idx = o.index;
        if (idx == null || idx < 0) {
            idx = findExpressionIndex(b, o.match != null ? o.match : "Happy");
        }
        if (idx < 0) return false;
        return setBlockExpression(b, idx, { playIntro: o.playIntro !== false });
    }

    function getCatalog() {
        return catalog();
    }

    function HasUnlockedCharacter(id) {
        const key = String(id || "");
        if (!key) return false;
        if (DEFAULT_UNLOCKED.indexOf(key) !== -1) return true;
        return persist.unlocked.indexOf(key) !== -1;
    }

    function UnlockCharacter(id) {
        const key = String(id || "");
        if (!key || !catalog()[key]) return false;
        if (persist.unlocked.indexOf(key) === -1) {
            persist.unlocked.push(key);
            saveState(persist);
        }
        return true;
    }

    function Reset() {
        persist = { unlocked: DEFAULT_UNLOCKED.slice(), selected: null };
        try { localStorage.removeItem(storageKey()); } catch (_) { /* ignore */ }
        readCfg().selectedCharacterId = DEFAULT_UNLOCKED[0] || "Cat";
        return api;
    }

    const api = {
        init,
        beginLevel,
        preloadSelectedSpine,
        attach,
        update,
        detach,
        disposeAllSharedSpinePlayers,
        clearTextureCaches,
        invalidateTextureCaches,
        setSelectedCharacter,
        getSelectedCharacter,
        setExpressionMode,
        setExpressionIndex,
        getUseSpine,
        setUseSpine,
        setBlockExpression,
        setAllBlockExpressions,
        listExpressions,
        findExpressionIndex,
        setBlockHappyFace,
        getCatalog,
        resolveParts,
        HasUnlockedCharacter,
        UnlockCharacter,
        getUnlockedCharacters,
        Reset,
        // Exported for tests / docs examples
        layoutForSize,
        facingLeft,
        interiorScaleFor
    };

    window.BlockCharacters = api;
})();
