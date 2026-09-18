// OWNER: shared — Daily Win Streak module behaviour + timing config.
// Edit by hand. Day-7 reward lives in daily-streak-data.js.
"use strict";

/**
 * Module behaviour knobs (override in DailyStreak.init() if needed).
 *
 * levelCompleteEvent:
 *   CustomEvent name the host dispatches on win. Detail may include
 *   { completedLevel: number } (informational; streak uses calendar days).
 *
 * listenToLevelComplete:
 *   When true, module listens and runs OnLevelComplete (tick + optional UI).
 *   Host should usually keep this true and set ProgressRewards.listenToLevelComplete
 *   false so streak can run first, then forward via onStreakFlowDone.
 *
 * cycleLength:
 *   Days on the track (fallback). Authored DAILY_STREAK_DAY7.cycleLength overrides
 *   this when set. Gift / reward day is DAILY_STREAK_DAY7.rewardDay.
 *
 * Timing (ms):
 *   openFadeMs        — overlay / backdrop fade-in
 *   badgePopMs        — badge spring entrance
 *   trackFillMs       — delay after badge settles before lighting the new day
 *   countPopMs        — badge number tick pop (celebrate)
 *   slotLitMs         — newly lit day slot punch
 *   continueRevealMs  — after celebrate settles, hold before Continue appears
 *   numRollMs         — old→new badge digit roll (celebrate tick)
 *   slotCascadeMs     — per-slot stagger as the track springs in on open
 *
 * Celebrate VFX:
 *   confettiCount  — CSS confetti pieces on the streak-up tick (0 disables)
 *   confettiMs     — confetti flight time before the pieces are removed
 *   confettiColors — piece colours; defaults to the game's candy block palette
 *   showBurst      — expanding gold shockwave behind the badge on the tick
 *   titleLetterPop — per-letter title entrance (matches the win card)
 *
 * Day-7 crate (same Spine RewardBox as ProgressRewards):
 *   chestSkin     — "Green" | "Blue" | "Red"
 *   giftSizePx    — visual scale of the track-end crate only (does not grow the pill)
 */
const DAILY_STREAK_CFG = {
    levelCompleteEvent: "kpf:levelComplete",
    listenToLevelComplete: true,
    cycleLength: 7,
    openFadeMs: 340,
    badgePopMs: 560,
    trackFillMs: 420,
    countPopMs: 480,
    slotLitMs: 560,
    continueRevealMs: 1500,
    numRollMs: 460,
    slotCascadeMs: 55,
    confettiCount: 20,
    confettiMs: 1500,
    // Mirrors PALETTE in js/game-feel.js so the burst is made of block colours.
    confettiColors: [
        "#f04e66", "#627ce8", "#45c977", "#f09a42",
        "#a979de", "#f3c33d", "#5bc6d5", "#ed6e94"
    ],
    showBurst: true,
    titleLetterPop: true,
    chestSkin: "Green",
    giftSizePx: 82
};

window.DAILY_STREAK_CFG = DAILY_STREAK_CFG;
