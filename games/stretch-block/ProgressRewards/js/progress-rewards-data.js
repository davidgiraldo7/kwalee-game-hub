// OWNER: shared — Progress Reward enum + authored tiers.
// Edit via ProgressRewards/ProgressRewardsEditor.html or by hand.
// Behaviour/timing: progress-rewards-config.js. Absolute unlockLevel per tier.
"use strict";

/** Extendable reward ids. Gameplay: ProgressRewards.HasUnlockedProgressReward(id). */
const ProgressRewardId = {
    FEATURE_CUSTOM_SHAPE: "FEATURE_CUSTOM_SHAPE",
    HINT_PACK: "HINT_PACK",
    FEATURE_FIXED_BLOCKS: "FEATURE_FIXED_BLOCKS",
    FEATURE_LOCKED_BLOCKS: "FEATURE_LOCKED_BLOCKS",
    FEATURE_ARROW_BLOCKS: "FEATURE_ARROW_BLOCKS",
    NEW_ANIMAL: "NEW_ANIMAL",
    HINT_PACK_LOOPING: "HINT_PACK_LOOPING"
};

/**
 * Absolute unlock tiers (sorted ascending by unlockLevel).
 * unlockLevel = completed-level threshold (player finished that many levels).
 */
const PROGRESS_REWARD_TIERS = [
    {
        unlockLevel: 5,
        rewardId: ProgressRewardId.HINT_PACK,
        sprite: "Assets/Button_Hint.png",
        label: "prLabelHintPack",
        description: "prDescHintPack",
        grantItem: "HINT",
        grantAmount: 3
    },
    {
        unlockLevel: 8,
        rewardId: ProgressRewardId.FEATURE_FIXED_BLOCKS,
        sprite: "ProgressRewards/Assets/feature_fixed.png",
        label: "tutorialFixedTitle",
        description: "tutorialFixedDescription"
    },
    {
        unlockLevel: 13,
        rewardId: ProgressRewardId.FEATURE_LOCKED_BLOCKS,
        sprite: "ProgressRewards/Assets/feature_locked.png",
        label: "tutorialLockedTitle",
        description: "tutorialLockedDescription"
    },
    {
        unlockLevel: 20,
        rewardId: ProgressRewardId.FEATURE_ARROW_BLOCKS,
        sprite: "ProgressRewards/Assets/feature_arrow.png",
        label: "tutorialArrowTitle",
        description: "tutorialArrowDescription"
    },
    {
        unlockLevel: 28,
        rewardId: ProgressRewardId.NEW_ANIMAL,
        sprite: "ProgressRewards/Assets/feature_dino.png",
        label: "streakNewAnimal",
        description: "prDescNewAnimal",
        grantItem: "ANIMAL_2"
    },
    {
        unlockLevel: 36,
        rewardId: ProgressRewardId.HINT_PACK_LOOPING,
        sprite: "Assets/Button_Hint.png",
        label: "prLabelHintPack",
        description: "prDescHintPack",
        grantItem: "HINT",
        grantAmount: 3
    }
];

/**
 * After every authored tier is claimed, re-grant the last tier's prize
 * every N completed levels (measured from the last tier's unlockLevel).
 * 0 = disabled (finite ladder only).
 */
const PROGRESS_REWARD_LOOP_EVERY = 8;

window.ProgressRewardId = ProgressRewardId;
window.PROGRESS_REWARD_TIERS = PROGRESS_REWARD_TIERS;
window.PROGRESS_REWARD_LOOP_EVERY = PROGRESS_REWARD_LOOP_EVERY;
