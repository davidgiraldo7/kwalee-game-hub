// OWNER: shared — Progress Reward module behaviour + timing config.
// Edit by hand. Tiers/enum live in progress-rewards-data.js.
"use strict";

/**
 * Module behaviour knobs (override in ProgressRewards.init() if needed).
 *
 * showOnLevelComplete:
 *   "every"        — show the progress popup after every level clear
 *   "sessionFirst" — show only the first clear each session (prize unlocks still show)
 *
 * listenToLevelComplete:
 *   When true (default), module binds levelCompleteEvent itself.
 *   Stretch Block sets this false in init so DailyStreak can show first,
 *   then forward via ProgressRewards.OnLevelComplete.
 *   barAnimDelay      — pause before the bar starts moving
 *   barAnimMs         — fill duration per level-section
 *   barSectionPopMs   — pop juice after each section lands
 *   chestOpenMs       — fallback wait if Spine open complete is unavailable
 *   chestFlyMs        — bar → center chest flight duration
 *   chestPrizeRevealMs— ms after open starts when the prize pops out
 *   prizeEmergeMs     — item-out-of-chest motion before the feature card
 *   prizeSettleMs     — cross-fade that carries the emerged prize into the card
 *   claimOutMs        — card exit after Claim, before the bar comes back
 *   prizeShowMs       — unused hold leftover (claim waits on Claim button)
 *   chestBarSizePx    — bar crate size (square, px)
 *   chestCenterSizePx — final center crate size (square, px)
 *   barCircleStart    — 0..1 width where the bar groove meets the chest circle
 *                       (last win fills only this circle; earlier wins stay in the groove)
 *   chestSkin         — RewardBox skin: "Green" | "Blue" | "Red"
 *   nextTierPeekMs    — hold after advancing to the next tier bar
 *   statusHoldMs      — hold when showing status only (no claim), before auto-close
 *   nextTierBarAnimMs — bar lerp when peeking the next tier after a claim
 *
 * Juice (set counts to 0 / flags false to strip it back):
 *   confettiCount     — pieces launched from the chest as it opens
 *   confettiMs        — confetti flight duration
 *   confettiColors    — confetti palette
 *   showUnlockFlash   — white flash + shockwave ring on the open beat
 *   titleLetterPop    — per-letter pop on the "New Feature!" title
 */
const PROGRESS_REWARDS_CFG = {
    showOnLevelComplete: "every",
    levelCompleteEvent: "kpf:levelComplete",
    listenToLevelComplete: true,
    barAnimDelay: 350,
    barAnimMs: 580,
    barSectionPopMs: 280,
    chestOpenMs: 3200,
    chestFlyMs: 550,
    chestPrizeRevealMs: 650,
    prizeEmergeMs: 700,
    prizeSettleMs: 420,
    claimOutMs: 300,
    prizeShowMs: 1400,
    chestBarSizePx: 128,
    chestCenterSizePx: 760,
    // Reward-Bar-Backing: groove ends ~where the circle begins (chest sits at ~87%).
    barCircleStart: 0.765,
    chestSkin: "Green",
    nextTierPeekMs: 700,
    statusHoldMs: 1700,
    nextTierBarAnimMs: 600,
    confettiCount: 26,
    confettiMs: 1700,
    confettiColors: [
        "#f3c33d", "#f09a42", "#45c977", "#5bc6d5",
        "#f04e66", "#a979de", "#fff3d0", "#627ce8"
    ],
    showUnlockFlash: true,
    titleLetterPop: true
};

window.PROGRESS_REWARDS_CFG = PROGRESS_REWARDS_CFG;
