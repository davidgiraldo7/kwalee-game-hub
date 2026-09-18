// OWNER: shared — Inventory facade over Items (backward-compatible API).
// Prefer window.Items for new code. Config knobs still accepted via init().
"use strict";

(function () {
    function items() {
        return window.Items || null;
    }

    function getHints() {
        const api = items();
        return api && typeof api.getHints === "function" ? api.getHints() : 0;
    }

    function grantHints(amount) {
        const api = items();
        return api && typeof api.grantHints === "function" ? api.grantHints(amount) : getHints();
    }

    function tryConsumeHint() {
        const api = items();
        return !!(api && typeof api.tryConsumeHint === "function" && api.tryConsumeHint());
    }

    function hintButtonUnlockLevel() {
        const api = items();
        if (api && typeof api.hintButtonUnlockLevel === "function") {
            return api.hintButtonUnlockLevel();
        }
        const n = parseInt((window.INVENTORY_CFG || {}).hintButtonUnlockLevel, 10);
        return Number.isFinite(n) && n >= 1 ? n : 2;
    }

    function emptyHintButtonOpacity() {
        const api = items();
        if (api && typeof api.emptyHintButtonOpacity === "function") {
            return api.emptyHintButtonOpacity();
        }
        const n = Number((window.INVENTORY_CFG || {}).emptyHintButtonOpacity);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.6;
    }

    function Reset() {
        const api = items();
        if (api && typeof api.Reset === "function") api.Reset();
        return getHints();
    }

    function init(options) {
        const api = items();
        if (api && typeof api.init === "function") {
            // Map legacy inventory options onto Items.
            const mapped = Object.assign({}, options || {});
            if (options && options.storageKey && !mapped.storageKey) {
                mapped.storageKey = options.storageKey;
            }
            api.init(mapped);
        }
        if (options && typeof options === "object") {
            window.INVENTORY_CFG = Object.assign({}, window.INVENTORY_CFG || {}, options);
        }
        return facade;
    }

    const facade = {
        init,
        getHints,
        grantHints,
        tryConsumeHint,
        hintButtonUnlockLevel,
        emptyHintButtonOpacity,
        Reset,
        reset: Reset
    };

    window.Inventory = facade;
})();
