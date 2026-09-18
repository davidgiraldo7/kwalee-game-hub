// OWNER: shared — Items runtime (catalog + inventory persistence).
// Config: items-config.js. Catalog: items-data.js.
// Hosts / rewards call Items.grant / tryConsume. Inventory.* aliases kept.
"use strict";

(function () {
    function readCfg() {
        return (typeof window !== "undefined" && window.ITEMS_CFG) || {};
    }

    function catalog() {
        return (typeof window !== "undefined" && window.ITEM_CATALOG) || {};
    }

    function storageKey() {
        return readCfg().storageKey || "stretchblock_items";
    }

    function defaultAmounts() {
        const out = {};
        const cat = catalog();
        Object.keys(cat).forEach((id) => {
            const item = cat[id];
            if (!item || item.kind !== "consumable") return;
            const n = parseInt(item.startingAmount, 10);
            out[id] = Number.isFinite(n) && n >= 0 ? n : 0;
        });
        return out;
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(storageKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                const amounts = (parsed.amounts && typeof parsed.amounts === "object")
                    ? Object.assign({}, parsed.amounts)
                    : {};
                if (parsed.hints != null && amounts.HINT == null) {
                    const h = parseInt(parsed.hints, 10);
                    if (Number.isFinite(h) && h >= 0) amounts.HINT = h;
                }
                const unlocked = Array.isArray(parsed.unlocked)
                    ? parsed.unlocked.filter((id) => typeof id === "string")
                    : [];
                const defaults = defaultAmounts();
                Object.keys(defaults).forEach((id) => {
                    if (amounts[id] == null) amounts[id] = defaults[id];
                });
                return { amounts: amounts, unlocked: unlocked };
            }
        } catch (_) { /* fall through */ }

        // Fresh Items save: pull hint count from legacy Inventory key when present.
        const amounts = defaultAmounts();
        try {
            const legacyKey = (window.INVENTORY_CFG && window.INVENTORY_CFG.storageKey) ||
                "stretchblock_inventory";
            const legacyRaw = localStorage.getItem(legacyKey);
            if (legacyRaw) {
                const legacy = JSON.parse(legacyRaw);
                const h = parseInt(legacy.hints, 10);
                if (Number.isFinite(h) && h >= 0) amounts.HINT = h;
            }
        } catch (_) { /* ignore */ }
        return { amounts: amounts, unlocked: [] };
    }

    function saveState() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                amounts: persist.amounts,
                unlocked: persist.unlocked.slice()
            }));
        } catch (_) { /* ignore */ }
    }

    function syncCfgFromInventory() {
        const inv = window.INVENTORY_CFG || {};
        const cfg = readCfg();
        if (inv.hintButtonUnlockLevel != null && cfg.hintButtonUnlockLevel == null) {
            cfg.hintButtonUnlockLevel = inv.hintButtonUnlockLevel;
        }
        if (inv.emptyHintButtonOpacity != null && cfg.emptyHintButtonOpacity == null) {
            cfg.emptyHintButtonOpacity = inv.emptyHintButtonOpacity;
        }
        if (inv.startingHints != null && catalog().HINT && catalog().HINT.startingAmount == null) {
            catalog().HINT.startingAmount = inv.startingHints;
        }
        // Prefer inventory UX knobs when both exist (Stretch Block hosts both).
        if (inv.hintButtonUnlockLevel != null) {
            cfg.hintButtonUnlockLevel = inv.hintButtonUnlockLevel;
        }
        if (inv.emptyHintButtonOpacity != null) {
            cfg.emptyHintButtonOpacity = inv.emptyHintButtonOpacity;
        }
        window.ITEMS_CFG = cfg;
    }

    let persist = loadState();
    syncCfgFromInventory();
    if (!localStorage.getItem(storageKey())) saveState();

    function getItem(itemId) {
        const id = String(itemId || "");
        return catalog()[id] || null;
    }

    function getCatalog() {
        return catalog();
    }

    function listItems() {
        const cat = catalog();
        return Object.keys(cat).map((id) => cat[id]).filter(Boolean);
    }

    function getCount(itemId) {
        const item = getItem(itemId);
        if (!item) return 0;
        const id = item.id || String(itemId);
        if (item.kind === "unlock") {
            return persist.unlocked.indexOf(id) !== -1 ? 1 : 0;
        }
        return Math.max(0, parseInt(persist.amounts[id], 10) || 0);
    }

    function has(itemId) {
        return getCount(itemId) > 0;
    }

    function applyCharacterLink(item) {
        const characterId = item && item.characterId;
        if (!characterId) return;
        if (!window.BlockCharacters || typeof BlockCharacters.UnlockCharacter !== "function") {
            return;
        }
        // Skip links to characters that aren't in the catalog yet (placeholder pets).
        const cat = typeof BlockCharacters.getCatalog === "function" ? BlockCharacters.getCatalog() : null;
        if (cat && !cat[String(characterId)]) return;
        try {
            BlockCharacters.UnlockCharacter(String(characterId));
            if (typeof BlockCharacters.setSelectedCharacter === "function") {
                BlockCharacters.setSelectedCharacter(String(characterId));
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * Grant an item. Consumables add amount (default 1). Unlocks mark owned once.
     * @returns {{ ok: boolean, count: number, newlyGranted: boolean }}
     */
    function grant(itemId, amount) {
        const item = getItem(itemId);
        if (!item) return { ok: false, count: 0, newlyGranted: false };
        const id = item.id || String(itemId);

        if (item.kind === "unlock") {
            const already = persist.unlocked.indexOf(id) !== -1;
            if (!already) {
                persist.unlocked.push(id);
                saveState();
                applyCharacterLink(item);
            }
            return { ok: true, count: 1, newlyGranted: !already };
        }

        const n = parseInt(amount, 10);
        const add = n > 0 ? n : 1;
        const next = getCount(id) + add;
        persist.amounts[id] = next;
        saveState();
        return { ok: true, count: next, newlyGranted: true };
    }

    /**
     * Consume from a stackable item.
     * @returns {boolean}
     */
    function tryConsume(itemId, amount) {
        const item = getItem(itemId);
        if (!item || item.kind === "unlock") return false;
        const id = item.id || String(itemId);
        const n = parseInt(amount, 10);
        const need = n > 0 ? n : 1;
        const have = getCount(id);
        if (have < need) return false;
        persist.amounts[id] = have - need;
        saveState();
        return true;
    }

    function hintButtonUnlockLevel() {
        const n = parseInt(readCfg().hintButtonUnlockLevel, 10);
        return Number.isFinite(n) && n >= 1 ? n : 2;
    }

    function emptyHintButtonOpacity() {
        const n = Number(readCfg().emptyHintButtonOpacity);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.6;
    }

    // ---- Hint convenience (gameplay call sites) ----
    function getHints() {
        return getCount("HINT");
    }

    function grantHints(amount) {
        return grant("HINT", amount).count;
    }

    function tryConsumeHint() {
        return tryConsume("HINT", 1);
    }

    function Reset() {
        persist = { amounts: defaultAmounts(), unlocked: [] };
        saveState();
        return api;
    }

    function init(options) {
        if (options && typeof options === "object") {
            const cfg = readCfg();
            if (options.storageKey) cfg.storageKey = String(options.storageKey);
            if (options.hintButtonUnlockLevel != null) {
                cfg.hintButtonUnlockLevel = parseInt(options.hintButtonUnlockLevel, 10) || 2;
            }
            if (options.emptyHintButtonOpacity != null) {
                cfg.emptyHintButtonOpacity = Number(options.emptyHintButtonOpacity);
            }
            // Map legacy startingHints onto catalog if provided.
            if (options.startingHints != null && catalog().HINT) {
                catalog().HINT.startingAmount = parseInt(options.startingHints, 10) || 0;
            }
            window.ITEMS_CFG = cfg;
            persist = loadState();
            if (!localStorage.getItem(storageKey())) saveState();
        }
        return api;
    }

    const api = {
        init,
        getItem,
        getCatalog,
        listItems,
        getCount,
        has,
        grant,
        tryConsume,
        Reset,
        getHints,
        grantHints,
        tryConsumeHint,
        hintButtonUnlockLevel,
        emptyHintButtonOpacity,
        reset: Reset
    };

    window.Items = api;
})();
