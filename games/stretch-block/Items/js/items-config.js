// OWNER: shared — Items catalogue behaviour knobs.
// Edit by hand. Catalog: items-data.js. Runtime: items.js.
"use strict";

/**
 * storageKey:
 *   localStorage key for owned amounts + unlocks.
 *
 * hintButtonUnlockLevel / emptyHintButtonOpacity:
 *   Hint-button UX knobs (kept here so Inventory shim stays thin).
 */
const ITEMS_CFG = {
    storageKey: "stretchblock_items",
    hintButtonUnlockLevel: 5,
    emptyHintButtonOpacity: 0.6
};

window.ITEMS_CFG = ITEMS_CFG;
