// OWNER: shared — Daily Win Streak reward enum + cycle reward.
// Edit via DailyStreak/DailyStreakEditor.html or by hand.
// Behaviour/timing: daily-streak-config.js.
"use strict";

/** Extendable reward ids. Gameplay: DailyStreak.HasUnlockedStreakReward(id). */
const DailyStreakRewardId = {
    STREAK_ANIMAL_1: "STREAK_ANIMAL_1"
};

/**
 * First-cycle streak reward (one-shot).
 *
 * cycleLength — days on the track (overrides DAILY_STREAK_CFG.cycleLength when set).
 * rewardDay   — which day in that cycle shows the gift / grants the reward (1..cycleLength).
 *
 * grantItem / grantAmount — preferred Items catalog grant (see Items/js/items-data.js).
 * Legacy grantCharacter still works if grantItem is omitted.
 *
 * spine  — optional live face in the Day-7 bubble
 *          ({ json, atlas, animation, intro?, mask?, maskOffsetX?, maskOffsetY?,
 *             maskScale?, viewport? }).
 *          `mask` is a B/W ear silhouette (black → transparent underlay).
 *          maskOffsetX / maskOffsetY — px nudge of the underlay ( +Y = down ).
 *          maskScale — uniform size of the underlay (1 = fill the face box).
 */
const DAILY_STREAK_DAY7 = {
    cycleLength: 7,
    rewardDay: 7,
    rewardId: DailyStreakRewardId.STREAK_ANIMAL_1,
    sprite: "ProgressRewards/Assets/feature_dog.png",
    label: "streakNewAnimal",
    description: "streakDescAnimal1",
    grantItem: "ANIMAL_1"
};

/** Alias — prefer DAILY_STREAK_DAY7 in hosts; same object. */
const DAILY_STREAK_REWARD = DAILY_STREAK_DAY7;

window.DailyStreakRewardId = DailyStreakRewardId;
window.DAILY_STREAK_DAY7 = DAILY_STREAK_DAY7;
window.DAILY_STREAK_REWARD = DAILY_STREAK_REWARD;
