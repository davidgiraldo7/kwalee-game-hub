// OWNER: mechanics — grid truth, input, expand/win/lose, hints/tutorial logic
"use strict";

// ════════════════════════════════════════════════════════════════
// COLOR STRETCH — gameplay engine
// Integer grid is the source of truth; render* floats are cosmetic and
// never feed back into logic. One isSpaceValid() gate for every move and
// expansion. Win = every block at its full shape; out of moves = fail.
// Level flow is routed through the KPF lifecycle (startGame / levelComplete
// / levelFailed) — this engine only decides WHEN to call them.
// ════════════════════════════════════════════════════════════════


const CS = Object.assign({
    CELL_CAP: 196,         // max cell size in CSS px (grid fills the play-area more)
    VIEW_PAD: 12,          // padding around the grid inside the play-area
    TIMER_WARNING_SECONDS: 30,
    TIMER_PULSE_SECONDS: 10,
    FAIL_TUTORIAL_DURATION_MS: 10000, // how long the failed-expansion reminder stays visible
    FAIL_TUTORIAL_REMINDER_STREAK: 5, // consecutive failed expansions before repeating the reminder
    // Ignore "Tap to continue" dismissals until the mechanic FTUE has been
    // visible briefly — prevents an early tap from completing it instantly (SP-1051).
    MECHANIC_TUTORIAL_GRACE_MS: 500,
    DOUBLE_TAP_MS: 300,
    AXIS_GUIDE_DELAY_S: 0.125,
    AXIS_GUIDE_FADE_S: 0.25,
}, CS_JUICE);

// Level definitions. grid[row][col]: 1 = playable, 0 = wall/hole.
// Block: id, color (PALETTE name), x, y, size (target cell count N),
//        [locked] immovable, [moveAxis] horizontal/vertical. Normal blocks
//        start 1×1 and expand to fill N cells as the widest rectangle
//        that fits (horizontal space first, then wrap). Pre-expanded blocks additionally
//        store a fixed w,h shape (with size = w*h) and are rigid.
// Every level is solvable by a backtracking packer (any factor rectangle of N).
//
// LEVELS.json (served alongside index.html) is the authoritative level list
// and is fetched on boot; the inline array below is a fallback default used
// when the fetch fails (e.g. opened via file://). Keep them in sync.
// 1-based level to restart from after the final level. Set to 1 to repeat
// the complete level list, or skip onboarding/custom levels on later loops.
const LEVEL_LOOP_START_LEVEL = 20;
// 1-based levels to omit after the first complete pass. These levels still
// play normally before the first loop.
const LEVEL_LOOP_EXCLUDED_LEVELS = [21];

let LEVELS = [
    {
        title: "Tutorial 1",
        timeLimit: 180,
        grid: [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
        blocks: [
            { id:"1", color:"red", x:1, y:2, size:8 },
            { id:"2", color:"blue", x:2, y:2, size:8 },
        ],
    },
    {
        title: "Level: Custom",
        timeLimit: 60,
        grid: [[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1]],
        blocks: [
            { id:"1", color:"blue", x:0, y:0, size:5, moveAxis:"vertical" },
            { id:"2", color:"purple", x:2, y:1, size:5, moveAxis:"horizontal" },
            { id:"3", color:"cyan", x:3, y:2, size:5, moveAxis:"horizontal" },
            { id:"4", color:"red", x:1, y:3, size:5, moveAxis:"horizontal" },
            { id:"5", color:"yellow", x:3, y:4, size:5, moveAxis:"horizontal" },
        ],
    },
    {
        title: "Level: Custom",
        timeLimit: 60,
        grid: [[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1]],
        blocks: [
            { id:"1", color:"blue", x:0, y:0, size:5, locked:true },
            { id:"2", color:"red", x:1, y:1, w:3, h:3, size:9, preExpanded:true },
            { id:"3", color:"orange", x:0, y:2, size:4 },
            { id:"4", color:"purple", x:4, y:3, size:4 },
            { id:"5", color:"yellow", x:2, y:4, size:3 },
        ],
    },
    {
        title: "First Stretch",
        timeLimit: 30,
        grid: [[1,1,1,1],[1,1,1,1]],
        blocks: [{ id:"1", color:"red", x:1, y:0, size:8 }],
    },
    {
        title: "Make Room",
        timeLimit: 40,
        grid: [[1,1,1,1],[1,1,1,1]],
        blocks: [
            { id:"1", color:"red", x:1, y:0, size:4 },
            { id:"2", color:"blue", x:2, y:0, size:4 },
        ],
    },
    {
        title: "Snug Fit",
        timeLimit: 45,
        grid: [[1,1,1],[1,1,1],[1,1,1]],
        blocks: [
            { id:"1", color:"red", x:0, y:0, size:4 },
            { id:"2", color:"blue", x:2, y:1, size:2 },
            { id:"3", color:"green", x:1, y:2, size:3 },
        ],
    },
    {
        title: "Around the Hole",
        timeLimit: 50,
        grid: [[1,1,1,1],[1,0,0,1],[1,1,1,1]],
        blocks: [
            { id:"1", color:"red", x:0, y:0, size:3 },
            { id:"2", color:"blue", x:3, y:0, size:3 },
            { id:"3", color:"green", x:1, y:0, size:2 },
            { id:"4", color:"orange", x:1, y:2, size:2 },
        ],
    },
    {
        title: "Locked Anchor",
        timeLimit: 50,
        grid: [[1,1,1,1],[1,1,1,1],[1,1,1,1]],
        blocks: [
            { id:"1", color:"purple", x:0, y:0, size:4, locked:true },
            { id:"2", color:"red", x:2, y:0, size:2 },
            { id:"3", color:"blue", x:2, y:1, size:2 },
            { id:"4", color:"orange", x:0, y:2, size:4 },
        ],
    },
    {
        title: "Full Nest",
        timeLimit: 60,
        grid: [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]],
        blocks: [
            { id:"1", color:"red", x:1, y:1, size:4 },
            { id:"2", color:"blue", x:2, y:1, size:4 },
            { id:"3", color:"green", x:1, y:2, size:4 },
            { id:"4", color:"orange", x:2, y:2, size:4 },
        ],
    },
];

// ---- runtime state ----
let csCanvas = null;
let csCssW = 0, csCssH = 0;
const CS_VIEWPORT_WIDTH_CHANGE = 0.15;
let grid = [], gridRows = 0, gridCols = 0;
let blocks = [];
let timeLimit = Infinity, timeRemaining = 0, timerRunning = false;
let timerLastTickMs = null;
let csLevelDone = false, csGameOver = false;
let csWinTimer = null, csFailTimer = null;

// ---- Hint system state ----
// hintSolution: ordered [{ id, x, y, w, h }] solved footprints from level data.
// Press budget comes from Inventory (persisted hints). activeHints: revealed
// solution indices whose block isn't yet in its solved footprint.
let hintSolution = null;
let activeHints = [];
let hintButtonReady = false; // only true once the level intro has settled
let hintTutorialFrame = null;
let hintFeatureIntroOpen = false;

// Level-intro animation state.
let csIntro = null;           // active intro controller ({tMs}) or null
let csInputLocked = false;    // blocks pointer input during the intro
let csBoardScale = 1;         // whole-board zoom used by the intro (0.8 -> 1.0)
let csIntroTimers = [];       // pending DOM-phase setTimeouts (cleared on reset)
let csMovesPillAnim = null;   // WAAPI flight home (cancelled on clearIntro)
let csSkipNextIntro = false;  // set by the debug skip-level jump to bypass the intro
let csTutorial = null;        // Current onboarding state.
let mechanicTutorialReadyAt = 0; // performance.now() when mechanic FTUE can be dismissed
let failedExpansionStreak = 0;
let failedExpansionTutorialTimer = null;
let csTutorialPoint = null;
let csTutorialGridPoint = null;
let csTutorialHandPoint = null;
let csTutorialBounds = null;
let csTutorialBoundsPoint = null;
let csTutorialCopyNeedsFit = true;
let csCachedCanvasRect = null; // cached DOMRects for the tutorial overlay so it
let csCachedScreenRect = null; // doesn't force a layout every frame (see csResize)
const TUTORIAL_RED_TARGET = { x: 1, y: 0 };

// input
let activeBlock = null, isDragging = false, dragMoved = false;
// Lock gameplay to one pointer — ignore extra touches while a drag is active (SP-973).
let activePointerId = null;
let dragStartX = 0, dragStartY = 0;
// Free-flow drag (City Escape–style clamp). Finger sets a desired top-left
// (dragTargetX/Y = finger − grab offset). Each frame we clamp that desire to the
// slide range available from the mid-drag snapped cell (dragSnappedX/Y) via
// isSpaceValid bounds, resolving dominant axis → orthogonal → dominant again so
// L-corridors and corners open naturally without axis-lock snap-back. The
// cosmetic float (dragFloatX/Y) eases toward the clamped point; logical x/y
// tracks the snapped cell. Finger overshoot past the clamp becomes slime squish.
let dragFloatX = 0, dragFloatY = 0, grabOffsetX = 0, grabOffsetY = 0;
let dragTargetX = 0, dragTargetY = 0;
let dragSnappedX = 0, dragSnappedY = 0;
let dragPressX = 0, dragPressY = 0;
let dragPrevDX = 0, dragPrevDY = 0; // previous-frame drag displacement (for wobble)
let lastTapBlock = null, lastTapTime = 0;
// Tap-vs-drag discrimination: a press that never travels more than
// TAP_MOVE_PX (canvas pixels) and doesn't move the block counts as a tap.
const TAP_MOVE_PX = 10;
let pointerDownPx = 0, pointerDownPy = 0, pointerTravelled = false;
let staticHoldCancelled = false;
let axisGuideBlock = null, axisGuideAlpha = 0, axisGuideHoldS = 0;

// ---- 3D renderer (Three.js) ----
// The integer grid stays the source of truth and the whole simulation
// (csUpdate: drag follow, wobble/squish springs, elastic fail-return) is
// unchanged. This module only maps the cosmetic render floats to a WebGL scene
// and converts screen<->grid coordinates via raycasting. 1 grid cell = 1 world
// unit; the board lies on the X/Z plane (X=cols, Z=rows) with Y up, viewed
// through a camera with a slight downward tilt.

// HUD refs (resolved once)
const csMovesValue = document.getElementById("csMovesValue");
const csMovesPill  = document.getElementById("csMovesPill");
const csTutorialEl = document.getElementById("csTutorial");
const csHintBtn    = document.getElementById("csHintBtn");
const csHintCount  = document.getElementById("csHintCount");
const csTutorialDimmer = document.getElementById("csTutorialDimmer");
const csTutorialMask = document.getElementById("csTutorialMask");
const csTutorialMaskBase = document.getElementById("csTutorialMaskBase");
const csTutorialMaskHoles = document.getElementById("csTutorialMaskHoles");
const csTutorialTitle = document.getElementById("csTutorialTitle");
const csTutorialCopy = document.getElementById("csTutorialCopy");
const csTutorialTargets = document.getElementById("csTutorialTargets");
const csTutorialTarget = document.getElementById("csTutorialTarget");
const csTutorialDestination = document.getElementById("csTutorialDestination");
const csTutorialHand = document.getElementById("csTutorialHand");
const csHintTutorialHand = document.getElementById("csHintTutorialHand");
const hintFeatureIntro = document.getElementById("hintFeatureIntro");
const hintFeatureTitle = document.getElementById("hintFeatureTitle");
const hintFeatureLabel = document.getElementById("hintFeatureLabel");
const hintFeatureDesc = document.getElementById("hintFeatureDesc");
const hintFeatureClaim = document.getElementById("hintFeatureClaim");

function csInit() {
    const playArea = document.querySelector("#gameScreen .play-area");
    csCanvas = document.createElement("canvas");
    csCanvas.className = "cs-canvas";
    playArea.textContent = "";
    playArea.appendChild(csCanvas);
    cs3dInit();
    if (CS3D.ok) cs3dCreateDebugPanel();

    csBindCanvasEvents(csCanvas);
    gameScreen.addEventListener("pointerdown", onScreenPointerDown);
    window.addEventListener("resize", csHandleViewportResize);
}

function csBindCanvasEvents(canvas) {
    if (!canvas || canvas._csPointerBound) return;
    canvas._csPointerBound = true;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
}

/** Swap the game canvas after forceContextLoss so a fresh WebGL context can be created. */
function csReplaceGameCanvas() {
    if (!csCanvas || !csCanvas.parentNode) return csCanvas;
    const next = document.createElement("canvas");
    next.className = csCanvas.className || "cs-canvas";
    csCanvas.parentNode.replaceChild(next, csCanvas);
    csCanvas = next;
    csBindCanvasEvents(csCanvas);
    csCachedCanvasRect = null;
    return csCanvas;
}

function csLoadLevel(levelNum) {
    let levelIndex = levelNum - 1;
    if (levelNum > LEVELS.length) {
        const loopStart = Math.max(1, Math.min(LEVEL_LOOP_START_LEVEL, LEVELS.length));
        const excludedLoopLevels = new Set(LEVEL_LOOP_EXCLUDED_LEVELS);
        const loopLevelIndices = [];
        for (let index = loopStart - 1; index < LEVELS.length; index++) {
            if (!excludedLoopLevels.has(index + 1)) loopLevelIndices.push(index);
        }
        if (!loopLevelIndices.length) {
            throw new Error("LEVEL_LOOP_EXCLUDED_LEVELS excludes every level in the loop.");
        }
        levelIndex = loopLevelIndices[(levelNum - LEVELS.length - 1) % loopLevelIndices.length];
    }
    const data = LEVELS[levelIndex];
    grid = data.grid;
    gridRows = grid.length;
    gridCols = grid[0].length;
    timeLimit = (typeof data.timeLimit === "number") ? data.timeLimit : Infinity;
    timeRemaining = timeLimit;
    timerRunning = false;
    timerLastTickMs = null;
    csLevelDone = false;
    csGameOver = false;
    csSheen = { active: false, t: 0 };
    csWinYaw = 0;
    csWinWave = { active: false, t: 0, order: [] };
    if (CS3D.boardGroup) CS3D.boardGroup.rotation.y = 0;
    clearTimeout(csWinTimer); clearTimeout(csFailTimer);
    clearTimeout(failedExpansionTutorialTimer);
    failedExpansionTutorialTimer = null;
    clearOutro();
    activeBlock = null; isDragging = false; dragMoved = false; activePointerId = null;
    lastTapBlock = null; lastTapTime = 0;
    axisGuideBlock = null; axisGuideAlpha = 0; axisGuideHoldS = 0;
    csTutorial = null;
    hintButtonReady = false;
    hideHintFeatureIntro();
    if (hintTutorialFrame !== null) {
        cancelAnimationFrame(hintTutorialFrame);
        hintTutorialFrame = null;
    }
    blocks.forEach(cancelExpandSequence);
    gameScreen.classList.toggle("tutorial-level", levelNum === 1);
    clearMechanicTutorialTargets();
    csTutorialEl.classList.remove("show", "drag", "tap", "reminder", "mechanic", "hint");
    hintLoadLevel(levelNum, data);
    if (levelNum === 1) cs3dCreateTutorialDestinationMeshes();

    blocks = data.blocks.map((b) => {
        const preExpanded = !!b.preExpanded;
        // Pre-expanded blocks carry a fixed w×h shape and start at it; normal
        // blocks start 1×1 and grow to fill `size` cells on demand.
        let iw, ih;
        if (preExpanded) { iw = b.w || 1; ih = b.h || 1; }
        else { iw = 1; ih = 1; }
        const targetSize = b.size != null ? b.size : iw * ih;
        return {
            id: b.id, color: PALETTE[b.color] || b.color,
            x: b.x, y: b.y, w: iw, h: ih,
            initW: iw, initH: ih,
            targetSize,
            locked: !!b.locked,
            preExpanded,
            moveAxis: b.moveAxis === "horizontal" || b.moveAxis === "vertical" ? b.moveAxis : null,
            initialOffsetX: 0, initialOffsetY: 0,
            renderX: b.x, renderY: b.y, renderW: iw, renderH: ih,
            renderScale: 1,
            introScale: 1,
            introLift: 0,
            introPitch: 0,
            introTilt: 0,
            winPopScale: 1,
            winPopLift: 0,
            winPopSquash: 0,
            _winPopFaceApplied: false,
            _winPopCycle: -1,
            _introKicked: true,
            _introLanded: true,
            prevX: b.x, prevY: b.y, prevW: iw, prevH: ih,
            jiggleX: 0, jiggleVX: 0, jiggleY: 0, jiggleVY: 0,
            pressX: 0, pressY: 0,
            wiggle: 0, wigglePhase: 0, wiggleDecay: 0,
            expandGlow: 0,
            moveWobble: 0, moveWobblePhase: 0,
            failReturnWobble: 0, failReturnWobblePhase: 0, failReturnWobbleMs: 0,
            failReturnSquash: 0, failReturnSquashX: 0, failReturnSquashY: 0,
            failReturnSquashMs: 0, failReturnJiggleVX: 0, failReturnJiggleVY: 0,
            failReturnWobblePending: false,
            failAnim: null, shakeDX: 0, failFlash: 0, failConfine: 0,
            _expandSequenceTimeouts: [],
        };
    });

    csResize(true);
    cs3dBuildLevel();
    updateHUD();
}

// ---- level intro animation ----
// A short cinematic that plays each time a level starts for play: the board
// zooms in from 0.8x, the header/HUD slide down from the top, the blocks
// spawn above the board (scale + pitch), hover briefly, then drop and land
// with a tiny bounce, and finally the move-limit pill fades in large and
// centre-screen before lerping to its HUD slot — at which point input unlocks.
// The debug skip-level jump bypasses it (see startIntro(true)).

let csSheen = { active: false, t: 0 };
let csWinYaw = 0;            // current board yaw (radians) during win pan-out
// Cascading happy-face pop wave that loops after a win.
let csWinWave = { active: false, t: 0, order: [] };
const csHudSlideEls = () => [gameHeader, settingsBtnGame, backBtnGame];
let csOutroTimer = null;

function clearOutro() {
    clearTimeout(csOutroTimer);
    csOutroTimer = null;
    gameScreen.classList.remove("ui-exit-up");
    gameScreen.style.removeProperty("--cs-outro-move-ms");
    gameScreen.style.removeProperty("--cs-outro-fade-ms");
    gameScreen.style.removeProperty("--cs-outro-offset-y");
}

function lockInGameSettings() {
    if (!gameScreen.classList.contains("active")) return;
    settingsBtnGame.disabled = true;
    if (backBtnGame) backBtnGame.disabled = true;
    closeSettings();
}

function syncInGameSettingsAvailability() {
    if (!gameScreen.classList.contains("active")) return;
    const tutorialBlocksSettings = (csTutorial && csTutorial.phase !== "level-reminder") ||
        hintFeatureIntroOpen;
    const chromeLocked = !!(csIntro || csLevelDone || csGameOver);
    settingsBtnGame.disabled = !!(chromeLocked || tutorialBlocksSettings);
    if (backBtnGame) backBtnGame.disabled = chromeLocked;
    if (settingsBtnGame.disabled) closeSettings();
}

function startOutro(onComplete) {
    lockInGameSettings();
    clearOutro();
    gameScreen.style.setProperty("--cs-outro-move-ms", `${CS_OUTRO.UI_MOVE_MS}ms`);
    gameScreen.style.setProperty("--cs-outro-fade-ms", `${CS_OUTRO.UI_FADE_MS}ms`);
    gameScreen.style.setProperty("--cs-outro-offset-y", `${CS_OUTRO.UI_OFFSET_Y_PX}px`);
    gameScreen.classList.add("ui-exit-up");
    const duration = Math.max(CS_OUTRO.UI_MOVE_MS, CS_OUTRO.UI_FADE_MS);
    csOutroTimer = setTimeout(onComplete, duration + CS_OUTRO.COMPLETE_DELAY_MS);
}

function clearIntro() {
    csIntroTimers.forEach(clearTimeout);
    csIntroTimers = [];
    csIntro = null;
    csInputLocked = false;
    settingsBtnGame.disabled = false;
    if (backBtnGame) backBtnGame.disabled = false;
    csBoardScale = CS_INTRO.BOARD_END_SCALE;
    // Reset any inline styles the intro applied so normal styling resumes.
    // (Leave `animation` alone: startIntro sets it to "none" for the slide, and
    // not restoring it here prevents the header's headerIn pop from replaying
    // when the intro finishes.)
    csHudSlideEls().forEach((el) => {
        if (!el) return;
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
    });
    finishMovePillAnim(csMovesPill);
    if (csMovesPill) {
        csMovesPill.style.transition = "";
        csMovesPill.style.opacity = "";
        csMovesPill.style.willChange = "";
        csMovesPill.style.zIndex = "";
    }
    for (const b of blocks) {
        b.introScale = CS_INTRO.BLOCK_END_SCALE;
        b.introLift = 0;
        b.introPitch = 0;
        b.introTilt = 0;
        b._introKicked = true;
        b._introLanded = true;
    }
}

function startIntro(skip) {
    clearIntro();
    if (skip) {
        startLevelTutorial();
        return; // debug path: everything already reset to normal.
    }

    csInputLocked = true;
    settingsBtnGame.disabled = true;
    if (backBtnGame) backBtnGame.disabled = true;
    csBoardScale = CS_INTRO.BOARD_START_SCALE;
    for (const b of blocks) {
        b.introScale = CS_INTRO.BLOCK_START_SCALE;
        b.introLift = CS_INTRO.SPAWN_LIFT;
        b.introPitch = 0;
        b.introTilt = 0;
        // Per-piece lean directions (side + a slight random forward/back).
        b._introPitchSign = ((b.x + b.y) & 1) ? 1 : -1;
        b._introTiltSign = Math.random() < 0.5 ? 1 : -1;
        b._introTiltMul = 0.35 + Math.random() * 0.65;
        b._introKicked = false;
        b._introLanded = false;
    }
    csIntro = { tMs: 0 };

    // Phase B — header / settings slide down from the top.
    const slideEls = csHudSlideEls();
    slideEls.forEach((el) => {
        if (!el) return;
        el.style.animation = "none";
        el.style.transition = "none";
        el.style.transform = "translateY(-140px)";
        el.style.opacity = "0";
    });
    // The move-limit pill is exempt from the slide: keep it hidden until phase D.
    csMovesPill.style.transition = "none";
    csMovesPill.style.opacity = "0";
    // eslint-disable-next-line no-unused-expressions
    gameScreen.offsetHeight; // force reflow so the initial state applies
    requestAnimationFrame(() => {
        slideEls.forEach((el) => {
            if (!el) return;
            el.style.transition =
                `transform ${CS_INTRO.UI_SLIDE_MS}ms ${CS_INTRO.UI_SLIDE_EASE}, opacity ${CS_INTRO.UI_SLIDE_MS}ms ease`;
            el.style.transform = "";
            el.style.opacity = "";
        });
    });

    // Phase C — per-block pop kicks are fired from csUpdate as each block in the
    // top-left → bottom-right cascade reaches its spawn moment (see _introKicked).

    // Phase D — timer pill: scale in toward camera, hold, rise, pause, pop into HUD.
    // Level 1 introduces the controls instead, so it has no move-budget beat.
    if (gameScreen.classList.contains("tutorial-level")) {
        csIntroTimers.push(setTimeout(() => {
            csInputLocked = false;
            startLevelTutorial();
        }, CS_INTRO.MOVE_START_MS + CS_INTRO.MOVE_HOLD_MS));
        csIntroTimers.push(setTimeout(clearIntro,
            CS_INTRO.MOVE_START_MS + CS_INTRO.MOVE_HOLD_MS + movePillFlightMs()));
    } else {
        csIntroTimers.push(setTimeout(runMovePillIntro, CS_INTRO.MOVE_START_MS));
    }
}

function startTutorial() {
    const red = blocks.find((b) => b.color === PALETTE.red);
    if (!red) return;
    csTutorial = {
        phase: "move-red",
        target: red,
        origin: { x: red.x, y: red.y },
    };
    syncInGameSettingsAvailability();
    updateTutorialOverlay();
}

const MECHANIC_TUTORIALS = {
    arrow: {
        title: "tutorialArrowTitle",
        description: "tutorialArrowDescription",
        matches: (b) => !!b.moveAxis,
    },
    locked: {
        title: "tutorialLockedTitle",
        description: "tutorialLockedDescription",
        matches: (b) => !!b.locked,
    },
    fixed: {
        title: "tutorialFixedTitle",
        description: "tutorialFixedDescription",
        matches: (b) => !!b.preExpanded,
    },
};
const MECHANIC_TUTORIAL_ORDER = ["arrow", "locked", "fixed"];
// `levelIndex` is the game's 1-based level number.
const LEVEL_TUTORIALS = [
    { levelIndex: 2, localizationKey: "tutorialMoves" },
    { levelIndex: 3, localizationKey: "tutorialExpandHorizontal" }
];

function startLevelTutorial() {
    // The hint tutorial must run first on the retry that unlocks it. It is
    // queued for the next paint so its bulb is visibly settled before the
    // dimmer fades in; no level/mechanic tutorial may replace it meanwhile.
    hintButtonReady = true;
    if (queueHintTutorial()) {
        updateHintButton();
        return;
    }
    if (level === 1) {
        startTutorial();
        return;
    }
    const levelTutorial = LEVEL_TUTORIALS.find(
        (tutorial) => tutorial.levelIndex === level
    );
    if (levelTutorial) {
        startLevelReminder(levelTutorial);
        return;
    }
    startNextMechanicTutorial();
}

function startNextMechanicTutorial() {
    if (csLevelDone || csGameOver) return;
    const kind = MECHANIC_TUTORIAL_ORDER.find((candidate) => {
        const tutorial = MECHANIC_TUTORIALS[candidate];
        return !completedMechanicTutorials.has(candidate) && blocks.some(tutorial.matches);
    });
    startMechanicTutorial(kind);
}

function startMechanicTutorial(kind) {
    const tutorial = MECHANIC_TUTORIALS[kind];
    if (!tutorial) return;
    const targets = blocks.filter(tutorial.matches);
    if (!targets.length) return;
    clearMechanicTutorialTargets();
    csTutorial = {
        phase: "mechanic",
        mechanic: kind,
        targets,
        targetEls: targets.map((block) => {
            const el = document.createElement("div");
            el.className = "cs-tutorial-target mechanic-target";
            csTutorialTargets.appendChild(el);
            return { block, el };
        }),
    };
    syncInGameSettingsAvailability();
    updateTutorialOverlay();
    mechanicTutorialReadyAt = performance.now() + (CS.MECHANIC_TUTORIAL_GRACE_MS || 500);
}

function startLevelReminder({ localizationKey }) {
    csTutorial = { phase: "level-reminder", target: null, localizationKey };
    syncInGameSettingsAvailability();
    updateTutorialOverlay();
}

function startFailedExpansionTutorial() {
    failedExpansionStreak++;
    const isFirstFailure = !completedFailedExpansionTutorial;
    const isReminderDue = completedFailedExpansionTutorial &&
        failedExpansionStreak % CS.FAIL_TUTORIAL_REMINDER_STREAK === 0;
    if (!isFirstFailure && !isReminderDue) return;
    if (isFirstFailure) completeFailedExpansionTutorial();
    clearTimeout(failedExpansionTutorialTimer);
    startLevelReminder({ localizationKey: "tutorialFailedExpansion" });
    failedExpansionTutorialTimer = setTimeout(() => {
        failedExpansionTutorialTimer = null;
        if (csTutorial?.localizationKey === "tutorialFailedExpansion") hideTutorial();
    }, CS.FAIL_TUTORIAL_DURATION_MS);
}

function hideHintFeatureIntro() {
    hintFeatureIntroOpen = false;
    if (!hintFeatureIntro) return;
    hintFeatureIntro.classList.remove("show");
    hintFeatureIntro.hidden = true;
    hintFeatureIntro.setAttribute("aria-hidden", "true");
    syncInGameSettingsAvailability();
}

function showHintFeatureIntro() {
    if (!hintFeatureIntro || !hintFeatureClaim) return;
    hintFeatureIntroOpen = true;
    if (hintFeatureTitle) hintFeatureTitle.textContent = t("prNewFeature");
    if (hintFeatureLabel) hintFeatureLabel.textContent = t("hintButton");
    if (hintFeatureDesc) hintFeatureDesc.textContent = t("hintFeatureDesc");
    hintFeatureClaim.textContent = t("prClaim");
    hintFeatureIntro.hidden = false;
    hintFeatureIntro.setAttribute("aria-hidden", "false");
    // Retrigger entrance if shown again in the same session.
    hintFeatureIntro.classList.remove("show");
    void hintFeatureIntro.offsetWidth;
    hintFeatureIntro.classList.add("show");
    syncInGameSettingsAvailability();
    if (typeof playSound === "function") {
        try { playSound("sfx_newfeaturepopup"); } catch (_) { /* ignore */ }
    }
}

function beginHintFingerTutorial() {
    if (csTutorial || csHintBtn.hidden || csHintBtn.disabled) return;
    clearMechanicTutorialTargets();
    csTutorial = { phase: "hint", target: null };
    syncInGameSettingsAvailability();
    updateTutorialOverlay();
    updateHintButton();
}

function startHintTutorial() {
    if (!hintTutorialCanStart() || csTutorial || hintFeatureIntroOpen) return;
    if (csHintBtn.hidden || csHintBtn.disabled) return;
    showHintFeatureIntro();
}

function inventoryHintCount() {
    return (window.Inventory && typeof Inventory.getHints === "function")
        ? Inventory.getHints()
        : 0;
}

function hintButtonUnlockLevel() {
    return (window.Inventory && typeof Inventory.hintButtonUnlockLevel === "function")
        ? Inventory.hintButtonUnlockLevel()
        : 5;
}

function hintButtonUnlocked() {
    return level >= hintButtonUnlockLevel();
}

/** Levels 2..(unlock-1) show the locked hint preview (SP-1045). */
function hintButtonLockedPreview() {
    return level >= 2 && level < hintButtonUnlockLevel();
}

function hintTutorialCanStart() {
    return hintButtonReady && !completedHintTutorial && hintSolution && hintButtonUnlocked() &&
        inventoryHintCount() > 0 &&
        hintRemainingRevealable() > 0 &&
        !csIntro && !csLevelDone && !csGameOver &&
        !(overlay && overlay.classList.contains("show"));
}

function queueHintTutorial() {
    if (hintFeatureIntroOpen) return true;
    if (!hintTutorialCanStart() || csTutorial) return false;
    if (hintTutorialFrame !== null) return true;
    hintTutorialFrame = requestAnimationFrame(() => {
        hintTutorialFrame = null;
        if (hintTutorialCanStart() && !csTutorial && !hintFeatureIntroOpen &&
            !csHintBtn.hidden && !csHintBtn.disabled) {
            startHintTutorial();
        }
    });
    return true;
}

function tutorialTextKey() {
    if (!csTutorial) return "";
    if (csTutorial.localizationKey) return csTutorial.localizationKey;
    if (csTutorial.phase === "move-red") return "tutorialDrag";
    if (csTutorial.phase === "expand-red") return "tutorialExpand";
    return "tutorialHorizontal";
}

function setTutorialStep(phase, target) {
    csTutorial = { phase, target };
    syncInGameSettingsAvailability();
    updateTutorialOverlay();
}

function hideTutorial() {
    csTutorial = null;
    syncInGameSettingsAvailability();
    csTutorialEl.classList.remove("show");
    csTutorialTarget.style.display = "none";
    csTutorialHand.style.display = "none";
    csHintTutorialHand.style.display = "none";
    setTimeout(() => {
        if (!csTutorial) {
            clearMechanicTutorialTargets();
            csTutorialEl.classList.remove("drag", "tap", "reminder", "mechanic", "hint");
        }
    }, 250);
}

function clearMechanicTutorialTargets() {
    csTutorialTargets.querySelectorAll(".mechanic-target").forEach((el) => el.remove());
    csTutorialMaskHoles.replaceChildren();
    csTutorialTarget.style.display = "none";
    csTutorialDestination.style.display = "none";
    csTutorialHand.style.display = "none";
    csHintTutorialHand.style.display = "none";
}

/**
 * Screen-space AABB of a block slab under Soft-3D tilt.
 * Uses the slab's 8 local corners (not just the top face) so the dimmer hole /
 * ring covers the visible 3D body instead of only the floor footprint.
 */
function projectBlockScreenBounds(block, projectPoint) {
    const mesh = block && block._mesh;
    if (!mesh || !window.THREE) return null;
    mesh.updateWorldMatrix(true, true);
    const boundsPoint = csTutorialBoundsPoint || (csTutorialBoundsPoint = new THREE.Vector3());
    const geoW = Math.max(0.04, block._geoW || block.w || 1);
    const geoH = Math.max(0.04, block._geoH || block.h || 1);
    const hy = (CS3D_CFG.BLOCK_H || 0.62) * 0.5;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const lx of [-geoW * 0.5, geoW * 0.5]) {
        for (const ly of [-hy, hy]) {
            for (const lz of [-geoH * 0.5, geoH * 0.5]) {
                boundsPoint.set(lx, ly, lz);
                mesh.localToWorld(boundsPoint);
                const projected = projectPoint(boundsPoint);
                minX = Math.min(minX, projected.x);
                minY = Math.min(minY, projected.y);
                maxX = Math.max(maxX, projected.x);
                maxY = Math.max(maxY, projected.y);
            }
        }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) ||
        !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }
    return { minX, minY, maxX, maxY };
}

function updateTutorialOverlay() {
    if (!csTutorial || !CS3D.ok) return;
    const projectPoint = (point) => {
        point.project(CS3D.camera);
        return {
            x: canvasRect.left - screenRect.left + (point.x + 1) * canvasRect.width / 2,
            y: canvasRect.top - screenRect.top + (-point.y + 1) * canvasRect.height / 2,
        };
    };
    if (CS3D._rectDirty || !csCachedCanvasRect) {
        csCachedCanvasRect = csCanvas.getBoundingClientRect();
        csCachedScreenRect = gameScreen.getBoundingClientRect();
        CS3D._rectDirty = false;
    }
    const canvasRect = csCachedCanvasRect;
    const screenRect = csCachedScreenRect;
    const topUiBottom = [gameHeader, csHud, settingsBtnGame, backBtnGame]
        .filter((el) => el && el.getClientRects().length)
        .reduce((bottom, el) => Math.max(bottom, el.getBoundingClientRect().bottom), screenRect.top);
    const tutorialCopyTop = topUiBottom - screenRect.top + CS.TUTORIAL_TOP_UI_GAP_PX;
    const tutorialCenterX = screenRect.width / 2;
    if (csTutorial.phase === "hint") {
        const hintRect = csHintBtn.getBoundingClientRect();
        const hintCenterX = hintRect.left - screenRect.left + hintRect.width / 2;
        const hintCenterY = hintRect.top - screenRect.top + hintRect.height / 2;
        csTutorialDimmer.setAttribute("viewBox", `0 0 ${screenRect.width} ${screenRect.height}`);
        csTutorialMask.setAttribute("x", "0");
        csTutorialMask.setAttribute("y", "0");
        csTutorialMask.setAttribute("width", screenRect.width);
        csTutorialMask.setAttribute("height", screenRect.height);
        csTutorialMaskBase.setAttribute("width", screenRect.width);
        csTutorialMaskBase.setAttribute("height", screenRect.height);
        setTutorialCopyText(t("tutorialHint"));
        // The bulb is screen-centred. Anchor the popup to that known centre rather
        // than a transient button rect while its visibility is settling.
        csTutorialCopy.style.left = `${hintCenterX}px`;
        csTutorialCopy.style.top = `${Math.max(118, hintRect.top - screenRect.top - 14)}px`;
        csTutorialTarget.style.display = "none";
        csTutorialDestination.style.display = "none";
        csTutorialHand.style.display = "none";
        csHintTutorialHand.style.display = "";
        csHintTutorialHand.style.left = `${hintCenterX}px`;
        csHintTutorialHand.style.top = `${hintCenterY}px`;
        csTutorialMaskHoles.replaceChildren();
        csTutorialEl.classList.remove("drag", "tap", "reminder", "mechanic");
        csTutorialEl.classList.add("hint", "show");
        return;
    }
    if (csTutorial.phase === "mechanic") {
        const tutorial = MECHANIC_TUTORIALS[csTutorial.mechanic];
        csTutorialTitle.textContent = t(tutorial.title);
        setTutorialCopyText(t(tutorial.description));
        const copyTop = tutorialCopyTop + CS.TUTORIAL_TITLE_SLOT_PX;
        csTutorialTitle.style.left = `${tutorialCenterX}px`;
        csTutorialCopy.style.left = `${tutorialCenterX}px`;
        csTutorialCopy.style.top = `${copyTop}px`;
        csTutorialTitle.style.top = `${copyTop - 12}px`;
        csTutorialTarget.style.display = "none";
        csTutorialDestination.style.display = "none";
        const cutouts = [];
        for (const { block, el } of csTutorial.targetEls) {
            const rect = projectBlockScreenBounds(block, projectPoint);
            if (!rect) continue;
            const { minX, minY, maxX, maxY } = rect;
            el.style.left = `${(minX + maxX) / 2}px`;
            el.style.top = `${(minY + maxY) / 2}px`;
            el.style.width = `${Math.max(20, maxX - minX)}px`;
            el.style.height = `${Math.max(20, maxY - minY)}px`;
            cutouts.push(rect);
        }
        csTutorialDimmer.setAttribute("viewBox", `0 0 ${screenRect.width} ${screenRect.height}`);
        csTutorialMask.setAttribute("x", "0");
        csTutorialMask.setAttribute("y", "0");
        csTutorialMask.setAttribute("width", screenRect.width);
        csTutorialMask.setAttribute("height", screenRect.height);
        csTutorialMaskBase.setAttribute("width", screenRect.width);
        csTutorialMaskBase.setAttribute("height", screenRect.height);
        const svgNs = "http://www.w3.org/2000/svg";
        csTutorialMaskHoles.replaceChildren(...cutouts.map(({ minX, minY, maxX, maxY }) => {
            const hole = document.createElementNS(svgNs, "rect");
            // Soft-3D foreshortening needs a little extra so the ring clears the slab sides.
            const pad = 8;
            hole.setAttribute("x", minX - pad);
            hole.setAttribute("y", minY - pad);
            hole.setAttribute("width", maxX - minX + pad * 2);
            hole.setAttribute("height", maxY - minY + pad * 2);
            hole.setAttribute("rx", "14");
            hole.setAttribute("fill", "#000");
            return hole;
        }));
        csTutorialEl.classList.remove("drag", "tap", "reminder");
        csTutorialEl.classList.add("mechanic", "show");
        return;
    }
    if (csTutorial.phase === "level-reminder") {
        setTutorialCopyText(t(tutorialTextKey()));
        csTutorialCopy.style.left = `${tutorialCenterX}px`;
        csTutorialCopy.style.top = `${tutorialCopyTop}px`;
        csTutorialEl.classList.add("reminder", "show");
        csTutorialEl.classList.remove("drag", "tap", "mechanic");
        csTutorialDestination.style.display = "none";
        return;
    }
    if (!csTutorial.target || !csTutorial.target._mesh) return;
    const targetPoint = csTutorial.target._mesh.getWorldPosition(
        csTutorialPoint || (csTutorialPoint = new THREE.Vector3())
    );
    const { x, y } = projectPoint(targetPoint);
    const screenBounds = projectBlockScreenBounds(csTutorial.target, projectPoint);
    if (!screenBounds) return;
    const { minX, minY, maxX, maxY } = screenBounds;
    const isDrag = csTutorial.phase === "move-red";
    setTutorialCopyText(t(tutorialTextKey()));
    csTutorialCopy.style.left = `${tutorialCenterX}px`;
    csTutorialCopy.style.top = `${tutorialCopyTop}px`;
    csTutorialTarget.style.display = "";
    csTutorialHand.style.display = "";
    csTutorialTarget.style.left = `${(minX + maxX) / 2}px`;
    csTutorialTarget.style.top = `${(minY + maxY) / 2}px`;
    csTutorialTarget.style.width = `${Math.max(20, maxX - minX)}px`;
    csTutorialTarget.style.height = `${Math.max(20, maxY - minY)}px`;
    csTutorialDestination.style.display = "none";
    csTutorialHand.style.left = `${x}px`;
    csTutorialHand.style.top = `${y}px`;
    if (isDrag) {
        const handEndPoint = csTutorialHandPoint || (csTutorialHandPoint = new THREE.Vector3());
        handEndPoint.set(
            TUTORIAL_RED_TARGET.x + 0.5 - gridCols / 2,
            CS3D_CFG.BLOCK_BASE_Y + CS3D_CFG.BLOCK_H,
            -gridRows / 2 + TUTORIAL_RED_TARGET.y + 0.5
        );
        CS3D.boardGroup.localToWorld(handEndPoint);
        const handEnd = projectPoint(handEndPoint);
        csTutorialHand.style.setProperty("--tutorial-drag-x", `${handEnd.x - x}px`);
        csTutorialHand.style.setProperty("--tutorial-drag-y", `${handEnd.y - y}px`);
    }

    function setTutorialCopyText(text) {
        if (!csTutorialCopyNeedsFit && csTutorialCopy.textContent === text) return;
        csTutorialCopy.classList.remove("portrait-three-lines");
        csTutorialCopy.textContent = text;
        csTutorialCopy.style.fontSize = "20px";
        const maxWidth = Math.min(CS.TUTORIAL_COPY_MAX_WIDTH_PX, screenRect.width - 32);
        let low = Math.min(CS.TUTORIAL_COPY_MIN_WIDTH_PX, maxWidth);
        let high = maxWidth;
        let fitted = maxWidth;
        while (high - low > 1) {
            const width = (low + high) / 2;
            csTutorialCopy.style.width = `${width}px`;
            const fitsPanel = csTutorialCopy.scrollHeight <= csTutorialCopy.clientHeight;
            if (fitsPanel) {
                fitted = width;
                high = width;
            } else {
                low = width;
            }
        }
        csTutorialCopy.style.width = `${fitted}px`;
        const needsThreeLines = csTutorialCopy.scrollHeight > csTutorialCopy.clientHeight &&
            screenRect.height > screenRect.width;
        csTutorialCopy.classList.toggle("portrait-three-lines", needsThreeLines);
        csTutorialCopyNeedsFit = false;
    }
    csTutorialEl.classList.toggle("drag", isDrag);
    csTutorialEl.classList.toggle("tap", !isDrag);
    csTutorialEl.classList.remove("reminder", "mechanic");
    csTutorialEl.classList.add("show");
}

function tutorialAllowsBlock(b) {
    if (hintFeatureIntroOpen) return false;
    if (csTutorial && csTutorial.phase === "hint") return false;
    if (csTutorial && csTutorial.phase === "mechanic") return false;
    return !csTutorial || !csTutorial.target || csTutorial.target === b;
}

function completeMechanicTutorial() {
    if (csTutorial && csTutorial.phase === "mechanic") {
        if (performance.now() < mechanicTutorialReadyAt) return false;
        completedMechanicTutorials.add(csTutorial.mechanic);
        saveMechanicTutorials();
        hideTutorial();
        setTimeout(startNextMechanicTutorial, 250);
        return true;
    }
    return false;
}

function onScreenPointerDown(e) {
    if (hintFeatureIntroOpen) {
        e.preventDefault();
        return;
    }
    if (completeMechanicTutorial()) e.preventDefault();
}

function advanceTutorialAfterExpansion(b) {
    if (!csTutorial || csTutorial.target !== b) return;
    if (csTutorial.phase === "expand-red") {
        const blue = blocks.find((block) => block.color === PALETTE.blue);
        if (blue) setTutorialStep("expand-blue", blue);
    }
}

function movePillFlightMs() {
    return CS_INTRO.MOVE_RISE_MS + CS_INTRO.MOVE_PAUSE_MS + CS_INTRO.MOVE_POP_MS;
}

function finishMovePillAnim(pill) {
    if (csMovesPillAnim) {
        try {
            csMovesPillAnim.commitStyles();
            csMovesPillAnim.cancel();
        } catch (_) { /* already finished / unsupported */ }
        csMovesPillAnim = null;
    }
    if (pill) {
        // Resting identity — must match post-clearIntro (no residual scale).
        pill.style.transform = "";
    }
}

function runMovePillIntro() {
    const pill = csMovesPill;
    if (!pill) return;
    finishMovePillAnim(pill);

    // FLIP: measure the pill's resting slot, then offset it to screen centre.
    pill.style.transition = "none";
    pill.style.opacity = "0";
    pill.style.transform = "";
    pill.style.zIndex = "";
    const rect = pill.getBoundingClientRect();
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
    const dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
    const peak = CS_INTRO.MOVE_PEAK_SCALE;
    const parkY = CS_INTRO.MOVE_PARK_Y;
    const parkScale = CS_INTRO.MOVE_PARK_SCALE;
    // Keep translate+scale on every keyframe so interpolation stays matched and
    // the final frame is exactly the resting size (scale 1, no jump on cleanup).
    const startTransform = `translate(${dx}px, ${dy}px) scale(${peak})`;
    const parkTransform = `translate(0px, ${parkY}px) scale(${parkScale})`;
    const endTransform = "translate(0px, 0px) scale(1)";
    const flightMs = movePillFlightMs();
    const riseEnd = CS_INTRO.MOVE_RISE_MS / flightMs;
    const pauseEnd = (CS_INTRO.MOVE_RISE_MS + CS_INTRO.MOVE_PAUSE_MS) / flightMs;

    pill.style.willChange = "transform, opacity";
    pill.style.zIndex = "30";
    // Start small / distant at centre — scale-up reads as flying toward the camera.
    pill.style.transform =
        `translate(${dx}px, ${dy}px) scale(${CS_INTRO.MOVE_APPROACH_SCALE})`;
    // eslint-disable-next-line no-unused-expressions
    pill.offsetHeight; // reflow with the centred/hidden state
    pill.style.transition =
        `transform ${CS_INTRO.MOVE_APPROACH_MS}ms ${CS_INTRO.MOVE_APPROACH_EASE}, ` +
        `opacity ${Math.round(CS_INTRO.MOVE_APPROACH_MS * 0.65)}ms ease-out`;
    pill.style.transform = startTransform;
    pill.style.opacity = "1";

    // After the hold beat, blocks have settled and the departing pill no longer
    // obscures the board, so play can begin while it rises and plugs into the HUD.
    csIntroTimers.push(setTimeout(() => {
        csInputLocked = false;
        // Freeze the CSS transition so WAAPI owns the flight without fighting it.
        pill.style.transition = "none";
        pill.style.transform = startTransform;

        // One timeline: smooth rise → hold → pop into resting scale(1).
        // Finishing/clearing only from onfinish avoids nested-timer races that
        // were snapping back to the parked larger scale.
        const flight = pill.animate([
            {
                transform: startTransform,
                offset: 0,
                easing: CS_INTRO.MOVE_RISE_EASE,
            },
            {
                transform: parkTransform,
                offset: riseEnd,
                easing: "linear",
            },
            {
                transform: parkTransform,
                offset: pauseEnd,
                easing: CS_INTRO.MOVE_POP_EASE,
            },
            {
                transform: endTransform,
                offset: 1,
            },
        ], {
            duration: flightMs,
            easing: "linear",
            fill: "forwards",
        });
        csMovesPillAnim = flight;

        const complete = () => {
            if (csMovesPillAnim !== flight) return;
            finishMovePillAnim(pill);
            clearIntro();
            startLevelTutorial();
        };
        flight.onfinish = complete;
        // Safety if onfinish is skipped (tab backgrounded, etc.).
        csIntroTimers.push(setTimeout(complete, flightMs + 32));
    }, CS_INTRO.MOVE_HOLD_MS));
}

function introBounceScale(start, end, bounce, progress) {
    const peakAt = CS_INTRO.BOUNCE_AT;
    if (progress <= peakAt) {
        const p = progress / peakAt;
        const eased = 1 - Math.pow(1 - p, 3);
        return start + (bounce - start) * eased;
    }
    const p = (progress - peakAt) / (1 - peakAt);
    const eased = 1 - Math.pow(1 - p, 3);
    return bounce + (end - bounce) * eased;
}

// Ease-out with a satisfying overshoot for the spawn scale-up.
function easeOutBack(t, overshoot) {
    const c1 = overshoot == null ? 1.35 : overshoot;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(t) {
    t = clampCS(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Per-block spawn staging: appear straight above the board and scale up.
// Tiny sideways lean drifts in slowly as ambient inertia from the pop (with a
// slight random forward/back companion), then the slam flattens and drops.
function sampleBlockIntro(p, pitchSign, tiltSign, tiltMul) {
    p = clampCS(p, 0, 1);
    const liftH = CS_INTRO.SPAWN_LIFT;
    const pitch0 = (pitchSign || 1) * CS_INTRO.SPAWN_PITCH_DEG * Math.PI / 180;
    const tilt0 = (tiltSign || 1) * (tiltMul == null ? 1 : tiltMul) *
        CS_INTRO.SPAWN_TILT_DEG * Math.PI / 180;
    const tScale = CS_INTRO.SPAWN_SCALE_END;
    const tHold = CS_INTRO.SPAWN_HOLD_END;
    const tDrop = CS_INTRO.SPAWN_DROP_END;
    // Lean builds across almost the whole hover — much slower than the scale pop.
    const tLeanPeak = tHold * 0.88;

    if (p <= 0) return { scale: 0, lift: liftH, pitch: 0, tilt: 0 };

    let scale = 1;
    if (p < tScale) {
        scale = Math.max(0, easeOutBack(p / tScale, 1.45));
    }

    let lean = 0;
    if (p < tLeanPeak) {
        const u = p / tLeanPeak;
        // Very slow ease-in: stays near straight early, drifts to the tiny lean late.
        const s = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
        lean = Math.pow(s, 1.35);
    } else if (p < tDrop) {
        // Hold the lean through the hover beat and the whole slam — only pop
        // flush on impact (handled in the bounce phase below).
        if (p < tHold) {
            const u = (p - tLeanPeak) / Math.max(0.0001, tHold - tLeanPeak);
            const soft = u * u * (3 - 2 * u);
            lean = 1 - 0.12 * soft;
        } else {
            lean = 1 - 0.12;
        }
    }
    // p >= tDrop: lean stays 0 after impact (pop flush on land)

    let lift;
    if (p < tHold) {
        lift = liftH;
    } else if (p < tDrop) {
        const u = (p - tHold) / Math.max(0.0001, tDrop - tHold);
        const fall = u * u * u * u;
        lift = liftH * (1 - fall);
    } else {
        const u = (p - tDrop) / Math.max(0.0001, 1 - tDrop);
        lift = CS_INTRO.SPAWN_BOUNCE * Math.sin(u * Math.PI) * (1 - u);
    }

    // On impact, angle pops straight immediately (kept through the fall above).
    const angled = p < tDrop;
    return {
        scale,
        lift,
        pitch: angled ? pitch0 * lean : 0,
        tilt: angled ? tilt0 * lean : 0,
    };
}

function csResize(force) {
    if (!csCanvas || !CS3D.ok) return;
    // Prefer clientWidth/Height so a CSS transform (win-card board shrink) does
    // not feed the scaled visual size back into the WebGL frustum/buffer.
    const cssW = Math.round(csCanvas.clientWidth), cssH = Math.round(csCanvas.clientHeight);
    const aspect = cssW / cssH;
    if (cssW < 64 || cssH < 64 || aspect < 0.2 || aspect > 5) return;
    if (!force && cssW === csCssW && cssH === csCssH) return;
    csCssW = cssW; csCssH = cssH;
    CS3D._rectDirty = true;
    csTutorialCopyNeedsFit = true;
    cs3dResize(cssW, cssH);
}

function csHandleViewportResize() {
    if (!csCanvas || !csCssW) return;
    const nextWidth = Math.round(csCanvas.getBoundingClientRect().width);
    if (Math.abs(nextWidth - csCssW) / csCssW < CS_VIEWPORT_WIDTH_CHANGE) return;
    requestAnimationFrame(() => csResize(true));
}

// Obstacle footprint for collision. During a failed-expand bounce the visual
// grows into a partial footprint while logical x/w stay small — reserve that
// peak partial so other blocks can't expand/drag into the animation (SP-972).
function blockCollisionRect(b) {
    const fa = b.failAnim;
    if (fa && fa.kind !== "shrink") {
        return { x: fa.px, y: fa.py, w: fa.pw, h: fa.ph };
    }
    return { x: b.x, y: b.y, w: b.w, h: b.h };
}

// ---- validity gate: the single authority for legal placement ----
function isSpaceValid(x, y, w, h, ignore) {
    if (x < 0 || y < 0 || x + w > gridCols || y + h > gridRows) return false;
    for (let r = y; r < y + h; r++)
        for (let c = x; c < x + w; c++)
            if (grid[r][c] === 0) return false;
    for (const b of blocks) {
        if (b === ignore) continue;
        const o = blockCollisionRect(b);
        if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return false;
    }
    return true;
}

// ---- hit testing: raycast pointer against the block slabs ----
function getBlockAt(px, py) {
    if (!CS3D.ok) return null;
    const rect = csCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    CS3D.ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    CS3D.ray.setFromCamera(CS3D.ndc, CS3D.camera);
    // Recursive so locked-block stake wells can hit an invisible child collider
    // (the slab itself has a hole there). Decorative children no-op their raycast.
    const hits = CS3D.ray.intersectObjects(CS3D.blockMeshes, true);
    for (const h of hits) {
        let obj = h.object;
        while (obj) {
            const b = obj.userData && obj.userData.block;
            if (b) return b;
            obj = obj.parent;
        }
    }
    return null;
}

// A block is full when it covers exactly its target number of cells. Since a
// block is always a rectangle, any orientation of area === targetSize counts.
function isFull(b) { return b.w * b.h === b.targetSize; }

// ---- timer accounting ----
function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
}

function updateHUD() {
    csMovesValue.textContent = timeLimit === Infinity ? "∞" : fmtTime(timeRemaining);
    if (timeLimit !== Infinity && timerRunning && !csLevelDone) {
        csMovesPill.classList.toggle("warn", timeRemaining <= CS.TIMER_WARNING_SECONDS);
        csMovesPill.classList.toggle("last-move", timeRemaining <= CS.TIMER_PULSE_SECONDS);
    } else {
        csMovesPill.classList.remove("warn", "last-move");
    }
}

function startTimer() {
    if (timeLimit === Infinity || timerRunning) return;
    timerRunning = true;
    timerLastTickMs = performance.now();
}

function timerIsPaused() {
    const tutorialBlocksBoard = csTutorial && csTutorial.phase !== "level-reminder";
    const offerOpen = window.AdOffers && typeof AdOffers.isAnyOpen === "function" && AdOffers.isAnyOpen();
    return tutorialBlocksBoard || settingsOverlay.classList.contains("show") || offerOpen;
}

// Uses monotonic elapsed time rather than the render frame delta, so extra
// update calls cannot make the countdown run faster.
function tickTimer() {
    if (!timerRunning || csLevelDone || csGameOver || csIntro || timerIsPaused()) {
        timerLastTickMs = null;
        return;
    }
    if (timeLimit === Infinity) return;
    const now = performance.now();
    if (timerLastTickMs === null) {
        timerLastTickMs = now;
        return;
    }
    const elapsedSec = Math.min(0.1, Math.max(0, (now - timerLastTickMs) / 1000));
    timerLastTickMs = now;
    timeRemaining = Math.max(0, timeRemaining - elapsedSec);
    updateHUD();
    if (timeRemaining <= 0 && !allFull()) {
        csGameOver = true;
        lockInGameSettings();
        csFailTimer = setTimeout(() => {
            if (typeof hintOnFail === "function") hintOnFail();
            if (window.KPFApp && typeof KPFApp.offerTimesUp === "function") {
                KPFApp.offerTimesUp();
            } else {
                levelFailed();
            }
        }, 500);
    }
}

function allFull() { return blocks.every(isFull); }

function checkWin() {
    if (csLevelDone || csGameOver) return;
    if (allFull()) {
        csLevelDone = true;
        hideTutorial();
        if (level === 1) cs3dDestroyTutorialDestinationMeshes();
        updateHUD();
        // Celebrate the instant the final piece lands: the sheen sweep, the board
        // pan-out and the UI fade all start now while the render loop keeps
        // running, so the winning pop plays out inside the celebration.
        beginWinCelebration();
    }
}

function beginWinCelebration() {
    csSheen = { active: true, t: 0 };
    beginWinWave();
    // Route through the index.html analytics hook (not startOutro directly).
    levelComplete();
}

/** Top-left cell diagonal — same axis as the intro spawn cascade. */
function winWaveDiag(b) {
    return (b.x || 0) + (b.y || 0);
}

/** Sort key for the win pop wave order. */
function winWaveSortKey(b, orderMode) {
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h * 0.5;
    const midX = gridCols * 0.5;
    const midY = gridRows * 0.5;
    const dist = Math.hypot(cx - midX, cy - midY);
    const diag = winWaveDiag(b);
    switch (orderMode) {
        case "reverse": return -diag;
        case "centerOut": return dist;
        case "centerIn": return -dist;
        case "cascade":
        default: return diag;
    }
}

function beginWinWave() {
    if (!CS_WIN.WAVE_ENABLED) {
        csWinWave = { active: false, t: 0, order: [], maxStep: 0 };
        return;
    }
    const includeLocked = !!CS_WIN.WAVE_INCLUDE_LOCKED;
    const candidates = blocks.filter((b) => b && (includeLocked || !b.locked));
    const mode = CS_WIN.WAVE_ORDER || "cascade";
    candidates.sort((a, b) => {
        const d = winWaveSortKey(a, mode) - winWaveSortKey(b, mode);
        if (Math.abs(d) > 1e-6) return d;
        // Same diagonal: left → right, then by id.
        const dx = (a.x || 0) - (b.x || 0);
        if (dx) return dx;
        return (a.id || 0) - (b.id || 0);
    });

    // Cascade / reverse: stagger by board diagonal (top-left → bottom-right),
    // matching the intro spawn so pieces on the same diagonal jump together.
    // Center modes still stagger one-by-one in sorted distance order.
    const useDiag = mode === "cascade" || mode === "reverse" || !mode;
    let maxStep = 0;
    if (useDiag && candidates.length) {
        let minDiag = Infinity;
        let maxDiag = -Infinity;
        for (const b of candidates) {
            const d = winWaveDiag(b);
            if (d < minDiag) minDiag = d;
            if (d > maxDiag) maxDiag = d;
        }
        for (const b of candidates) {
            const d = winWaveDiag(b);
            b._winWaveStep = mode === "reverse" ? (maxDiag - d) : (d - minDiag);
            if (b._winWaveStep > maxStep) maxStep = b._winWaveStep;
        }
    } else {
        for (let i = 0; i < candidates.length; i++) {
            candidates[i]._winWaveStep = i;
            if (i > maxStep) maxStep = i;
        }
    }

    for (const b of blocks) {
        b.winPopScale = 1;
        b.winPopLift = 0;
        b.winPopSquash = 0;
        b._winPopFaceApplied = false;
        b._winPopCycle = -1;
    }
    csWinWave = { active: true, t: 0, order: candidates, maxStep };
}

/**
 * One block's bounce pop: rise to a peak, fall to the board, then a subtle
 * land hop (+ optional footprint squash). Progress t is 0..1.
 */
function sampleWinPop(t) {
    t = clampCS(t, 0, 1);
    const peakAt = clampCS(CS_WIN.WAVE_PEAK_AT == null ? 0.38 : CS_WIN.WAVE_PEAK_AT, 0.05, 0.85);
    const landAt = clampCS(
        CS_WIN.WAVE_LAND_AT == null ? 0.70 : CS_WIN.WAVE_LAND_AT,
        peakAt + 0.05,
        0.95
    );
    const start = CS_WIN.WAVE_SCALE_START == null ? 0.92 : CS_WIN.WAVE_SCALE_START;
    const peak = CS_WIN.WAVE_SCALE_PEAK == null ? 1.18 : CS_WIN.WAVE_SCALE_PEAK;
    const liftH = CS_WIN.WAVE_LIFT == null ? 0.42 : CS_WIN.WAVE_LIFT;
    const landBounce = CS_WIN.WAVE_LAND_BOUNCE == null ? 0.09 : CS_WIN.WAVE_LAND_BOUNCE;
    const landBounceScale = CS_WIN.WAVE_LAND_BOUNCE_SCALE == null ? 0.03 : CS_WIN.WAVE_LAND_BOUNCE_SCALE;
    const landAmt = CS_WIN.WAVE_LAND_SQUASH == null ? 0.035 : CS_WIN.WAVE_LAND_SQUASH;

    let scale = 1;
    let lift = 0;
    let squash = 0;

    if (t <= peakAt) {
        // Smooth ease-in-out rise — easeOutBack read as a snap to peak lift/scale.
        const u = t / peakAt;
        const e = easeInOutCubic(u);
        scale = start + (peak - start) * e;
        lift = liftH * e;
    } else if (t <= landAt) {
        // Accelerate down into the board.
        const u = (t - peakAt) / Math.max(0.0001, landAt - peakAt);
        const fall = u * u;
        const settle = 1 - Math.pow(1 - u, 2);
        scale = peak + (1 - peak) * settle;
        lift = liftH * (1 - fall);
    } else {
        // Subtle land hop: sin envelope that decays as it settles.
        const u = (t - landAt) / Math.max(0.0001, 1 - landAt);
        const hop = Math.sin(u * Math.PI) * (1 - u * 0.4);
        lift = Math.max(0, landBounce * hop);
        scale = 1 + landBounceScale * hop;
        // Footprint squash strongest right at impact, fades through the hop.
        if (landAmt > 0) {
            squash = landAmt * Math.sin(Math.min(1, u * 2.4) * Math.PI) * Math.max(0, 1 - u);
        }
    }

    return { scale, lift, squash };
}

function applyWinHappyFace(b) {
    if (!CS_WIN.WAVE_SWAP_TO_HAPPY) return;
    if (!b || b.locked) return;
    if (!window.BlockCharacters || typeof BlockCharacters.setBlockHappyFace !== "function") return;
    BlockCharacters.setBlockHappyFace(b, {
        index: CS_WIN.WAVE_HAPPY_FACE_INDEX,
        match: CS_WIN.WAVE_HAPPY_FACE_MATCH
    });
}

function updateWinWave(dtSec) {
    if (!csWinWave.active || !CS_WIN.WAVE_ENABLED) return;
    csWinWave.t += dtSec * 1000;

    const order = csWinWave.order;
    const n = order.length;
    if (!n) {
        csWinWave.active = false;
        return;
    }

    const startDelay = CS_WIN.WAVE_START_DELAY_MS || 0;
    const stagger = Math.max(0, CS_WIN.WAVE_STAGGER_MS || 0);
    const popMs = Math.max(1, CS_WIN.WAVE_POP_MS || 520);
    const loopGap = Math.max(0, CS_WIN.WAVE_LOOP_GAP_MS || 0);
    const maxStep = csWinWave.maxStep != null ? csWinWave.maxStep : Math.max(0, n - 1);
    const waveSpan = startDelay + maxStep * stagger + popMs;
    const cycleMs = waveSpan + loopGap;
    const cycleIndex = Math.floor(csWinWave.t / cycleMs);
    const tInCycle = csWinWave.t - cycleIndex * cycleMs;

    for (let i = 0; i < n; i++) {
        const b = order[i];
        if (!b) continue;
        const step = b._winWaveStep != null ? b._winWaveStep : i;
        const localStart = startDelay + step * stagger;
        const localT = (tInCycle - localStart) / popMs;

        if (localT < 0 || localT > 1) {
            b.winPopScale = 1;
            b.winPopLift = 0;
            b.winPopSquash = 0;
            continue;
        }

        const sample = sampleWinPop(localT);
        b.winPopScale = sample.scale;
        b.winPopLift = sample.lift;
        b.winPopSquash = sample.squash;

        // Swap to happy face at the bounce peak (first wave, or every loop if configured).
        const peakAt = clampCS(
            CS_WIN.WAVE_PEAK_AT == null ? 0.38 : CS_WIN.WAVE_PEAK_AT, 0.05, 0.9
        );
        if (localT >= peakAt) {
            const shouldFace = !b._winPopFaceApplied ||
                (CS_WIN.WAVE_FACE_EACH_LOOP && b._winPopCycle !== cycleIndex);
            if (shouldFace) {
                applyWinHappyFace(b);
                b._winPopFaceApplied = true;
                b._winPopCycle = cycleIndex;
            }
        }
    }
}

// ---- expansion: fill N cells as the widest rectangle that fits ----
// Candidate rectangles (w,h) with w*h === n, ordered widest-first so a block
// always fills as much horizontal space as it can before wrapping to another
// row — the most intuitive, predictable growth. e.g. n=12 → 12×1, 6×2, 4×3,
// 3×4, 2×6, 1×12.
function targetShapes(n) {
    const shapes = [];
    for (let w = 1; w <= n; w++) {
        if (n % w === 0) shapes.push([w, n / w]);
    }
    shapes.sort((a, b) => b[0] - a[0]); // widest (most horizontal) first
    return shapes;
}

function orderedOffsets(extra) {
    const mid = extra / 2;
    const arr = [];
    for (let i = 0; i <= extra; i++) arr.push(i);
    arr.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    return arr;
}

// Grow the block to cover `n` cells: try each candidate rectangle shape in
// preference order, and for each place it centre-out (leaning to fill space)
// while still covering the current footprint. First valid placement wins.
function placeGrown(b, n) {
    for (const [tw, th] of targetShapes(n)) {
        if (tw < b.w || th < b.h) continue;
        const extraX = tw - b.w, extraY = th - b.h;
        for (const ox of orderedOffsets(extraX)) {
            for (const oy of orderedOffsets(extraY)) {
                const nx = b.x - ox, ny = b.y - oy;
                // placement must still cover the current footprint
                if (nx > b.x || ny > b.y || nx + tw < b.x + b.w || ny + th < b.y + b.h) continue;
                if (isSpaceValid(nx, ny, tw, th, b)) {
                    b.initialOffsetX = b.x - nx;
                    b.initialOffsetY = b.y - ny;
                    b.x = nx; b.y = ny; b.w = tw; b.h = th;
                    return true;
                }
            }
        }
    }
    return false;
}

function shrinkBlock(b) {
    b._pendingEdgeSfx = false;
    b.x += b.initialOffsetX;
    b.y += b.initialOffsetY;
    b.w = b.initW; b.h = b.initH;
    b.initialOffsetX = 0; b.initialOffsetY = 0;
}

function largestPartial(b) {
    // biggest rectangle (area up to targetSize) that fits while covering the
    // footprint — used only for the visual "grew as far as it could" fail bounce.
    const n = b.targetSize;
    let best = { w: b.w, h: b.h, x: b.x, y: b.y };
    for (let tw = b.w; tw <= n; tw++) {
        for (let th = b.h; th <= n; th++) {
            if (tw * th > n) continue;
            if (tw === b.w && th === b.h) continue;
            for (const ox of orderedOffsets(tw - b.w)) {
                for (const oy of orderedOffsets(th - b.h)) {
                    const nx = b.x - ox, ny = b.y - oy;
                    if (nx > b.x || ny > b.y || nx + tw < b.x + b.w || ny + th < b.y + b.h) continue;
                    if (isSpaceValid(nx, ny, tw, th, b)) {
                        if (tw * th > best.w * best.h) best = { w: tw, h: th, x: nx, y: ny };
                    }
                }
            }
        }
    }
    return best;
}

function toggleBlock(b) {
    if (b.failAnim) return;
    if (isFull(b)) {
        if (b.preExpanded) {
            // Pre-expanded blocks are rigid: they can't shrink. Play a bounce.
            startShrinkFail(b);
            haptic("blocked");
            return;
        }
        const cellsLost = (b.w * b.h) - (b.initW * b.initH);
        shrinkBlock(b);
        kickWiggle(b, 0.7);
        haptic("resize");
        playExpandSequence(b, cellsLost, false);
        updateHUD(); checkWin();
        return;
    }
    if (placeGrown(b, b.targetSize)) {
        failedExpansionStreak = 0;
        kickWiggle(b, CS.EXPAND_POP);
        b.expandGlow = 1;
        cs3dSpawnSeamBursts(b);
        haptic("resize");
        playExpandSequence(b, b.targetSize, true);
        b._pendingEdgeSfx = true;
        advanceTutorialAfterExpansion(b); updateHUD(); checkWin();
    } else {
        startFailAnim(b);
        haptic("blocked");
        startFailedExpansionTutorial();
    }
}

function kickWiggle(b, strength) {
    b.wiggle = strength;
    b.wigglePhase = 0;
    b.wiggleDecay = CS.POP_DECAY;
}

function startFailAnim(b) {
    const p = largestPartial(b);
    playBlockingSfx();
    // The block couldn't reach its target area; mark the faces it couldn't push
    // past so the bounce bulges against them.
    const notFull = p.w * p.h < b.targetSize;
    const blocked = {
        left:  p.x === b.x && notFull,
        right: (p.x + p.w) === (b.x + b.w) && notFull,
        top:   p.y === b.y && notFull,
        bottom:(p.y + p.h) === (b.y + b.h) && notFull,
    };
    b.failAnim = {
        t: 0,
        growMs: CS.FAIL_GROW_MS,
        holdMs: CS.FAIL_HOLD_MS,
        returnMs: CS.FAIL_RETURN_MS,
        pw: p.w, ph: p.h, px: p.x, py: p.y, blocked
    };
    b.failFlash = 0;
    b.failConfine = 0;
}

// Pre-expanded blocks can't shrink: dip inward, shake, flash, and bulge on
// every face, then snap back. Visual only — reuses the failAnim envelope and
// counts no move.
function startShrinkFail(b) {
    const shrink = 0.9;
    playBlockingSfx();
    const pw = b.w * shrink, ph = b.h * shrink;
    const px = b.x + (b.w - pw) / 2, py = b.y + (b.h - ph) / 2;
    const blocked = { left: true, right: true, top: true, bottom: true };
    // Slower and gentler than a blocked expansion: this is a rigid refusal,
    // not a large outward slime press.
    b.failAnim = {
        t: 0,
        growMs: CS.FAIL_SHRINK_GROW_MS,
        holdMs: CS.FAIL_SHRINK_HOLD_MS,
        returnMs: CS.FAIL_SHRINK_RETURN_MS,
        pw, ph, px, py, blocked, kind: "shrink"
    };
    b.failFlash = 0;
    b.failConfine = 0;
}

// ---- input handlers ----
function localPoint(e) {
    const rect = csCanvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
}

function kickPassedBlocks(moving) {
    for (const other of blocks) {
        if (other === moving || other.preExpanded) continue;
        const overlapsX = moving.x < other.x + other.w && moving.x + moving.w > other.x;
        const overlapsY = moving.y < other.y + other.h && moving.y + moving.h > other.y;
        if (overlapsY && moving.x + moving.w === other.x) {
            other.jiggleVX += CS.PASS_BY_JIGGLE;
        } else if (overlapsY && other.x + other.w === moving.x) {
            other.jiggleVX -= CS.PASS_BY_JIGGLE;
        } else if (overlapsX && moving.y + moving.h === other.y) {
            other.jiggleVY += CS.PASS_BY_JIGGLE;
        } else if (overlapsX && other.y + other.h === moving.y) {
            other.jiggleVY -= CS.PASS_BY_JIGGLE;
        }
    }
}

function onPointerDown(e) {
    if (csLevelDone || csGameOver || csInputLocked || hintFeatureIntroOpen) return;
    if (completeMechanicTutorial()) {
        e.preventDefault();
        return;
    }
    // Multi-touch off during play: ignore every pointer after the first (SP-973).
    if (isDragging || activePointerId !== null) return;
    const { px, py } = localPoint(e);
    const b = getBlockAt(px, py);
    // Ignore blocks mid fail-bounce — hit tests use the grown mesh (SP-972).
    if (!b || b.failAnim || !tutorialAllowsBlock(b)) return;
    startTimer();
    activeBlock = b;
    isDragging = true;
    activePointerId = e.pointerId;
    haptic("tap");
    dragMoved = false;
    dragStartX = b.x;
    dragStartY = b.y;
    pointerDownPx = px;
    pointerDownPy = py;
    pointerTravelled = false;
    if (b.moveAxis || b.locked) {
        axisGuideBlock = b;
        axisGuideAlpha = 0;
        axisGuideHoldS = 0;
    }
    staticHoldCancelled = false;
    // Hold the block by the exact point it was grabbed so it doesn't jump.
    const gp = cs3dCellAt(px, py);
    grabOffsetX = gp ? gp.col - b.x : 0;
    grabOffsetY = gp ? gp.row - b.y : 0;
    dragFloatX = b.x;
    dragFloatY = b.y;
    dragSnappedX = b.x;
    dragSnappedY = b.y;
    dragPrevDX = 0; dragPrevDY = 0;
    dragTargetX = b.x;
    dragTargetY = b.y;
    csCanvas.setPointerCapture && csCanvas.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
    if (!isDragging || !activeBlock) return;
    if (e.pointerId !== activePointerId) return;
    const b = activeBlock;
    const { px, py } = localPoint(e);
    if (b.locked) {
        // Static blocks expand only when the hold is released without leaving them.
        // Once the pointer leaves, returning to the block does not reactivate it.
        if (getBlockAt(px, py) !== b) staticHoldCancelled = true;
        return;
    }
    // Flag once the finger travels beyond the tap threshold so release can tell
    // a deliberate drag from a stationary tap even if the block never moved.
    if (!pointerTravelled) {
        const dx = px - pointerDownPx, dy = py - pointerDownPy;
        if (dx * dx + dy * dy > TAP_MOVE_PX * TAP_MOVE_PX) pointerTravelled = true;
    }
    // Record where the finger wants the block's top-left; clamp + ease runs
    // per-frame in updateDragFollow.
    const gp = cs3dCellAt(px, py);
    if (!gp) return;
    const targetX = gp.col - grabOffsetX;
    const targetY = gp.row - grabOffsetY;
    if (b.moveAxis !== "vertical") dragTargetX = targetX;
    if (b.moveAxis !== "horizontal") dragTargetY = targetY;
}

// How far the block can slide on X from grid cell (fromX, fromY).
// Returns inclusive [min, max] top-left X positions via isSpaceValid.
function calculateBoundsX(b, fromX, fromY) {
    let min = fromX, max = fromX;
    while (min > 0 && isSpaceValid(min - 1, fromY, b.w, b.h, b)) min--;
    while (max + b.w < gridCols && isSpaceValid(max + 1, fromY, b.w, b.h, b)) max++;
    return { min, max };
}

// How far the block can slide on Y from grid cell (fromX, fromY).
function calculateBoundsY(b, fromX, fromY) {
    let min = fromY, max = fromY;
    while (min > 0 && isSpaceValid(fromX, min - 1, b.w, b.h, b)) min--;
    while (max + b.h < gridRows && isSpaceValid(fromX, max + 1, b.w, b.h, b)) max++;
    return { min, max };
}

// Clamp desiredX to the X-range at the current snapped cell, update dragSnappedX.
function resolveDragX(b, desiredX) {
    const bounds = calculateBoundsX(b, dragSnappedX, dragSnappedY);
    const clampedX = Math.min(Math.max(desiredX, bounds.min), bounds.max);
    const newGridX = Math.round(clampedX);
    dragSnappedX = Math.min(Math.max(newGridX, bounds.min), bounds.max);
    return clampedX;
}

// Clamp desiredY to the Y-range at the current snapped cell, update dragSnappedY.
function resolveDragY(b, desiredY) {
    const bounds = calculateBoundsY(b, dragSnappedX, dragSnappedY);
    const clampedY = Math.min(Math.max(desiredY, bounds.min), bounds.max);
    const newGridY = Math.round(clampedY);
    dragSnappedY = Math.min(Math.max(newGridY, bounds.min), bounds.max);
    return clampedY;
}

// Slide-bounds alone allow sub-cell poses that dig into a diagonally adjacent
// footprint (integer (0,0) is valid, continuous (0.4,0.4) overlaps (1,1)).
// Push the continuous top-left out of any overlapping obstacle AABB so corner
// contact stops at the shared vertex and overshoot can drive squish.
function separateDragFootprint(b, x, y) {
    // A couple of passes cover multi-block corners (e.g. jammed into an L).
    for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const other of blocks) {
            if (other === b) continue;
            const o = blockCollisionRect(other);
            const x1 = x + b.w, y1 = y + b.h;
            const ox1 = o.x + o.w, oy1 = o.y + o.h;
            if (!(x < ox1 && x1 > o.x && y < oy1 && y1 > o.y)) continue;

            const overlapL = x1 - o.x;
            const overlapR = ox1 - x;
            const overlapT = y1 - o.y;
            const overlapB = oy1 - y;
            const overlapX = Math.min(overlapL, overlapR);
            const overlapY = Math.min(overlapT, overlapB);
            // Shallow overlap on both axes = corner clip (integer snap can be
            // valid while a sub-cell pose digs into a diagonal neighbour). Resolve
            // both axes to the shared vertex. Deep overlap on one axis is a face
            // hit — separate on the minimum-translation axis only.
            const shallow = Math.min(b.w, o.w, b.h, o.h) * 0.5;
            if (overlapX > 1e-6 && overlapY > 1e-6 &&
                overlapX < shallow && overlapY < shallow) {
                x += (overlapL < overlapR) ? -overlapL : overlapR;
                y += (overlapT < overlapB) ? -overlapT : overlapB;
            } else {
                const minO = Math.min(overlapL, overlapR, overlapT, overlapB);
                if (minO === overlapL) x -= overlapL;
                else if (minO === overlapR) x += overlapR;
                else if (minO === overlapT) y -= overlapT;
                else y += overlapB;
            }
            moved = true;
        }
        if (!moved) break;
    }
    return { x, y };
}

// Clamp the finger's desired top-left into a legal continuous position.
// Free 2D: dominant input axis first, then orthogonal, then dominant again —
// the orthogonal step can open new range that the second dominant pass uses,
// so the block slides through L-corridors and around corners without getting
// stuck on a fixed X-then-Y order (matches BlockObject.ComputeClampedPosition).
// Then separateDragFootprint closes diagonal sub-cell corner clipping.
function computeClampedPosition(b, desiredX, desiredY) {
    let clampedX, clampedY;
    if (b.moveAxis === "vertical") {
        clampedX = dragSnappedX;
        clampedY = resolveDragY(b, desiredY);
    } else if (b.moveAxis === "horizontal") {
        clampedX = resolveDragX(b, desiredX);
        clampedY = dragSnappedY;
    } else {
        const dx = desiredX - dragSnappedX;
        const dy = desiredY - dragSnappedY;
        const xFirst = Math.abs(dx) >= Math.abs(dy);

        if (xFirst) {
            resolveDragX(b, desiredX);
            clampedY = resolveDragY(b, desiredY);
            clampedX = resolveDragX(b, desiredX);
        } else {
            resolveDragY(b, desiredY);
            clampedX = resolveDragX(b, desiredX);
            clampedY = resolveDragY(b, desiredY);
        }
    }
    const sep = separateDragFootprint(b, clampedX, clampedY);
    if (b.moveAxis === "vertical") return { x: dragSnappedX, y: sep.y };
    if (b.moveAxis === "horizontal") return { x: sep.x, y: dragSnappedY };
    return sep;
}

// Per-frame drag resolution for the actively held block. Clamp the finger
// desire against grid slide bounds (updating mid-drag snap), then EASE the
// float toward that clamped point so catch-up around corners stays smooth.
// Re-clamp the eased float so independent X/Y catch-up cannot cut diagonally
// through an obstacle corner. Finger push PAST the (finger) clamp becomes
// slime squish — measured against clamp, not float lag.
function updateDragFollow(b, dtSec) {
    const prevFloatX = dragFloatX, prevFloatY = dragFloatY;
    const clamped = computeClampedPosition(b, dragTargetX, dragTargetY);
    const k = 1 - Math.exp(-CS.DRAG_FOLLOW_K * dtSec);
    const nextX = dragFloatX + (clamped.x - dragFloatX) * k;
    const nextY = dragFloatY + (clamped.y - dragFloatY) * k;
    // Float must not drive the mid-drag snap — save, re-clamp the eased point
    // with the same slide-bounds resolver, then restore.
    const snapX = dragSnappedX, snapY = dragSnappedY;
    const safe = computeClampedPosition(b, nextX, nextY);
    dragSnappedX = snapX;
    dragSnappedY = snapY;
    dragFloatX = safe.x;
    dragFloatY = safe.y;
    // Slight jelly wobble that tracks the finger. Driven by the CHANGE in the
    // per-frame glide displacement (an acceleration proxy), so it kicks on
    // starts/stops/direction changes and stays quiet at a steady glide — a smooth
    // wobble, never the per-cell "bump" that discrete kicks caused. Cross-axis
    // terms keep it volume-preserving, mirroring the move-kick shape.
    const mvx = dragFloatX - prevFloatX, mvy = dragFloatY - prevFloatY;
    const ax = mvx - dragPrevDX, ay = mvy - dragPrevDY;
    const kx = ax * CS.DRAG_WOBBLE_K, ky = ay * CS.DRAG_WOBBLE_K;
    b.jiggleVX += kx - ky * 0.6;
    b.jiggleVY += ky - kx * 0.6;
    dragPrevDX = mvx; dragPrevDY = mvy;
    if ((dragSnappedX !== b.x || dragSnappedY !== b.y) &&
        isSpaceValid(dragSnappedX, dragSnappedY, b.w, b.h, b)) {
        b.x = dragSnappedX; b.y = dragSnappedY; dragMoved = true; kickPassedBlocks(b);
    }
    // Squish only from the collision-blocked overshoot (target beyond clamp), not
    // from the eased catch-up lag — so open-space cornering glides without squish.
    const pressK = 1 - Math.exp(-CS.DRAG_SQUISH_FOLLOW_K * dtSec);
    const targetPressX = pressSquish(dragTargetX - clamped.x);
    const targetPressY = pressSquish(dragTargetY - clamped.y);
    dragPressX += (targetPressX - dragPressX) * pressK;
    dragPressY += (targetPressY - dragPressY) * pressK;
}

// Commit the mid-drag snapped cell on release (already isSpaceValid by construction).
function settleDrag(b) {
    if (isSpaceValid(dragSnappedX, dragSnappedY, b.w, b.h, b)) {
        if (dragSnappedX !== b.x || dragSnappedY !== b.y) {
            b.x = dragSnappedX; b.y = dragSnappedY; dragMoved = true;
        }
        return;
    }
    // Fallback: nearest valid neighbour of the float (should be rare).
    const ix = b.moveAxis === "vertical" ? b.x : Math.round(dragFloatX);
    const iy = b.moveAxis === "horizontal" ? b.y : Math.round(dragFloatY);
    for (const [ox, oy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nx = ix + ox, ny = iy + oy;
        if (isSpaceValid(nx, ny, b.w, b.h, b)) {
            if (nx !== b.x || ny !== b.y) { b.x = nx; b.y = ny; dragMoved = true; }
            return;
        }
    }
}

function resetTutorialDrag(b, force = false) {
    if (!csTutorial || csTutorial.phase !== "move-red" || csTutorial.target !== b ||
        (!force && b.x === TUTORIAL_RED_TARGET.x && b.y === TUTORIAL_RED_TARGET.y)) {
        return false;
    }
    b.x = csTutorial.origin.x;
    b.y = csTutorial.origin.y;
    b.renderX = b.x;
    b.renderY = b.y;
    dragFloatX = b.x;
    dragFloatY = b.y;
    dragSnappedX = b.x;
    dragSnappedY = b.y;
    dragMoved = false;
    return true;
}

// Saturating map from finger overpush (cells past a blocked edge) to a signed
// compression amount, so pushing harder squishes more but never runs away.
function pressSquish(over) {
    if (over === 0) return 0;
    const s = 1 - Math.exp(-Math.abs(over) / CS.DRAG_SQUISH_SCALE);
    return Math.sign(over) * CS.DRAG_SQUISH_MAX * s;
}

function onPointerUp(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (!activeBlock) {
        isDragging = false;
        activePointerId = null;
        return;
    }
    const b = activeBlock;
    if (b.locked) {
        const { px, py } = localPoint(e);
        if (!staticHoldCancelled && getBlockAt(px, py) === b) toggleBlock(b);
        isDragging = false;
        activeBlock = null;
        activePointerId = null;
        staticHoldCancelled = false;
        return;
    }
    // Settle onto the mid-drag snapped cell, then release any slime squish with
    // a spring rebound so it pops back.
    settleDrag(b);
    resetTutorialDrag(b);
    releaseDragSquish(b);
    // A press that neither moved the block nor travelled past the tap threshold
    // is a tap: a single tap toggles the block (expand / contract).
    // The opening tutorial must teach movement first: red cannot expand until a
    // completed drag has placed it at the highlighted grid cell.
    const tutorialRequiresDrag = csTutorial &&
        csTutorial.phase === "move-red" && csTutorial.target === b;
    if (!dragMoved && !pointerTravelled && !tutorialRequiresDrag) {
        lastTapBlock = null; lastTapTime = 0;
        toggleBlock(b);
    } else {
        lastTapBlock = null; lastTapTime = 0;
        const netMoved = b.x !== dragStartX || b.y !== dragStartY;
        const tutorialDragComplete = !tutorialRequiresDrag ||
            (b.x === TUTORIAL_RED_TARGET.x && b.y === TUTORIAL_RED_TARGET.y);
        if (netMoved && tutorialDragComplete) {
            haptic("tap");
            playSound("drop");
            if (csTutorial && csTutorial.phase === "move-red") {
                setTutorialStep("expand-red", b);
            }
            checkWin();
        }
    }
    isDragging = false;
    activeBlock = null;
    activePointerId = null;
}

function onPointerCancel(e) {
    if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
    if (activeBlock) {
        resetTutorialDrag(activeBlock, true);
        releaseDragSquish(activeBlock);
    }
    isDragging = false;
    activeBlock = null;
    activePointerId = null;
    staticHoldCancelled = false;
}

// On release, drop the squish target and convert the built-up compression into
// a volume-preserving spring impulse so the slime springs back past neutral.
function releaseDragSquish(b) {
    const rb = CS.DRAG_SQUISH_REBOUND;
    b.jiggleVX += Math.abs(b.pressX || 0) * rb;
    b.jiggleVY -= Math.abs(b.pressX || 0) * rb * 0.6;
    b.jiggleVY += Math.abs(b.pressY || 0) * rb;
    b.jiggleVX -= Math.abs(b.pressY || 0) * rb * 0.6;
    dragPressX = 0; dragPressY = 0;
}

// Semi-implicit Euler for one jiggle axis. Authored at 60fps (SPRING_K=180);
// large single steps go unstable and thrash against the ±0.35 clamp.
const JIGGLE_CLAMP = 0.35;
const JIGGLE_SUBSTEP = 1 / 60;

function integrateJiggleAxis(pos, vel, dtSec) {
    let x = pos, v = vel;
    let remaining = Math.max(0, dtSec);
    while (remaining > 1e-8) {
        const step = remaining > JIGGLE_SUBSTEP ? JIGGLE_SUBSTEP : remaining;
        remaining -= step;
        v += (-CS.SPRING_K * x - CS.SPRING_D * v) * step;
        x += v * step;
    }
    if (x < -JIGGLE_CLAMP) { x = -JIGGLE_CLAMP; if (v < 0) v = 0; }
    else if (x > JIGGLE_CLAMP) { x = JIGGLE_CLAMP; if (v > 0) v = 0; }
    return { x, v };
}

function integrateJiggle(b, dtSec) {
    const jx = integrateJiggleAxis(b.jiggleX, b.jiggleVX, dtSec);
    b.jiggleX = jx.x; b.jiggleVX = jx.v;
    const jy = integrateJiggleAxis(b.jiggleY, b.jiggleVY, dtSec);
    b.jiggleY = jy.x; b.jiggleVY = jy.v;
}

// ---- per-frame update (render interpolation only) ----
function csUpdate(dtSec) {
    tickTimer();
    const smooth = 1 - Math.exp(-CS.LERP_K * dtSec);
    const smoothW = 1 - Math.exp(-CS.EXPAND_K * dtSec);
    const holdingConstrainedBlock = isDragging && activeBlock &&
        (activeBlock.moveAxis || activeBlock.locked);
    axisGuideHoldS = holdingConstrainedBlock ? axisGuideHoldS + dtSec : 0;
    const axisGuideTarget = axisGuideHoldS >= CS.AXIS_GUIDE_DELAY_S ? 1 : 0;
    const axisGuideStep = dtSec / CS.AXIS_GUIDE_FADE_S;
    axisGuideAlpha = axisGuideTarget ?
        Math.min(1, axisGuideAlpha + axisGuideStep) :
        Math.max(0, axisGuideAlpha - axisGuideStep);
    // Keep the guide target through its delay; only clear it once the hold ends
    // and its fade-out has fully completed.
    if (!holdingConstrainedBlock && axisGuideAlpha <= 0.001) {
        axisGuideAlpha = 0;
        axisGuideBlock = null;
    }

    // Advance the level-intro timeline (board zoom + block pop-in). DOM phases
    // (UI slide, move-limit pill) run on their own setTimeouts in startIntro.
    if (csIntro) {
        csIntro.tMs += dtSec * 1000;
        const zp = clampCS(csIntro.tMs / CS_INTRO.DUR_MS, 0, 1);
        csBoardScale = introBounceScale(
            CS_INTRO.BOARD_START_SCALE,
            CS_INTRO.BOARD_END_SCALE,
            CS_INTRO.BOARD_BOUNCE_SCALE,
            zp
        );
        // Per-block cascade: each piece appears above the board, scales up with a
        // slight pitch, hovers briefly, then drops and lands with a tiny bounce.
        for (const b of blocks) {
            const delay = (b.x + b.y) * CS_INTRO.BLOCK_CASCADE_MS;
            const cp = clampCS(
                (csIntro.tMs - CS_INTRO.BLOCK_START_MS - delay) / CS_INTRO.BLOCK_DUR_MS,
                0,
                1
            );
            const pitchSign = b._introPitchSign || (((b.x + b.y) & 1) ? 1 : -1);
            const sample = sampleBlockIntro(
                cp,
                pitchSign,
                b._introTiltSign || 1,
                b._introTiltMul == null ? 1 : b._introTiltMul
            );
            b.introScale = sample.scale;
            b.introLift = sample.lift;
            b.introPitch = sample.pitch;
            b.introTilt = sample.tilt;
            if (cp > 0 && !b._introKicked) {
                b._introKicked = true;
            }
            if (cp >= CS_INTRO.SPAWN_DROP_END && !b._introLanded) {
                b._introLanded = true;
                playSound("drop");
                kickWiggle(b, 0.4);
                b.jiggleVY += 1.1;
                b.jiggleVX += pitchSign * 0.35;
            }
        }
    }

    // Win pan-out: once the level is won (and the intro is finished so it no
    // longer drives the board scale), ease the whole board out slightly and
    // softly orbit it for a gentle "camera lifts and turns" celebration feel.
    if (csLevelDone && !csGameOver && !csIntro) {
        const prevYaw = csWinYaw;
        const prevScale = csBoardScale;
        csBoardScale += (CS_WIN.BOARD_SCALE - csBoardScale) *
            (1 - Math.exp(-CS_WIN.PAN_K * dtSec));
        const targetYaw = CS_WIN.YAW_DEG * Math.PI / 180;
        csWinYaw += (targetYaw - csWinYaw) *
            (1 - Math.exp(-CS_WIN.YAW_K * dtSec));
        // Reframe the ortho camera as yaw/scale settle so rotated corners never clip.
        if (Math.abs(csWinYaw - prevYaw) > 1e-4 || Math.abs(csBoardScale - prevScale) > 1e-4) {
            csResize(true);
        }
    }
    // Advance the win sheen sweep timer (includes the pre-sheen delay).
    if (csSheen.active) {
        csSheen.t += dtSec * 1000;
        if (csSheen.t >= CS_WIN.SHEEN_DELAY_MS + CS_WIN.SHEEN_MS) csSheen.active = false;
    }
    // Cascading happy-face bounce wave (loops with WAVE_LOOP_GAP_MS between passes).
    updateWinWave(dtSec);
    // Advance and retire seam glow bursts.
    if (CS3D.bursts && CS3D.bursts.length) {
        const burstLife = CS3D_CFG.SEAM_LIFE_MS / 1000;
        for (let i = CS3D.bursts.length - 1; i >= 0; i--) {
            CS3D.bursts[i].t += dtSec;
            if (CS3D.bursts[i].t >= burstLife) CS3D.bursts.splice(i, 1);
        }
    }

    for (const b of blocks) {
        if (b.failAnim) {
            updateFailAnim(b, dtSec);
        } else if (b === activeBlock && isDragging && !b.locked) {
            // Free-flow drag: ease the float toward the collision-reachable finger
            // spot (smooth cornering), re-clamp so catch-up cannot cut corners,
            // and press-squish the push past the finger clamp. Render tracks the
            // float directly (a separate render lerp would let the body trail
            // into the corner it is rounding).
            updateDragFollow(b, dtSec);
            b.renderX = dragFloatX;
            b.renderY = dragFloatY;
            b.renderW += (b.w - b.renderW) * smoothW;
            b.renderH += (b.h - b.renderH) * smoothW;
        } else {
            b.renderX += (b.x - b.renderX) * smooth;
            b.renderY += (b.y - b.renderY) * smooth;
            b.renderW += (b.w - b.renderW) * smoothW;
            b.renderH += (b.h - b.renderH) * smoothW;
        }
        const targetScale = (b === activeBlock && isDragging) ? CS.DRAG_SCALE : 1;
        b.renderScale += (targetScale - b.renderScale) * smooth * 1.0;

        // Slime squish while pressing a held block into a blocked neighbour. The
        // target is held while pressing and eases to 0 (plus a spring rebound on
        // release). Only the active, dragged block presses.
        const pressTX = (b === activeBlock && isDragging) ? dragPressX : 0;
        const pressTY = (b === activeBlock && isDragging) ? dragPressY : 0;
        b.pressX += (pressTX - b.pressX) * smooth;
        b.pressY += (pressTY - b.pressY) * smooth;

        // Wobble springs are kicked by logical movement/resizing. During a
        // free-flow drag the block already glides smoothly, so per-cell kicks
        // would read as "bumping" over invisible grid lines — skip them while
        // dragging. Expand/shrink (resize deltas) still kick, giving the pop.
        const dxl = b.x - b.prevX, dyl = b.y - b.prevY;
        const dwl = b.w - b.prevW, dhl = b.h - b.prevH;
        const movedCell = dxl !== 0 || dyl !== 0;
        const dragging = (b === activeBlock && isDragging);
        if (!dragging) {
            if (dxl !== 0 || dwl !== 0) {
                const k = clampCS(dwl + dxl * 0.6, -2, 2);
                b.jiggleVX += k * 1.2;
                b.jiggleVY -= k * 0.7;
            }
            if (dyl !== 0 || dhl !== 0) {
                const k = clampCS(dhl + dyl * 0.6, -2, 2);
                b.jiggleVY += k * 1.2;
                b.jiggleVX -= k * 0.7;
            }
        }
        // Fixed substeps keep stiff jelly springs stable when a hitch stretches
        // dt toward the 100ms cap (Capacitor / low-FPS phones).
        integrateJiggle(b, dtSec);

        // A visible settle envelope is kicked only by an actual cell move, and not
        // during a free-flow drag (which glides continuously).
        if (movedCell && !dragging) b.moveWobble = 1;
        if (b.moveWobble > 0.001) {
            b.moveWobblePhase += dtSec * 15;
            b.moveWobble *= Math.exp(-CS.MOVE_WOBBLE_DECAY * dtSec);
        } else {
            b.moveWobble = 0;
        }

        if (b.failReturnWobbleMs > 0) {
            b.failReturnWobbleMs = Math.max(0, b.failReturnWobbleMs - dtSec * 1000);
            b.failReturnWobblePhase += dtSec * 15;
            const tailProgress = b.failReturnWobbleMs / CS.FAIL_RETURN_WOBBLE_TAIL_MS;
            // Gentler-than-quadratic decay (^1.5) keeps the later oscillations alive
            // so at least one more full bounce cycle stays visible as the force fades.
            b.failReturnWobble = CS.FAIL_RETURN_WOBBLE_STRENGTH * tailProgress * Math.sqrt(tailProgress);
        } else {
            b.failReturnWobble = 0;
        }

        if (b.failReturnSquashMs > 0) {
            b.failReturnSquashMs = Math.max(0, b.failReturnSquashMs - dtSec * 1000);
            const squashProgress = b.failReturnSquashMs / CS.FAIL_RETURN_SQUASH_MS;
            b.failReturnSquash = squashProgress * squashProgress;
            if (b.failReturnSquashMs === 0 && b.failReturnWobblePending) {
                b.jiggleVX += b.failReturnJiggleVX;
                b.jiggleVY += b.failReturnJiggleVY;
                b.failReturnWobbleMs = CS.FAIL_RETURN_WOBBLE_TAIL_MS;
                b.failReturnWobblePhase = 0;
                b.failReturnWobble = CS.FAIL_RETURN_WOBBLE_STRENGTH;
                b.failReturnWobblePending = false;
            }
        } else {
            b.failReturnSquash = 0;
        }

        // "pop" wiggle envelope, kicked on expand/shrink; exponential falloff
        if (b.wiggle > 0.0005) {
            b.wigglePhase += dtSec * CS.POP_FREQ;
            b.wiggle *= Math.exp(-b.wiggleDecay * dtSec);
        } else {
            b.wiggle = 0;
        }

        // Between-block seam glow pulse, kicked on a successful expand; fades out.
        if (b.expandGlow > 0.0005) {
            b.expandGlow *= Math.exp(-CS.EXPAND_GLOW_DECAY * dtSec);
        } else {
            b.expandGlow = 0;
        }
        // Edge sfx: fire exactly once per completed expansion, only after the grow
        // animation has actually settled at the new footprint (not the instant the
        // tap registered).
        if (b._pendingEdgeSfx &&
            Math.abs(b.renderW - b.w) < 0.02 && Math.abs(b.renderH - b.h) < 0.02) {
            b._pendingEdgeSfx = false;
            playEdgeSfx();
        }
        if (b._expandSequenceTimeouts.length &&
            Math.abs(b.renderW - b.w) < 0.02 && Math.abs(b.renderH - b.h) < 0.02) {
            cancelExpandSequence(b);
        }
        b.prevX = b.x; b.prevY = b.y; b.prevW = b.w; b.prevH = b.h;
    }
}

function clampCS(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function updateFailAnim(b, dtSec) {
    const fa = b.failAnim;
    fa.t += dtSec * 1000;
    const growEnd = fa.growMs;
    const holdEnd = growEnd + fa.holdMs;
    const returnEnd = holdEnd + fa.returnMs;
    let e;
    if (fa.t < growEnd) e = fa.t / growEnd;
    else if (fa.t < holdEnd) e = 1;
    else {
        const u = clampCS((fa.t - holdEnd) / fa.returnMs, 0, 1);
        const elastic = Math.pow(1 - u, CS.FAIL_ELASTIC_DECAY) *
            Math.cos(u * Math.PI * 2 * CS.FAIL_ELASTIC_CYCLES);
        if (!fa.kind && (elastic <= 0 || u >= 1)) {
            if (!fa.returnImpactStarted) {
                fa.returnImpactStarted = true;
                const spanX = Math.max(0, fa.pw - b.w);
                const spanY = Math.max(0, fa.ph - b.h);
                b.failReturnSquashX = Math.min(CS.FAIL_RETURN_SQUASH_MAX, spanX * CS.FAIL_RETURN_SQUASH);
                b.failReturnSquashY = Math.min(CS.FAIL_RETURN_SQUASH_MAX, spanY * CS.FAIL_RETURN_SQUASH);
                b.failReturnSquashMs = CS.FAIL_RETURN_SQUASH_MS;
                b.failReturnSquash = 1;
                b.failReturnJiggleVX = spanX * CS.FAIL_RETURN_JIGGLE -
                    spanY * CS.FAIL_RETURN_JIGGLE * 0.6;
                b.failReturnJiggleVY = spanY * CS.FAIL_RETURN_JIGGLE -
                    spanX * CS.FAIL_RETURN_JIGGLE * 0.6;
                b.failReturnWobblePending = true;
            }
            // Stop at the original footprint on first contact. The squash and tail
            // below carry the elastic energy without growing through that footprint.
            e = 0;
        } else {
            e = elastic;
        }
    }
    b.renderW = b.w + (fa.pw - b.w) * e;
    b.renderH = b.h + (fa.ph - b.h) * e;
    b.renderX = b.x + (fa.px - b.x) * e;
    b.renderY = b.y + (fa.py - b.y) * e;

    // horizontal shake at the impact peak
    const shakeWin = fa.t >= CS.FAIL_SHAKE_START_MS &&
        fa.t < CS.FAIL_SHAKE_START_MS + CS.FAIL_SHAKE_DURATION_MS;
    const shakePeriod = fa.kind === "shrink"
        ? CS.FAIL_SHRINK_SHAKE_PERIOD_MS
        : CS.FAIL_SHAKE_PERIOD_MS;
    b.shakeDX = Math.sin(fa.t * Math.PI * 2 / shakePeriod) *
        CS.FAIL_SHAKE_AMPLITUDE * shakeWin;

    // Two quick white flashes as it slams into the blocked state.
    if (fa.t >= CS.FAIL_FLASH_START_MS &&
        fa.t < CS.FAIL_FLASH_START_MS + CS.FAIL_FLASH_DURATION_MS) {
        const u = (fa.t - CS.FAIL_FLASH_START_MS) / CS.FAIL_FLASH_DURATION_MS;
        b.failFlash = Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u) * CS.FAIL_FLASH_PEAK;
    } else {
        b.failFlash = 0;
    }

    // outward bulge pulse on the confined faces while pressed
    const pressWin = fa.t >= CS.FAIL_BULGE_START_MS &&
        fa.t < CS.FAIL_BULGE_START_MS + CS.FAIL_BULGE_DURATION_MS;
    b.failConfine = pressWin * (
        CS.FAIL_BULGE_BASE +
        CS.FAIL_BULGE_PULSE * Math.abs(Math.sin(fa.t * Math.PI / CS.FAIL_BULGE_PULSE_MS))
    );

    if (fa.t >= returnEnd) {
        b.failAnim = null; b.shakeDX = 0; b.failFlash = 0; b.failConfine = 0;
        b.renderW = b.w; b.renderH = b.h; b.renderX = b.x; b.renderY = b.y;
    }
}

// ---- rendering ----
function csFrame(dtMs) {
    if (!csCanvas) return;
    let dt = dtMs / 1000;
    if (dt > 0.1) dt = 0.1;
    csUpdate(dt);
    csDraw();
    updateTutorialOverlay();
    updateHintButton();
}


// ================= Hint system =================
// A block's hint is satisfied the moment its live footprint exactly matches
// its authored solved footprint (position + w x h). Overlays are render-only:
// they never touch grid state, hit-testing, or win accounting.
function hintBlockById(id) {
    return blocks.find((b) => String(b.id) === String(id)) || null;
}

// Colours are visual only, so identical target footprints are interchangeable
// for hints. This lets an equivalent block satisfy a solution slot after the
// player has swapped same-shaped pieces.
function hintBlockMatchingStep(step) {
    const targetSize = step.w * step.h;
    return blocks.find((b) =>
        b.targetSize === targetSize &&
        b.x === step.x && b.y === step.y && b.w === step.w && b.h === step.h
    ) || null;
}

function hintStepSolved(step) {
    return !!hintBlockMatchingStep(step);
}

// When an interchangeable block reaches another solution slot, exchange their
// in-memory IDs. The occupied slot must match exactly, but the other authored
// slot may use a different valid rectangle orientation for the same cell count.
function hintReconcileEquivalentSteps() {
    if (!hintSolution) return;
    for (let pass = 0; pass < hintSolution.length; pass++) {
        let changed = false;
        for (const step of hintSolution) {
            const matchingBlock = hintBlockMatchingStep(step);
            if (!matchingBlock || String(matchingBlock.id) === String(step.id)) continue;
            const matchingStep = hintSolution.find(
                (candidate) => String(candidate.id) === String(matchingBlock.id)
            );
            const assignedBlock = hintBlockById(step.id);
            if (!matchingStep || !assignedBlock ||
                matchingStep.w * matchingStep.h !== matchingBlock.targetSize ||
                assignedBlock.targetSize !== matchingBlock.targetSize) continue;
            const assignedId = step.id;
            step.id = matchingBlock.id;
            matchingStep.id = assignedId;
            changed = true;
        }
        if (!changed) return;
    }
}

// Keep hint borders on exposed edges, but stop precisely at a shared solved
// footprint edge so two active hint panels never overlap.
function hintEdgeMargins(step, stepIndex) {
    const m = CS3D_CFG.HINT_MARGIN;
    const margins = { left: m, right: m, top: m, bottom: m };
    for (const index of activeHints) {
        if (index === stepIndex) continue;
        const other = hintSolution[index];
        if (!other || hintStepSolved(other)) continue;
        const overlapsY = other.y < step.y + step.h && other.y + other.h > step.y;
        const overlapsX = other.x < step.x + step.w && other.x + other.w > step.x;
        if (overlapsY && other.x + other.w === step.x) margins.left = 0;
        if (overlapsY && other.x === step.x + step.w) margins.right = 0;
        if (overlapsX && other.y + other.h === step.y) margins.top = 0;
        if (overlapsX && other.y === step.y + step.h) margins.bottom = 0;
    }
    return margins;
}

// Keep revealed hints active for the entire attempt. A solved target is hidden
// temporarily, then automatically reappears if its block is moved away again.
// Press budget is Inventory.getHints() (persisted across sessions).

function hintLoadLevel(levelNum, data) {
    activeHints = [];
    if (CS3D.hintMeshes) {
        for (const m of CS3D.hintMeshes) { if (m) m.visible = false; }
    }
    hintSolution = Array.isArray(data.solution) && data.solution.length
        ? data.solution.map((s) => ({
            id: s.id, x: s.x, y: s.y, w: s.w, h: s.h,
        }))
        : null;
    updateHintButton();
}

// Kept as a no-op so fail flow call sites stay stable; inventory is not fail-gated.
function hintOnFail() {}

// Number of authored steps not yet solved and not already revealed.
function hintRemainingRevealable() {
    if (!hintSolution) return 0;
    hintReconcileEquivalentSteps();
    let n = 0;
    for (let i = 0; i < hintSolution.length; i++) {
        if (activeHints.indexOf(i) === -1 && !hintStepSolved(hintSolution[i])) n++;
    }
    return n;
}

function updateHintButton() {
    if (!csHintBtn) return;
    // Always after the configured unlock level when the level has solution data;
    // never while a blocking tutorial (except its own focused hint tutorial),
    // intro, result overlay, or win/lose flow is on screen.
    const overlayShown = overlay && overlay.classList.contains("show");
    // Level and failed-expansion reminders do not block gameplay, so they must
    // not suppress the hint button. Focused tutorials still take priority.
    const tutorialAllowsHint = !csTutorial ||
        csTutorial.phase === "hint" || csTutorial.phase === "level-reminder";
    const baseReady = hintButtonReady && tutorialAllowsHint && !csIntro &&
        !csLevelDone && !csGameOver && !overlayShown;

    // Pre-unlock: show locked bulb on levels 2–4 (unlock at 5) — SP-1045.
    if (baseReady && hintButtonLockedPreview()) {
        const wasHidden = csHintBtn.hidden;
        csHintBtn.hidden = false;
        csHintBtn.classList.remove("is-empty");
        csHintBtn.classList.add("is-locked");
        csHintBtn.disabled = false;
        if (csHintCount) csHintCount.textContent = "";
        const hintLabel = (typeof t === "function" ? t("hintButton") : null) || "Hint";
        csHintBtn.setAttribute("aria-label", hintLabel);
        if (wasHidden) {
            requestAnimationFrame(() => {
                if (!csHintBtn.hidden) csHintBtn.classList.add("is-visible");
            });
        } else {
            csHintBtn.classList.add("is-visible");
        }
        return;
    }

    const eligible = hintSolution && hintButtonUnlocked() && baseReady;
    if (!eligible) {
        csHintBtn.classList.remove("is-visible", "is-empty", "is-locked");
        csHintBtn.hidden = true;
        return;
    }
    const wasHidden = csHintBtn.hidden;
    const hintsLeft = inventoryHintCount();
    const revealable = hintRemainingRevealable() > 0;
    csHintBtn.hidden = false;
    csHintBtn.classList.remove("is-locked");
    csHintBtn.classList.toggle("is-empty", hintsLeft <= 0);
    if (csHintCount) {
        csHintCount.textContent = hintsLeft <= 0 ? "+" : String(hintsLeft);
    }
    const hintLabel = (typeof t === "function" ? t("hintButton") : null) || "Hint";
    csHintBtn.setAttribute(
        "aria-label",
        hintsLeft <= 0 ? `${hintLabel}, +` : `${hintLabel}, ${hintsLeft}`
    );
    csHintBtn.style.removeProperty("--cs-hint-empty-opacity");
    if (wasHidden) {
        requestAnimationFrame(() => {
            if (!csHintBtn.hidden) csHintBtn.classList.add("is-visible");
        });
    } else {
        csHintBtn.classList.add("is-visible");
    }
    // Empty inventory stays clickable so the Add Hint RV offer can open.
    csHintBtn.disabled = !revealable;
    if (hintsLeft > 0 && revealable) queueHintTutorial();
}

/**
 * After an RV grants hints:
 *  1) Burst +1 chips out of `opts.originEl` (Add Hint popup prize)
 *  2) Hold while they hang
 *  3) `opts.onBurstHoldDone` closes the popup
 *  4) Lerp each chip down into the hint button; pulse + count on land
 * Inventory should already include the grant before calling.
 * @returns {Promise<void>}
 */
function playHintGrantBurst(amount, opts) {
    opts = opts || {};
    const n = Math.max(0, amount | 0);
    if (!csHintBtn || n <= 0) {
        updateHintButton();
        if (typeof opts.onBurstHoldDone === "function") opts.onBurstHoldDone();
        return Promise.resolve();
    }

    const app = csHintBtn.closest(".app") || document.body;
    const finalCount = inventoryHintCount();
    const startCount = Math.max(0, finalCount - n);
    let visual = startCount;

    csHintBtn.hidden = false;
    csHintBtn.classList.add("is-visible");
    csHintBtn.classList.toggle("is-empty", visual <= 0);
    csHintBtn.disabled = true;
    if (csHintCount) csHintCount.textContent = visual <= 0 ? "+" : String(visual);

    const prefersReduced = (() => {
        try {
            return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        } catch (_) {
            return false;
        }
    })();

    if (prefersReduced) {
        if (typeof opts.onBurstHoldDone === "function") opts.onBurstHoldDone();
        updateHintButton();
        return Promise.resolve();
    }

    const appRect = () => app.getBoundingClientRect();
    const originOf = (el) => {
        const a = appRect();
        if (el && el.getBoundingClientRect) {
            const r = el.getBoundingClientRect();
            return {
                x: r.left - a.left + r.width / 2,
                y: r.top - a.top + r.height / 2
            };
        }
        return { x: a.width * 0.5, y: a.height * 0.42 };
    };
    const targetOf = () => {
        const a = appRect();
        const b = csHintBtn.getBoundingClientRect();
        return {
            x: b.left - a.left + b.width * 0.72,
            y: b.top - a.top + b.height * 0.18
        };
    };

    const origin = originOf(opts.originEl);
    const holdMs = opts.holdMs != null ? Math.max(0, opts.holdMs) : 480;
    const burstMs = 460;
    const flyMs = 640;
    const chips = [];

    for (let i = 0; i < n; i++) {
        const fan = (i - (n - 1) / 2) * 0.7;
        const angle = -Math.PI / 2 + fan;
        const dist = 88 + Math.abs(fan) * 22;
        chips.push({
            midX: origin.x + Math.cos(angle) * dist,
            midY: origin.y + Math.sin(angle) * dist - 12,
            delay: i * 70
        });
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function runAnim(el, keyframes, duration, delay) {
        const anim = el.animate(keyframes, {
            duration: duration,
            delay: delay || 0,
            easing: "cubic-bezier(0.18, 0.85, 0.25, 1)",
            fill: "forwards"
        });
        if (anim && anim.finished && typeof anim.finished.then === "function") {
            return anim.finished.catch(() => {});
        }
        return wait((delay || 0) + duration);
    }

    function pulseLand() {
        visual += 1;
        csHintBtn.classList.remove("is-empty");
        if (csHintCount) csHintCount.textContent = String(visual);
        csHintBtn.classList.remove("is-grant-pulse");
        void csHintBtn.offsetWidth;
        csHintBtn.classList.add("is-grant-pulse");
        if (typeof playSound === "function") {
            playSound("expand_" + Math.min(11, visual - startCount));
        }
        if (typeof haptic === "function") haptic("tap");
    }

    const chipEls = chips.map((spec) => {
        const chip = document.createElement("span");
        chip.className = "cs-hint-fly";
        chip.textContent = "+1";
        chip.setAttribute("aria-hidden", "true");
        chip.style.left = "0";
        chip.style.top = "0";
        chip.style.transform = `translate(${origin.x}px, ${origin.y}px) translate(-50%, -50%) scale(0.2)`;
        chip.style.opacity = "0";
        app.appendChild(chip);
        return { el: chip, spec: spec };
    });

    // Phase 1 — explode out of the popup prize and hold.
    const burstPromises = chipEls.map(({ el, spec }) => runAnim(
        el,
        [
            {
                transform: `translate(${origin.x}px, ${origin.y}px) translate(-50%, -50%) scale(0.2)`,
                opacity: 0
            },
            {
                transform: `translate(${spec.midX}px, ${spec.midY}px) translate(-50%, -50%) scale(1.45)`,
                opacity: 1,
                offset: 0.55
            },
            {
                transform: `translate(${spec.midX}px, ${spec.midY}px) translate(-50%, -50%) scale(1.15)`,
                opacity: 1
            }
        ],
        burstMs,
        spec.delay
    ));

    return Promise.all(burstPromises)
        .then(() => wait(holdMs))
        .then(() => {
            const maybe = typeof opts.onBurstHoldDone === "function" ? opts.onBurstHoldDone() : null;
            if (maybe && typeof maybe.then === "function") return maybe;
            return null;
        })
        .then(() => wait(30))
        .then(() => {
            const end = targetOf();
            let landed = 0;
            const flyPromises = chipEls.map(({ el, spec }, i) => {
                // Read whatever transform the burst left us on (mid hold pose).
                return runAnim(
                    el,
                    [
                        {
                            transform: `translate(${spec.midX}px, ${spec.midY}px) translate(-50%, -50%) scale(1.15)`,
                            opacity: 1
                        },
                        {
                            transform: `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) scale(0.65)`,
                            opacity: 1,
                            offset: 0.9
                        },
                        {
                            transform: `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) scale(0.15)`,
                            opacity: 0
                        }
                    ],
                    flyMs,
                    i * 90
                ).then(() => {
                    el.remove();
                    landed += 1;
                    pulseLand();
                });
            });
            return Promise.all(flyPromises).then(() => {
                csHintBtn.classList.remove("is-grant-pulse");
                updateHintButton();
            });
        })
        .catch(() => {
            chipEls.forEach(({ el }) => { try { el.remove(); } catch (_) { /* ignore */ } });
            if (typeof opts.onBurstHoldDone === "function") opts.onBurstHoldDone();
            updateHintButton();
        });
}
window.playHintGrantBurst = playHintGrantBurst;

function showHintLockedToast() {
    if (!csHintBtn) return;
    clearLockedToasts();
    const app = csHintBtn.closest(".app") || document.body;
    const rect = csHintBtn.getBoundingClientRect();
    const appRect = app.getBoundingClientRect();
    const toast = document.createElement("span");
    toast.className = "locked-toast";
    toast.textContent = (typeof t === "function" ? t("keepPlaying") : null) || "Keep playing to unlock";
    toast.style.top = (rect.top - appRect.top - 8) + "px";
    app.appendChild(toast);
    const tw = toast.offsetWidth;
    const centre = rect.left - appRect.left + rect.width / 2;
    const left = Math.max(8, Math.min(appRect.width - tw - 8, centre - tw / 2));
    toast.style.left = left + "px";
    toast.addEventListener("animationend", () => toast.remove());
}

function onHintPress() {
    if (hintFeatureIntroOpen) return false;
    if (csHintBtn && csHintBtn.classList.contains("is-locked")) {
        if (typeof sfxClick === "function") sfxClick();
        else if (typeof haptic === "function") haptic("tap");
        showHintLockedToast();
        return false;
    }
    if (!hintSolution) return false;
    if (inventoryHintCount() <= 0) {
        if (window.AdOffers && typeof AdOffers.showAddHint === "function") {
            if (typeof sfxClick === "function") sfxClick();
            AdOffers.showAddHint();
        }
        return false;
    }
    hintReconcileEquivalentSteps();
    let nextHintIndex = -1;
    for (let i = 0; i < hintSolution.length; i++) {
        if (activeHints.indexOf(i) !== -1 || hintStepSolved(hintSolution[i])) continue;
        nextHintIndex = i;
        break;
    }
    if (nextHintIndex === -1) return false;
    if (!(window.Inventory && Inventory.tryConsumeHint())) return false;
    if (typeof game_action === "function") game_action("hint_used", JSON.stringify({}));

    if (csTutorial && csTutorial.phase === "hint") {
        completeHintTutorial();
        hideTutorial();
        // Resume any normal level/mechanic onboarding that the hint tutorial took
        // precedence over, after its fade has released the full-screen dimmer.
        setTimeout(() => {
            if (!csTutorial && !csLevelDone && !csGameOver) startLevelTutorial();
        }, 250);
    }
    activeHints.push(nextHintIndex);
    startTimer();
    haptic("tap");
    sfxClick();
    csHintBtn.classList.remove("is-pressed");
    void csHintBtn.offsetWidth;
    csHintBtn.classList.add("is-pressed");
    updateHintButton();
    return true;
}

/** Resume play after a Times Up rewarded +N seconds grant. */
function grantExtraSeconds(seconds) {
    const add = Math.max(0, Number(seconds) || 0);
    csGameOver = false;
    timeRemaining = Math.max(0, timeRemaining) + add;
    timerRunning = true;
    timerLastTickMs = performance.now();
    updateHUD();
    syncInGameSettingsAvailability();
}
window.grantExtraSeconds = grantExtraSeconds;

if (hintFeatureClaim) {
    hintFeatureClaim.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!hintFeatureIntroOpen) return;
        if (typeof sfxClick === "function") sfxClick();
        hideHintFeatureIntro();
        beginHintFingerTutorial();
    });
}


// KPF per-frame hook — drives the Color Stretch engine.


window.CSApp = window.CSApp || {};
window.CSApp.sim = {
    init: typeof csInit === "function" ? csInit : null,
    loadLevel: typeof csLoadLevel === "function" ? csLoadLevel : null,
    update: typeof csUpdate === "function" ? csUpdate : null,
    frame: typeof csFrame === "function" ? csFrame : null,
};
if (window.CSApp.render) {
    window.CSApp.render.blockAt = typeof getBlockAt === "function" ? getBlockAt : null;
    window.CSApp.render.cellAt = typeof cs3dCellAt === "function" ? cs3dCellAt : null;
}
