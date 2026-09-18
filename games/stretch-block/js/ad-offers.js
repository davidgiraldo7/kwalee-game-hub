// OWNER: shared — Rewarded-ad offer popups (Times Up, Give Up, Add Hint).
// Depends on Ads, translations `t()`, Inventory / Items, BlockCharacters (optional).
"use strict";

(function (global) {
    const EXTRA_SECONDS = 30;
    const HINT_GRANT = 3;
    const SAD_CHARACTER_SRC = "Assets/Character_Sad.png";

    let root = null;
    let timesUpEl = null;
    let giveUpEl = null;
    let addHintEl = null;
    let busy = false;

    function copy(key, fallback) {
        if (typeof global.t === "function") {
            const v = global.t(key);
            if (v != null && v !== key) return v;
        }
        return fallback != null ? fallback : key;
    }

    function sfxClick() {
        if (typeof global.sfxClick === "function") global.sfxClick();
    }

    function sfxPopup() {
        if (typeof global.sfxPopup === "function") global.sfxPopup();
    }

    function haptic(kind) {
        if (typeof global.haptic === "function") global.haptic(kind);
    }

    function showToast(message) {
        const app = document.querySelector(".app") || document.body;
        if (!app || !message) return;
        const toast = document.createElement("span");
        toast.className = "locked-toast ad-offer-toast";
        toast.textContent = message;
        toast.style.left = "50%";
        toast.style.top = "28%";
        toast.style.transform = "translateX(-50%)";
        app.appendChild(toast);
        toast.addEventListener("animationend", () => toast.remove());
    }

    function handleRewardResult(res) {
        if (!res || res.earned) return;
        if (res.reason === "declined") showToast(copy("adRewardMissed", "Watch the full ad to get your reward"));
        else showToast(copy("adUnavailable", "No ad available right now"));
    }

    function rvIconHtml() {
        return [
            '<span class="ad-rv-icon" aria-hidden="true">',
            '  <svg class="ad-rv-play" viewBox="0 0 24 24" focusable="false">',
            '    <circle cx="12" cy="12" r="11"></circle>',
            '    <path d="M10 8.2v7.6L16.2 12z"></path>',
            "  </svg>",
            '  <span class="ad-rv-badge">AD</span>',
            "</span>"
        ].join("");
    }

    function fillCharacterStage(stageEl) {
        if (!stageEl) return;
        // Rebuilt on every open so the entrance animation replays.
        stageEl.innerHTML = "";
        const sad = document.createElement("img");
        sad.className = "ad-offer-sad";
        sad.src = SAD_CHARACTER_SRC;
        sad.alt = "";
        sad.draggable = false;
        stageEl.appendChild(sad);
    }

    function ensureDom() {
        if (root) return;
        const mount = document.querySelector(".app") || document.body;

        timesUpEl = document.getElementById("timesUpOffer");
        giveUpEl = document.getElementById("giveUpOffer");
        addHintEl = document.getElementById("addHintOffer");
        if (!timesUpEl || !giveUpEl || !addHintEl) {
            console.warn("[AdOffers] Missing offer markup in index.html");
            return;
        }
        root = mount;

        const tuRv = timesUpEl.querySelector("[data-ad=timesUpRv]");
        const tuGive = timesUpEl.querySelector("[data-ad=timesUpGiveUp]");
        const guRetry = giveUpEl.querySelector("[data-ad=giveUpRetry]");
        const ahRv = addHintEl.querySelector("[data-ad=addHintRv]");
        const ahClose = addHintEl.querySelector("[data-ad=addHintClose]");

        if (tuRv) {
            tuRv.addEventListener("click", () => {
                if (busy) return;
                sfxClick();
                busy = true;
                const done = () => { busy = false; };
                if (!global.Ads || typeof Ads.showRewardedAd !== "function") {
                    done();
                    showToast(copy("adUnavailable", "No ad available right now"));
                    return;
                }
                Ads.showRewardedAd("extra_time").then((res) => {
                    done();
                    if (res && res.earned) {
                        hideTimesUp();
                        if (typeof global.grantExtraSeconds === "function") {
                            global.grantExtraSeconds(EXTRA_SECONDS);
                        }
                        if (typeof global.resumeAfterTimesUp === "function") {
                            global.resumeAfterTimesUp();
                        }
                    } else {
                        handleRewardResult(res);
                    }
                });
            });
        }

        if (tuGive) {
            tuGive.addEventListener("click", () => {
                if (busy) return;
                sfxClick();
                hideTimesUp();
                showGiveUp();
            });
        }

        if (guRetry) {
            guRetry.addEventListener("click", () => {
                if (busy) return;
                sfxClick();
                busy = true;
                hideGiveUp();
                busy = false;
                if (typeof global.retryAfterTimesUp === "function") {
                    global.retryAfterTimesUp();
                } else if (typeof global.restartLevel === "function") {
                    global.restartLevel();
                }
            });
        }

        if (ahClose) {
            ahClose.addEventListener("click", () => {
                if (busy) return;
                sfxClick();
                hideAddHint({ animate: true });
            });
        }

        if (ahRv) {
            ahRv.addEventListener("click", () => {
                if (busy || ahRv.disabled) return;
                sfxClick();
                busy = true;
                ahRv.disabled = true;
                ahRv.classList.add("is-busy");
                addHintEl.classList.add("is-granting");
                const unlockRv = () => {
                    busy = false;
                    ahRv.disabled = false;
                    ahRv.classList.remove("is-busy");
                    if (addHintEl) addHintEl.classList.remove("is-granting");
                };
                if (!global.Ads || typeof Ads.showRewardedAd !== "function") {
                    unlockRv();
                    showToast(copy("adUnavailable", "No ad available right now"));
                    return;
                }
                Ads.showRewardedAd("add_hints").then((res) => {
                    if (res && res.earned) {
                        if (global.Inventory && typeof Inventory.grantHints === "function") {
                            Inventory.grantHints(HINT_GRANT);
                        } else if (global.Items && typeof Items.grantHints === "function") {
                            Items.grantHints(HINT_GRANT);
                        }
                        const originEl = addHintEl.querySelector(".ad-offer-hint-prize") ||
                            addHintEl.querySelector("[data-ad=addHintIcon]");
                        const finish = () => { unlockRv(); };
                        if (typeof global.playHintGrantBurst === "function") {
                            global.playHintGrantBurst(HINT_GRANT, {
                                originEl: originEl,
                                holdMs: 100,
                                onBurstHoldDone: () => hideAddHint({ animate: true })
                            }).then(finish).catch(finish);
                        } else {
                            hideAddHint();
                            if (typeof global.updateHintButton === "function") updateHintButton();
                            finish();
                        }
                    } else {
                        unlockRv();
                        handleRewardResult(res);
                    }
                });
            });
        }
    }

    function runInterstitial(placement, advance) {
        if (global.Ads && typeof Ads.showInterstitial === "function") {
            Ads.showInterstitial(placement).then(() => { advance(); });
        } else {
            advance();
        }
    }

    function refreshCopy() {
        ensureDom();
        if (!timesUpEl) return;
        const tuTitle = timesUpEl.querySelector("[data-ad=timesUpTitle]");
        const tuRvLabel = timesUpEl.querySelector("[data-ad=timesUpRvLabel]");
        const tuGive = timesUpEl.querySelector("[data-ad=timesUpGiveUp]");
        if (tuTitle) tuTitle.textContent = copy("timesUpTitle", "Times Up!");
        if (tuRvLabel) tuRvLabel.textContent = copy("timesUpAddTime", "Add 30 Seconds");
        if (tuGive) tuGive.textContent = copy("timesUpGiveUp", "Give up");

        const guTitle = giveUpEl && giveUpEl.querySelector("[data-ad=giveUpTitle]");
        const guRetry = giveUpEl && giveUpEl.querySelector("[data-ad=giveUpRetry]");
        if (guTitle) guTitle.textContent = copy("giveUpTitle", "Give up?");
        if (guRetry) guRetry.textContent = copy("retry", "Retry");

        const ahTitle = addHintEl && addHintEl.querySelector("[data-ad=addHintTitle]");
        const ahMult = addHintEl && addHintEl.querySelector("[data-ad=addHintMult]");
        const ahRvLabel = addHintEl && addHintEl.querySelector("[data-ad=addHintRvLabel]");
        const ahClose = addHintEl && addHintEl.querySelector("[data-ad=addHintClose]");
        if (ahTitle) ahTitle.textContent = copy("addHintTitle", "Add Hint");
        if (ahMult) ahMult.textContent = "×" + HINT_GRANT;
        if (ahRvLabel) ahRvLabel.textContent = copy("addHintGet", "Get");
        if (ahClose) ahClose.setAttribute("aria-label", copy("prClose", "Close"));
    }

    function showOverlay(el) {
        if (!el) return;
        refreshCopy();
        sfxPopup();
        haptic("error");
        el.classList.remove("is-hiding");
        el.classList.add("show");
        el.setAttribute("aria-hidden", "false");
    }

    function hideOverlay(el, opts) {
        opts = opts || {};
        if (!el) return Promise.resolve();
        if (!el.classList.contains("show") || el.classList.contains("is-hiding")) {
            el.classList.remove("show", "is-hiding", "is-granting");
            el.setAttribute("aria-hidden", "true");
            return Promise.resolve();
        }
        if (!opts.animate) {
            el.classList.remove("show", "is-hiding", "is-granting");
            el.setAttribute("aria-hidden", "true");
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                el.classList.remove("show", "is-hiding", "is-granting");
                el.setAttribute("aria-hidden", "true");
                resolve();
            };
            el.classList.add("is-hiding");
            const card = el.querySelector(".ad-offer-card");
            const onEnd = (e) => {
                if (card && e.target !== card && e.target !== el) return;
                el.removeEventListener("animationend", onEnd);
                if (card) card.removeEventListener("animationend", onEnd);
                finish();
            };
            el.addEventListener("animationend", onEnd);
            if (card) card.addEventListener("animationend", onEnd);
            setTimeout(finish, 260);
        });
    }

    function showTimesUp() {
        ensureDom();
        fillCharacterStage(timesUpEl && timesUpEl.querySelector("[data-ad=timesUpChar]"));
        showOverlay(timesUpEl);
    }

    function hideTimesUp() { return hideOverlay(timesUpEl); }

    function showGiveUp() {
        ensureDom();
        fillCharacterStage(giveUpEl && giveUpEl.querySelector("[data-ad=giveUpChar]"));
        showOverlay(giveUpEl);
    }

    function hideGiveUp() { return hideOverlay(giveUpEl); }

    function showAddHint() {
        ensureDom();
        const icon = addHintEl && addHintEl.querySelector("[data-ad=addHintIcon]");
        if (icon) {
            const sprite = (global.ITEM_CATALOG && global.ITEM_CATALOG.HINT && ITEM_CATALOG.HINT.sprite) ||
                "Assets/Button_Hint.png";
            icon.src = sprite;
        }
        const ahRv = addHintEl && addHintEl.querySelector("[data-ad=addHintRv]");
        if (ahRv) {
            ahRv.disabled = false;
            ahRv.classList.remove("is-busy");
        }
        if (addHintEl) addHintEl.classList.remove("is-granting", "is-hiding");
        showOverlay(addHintEl);
    }

    function hideAddHint(opts) { return hideOverlay(addHintEl, opts); }

    function isAnyOpen() {
        return !!(
            (timesUpEl && timesUpEl.classList.contains("show")) ||
            (giveUpEl && giveUpEl.classList.contains("show")) ||
            (addHintEl && addHintEl.classList.contains("show"))
        );
    }

    function hideAll() {
        hideTimesUp();
        hideGiveUp();
        hideAddHint();
        busy = false;
    }

    global.AdOffers = {
        init: ensureDom,
        refreshCopy,
        showTimesUp,
        hideTimesUp,
        showGiveUp,
        hideGiveUp,
        showAddHint,
        hideAddHint,
        hideAll,
        isAnyOpen,
        EXTRA_SECONDS,
        HINT_GRANT,
        rvIconHtml,
        runInterstitial,
        showToast,
        handleRewardResult
    };
})(typeof window !== "undefined" ? window : globalThis);
