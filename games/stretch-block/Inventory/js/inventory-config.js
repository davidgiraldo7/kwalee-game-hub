// OWNER: shared — legacy inventory knobs (forwarded into Items on init).
// Prefer ITEMS_CFG + ITEM_CATALOG. Runtime facade: inventory.js → Items.
"use strict";

const INVENTORY_CFG = {
    storageKey: "stretchblock_inventory",
    startingHints: 3,
    hintButtonUnlockLevel: 5,
    emptyHintButtonOpacity: 0.6
};

window.INVENTORY_CFG = INVENTORY_CFG;
