// OWNER: shared — portable Progress Reward System.
// Contract: completedLevel is how many levels the player has finished (1-based
// count). Prefer UpdateProgress() (+1 per clear). ShowSessionProgressPopup() for
// the first progress peek of a play session. ShowProgressPopup() always opens UI.
"use strict";

(function () {
    const DEFAULT_STORAGE_KEY = "progress_rewards";
    const CHEST_CLOSED = "ProgressRewards/Assets/chest_closed.png";
    const CHEST_OPEN = "ProgressRewards/Assets/chest_open.png";
    const CHEST_SPINE_JSON = "ProgressRewards/Assets/RewardChests/RewardBox.json";
    const CHEST_SPINE_ATLAS = "ProgressRewards/Assets/RewardChests/RewardBox.atlas";
    const CHEST_ANIM_IDLE = "Anim-RewardBox-Idle";
    const CHEST_ANIM_OPEN = "Anim-RewardBox-Open";
    // Bar: framed on the resting box (icon slot).
    const BAR_CHEST_VIEWPORT = {
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
    // Center: one camera for Idle + Open so the box doesn't shrink when Open
    // starts. Wide enough for Open FX; .pr-center-spine CSS bleed lets FX spill.
    const CENTER_CHEST_VIEWPORT = {
        x: -900,
        y: -900,
        width: 1800,
        height: 1800,
        padLeft: "4%",
        padRight: "4%",
        padTop: "4%",
        padBottom: "4%",
        transitionTime: 0
    };
    const BAR_VIEWPORT_SIZE = BAR_CHEST_VIEWPORT.width;
    const CENTER_VIEWPORT_SIZE = CENTER_CHEST_VIEWPORT.width;
    const FALLBACK_COPY = {
        prLevelsLeft: "Next unlock in {n} wins",
        prLevelsLeftOne: "Next unlock in 1 win",
        prClaim: "Claim",
        prClaimContinue: "Continue",
        prRewardUnlocked: "Reward unlocked!",
        prNewFeature: "New Feature!",
        prAllComplete: "All rewards collected!",
        prClose: "Close",
        prLabelHintPack: "Hint Pack",
        prDescHintPack: "Three hints to help you through tough levels.",
        prLabelCustomShape: "Custom Shapes",
        prDescCustomShape: "Boards can skip tiles — plan around the gaps.",
        prDescNewAnimal: "A new animal friend for your blocks.",
        streakNewAnimal: "New Animal",
        tutorialFixedTitle: "Expanded Blocks",
        tutorialFixedDescription: "These blocks are already full and cannot shrink.",
        tutorialLockedTitle: "Static Blocks",
        tutorialLockedDescription: "These blocks cannot be moved, but you can still expand them.",
        tutorialArrowTitle: "Arrow Blocks",
        tutorialArrowDescription: "These blocks can only move in the direction of their arrows."
    };

    const DEFAULT_TIMING = {
        barAnimDelay: 350,
        barAnimMs: 280,
        barSectionPopMs: 180,
        chestOpenMs: 1600,
        chestFlyMs: 550,
        chestPrizeRevealMs: 650,
        prizeEmergeMs: 700,
        prizeSettleMs: 420,
        claimOutMs: 300,
        prizeShowMs: 1600,
        confettiMs: 1700,
        nextTierPeekMs: 700,
        statusHoldMs: 1200,
        nextTierBarAnimMs: 600
    };

    const DEFAULT_SIZES = {
        chestBarSizePx: 64,
        chestCenterSizePx: 360
    };

    const DEFAULT_CONFETTI_COLORS = [
        "#f3c33d", "#f09a42", "#45c977", "#5bc6d5",
        "#f04e66", "#a979de", "#fff3d0", "#627ce8"
    ];

    let cfg = {
        storageKey: DEFAULT_STORAGE_KEY,
        getCopy: null,
        onClose: null,
        onClaim: null,
        onComplete: null,
        onBarFilled: null,
        onChestUnlockStart: null,
        onChestOpen: null,
        onFeaturePopup: null,
        onBarProgress: null,
        onClaimPress: null,
        root: null,
        embed: false,
        showOnLevelComplete: "every",
        levelCompleteEvent: "kpf:levelComplete",
        listenToLevelComplete: true,
        barAnimDelay: DEFAULT_TIMING.barAnimDelay,
        barAnimMs: DEFAULT_TIMING.barAnimMs,
        barSectionPopMs: DEFAULT_TIMING.barSectionPopMs,
        chestOpenMs: DEFAULT_TIMING.chestOpenMs,
        chestFlyMs: DEFAULT_TIMING.chestFlyMs,
        chestPrizeRevealMs: DEFAULT_TIMING.chestPrizeRevealMs,
        prizeEmergeMs: DEFAULT_TIMING.prizeEmergeMs,
        prizeSettleMs: DEFAULT_TIMING.prizeSettleMs,
        claimOutMs: DEFAULT_TIMING.claimOutMs,
        prizeShowMs: DEFAULT_TIMING.prizeShowMs,
        chestBarSizePx: DEFAULT_SIZES.chestBarSizePx,
        chestCenterSizePx: DEFAULT_SIZES.chestCenterSizePx,
        // Width fraction where the track groove meets the end circle. Last clear
        // alone floods  barCircleStart→1; earlier clears stay in the groove.
        barCircleStart: 0.765,
        chestSkin: "Green",
        nextTierPeekMs: DEFAULT_TIMING.nextTierPeekMs,
        statusHoldMs: DEFAULT_TIMING.statusHoldMs,
        nextTierBarAnimMs: DEFAULT_TIMING.nextTierBarAnimMs,
        confettiCount: 26,
        confettiMs: DEFAULT_TIMING.confettiMs,
        confettiColors: DEFAULT_CONFETTI_COLORS.slice(),
        showUnlockFlash: true,
        titleLetterPop: true
    };

    let state = {
        completedLevel: 0,
        unlocked: [],
        lastShownLevel: 0,
        lastGameLevelCleared: 0,
        loopClaims: 0
    };

    let els = null;
    let open = false;
    let flowToken = 0;
    let sessionProgressShown = false;
    let claimSkipResolve = null;
    let levelCompleteBound = false;
    let levelCompleteHandler = null;
    let spinePlayer = null;
    let spineReady = false;
    let spineFailed = false;
    let spineLoadPromise = null;
    let barSpinePlayer = null;
    let barSpineReady = false;
    let barSpineFailed = false;
    let barSpineLoadPromise = null;

    function spineApiAvailable() {
        return !!(window.spine && typeof window.spine.SpinePlayer === "function");
    }

    // Older RewardBox skins tinted a backdrop circle blue; harmless no-op if absent.
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

    function createSpinePlayer(host, opts) {
        opts = opts || {};
        return new Promise((resolve) => {
            let settled = false;
            const finish = (player) => {
                if (settled) return;
                settled = true;
                resolve(player);
            };
            try {
                const player = new window.spine.SpinePlayer(host, {
                    jsonUrl: CHEST_SPINE_JSON,
                    atlasUrl: CHEST_SPINE_ATLAS,
                    animation: opts.animation || CHEST_ANIM_IDLE,
                    skin: opts.skin || cfg.chestSkin || "Green",
                    showControls: false,
                    showLoading: false,
                    alpha: true,
                    backgroundColor: "#00000000",
                    premultipliedAlpha: false,
                    viewport: opts.viewport || CENTER_CHEST_VIEWPORT,
                    success: (p) => {
                        hideRewardBoxCircle(p);
                        // Always land on idle after load — never leave a prior open pose.
                        try {
                            p.setAnimation(CHEST_ANIM_IDLE, true);
                        } catch (_) { /* ignore */ }
                        hideRewardBoxCircle(p);
                        if (typeof opts.onSuccess === "function") opts.onSuccess(p);
                        finish(p);
                    },
                    frame: (p) => {
                        hideRewardBoxCircle(p);
                    },
                    error: (_p, msg) => {
                        console.warn("[ProgressRewards] Spine chest failed:", msg);
                        if (typeof opts.onError === "function") opts.onError(msg);
                        finish(null);
                    }
                });
                if (opts.assign) opts.assign(player);
            } catch (err) {
                console.warn("[ProgressRewards] Spine chest init error:", err);
                if (typeof opts.onError === "function") opts.onError(err);
                finish(null);
            }
        });
    }

    function setCenterChestFallback(openPose) {
        if (!els || !els.centerChest) return;
        els.centerChest.hidden = false;
        if (els.spineHost) els.spineHost.hidden = true;
        els.centerChest.src = openPose ? CHEST_OPEN : CHEST_CLOSED;
        els.centerChest.style.opacity = "";
    }

    function setCenterChestVisible(useSpine) {
        if (!els) return;
        if (els.centerChest) els.centerChest.hidden = !!useSpine;
        if (els.spineHost) {
            els.spineHost.hidden = !useSpine;
            if (useSpine) els.spineHost.style.opacity = "";
        }
        if (els.centerChest && !useSpine) els.centerChest.style.opacity = "";
    }

    function setBarChestFallback(openPose) {
        if (!els || !els.barChest) return;
        els.barChest.hidden = false;
        if (els.barSpineHost) els.barSpineHost.hidden = true;
        els.barChest.src = openPose ? CHEST_OPEN : CHEST_CLOSED;
    }

    function setBarChestVisible(useSpine) {
        if (!els) return;
        if (els.barChest) els.barChest.hidden = !!useSpine;
        if (els.barSpineHost) els.barSpineHost.hidden = !useSpine;
    }

    function setBarChestReady(ready) {
        if (!els) return;
        if (els.barChestWrap) els.barChestWrap.classList.toggle("is-ready", !!ready);
        if (els.barChest) els.barChest.classList.toggle("is-ready", !!ready);
    }

    function ensureSpinePlayer() {
        if (spineFailed || !els || !els.spineHost) {
            return Promise.resolve(null);
        }
        if (spineReady && spinePlayer) return Promise.resolve(spinePlayer);
        if (spineLoadPromise) return spineLoadPromise;
        if (!spineApiAvailable()) {
            spineFailed = true;
            setCenterChestFallback(false);
            return Promise.resolve(null);
        }

        spineLoadPromise = createSpinePlayer(els.spineHost, {
            animation: CHEST_ANIM_IDLE,
            viewport: CENTER_CHEST_VIEWPORT,
            assign: (player) => { spinePlayer = player; },
            onSuccess: () => {
                spineReady = true;
                setCenterChestVisible(true);
            },
            onError: () => {
                spineFailed = true;
                spineReady = false;
                setCenterChestFallback(false);
            }
        });
        return spineLoadPromise;
    }

    function ensureBarSpinePlayer() {
        if (barSpineFailed || !els || !els.barSpineHost) {
            return Promise.resolve(null);
        }
        if (barSpineReady && barSpinePlayer) return Promise.resolve(barSpinePlayer);
        if (barSpineLoadPromise) return barSpineLoadPromise;
        if (!spineApiAvailable()) {
            barSpineFailed = true;
            setBarChestFallback(false);
            return Promise.resolve(null);
        }

        barSpineLoadPromise = createSpinePlayer(els.barSpineHost, {
            animation: CHEST_ANIM_IDLE,
            viewport: BAR_CHEST_VIEWPORT,
            assign: (player) => { barSpinePlayer = player; },
            onSuccess: () => {
                barSpineReady = true;
                setBarChestVisible(true);
            },
            onError: () => {
                barSpineFailed = true;
                barSpineReady = false;
                setBarChestFallback(false);
            }
        });
        return barSpineLoadPromise;
    }

    function ensureAllSpinePlayers() {
        return Promise.all([ensureSpinePlayer(), ensureBarSpinePlayer()]);
    }

    function playChestIdle() {
        setCenterChestVisible(spineReady && !spineFailed);
        if (!spineReady || !spinePlayer) {
            setCenterChestFallback(false);
            return Promise.resolve();
        }
        try {
            spinePlayer.setAnimation(CHEST_ANIM_IDLE, true);
            if (els.spineHost) els.spineHost.style.opacity = "";
        } catch (_) {
            setCenterChestFallback(false);
        }
        return Promise.resolve();
    }

    function playBarChestIdle() {
        setBarChestVisible(barSpineReady && !barSpineFailed);
        if (!barSpineReady || !barSpinePlayer) {
            setBarChestFallback(false);
            return Promise.resolve();
        }
        try {
            barSpinePlayer.setAnimation(CHEST_ANIM_IDLE, true);
        } catch (_) {
            setBarChestFallback(false);
        }
        return Promise.resolve();
    }

    function holdChestOpenPose() {
        setCenterChestVisible(spineReady && !spineFailed);
        if (!spineReady || !spinePlayer || !spinePlayer.animationState) {
            setCenterChestFallback(true);
            return;
        }
        try {
            const entry = spinePlayer.setAnimation(CHEST_ANIM_OPEN, false);
            if (entry && entry.animation) {
                entry.trackTime = entry.animation.duration;
            }
            if (els.spineHost) els.spineHost.style.opacity = "";
        } catch (_) {
            setCenterChestFallback(true);
        }
    }

    function playChestOpen() {
        return ensureSpinePlayer().then((player) => {
            if (!player || !player.animationState) {
                setCenterChestFallback(true);
                return wait(timingMs("chestOpenMs", DEFAULT_TIMING.chestOpenMs));
            }
            setCenterChestVisible(true);
            if (els.spineHost) els.spineHost.style.opacity = "";
            return new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    resolve();
                };
                const listener = {
                    complete: (entry) => {
                        if (!entry || !entry.animation) return;
                        if (entry.animation.name !== CHEST_ANIM_OPEN) return;
                        try { player.animationState.removeListener(listener); } catch (_) { /* ignore */ }
                        finish();
                    }
                };
                try {
                    player.animationState.addListener(listener);
                    player.setAnimation(CHEST_ANIM_OPEN, false);
                } catch (_) {
                    setCenterChestFallback(true);
                    finish();
                    return;
                }
                // Safety net if the complete event is missed.
                setTimeout(finish, timingMs("chestOpenMs", DEFAULT_TIMING.chestOpenMs) + 500);
            });
        });
    }

    function parkCenterChest() {
        if (!els || !els.centerStage) return;
        els.centerStage.classList.remove("pr-flying");
        els.centerStage.style.transition = "";
        els.centerStage.style.transform = "";
        els.centerStage.classList.add("pr-parked");
        fadeCenterChest(1);
        playChestIdle();
    }

    function applyChestSizes() {
        if (!els || !els.root) return;
        const bar = Math.max(24, Number(cfg.chestBarSizePx) || DEFAULT_SIZES.chestBarSizePx);
        const center = Math.max(80, Number(cfg.chestCenterSizePx) || DEFAULT_SIZES.chestCenterSizePx);
        els.root.style.setProperty("--pr-chest-bar-size", bar + "px");
        els.root.style.setProperty("--pr-chest-center-size", center + "px");
    }

    /** Publish JS-side durations to CSS so the reveal beats land on the waits. */
    function applyMotionVars() {
        if (!els || !els.root) return;
        els.root.style.setProperty("--pr-settle-ms", settleMs() + "ms");
        els.root.style.setProperty("--pr-claim-out-ms", claimOutMs() + "ms");
        els.root.style.setProperty("--pr-confetti-ms", confettiMs() + "ms");
    }

    function settleMs() {
        return timingMs("prizeSettleMs", DEFAULT_TIMING.prizeSettleMs);
    }

    function claimOutMs() {
        return timingMs("claimOutMs", DEFAULT_TIMING.claimOutMs);
    }

    function confettiMs() {
        return Math.max(200, timingMs("confettiMs", DEFAULT_TIMING.confettiMs));
    }

    function prefersReducedMotion() {
        return typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /** Chest centre in viewport px — the launch point for flash and confetti. */
    function fxOrigin() {
        const fallback = {
            x: (window.innerWidth || 360) / 2,
            y: (window.innerHeight || 640) * 0.42
        };
        if (!els || !els.centerStage) return fallback;
        const rect = els.centerStage.getBoundingClientRect();
        if (!rect.width || !rect.height) return fallback;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function clearFx() {
        if (!els || !els.fx) return;
        els.fx.textContent = "";
    }

    /**
     * Flash + shockwave + confetti burst from the chest. Purely decorative:
     * nothing in the flow waits on it, so it can be tuned to zero via config.
     */
    function spawnUnlockFx() {
        if (!els || !els.fx || prefersReducedMotion()) return;
        const count = Math.max(0, Number(cfg.confettiCount) || 0);
        const flash = cfg.showUnlockFlash !== false;
        if (!count && !flash) return;

        clearFx();
        const origin = fxOrigin();
        const lifeMs = confettiMs();
        els.fx.style.setProperty("--pr-fx-x", origin.x.toFixed(1) + "px");
        els.fx.style.setProperty("--pr-fx-y", origin.y.toFixed(1) + "px");
        els.fx.style.setProperty("--pr-confetti-ms", lifeMs + "ms");

        const frag = document.createDocumentFragment();
        if (flash) {
            const glare = document.createElement("div");
            glare.className = "pr-flash";
            frag.appendChild(glare);
            const ring = document.createElement("div");
            ring.className = "pr-shock";
            frag.appendChild(ring);
        }

        const colors = (Array.isArray(cfg.confettiColors) && cfg.confettiColors.length)
            ? cfg.confettiColors
            : DEFAULT_CONFETTI_COLORS;
        const spread = Math.max(150, (window.innerWidth || 360) * 0.46);
        for (let i = 0; i < count; i++) {
            const piece = document.createElement("span");
            piece.className = "pr-confetti-piece";
            const dx = (Math.random() * 2 - 1) * spread;
            const peak = -(110 + Math.random() * 210);
            const dy = 240 + Math.random() * 320;
            const spin = (Math.random() * 2 - 1) * 900;
            const w = 7 + Math.random() * 7;
            const h = w * (1.2 + Math.random() * 0.9);
            const set = (name, value) => piece.style.setProperty(name, value);
            set("--pr-c-color", String(colors[i % colors.length]));
            set("--pr-c-w", w.toFixed(1) + "px");
            set("--pr-c-h", h.toFixed(1) + "px");
            set("--pr-c-dx", dx.toFixed(1) + "px");
            set("--pr-c-mx", (dx * 0.7).toFixed(1) + "px");
            set("--pr-c-peak", peak.toFixed(1) + "px");
            set("--pr-c-dy", dy.toFixed(1) + "px");
            set("--pr-c-spin", spin.toFixed(0) + "deg");
            set("--pr-c-half-spin", (spin * 0.5).toFixed(0) + "deg");
            set("--pr-c-delay", Math.floor(Math.random() * 170) + "ms");
            frag.appendChild(piece);
        }

        els.fx.appendChild(frag);
        setTimeout(clearFx, lifeMs + 500);
    }

    function unparkCenterChest() {
        if (!els || !els.centerStage) return;
        els.centerStage.classList.remove("pr-parked");
    }

    function setBarChestSlotVisible(visible) {
        if (!els) return;
        const slot = els.barChestWrap || els.barChest;
        if (!slot) return;
        slot.style.opacity = visible ? "" : "0";
        slot.style.pointerEvents = visible ? "" : "none";
    }

    function flyChestFromBarToCenter() {
        return ensureAllSpinePlayers().then(() => {
            if (!els || !els.centerStage) return;
            const stage = els.centerStage;
            const bar = els.barChestWrap || els.barChest;
            unparkCenterChest();
            playChestIdle();
            fadeCenterChest(1);
            setCenterChestVisible(spineReady && !spineFailed);

            if (!bar) return wait(0);

            // Force layout so we measure the true resting center slot.
            stage.style.transition = "none";
            stage.style.transform = "";
            // eslint-disable-next-line no-unused-expressions
            stage.offsetHeight;

            const barRect = bar.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            if (!barRect.width || !stageRect.width) return wait(0);

            const dx = (barRect.left + barRect.width / 2) - (stageRect.left + stageRect.width / 2);
            const dy = (barRect.top + barRect.height / 2) - (stageRect.top + stageRect.height / 2);
            // Bar uses a tighter camera than center, so CSS box ratio alone would
            // make the flying gift too small. Scale by viewport ratio so the
            // visible box matches the bar, then grows into the final center size.
            const vpScale = CENTER_VIEWPORT_SIZE / BAR_VIEWPORT_SIZE;
            const scale = Math.max(
                0.12,
                Math.min(
                    (barRect.width / stageRect.width) * vpScale,
                    (barRect.height / stageRect.height) * vpScale
                )
            );

            setBarChestSlotVisible(false);
            stage.classList.add("pr-flying");
            stage.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
            // eslint-disable-next-line no-unused-expressions
            stage.offsetHeight;

            const ms = timingMs("chestFlyMs", DEFAULT_TIMING.chestFlyMs);
            stage.style.transition =
                `transform ${ms}ms cubic-bezier(.2,.85,.25,1)`;
            stage.style.transform = "translate(0px, 0px) scale(1)";

            return new Promise((resolve) => {
                setTimeout(() => {
                    stage.style.transition = "";
                    stage.style.transform = "";
                    stage.classList.remove("pr-flying");
                    resolve();
                }, ms);
            });
        });
    }

    function hintGrantAmount(tier) {
        if (!tier) return 0;
        if (tier.grantItem === "HINT" || tier.grantItem === (window.ItemId && ItemId.HINT)) {
            const n = parseInt(tier.grantAmount, 10);
            return n > 0 ? n : 1;
        }
        const n = parseInt(tier.grantHints, 10);
        return n > 0 ? n : 0;
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

    /** Apply optional item / legacy grants from a claimed tier. */
    function applyTierGrants(tier) {
        if (!tier) return;

        if (tier.grantItem && window.Items && typeof Items.grant === "function") {
            const amount = parseInt(tier.grantAmount, 10);
            Items.grant(tier.grantItem, amount > 0 ? amount : 1);
            return;
        }

        // Legacy fields
        const hints = parseInt(tier.grantHints, 10);
        if (hints > 0 && window.Inventory && typeof Inventory.grantHints === "function") {
            Inventory.grantHints(hints);
        }
        if (tier.grantCharacter) applyCharacterGrant(tier.grantCharacter);
    }
    function setPrizeVisual(tier) {
        if (!els) return;
        const hints = hintGrantAmount(tier);
        const useHintPrize = hints > 0;
        if (els.prizeSprite) {
            if (useHintPrize) {
                els.prizeSprite.hidden = true;
                els.prizeSprite.removeAttribute("src");
            } else {
                els.prizeSprite.hidden = false;
                els.prizeSprite.src = (tier && tier.sprite) || "";
            }
        }
        if (els.hintPrize) {
            els.hintPrize.hidden = !useHintPrize;
            if (els.hintPrizePlus) {
                els.hintPrizePlus.textContent = useHintPrize ? ("+" + hints) : "";
            }
        }
        if (els.prizeCard) {
            els.prizeCard.classList.toggle("pr-hint-grant", useHintPrize);
        }
    }

    /**
     * Feature title. Splits into per-letter spans so they pop in on a stagger
     * (cfg.titleLetterPop); flat text when that is off or motion is reduced.
     */
    function setFeatureTitle(text) {
        if (!els || !els.featureTitle) return;
        const node = els.featureTitle;
        const value = String(text == null ? "" : text);
        node.textContent = "";
        node.removeAttribute("aria-label");
        if (!value) return;
        if (cfg.titleLetterPop === false || prefersReducedMotion()) {
            node.textContent = value;
            return;
        }
        node.setAttribute("aria-label", value);
        let visibleIndex = 0;
        Array.from(value).forEach((ch) => {
            const span = document.createElement("span");
            span.className = "pr-title-letter";
            span.textContent = ch;
            if (ch.trim()) {
                span.style.setProperty("--pr-letter-delay", (visibleIndex * 40) + "ms");
                visibleIndex++;
            }
            node.appendChild(span);
        });
    }

    function featureTitleFor(tier) {
        return hintGrantAmount(tier) ? copy("prRewardUnlocked") : copy("prNewFeature");
    }

    /** `tier.description` is a translations.js key (or legacy plain text). */
    function resolveDescription(tier) {
        const key = String((tier && tier.description) || "").trim();
        if (!key) return "";
        return copy(key);
    }

    /** `tier.label` is a translations.js key (or legacy plain text). */
    function resolveLabel(tier) {
        const key = String((tier && tier.label) || "").trim();
        if (!key) return String((tier && tier.rewardId) || "");
        return copy(key);
    }

    function revealPrizeEmerging(tier) {
        if (!els) return;
        setPrizeVisual(tier);
        els.prizeLabel.textContent = resolveLabel(tier);
        if (els.prizeDesc) {
            const desc = resolveDescription(tier);
            els.prizeDesc.textContent = desc;
            els.prizeDesc.hidden = !desc;
        }
        setFeatureTitle(featureTitleFor(tier));
        els.claimBtn.textContent = copy("prClaim");
        els.claimBtn.hidden = true;
        els.root.classList.add("pr-emerging");
        els.root.classList.remove("pr-revealing");
        fadeCenterChest(1);
    }

    function revealFeatureCard(tier) {
        if (!els) return;
        setPrizeVisual(tier);
        els.prizeLabel.textContent = resolveLabel(tier);
        if (els.prizeDesc) {
            const desc = resolveDescription(tier);
            els.prizeDesc.textContent = desc;
            els.prizeDesc.hidden = !desc;
        }
        setFeatureTitle(featureTitleFor(tier));
        els.claimBtn.textContent = copy("prClaim");
        els.claimBtn.hidden = false;
        els.root.classList.remove("pr-emerging");
        els.root.classList.add("pr-revealing");
        if (els.centerStage) els.centerStage.classList.add("pr-parked");
        fadeCenterChest(0);
        if (typeof cfg.onFeaturePopup === "function") {
            try { cfg.onFeaturePopup(tier); } catch (_) { /* ignore */ }
        }
    }

    function clearPrizeCard() {
        if (!els) return;
        if (els.prizeCard) {
            els.prizeCard.style.transition = "none";
            els.prizeCard.style.opacity = "0";
            els.prizeCard.style.pointerEvents = "none";
            els.prizeCard.classList.remove("pr-hint-grant");
        }
        if (els.prizeSprite) {
            els.prizeSprite.hidden = true;
            els.prizeSprite.removeAttribute("src");
            els.prizeSprite.style.animation = "none";
        }
        if (els.hintPrize) {
            els.hintPrize.hidden = true;
            if (els.hintPrizePlus) els.hintPrizePlus.textContent = "";
        }
        els.prizeLabel.textContent = "";
        if (els.prizeDesc) {
            els.prizeDesc.textContent = "";
            els.prizeDesc.hidden = true;
        }
        setFeatureTitle("");
        els.claimBtn.hidden = true;
        els.root.classList.remove("pr-emerging", "pr-revealing", "pr-claiming", "pr-claim-out");
        // Next reveal can animate again.
        requestAnimationFrame(() => {
            if (!els || !els.prizeCard) return;
            els.prizeCard.style.transition = "";
            els.prizeCard.style.opacity = "";
            els.prizeCard.style.pointerEvents = "";
            if (els.prizeSprite) els.prizeSprite.style.animation = "";
        });
    }

    function waitForClaimClick() {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                claimSkipResolve = null;
                resolve();
            };
            claimSkipResolve = finish;
        });
    }

    function fadeCenterChest(opacity) {
        if (spineReady && els && els.spineHost && !els.spineHost.hidden) {
            els.spineHost.style.opacity = String(opacity);
        } else if (els && els.centerChest) {
            els.centerChest.style.opacity = String(opacity);
        }
    }

    function timingMs(key, fallback) {
        const n = Number(cfg[key]);
        return n >= 0 ? n : fallback;
    }

    function readDataCfg() {
        const data = window.PROGRESS_REWARDS_CFG || {};
        function ms(key) {
            const n = Number(data[key]);
            return n >= 0 ? n : DEFAULT_TIMING[key];
        }
        function sizePx(key, fallback) {
            const n = Number(data[key]);
            return n > 0 ? n : fallback;
        }
        return {
            showOnLevelComplete: data.showOnLevelComplete === "sessionFirst"
                ? "sessionFirst"
                : "every",
            levelCompleteEvent: data.levelCompleteEvent || "kpf:levelComplete",
            listenToLevelComplete: data.listenToLevelComplete !== false,
            barAnimDelay: ms("barAnimDelay"),
            barAnimMs: ms("barAnimMs"),
            barSectionPopMs: ms("barSectionPopMs"),
            chestOpenMs: ms("chestOpenMs"),
            chestFlyMs: ms("chestFlyMs"),
            chestPrizeRevealMs: ms("chestPrizeRevealMs"),
            prizeEmergeMs: ms("prizeEmergeMs"),
            prizeSettleMs: ms("prizeSettleMs"),
            claimOutMs: ms("claimOutMs"),
            prizeShowMs: ms("prizeShowMs"),
            chestBarSizePx: sizePx("chestBarSizePx", DEFAULT_SIZES.chestBarSizePx),
            chestCenterSizePx: sizePx("chestCenterSizePx", DEFAULT_SIZES.chestCenterSizePx),
            barCircleStart: (function () {
                const n = Number(data.barCircleStart);
                return n > 0 && n < 1 ? n : 0.765;
            })(),
            chestSkin: (data.chestSkin === "Blue" || data.chestSkin === "Red")
                ? data.chestSkin
                : "Green",
            nextTierPeekMs: ms("nextTierPeekMs"),
            statusHoldMs: ms("statusHoldMs"),
            nextTierBarAnimMs: ms("nextTierBarAnimMs"),
            confettiCount: Math.max(0, parseInt(data.confettiCount, 10) >= 0
                ? parseInt(data.confettiCount, 10)
                : 26),
            confettiMs: ms("confettiMs"),
            confettiColors: (Array.isArray(data.confettiColors) && data.confettiColors.length)
                ? data.confettiColors.slice()
                : DEFAULT_CONFETTI_COLORS.slice(),
            showUnlockFlash: data.showUnlockFlash !== false,
            titleLetterPop: data.titleLetterPop !== false
        };
    }

    function tiers() {
        const list = Array.isArray(window.PROGRESS_REWARD_TIERS)
            ? window.PROGRESS_REWARD_TIERS.slice()
            : [];
        // Coerce unlockLevel to number — string sort would put "15" before "5".
        return list
            .map((t) => Object.assign({}, t, { unlockLevel: Number(t.unlockLevel) || 0 }))
            .sort((a, b) => a.unlockLevel - b.unlockLevel);
    }

    function copy(key, vars) {
        let text = null;
        if (typeof cfg.getCopy === "function") {
            try { text = cfg.getCopy(key); } catch (_) { /* ignore */ }
        }
        if (text == null && typeof window.t === "function") {
            try {
                const v = window.t(key);
                if (v && v !== key) text = v;
            } catch (_) { /* ignore */ }
        }
        if (text == null || text === key) text = FALLBACK_COPY[key] || key;
        if (vars) {
            Object.keys(vars).forEach((k) => {
                text = String(text).split("{" + k + "}").join(String(vars[k]));
            });
        }
        return text;
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(cfg.storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            state.completedLevel = Math.max(0, parseInt(parsed.completedLevel, 10) || 0);
            state.lastShownLevel = Math.max(0, parseInt(parsed.lastShownLevel, 10) || 0);
            state.lastGameLevelCleared = Math.max(0, parseInt(parsed.lastGameLevelCleared, 10) || 0);
            state.unlocked = Array.isArray(parsed.unlocked)
                ? parsed.unlocked.map(String)
                : [];
            state.loopClaims = Math.max(0, parseInt(parsed.loopClaims, 10) || 0);
        } catch (_) {
            state = { completedLevel: 0, unlocked: [], lastShownLevel: 0, lastGameLevelCleared: 0, loopClaims: 0 };
        }
    }

    function saveState() {
        localStorage.setItem(cfg.storageKey, JSON.stringify({
            completedLevel: state.completedLevel,
            unlocked: state.unlocked.slice(),
            lastShownLevel: state.lastShownLevel,
            lastGameLevelCleared: state.lastGameLevelCleared || 0,
            loopClaims: Math.max(0, parseInt(state.loopClaims, 10) || 0)
        }));
    }

    function HasUnlockedProgressReward(rewardId) {
        return state.unlocked.indexOf(String(rewardId)) !== -1;
    }

    /** Interval for repeating the last authored tier after the ladder ends. 0 = off. */
    function loopEvery() {
        const n = parseInt(window.PROGRESS_REWARD_LOOP_EVERY, 10);
        return n > 0 ? n : 0;
    }

    function loopClaimCount() {
        return Math.max(0, parseInt(state.loopClaims, 10) || 0);
    }

    function authoredAllClaimed() {
        const list = tiers();
        return list.length > 0 && list.every((t) => HasUnlockedProgressReward(t.rewardId));
    }

    /** True when the finite ladder is done and looping is disabled. */
    function isFullyComplete() {
        return authoredAllClaimed() && loopEvery() <= 0;
    }

    function loopPrevUnlock() {
        const list = tiers();
        const last = list[list.length - 1];
        if (!last) return 0;
        const n = loopClaimCount();
        const every = loopEvery();
        if (!every) return last.unlockLevel;
        return n <= 0 ? last.unlockLevel : last.unlockLevel + every * n;
    }

    function loopNextUnlock() {
        const list = tiers();
        const last = list[list.length - 1];
        const every = loopEvery();
        if (!last || !every) return null;
        return last.unlockLevel + every * (loopClaimCount() + 1);
    }

    /** Virtual next prize cloned from the last authored tier. */
    function makeLoopTier() {
        const list = tiers();
        const last = list[list.length - 1];
        const unlock = loopNextUnlock();
        if (!last || unlock == null) return null;
        return Object.assign({}, last, {
            unlockLevel: unlock,
            _loop: true
        });
    }

    function tierBounds(index) {
        const list = tiers();
        const tier = list[index];
        if (!tier) {
            return { prevUnlock: 0, next: null, index: -1, isLoop: false };
        }
        const prevUnlock = index > 0 ? list[index - 1].unlockLevel : 0;
        return { prevUnlock, next: tier, index, isLoop: false };
    }

    /**
     * Active bar target: first unclaimed authored tier, else a loop virtual tier,
     * else null next (all done).
     */
    function currentBounds() {
        const list = tiers();
        if (!list.length) return { prevUnlock: 0, next: null, index: -1, isLoop: false };

        for (let i = 0; i < list.length; i++) {
            if (!HasUnlockedProgressReward(list[i].rewardId)) {
                return tierBounds(i);
            }
        }

        if (loopEvery() > 0) {
            return {
                prevUnlock: loopPrevUnlock(),
                next: makeLoopTier(),
                index: list.length - 1,
                isLoop: true
            };
        }

        return {
            prevUnlock: list[list.length - 1].unlockLevel,
            next: null,
            index: list.length - 1,
            isLoop: false
        };
    }

    function isReadyToClaim(tier, atLevel) {
        if (!tier) return false;
        const level = atLevel == null ? state.completedLevel : atLevel;
        if (level < tier.unlockLevel) return false;
        if (tier._loop) return true;
        return !HasUnlockedProgressReward(tier.rewardId);
    }

    function fillForLevel(level, prevUnlock, unlockLevel) {
        const prev = Number(prevUnlock) || 0;
        const unlock = Number(unlockLevel) || 0;
        const at = Number(level) || 0;
        const span = Math.max(1, unlock - prev);
        const steps = Math.max(0, Math.min(span, at - prev));
        if (steps <= 0) return 0;
        if (steps >= span) return 1;
        // The chest circle is the final section only. Earlier clears fill the
        // groove up to barCircleStart so "1 win left" never paints the circle.
        const circleStart = Math.max(0.5, Math.min(0.95, Number(cfg.barCircleStart) || 0.765));
        return (steps / (span - 1)) * circleStart;
    }

    /**
     * Clears still needed to reach unlockLevel from the current completed count.
     * Example: unlock 15, completed 5 → 10 left; completed 6 → 9 left.
     */
    function levelsRemaining(completedLevel, unlockLevel) {
        return Math.max(0, (Number(unlockLevel) || 0) - (Number(completedLevel) || 0));
    }

    function setLevelsLeftLabel(completedLevel, unlockLevel) {
        els.levelsLeft.textContent = levelsLeftText(
            levelsRemaining(completedLevel, unlockLevel)
        );
    }

    function levelsLeftText(n) {
        if (n <= 0) return copy("prRewardUnlocked");
        if (n === 1) return copy("prLevelsLeftOne");
        return copy("prLevelsLeft", { n });
    }

    /** Unclaimed tiers whose unlockLevel is <= completedLevel (includes loop). */
    function claimableTiers() {
        const authored = tiers().filter((t) =>
            state.completedLevel >= t.unlockLevel &&
            !HasUnlockedProgressReward(t.rewardId)
        );
        if (authored.length) return authored;
        const bounds = currentBounds();
        if (bounds.isLoop && bounds.next && isReadyToClaim(bounds.next)) {
            return [bounds.next];
        }
        return [];
    }

    function hasClaimablePrize() {
        return claimableTiers().length > 0;
    }

    function ensureDom(mount) {
        if (els) return els;
        const host = mount || document.body;
        const root = document.createElement("div");
        root.className = "pr-overlay" + (cfg.embed ? " pr-embedded" : "");
        root.id = "prOverlay";
        root.setAttribute("aria-hidden", "true");
        root.innerHTML = [
            '<div class="pr-backdrop" data-pr-dismiss></div>',
            '<button type="button" class="pr-dismiss-btn" data-pr-dismiss aria-label="Close">×</button>',
            '<div class="pr-center-wrap">',
            '  <p class="pr-feature-title" id="prFeatureTitle"></p>',
            '  <div id="prCenterStage" aria-live="polite">',
            '    <div class="pr-center-spine" id="prCenterSpine"></div>',
            '    <img class="pr-center-chest" id="prCenterChest" src="' + CHEST_CLOSED + '" alt="" draggable="false" hidden />',
            "  </div>",
            '  <div class="pr-prize-card" id="prPrizeCard">',
            '    <div class="pr-prize-frame">',
            '      <img class="pr-prize-sprite" id="prPrizeSprite" alt="" draggable="false" hidden />',
            '      <div class="pr-hint-prize" id="prHintPrize" hidden>',
            '        <div class="pr-hint-prize-icon" aria-hidden="true">',
            '          <svg viewBox="0 0 24 24" focusable="false">',
            '            <path d="M9 18h6"></path>',
            '            <path d="M10 21h4"></path>',
            '            <path d="M8.3 15.2C7.5 14.2 7 13 7 11.5a5 5 0 0 1 10 0c0 1.5-.5 2.7-1.3 3.7-.8.9-1.3 1.8-1.4 2.8H9.7c-.1-1-.6-1.9-1.4-2.8Z"></path>',
            '            <path d="M12 2V1"></path>',
            '            <path d="m4.9 4.9-.7-.7"></path>',
            '            <path d="m19.8 4.2-.7.7"></path>',
            "          </svg>",
            "        </div>",
            '        <span class="pr-hint-prize-plus" id="prHintPrizePlus"></span>',
            "      </div>",
            '      <span class="pr-prize-trail" aria-hidden="true"></span>',
            "    </div>",
            '    <p class="pr-prize-label" id="prPrizeLabel"></p>',
            '    <p class="pr-prize-desc" id="prPrizeDesc" hidden></p>',
            '    <button type="button" class="pr-claim-btn" id="prClaimBtn" hidden></button>',
            "  </div>",
            "</div>",
            '<div class="pr-panel" role="dialog" aria-labelledby="prLevelsLeft">',
            '  <p class="pr-levels-left" id="prLevelsLeft"></p>',
            '  <div class="pr-bar-row">',
            '    <div class="pr-track">',
            '      <div class="pr-fill" id="prFill"></div>',
            '      <div class="pr-section-marks" id="prSectionMarks" aria-hidden="true"></div>',
            "    </div>",
            '    <div class="pr-bar-chest-wrap" id="prBarChestWrap">',
            '      <div class="pr-bar-spine" id="prBarSpine"></div>',
            '      <img class="pr-bar-chest" id="prBarChest" src="' + CHEST_CLOSED + '" alt="" draggable="false" hidden />',
            "    </div>",
            "  </div>",
            '  <p class="pr-complete-note" id="prCompleteNote"></p>',
            "</div>",
            '<div class="pr-fx" id="prFx" aria-hidden="true"></div>'
        ].join("");
        host.appendChild(root);

        els = {
            root,
            fill: root.querySelector("#prFill"),
            sectionMarks: root.querySelector("#prSectionMarks"),
            levelsLeft: root.querySelector("#prLevelsLeft"),
            barChestWrap: root.querySelector("#prBarChestWrap"),
            barChest: root.querySelector("#prBarChest"),
            barSpineHost: root.querySelector("#prBarSpine"),
            centerChest: root.querySelector("#prCenterChest"),
            spineHost: root.querySelector("#prCenterSpine"),
            centerStage: root.querySelector("#prCenterStage"),
            featureTitle: root.querySelector("#prFeatureTitle"),
            prizeCard: root.querySelector("#prPrizeCard"),
            prizeSprite: root.querySelector("#prPrizeSprite"),
            hintPrize: root.querySelector("#prHintPrize"),
            hintPrizePlus: root.querySelector("#prHintPrizePlus"),
            prizeLabel: root.querySelector("#prPrizeLabel"),
            prizeDesc: root.querySelector("#prPrizeDesc"),
            claimBtn: root.querySelector("#prClaimBtn"),
            completeNote: root.querySelector("#prCompleteNote"),
            fx: root.querySelector("#prFx")
        };

        // Spine boots on first open so the WebGL canvas has real layout size.
        applyChestSizes();
        applyMotionVars();
        parkCenterChest();
        if (!spineApiAvailable()) {
            setCenterChestFallback(false);
            setBarChestFallback(false);
        }

        root.querySelectorAll("[data-pr-dismiss]").forEach((node) => {
            node.addEventListener("click", () => {
                if (root.classList.contains("pr-claiming") ||
                    root.classList.contains("pr-emerging") ||
                    root.classList.contains("pr-revealing")) {
                    // During feature reveal, only the Claim button finishes.
                    // Backdrop/dismiss ignore so the beat stays intentional.
                    return;
                }
                hide();
            });
        });

        els.claimBtn.addEventListener("click", () => {
            if (typeof cfg.onClaimPress === "function") {
                try { cfg.onClaimPress(); } catch (_) { /* ignore */ }
            }
            if (claimSkipResolve) {
                const resolve = claimSkipResolve;
                claimSkipResolve = null;
                resolve();
            }
        });

        return els;
    }

    function setFillInstant(ratio) {
        els.fill.classList.remove("animating", "pr-section-pop");
        els.fill.style.transitionDuration = "";
        els.fill.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(2) + "%";
    }

    function rebuildSectionMarks(prevUnlock, unlockLevel, filledThroughLevel) {
        const prev = Number(prevUnlock) || 0;
        const unlock = Number(unlockLevel) || 0;
        const span = Math.max(1, unlock - prev);
        const filled = Number(filledThroughLevel) || prev;
        els.sectionMarks.innerHTML = "";
        // Interior boundaries between sections (skip 0% and 100%), placed with
        // the same remap as the fill so the last mark sits at the circle mouth.
        for (let i = 1; i < span; i++) {
            const mark = document.createElement("span");
            mark.className = "pr-section-mark";
            mark.style.left = (fillForLevel(prev + i, prev, unlock) * 100).toFixed(4) + "%";
            mark.dataset.section = String(prev + i);
            if (filled >= prev + i) mark.classList.add("is-filled");
            els.sectionMarks.appendChild(mark);
        }
    }

    function lightSectionThrough(level) {
        const marks = els.sectionMarks.querySelectorAll(".pr-section-mark");
        marks.forEach((mark) => {
            const boundary = parseInt(mark.dataset.section, 10);
            const on = level >= boundary;
            mark.classList.toggle("is-filled", on);
        });
    }

    function popSectionAt(level) {
        const popMs = timingMs("barSectionPopMs", 180);
        els.fill.classList.remove("pr-section-pop");
        els.levelsLeft.classList.remove("pr-count-pop");
        void els.fill.offsetWidth;
        els.fill.classList.add("pr-section-pop");
        els.levelsLeft.classList.add("pr-count-pop");

        const mark = els.sectionMarks.querySelector(
            '.pr-section-mark[data-section="' + level + '"]'
        );
        if (mark) {
            mark.classList.add("is-filled", "is-pop");
            setTimeout(() => mark.classList.remove("is-pop"), popMs + 40);
        }

        return new Promise((resolve) => {
            setTimeout(() => {
                els.fill.classList.remove("pr-section-pop");
                els.levelsLeft.classList.remove("pr-count-pop");
                resolve();
            }, popMs);
        });
    }

    function animateFill(fromRatio, toRatio, ms) {
        return new Promise((resolve) => {
            const from = Math.max(0, Math.min(1, fromRatio));
            const to = Math.max(0, Math.min(1, toRatio));
            if (Math.abs(to - from) < 0.001) {
                setFillInstant(to);
                resolve();
                return;
            }
            setFillInstant(from);
            void els.fill.offsetWidth;
            els.fill.classList.add("animating");
            els.fill.style.transitionDuration = (ms || timingMs("barAnimMs", 280)) + "ms";
            els.fill.style.width = (to * 100).toFixed(2) + "%";
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                els.fill.removeEventListener("transitionend", onEnd);
                els.fill.classList.remove("animating");
                setFillInstant(to);
                resolve();
            };
            const onEnd = (e) => {
                if (e.propertyName === "width") done();
            };
            els.fill.addEventListener("transitionend", onEnd);
            setTimeout(done, (ms || timingMs("barAnimMs", 280)) + 80);
        });
    }

    /**
     * Fill the bar one level-section at a time. After each section: pop juice and
     * refresh the levels-remaining label.
     */
    async function animateFillBySections(fromLevel, toLevel, prevUnlock, unlockLevel, token) {
        const prev = Number(prevUnlock) || 0;
        const unlock = Number(unlockLevel) || 0;
        const start = Math.max(prev, Number(fromLevel) || 0);
        const end = Math.max(start, Math.min(Number(toLevel) || 0, unlock));

        rebuildSectionMarks(prev, unlock, start);
        setFillInstant(fillForLevel(start, prev, unlock));
        setLevelsLeftLabel(start, unlock);
        lightSectionThrough(start);

        const delay = timingMs("barAnimDelay", 350);
        if (delay > 0) {
            await wait(delay);
            if (token !== flowToken) return start;
        }

        if (end <= start) return start;

        const sectionMs = timingMs("barAnimMs", 280);
        let level = start;
        while (level < end) {
            if (token !== flowToken) return level;
            const next = level + 1;
            const fromRatio = fillForLevel(level, prev, unlock);
            const toRatio = fillForLevel(next, prev, unlock);
            if (typeof cfg.onBarProgress === "function") {
                try { cfg.onBarProgress(); } catch (_) { /* ignore */ }
            }
            await animateFill(fromRatio, toRatio, sectionMs);
            if (token !== flowToken) return level;
            level = next;
            lightSectionThrough(level);
            setLevelsLeftLabel(level, unlock);
            if (level === unlock && typeof cfg.onBarFilled === "function") {
                try { cfg.onBarFilled(); } catch (_) { /* ignore */ }
            }
            await popSectionAt(level);
            if (token !== flowToken) return level;
        }
        return level;
    }

    function wait(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function waitWithSkip(ms) {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                claimSkipResolve = null;
                resolve();
            };
            claimSkipResolve = finish;
            setTimeout(finish, ms);
        });
    }

    function updateTierChrome(bounds, displayLevel) {
        const allDone = isFullyComplete();

        els.root.classList.toggle("pr-all-done", allDone);
        els.completeNote.textContent = copy("prAllComplete");

        if (!bounds.next || allDone) {
            // Keep the message only on the complete-note; levels-left is hidden
            // via .pr-all-done so we avoid a duplicate overlapping label.
            els.levelsLeft.textContent = "";
            setFillInstant(1);
            setBarChestReady(false);
            setBarChestSlotVisible(true);
            playBarChestIdle();
            unparkCenterChest();
            holdChestOpenPose();
            return;
        }

        els.levelsLeft.textContent = levelsLeftText(
            levelsRemaining(displayLevel, bounds.next.unlockLevel)
        );
        rebuildSectionMarks(bounds.prevUnlock, bounds.next.unlockLevel, displayLevel);
        const ratio = fillForLevel(displayLevel, bounds.prevUnlock, bounds.next.unlockLevel);
        setFillInstant(ratio);
        lightSectionThrough(displayLevel);
        const ready = isReadyToClaim(bounds.next, displayLevel);
        setBarChestReady(ready);
        if (!els.root.classList.contains("pr-claiming") &&
            !els.root.classList.contains("pr-emerging") &&
            !els.root.classList.contains("pr-revealing")) {
            setBarChestSlotVisible(true);
            playBarChestIdle();
            parkCenterChest();
        }
    }

    /**
     * Hold pr-revealing so the card stays put while the whole takeover fades;
     * clearPrizeCard() drops pr-claim-out again once the beat is done.
     */
    function runClaimOut() {
        const ms = claimOutMs();
        if (!els || ms <= 0) return Promise.resolve();
        els.root.classList.add("pr-claim-out");
        return wait(ms);
    }

    async function runClaim(tier) {
        els.root.classList.add("pr-claiming");
        els.root.classList.remove("pr-emerging", "pr-revealing", "pr-claim-out");
        fadeCenterChest(1);
        setBarChestReady(true);
        els.levelsLeft.textContent = copy("prRewardUnlocked");
        if (typeof cfg.onChestUnlockStart === "function") {
            try { cfg.onChestUnlockStart(tier); } catch (_) { /* ignore */ }
        }

        await flyChestFromBarToCenter();
        if (!open) return;

        // Fired here rather than with onChestUnlockStart so the open sting lands
        // on the lid, not a chestFlyMs-length flight earlier.
        if (typeof cfg.onChestOpen === "function") {
            try { cfg.onChestOpen(tier); } catch (_) { /* ignore */ }
        }
        playChestOpen();

        // Flash/confetti land just before the item clears the lid, so the burst
        // reads as the chest popping rather than as a separate effect.
        const revealMs = timingMs("chestPrizeRevealMs", DEFAULT_TIMING.chestPrizeRevealMs);
        const fxAt = Math.floor(revealMs * 0.72);
        await wait(fxAt);
        if (!open) return;
        spawnUnlockFx();
        await wait(Math.max(0, revealMs - fxAt));
        if (!open) return;

        // Beat 1: item pops out of the open chest (storyboard panel 2).
        revealPrizeEmerging(tier);
        await wait(timingMs("prizeEmergeMs", DEFAULT_TIMING.prizeEmergeMs));
        if (!open) return;

        // Beat 2: dedicated New Feature + Claim screen (storyboard panel 3).
        revealFeatureCard(tier);
        await waitForClaimClick();
        if (!open) return;

        if (tier._loop) {
            state.loopClaims = loopClaimCount() + 1;
            saveState();
            applyTierGrants(tier);
            if (typeof cfg.onClaim === "function") {
                try { cfg.onClaim(String(tier.rewardId), tier); } catch (_) { /* ignore */ }
            }
        } else if (!HasUnlockedProgressReward(tier.rewardId)) {
            state.unlocked.push(String(tier.rewardId));
            saveState();
            applyTierGrants(tier);
            if (typeof cfg.onClaim === "function") {
                try { cfg.onClaim(String(tier.rewardId), tier); } catch (_) { /* ignore */ }
            }
        }

        // Beat 3: fade the takeover out while the bar panel slides back, so the
        // hand-off to the next tier isn't a hard cut.
        await runClaimOut();
        if (!open) return;

        clearPrizeCard();
        setBarChestSlotVisible(true);
        setBarChestReady(false);
        playBarChestIdle();
        parkCenterChest();
        fadeCenterChest(1);
    }

    async function runFlow(token, opts) {
        opts = opts || {};
        const autoClose = opts.autoClose !== false;
        const list = tiers();

        if (!list.length) {
            updateTierChrome({ prevUnlock: 0, next: null, index: -1, isLoop: false }, state.completedLevel);
            if (autoClose) {
                await wait(timingMs("statusHoldMs", 1200));
                if (token === flowToken) hide();
            }
            return;
        }

        let claimedAny = false;
        let safety = 0;
        while (safety++ < 32) {
            if (token !== flowToken) return;

            const bounds = currentBounds();
            if (!bounds.next || isFullyComplete()) {
                updateTierChrome(bounds, state.completedLevel);
                state.lastShownLevel = state.completedLevel;
                saveState();
                if (autoClose) {
                    await wait(timingMs("statusHoldMs", 1200));
                    if (token === flowToken) hide();
                }
                return;
            }

            // Animate within this tier, one level-section at a time.
            const fromLevel = Math.max(
                bounds.prevUnlock,
                Math.min(state.lastShownLevel, state.completedLevel)
            );
            const toLevel = state.completedLevel;
            const willClaim = isReadyToClaim(bounds.next, toLevel);
            const animEnd = willClaim
                ? bounds.next.unlockLevel
                : Math.min(toLevel, bounds.next.unlockLevel);

            setBarChestReady(false);
            setBarChestSlotVisible(true);
            playBarChestIdle();
            parkCenterChest();
            els.root.classList.remove("pr-all-done");

            const shownLevel = await animateFillBySections(
                fromLevel,
                animEnd,
                bounds.prevUnlock,
                bounds.next.unlockLevel,
                token
            );
            if (token !== flowToken) return;

            state.lastShownLevel = shownLevel;
            saveState();
            setLevelsLeftLabel(state.lastShownLevel, bounds.next.unlockLevel);
            updateTierChrome(bounds, state.lastShownLevel);

            if (!willClaim) {
                state.lastShownLevel = toLevel;
                saveState();
                setLevelsLeftLabel(toLevel, bounds.next.unlockLevel);
                updateTierChrome(bounds, toLevel);
                if (autoClose) {
                    await wait(timingMs("statusHoldMs", 1200));
                    if (token === flowToken) hide();
                }
                return;
            }

            await runClaim(bounds.next);
            if (token !== flowToken) return;
            claimedAny = true;

            // Snap lastShown to the unlock point, then show the next tier's
            // fill for the same completedLevel so progress clearly continues.
            state.lastShownLevel = bounds.next.unlockLevel;
            saveState();

            const nextBounds = currentBounds();
            if (!nextBounds.next || isFullyComplete()) {
                updateTierChrome(nextBounds, state.completedLevel);
                state.lastShownLevel = state.completedLevel;
                saveState();
                await wait(timingMs("nextTierPeekMs", 700));
                // Embedded hosts keep the bar mounted and reveal Continue via
                // onComplete — hide() would bump flowToken and softlock them.
                if (token === flowToken && autoClose) hide();
                return;
            }

            // Peek next-tier progress section-by-section from the tier start.
            setBarChestReady(false);
            setBarChestSlotVisible(true);
            playBarChestIdle();
            parkCenterChest();
            const peekEnd = Math.min(state.completedLevel, nextBounds.next.unlockLevel);
            await animateFillBySections(
                nextBounds.prevUnlock,
                peekEnd,
                nextBounds.prevUnlock,
                nextBounds.next.unlockLevel,
                token
            );
            if (token !== flowToken) return;

            state.lastShownLevel = state.completedLevel;
            saveState();
            updateTierChrome(nextBounds, state.completedLevel);

            // If another prize is already earned, loop and claim it.
            if (!isReadyToClaim(nextBounds.next, state.completedLevel)) {
                await wait(timingMs("nextTierPeekMs", 700));
                if (token === flowToken && autoClose) hide();
                return;
            }
        }

        if (claimedAny && token === flowToken && autoClose) hide();
    }

    function openOverlay() {
        if (!els) ensureDom(cfg.root);
        open = true;
        els.root.classList.add("show");
        els.root.setAttribute("aria-hidden", "false");
        els.root.classList.remove("pr-claiming", "pr-emerging", "pr-revealing",
            "pr-claim-out", "pr-all-done");
        clearFx();
        parkCenterChest();
        setBarChestSlotVisible(true);
        applyChestSizes();
        applyMotionVars();
        // Wait a frame so .show layout is applied before creating WebGL.
        requestAnimationFrame(() => {
            ensureAllSpinePlayers().then(() => {
                if (!open) return;
                playBarChestIdle();
                playChestIdle();
                parkCenterChest();
            });
        });
    }

    function startFlow(opts) {
        openOverlay();
        const bounds = currentBounds();
        updateTierChrome(bounds, state.lastShownLevel);
        flowToken++;
        const token = flowToken;
        Promise.resolve(runFlow(token, opts)).then(() => {
            signalFlowComplete(token);
        }, (err) => {
            try {
                console.warn("[ProgressRewards] flow error:", err);
            } catch (_) { /* ignore */ }
            signalFlowComplete(token);
        });
        return api;
    }

    /**
     * Tell the host this startFlow finished. If hide() advanced flowToken but
     * nothing newer is open, still fire onComplete so embedded Continue buttons
     * cannot softlock. Skip only when a newer startFlow replaced this one.
     */
    function signalFlowComplete(token) {
        if (token !== flowToken && open) return;
        if (typeof cfg.onComplete === "function") {
            try { cfg.onComplete(); } catch (_) { /* ignore */ }
        }
    }

    function init(options) {
        options = options || {};
        const dataCfg = readDataCfg();
        cfg.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
        cfg.getCopy = options.getCopy || null;
        cfg.onClose = options.onClose || null;
        cfg.onClaim = options.onClaim || null;
        cfg.onComplete = options.onComplete || null;
        cfg.onBarFilled = options.onBarFilled || null;
        cfg.onChestUnlockStart = options.onChestUnlockStart || null;
        cfg.onChestOpen = options.onChestOpen || null;
        cfg.onFeaturePopup = options.onFeaturePopup || null;
        cfg.onBarProgress = options.onBarProgress || null;
        cfg.onClaimPress = options.onClaimPress || null;
        cfg.root = options.root || null;
        cfg.embed = options.embed === true;
        cfg.showOnLevelComplete = options.showOnLevelComplete === "sessionFirst" ||
            options.showOnLevelComplete === "every"
            ? options.showOnLevelComplete
            : dataCfg.showOnLevelComplete;
        cfg.levelCompleteEvent = options.levelCompleteEvent || dataCfg.levelCompleteEvent;
        cfg.listenToLevelComplete = typeof options.listenToLevelComplete === "boolean"
            ? options.listenToLevelComplete
            : dataCfg.listenToLevelComplete;
        ["barAnimDelay", "barAnimMs", "barSectionPopMs", "chestOpenMs", "chestFlyMs",
            "chestPrizeRevealMs", "prizeEmergeMs", "prizeSettleMs", "claimOutMs", "prizeShowMs",
            "chestBarSizePx", "chestCenterSizePx", "confettiCount", "confettiMs",
            "nextTierPeekMs", "statusHoldMs", "nextTierBarAnimMs"].forEach((key) => {
            const fromOpt = Number(options[key]);
            cfg[key] = fromOpt >= 0 ? fromOpt : dataCfg[key];
        });
        const circleOpt = Number(options.barCircleStart);
        cfg.barCircleStart = circleOpt > 0 && circleOpt < 1
            ? circleOpt
            : dataCfg.barCircleStart;
        cfg.confettiColors = (Array.isArray(options.confettiColors) && options.confettiColors.length)
            ? options.confettiColors.slice()
            : dataCfg.confettiColors;
        cfg.showUnlockFlash = typeof options.showUnlockFlash === "boolean"
            ? options.showUnlockFlash
            : dataCfg.showUnlockFlash;
        cfg.titleLetterPop = typeof options.titleLetterPop === "boolean"
            ? options.titleLetterPop
            : dataCfg.titleLetterPop;
        const skinOpt = options.chestSkin || dataCfg.chestSkin;
        cfg.chestSkin = (skinOpt === "Blue" || skinOpt === "Red") ? skinOpt : "Green";
        sessionProgressShown = false;
        loadState();
        ensureDom(cfg.root);
        applyChestSizes();
        applyMotionVars();
        unbindLevelCompleteListener();
        if (cfg.listenToLevelComplete) bindLevelCompleteListener();
        return api;
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

    /**
     * Apply showOnLevelComplete policy after progress has been updated.
     * Prize unlocks always open the popup regardless of mode.
     * @returns {boolean} true if a popup was opened
     */
    function showAfterProgressUpdate() {
        if (hasClaimablePrize()) {
            sessionProgressShown = true;
            ShowProgressPopup();
            return true;
        }
        if (cfg.showOnLevelComplete === "sessionFirst") {
            return ShowSessionProgressPopup();
        }
        sessionProgressShown = true;
        ShowProgressPopup();
        return true;
    }

    /**
     * Host level-clear hook. Prefer dispatching CustomEvent(cfg.levelCompleteEvent)
     * with detail: { completedLevel }.
     *
     * Progress is a clear-count (+1 per win), not "max game level id" — otherwise
     * once saved progress is ahead of the current KPF level number, levels-left
     * freezes (e.g. stuck at 10 toward unlock 15).
     */
    function OnLevelComplete(detail) {
        detail = detail || {};
        // Always count this clear. detail.completedLevel is informational only
        // (which game level was beaten); the reward counter increments by one.
        state.completedLevel = Math.max(0, state.completedLevel) + 1;
        if (typeof detail.completedLevel === "number" && detail.completedLevel >= 0) {
            state.lastGameLevelCleared = detail.completedLevel | 0;
        }
        saveState();
        return showAfterProgressUpdate();
    }

    /**
     * Dispatch helper for hosts: ProgressRewards.emitLevelComplete(finishedLevel).
     */
    function emitLevelComplete(completedLevel) {
        const name = cfg.levelCompleteEvent || "kpf:levelComplete";
        const detail = {
            completedLevel: Math.max(0, parseInt(completedLevel, 10) || 0)
        };
        document.dispatchEvent(new CustomEvent(name, { detail: detail }));
        return api;
    }

    function isOpen() {
        return open;
    }

    function hide() {
        if (!els) return;
        flowToken++;
        if (claimSkipResolve) {
            const resolve = claimSkipResolve;
            claimSkipResolve = null;
            resolve();
        }
        open = false;
        els.root.classList.remove("show", "pr-claiming", "pr-emerging", "pr-revealing",
            "pr-claim-out", "pr-all-done");
        els.root.setAttribute("aria-hidden", "true");
        clearFx();
        clearPrizeCard();
        if (typeof cfg.onClose === "function") {
            try { cfg.onClose(); } catch (_) { /* ignore */ }
        }
    }

    /**
     * Always open the progress UI (status and/or claim). Auto-closes after
     * anim / claim unless opts.autoClose === false.
     */
    function ShowProgressPopup(opts) {
        opts = opts || {};
        if (!els) ensureDom(cfg.root);
        if (typeof opts.completedLevel === "number" && opts.completedLevel >= 0) {
            state.completedLevel = Math.max(state.completedLevel, opts.completedLevel | 0);
            saveState();
        }
        // Embedded mode keeps the bar in the level-complete card until the host
        // advances, so it must never auto-close.
        return startFlow({ autoClose: cfg.embed ? false : (opts.autoClose !== false) });
    }

    /**
     * First progress peek of this session (e.g. entering the first level).
     * Subsequent calls no-op unless opts.force.
     * @returns {boolean} true if the popup was shown
     */
    function ShowSessionProgressPopup(opts) {
        opts = opts || {};
        if (sessionProgressShown && !opts.force) return false;
        sessionProgressShown = true;
        ShowProgressPopup(opts);
        return true;
    }

    /**
     * Increment completedLevel by 1, then apply showOnLevelComplete policy
     * (prizes always show).
     * @returns {boolean} true if a popup was shown
     */
    function UpdateProgress() {
        state.completedLevel = Math.max(0, state.completedLevel) + 1;
        saveState();
        return showAfterProgressUpdate();
    }

    /** Set absolute completed level (max with current). Optionally show UI. */
    function NotifyLevelCompleted(level, opts) {
        opts = opts || {};
        const completed = Math.max(0, parseInt(level, 10) || 0);
        state.completedLevel = Math.max(state.completedLevel, completed);
        saveState();
        if (opts.show === false) return api;
        if (opts.onlyIfPrize) {
            if (hasClaimablePrize()) ShowProgressPopup(opts);
            return api;
        }
        if (opts.usePolicy) {
            showAfterProgressUpdate();
            return api;
        }
        ShowProgressPopup(opts);
        return api;
    }

    function GetState() {
        return {
            completedLevel: state.completedLevel,
            unlocked: state.unlocked.slice(),
            lastShownLevel: state.lastShownLevel,
            lastGameLevelCleared: state.lastGameLevelCleared || 0,
            loopClaims: loopClaimCount(),
            loopEvery: loopEvery(),
            sessionProgressShown: sessionProgressShown,
            hasClaimablePrize: hasClaimablePrize(),
            showOnLevelComplete: cfg.showOnLevelComplete,
            levelsLeft: (function () {
                const bounds = currentBounds();
                if (!bounds.next) return 0;
                return levelsRemaining(state.completedLevel, bounds.next.unlockLevel);
            })()
        };
    }

    function ResetProgress() {
        state = { completedLevel: 0, unlocked: [], lastShownLevel: 0, lastGameLevelCleared: 0, loopClaims: 0 };
        sessionProgressShown = false;
        saveState();
        if (open) {
            const bounds = currentBounds();
            updateTierChrome(bounds, 0);
        }
        return api;
    }

    function setShowOnLevelComplete(mode) {
        cfg.showOnLevelComplete = mode === "sessionFirst" ? "sessionFirst" : "every";
        return api;
    }

    /**
     * Debug: rewind saved progress so the *next* reported clear lands exactly on
     * the current tier's unlockLevel, with `runUpSections` sections still to
     * fill first. Wipes `unlocked` once everything is claimed so the flow can be
     * watched again from the first tier.
     *
     * Arm-only (rather than arm-and-play) exists because embedded hosts need to
     * run their own level-complete presentation around the bar.
     *
     * @returns {object|null} the armed tier, or null when there are no tiers
     */
    function DebugArmNextUnlock(opts) {
        opts = opts || {};
        const runUp = Math.max(1, parseInt(opts.runUpSections, 10) || 3);
        if (!tiers().length) return null;

        // Finite ladder finished with no loop — rewind so the flow can be replayed.
        if (isFullyComplete()) {
            state.unlocked = [];
            state.loopClaims = 0;
        }

        const bounds = currentBounds();
        if (!bounds.next) return null;

        const unlock = bounds.next.unlockLevel;
        // The caller's clear supplies the final +1, so stop one short of unlock.
        state.completedLevel = Math.max(bounds.prevUnlock, unlock - 1);
        state.lastShownLevel = Math.max(bounds.prevUnlock, unlock - runUp);
        sessionProgressShown = false;
        saveState();
        return bounds.next;
    }

    /**
     * Debug: arm the next unlock and immediately play bar-fill → chest → claim.
     * Standalone hosts can call this on its own; embedded hosts should call
     * DebugArmNextUnlock() and then trigger their own level-complete flow.
     */
    function DebugRunUnlockFlow(opts) {
        const tier = DebugArmNextUnlock(opts);
        if (!tier) return null;
        state.completedLevel += 1;
        saveState();
        ShowProgressPopup(opts || {});
        return tier;
    }

    const api = {
        init,
        ShowProgressPopup,
        ShowSessionProgressPopup,
        UpdateProgress,
        OnLevelComplete,
        emitLevelComplete,
        NotifyLevelCompleted,
        HasUnlockedProgressReward,
        GetState,
        ResetProgress,
        setShowOnLevelComplete,
        DebugArmNextUnlock,
        DebugRunUnlockFlow,
        isOpen,
        hide,
        hasClaimablePrize,
        bindLevelCompleteListener,
        unbindLevelCompleteListener,
        // Stable aliases
        showProgressPopup: ShowProgressPopup,
        showSessionProgressPopup: ShowSessionProgressPopup,
        updateProgress: UpdateProgress,
        onLevelComplete: OnLevelComplete,
        notifyLevelCompleted: NotifyLevelCompleted,
        hasUnlockedProgressReward: HasUnlockedProgressReward,
        getState: GetState,
        resetProgress: ResetProgress,
        debugArmNextUnlock: DebugArmNextUnlock,
        debugRunUnlockFlow: DebugRunUnlockFlow
    };

    window.ProgressRewards = api;
})();
