// OWNER: shared — Item enum + catalog (hints, animals, future goods).
// Edit via Items/ItemsEditor.html or by hand. Runtime: items.js.
// ProgressRewards / DailyStreak grant via grantItem (+ grantAmount for stacks).
"use strict";

/**
 * Extendable item ids. Prefer these constants over raw strings.
 * Gameplay: Items.has(ItemId.HINT), Items.grant(ItemId.CAT), etc.
 */
const ItemId = {
    HINT: "HINT",
    CAT: "CAT",
    // Unlock for streak / progress rewards (grants Dog character).
    ANIMAL_1: "ANIMAL_1",
    // Unlock for progress rewards (grants Dino character).
    ANIMAL_2: "ANIMAL_2"
};

/**
 * Authored item definitions.
 *
 * kind:
 *   "consumable" — stackable count in inventory (hints, etc.)
 *   "unlock"     — one-shot ownership (animals, cosmetics)
 *
 * characterId (unlock only):
 *   Optional CHARACTER_CATALOG id. On grant, also UnlockCharacter + select.
 *
 * startingAmount (consumable only):
 *   Count granted on a fresh save.
 *
 * sprite / label / description:
 *   Shared presentation for reward editors + future inventory UI.
 *   label / description are translations.js keys (resolved via t()).
 */
const ITEM_CATALOG = {
    HINT: {
        id: ItemId.HINT,
        kind: "consumable",
        label: "itemHintLabel",
        description: "itemHintDescription",
        sprite: "Assets/Button_Hint.png",
        startingAmount: 3
    },
    CAT: {
        id: ItemId.CAT,
        kind: "unlock",
        label: "itemCatLabel",
        description: "itemCatDescription",
        sprite: "Assets/Characters/Cat/Mask/Cat_EarMask_1.png",
        characterId: "Cat"
    },
    ANIMAL_1: {
        id: ItemId.ANIMAL_1,
        kind: "unlock",
        label: "itemDogLabel",
        description: "itemDogDescription",
        sprite: "Assets/Characters/Dog/Mask/Dog_EarMask_Flop.png",
        characterId: "Dog"
    },
    ANIMAL_2: {
        id: ItemId.ANIMAL_2,
        kind: "unlock",
        label: "itemDinoLabel",
        description: "itemDinoDescription",
        sprite: "Assets/Characters/Dino/Mask/Dino_Mask_Rex.png",
        characterId: "Dino"
    }
};

window.ItemId = ItemId;
window.ITEM_CATALOG = ITEM_CATALOG;
