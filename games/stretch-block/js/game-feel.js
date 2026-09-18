// OWNER: artist — palette, Soft-3D config, juice / intro / outro / win tunables
"use strict";

window.CSApp = window.CSApp || {};

const CS_JUICE = {
    LERP_K: 20,            // render smoothing rate (1 - exp(-k*dt))
    DRAG_SCALE: 1.03,      // scale of the actively dragged block (kept mild so
                           // lift doesn't read as overlapping neighbours; SP-956)
    DRAG_FOLLOW_K: 22,     // how fast the float eases to the clamped finger
                           // spot (smooth catch-up around corners)
    DRAG_SQUISH_MAX: 0.2,     // max slime compression (fraction of axis) when a
                              // held block is pushed into a blocked neighbour
    DRAG_SQUISH_SCALE: 0.6,   // finger overpush (cells) to approach that max
    DRAG_SQUISH_CROSS: 0.5,   // cross-axis bulge for a volume-preserving squash
    DRAG_SQUISH_BULGE: 0.35,  // outward face bulge on the perpendicular faces
    DRAG_SQUISH_FOLLOW_K: 12,  // smooth rate for pressure changes while dragging
    DRAG_SQUISH_REBOUND: 7,   // spring kick that pops the slime back on release
    // Legacy (unused): drag now uses grid slide-bounds clamp, not swept AABB.
    DRAG_BUFFER: 0,
    DRAG_CORNER_R: 0.18,
    MOVE_WOBBLE: 0.055,    // visual wobble peak after a moved grid cell
    MOVE_WOBBLE_DECAY: 5,  // exponential settle rate after movement
    DRAG_WOBBLE_K: 4.5,    // jelly wobble impulse from finger acceleration while dragging
    PASS_BY_JIGGLE: 0.25,  // small spring impulse for blocks passed alongside
    // ---- Tap-to-expand feel (exposed in the 3D debug "Expand" tab) ----
    EXPAND_K: 28,          // how fast the slab's footprint eases to its new size
                           // when tapped (higher = snappier expand/shrink)
    EXPAND_POP: 1.0,       // strength of the elastic "pop" kicked on a successful expand
    POP_AMP: 0.18,         // amplitude of the expand pop's squash-&-stretch wobble
    POP_FREQ: 17,          // oscillation speed of the expand pop wobble
    POP_DECAY: 6,          // how quickly the expand pop wobble settles
    EXPAND_GLOW_DECAY: 2.4,// how fast the between-block seam glow pulse fades after expanding
    // Failed-expansion feedback. The body is visual-only: logical x/y/w/h never change.
    // All time values are milliseconds and are independent: no duration proportions.
    FAIL_GROW_MS: 180,           // time to reach the largest fitting partial expansion
    FAIL_HOLD_MS: 450,           // time held at that partial expansion before returning
    FAIL_RETURN_MS: 170,         // time for the fast elastic return to the original shape
    // Pre-expanded blocks use their own gentler shrink-refusal body timings.
    FAIL_SHRINK_GROW_MS: 150,    // time for a rigid block to dip inward
    FAIL_SHRINK_HOLD_MS: 375,    // time held at its inward dip
    FAIL_SHRINK_RETURN_MS: 225,  // time for a rigid block to return to full size
    // These only affect the confined faces, not the body's grow/hold/return timings.
    FAIL_BULGE_START_MS: 108,    // delay before confined-face bulging begins
    FAIL_BULGE_DURATION_MS: 702, // time confined faces keep bulging
    FAIL_BULGE_PULSE_MS: 476,    // milliseconds per complete confined-face bulge pulse
    FAIL_BULGE_BASE: 0.6,        // constant confined-face bulge strength; normally 0 to 1
    FAIL_BULGE_PULSE: 0.4,       // extra sine-pulse bulge strength; normally 0 to 1
    FAIL_SHAKE_START_MS: 108,    // delay before the impact shake begins
    FAIL_SHAKE_DURATION_MS: 648, // time the impact shake remains active
    FAIL_SHAKE_PERIOD_MS: 114,   // milliseconds per complete horizontal shake cycle
    FAIL_SHRINK_SHAKE_PERIOD_MS: 228, // rigid shrink refusal shakes at half speed
    FAIL_SHAKE_AMPLITUDE: 0.06,  // impact-shake distance, in grid-cell fractions
    FAIL_FLASH_START_MS: 180,    // delay before the white impact flash begins
    FAIL_FLASH_DURATION_MS: 340, // milliseconds for the white impact flash
    FAIL_FLASH_PEAK: 0.5,        // maximum flash opacity: 0 = invisible, 1 = opaque
    // Return curve = (1 - progress)^DECAY * cos(progress * 2pi * CYCLES).
    FAIL_ELASTIC_DECAY: 2,       // dimensionless damping exponent; higher settles faster
    FAIL_ELASTIC_CYCLES: 1,      // dimensionless count of return oscillations before settling
    FAIL_RETURN_SQUASH: 0.12,    // compression per failed-expansion grid cell at return impact
    FAIL_RETURN_SQUASH_MAX: 0.16,// maximum return-impact compression in either axis
    FAIL_RETURN_SQUASH_MS: 95,   // milliseconds for the enclosed return-impact squash
    FAIL_RETURN_JIGGLE: 2.6,     // spring-velocity impulse per failed partial-expansion grid cell (+30% bounce)
    FAIL_RETURN_WOBBLE_STRENGTH: 1.625, // post-return wobble multiplier: 1 = normal move wobble (+30% bounce)
    FAIL_RETURN_WOBBLE_TAIL_MS: 1350,  // milliseconds for the smooth post-return wobble tail (extra full bounce cycle)
    TUTORIAL_COPY_HEIGHT_PX: 76,
    TUTORIAL_COPY_THREE_LINE_HEIGHT_PX: 100,
    TUTORIAL_TOP_UI_GAP_PX: 16,
    TUTORIAL_TITLE_SLOT_PX: 42,
    TUTORIAL_COPY_MIN_WIDTH_PX: 260,
    TUTORIAL_COPY_MAX_WIDTH_PX: 620,
    SPRING_K: 180,         // wobble spring stiffness
    SPRING_D: 16,          // wobble spring damping
    AXIS_GUIDE_OPACITY: 0.20,
    GRID_CELL: "#454f60",  // empty playable cell colour
};

const PALETTE = {
    red:    "#f04e66",
    blue:   "#627ce8",
    green:  "#45c977",
    orange: "#f09a42",
    purple: "#a979de",
    yellow: "#f3c33d",
    cyan:   "#5bc6d5",
    pink:   "#ed6e94",
};


const CS3D_CFG = {
    BLOCK_H: 0.62,        // block slab thickness, in cells
    CELL_PAD: 0.0,        // gap around each cell/block footprint, in cells
    CORNER_R: 0.115,      // rounded-corner radius of block/tile footprints
    RIGID_CORNER_R: 0.0,  // true sharp corners for rigid (pre-expanded) slabs
    CRATE_FRAME_T: 0.14,  // rigid crate rail thickness, in cells
    CRATE_FRAME_INSET: 0.028, // keeps every wall element inside the gameplay footprint
    CRATE_INTERIOR_SCALE: 0.93, // colored rigid slab inset within its cardboard walls
    CRATE_MARKER_INSET: 0.31, // combined lock/arrow marker clearance from rigid frame
    // Rigid (pre-expanded) blocks read as a cardboard box — kraft corrugated
    // walls around the colored interior, echoing the "cats love boxes" theme.
    CRATE_WALL_COLOR: "#c88a4c",      // warm kraft cardboard box wall
    CRATE_WALL_ROUGHNESS: 0.93,       // matte corrugated fibreboard, no metal sheen
    CRATE_EDGE_COLOR: "#d5a66a",      // subdued lighter kraft along the top wall edges
    // Locked (immovable) blocks: warm grey slab + wooden stake — no characters.
    LOCKED_STONE_COLOR: "#8e867b", // warm grey that sits with sand/platform tones
    LOCKED_STONE_ROUGHNESS: 0.78,  // matte stone (vs glossy playable blocks)
    LOCKED_STAKE_RADIUS: 0.3,     // wooden stake shaft radius, in cells
    LOCKED_STAKE_HEIGHT: 0.3,      // how far the stake rises above the slab top
    LOCKED_STAKE_EMBED: 0.17,      // how deep the stake sinks into the slab
    LOCKED_STAKE_INDENT_RADIUS: 0.38, // recessed ring around the driven stake
    LOCKED_STAKE_INDENT_DEPTH: 0.03, // how deep that ring sinks into the top
    LOCKED_STAKE_TAPER: 1.2,      // top radius as a fraction of shaft radius
    LOCKED_STAKE_SEGMENTS: 24,    // radial segments (higher = rounder dowel)
    LOCKED_STAKE_BEVEL: 0.05,    // rounded top-edge fillet radius, in cells
    LOCKED_STAKE_BEVEL_SEGMENTS: 6, // steps along the top bevel arc
    LOCKED_STAKE_COLOR: "#a67c52", // warm wood matching the sand board
    LOCKED_STAKE_TOP_COLOR: "#ba8a59", // lighter cut face on the stake top
    LOCKED_STAKE_INDENT_COLOR: "#1f1d19", // outer indent tone (fades toward edge)
    LOCKED_STAKE_INDENT_CENTER_COLOR: "#3a3530", // darker middle of the indent gradient
    LOCKED_STAKE_ROUGHNESS: 0.98,
    LOCKED_STAKE_LABEL_SCALE: 1.3, // number size relative to stake top diameter
    LOCKED_HATCH_COLOR: "#5f5850", // diagonal machined stripes on the slab top
    LOCKED_HATCH_OPACITY: 0.26,    // how strongly the stripes darken the stone
    LOCKED_HATCH_SPACING: 0.70,    // gap between stripe centres, in cells
    LOCKED_HATCH_WIDTH: 0.30,      // stripe thickness, in cells
    LOCKED_HATCH_ANGLE: -45,       // stripe direction, in degrees
    TILT_DEG: 18.5,       // camera tilt from straight-down (a slight angle)
    FOV: 28,              // Soft 3D baseline field of view (deg)
    FIT_MARGIN: 1.14,     // extra framing room so the board never clips
    RENDER_OVERSCAN_PX: 48, // render-only canvas extension above and below the board
    HEIGHT_SQUASH: 0.62,  // footprint squash -> vertical squash-&-stretch amount
    BOB: 0.55,            // vertical bob from wobble (fraction of BLOCK_H)
    WOBBLE_ROT: 0.13,     // slab tilt (radians) from the jiggle springs
    ACTIVE_LIFT: 0.16,    // extra height for the actively dragged block
    TILE_COLOR: 0xe6c79d, // warm inset playable-cell tile colour
    TILE_DIM: 0xbf9665,   // out-of-lane tile colour for the arrow-block guide
    TILE_PAD: 0.06,       // gap around each play-surface tile so tiles don't touch
                          // (blocks keep their own CELL_PAD, unaffected)
    TILE_Y: 0.04,         // tiles rest just above the platform top
    BLOCK_BASE_Y: 0.08,   // keeps every block base clear of the tiles
    PLATFORM_PAD: 0.1,   // extra platform border around the playable grid
    PLATFORM_H: 0.375,    // platform height, in cells (half-thickness board)
    PLATFORM_R: 0.24,     // rounded platform corner radius, in cells
    PLATFORM_COLOR: "#c7a170",
    BG_COLOR: "#faf4eb",
    KEY_X: 0.64, KEY_Y: 2.64, KEY_Z: 0.68,
    FILL_X: -1.11, FILL_Y: 0.05, FILL_Z: -0.5,
    ORTHO_ZOOM: 1.0,      // orthographic zoom multiplier (higher = closer)
    // ---- Material / softness tinkering (Soft 3D look) ----
    BLOCK_ROUGHNESS: 0.16, // block surface roughness (higher = softer/matte)
    BLOCK_METALNESS: 0.0, // block metalness
    BLOCK_EMISSIVE: 0.13, // block self-glow amount (tint = block colour)
    TILE_ROUGHNESS: 0.74, // play-tile surface roughness
    PLATFORM_ROUGHNESS: 0.76, // platform surface roughness
    SHADOW_MAP_SIZE: 1024, // shadow-map resolution (square). Lower = large GPU/
    // fill-rate saving; SHADOW_RADIUS auto-scales with it
    // (see cs3dShadowRadius) so the penumbra stays constant.
    SHADOW_MAP_REF: 2048, // resolution SHADOW_RADIUS was authored against.
    SHADOW_RADIUS: 8.7,   // soft-shadow blur radius (higher = softer shadows)
    ENV_INTENSITY: 1.0,   // scene environment/IBL strength on materials
    DECAL_UNIT: 256,      // decal canvas resolution per grid cell (keeps arrows/
                          // and borders a fixed size while shafts/edges expand)
    ARROW_SPRITE: "Assets/Block-Arrow.png", // soft candy arrow for axis-constrained blocks
    ARROW_SIZE: 0.42,     // drawn arrow size, in cells (square)
    ARROW_INSET: 0.11,    // tip clearance from the permitted-move edge, in cells
    ARROW_TINT_LIGHTEN: 0.58, // mix block colour toward white so arrows stay readable
    ARROW_CHAR_CLEARANCE: 0.05, // lift above character head/ear planes so arrows sit on top
    ARROW_RENDER_ORDER: 40, // above character ears (earRenderOrder ~28)
    ARROW_WIN_FADE_MS: 180, // quick opacity fade when the level completes
    // ---- Snap-target highlight under a held piece ----
    SNAP_OPACITY: 0.5,    // opacity of the socket that shows where a drag will land
    SNAP_MARGIN: 0.08,    // how far the socket extends past the block, in cells
    // ---- Hint overlay (stronger than the transient drag socket) ----
    HINT_OPACITY: 0.82,   // persistent hint coverage over the solved footprint
    HINT_COLOR_LERP: 0.08,// restrained lift toward white; keep block colour vivid
    HINT_MARGIN: 0.08,    // exposed hint edges match the drag socket's soft border
    // ---- Between-block glow burst (sheet that blooms from the seam then collapses) ----
    SEAM_GLOW: 0.7,       // peak brightness of the glow burst
    SEAM_WIDTH: 0.28,     // starting halo width across the seam, in cells
    SEAM_CORE: 0.08,      // starting bright-core width across the seam, in cells
    SEAM_RISE: 0.0,       // kept at 0 so the sheet stays seated in the gap
    SEAM_GROW: 1.5,       // how much the halo blooms outward over its life
    SEAM_LIFE_MS: 440,    // lifetime of one glow burst
    SEAM_LIFT: 0.01,      // height above the block tops (stays flush with the gap)
    SEAM_COLOR: "#fff2cf",// tint of the glow burst (blended with the block colours)
};

const CS_INTRO = {
    BOARD_START_SCALE: 0.8,    // starting board zoom
    BOARD_END_SCALE: 1.0,       // final board zoom
    BOARD_BOUNCE_SCALE: 1.045,  // board zoom peak before settling
    BLOCK_START_SCALE: 0.0,     // starting block pop scale
    BLOCK_END_SCALE: 1.0,       // final block pop scale
    BLOCK_CASCADE_MS: 55,       // per-diagonal-step delay so blocks spawn in a
                                // top-left → bottom-right cascade
    BOUNCE_AT: 0.72,            // point in board zoom where it peaks
    DUR_MS: 650,             // board zoom spans the early intro
    BLOCK_START_MS: 500,      // blocks begin spawning in
    BLOCK_DUR_MS: 980,        // per-block spawn → hover → drop → land
    // Block spawn staging (fractions of BLOCK_DUR_MS):
    SPAWN_SCALE_END: 0.24,    // scale-up finishes
    SPAWN_HOLD_END: 0.58,     // hover so lean can drift, then slam
    SPAWN_DROP_END: 0.74,     // sharp slam finishes; bounce begins
    SPAWN_LIFT: 0.72,         // how high above rest the piece appears, in cells
    SPAWN_PITCH_DEG: 3.8,     // tiny sideways lean (ambient inertia)
    SPAWN_TILT_DEG: 2.4,      // even tinier random forward/back companion lean
    SPAWN_BOUNCE: 0.1,        // post-impact lift bounce, in cells
    UI_SLIDE_MS: 680,         // header/HUD slide duration
    UI_SLIDE_EASE: "cubic-bezier(.18,1.2,.28,1)", // snappy overshoot into place
    MOVE_START_MS: 1000,       // move-limit pill sequence begins (earlier)
    // Approach + hold still sum into MOVE_HOLD_MS so total intro length is unchanged.
    MOVE_APPROACH_MS: 340,    // scale-in toward camera (within the hold window)
    MOVE_APPROACH_EASE: "cubic-bezier(.33,0,.2,1)", // soft ease-out into peak (no overshoot)
    MOVE_APPROACH_SCALE: 0.28,// far / small start (reads as depth toward camera)
    MOVE_HOLD_MS: 440,        // approach + readable beat before flying home
    MOVE_PEAK_SCALE: 1.38,    // hero scale at centre hold
    // Flight: smooth rise → brief stop → satisfying pop into the HUD slot.
    MOVE_RISE_MS: 380,        // one smooth motion up to the park pose
    MOVE_RISE_EASE: "cubic-bezier(.22,.8,.28,1)", // ease-out into the stop
    MOVE_PAUSE_MS: 90,        // hold at the top before plugging in
    MOVE_POP_MS: 180,         // snap/pop into the final HUD slot
    MOVE_POP_EASE: "cubic-bezier(.2,.9,.3,1)", // snappy ease-out; no overshoot past end
    MOVE_PARK_Y: -14,         // park slightly above the slot (px)
    MOVE_PARK_SCALE: 1.38,    // still large at the stop, ready to plug in
};
const CS_OUTRO = {
    UI_MOVE_MS: 700,           // UI slide-up duration
    UI_FADE_MS: 700,           // UI fade-out duration
    UI_OFFSET_Y_PX: -70,       // vertical travel distance (subtle)
    COMPLETE_DELAY_MS: 50,     // wait after the transition before result flow
};
// Win celebration (kicks in the instant the final piece is tapped).
const CS_WIN = {
    BOARD_SCALE: 1,          // keep fill; yaw framing handles orbit without a pan shrink
    PAN_K: 2.6,               // easing rate of the pan-out
    YAW_DEG: 16,              // soft orbit angle around the board on win
    YAW_K: 1.7,               // easing rate of the win orbit
    // CSS fit of the live canvas into the current win band (1 = fill).
    OVERLAY_BOARD_INSET: 1.0,
    // Extra gap between the board and title / bottom chrome (board shrinks to fit).
    OVERLAY_BOARD_GAP_PX: 10,
    // Staged win-card intro: hero title → dock top + board shrink → bottom chrome.
    WIN_TITLE_TOP_OFFSET_PX: 14, // title inset from safe-top after docking
    WIN_BOTTOM_OFFSET_PX: 16,    // bottom chrome inset from safe-bottom
    WIN_HERO_HOLD_MS: 900,       // hold centered title over the large board
    WIN_DOCK_MS: 460,            // title-up + board-shrink duration
    WIN_CHROME_DELAY_MS: 40,     // beat after dock before bottom chrome enters
    // Fallbacks only — live layout measures title/chrome and overrides these.
    WIN_TOP_RESERVE_PX: 64,
    WIN_BOTTOM_RESERVE_PX: 168,
    SHEEN_DELAY_MS: 500,       // wait after the win before the light line starts
    SHEEN_MS: 1100,            // duration of the sheen sweep across all blocks
    SHEEN_BAND: 0.075,         // half-width of the light line (0..1 of board diagonal)
    SHEEN_STRENGTH: 1.1,       // peak brightness of the traveling surface line

    // ---- Well Done wide-expand (tap-to-expand vibe) ----
    WELL_DONE_SEED_MS: 160,      // seed cube pop-in
    WELL_DONE_GROW_MS: 260,      // horizontal footprint expand
    WELL_DONE_SETTLE_MS: 180,    // jelly settle after fill
    WELL_DONE_HOLD_MS: 1420,     // readable beat before shrink-out
    WELL_DONE_SHRINK_MS: 180,    // reverse-expand dismiss
    WELL_DONE_SEED_PX: 40,       // starting cube size
    WELL_DONE_BANNER_H_PX: 68,   // expanded banner height
    WELL_DONE_BANNER_W_FRAC: 0.84, // banner width as a fraction of the game screen
    WELL_DONE_LABEL_AT: 0.38,    // grow progress when the label starts appearing

    // ---- Cascading happy-face pop wave (loops until the next level) ----
    WAVE_ENABLED: true,          // master toggle for the block pop wave
    WAVE_START_DELAY_MS: 280,    // wait after win before the first block pops
    WAVE_STAGGER_MS: 90,         // delay per diagonal step (cascade: top-left → bottom-right)
    WAVE_POP_MS: 1040,           // duration of one block's bounce pop
    WAVE_LOOP_GAP_MS: 1000,       // pause after the last block settles before the wave restarts
    WAVE_ORDER: "cascade",       // "cascade" (TL→BR diagonal), "reverse", "centerOut", "centerIn"
    WAVE_INCLUDE_LOCKED: false,  // whether stone/locked blocks join the pop wave

    // Bounce / pop shape (scale + lift applied on top of settled intro pose)
    WAVE_SCALE_START: 1.0,      // scale at pop kick-off (slight squash)
    WAVE_SCALE_PEAK: 1.1,       // peak scale at the top of the bounce
    WAVE_LIFT: 0.52,             // peak upward lift in world units (cells-ish)
    WAVE_OVERSHOOT: 1.06,        // unused by rise (kept for tweaks / older builds)
    WAVE_PEAK_AT: 0.46,          // 0..1 progress where scale/lift hit their peak
    WAVE_LAND_AT: 0.74,          // 0..1 progress when they first touch the board
    WAVE_LAND_BOUNCE: 0.09,      // subtle secondary hop height after landing
    WAVE_LAND_BOUNCE_SCALE: 0.03,// tiny scale bump during the land hop
    WAVE_LAND_SQUASH: 0.035,     // brief footprint squash on impact (0 = none)

    // Happy face swap (Spine IntroHappy → IdleHappy at bounce peak).
    // Turn WAVE_SWAP_TO_HAPPY off to keep each block's dealt expression on the
    // finished board (useful for checking Chad / duplicates).
    WAVE_SWAP_TO_HAPPY: true,
    WAVE_HAPPY_FACE_MATCH: "Happy", // matches expression id / IntroHappy / IdleHappy
    WAVE_HAPPY_FACE_INDEX: -1,      // >=0 forces this expression index; -1 = use MATCH
    WAVE_FACE_EACH_LOOP: false,     // re-play happy intro on every wave loop
};


window.CSApp.feel = {
    juice: CS_JUICE,
    PALETTE,
    CS3D_CFG,
    INTRO: CS_INTRO,
    OUTRO: CS_OUTRO,
    WIN: CS_WIN,
};
