// OWNER: shared — Daily Win Streak runtime (portable module).
// Config: daily-streak-config.js. Day-7 reward: daily-streak-data.js.
// Host: listen to kpf:levelComplete, show celebration before ProgressRewards.
"use strict";

(function () {
    const DEFAULT_STORAGE_KEY = "daily_streak";
    // Streak artwork (host-relative paths).
    const STREAK_ASSET_BASE = "DailyStreak/Assets/";
    const BADGE_MAIN_IMG = STREAK_ASSET_BASE + "Streak_FA_Main.png";
    const BADGE_CROWN_IMG = STREAK_ASSET_BASE + "Streak_FA_Crown.png";
    const HOME_ICON_IDLE_IMG = STREAK_ASSET_BASE + "Streak_FA_Home.png";
    const HOME_ICON_ACTIVE_IMG = STREAK_ASSET_BASE + "Streak_FA_HomeActive.png";
    // Same Spine RewardBox as ProgressRewards (bar-sized idle viewport).
    const CHEST_CLOSED = "ProgressRewards/Assets/chest_closed.png";
    const CHEST_SPINE_JSON = "ProgressRewards/Assets/RewardChests/RewardBox.json";
    const CHEST_SPINE_ATLAS = "ProgressRewards/Assets/RewardChests/RewardBox.atlas";
    const CHEST_ANIM_IDLE = "Anim-RewardBox-Idle";
    const GIFT_CHEST_VIEWPORT = {
        x: -300,
        y: -300,
        width: 600,
        height: 600,
        padLeft: "0%",
        padRight: "0%",
        padTop: "0%",
        padBottom: "0%",
        transitionTime: 0
    };

    // Fallback confetti palette (host overrides via cfg.confettiColors).
    const DEFAULT_CONFETTI_COLORS = [
        "#f04e66", "#627ce8", "#45c977", "#f09a42",
        "#a979de", "#f3c33d", "#5bc6d5", "#ed6e94"
    ];

    const FALLBACK_COPY = {
        streakFirstWin: "First Win",
        streakMovedUp: "Your streak just moved up!",
        streakMovedUpTitle: "Streak Up!",
        streakNotLit: "Your Day Streak isn't lit yet!",
        streakComePlay: "Come play a round!",
        streakNewAnimal: "New Animal",
        streakDescAnimal1: "A floppy-eared dog friend unlocked from a 7-day win streak.",
        streakClose: "Close",
        streakContinue: "Continue",
        streakHomeAria: "Daily win streak"
    };

    function readDataCfg() {
        const raw = (typeof window !== "undefined" && window.DAILY_STREAK_CFG) || {};
        const skin = raw.chestSkin;
        const ms = (key, fallback) => {
            const n = Number(raw[key]);
            return n >= 0 ? n : fallback;
        };
        const colors = Array.isArray(raw.confettiColors)
            ? raw.confettiColors.filter((c) => typeof c === "string" && c)
            : null;
        return {
            levelCompleteEvent: raw.levelCompleteEvent || "kpf:levelComplete",
            listenToLevelComplete: raw.listenToLevelComplete !== false,
            cycleLength: Math.max(1, parseInt(raw.cycleLength, 10) || 7),
            openFadeMs: ms("openFadeMs", 340),
            badgePopMs: ms("badgePopMs", 560),
            trackFillMs: ms("trackFillMs", 420),
            countPopMs: ms("countPopMs", 480),
            slotLitMs: ms("slotLitMs", 560),
            continueRevealMs: ms("continueRevealMs", 1500),
            numRollMs: ms("numRollMs", 460),
            slotCascadeMs: ms("slotCascadeMs", 55),
            confettiMs: ms("confettiMs", 1500),
            confettiCount: ms("confettiCount", 20),
            confettiColors: (colors && colors.length) ? colors : DEFAULT_CONFETTI_COLORS.slice(),
            showBurst: raw.showBurst !== false,
            titleLetterPop: raw.titleLetterPop !== false,
            chestSkin: (skin === "Blue" || skin === "Red") ? skin : "Green",
            giftSizePx: Math.max(32, parseInt(raw.giftSizePx, 10) || 52)
        };
    }

    function day7Reward() {
        return (typeof window !== "undefined" &&
            (window.DAILY_STREAK_REWARD || window.DAILY_STREAK_DAY7)) || null;
    }

    /** Authored cycle length + gift day (clamped). */
    function rewardMeta() {
        const reward = day7Reward() || {};
        const fromData = parseInt(reward.cycleLength, 10);
        const cycle = Math.max(1, fromData > 0 ? fromData : (cfg.cycleLength || 7));
        const rawDay = parseInt(reward.rewardDay, 10);
        const rewardDay = Math.max(1, Math.min(cycle, rawDay > 0 ? rawDay : cycle));
        return {
            reward: reward,
            cycleLength: cycle,
            rewardDay: rewardDay,
            rewardId: reward.rewardId || null,
            sprite: reward.sprite || "",
            label: reward.label || "",
            description: reward.description || "",
            grantItem: reward.grantItem || "",
            grantAmount: parseInt(reward.grantAmount, 10) || 0,
            grantCharacter: reward.grantCharacter || "",
            spine: (reward.spine && typeof reward.spine === "object") ? reward.spine : null
        };
    }

    function syncCycleFromData() {
        const meta = rewardMeta();
        cfg.cycleLength = meta.cycleLength;
        return meta;
    }

    function pad2(n) {
        return n < 10 ? "0" + n : String(n);
    }

    /** Local calendar day key YYYY-MM-DD (device timezone). */
    function localDayKey(date) {
        const d = date || new Date();
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }

    /** Yesterday's local day key relative to `date` (or now). */
    function yesterdayKey(date) {
        const d = date ? new Date(date.getTime()) : new Date();
        d.setDate(d.getDate() - 1);
        return localDayKey(d);
    }

    const cfg = {
        storageKey: DEFAULT_STORAGE_KEY,
        getCopy: null,
        onOpen: null,
        onClose: null,
        onRewardUnlocked: null,
        onStreakFlowDone: null,
        // Juice hooks — host attaches audio / haptics without owning the UI.
        onCountTick: null,
        onSlotLit: null,
        onCtaPress: null,
        onGiftPress: null,
        onKeepStreak: null,
        onResetStreak: null,
        root: null,
        homeRoot: null,
        levelCompleteEvent: "kpf:levelComplete",
        listenToLevelComplete: true,
        cycleLength: 7,
        openFadeMs: 340,
        badgePopMs: 560,
        trackFillMs: 420,
        countPopMs: 480,
        slotLitMs: 560,
        continueRevealMs: 1500,
        numRollMs: 460,
        slotCascadeMs: 55,
        confettiMs: 1500,
        confettiCount: 20,
        confettiColors: DEFAULT_CONFETTI_COLORS.slice(),
        showBurst: true,
        titleLetterPop: true,
        chestSkin: "Green",
        giftSizePx: 52
    };

    let state = {
        streakCount: 0,
        lastWinDay: null,
        unlocked: [],
        lastCelebratedDay: null,
        // One-shot: auto-show Day-7 reward bubble on first streak-screen visit (SP-971).
        seenRewardTooltip: false
    };

    let els = null;
    let homePill = null;
    let open = false;
    let pendingDetail = null;
    let flowMode = "home"; // "home" | "celebrate"
    let bubbleOpen = false;
    let levelCompleteBound = false;
    let levelCompleteHandler = null;
    let justLitDay = 0;
    let giftSpinePlayer = null;
    let giftSpineReady = false;
    let giftSpineFailed = false;
    let giftSpineLoadPromise = null;
    let bubbleFacePlayer = null;
    let bubbleFaceReady = false;
    let bubbleFaceFailed = false;
    let bubbleFaceLoadPromise = null;
    let bubbleFaceAssetKey = "";
    let openSeqTimers = [];
    let openSeqToken = 0;
    let rewardMomentPending = false;
    let confettiTimer = null;
    let lastPillCount = null;

    /** Fire an optional host callback without letting it break the sequence. */
    function emit(name, arg) {
        const fn = cfg[name];
        if (typeof fn !== "function") return;
        try { fn(arg); } catch (_) { /* host callback must never break the UI */ }
    }

    function copy(key) {
        if (typeof cfg.getCopy === "function") {
            try {
                const v = cfg.getCopy(key);
                if (v != null && v !== "") return String(v);
            } catch (_) { /* fall through */ }
        }
        if (typeof window !== "undefined" && typeof window.t === "function") {
            try {
                const v = window.t(key);
                if (v != null && v !== "" && v !== key) return String(v);
            } catch (_) { /* fall through */ }
        }
        return FALLBACK_COPY[key] || key;
    }

    function spineApiAvailable() {
        return !!(window.spine && typeof window.spine.SpinePlayer === "function");
    }

    function hideRewardBoxCircle(player) {
        const skeleton = player && player.skeleton;
        if (!skeleton) return;
        const slot = skeleton.findSlot("RewardBox-Circle");
        if (!slot || !slot.color) return;
        slot.color.r = 1;
        slot.color.g = 1;
        slot.color.b = 1;
        slot.color.a = 0;
    }

    function setGiftChestFallback() {
        if (!els) return;
        if (els.giftFallback) els.giftFallback.hidden = false;
        // Keep spine host in layout (display:none breaks Spine canvas sizing).
        if (els.giftSpineHost) {
            els.giftSpineHost.style.opacity = "0";
            els.giftSpineHost.setAttribute("aria-hidden", "true");
        }
    }

    function setGiftChestVisible(useSpine) {
        if (!els) return;
        if (els.giftFallback) els.giftFallback.hidden = !!useSpine;
        if (els.giftSpineHost) {
            els.giftSpineHost.style.opacity = useSpine ? "1" : "0";
            els.giftSpineHost.setAttribute("aria-hidden", useSpine ? "false" : "true");
        }
    }

    function ensureGiftSpinePlayer() {
        if (giftSpineFailed || !els || !els.giftSpineHost) {
            setGiftChestFallback();
            return Promise.resolve(null);
        }
        if (giftSpineReady && giftSpinePlayer) {
            setGiftChestVisible(true);
            try { giftSpinePlayer.setAnimation(CHEST_ANIM_IDLE, true); } catch (_) { /* ignore */ }
            return Promise.resolve(giftSpinePlayer);
        }
        if (giftSpineLoadPromise) return giftSpineLoadPromise;
        if (!spineApiAvailable()) {
            giftSpineFailed = true;
            setGiftChestFallback();
            return Promise.resolve(null);
        }

        giftSpineLoadPromise = new Promise((resolve) => {
            let settled = false;
            const finish = (player) => {
                if (settled) return;
                settled = true;
                resolve(player);
            };
            try {
                const player = new window.spine.SpinePlayer(els.giftSpineHost, {
                    jsonUrl: CHEST_SPINE_JSON,
                    atlasUrl: CHEST_SPINE_ATLAS,
                    animation: CHEST_ANIM_IDLE,
                    skin: cfg.chestSkin || "Green",
                    showControls: false,
                    showLoading: false,
                    alpha: true,
                    backgroundColor: "#00000000",
                    premultipliedAlpha: false,
                    viewport: GIFT_CHEST_VIEWPORT,
                    success: (p) => {
                        hideRewardBoxCircle(p);
                        try { p.setAnimation(CHEST_ANIM_IDLE, true); } catch (_) { /* ignore */ }
                        hideRewardBoxCircle(p);
                        giftSpineReady = true;
                        setGiftChestVisible(true);
                        finish(p);
                    },
                    frame: (p) => { hideRewardBoxCircle(p); },
                    error: (_p, msg) => {
                        console.warn("[DailyStreak] Spine gift chest failed:", msg);
                        giftSpineFailed = true;
                        giftSpineReady = false;
                        setGiftChestFallback();
                        finish(null);
                    }
                });
                giftSpinePlayer = player;
            } catch (err) {
                console.warn("[DailyStreak] Spine gift chest init error:", err);
                giftSpineFailed = true;
                setGiftChestFallback();
                finish(null);
            }
        });
        return giftSpineLoadPromise;
    }

    function bubbleFaceSpineDef(meta) {
        const spine = meta && meta.spine;
        if (!spine || !spine.json || !spine.atlas) return null;
        return {
            json: String(spine.json),
            atlas: String(spine.atlas),
            intro: spine.intro ? String(spine.intro) : "",
            animation: String(spine.animation || "IdleHappy"),
            mask: String(spine.mask || ""),
            maskOffsetX: Number(spine.maskOffsetX) || 0,
            maskOffsetY: Number(spine.maskOffsetY) || 0,
            maskScale: (Number.isFinite(Number(spine.maskScale)) && Number(spine.maskScale) > 0)
                ? Number(spine.maskScale)
                : 1,
            viewport: (spine.viewport && typeof spine.viewport === "object")
                ? spine.viewport
                : {
                    x: -460,
                    y: -480,
                    width: 920,
                    height: 920,
                    padLeft: "2%",
                    padRight: "2%",
                    padTop: "2%",
                    padBottom: "2%",
                    transitionTime: 0
                }
        };
    }

    function makeBubbleFaceAssetKey(def) {
        return String(def && def.json || "") + "|" + String(def && def.atlas || "") +
            "|" + String(def && def.intro || "") + "|" + String(def && def.animation || "");
    }

    /** Soft fill tint for the B/W ear-mask underlay in the bubble. */
    const BUBBLE_MASK_TINT = { r: 240, g: 160, b: 74 };

    /** path → Promise<dataURL> of tinted white silhouette (black → alpha 0). */
    const bubbleMaskDataCache = new Map();

    function loadBubbleMaskDataUrl(path) {
        if (!path) return Promise.resolve(null);
        if (bubbleMaskDataCache.has(path)) {
            const cached = bubbleMaskDataCache.get(path);
            if (cached && cached.then) return cached;
            return Promise.resolve(cached);
        }
        const job = new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
                try {
                    const w = img.naturalWidth || img.width || 1;
                    const h = img.naturalHeight || img.height || 1;
                    const cvs = document.createElement("canvas");
                    cvs.width = w;
                    cvs.height = h;
                    const ctx = cvs.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, w, h);
                    const d = imageData.data;
                    const tr = BUBBLE_MASK_TINT.r;
                    const tg = BUBBLE_MASK_TINT.g;
                    const tb = BUBBLE_MASK_TINT.b;
                    for (let i = 0; i < d.length; i += 4) {
                        // Luminance → alpha so authored black stays fully transparent.
                        const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
                        d[i] = tr;
                        d[i + 1] = tg;
                        d[i + 2] = tb;
                        d[i + 3] = Math.round(lum);
                    }
                    ctx.putImageData(imageData, 0, 0);
                    const url = cvs.toDataURL("image/png");
                    bubbleMaskDataCache.set(path, url);
                    resolve(url);
                } catch (err) {
                    console.warn("[DailyStreak] Mask process failed:", err);
                    bubbleMaskDataCache.delete(path);
                    resolve(null);
                }
            };
            img.onerror = () => {
                bubbleMaskDataCache.delete(path);
                resolve(null);
            };
            img.src = path;
        });
        bubbleMaskDataCache.set(path, job);
        return job;
    }

    function clearBubbleFaceMask() {
        if (!els || !els.bubbleMask) return;
        els.bubbleMask.hidden = true;
        els.bubbleMask.style.backgroundImage = "";
        els.bubbleMask.style.transform = "";
        els.bubbleMask.style.backgroundSize = "";
    }

    function applyBubbleFaceMaskTransform(def) {
        if (!els || !els.bubbleMask) return;
        const ox = def && Number.isFinite(def.maskOffsetX) ? def.maskOffsetX : 0;
        const oy = def && Number.isFinite(def.maskOffsetY) ? def.maskOffsetY : 0;
        const sc = def && Number.isFinite(def.maskScale) && def.maskScale > 0 ? def.maskScale : 1;
        els.bubbleMask.style.transform = "translate(" + ox + "px, " + oy + "px)";
        // 100% = fill the face box; maskScale multiplies that.
        els.bubbleMask.style.backgroundSize = (sc * 100) + "%";
    }

    function applyBubbleFaceMask(defOrPath) {
        if (!els || !els.bubbleMask) return Promise.resolve(null);
        const def = (defOrPath && typeof defOrPath === "object") ? defOrPath : null;
        const maskPath = def ? def.mask : String(defOrPath || "");
        if (!maskPath) {
            clearBubbleFaceMask();
            return Promise.resolve(null);
        }
        return loadBubbleMaskDataUrl(maskPath).then((url) => {
            if (!els || !els.bubbleMask) return null;
            if (!url) {
                clearBubbleFaceMask();
                return null;
            }
            els.bubbleMask.style.backgroundImage = 'url("' + url + '")';
            applyBubbleFaceMaskTransform(def || { maskOffsetX: 0, maskOffsetY: 0, maskScale: 1 });
            return url;
        });
    }

    function setBubbleFaceFallback() {
        if (!els) return;
        if (els.bubbleArt) els.bubbleArt.hidden = false;
        clearBubbleFaceMask();
        if (els.bubbleSpineHost) {
            els.bubbleSpineHost.style.opacity = "0";
            els.bubbleSpineHost.setAttribute("aria-hidden", "true");
        }
    }

    function setBubbleFaceVisible(useSpine) {
        if (!els) return;
        if (els.bubbleArt) els.bubbleArt.hidden = !!useSpine;
        if (els.bubbleMask) {
            // Only show the processed silhouette while the live face is up.
            els.bubbleMask.hidden = !useSpine || !els.bubbleMask.style.backgroundImage;
        }
        if (els.bubbleSpineHost) {
            els.bubbleSpineHost.style.opacity = useSpine ? "1" : "0";
            els.bubbleSpineHost.setAttribute("aria-hidden", useSpine ? "false" : "true");
        }
    }

    function pauseBubbleFace() {
        if (!bubbleFacePlayer) return;
        try { bubbleFacePlayer.paused = true; } catch (_) { /* ignore */ }
    }

    function playBubbleFaceHappy(def) {
        if (!bubbleFacePlayer || !def) return;
        try {
            bubbleFacePlayer.paused = false;
            if (def.intro) {
                bubbleFacePlayer.setAnimation(def.intro, false);
                if (typeof bubbleFacePlayer.addAnimation === "function") {
                    bubbleFacePlayer.addAnimation(def.animation, true, 0);
                } else {
                    // Fallback: jump to idle after a beat if queue isn't available.
                    setTimeout(() => {
                        try { bubbleFacePlayer.setAnimation(def.animation, true); } catch (_) { /* ignore */ }
                    }, 900);
                }
            } else {
                bubbleFacePlayer.setAnimation(def.animation, true);
            }
        } catch (_) {
            try { bubbleFacePlayer.setAnimation(def.animation, true); } catch (__) { /* ignore */ }
        }
    }

    function ensureBubbleFaceSpine(meta) {
        const def = bubbleFaceSpineDef(meta);
        if (!def || !els || !els.bubbleSpineHost) {
            setBubbleFaceFallback();
            return Promise.resolve(null);
        }
        const key = makeBubbleFaceAssetKey(def);

        if (bubbleFaceFailed && bubbleFaceAssetKey === key) {
            setBubbleFaceFallback();
            return Promise.resolve(null);
        }
        if (bubbleFaceReady && bubbleFacePlayer && bubbleFaceAssetKey === key) {
            applyBubbleFaceMask(def).then(() => {
                setBubbleFaceVisible(true);
                playBubbleFaceHappy(def);
            });
            return Promise.resolve(bubbleFacePlayer);
        }
        if (bubbleFaceLoadPromise && bubbleFaceAssetKey === key) {
            return bubbleFaceLoadPromise.then((player) => {
                if (player) {
                    applyBubbleFaceMask(def).then(() => {
                        setBubbleFaceVisible(true);
                        playBubbleFaceHappy(def);
                    });
                }
                return player;
            });
        }
        if (!spineApiAvailable()) {
            bubbleFaceFailed = true;
            bubbleFaceAssetKey = key;
            setBubbleFaceFallback();
            return Promise.resolve(null);
        }

        // Tear down a previous animal face if the authored spine asset changed.
        if (bubbleFacePlayer && bubbleFaceAssetKey && bubbleFaceAssetKey !== key) {
            try {
                if (typeof bubbleFacePlayer.dispose === "function") bubbleFacePlayer.dispose();
            } catch (_) { /* ignore */ }
            bubbleFacePlayer = null;
            bubbleFaceReady = false;
            bubbleFaceFailed = false;
            bubbleFaceLoadPromise = null;
            if (els.bubbleSpineHost) els.bubbleSpineHost.innerHTML = "";
        }

        bubbleFaceAssetKey = key;
        bubbleFaceFailed = false;
        // Warm the mask while Spine loads so both appear together.
        applyBubbleFaceMask(def);
        bubbleFaceLoadPromise = new Promise((resolve) => {
            let settled = false;
            const finish = (player) => {
                if (settled) return;
                settled = true;
                resolve(player);
            };
            try {
                const player = new window.spine.SpinePlayer(els.bubbleSpineHost, {
                    jsonUrl: def.json,
                    atlasUrl: def.atlas,
                    animation: def.intro || def.animation,
                    showControls: false,
                    showLoading: false,
                    alpha: true,
                    backgroundColor: "#00000000",
                    premultipliedAlpha: false,
                    viewport: def.viewport,
                    success: (p) => {
                        bubbleFaceReady = true;
                        bubbleFaceFailed = false;
                        applyBubbleFaceMask(def).then(() => {
                            setBubbleFaceVisible(true);
                            playBubbleFaceHappy(def);
                        });
                        finish(p);
                    },
                    error: (_p, msg) => {
                        console.warn("[DailyStreak] Spine reward face failed:", msg);
                        bubbleFaceFailed = true;
                        bubbleFaceReady = false;
                        setBubbleFaceFallback();
                        finish(null);
                    }
                });
                bubbleFacePlayer = player;
            } catch (err) {
                console.warn("[DailyStreak] Spine reward face init error:", err);
                bubbleFaceFailed = true;
                setBubbleFaceFallback();
                finish(null);
            }
        });
        return bubbleFaceLoadPromise;
    }

    function applyGiftSize() {
        if (!els || !els.root) return;
        const px = Math.max(32, Number(cfg.giftSizePx) || 52);
        els.root.style.setProperty("--ds-gift-size", px + "px");
    }

    function ensureGiftSlot() {
        if (!els) return;
        if (els.giftSlot) return els.giftSlot;

        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "ds-slot gift";
        slot.setAttribute("role", "listitem");
        slot.setAttribute("aria-label", copy("streakNewAnimal"));
        slot.innerHTML = [
            '<span class="ds-gift-wrap">',
            '  <div class="ds-gift-spine" data-ds="giftSpine"></div>',
            '  <img class="ds-gift-fallback" data-ds="giftFallback" src="' + CHEST_CLOSED + '" alt="" draggable="false" />',
            "</span>"
        ].join("");
        slot.addEventListener("click", (e) => {
            e.stopPropagation();
            emit("onGiftPress");
            toggleBubble();
        });

        els.giftSlot = slot;
        els.giftSpineHost = slot.querySelector("[data-ds=giftSpine]");
        els.giftFallback = slot.querySelector("[data-ds=giftFallback]");
        // Start on PNG until Spine succeeds (host must stay laid out for WebGL size).
        setGiftChestFallback();
        return slot;
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(cfg.storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            state.streakCount = Math.max(0, parseInt(parsed.streakCount, 10) || 0);
            state.lastWinDay = typeof parsed.lastWinDay === "string" ? parsed.lastWinDay : null;
            state.unlocked = Array.isArray(parsed.unlocked)
                ? parsed.unlocked.filter((id) => typeof id === "string")
                : [];
            state.lastCelebratedDay = typeof parsed.lastCelebratedDay === "string"
                ? parsed.lastCelebratedDay
                : null;
            state.seenRewardTooltip = !!parsed.seenRewardTooltip;
        } catch (_) {
            state = {
                streakCount: 0,
                lastWinDay: null,
                unlocked: [],
                lastCelebratedDay: null,
                seenRewardTooltip: false
            };
        }
    }

    function saveState() {
        try {
            localStorage.setItem(cfg.storageKey, JSON.stringify({
                streakCount: state.streakCount,
                lastWinDay: state.lastWinDay,
                unlocked: state.unlocked.slice(),
                lastCelebratedDay: state.lastCelebratedDay,
                seenRewardTooltip: !!state.seenRewardTooltip
            }));
        } catch (_) { /* ignore quota */ }
    }

    function HasUnlockedStreakReward(rewardId) {
        if (!rewardId) return false;
        return state.unlocked.indexOf(rewardId) !== -1;
    }

    /** Unlock a BlockCharacters catalog id when present (optional side-effect). */
    function applyCharacterGrant(characterId) {
        if (!characterId) return false;
        if (!window.BlockCharacters || typeof BlockCharacters.UnlockCharacter !== "function") {
            return false;
        }
        const id = String(characterId);
        const ok = BlockCharacters.UnlockCharacter(id);
        if (ok && typeof BlockCharacters.setSelectedCharacter === "function") {
            try { BlockCharacters.setSelectedCharacter(id); } catch (_) { /* ignore */ }
        }
        return !!ok;
    }

    function grantDay7IfNeeded() {
        const meta = rewardMeta();
        if (!meta.rewardId) return false;
        if (state.streakCount < meta.rewardDay) return false;
        if (HasUnlockedStreakReward(meta.rewardId)) return false;
        state.unlocked.push(meta.rewardId);
        if (meta.grantItem && window.Items && typeof Items.grant === "function") {
            const amount = meta.grantAmount > 0 ? meta.grantAmount : 1;
            Items.grant(meta.grantItem, amount);
        } else {
            applyCharacterGrant(meta.grantCharacter);
        }
        saveState();
        return true;
    }

    /**
     * Apply calendar gap rules and optionally tick today's win.
     * @returns {{ ticked: boolean, streakCount: number }}
     */
    function applyWinForToday() {
        const today = localDayKey();
        if (state.lastWinDay === today) {
            return { ticked: false, streakCount: state.streakCount, unlockedNow: false };
        }

        const yday = yesterdayKey();
        if (state.lastWinDay !== yday) {
            state.streakCount = 0;
        }

        state.streakCount += 1;
        state.lastWinDay = today;
        const unlockedNow = grantDay7IfNeeded();
        saveState();
        return { ticked: true, streakCount: state.streakCount, unlockedNow: !!unlockedNow };
    }

    /** Silent gap check for display (do not reset until next win). */
    function effectiveStreakForDisplay() {
        const today = localDayKey();
        const yday = yesterdayKey();
        if (!state.lastWinDay) return 0;
        if (state.lastWinDay === today || state.lastWinDay === yday) {
            return state.streakCount;
        }
        return 0;
    }

    /**
     * True when the player has a stored streak but missed a day — next win would
     * wipe it unless they recover via rewarded ad.
     */
    function isStreakInDanger() {
        if (!state.lastWinDay || state.streakCount <= 0) return false;
        const today = localDayKey();
        const yday = yesterdayKey();
        return state.lastWinDay !== today && state.lastWinDay !== yday;
    }

    /** Soft-save: treat yesterday as last win so the streak stays lit. */
    function recoverStreak() {
        if (state.streakCount <= 0) return false;
        state.lastWinDay = yesterdayKey();
        saveState();
        RefreshHomePill();
        return true;
    }

    function hasUnlockedDay7Reward() {
        const meta = rewardMeta();
        return !!(meta.rewardId && HasUnlockedStreakReward(meta.rewardId));
    }

    /**
     * Visual window for a streak count.
     * First cycle keeps the gift on rewardDay. After that reward is unlocked,
     * day (cycleLength+1)+ rolls forward in bursts with no chest.
     */
    function getTrackWindow(streakCount) {
        const meta = rewardMeta();
        const cycle = meta.cycleLength;
        const n = Math.max(0, streakCount | 0);
        if (!hasUnlockedDay7Reward() || n <= cycle) {
            return { start: 1, length: cycle, showGift: true, giftDay: meta.rewardDay };
        }
        const windowIndex = Math.floor((n - 1) / cycle);
        const start = windowIndex * cycle + 1;
        return { start: start, length: cycle, showGift: false, giftDay: 0 };
    }

    /** How many slots are filled in the current visual window (0..cycleLength). */
    function filledDays() {
        const n = effectiveStreakForDisplay();
        if (n <= 0) return 0;
        const win = getTrackWindow(n);
        return Math.max(0, Math.min(win.length, n - win.start + 1));
    }

    function makeDaySlot(day, filledStreak, suppressJustLit, warnDay) {
        const done = day <= filledStreak;
        const slot = document.createElement("div");
        slot.className = "ds-slot" + (done ? " done" : "");
        slot.setAttribute("role", "listitem");
        slot.setAttribute("aria-label", "Day " + day);

        if (!suppressJustLit && justLitDay && day === justLitDay) {
            slot.classList.add("just-lit");
        }
        if (done && day === filledStreak) {
            slot.classList.add("active");
        }
        if (!done) {
            const num = document.createElement("span");
            num.className = "ds-slot-num";
            num.textContent = String(day);
            slot.appendChild(num);
        }
        if (warnDay === day) {
            slot.classList.add("ds-slot-warn");
            const warn = document.createElement("span");
            warn.className = "ds-slot-warn-icon";
            warn.setAttribute("aria-hidden", "true");
            warn.innerHTML = [
                '<svg viewBox="0 0 24 24" focusable="false">',
                '  <path d="M12 3.2 2.8 19.5h18.4L12 3.2z"></path>',
                '  <path d="M12 9.2v5.2"></path>',
                '  <circle cx="12" cy="16.8" r="1.1"></circle>',
                "</svg>"
            ].join("");
            slot.appendChild(warn);
        }
        return slot;
    }

    function renderTrack(opts) {
        if (!els) return;
        opts = opts || {};
        const filledStreak = opts.filledStreak != null
            ? Math.max(0, opts.filledStreak | 0)
            : effectiveStreakForDisplay();
        const windowFor = opts.windowFor != null ? opts.windowFor : filledStreak;
        const suppressJustLit = !!opts.suppressJustLit;
        const warnDay = opts.warnDay != null ? (opts.warnDay | 0) : 0;
        const win = getTrackWindow(windowFor);
        const gift = ensureGiftSlot();

        // Detach gift so we can rebuild without destroying Spine.
        if (gift.parentNode) gift.parentNode.removeChild(gift);
        els.track.innerHTML = "";
        els.track.classList.toggle("ds-track-post", !win.showGift);

        if (win.showGift) {
            const end = win.start + win.length - 1;
            const giftDay = win.giftDay || end;
            for (let day = win.start; day <= end; day++) {
                if (day === giftDay) {
                    const giftDone = filledStreak >= giftDay;
                    gift.classList.toggle("done", giftDone);
                    gift.classList.toggle("active", giftDone);
                    gift.classList.toggle(
                        "just-lit",
                        !suppressJustLit && !!(justLitDay && justLitDay === giftDay)
                    );
                    gift.classList.toggle(
                        "ds-gift-tease",
                        filledStreak >= Math.max(win.start, giftDay - 2) && !giftDone
                    );
                    gift.classList.toggle("ds-slot-warn", warnDay === giftDay);
                    // Remove stale warn icon then re-add if needed.
                    const oldWarn = gift.querySelector(".ds-slot-warn-icon");
                    if (oldWarn) oldWarn.remove();
                    if (warnDay === giftDay) {
                        const warn = document.createElement("span");
                        warn.className = "ds-slot-warn-icon";
                        warn.setAttribute("aria-hidden", "true");
                        warn.innerHTML = [
                            '<svg viewBox="0 0 24 24" focusable="false">',
                            '  <path d="M12 3.2 2.8 19.5h18.4L12 3.2z"></path>',
                            '  <path d="M12 9.2v5.2"></path>',
                            '  <circle cx="12" cy="16.8" r="1.1"></circle>',
                            "</svg>"
                        ].join("");
                        gift.appendChild(warn);
                    }
                    gift.setAttribute("aria-label", copy("streakNewAnimal"));
                    els.track.appendChild(gift);
                    applyGiftSize();
                    ensureGiftSpinePlayer();
                } else {
                    els.track.appendChild(makeDaySlot(day, filledStreak, suppressJustLit, warnDay));
                }
            }
        } else {
            gift.classList.remove("done", "active", "just-lit", "ds-gift-tease", "ds-slot-warn");
            const end = win.start + win.length - 1;
            for (let day = win.start; day <= end; day++) {
                els.track.appendChild(makeDaySlot(day, filledStreak, suppressJustLit, warnDay));
            }
        }

        // Index nodes so the entrance cascade staggers left → right. Only an
        // open's first render cascades; the celebrate re-render must not replay.
        const nodes = els.track.children;
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].style.setProperty("--ds-i", String(i));
        }
        els.track.classList.toggle("ds-cascade", !!opts.cascade);
    }

    function ensureDom(root) {
        if (els) return els;
        const mount = root || document.querySelector(".app") || document.body;

        const overlay = document.createElement("div");
        overlay.id = "dsOverlay";
        overlay.className = "ds-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = [
            '<div class="ds-backdrop" data-ds="backdrop"></div>',
            '<div class="ds-panel">',
            '  <div class="ds-badge" data-ds="badge" aria-hidden="true">',
            '    <span class="ds-badge-burst" aria-hidden="true"></span>',
            '    <span class="ds-badge-glow" aria-hidden="true"></span>',
            '    <span class="ds-badge-sparkles" aria-hidden="true">',
            '      <i class="ds-spark"></i><i class="ds-spark"></i><i class="ds-spark"></i>',
            '      <i class="ds-spark"></i><i class="ds-spark"></i><i class="ds-spark"></i>',
            "    </span>",
            '    <img class="ds-badge-crown-img" src="' + BADGE_CROWN_IMG + '" alt="" draggable="false" />',
            '    <img class="ds-badge-main-img" src="' + BADGE_MAIN_IMG + '" alt="" draggable="false" />',
            '    <span class="ds-badge-num" data-ds="badgeNum">',
            '      <span class="ds-num-out" data-ds="numOut" aria-hidden="true"></span>',
            '      <span class="ds-num-in" data-ds="numIn">0</span>',
            "    </span>",
            "  </div>",
            '  <h2 class="ds-title" data-ds="title"></h2>',
            '  <p class="ds-subtitle" data-ds="subtitle"></p>',
            '  <div class="ds-track-wrap">',
            '    <div class="ds-bubble" data-ds="bubble" role="dialog" aria-hidden="true">',
            '      <div class="ds-bubble-face" data-ds="bubbleFace">',
            '        <div class="ds-bubble-mask" data-ds="bubbleMask" hidden aria-hidden="true"></div>',
            '        <div class="ds-bubble-spine" data-ds="bubbleSpine"></div>',
            '        <img class="ds-bubble-art" data-ds="bubbleArt" alt="" />',
            "      </div>",
            '      <span class="ds-bubble-label" data-ds="bubbleLabel"></span>',
            "    </div>",
            '    <div class="ds-track" data-ds="track" role="list"></div>',
            "  </div>",
            '  <div class="ds-danger-actions" data-ds="dangerActions" hidden>',
            '    <button type="button" class="ds-btn ds-btn-gold" data-ds="keepBtn">',
            '      <span class="ad-rv-icon" aria-hidden="true">',
            '        <svg class="ad-rv-play" viewBox="0 0 24 24" focusable="false">',
            '          <circle cx="12" cy="12" r="11"></circle>',
            '          <path d="M10 8.2v7.6L16.2 12z"></path>',
            "        </svg>",
            '        <span class="ad-rv-badge">AD</span>',
            "      </span>",
            '      <span data-ds="keepLabel"></span>',
            "    </button>",
            '    <button type="button" class="ds-text-btn" data-ds="resetBtn"></button>',
            "  </div>",
            '  <button type="button" class="ds-btn" data-ds="cta"></button>',
            "</div>",
            // Sibling of the panel (absolute, out of flow) so pieces draw over it.
            '<div class="ds-confetti" data-ds="confetti" aria-hidden="true"></div>'
        ].join("");

        mount.appendChild(overlay);

        els = {
            root: overlay,
            badge: overlay.querySelector("[data-ds=badge]"),
            badgeNum: overlay.querySelector("[data-ds=badgeNum]"),
            numIn: overlay.querySelector("[data-ds=numIn]"),
            numOut: overlay.querySelector("[data-ds=numOut]"),
            confetti: overlay.querySelector("[data-ds=confetti]"),
            title: overlay.querySelector("[data-ds=title]"),
            subtitle: overlay.querySelector("[data-ds=subtitle]"),
            track: overlay.querySelector("[data-ds=track]"),
            bubble: overlay.querySelector("[data-ds=bubble]"),
            bubbleFace: overlay.querySelector("[data-ds=bubbleFace]"),
            bubbleMask: overlay.querySelector("[data-ds=bubbleMask]"),
            bubbleSpineHost: overlay.querySelector("[data-ds=bubbleSpine]"),
            bubbleArt: overlay.querySelector("[data-ds=bubbleArt]"),
            bubbleLabel: overlay.querySelector("[data-ds=bubbleLabel]"),
            cta: overlay.querySelector("[data-ds=cta]"),
            dangerActions: overlay.querySelector("[data-ds=dangerActions]"),
            keepBtn: overlay.querySelector("[data-ds=keepBtn]"),
            keepLabel: overlay.querySelector("[data-ds=keepLabel]"),
            resetBtn: overlay.querySelector("[data-ds=resetBtn]")
        };

        els.cta.addEventListener("click", onCta);
        if (els.keepBtn) els.keepBtn.addEventListener("click", onKeepStreak);
        if (els.resetBtn) els.resetBtn.addEventListener("click", onResetStreak);
        overlay.addEventListener("click", (e) => {
            if (bubbleOpen && !e.target.closest("[data-ds=bubble]") && !e.target.closest(".ds-slot.gift")) {
                hideBubble();
            }
        });

        return els;
    }

    function ensureHomePill(homeRoot) {
        if (homePill) return homePill;
        const mount = homeRoot ||
            (typeof document !== "undefined" && document.getElementById("startScreen")) ||
            null;
        if (!mount) return null;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ds-home-pill";
        btn.id = "dsHomePill";
        btn.setAttribute("aria-label", copy("streakHomeAria"));
        btn.innerHTML = [
            '<span class="ds-home-icon" aria-hidden="true">',
            '  <img class="ds-home-icon-img" data-ds="pillIcon" src="' + HOME_ICON_IDLE_IMG + '" alt="" draggable="false" />',
            '  <span class="ds-home-count" data-ds="pillCount">0</span>',
            "</span>"
        ].join("");
        btn.addEventListener("click", () => {
            ShowStreakPopup({ mode: "home" });
        });
        mount.appendChild(btn);
        homePill = {
            root: btn,
            icon: btn.querySelector("[data-ds=pillIcon]"),
            count: btn.querySelector("[data-ds=pillCount]")
        };
        RefreshHomePill();
        return homePill;
    }

    function RefreshHomePill() {
        if (!homePill) ensureHomePill(cfg.homeRoot);
        if (!homePill) return;
        const n = effectiveStreakForDisplay();
        const active = n > 0;
        const changed = lastPillCount != null && lastPillCount !== n;
        lastPillCount = n;
        homePill.count.textContent = String(n);
        if (homePill.icon) {
            homePill.icon.src = active ? HOME_ICON_ACTIVE_IMG : HOME_ICON_IDLE_IMG;
        }
        homePill.root.classList.toggle("ds-active", active);
        homePill.root.setAttribute("aria-label", copy("streakHomeAria") + ", x" + n);

        // Punch the medal when the number actually moves, so a streak tick is
        // still legible if the player lands back on home mid-animation.
        if (changed && !prefersReducedMotion()) {
            const pill = homePill.root;
            pill.classList.remove("ds-pill-bump");
            void pill.offsetWidth;
            pill.classList.add("ds-pill-bump");
            setTimeout(() => { pill.classList.remove("ds-pill-bump"); }, 560);
        }
    }

    function hideBubble() {
        bubbleOpen = false;
        if (!els) return;
        els.bubble.classList.remove("show");
        els.bubble.setAttribute("aria-hidden", "true");
        pauseBubbleFace();
    }

    function markRewardTooltipSeen() {
        if (state.seenRewardTooltip) return;
        state.seenRewardTooltip = true;
        saveState();
    }

    function showBubble() {
        if (!els) return;
        const meta = rewardMeta();
        // label / description are translations.js keys (legacy plain text still works).
        const label = meta.label ? copy(meta.label) : copy("streakNewAnimal");
        els.bubbleArt.src = meta.sprite || "";
        els.bubbleArt.alt = label;
        els.bubbleLabel.textContent = label;
        bubbleOpen = true;
        els.bubble.classList.add("show");
        els.bubble.setAttribute("aria-hidden", "false");
        markRewardTooltipSeen();
        if (meta.spine) {
            // Show PNG until Spine is ready (or permanently if it fails).
            setBubbleFaceFallback();
            ensureBubbleFaceSpine(meta);
        } else {
            setBubbleFaceFallback();
        }
    }

    /** First visit to the streak screen: open the Day-7 reward tooltip automatically (SP-971). */
    function maybeAutoShowFirstVisitTooltip() {
        if (state.seenRewardTooltip || !els || !open) return;
        // Bubble anchors above the track gift — skip until the crate is on-screen.
        if (!els.giftSlot || !els.giftSlot.parentNode) return;
        showBubble();
    }

    function toggleBubble() {
        if (bubbleOpen) hideBubble();
        else showBubble();
    }

    function clearOpenSequence() {
        openSeqToken += 1;
        while (openSeqTimers.length) {
            clearTimeout(openSeqTimers.pop());
        }
        if (!els) return;
        els.root.classList.remove(
            "ds-entering",
            "ds-ready",
            "ds-celebrating",
            "ds-count-burst",
            "ds-busy",
            "ds-cta-pending",
            "ds-cta-reveal"
        );
        if (els.badge) els.badge.classList.remove("ds-count-burst");
        if (els.badgeNum) els.badgeNum.classList.remove("ds-num-pop", "ds-num-rolling");
        if (els.giftSlot) els.giftSlot.classList.remove("ds-gift-pulse", "ds-gift-tease");
        if (els.track) els.track.classList.remove("ds-cascade");
        if (els.cta) els.cta.disabled = false;
        clearConfetti();
    }

    function scheduleOpenStep(fn, delayMs) {
        const token = openSeqToken;
        const id = setTimeout(() => {
            if (token !== openSeqToken || !open) return;
            fn();
        }, Math.max(0, delayMs));
        openSeqTimers.push(id);
        return id;
    }

    function applyTimingVars() {
        if (!els || !els.root) return;
        els.root.style.setProperty("--ds-open-ms", cfg.openFadeMs + "ms");
        els.root.style.setProperty("--ds-badge-ms", cfg.badgePopMs + "ms");
        els.root.style.setProperty("--ds-track-fill-ms", cfg.trackFillMs + "ms");
        els.root.style.setProperty("--ds-count-pop-ms", cfg.countPopMs + "ms");
        els.root.style.setProperty("--ds-slot-lit-ms", cfg.slotLitMs + "ms");
        els.root.style.setProperty("--ds-continue-reveal-ms", cfg.continueRevealMs + "ms");
        els.root.style.setProperty("--ds-num-roll-ms", cfg.numRollMs + "ms");
        els.root.style.setProperty("--ds-slot-cascade-ms", cfg.slotCascadeMs + "ms");
        els.root.style.setProperty("--ds-confetti-ms", cfg.confettiMs + "ms");
        els.root.classList.toggle("ds-burst-off", !cfg.showBurst);
    }

    function prefersReducedMotion() {
        try {
            return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        } catch (_) {
            return false;
        }
    }

    /**
     * Title copy. When titleLetterPop is on, the string is split into per-letter
     * spans (indexed via --ds-i) so it pops in like the host's win-card title.
     * Pass split=false for full sentences, where the stagger runs too long.
     */
    function setTitleText(text, split) {
        if (!els || !els.title) return;
        const str = String(text == null ? "" : text);

        if (split === false || !cfg.titleLetterPop || prefersReducedMotion()) {
            els.title.classList.remove("ds-title-split");
            els.title.removeAttribute("aria-label");
            els.title.textContent = str;
            return;
        }

        els.title.textContent = "";
        const frag = document.createDocumentFragment();
        for (let i = 0; i < str.length; i++) {
            const span = document.createElement("span");
            span.className = "ds-ltr";
            span.textContent = str.charAt(i);
            span.style.setProperty("--ds-i", String(i));
            frag.appendChild(span);
        }
        els.title.appendChild(frag);
        els.title.classList.add("ds-title-split");
        // Split letters read one-by-one to assistive tech; keep the whole line.
        els.title.setAttribute("aria-label", str);
    }

    /**
     * Set the badge digit. When `roll` is true the previous value rides up and
     * out while the new one springs in, plus the whole numeral pops.
     */
    function setBadgeNumber(value, roll) {
        if (!els || !els.numIn || !els.badgeNum) return;
        const next = String(value);

        if (!roll || prefersReducedMotion()) {
            els.badgeNum.classList.remove("ds-num-rolling", "ds-num-pop");
            if (els.numOut) els.numOut.textContent = "";
            els.numIn.textContent = next;
            return;
        }

        if (els.numOut) els.numOut.textContent = els.numIn.textContent;
        els.numIn.textContent = next;
        els.badgeNum.classList.remove("ds-num-rolling", "ds-num-pop");
        void els.badgeNum.offsetWidth; // restart both animations
        els.badgeNum.classList.add("ds-num-rolling", "ds-num-pop");
    }

    /** Centre of `el` (default: the badge) as a percentage of the overlay. */
    function confettiOrigin(el) {
        const fallback = { x: 50, y: 34 };
        const from = el || (els && els.badge);
        if (!from || !els || !els.root) return fallback;
        try {
            const box = from.getBoundingClientRect();
            const root = els.root.getBoundingClientRect();
            if (!root.width || !root.height || !box.width) return fallback;
            return {
                x: ((box.left + box.width / 2 - root.left) / root.width) * 100,
                y: ((box.top + box.height / 2 - root.top) / root.height) * 100
            };
        } catch (_) {
            return fallback;
        }
    }

    function clearConfetti() {
        if (confettiTimer) {
            clearTimeout(confettiTimer);
            confettiTimer = null;
        }
        if (els && els.confetti) els.confetti.textContent = "";
    }

    /**
     * Confetti burst, launched from `fromEl` (default: the badge). Each piece
     * carries its own --ds-c-* vars and flies via one CSS animation, so the
     * module needs no rAF loop.
     *
     * Bursts are additive — spent pieces end at opacity 0 and the whole layer is
     * emptied by the cleanup timer, so a second burst never cuts the first off
     * mid-flight. `clearOpenSequence` bounds the layer across opens.
     */
    function spawnConfetti(fromEl, scale) {
        if (!els || !els.confetti) return;
        const count = Math.max(0, Math.round((cfg.confettiCount | 0) * (scale > 0 ? scale : 1)));
        if (!count || prefersReducedMotion()) return;

        if (confettiTimer) clearTimeout(confettiTimer);

        const colors = (cfg.confettiColors && cfg.confettiColors.length)
            ? cfg.confettiColors
            : DEFAULT_CONFETTI_COLORS;
        const origin = confettiOrigin(fromEl);
        const frag = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            const piece = document.createElement("i");
            piece.className = "ds-confetti-piece";
            // Fan across the upper hemisphere so the burst reads as thrown up.
            const angle = (-Math.PI / 2) + (Math.random() - 0.5) * (Math.PI * 1.15);
            const speed = 110 + Math.random() * 140;
            const spin = Math.round(240 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1);
            const dx = Math.round(Math.cos(angle) * speed);
            const s = piece.style;
            s.setProperty("--ds-c-x", origin.x.toFixed(2) + "%");
            s.setProperty("--ds-c-y", origin.y.toFixed(2) + "%");
            s.setProperty("--ds-c-dx", dx + "px");
            s.setProperty("--ds-c-dy", Math.round(Math.sin(angle) * speed) + "px");
            // Drifts a little further out as it falls.
            s.setProperty("--ds-c-dx-end", Math.round(dx * 1.25) + "px");
            s.setProperty("--ds-c-fall", Math.round(140 + Math.random() * 220) + "px");
            s.setProperty("--ds-c-spin", spin + "deg");
            s.setProperty("--ds-c-size", (7 + Math.random() * 7).toFixed(1) + "px");
            s.setProperty("--ds-c-ratio", Math.random() < 0.45 ? "1" : "0.5");
            s.setProperty("--ds-c-radius", Math.random() < 0.4 ? "50%" : "2px");
            s.setProperty("--ds-c-color", colors[i % colors.length]);
            s.setProperty("--ds-c-delay", Math.round(Math.random() * 140) + "ms");
            frag.appendChild(piece);
        }

        els.confetti.appendChild(frag);
        confettiTimer = setTimeout(clearConfetti, cfg.confettiMs + 300);
    }

    function setCopyForMode(mode, streakCount) {
        if (mode === "danger") {
            setTitleText(copy("streakInDanger"), false);
            els.subtitle.textContent = "";
            if (els.keepLabel) els.keepLabel.textContent = copy("streakKeepMine");
            if (els.resetBtn) els.resetBtn.textContent = copy("streakReset");
            if (els.cta) els.cta.textContent = copy("streakClose");
            els.root.classList.remove("ds-zero");
            return;
        }
        if (mode === "recovered") {
            setTitleText(copy("streakRecovered"));
            els.subtitle.textContent = copy("streakMovedUp");
            els.cta.textContent = copy("streakContinue");
            els.root.classList.remove("ds-zero");
            return;
        }
        if (mode === "celebrate") {
            setTitleText(streakCount === 1
                ? copy("streakFirstWin")
                : copy("streakMovedUpTitle"));
            els.subtitle.textContent = copy("streakMovedUp");
            els.cta.textContent = copy("streakContinue");
            els.root.classList.remove("ds-zero");
        } else if (streakCount <= 0) {
            // Full sentence, so no per-letter stagger.
            setTitleText(copy("streakNotLit"), false);
            els.subtitle.textContent = copy("streakComePlay");
            els.cta.textContent = copy("streakClose");
            els.root.classList.add("ds-zero");
        } else {
            setTitleText(streakCount === 1
                ? copy("streakFirstWin")
                : copy("streakMovedUpTitle"));
            els.subtitle.textContent = copy("streakMovedUp");
            els.cta.textContent = copy("streakClose");
            els.root.classList.remove("ds-zero");
        }
    }

    function revealContinueButton() {
        if (!els || !els.cta) return;
        els.root.classList.remove("ds-cta-pending", "ds-busy");
        els.root.classList.add("ds-cta-reveal");
        els.cta.disabled = false;
    }

    function finishCelebrateMoment(finalCount) {
        if (!els) return;
        els.root.classList.remove("ds-celebrating", "ds-count-burst");
        if (els.badge) els.badge.classList.remove("ds-count-burst");
        els.root.classList.add("ds-ready");

        if (rewardMomentPending) {
            rewardMomentPending = false;
            if (els.giftSlot && els.giftSlot.parentNode) {
                els.giftSlot.classList.remove("ds-gift-tease");
                els.giftSlot.classList.add("ds-gift-pulse");
                // Second, smaller burst off the crate — this is the cycle payoff.
                spawnConfetti(els.giftSlot, 0.7);
            }
            if (typeof cfg.onRewardUnlocked === "function") {
                try { cfg.onRewardUnlocked(); } catch (_) { /* ignore */ }
            }
            scheduleOpenStep(() => { showBubble(); }, 180);
        } else if (finalCount > 0 && els.giftSlot && els.giftSlot.parentNode) {
            const win = getTrackWindow(finalCount);
            if (win.showGift) {
                const giftDay = win.giftDay || (win.start + win.length - 1);
                if (finalCount >= Math.max(win.start, giftDay - 2) && finalCount < giftDay) {
                    els.giftSlot.classList.add("ds-gift-tease");
                }
            }
            maybeAutoShowFirstVisitTooltip();
        } else {
            maybeAutoShowFirstVisitTooltip();
        }

        // Hold Continue until continueRevealMs after the tick settles.
        scheduleOpenStep(() => { revealContinueButton(); }, cfg.continueRevealMs);
    }

    function runCelebrateTick(finalCount, dayToLight) {
        if (!els) return;

        // Hold on the previous count / unlit track, then punch number + day
        // together so the badge roll and the node light land on one beat.
        const holdMs = dayToLight > 0
            ? cfg.trackFillMs
            : Math.floor(cfg.trackFillMs * 0.35);

        scheduleOpenStep(() => {
            setBadgeNumber(finalCount, true);

            if (els.badge) {
                els.badge.classList.add("ds-active", "ds-count-burst");
            }
            els.root.classList.add("ds-count-burst");
            spawnConfetti(); // self-gates on confettiCount / reduced motion
            emit("onCountTick", finalCount);

            justLitDay = dayToLight;
            renderTrack({ filledStreak: finalCount, windowFor: finalCount });
            if (dayToLight > 0) {
                emit("onSlotLit", {
                    day: dayToLight,
                    count: finalCount,
                    cycleLength: rewardMeta().cycleLength
                });
            }

            scheduleOpenStep(
                () => { finishCelebrateMoment(finalCount); },
                dayToLight > 0 ? Math.max(120, Math.floor(cfg.slotLitMs * 0.55)) : 80
            );
        }, holdMs);
    }

    function startOpenSequence(mode, finalCount) {
        clearOpenSequence();
        applyTimingVars();

        const reduced = prefersReducedMotion();
        const celebrate = mode === "celebrate" && finalCount > 0;
        const prevCount = celebrate ? Math.max(0, finalCount - 1) : finalCount;
        const dayToLight = celebrate && finalCount > prevCount ? finalCount : 0;

        if (celebrate) {
            justLitDay = 0;
            setBadgeNumber(prevCount, false);
            if (els.badge) els.badge.classList.toggle("ds-active", prevCount > 0);

            // On a window roll (e.g. 7→8), open on the new 8–14 set empty, then light.
            const finalWin = getTrackWindow(finalCount);
            const prevWin = getTrackWindow(prevCount);
            const preFilled = finalWin.start !== prevWin.start
                ? finalWin.start - 1
                : prevCount;

            renderTrack({
                filledStreak: preFilled,
                windowFor: finalCount,
                suppressJustLit: true,
                cascade: true
            });
            els.root.classList.add("ds-celebrating", "ds-busy", "ds-cta-pending");
            els.root.classList.remove("ds-cta-reveal");
            if (els.cta) els.cta.disabled = true;
        } else {
            justLitDay = 0;
            setBadgeNumber(finalCount, false);
            if (els.badge) els.badge.classList.toggle("ds-active", finalCount > 0);
            renderTrack({ filledStreak: finalCount, windowFor: finalCount, cascade: true });
            els.root.classList.remove("ds-cta-pending", "ds-cta-reveal");
        }

        // Retrigger entrance even if overlay was already shown this session.
        els.root.classList.remove("show", "ds-entering", "ds-ready");
        void els.root.offsetWidth;
        els.root.classList.add("show", "ds-entering");
        els.root.setAttribute("aria-hidden", "false");

        if (reduced) {
            els.root.classList.add("ds-ready");
            if (celebrate) {
                justLitDay = dayToLight;
                setBadgeNumber(finalCount, false);
                if (els.badge) els.badge.classList.add("ds-active");
                renderTrack({ filledStreak: finalCount, windowFor: finalCount });
                emit("onCountTick", finalCount);
                if (dayToLight > 0) {
                    emit("onSlotLit", { day: dayToLight, count: finalCount, cycleLength: rewardMeta().cycleLength });
                }
                finishCelebrateMoment(finalCount);
            } else {
                if (els.cta) els.cta.disabled = false;
                maybeAutoShowFirstVisitTooltip();
            }
            return;
        }

        const badgeSettle = cfg.openFadeMs + Math.floor(cfg.badgePopMs * 0.72);
        if (celebrate) {
            scheduleOpenStep(() => { runCelebrateTick(finalCount, dayToLight); }, badgeSettle);
        } else {
            // Let the staggered copy / track / CTA finish before freezing enter state.
            const entranceDone = cfg.openFadeMs + Math.max(cfg.badgePopMs, 920);
            scheduleOpenStep(() => {
                els.root.classList.add("ds-ready");
                if (els.cta) els.cta.disabled = false;
                maybeAutoShowFirstVisitTooltip();
            }, entranceDone);
        }
    }

    function openOverlay(mode) {
        ensureDom(cfg.root);
        flowMode = mode;
        open = true;
        hideBubble();
        const danger = mode === "danger";
        const rawCount = Math.max(0, state.streakCount | 0);
        const display = mode === "celebrate" ? state.streakCount
            : (danger ? rawCount : effectiveStreakForDisplay());
        // Next day they needed — use that day's window so day 8 warns on 8–14.
        const warnDay = danger && rawCount > 0 ? (rawCount + 1) : 0;
        const trackWindowFor = danger && warnDay > 0 ? warnDay : display;

        setCopyForMode(mode, display);
        if (els.dangerActions) els.dangerActions.hidden = !danger;
        if (els.cta) els.cta.hidden = !!danger;
        els.root.classList.toggle("ds-danger", danger);
        els.root.classList.remove("ds-recovered");

        if (danger) {
            clearOpenSequence();
            applyTimingVars();
            setBadgeNumber(display, false);
            if (els.badge) els.badge.classList.toggle("ds-active", display > 0);
            renderTrack({
                filledStreak: display,
                windowFor: trackWindowFor,
                warnDay: warnDay,
                cascade: true
            });
            els.root.classList.remove("show", "ds-entering", "ds-ready", "ds-cta-pending");
            void els.root.offsetWidth;
            els.root.classList.add("show", "ds-entering", "ds-ready");
            els.root.setAttribute("aria-hidden", "false");
            if (els.keepBtn) els.keepBtn.disabled = false;
            if (els.resetBtn) els.resetBtn.disabled = false;
        } else {
            startOpenSequence(mode, display);
        }

        if (typeof cfg.onOpen === "function") {
            try { cfg.onOpen(mode); } catch (_) { /* ignore */ }
        }
    }

    function finishFlow() {
        const detail = pendingDetail;
        pendingDetail = null;
        hide();
        RefreshHomePill();
        if (typeof cfg.onStreakFlowDone === "function") {
            try { cfg.onStreakFlowDone(detail || {}); } catch (_) { /* ignore */ }
        }
    }

    function onCta() {
        emit("onCtaPress");
        if (flowMode === "celebrate" || flowMode === "recovered") {
            finishFlow();
        } else if (flowMode === "danger") {
            // Primary CTA is the gold Keep button; Close path unused in danger.
            hide();
        } else {
            hide();
        }
    }

    let dangerBusy = false;

    function onKeepStreak() {
        if (flowMode !== "danger" || dangerBusy) return;
        emit("onKeepStreakPress");
        dangerBusy = true;
        const finish = (recovered) => {
            dangerBusy = false;
            if (!recovered) return;
            playRecoveredMoment();
        };
        if (typeof cfg.onKeepStreak === "function") {
            try {
                const maybe = cfg.onKeepStreak();
                if (maybe && typeof maybe.then === "function") {
                    maybe.then((ok) => finish(!!ok)).catch(() => { dangerBusy = false; });
                    return;
                }
                finish(!!maybe);
                return;
            } catch (_) {
                dangerBusy = false;
                return;
            }
        }
        // Default: no host hook — refuse rather than free-granting the streak.
        finish(false);
    }

    function onResetStreak() {
        if (flowMode !== "danger" || dangerBusy) return;
        emit("onResetStreakPress");
        Reset();
        hide();
        if (typeof cfg.onResetStreak === "function") {
            try { cfg.onResetStreak(); } catch (_) { /* ignore */ }
        }
    }

    function playRecoveredMoment() {
        ensureDom(cfg.root);
        flowMode = "recovered";
        open = true;
        hideBubble();
        const count = effectiveStreakForDisplay();
        setCopyForMode("recovered", count);
        if (els.dangerActions) els.dangerActions.hidden = true;
        if (els.cta) {
            els.cta.hidden = false;
            els.cta.disabled = false;
        }
        els.root.classList.remove("ds-danger");
        els.root.classList.add("ds-recovered");
        setBadgeNumber(count, true);
        if (els.badge) els.badge.classList.add("ds-active", "ds-count-burst");
        renderTrack({ filledStreak: count, windowFor: count });
        spawnConfetti();
        els.root.classList.add("show", "ds-ready");
        els.root.setAttribute("aria-hidden", "false");
        scheduleOpenStep(() => {
            if (els.badge) els.badge.classList.remove("ds-count-burst");
            revealContinueButton();
        }, 700);
    }

    function hide() {
        if (!els) return;
        open = false;
        dangerBusy = false;
        clearOpenSequence();
        hideBubble();
        justLitDay = 0;
        rewardMomentPending = false;
        els.root.classList.remove(
            "show", "ds-zero", "ds-entering", "ds-ready", "ds-celebrating",
            "ds-danger", "ds-recovered"
        );
        els.root.setAttribute("aria-hidden", "true");
        if (els.dangerActions) els.dangerActions.hidden = true;
        if (els.cta) els.cta.hidden = false;
        if (typeof cfg.onClose === "function") {
            try { cfg.onClose(); } catch (_) { /* ignore */ }
        }
    }

    /**
     * Open streak UI. opts.mode: "home" | "celebrate" | "danger"
     */
    function ShowStreakPopup(opts) {
        opts = opts || {};
        const mode = opts.mode === "celebrate" ? "celebrate"
            : (opts.mode === "danger" ? "danger" : "home");
        rewardMomentPending = false;
        justLitDay = 0;
        openOverlay(mode);
        return api;
    }

    function ShowStreakDangerPopup() {
        if (!isStreakInDanger()) return false;
        ShowStreakPopup({ mode: "danger" });
        return true;
    }

    function notifyFlowDone(detail) {
        if (typeof cfg.onStreakFlowDone === "function") {
            try { cfg.onStreakFlowDone(detail || {}); } catch (_) { /* ignore */ }
        }
    }

    /**
     * Host level-clear hook. Ticks local-day streak at most once per day.
     * Shows celebration when ticked; otherwise forwards immediately.
     */
    function OnLevelComplete(detail) {
        detail = detail || {};
        const result = applyWinForToday();
        RefreshHomePill();

        if (!result.ticked) {
            notifyFlowDone(detail);
            return false;
        }

        const today = localDayKey();
        if (state.lastCelebratedDay === today) {
            notifyFlowDone(detail);
            return false;
        }

        state.lastCelebratedDay = today;
        saveState();
        pendingDetail = detail;
        rewardMomentPending = !!result.unlockedNow;
        justLitDay = 0;
        openOverlay("celebrate");
        return true;
    }

    function bindLevelCompleteListener() {
        if (levelCompleteBound || typeof document === "undefined") return;
        levelCompleteHandler = function (event) {
            OnLevelComplete((event && event.detail) || {});
        };
        document.addEventListener(cfg.levelCompleteEvent, levelCompleteHandler);
        levelCompleteBound = true;
    }

    function unbindLevelCompleteListener() {
        if (!levelCompleteBound || !levelCompleteHandler) return;
        document.removeEventListener(cfg.levelCompleteEvent, levelCompleteHandler);
        levelCompleteBound = false;
        levelCompleteHandler = null;
    }

    function GetStreakCount() {
        return effectiveStreakForDisplay();
    }

    function GetState() {
        const display = effectiveStreakForDisplay();
        const win = getTrackWindow(display);
        const meta = rewardMeta();
        return {
            streakCount: state.streakCount,
            displayStreak: display,
            lastWinDay: state.lastWinDay,
            unlocked: state.unlocked.slice(),
            lastCelebratedDay: state.lastCelebratedDay,
            filledDays: filledDays(),
            cycleLength: meta.cycleLength,
            rewardDay: meta.rewardDay,
            trackWindowStart: win.start,
            trackWindowEnd: win.start + win.length - 1,
            trackShowsGift: win.showGift,
            giftDay: win.giftDay || 0
        };
    }

    function Reset() {
        state = {
            streakCount: 0,
            lastWinDay: null,
            unlocked: [],
            lastCelebratedDay: null,
            seenRewardTooltip: false
        };
        try { localStorage.removeItem(cfg.storageKey); } catch (_) { /* ignore */ }
        justLitDay = 0;
        lastPillCount = null; // a debug reset shouldn't punch the pill
        clearOpenSequence();
        hideBubble();
        if (open) hide();
        RefreshHomePill();
        return api;
    }

    /**
     * Debug / test helper: force the current streak day value.
     * Sets lastWinDay to today so the home pill shows the count immediately.
     * Clears lastCelebratedDay so the next real win can celebrate again.
     * @param {number} day
     */
    function SetStreakDay(day) {
        const n = Math.max(0, parseInt(day, 10) || 0);
        state.streakCount = n;
        if (n <= 0) {
            state.lastWinDay = null;
            state.lastCelebratedDay = null;
        } else {
            state.lastWinDay = localDayKey();
            state.lastCelebratedDay = null;
            grantDay7IfNeeded();
        }
        saveState();
        justLitDay = 0;
        RefreshHomePill();
        if (open) {
            const display = effectiveStreakForDisplay();
            if (els) {
                setBadgeNumber(display, false);
                if (els.badge) els.badge.classList.toggle("ds-active", display > 0);
                setCopyForMode(flowMode === "celebrate" ? "home" : flowMode, display);
                renderTrack({ filledStreak: display, windowFor: display });
            }
        }
        return api;
    }

    /**
     * Debug: +1 day on the streak and run the full celebrate overlay.
     * Rewinds lastWinDay to yesterday so the calendar gate always allows a tick
     * (even if you already won today). Host can detect detail.__debugStreak and
     * skip chaining the win card / ProgressRewards.
     * @returns {boolean} true if celebration opened
     */
    function DebugAdvanceAndCelebrate() {
        // Keep the existing count; pretend the last win was yesterday so the
        // next applyWinForToday continues rather than resetting after a gap.
        if (state.streakCount > 0) {
            state.lastWinDay = yesterdayKey();
        } else {
            state.lastWinDay = null;
        }
        state.lastCelebratedDay = null;
        saveState();

        const result = applyWinForToday();
        RefreshHomePill();
        if (!result.ticked) return false;

        state.lastCelebratedDay = localDayKey();
        saveState();
        pendingDetail = { __debugStreak: true };
        rewardMomentPending = !!result.unlockedNow;
        justLitDay = 0;
        openOverlay("celebrate");
        return true;
    }

    function init(options) {
        options = options || {};
        const dataCfg = readDataCfg();
        cfg.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
        cfg.getCopy = options.getCopy || null;
        cfg.onOpen = options.onOpen || null;
        cfg.onClose = options.onClose || null;
        cfg.onRewardUnlocked = options.onRewardUnlocked || null;
        cfg.onStreakFlowDone = options.onStreakFlowDone || null;
        cfg.onCountTick = options.onCountTick || null;
        cfg.onSlotLit = options.onSlotLit || null;
        cfg.onCtaPress = options.onCtaPress || null;
        cfg.onGiftPress = options.onGiftPress || null;
        cfg.onKeepStreak = typeof options.onKeepStreak === "function" ? options.onKeepStreak : null;
        cfg.onResetStreak = typeof options.onResetStreak === "function" ? options.onResetStreak : null;
        cfg.root = options.root || null;
        cfg.homeRoot = options.homeRoot || null;
        cfg.levelCompleteEvent = options.levelCompleteEvent || dataCfg.levelCompleteEvent;
        cfg.listenToLevelComplete = typeof options.listenToLevelComplete === "boolean"
            ? options.listenToLevelComplete
            : dataCfg.listenToLevelComplete;
        cfg.cycleLength = Math.max(1, parseInt(options.cycleLength, 10) || dataCfg.cycleLength);
        syncCycleFromData();
        [
            "openFadeMs", "badgePopMs", "trackFillMs", "countPopMs", "slotLitMs",
            "continueRevealMs", "numRollMs", "slotCascadeMs", "confettiMs", "confettiCount"
        ].forEach((key) => {
            const fromOpt = Number(options[key]);
            cfg[key] = fromOpt >= 0 ? fromOpt : dataCfg[key];
        });
        cfg.showBurst = typeof options.showBurst === "boolean" ? options.showBurst : dataCfg.showBurst;
        cfg.titleLetterPop = typeof options.titleLetterPop === "boolean"
            ? options.titleLetterPop
            : dataCfg.titleLetterPop;
        cfg.confettiColors = (Array.isArray(options.confettiColors) && options.confettiColors.length)
            ? options.confettiColors.slice()
            : dataCfg.confettiColors;
        const skinOpt = options.chestSkin || dataCfg.chestSkin;
        cfg.chestSkin = (skinOpt === "Blue" || skinOpt === "Red") ? skinOpt : "Green";
        const giftOpt = Number(options.giftSizePx);
        cfg.giftSizePx = giftOpt >= 32 ? giftOpt : dataCfg.giftSizePx;

        loadState();
        ensureDom(cfg.root);
        applyGiftSize();
        applyTimingVars();
        ensureHomePill(cfg.homeRoot);
        RefreshHomePill();
        unbindLevelCompleteListener();
        if (cfg.listenToLevelComplete) bindLevelCompleteListener();
        return api;
    }

    function isOpen() {
        return open;
    }

    const api = {
        init,
        OnLevelComplete,
        ShowStreakPopup,
        ShowStreakDangerPopup,
        RefreshHomePill,
        GetStreakCount,
        GetState,
        HasUnlockedStreakReward,
        Reset,
        SetStreakDay,
        DebugAdvanceAndCelebrate,
        isStreakInDanger,
        recoverStreak,
        isOpen,
        hide,
        // aliases
        Init: init,
        showStreakPopup: ShowStreakPopup,
        showStreakDangerPopup: ShowStreakDangerPopup,
        refreshHomePill: RefreshHomePill,
        getStreakCount: GetStreakCount,
        getState: GetState,
        hasUnlockedStreakReward: HasUnlockedStreakReward,
        reset: Reset,
        setStreakDay: SetStreakDay,
        debugAdvanceAndCelebrate: DebugAdvanceAndCelebrate,
        // test helpers
        _localDayKey: localDayKey,
        _yesterdayKey: yesterdayKey
    };

    window.DailyStreak = api;
})();
