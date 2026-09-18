// OWNER: shared — Block character catalog (ids + asset path arrays only).
// Behaviour/offsets: block-characters-config.js. Runtime: block-characters.js.
// Asset paths are from the game root (next to index.html).
"use strict";

/**
 * Extendable character ids. Gameplay / unlock UI should use these constants,
 * never raw strings, so renames stay centralized.
 *
 * Query unlocks later via BlockCharacters.HasUnlockedCharacter(CharacterId.CAT).
 * Unlocked via Items.grant (item.characterId) from ProgressRewards / DailyStreak.
 */
const CharacterId = {
    CAT: "Cat",
    DOG: "Dog",
    DINO: "Dino"
};

/**
 * Authored character definitions.
 *
 * Each entry:
 *   id            — must match CharacterId value / object key
 *   label         — display name for a future picker UI
 *   heads[]       — face entries. Prefer one Spine head with an `expressions`
 *                   list (Intro/Idle animation pairs). Legacy: PNG path
 *                   strings, or a Spine head { type:"spine", json, atlas,
 *                   intro, idle, fallback }.
 *   masks[]       — ear (or equivalent) masks. Default / fallback is masks[0].
 *                   Spine expressions may set their own `mask` path when the
 *                   ear silhouette changes per face (e.g. Dog Droop vs Flop).
 *   feet[]        — paw/foot overlays (index 0 used until multi-feet needed)
 *   tails[]       — optional tail overlays (all expanded shapes; see layout rules)
 *   offsets       — optional per-character overrides of BLOCK_CHARACTERS_CFG.offsets
 *                   (e.g. larger mask/head scale when ear art has more padding)
 *   colorVariants — optional map of PALETTE name → { heads, masks, feet, tails }
 *                   When present for a block's color name, those arrays win over
 *                   the character defaults (same pairing rules).
 *
 * Add a character: copy Assets/Characters/Cat → Assets/Characters/<Name>,
 * register a CharacterId, and add a catalog entry with path arrays.
 */
const CAT_SPINE_EXPRESSIONS = [
    { id: "Face1", intro: "IntroFace1", idle: "IdleFace1" },
    { id: "Angry", intro: "IntroAngry", idle: "IdleAngry" },
    { id: "Awe", intro: "IntroAwe", idle: "IdleAwe" },
    { id: "Wink", intro: "IntroWink", idle: "IdleWink" },
    { id: "Happy", intro: "IntroHappy", idle: "IdleHappy" },
    { id: "Tongue", intro: "IntroTongue", idle: "IdleTongue" },
    { id: "Chad", intro: "IntroChad", idle: "IdleChad" }
];

const CAT_SPINE_HEAD = {
    type: "spine",
    json: "Assets/Characters/Cat/Head/Spine/CatFace1.json",
    atlas: "Assets/Characters/Cat/Head/Spine/CatFace1.atlas",
    // Atlas sheet is only a load-time placeholder; live faces come from Spine.
    fallback: "Assets/Characters/Cat/Head/Spine/CatFace1.png",
    expressions: CAT_SPINE_EXPRESSIONS
};

const DOG_MASK_DROOP = "Assets/Characters/Dog/Mask/Dog_EarMask_Droop.png";
const DOG_MASK_FLOP = "Assets/Characters/Dog/Mask/Dog_EarMask_Flop.png";
// Point ears exist as a mask but are not used by any current Spine expression.
const DOG_MASK_POINT = "Assets/Characters/Dog/Mask/Dog_EarMask_Point.png";

const DOG_SPINE_EXPRESSIONS = [
    // Happy uses Droop ears in Spine; the rest use Flop.
    { id: "Happy", intro: "IntroHappy", idle: "IdleHappy", mask: DOG_MASK_DROOP },
    { id: "Angry", intro: "IntroAngry", idle: "IdleAngry", mask: DOG_MASK_FLOP },
    { id: "Chad", intro: "IntroChad", idle: "IdleChad", mask: DOG_MASK_FLOP },
    { id: "Wink", intro: "IntroWink", idle: "IdleWink", mask: DOG_MASK_FLOP }
];

const DOG_SPINE_HEAD = {
    type: "spine",
    json: "Assets/Characters/Dog/Dog.json",
    atlas: "Assets/Characters/Dog/Dog.atlas",
    fallback: "Assets/Characters/Dog/Dog.png",
    expressions: DOG_SPINE_EXPRESSIONS,
    // Per-skeleton framing (merges over BLOCK_CHARACTERS_CFG.spineHead).
    // Happy Droop ears are ~±450 wide (512 att × bone scale ~2); viewport
    // stays wide so sides/bottom aren't cropped, then contentScale zooms the
    // blit back up so the face still fills the ear mask.
    spineHead: {
        contentScale: 1.15,
        contentOffsetX: 0,
        contentOffsetY: -0.1,
        viewportCenterX: 0,
        viewportCenterY: 20,
        viewportSize: 1040,
        earBones: ["Ears", "Ears2", "Ears3", "Ears4"],
        earBoneOffsetY: 0,
        earBoneScale: 1,
        hideEarSlots: false,
        earSlotNames: ["Ears", "Dog_Ears_Flop", "Dog_Ears_Flop2", "Dog_Ears_Flop3"]
    }
};

const CHARACTER_CATALOG = {
    Cat: {
        id: CharacterId.CAT,
        label: "Cat",
        heads: [CAT_SPINE_HEAD],
        masks: [
            "Assets/Characters/Cat/Mask/Cat_EarMask_1.png"
        ],
        feet: [
            "Assets/Characters/Cat/Feet/Cat_Feet_1.png"
        ],
        tails: [
            "Assets/Characters/Cat/Tail/Cat_Tail_1.png"
        ],
        colorVariants: {
            // Example for a future red-specific pack:
            // red: {
            //     heads: [{ ...CAT_SPINE_HEAD, json: "...Red.json", atlas: "...Red.atlas" }],
            //     masks: ["Assets/Characters/Cat/Mask/Cat_EarMask_1.png"],
            //     feet:  ["Assets/Characters/Cat/Feet/Cat_Feet_1.png"],
            //     tails: ["Assets/Characters/Cat/Tail/Cat_Tail_1.png"]
            // }
        }
    },
    Dog: {
        id: CharacterId.DOG,
        label: "Dog",
        heads: [DOG_SPINE_HEAD],
        // masks[0] is the fallback when an expression omits `mask`.
        masks: [DOG_MASK_DROOP, DOG_MASK_FLOP, DOG_MASK_POINT],
        // Placeholder Cat art for now; keep Dog/Feet + Dog/Tail folders for real assets later.
        feet: [
            "Assets/Characters/Dog/Feet/Cat_Feet_1.png"
        ],
        tails: [
            "Assets/Characters/Dog/Tail/Cat_Tail_1.png"
        ],
        // Dog ear masks have more transparent padding than Cat — scale mask +
        // head together so the silhouette still lines up with the Spine face.
        // offsetY: positive = toward top of board (cell units). Keep head + mask matched.
        offsets: {
            head: { scale: 1, offsetY: 0.1 },
            mask: { scale: 1.1, offsetY: 0.125 }
        },
        colorVariants: {}
    },
    Dino: {
        id: CharacterId.DINO,
        label: "Dino",
        // TODO: replace with Spine head once Dino Face art ships (see Dog/Cat).
        // Mask used as a temporary PNG face so unlock + picker still resolve.
        heads: [
            "Assets/Characters/Dino/Mask/Dino_Mask_Rex.png"
        ],
        masks: [
            "Assets/Characters/Dino/Mask/Dino_Mask_Rex.png",
            "Assets/Characters/Dino/Mask/Dino_Mask_Steg.png",
            "Assets/Characters/Dino/Mask/Dino_Mask_Tri.png",
            "Assets/Characters/Dino/Mask/Dino_Mask_Ank.png"
        ],
        feet: [
            "Assets/Characters/Dino/Feet/Dino_Feet.png"
        ],
        tails: [
            "Assets/Characters/Dino/Tail/Dino_Tail_Default.png",
            "Assets/Characters/Dino/Tail/Dino_Tail_Ank.png"
        ],
        offsets: {
            head: { scale: 1, offsetY: 0.0 },
            mask: { scale: 1.2, offsetY: 0.025 }
        },
        colorVariants: {}
    }
};

window.CharacterId = CharacterId;
window.CHARACTER_CATALOG = CHARACTER_CATALOG;
