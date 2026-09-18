// OWNER: shared (KPF) — storage, audio, screens, lifecycle. Change carefully.
"use strict";

// ════════════════════════════════════════════════════════════════
// TEMPLATE CONTRACT — See ARCHITECTURE.md
// Public lifecycle hooks live in index.html for analytics injection:
//   startGame, levelComplete, levelFailed, contentCompleted
// Implementations are on window.KPFApp. Do not rename the index.html hooks.
// Required state: level (exposed on window for injected track* calls).
// ════════════════════════════════════════════════════════════════

const startScreen = document.getElementById("startScreen");
const gameScreen  = document.getElementById("gameScreen");
const splashScreen  = document.getElementById("splashScreen");
const splashLogo    = document.getElementById("splashLogo");
const splashContent = document.querySelector(".splash-content");
const splashBarFill = document.getElementById("splashBarFill");
const splashBarLabel = document.getElementById("splashBarLabel");
const playBtn     = document.getElementById("playBtn");
const playLevel   = document.getElementById("playLevel");
const gameHeader  = document.getElementById("gameHeader");
const flavourText = document.getElementById("flavourText");
const flavourLabel = document.getElementById("flavourLabel");
const failText    = document.getElementById("failText");

const overlay        = document.getElementById("overlay");
const overlayCard    = document.getElementById("overlayCard");
const overlayTitle   = document.getElementById("overlayTitle");
const overlayPercentile = document.getElementById("overlayPercentile");
const overlaySubtitle= document.getElementById("overlaySubtitle");
const overlayBtn     = document.getElementById("overlayBtn");
const overlayProgress = document.getElementById("overlayProgress");
const overlayBoardSlot = document.getElementById("overlayBoardSlot");

const debugWin  = document.getElementById("debugWin");
const debugFail = document.getElementById("debugFail");
const debugProgress = document.getElementById("debugProgress");
const debugLang = document.getElementById("debugLang");
const debugPanel = document.getElementById("debugPanel");
const debugToggle = document.getElementById("debugToggle");
const debugLevelInput = document.getElementById("debugLevelInput");
const debugSkipLevel = document.getElementById("debugSkipLevel");
const debugStreakInput = document.getElementById("debugStreakInput");
const debugSetStreak = document.getElementById("debugSetStreak");
const debugStreakAdvance = document.getElementById("debugStreakAdvance");
const debugRewardFlow = document.getElementById("debugRewardFlow");
const debugReset = document.getElementById("debugReset");

// Only show the debug panel if we are in a debug build, or running locally in a browser
// kwAnalytics is injected by the app. If it's not present, we assume local dev and show debug tools.
if (typeof kwAnalytics !== "undefined" && !kwAnalytics.isDebug) {
    debugPanel.style.display = "none";
}

const settingsBtnStart = document.getElementById("settingsBtnStart");
const settingsBtnGame  = document.getElementById("settingsBtnGame");
const backBtnGame      = document.getElementById("backBtnGame");
const settingsOverlay  = document.getElementById("settingsOverlay");
const settingsClose    = document.getElementById("settingsClose");
const settingsQuit     = document.getElementById("settingsQuit");
const quitConfirm      = document.getElementById("quitConfirm");
const quitYes          = document.getElementById("quitYes");
const quitNo           = document.getElementById("quitNo");

const confettiCanvas = document.getElementById("confetti");
const cctx = confettiCanvas.getContext("2d");
const CONFETTI = {
    PARTICLE_COUNT: 96, // bounded pool sized for mobile rendering
    SPAWN_Y: -16,
    DESPAWN_PAD: 20,
};
let confettiParticles = [];
let confettiRAF = null;

const fireworksCanvas = document.getElementById("fireworks");
const fwctx = fireworksCanvas.getContext("2d");
let fwRockets = [];
let fwParticles = [];
let fireworksRAF = null;
let completeTimer = null;
let fadeTimer = null;

const fadeBlack = document.getElementById("fadeBlack");

// Per-game storage namespace. Set GAME_ID_OVERRIDE for an explicit unique id.
// Fallback derives an id from the page path plus a stable hash.
const GAME_ID_OVERRIDE = "stretchblock";

function sanitizeGameId(raw) {
    return String(raw || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function hash32(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}

function resolveGameId() {
    const override = sanitizeGameId(GAME_ID_OVERRIDE || (window.GAME_ID || ""));
    if (override) return override;
    const path = (location.pathname || "game").toLowerCase();
    const leaf = sanitizeGameId(path.split("/").filter(Boolean).pop() || "game").replace(/\.html$/, "");
    return (leaf || "game") + "-" + hash32(path);
}

const GAME_ID = resolveGameId();
const STORAGE_KEYS = {
    level: GAME_ID + "_level",
    mixer: GAME_ID + "_mixer",
    settings: GAME_ID + "_settings",
    mechanicTutorials: GAME_ID + "_mechanic_tutorials",
    hintTutorial: GAME_ID + "_hint_tutorial",
    failedExpansionTutorial: GAME_ID + "_failed_expansion_tutorial",
};

// `level` must be readable as a global for analytics hooks injected into
// index.html (trackLevelStart(level) / trackLevelComplete(level)).
let level = parseInt(localStorage.getItem(STORAGE_KEYS.level), 10) || 1;
Object.defineProperty(window, "level", {
    get() { return level; },
    set(v) { level = Math.max(1, parseInt(v, 10) || 1); },
    configurable: true
});
const completedMechanicTutorials = new Set(
    (localStorage.getItem(STORAGE_KEYS.mechanicTutorials) || "")
        .split(",")
        .filter((kind) => ["arrow", "locked", "fixed"].includes(kind))
);
let completedHintTutorial = localStorage.getItem(STORAGE_KEYS.hintTutorial) === "1";
let completedFailedExpansionTutorial =
    localStorage.getItem(STORAGE_KEYS.failedExpansionTutorial) === "1";

function saveProgress() {
    localStorage.setItem(STORAGE_KEYS.level, level);
}

const PLAYER_SETTINGS_DEFAULTS = { music: true, sound: true, haptics: true };

function loadPlayerSettings() {
    const saved = localStorage.getItem(STORAGE_KEYS.settings);
    if (!saved) return { ...PLAYER_SETTINGS_DEFAULTS };
    try {
        const parsed = JSON.parse(saved);
        return {
            music: typeof parsed.music === "boolean" ? parsed.music : PLAYER_SETTINGS_DEFAULTS.music,
            sound: typeof parsed.sound === "boolean" ? parsed.sound : PLAYER_SETTINGS_DEFAULTS.sound,
            haptics: typeof parsed.haptics === "boolean" ? parsed.haptics : PLAYER_SETTINGS_DEFAULTS.haptics,
        };
    } catch (error) {
        console.warn("Ignoring invalid saved player settings.", error);
        return { ...PLAYER_SETTINGS_DEFAULTS };
    }
}

const playerSettings = loadPlayerSettings();

function savePlayerSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(playerSettings));
}

function saveMechanicTutorials() {
    localStorage.setItem(
        STORAGE_KEYS.mechanicTutorials,
        Array.from(completedMechanicTutorials).join(",")
    );
}

function completeHintTutorial() {
    completedHintTutorial = true;
    localStorage.setItem(STORAGE_KEYS.hintTutorial, "1");
}

function completeFailedExpansionTutorial() {
    completedFailedExpansionTutorial = true;
    localStorage.setItem(STORAGE_KEYS.failedExpansionTutorial, "1");
}

// ---------- Capacitor Edge-to-Edge ----------
// Removes status bar / navigation bar gaps on Android/iOS APK builds.
// Requires @capacitor/status-bar plugin installed in the Capacitor project.
// The CSS already uses env(safe-area-inset-*) and viewport-fit=cover to
// inset content away from notches/home indicators once overlay mode is active.
(function initEdgeToEdge() {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;
    const { StatusBar } = window.Capacitor.Plugins;
    if (StatusBar) {
        StatusBar.setOverlaysWebView({ overlay: true });
        StatusBar.setBackgroundColor({ color: "#00000000" });
        StatusBar.setStyle({ style: "LIGHT" });
    }
})();

// ---------- Haptics ----------
// Call haptic(type) on any meaningful interaction. Gameplay-specific types
// retain the same KPF settings guard and native/browser fallbacks.
// Respects the settings toggle. No-ops on unsupported devices.
// Uses Capacitor Haptics plugin when available (APK builds), falls back to Vibration API.
const toggleHaptics = document.getElementById("toggleHaptics");
const HAPTIC_PATTERNS = {
    tap:     [5],
    success: [30, 50, 60, 50, 100],
    error:   [80, 40, 80],
    heavy:   [40],
    resize:  [150],
    blocked: [15, 145, 15, 145, 15, 145, 15]
};

// Capacitor Haptics mapping
const _capHaptics = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
function capSoftBuzz() {
    const pulse = () => {
        if (playerSettings.haptics) _capHaptics.impact({ style: "Light" });
    };
    pulse();
    setTimeout(pulse, 165);
    setTimeout(pulse, 330);
    setTimeout(pulse, 495);
}
const _CAP_MAP = {
    tap:     () => _capHaptics.impact({ style: "Light" }),
    success: () => _capHaptics.notification({ type: "SUCCESS" }),
    error:   () => _capHaptics.notification({ type: "ERROR" }),
    heavy:   () => _capHaptics.impact({ style: "Heavy" }),
    resize:  () => _capHaptics.impact({ style: "Light" }),
    blocked: capSoftBuzz
};

function haptic(type) {
    if (!playerSettings.haptics) return;
    if (_capHaptics) {
        (_CAP_MAP[type] || _CAP_MAP.tap)();
        return;
    }
    if (!navigator.vibrate) return;
    navigator.vibrate(HAPTIC_PATTERNS[type] || [10]);
}

// ---------- Audio Engine (Web Audio API) ----------
// Sound registry: add entries as { name: "path/to/file.mp3" }.
// Routing: filenames containing "bgm" → Music channel; everything else → SFX.
const AUDIO_FILES = {
    // Key names containing "bgm" route to Music channel; all others route to SFX.
    sfx_button:        "AUDIO_FILES/KPF SFX button.wav",
    sfx_toggle:        "AUDIO_FILES/KPF SFX ToggleButton.wav",
    sfx_levelfail:     "AUDIO_FILES/KPF SFX levelFail.wav",
    sfx_welldone:      "AUDIO_FILES/KPF SFX WelldoneTxt.wav",
    sfx_levelcomplete: "AUDIO_FILES/KPF SFX LevelComplete.wav",
    sfx_popup:         "AUDIO_FILES/KPF SFX Popup.wav",
    bgm_gameplay:      "AUDIO_FILES/STRETCH BLOCK BGM.wav",
    // Sampled drop (replaces the old synthesized drop click).
    drop:              "AUDIO_FILES/drop/drop sfx .wav",

    // Staggered per-cell expand/shrink sequence (played ascending on expand,
    // descending on shrink). Full static paths so build-time asset resolution
    // picks them up (constructed strings are not detected on this host).
    expand_1:  "AUDIO_FILES/expand shrink/expnad sfx 1.wav",
    expand_2:  "AUDIO_FILES/expand shrink/expnad sfx 2.wav",
    expand_3:  "AUDIO_FILES/expand shrink/expnad sfx 3.wav",
    expand_4:  "AUDIO_FILES/expand shrink/expnad sfx 4.wav",
    expand_5:  "AUDIO_FILES/expand shrink/expnad sfx 5.wav",
    expand_6:  "AUDIO_FILES/expand shrink/expnad sfx 6.wav",
    expand_7:  "AUDIO_FILES/expand shrink/expnad sfx 7.wav",
    expand_8:  "AUDIO_FILES/expand shrink/expnad sfx 8.wav",
    expand_9:  "AUDIO_FILES/expand shrink/expnad sfx 9.wav",
    expand_10: "AUDIO_FILES/expand shrink/expnad sfx 10.wav",
    expand_11: "AUDIO_FILES/expand shrink/expnad sfx 11.wav",

    // Cycled once per completed expansion.
    edge_1: "AUDIO_FILES/edge/edge sfx 1.wav",
    edge_2: "AUDIO_FILES/edge/edge sfx 2.wav",
    edge_3: "AUDIO_FILES/edge/edge sfx 3.wav",
    edge_4: "AUDIO_FILES/edge/edge sfx 4.wav",

    // Played at random on a blocked (can't expand/shrink) bounce.
    blocking_1: "AUDIO_FILES/block new /nonMovableBlockNewsfx 1.wav",
    blocking_2: "AUDIO_FILES/block new /nonMovableBlockNewsfx 2.wav",

    sfx_streakpopup: "AUDIO_FILES/NewFeature/stretchblockStreakPopup.wav",
    sfx_streakunlocked: "AUDIO_FILES/NewFeature/stretchblockStreakUnlocked.wav",
    sfx_giftboxmovement: "AUDIO_FILES/NewFeature/stretchblockGiftboxMovement.wav",
    sfx_giftboxunlock: "AUDIO_FILES/NewFeature/stretchblockGiftboxUnlock.wav",
    sfx_newfeaturepopup: "AUDIO_FILES/NewFeature/stretchblockNewFeaturePopup.wav",
    sfx_barmovement: "AUDIO_FILES/NewFeature/stretchblockbarMovement.wav",
};
const GAMEPLAY_BGM = "bgm_gameplay";

const toggleMusic = document.getElementById("toggleMusic");
const toggleSound = document.getElementById("toggleSound");
toggleMusic.checked = playerSettings.music;
toggleSound.checked = playerSettings.sound;
toggleHaptics.checked = playerSettings.haptics;

let _actx = null;
let _audioLifecycle = Promise.resolve();
function getAudioContext() {
    if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
    return _actx;
}

function setAudioContextSuspended(suspended) {
    _audioLifecycle = _audioLifecycle.then(() => {
        if (!_actx) return;
        if (suspended && _actx.state === "running") return _actx.suspend();
        if (!suspended && _actx.state === "suspended") return _actx.resume();
    }).catch(() => {
        // Browsers may require a gesture to resume; pointerdown retries below.
    });
}

document.addEventListener("visibilitychange", () => {
    if (window.Ads && Ads.isAdShowing()) return;
    setAudioContextSuspended(document.hidden);
});
window.addEventListener("pagehide", () => setAudioContextSuspended(true));
window.addEventListener("pageshow", () => {
    if (!document.hidden) setAudioContextSuspended(false);
});

// Resume context on first user gesture, including after a gesture-blocked return.
document.addEventListener("pointerdown", () => {
    setAudioContextSuspended(false);
}, { once: false });

// Decoded buffers cache. `null` = permanent failure after retries.
// In-flight loads live in `_loading` — never write a null sentinel while
// fetching, or playSound treats "still loading" as "failed" and drops the play
// (common on device for the larger NewFeature reward WAVs).
const _buffers = {};
const _loading = {};
const AUDIO_LOAD_MAX_ATTEMPTS = 3;

async function loadAudio(name) {
    if (_buffers[name] !== undefined) return _buffers[name]; // null = failed
    if (_loading[name]) return _loading[name];
    _loading[name] = (async () => {
        const ctx = getAudioContext();
        let lastError = null;
        for (let attempt = 1; attempt <= AUDIO_LOAD_MAX_ATTEMPTS; attempt++) {
            try {
                const resp = await fetch(encodeURI(AUDIO_FILES[name]));
                if (!resp.ok) throw new Error(resp.status + " " + resp.statusText);
                const arrayBuf = await resp.arrayBuffer();
                // slice(0): some WebViews detach the buffer during decode.
                _buffers[name] = await ctx.decodeAudioData(arrayBuf.slice(0));
                return _buffers[name];
            } catch (e) {
                lastError = e;
                console.warn("[Audio] Failed to load", name, `(attempt ${attempt})`, e);
            }
        }
        // Large NewFeature WAVs can fail decode once on device — only treat as
        // permanent after retries (SP-1058).
        console.warn("[Audio] Giving up on", name, lastError);
        _buffers[name] = null;
        return null;
    })().finally(() => {
        delete _loading[name];
    });
    return _loading[name];
}

function preloadAllAudio() {
    Object.keys(AUDIO_FILES).forEach(loadAudio);
}

// Channel routing: key or path containing "bgm" → music, else → sfx
function getChannel(name) {
    const key = String(name || "").toLowerCase();
    const path = String((AUDIO_FILES[name] || "")).toLowerCase();
    return (key.includes("bgm") || path.includes("bgm")) ? "music" : "sfx";
}

// Mixer state
const _soundVolumeDefaults = {
    sfx_button: 58,
    sfx_toggle: 58,
    sfx_popup: 58,
};
function defaultSoundVolume(name) {
    return _soundVolumeDefaults[name] ?? 100;
}
// Fixed output trim applied on top of the mixer volume, independent of the mixer default/UI.
const _baseGainMultipliers = {
    blocking_1: 0.5,
    blocking_2: 0.5,
    sfx_streakpopup: 0.9,
};
function baseGainMultiplier(name) {
    return _baseGainMultipliers[name] ?? 1;
}
const _mixerDefaults = { master: 302, sfx: 100, music: 70, sfxMute: false, sfxSolo: false, musicMute: false, musicSolo: false, sounds: {} };
let _mixer = JSON.parse(JSON.stringify(_mixerDefaults));
const _savedMixer = localStorage.getItem(STORAGE_KEYS.mixer);
if (_savedMixer) {
    try { Object.assign(_mixer, JSON.parse(_savedMixer)); } catch(e) {}
}

// Gain nodes
let _masterGain = null;
let _sfxGain = null;
let _musicGain = null;
let _meterInput = null; // for loudness meter

function ensureGainGraph() {
    if (_masterGain) return;
    const ctx = getAudioContext();
    _masterGain = ctx.createGain();
    _sfxGain = ctx.createGain();
    _musicGain = ctx.createGain();
    _sfxGain.connect(_masterGain);
    _musicGain.connect(_masterGain);
    _masterGain.connect(ctx.destination);
    // Meter tap (parallel)
    _meterInput = ctx.createGain();
    _meterInput.gain.value = 1;
    _masterGain.connect(_meterInput);
    applyMixerGains();
}

function applyMixerGains() {
    if (!_masterGain) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    _masterGain.gain.setTargetAtTime(_mixer.master / 100, now, 0.02);

    // Solo logic: if any channel is soloed, others are silenced
    const anySolo = _mixer.sfxSolo || _mixer.musicSolo;
    let sfxVol = _mixer.sfxMute ? 0 : _mixer.sfx / 100;
    let musicVol = _mixer.musicMute ? 0 : _mixer.music / 100;
    if (anySolo) {
        if (!_mixer.sfxSolo) sfxVol = 0;
        if (!_mixer.musicSolo) musicVol = 0;
    }
    // Settings toggles
    if (!playerSettings.sound) sfxVol = 0;
    if (!playerSettings.music) musicVol = 0;

    _sfxGain.gain.setTargetAtTime(sfxVol, now, 0.02);
    _musicGain.gain.setTargetAtTime(musicVol, now, 0.02);

    // Per-sound gains
    _activeInstances.forEach(inst => {
        if (!inst.gainNode) return;
        if (inst.fadingOut) return;
        const snd = _mixer.sounds[inst.name] || {};
        const sndMute = snd.mute || false;
        const sndSolo = snd.solo || false;
        let vol = (snd.volume !== undefined ? snd.volume : defaultSoundVolume(inst.name)) / 100 * baseGainMultiplier(inst.name);
        if (sndMute) vol = 0;
        // Per-sound solo: if any in the same channel is soloed, silence non-soloed
        const ch = getChannel(inst.name);
        const channelSounds = Object.keys(AUDIO_FILES).filter(n => getChannel(n) === ch);
        const anySndsolo = channelSounds.some(n => (_mixer.sounds[n] || {}).solo);
        if (anySndsolo && !sndSolo) vol = 0;
        inst.gainNode.gain.setTargetAtTime(vol, now, 0.02);
        // Live loop update
        if (inst.name !== GAMEPLAY_BGM && inst.source && inst.source.loop !== undefined) {
            inst.source.loop = snd.loop !== undefined ? snd.loop : inst.loop;
        }
    });
}

// Active sound instances (for live updates)
const _activeInstances = [];

function playSound(name, { loop = false } = {}) {
    if (!AUDIO_FILES[name]) return null;
    if (getChannel(name) === "music" ? !playerSettings.music : !playerSettings.sound) {
        return null;
    }
    const ctx = getAudioContext();
    ensureGainGraph();
    // Mobile WebViews often leave the context suspended until a gesture; resume
    // on every play so delayed reward SFX (post-gesture timers) still hear.
    if (ctx.state === "suspended") ctx.resume();
    const buffer = _buffers[name];
    if (buffer === null) return null; // permanent failure — do not retry
    // undefined = not loaded yet (or still in flight via `_loading`).
    if (buffer === undefined) {
        loadAudio(name).then(buf => { if (buf) playSound(name, { loop }); });
        return null;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const sndSettings = _mixer.sounds[name] || {};
    source.loop = name === GAMEPLAY_BGM || (sndSettings.loop !== undefined ? sndSettings.loop : loop);
    const gainNode = ctx.createGain();
    const vol = (sndSettings.volume !== undefined ? sndSettings.volume : defaultSoundVolume(name)) / 100 * baseGainMultiplier(name);
    gainNode.gain.value = sndSettings.mute ? 0 : vol;
    source.connect(gainNode);
    const ch = getChannel(name);
    gainNode.connect(ch === "music" ? _musicGain : _sfxGain);
    source.start();
    const inst = { name, source, gainNode, loop: source.loop };
    _activeInstances.push(inst);
    source.onended = () => {
        const idx = _activeInstances.indexOf(inst);
        if (idx !== -1) _activeInstances.splice(idx, 1);
    };
    return inst;
}

function stopSound(inst) {
    if (!inst || !inst.source) return;
    try { inst.source.stop(); } catch(e) {}
}

// ---------- Background Audio ----------
let _bgInstances = [];
let _bgPlaying = false;

async function playBackgroundAudio() {
    if (_bgPlaying || !playerSettings.music) return;
    _bgPlaying = true;
    const ctx = getAudioContext();
    await ctx.resume();
    ensureGainGraph();
    for (const name of Object.keys(AUDIO_FILES)) {
        if (getChannel(name) === "music") {
            await loadAudio(name);
            if (!_bgPlaying) return;
            const inst = playSound(name, { loop: true });
            if (inst) _bgInstances.push(inst);
        }
    }
}

function stopBackgroundAudio() {
    _bgPlaying = false;
    _bgInstances.forEach(stopSound);
    _bgInstances = [];
}

function fadeBackgroundAudio(duration = 1.2) {
    _bgPlaying = false;
    const ctx = getAudioContext();
    const fadeEnd = ctx.currentTime + duration;
    const instances = _bgInstances;
    _bgInstances = [];
    instances.forEach((inst) => {
        if (!inst || !inst.gainNode || !inst.source) return;
        inst.fadingOut = true;
        inst.gainNode.gain.cancelScheduledValues(ctx.currentTime);
        inst.gainNode.gain.setValueAtTime(inst.gainNode.gain.value, ctx.currentTime);
        inst.gainNode.gain.linearRampToValueAtTime(0, fadeEnd);
        setTimeout(() => stopSound(inst), duration * 1000);
    });
}

// ---------- Sound Effects ----------
// sfxClick  → normal UI button click
// sfxToggle → toggle-style switches
// sfxPopup  → a popup opening. If a popup is ALREADY open, falls back to the
//             click sound so stacked popups don't double-trigger the popup SFX.
// (Debug panel / mixer / meter controls intentionally call none of these.)
function sfxClick(){ haptic("tap"); playSound("sfx_button"); }
function sfxToggle(){ haptic("tap"); playSound("sfx_toggle"); }
function sfxPopup(){
    haptic("tap");
    const popupOpen =
        settingsOverlay.classList.contains("show") ||
        quitConfirm.classList.contains("show") ||
        (window.AdOffers && AdOffers.isAnyOpen && AdOffers.isAnyOpen());
    if (popupOpen) playSound("sfx_button");
    else playSound("sfx_popup");
}

// Satisfying mechanical-keyboard click for piece expand / drag-drop.
// Synthesized so each play can subtly shift pitch for variety; routes through
// the SFX bus so mute/mixer settings still apply.
function sfxPieceClick() {
    if (!playerSettings.sound) return;
    const ctx = getAudioContext();
    ensureGainGraph();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    // Subtle pitch variety each time (±~12%), plus a tiny volume wobble.
    // Base sits a touch deeper than a bright switch tick.
    const pitch = 0.78 + Math.random() * 0.2;
    const vol = 0.9 + Math.random() * 0.2;

    // Ultra-short bright noise spike — the "click" transient.
    const noiseDur = 0.012 + Math.random() * 0.006;
    const nBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) {
        nData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nData.length * 0.12));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = (2400 + Math.random() * 1000) * pitch;
    bp.Q.value = 0.9 + Math.random() * 0.4;
    const hpNoise = ctx.createBiquadFilter();
    hpNoise.type = "highpass";
    hpNoise.frequency.value = 1200 * pitch;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.55 * vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
    noise.connect(hpNoise);
    hpNoise.connect(bp);
    bp.connect(nGain);
    nGain.connect(_sfxGain);
    noise.start(now);
    noise.stop(now + noiseDur);

    // Sharp high tick — mechanical switch snap.
    const osc = ctx.createOscillator();
    osc.type = "square";
    const fClick = (2200 + Math.random() * 900) * pitch;
    osc.frequency.setValueAtTime(fClick, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(320, fClick * 0.55), now + 0.01);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900 * pitch;
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.22 * vol, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);
    osc.connect(hp);
    hp.connect(cGain);
    cGain.connect(_sfxGain);
    osc.start(now);
    osc.stop(now + 0.016);

    // Tiny mid ping for body, kept short so it stays clicky not thocky.
    const ping = ctx.createOscillator();
    ping.type = "triangle";
    ping.frequency.setValueAtTime((650 + Math.random() * 200) * pitch, now);
    const pGain = ctx.createGain();
    pGain.gain.setValueAtTime(0.08 * vol, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    ping.connect(pGain);
    pGain.connect(_sfxGain);
    ping.start(now);
    ping.stop(now + 0.022);
}

// Inverse of sfxPieceClick for shrinking: same clicky character, but pitch
// rises instead of falling and the noise sits a touch lighter.
function sfxPieceShrink() {
    if (!playerSettings.sound) return;
    const ctx = getAudioContext();
    ensureGainGraph();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const pitch = 0.78 + Math.random() * 0.2;
    const vol = 0.85 + Math.random() * 0.2;

    const noiseDur = 0.012 + Math.random() * 0.006;
    const nBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) {
        nData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nData.length * 0.12));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = (2000 + Math.random() * 900) * pitch;
    bp.Q.value = 0.9 + Math.random() * 0.4;
    const hpNoise = ctx.createBiquadFilter();
    hpNoise.type = "highpass";
    hpNoise.frequency.value = 1100 * pitch;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.45 * vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
    noise.connect(hpNoise);
    hpNoise.connect(bp);
    bp.connect(nGain);
    nGain.connect(_sfxGain);
    noise.start(now);
    noise.stop(now + noiseDur);

    // Rising tick — inverse of the expand snap.
    const osc = ctx.createOscillator();
    osc.type = "square";
    const fStart = (1200 + Math.random() * 500) * pitch;
    const fEnd = fStart * (1.7 + Math.random() * 0.35);
    osc.frequency.setValueAtTime(fStart, now);
    osc.frequency.exponentialRampToValueAtTime(fEnd, now + 0.012);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 800 * pitch;
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.18 * vol, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);
    osc.connect(hp);
    hp.connect(cGain);
    cGain.connect(_sfxGain);
    osc.start(now);
    osc.stop(now + 0.018);

    const ping = ctx.createOscillator();
    ping.type = "triangle";
    const pStart = (480 + Math.random() * 140) * pitch;
    ping.frequency.setValueAtTime(pStart, now);
    ping.frequency.exponentialRampToValueAtTime(pStart * 1.55, now + 0.018);
    const pGain = ctx.createGain();
    pGain.gain.setValueAtTime(0.07 * vol, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    ping.connect(pGain);
    pGain.connect(_sfxGain);
    ping.start(now);
    ping.stop(now + 0.024);
}

// Sampled expand/shrink sequence: one "expand_N" sample per grid cell,
// staggered ~45ms apart. Expanding plays ascending (1 → N); shrinking plays
// descending (N → 1). Capped at 11 samples for larger blocks.
const EXPAND_SEQ_STAGGER_MS = 45;
const EXPAND_SEQ_MAX = 11;
function cancelExpandSequence(b) {
    if (!b._expandSequenceTimeouts) return;
    b._expandSequenceTimeouts.forEach(clearTimeout);
    b._expandSequenceTimeouts.length = 0;
}

function playExpandSequence(b, cells, ascending) {
    cancelExpandSequence(b);
    const n = Math.min(EXPAND_SEQ_MAX, Math.max(1, Math.round(cells)));
    for (let i = 0; i < n; i++) {
        const idx = ascending ? (i + 1) : (n - i);
        const timeoutId = setTimeout(() => {
            const timeoutIndex = b._expandSequenceTimeouts.indexOf(timeoutId);
            if (timeoutIndex !== -1) b._expandSequenceTimeouts.splice(timeoutIndex, 1);
            playSound("expand_" + idx);
        }, i * EXPAND_SEQ_STAGGER_MS);
        b._expandSequenceTimeouts.push(timeoutId);
    }
}

// Edge sfx: cycled in ascending order (1→2→3→4→1…), exactly one per completed
// expansion.
let _edgeSfxIndex = 0;
function playEdgeSfx() {
    _edgeSfxIndex = (_edgeSfxIndex % 4) + 1;
    playSound("edge_" + _edgeSfxIndex);
}

// Blocking sfx: one of two samples chosen at random on a blocked bounce.
function playBlockingSfx() {
    playSound("blocking_" + (1 + Math.floor(Math.random() * 2)));
}

// Keep the persisted state as the authority for all audio and haptic paths.
toggleMusic.addEventListener("change", () => {
    playerSettings.music = toggleMusic.checked;
    savePlayerSettings();
    sfxToggle();
    applyMixerGains();
    if (playerSettings.music && !_bgInstances.length &&
        gameScreen.classList.contains("active") && !csLevelDone && !csGameOver) {
        _bgPlaying = false;
        playBackgroundAudio();
    }
});
toggleSound.addEventListener("change", () => {
    // Sound = SFX bus only. Music toggle / BGM are independent (SP-957).
    playerSettings.sound = toggleSound.checked;
    savePlayerSettings();
    sfxToggle();
    applyMixerGains();
});
toggleHaptics.addEventListener("change", () => {
    playerSettings.haptics = toggleHaptics.checked;
    savePlayerSettings();
    sfxToggle();
});

// ---------- Loudness Meter (ITU-R BS.1770 approx) ----------
let _meterRAF = null;
let _meterAnalyser = null;
let _kWeightHigh = null;
let _kWeightShelf = null;
let _meterBuffer = null;
let _meterShortRing = [];
let _meterIntegrated = { sum: 0, count: 0 };
let _meterTruePeak = -Infinity;

function initMeter() {
    if (_meterAnalyser) return;
    const ctx = getAudioContext();
    ensureGainGraph();

    // K-weighting: high-pass 60Hz + high-shelf 1500Hz +4dB (approx BS.1770)
    _kWeightHigh = ctx.createBiquadFilter();
    _kWeightHigh.type = "highpass";
    _kWeightHigh.frequency.value = 60;
    _kWeightHigh.Q.value = 0.5;

    _kWeightShelf = ctx.createBiquadFilter();
    _kWeightShelf.type = "highshelf";
    _kWeightShelf.frequency.value = 1500;
    _kWeightShelf.gain.value = 4;

    _meterAnalyser = ctx.createAnalyser();
    _meterAnalyser.fftSize = 2048;

    _meterInput.connect(_kWeightHigh);
    _kWeightHigh.connect(_kWeightShelf);
    _kWeightShelf.connect(_meterAnalyser);

    _meterBuffer = new Float32Array(_meterAnalyser.fftSize);
}

function meterTick() {
    if (!_meterAnalyser) return;
    _meterAnalyser.getFloatTimeDomainData(_meterBuffer);
    const len = _meterBuffer.length;

    // RMS for this block
    let sumSq = 0;
    let blockPeak = 0;
    for (let i = 0; i < len; i++) {
        const s = _meterBuffer[i];
        sumSq += s * s;
        const abs = Math.abs(s);
        if (abs > blockPeak) blockPeak = abs;
    }
    const rms = Math.sqrt(sumSq / len);

    // 4x oversampled true peak approximation (linear interp between samples)
    for (let i = 0; i < len - 1; i++) {
        const a = _meterBuffer[i], b = _meterBuffer[i + 1];
        for (let j = 1; j <= 3; j++) {
            const interp = Math.abs(a + (b - a) * (j / 4));
            if (interp > blockPeak) blockPeak = interp;
        }
    }

    const dbTP = blockPeak > 0 ? 20 * Math.log10(blockPeak) : -Infinity;
    if (dbTP > _meterTruePeak) _meterTruePeak = dbTP;

    // LUFS = -0.691 + 10*log10(mean_square) (simplified)
    const lufs = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -Infinity;

    // Short-term: trailing 3s ring buffer (~3s of blocks at rAF rate)
    const now = performance.now();
    _meterShortRing.push({ t: now, sq: rms * rms });
    while (_meterShortRing.length && _meterShortRing[0].t < now - 3000) _meterShortRing.shift();
    let shortSum = 0;
    for (const b of _meterShortRing) shortSum += b.sq;
    const shortMean = shortSum / (_meterShortRing.length || 1);
    const shortLUFS = shortMean > 0 ? -0.691 + 10 * Math.log10(shortMean) : -Infinity;

    // Integrated (gated: only blocks > -70 LUFS)
    if (lufs > -70) {
        _meterIntegrated.sum += rms * rms;
        _meterIntegrated.count++;
    }
    const intMean = _meterIntegrated.count > 0 ? _meterIntegrated.sum / _meterIntegrated.count : 0;
    const intLUFS = intMean > 0 ? -0.691 + 10 * Math.log10(intMean) : -Infinity;

    // Update UI
    document.getElementById("meterShort").textContent = isFinite(shortLUFS) ? shortLUFS.toFixed(1) : "—";
    document.getElementById("meterIntegrated").textContent = isFinite(intLUFS) ? intLUFS.toFixed(1) : "—";
    document.getElementById("meterPeak").textContent = isFinite(_meterTruePeak) ? _meterTruePeak.toFixed(1) : "—";
}

function startMeter() {
    initMeter();
    if (_meterRAF) return;
    function loop() {
        meterTick();
        _meterRAF = requestAnimationFrame(loop);
    }
    _meterRAF = requestAnimationFrame(loop);
}

function stopMeter() {
    if (_meterRAF) { cancelAnimationFrame(_meterRAF); _meterRAF = null; }
}

function resetMeter() {
    _meterShortRing = [];
    _meterIntegrated = { sum: 0, count: 0 };
    _meterTruePeak = -Infinity;
    document.getElementById("meterShort").textContent = "—";
    document.getElementById("meterIntegrated").textContent = "—";
    document.getElementById("meterPeak").textContent = "—";
}

// ---------- Debug Mixer UI Logic ----------
function buildMixerUI() {
    const scroll = document.getElementById("mixerSoundsScroll");
    scroll.innerHTML = "";
    const names = Object.keys(AUDIO_FILES);
    if (!names.length) {
        scroll.innerHTML = '<span style="color:#6b6684;font-size:10px;">No sounds registered</span>';
        return;
    }
    names.forEach(name => {
        const snd = _mixer.sounds[name] || {
            volume: defaultSoundVolume(name),
            mute: false,
            solo: false,
            loop: name === GAMEPLAY_BGM,
        };
        if (name === GAMEPLAY_BGM) snd.loop = true;
        _mixer.sounds[name] = snd;
        const ch = getChannel(name);
        const strip = document.createElement("div");
        strip.className = "mixer-sound-strip";
        strip.innerHTML = `
<div class="mixer-row">
  <label>${name}</label>
  <span class="mixer-channel-tag">${ch.toUpperCase()}</span>
</div>
<div class="mixer-row">
  <input type="range" min="0" max="100" value="${snd.volume}" data-snd="${name}" data-prop="volume" />
  <span class="mixer-val">${snd.volume}</span>
</div>
<div class="mixer-toggles">
  <button class="mixer-tog${snd.loop ? ' active' : ''}" data-snd="${name}" data-prop="loop">Loop</button>
  <button class="mixer-tog${snd.mute ? ' mute-active' : ''}" data-snd="${name}" data-prop="mute">M</button>
  <button class="mixer-tog${snd.solo ? ' active' : ''}" data-snd="${name}" data-prop="solo">S</button>
</div>`;
        scroll.appendChild(strip);
    });

    // Bind events
    scroll.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener("input", () => {
            const name = slider.dataset.snd;
            _mixer.sounds[name].volume = parseInt(slider.value, 10);
            slider.nextElementSibling.textContent = slider.value;
            applyMixerGains();
        });
    });
    scroll.querySelectorAll(".mixer-tog").forEach(btn => {
        btn.addEventListener("click", () => {
            const name = btn.dataset.snd;
            const prop = btn.dataset.prop;
            _mixer.sounds[name][prop] = !_mixer.sounds[name][prop];
            if (prop === "mute") btn.classList.toggle("mute-active");
            else btn.classList.toggle("active");
            applyMixerGains();
        });
    });
}

function initMixerControls() {
    const masterSlider = document.getElementById("mixerMaster");
    const sfxSlider = document.getElementById("mixerSFX");
    const musicSlider = document.getElementById("mixerMusic");

    masterSlider.value = _mixer.master;
    sfxSlider.value = _mixer.sfx;
    musicSlider.value = _mixer.music;
    document.getElementById("mixerMasterVal").textContent = _mixer.master;
    document.getElementById("mixerSFXVal").textContent = _mixer.sfx;
    document.getElementById("mixerMusicVal").textContent = _mixer.music;

    function bindSlider(slider, key, valId) {
        slider.addEventListener("input", () => {
            _mixer[key] = parseInt(slider.value, 10);
            document.getElementById(valId).textContent = slider.value;
            applyMixerGains();
        });
    }
    bindSlider(masterSlider, "master", "mixerMasterVal");
    bindSlider(sfxSlider, "sfx", "mixerSFXVal");
    bindSlider(musicSlider, "music", "mixerMusicVal");

    // Channel mute/solo
    const sfxMute = document.getElementById("mixerSFXMute");
    const sfxSolo = document.getElementById("mixerSFXSolo");
    const musicMute = document.getElementById("mixerMusicMute");
    const musicSolo = document.getElementById("mixerMusicSolo");

    sfxMute.classList.toggle("mute-active", _mixer.sfxMute);
    sfxSolo.classList.toggle("active", _mixer.sfxSolo);
    musicMute.classList.toggle("mute-active", _mixer.musicMute);
    musicSolo.classList.toggle("active", _mixer.musicSolo);

    sfxMute.addEventListener("click", () => { _mixer.sfxMute = !_mixer.sfxMute; sfxMute.classList.toggle("mute-active"); applyMixerGains(); });
    sfxSolo.addEventListener("click", () => { _mixer.sfxSolo = !_mixer.sfxSolo; sfxSolo.classList.toggle("active"); applyMixerGains(); });
    musicMute.addEventListener("click", () => { _mixer.musicMute = !_mixer.musicMute; musicMute.classList.toggle("mute-active"); applyMixerGains(); });
    musicSolo.addEventListener("click", () => { _mixer.musicSolo = !_mixer.musicSolo; musicSolo.classList.toggle("active"); applyMixerGains(); });

    // Save
    const saveBtn = document.getElementById("mixerSave");
    document.getElementById("mixerSave").addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEYS.mixer, JSON.stringify(_mixer));
        saveBtn.textContent = "✓ Saved";
        saveBtn.style.background = "#1ea85a";
        setTimeout(() => {
            saveBtn.textContent = "Save";
            saveBtn.style.background = "";
        }, 1200);
    });

    buildMixerUI();
}

// ---------- Game Loop (60 fps cap) ----------
// All gameplay rendering/logic goes in updateGame(dt).
// The loop is started by startGame() and stopped by levelComplete()/levelFailed().
// On high-refresh-rate displays (90/120 Hz) frames are skipped to hold 60 fps.
const FRAME_MS = 1000 / 60;
let _lastFrame = 0;
let _gameRAF = null;

function _tick(now) {
    _gameRAF = requestAnimationFrame(_tick);
    const dt = now - _lastFrame;
    if (dt < FRAME_MS) return;
    _lastFrame = now - (dt % FRAME_MS);
    updateGame(dt);
}

function startLoop() {
    if (_gameRAF) return;
    _lastFrame = performance.now();
    _gameRAF = requestAnimationFrame(_tick);
}

function stopLoop() {
    if (_gameRAF) {
        cancelAnimationFrame(_gameRAF);
        _gameRAF = null;
    }
}

function isLoopRunning() { return _gameRAF !== null; }

// ★ YOUR GAME LOGIC — called at 60 fps with delta time in ms ★

function updateGame(dt) {
    csFrame(dt);
}

// ---------- Localisation ----------
// Text strings live in translations.js (window.GAME_TEXT). Edit that file to
// change wording or add new strings / languages.
const I18N = window.GAME_TEXT;
const LANGS = window.LANGUAGE_ORDER || Object.keys(I18N);
const i18nEls = document.querySelectorAll("[data-i18n]");

function getInitialLanguage(){
    // Use only the primary device language. Scanning the full
    // navigator.languages list kept Polish after the user switched the OS
    // primary language to an unsupported locale (e.g. Spanish) — SP-1043.
    const primary = (navigator.language || (navigator.languages && navigator.languages[0]) || "")
        .toLowerCase()
        .split(/[-_]/, 1)[0];
    if (!primary) return LANGS[0];
    const supportedLanguage = LANGS.find((language) =>
        language.toLowerCase() === primary
    );
    return supportedLanguage || LANGS[0];
}

let lang = getInitialLanguage();
const t = (key) => (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || key;

function applyLanguage(){
    const dict = I18N[lang];
    document.documentElement.lang = lang;
    // Static text nodes flagged with data-i18n
    i18nEls.forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (dict[key] !== undefined) el.textContent = dict[key];
    });
    // Language toggle button shows the language you can switch to
    debugLang.textContent = dict.language;
    csHintBtn.setAttribute("aria-label", dict.hintButton);
    if (typeof updateHintButton === "function") updateHintButton();
    const hintIntro = document.getElementById("hintFeatureIntro");
    if (hintIntro && !hintIntro.hidden) {
        const title = document.getElementById("hintFeatureTitle");
        const label = document.getElementById("hintFeatureLabel");
        const desc = document.getElementById("hintFeatureDesc");
        const claim = document.getElementById("hintFeatureClaim");
        if (title) title.textContent = dict.prNewFeature;
        if (label) label.textContent = dict.hintButton;
        if (desc) desc.textContent = dict.hintFeatureDesc;
        if (claim) claim.textContent = dict.prClaim;
    }
    // Level-dependent labels
    updateLevelLabels();
    // Refresh the result overlay if it is currently on screen
    if (overlay.classList.contains("show")){
        if (overlayCard.classList.contains("win")){
            animateTitle(overlayTitle, dict.completeTitle);
            setWinPercentile(null, { refreshOnly: true });
            overlaySubtitle.textContent = dict.completeSubtitle;
            overlayBtn.textContent = t("level") + " " + level;
        } else {
            overlayTitle.textContent = dict.failTitle;
            hideWinPercentile();
            overlaySubtitle.textContent = dict.failSubtitle;
            overlayBtn.textContent = dict.retry;
        }
    }
}

function toggleLanguage(){
    const i = LANGS.indexOf(lang);
    lang = LANGS[(i + 1) % LANGS.length];
    applyLanguage();
}

function clearLockedToasts() {
    document.querySelectorAll(".locked-toast").forEach((toast) => toast.remove());
}

function showScreen(screen){
    splashScreen.classList.remove("active");
    startScreen.classList.remove("active");
    gameScreen.classList.remove("active");
    screen.classList.add("active");
    if (window.HomeBoard) {
        if (screen === startScreen) HomeBoard.show();
        else HomeBoard.hide();
    }
    if (screen === startScreen && window.DailyStreak) {
        DailyStreak.RefreshHomePill();
    }
}

/** Free game + Spine WebGL so Capacitor can give a fresh context to home / next level. */
function releaseGameGpu() {
    if (window.BlockCharacters && typeof BlockCharacters.disposeAllSharedSpinePlayers === "function") {
        BlockCharacters.disposeAllSharedSpinePlayers();
    }
    if (typeof cs3dDispose === "function") cs3dDispose();
}

function updateLevelLabels(){
    playLevel.textContent = t("level") + " " + level;
    gameHeader.textContent = t("level") + " " + level;
}

// Lifecycle implementations. Public names (startGame / levelComplete /
// levelFailed / contentCompleted) live in index.html for analytics injection.
const KPFApp = window.KPFApp || (window.KPFApp = {});

KPFApp.startGame = function startGameImpl(){
    // Splash-styled cover, swap to the game screen, then fade back in.
    haptic("tap");
    clearTimeout(fadeTimer);
    clearLockedToasts();
    unlockResultOverlay();
    fadeBlack.classList.add("show");
    fadeTimer = setTimeout(() => {
        try {
            const leavingHome = startScreen.classList.contains("active");
            hideOverlay();
            resetLevelCompleteState();
            updateLevelLabels();
            showScreen(gameScreen); // HomeBoard.hide() disposes home WebGL
            if (leavingHome && window.BlockCharacters &&
                typeof BlockCharacters.disposeAllSharedSpinePlayers === "function") {
                // Home warmed shared Spine players — free that context before game init.
                BlockCharacters.disposeAllSharedSpinePlayers();
            }
            if (typeof cs3dEnsureReady === "function") cs3dEnsureReady();
            playBackgroundAudio();
            csLoadLevel(level);
            startLoop();
            startIntro(csSkipNextIntro);
            csSkipNextIntro = false;
        } catch (err) {
            console.error("[KPF] startGame failed", err);
        } finally {
            requestAnimationFrame(() => fadeBlack.classList.remove("show"));
        }
    }, 420);
};

function resetLevelCompleteState(){
    gameHeader.classList.remove("exit-up");
    hideBoardInOverlay();
    clearOutro();
    clearWinIntroTimers();
    settingsBtnGame.style.opacity = "";
    cancelWellDoneExpand();
    flavourText.classList.remove("show", "dismiss");
    failText.classList.remove("show", "settle");
    overlayCard.classList.remove(
        "progress-pending", "progress-claiming", "progress-claimed",
        "win-hero", "win-docked", "win-chrome"
    );
    clearTimeout(progressRewardTimer);
    clearTimeout(progressRewardSafetyTimer);
    pendingWinFinishedLevel = null;
    pendingProgressDetail = null;
}

KPFApp.levelComplete = function levelCompleteImpl(){
    // Keep the render loop running — win sheen / pop wave need frames during outro.
    startOutro(startLevelCompleteFlow);
};

// Set by presentLevelCompleteUI(); unused once streak plays before the win card.
let _levelCompleteSndInst = null;
// When streak celebration runs first, hold the finished level until it closes.
let pendingWinFinishedLevel = null;
/** Level number Ads frequency gate should read (win card already advanced `level`). */
let adsOpportunityLevel = null;
let _loopWasRunningBeforeAd = false;
// Progress-reward flow waits until the win chrome stage so it doesn't fight the intro.
let pendingProgressDetail = null;
let winIntroTimers = [];

function clearWinIntroTimers(){
    for (const id of winIntroTimers) clearTimeout(id);
    winIntroTimers = [];
}

function winFeel(){
    return (window.CSApp && CSApp.feel && CSApp.feel.WIN) || {};
}

function applyWinLayoutVars(){
    const win = winFeel();
    const titleOff = win.WIN_TITLE_TOP_OFFSET_PX ?? 14;
    const bottomOff = win.WIN_BOTTOM_OFFSET_PX ?? 16;
    const gap = win.OVERLAY_BOARD_GAP_PX ?? 10;
    // Compact title (~28px × 2 lines) + gap so the board keeps most of the card.
    const topReserve = win.WIN_TOP_RESERVE_PX ?? (titleOff + 60 + gap);
    const bottomReserve = win.WIN_BOTTOM_RESERVE_PX ?? 168;
    const dockMs = win.WIN_DOCK_MS ?? 460;
    overlayCard.style.setProperty("--win-title-top", `calc(${titleOff}px + var(--safe-top, 0px))`);
    overlayCard.style.setProperty("--win-bottom-inset", `calc(${bottomOff}px + var(--safe-bottom, 0px))`);
    overlayCard.style.setProperty("--win-dock-top-reserve", topReserve + "px");
    overlayCard.style.setProperty("--win-chrome-bottom-reserve", bottomReserve + "px");
    overlayCard.style.setProperty("--win-dock-ms", dockMs + "ms");
}

/** Final resting band between docked title and bottom chrome (stage-independent). */
function overlayBoardFitBand(){
    const feel = winFeel();
    const gap = feel.OVERLAY_BOARD_GAP_PX == null ? 10 : feel.OVERLAY_BOARD_GAP_PX;
    const card = overlayCard.getBoundingClientRect();
    const sidePad = 10;
    let top = card.top + gap;
    let bottom = card.bottom - gap;

    // Always reserve the docked title home — not the hero-centered position.
    if (overlayTitle) {
        const probe = document.createElement("div");
        probe.setAttribute("aria-hidden", "true");
        probe.style.cssText = "position:absolute;left:0;width:0;height:0;top:var(--win-title-top);visibility:hidden;pointer-events:none;";
        overlayCard.appendChild(probe);
        const titleTop = probe.getBoundingClientRect().top;
        probe.remove();
        const titleH = Math.max(overlayTitle.offsetHeight || 0, 36);
        top = Math.max(top, titleTop + titleH + gap);
    }

    // Always reserve settled bottom chrome (offsetTop ignores entrance translate).
    const bottomRoot = document.getElementById("overlayBottom");
    if (bottomRoot && bottomRoot.offsetHeight > 1) {
        bottom = Math.min(bottom, card.top + bottomRoot.offsetTop - gap);
    } else {
        const reserve = feel.WIN_BOTTOM_RESERVE_PX ?? 168;
        bottom = Math.min(bottom, card.bottom - reserve);
    }

    const height = Math.max(96, bottom - top);
    const width = Math.max(96, card.width - sidePad * 2);
    return {
        left: card.left + sidePad,
        width,
        top,
        height,
        cx: card.left + card.width / 2,
        cy: top + height / 2,
        card,
    };
}

function syncOverlayBoardSlot(band){
    if (!overlayCard || !band || !band.card) return;
    const topReserve = Math.max(0, band.top - band.card.top);
    const bottomReserve = Math.max(0, band.card.bottom - (band.top + band.height));
    overlayCard.style.setProperty("--win-top-reserve", topReserve + "px");
    overlayCard.style.setProperty("--win-bottom-reserve", bottomReserve + "px");
}

function queueProgressRewardFlow(detail){
    pendingProgressDetail = detail || {};
    if (overlayCard.classList.contains("win-chrome")) {
        const queued = pendingProgressDetail;
        pendingProgressDetail = null;
        startProgressRewardFlow(queued);
    }
}

function releaseQueuedProgressReward(){
    if (pendingProgressDetail == null) return;
    const queued = pendingProgressDetail;
    pendingProgressDetail = null;
    startProgressRewardFlow(queued);
}

let wellDoneExpandRaf = null;
let wellDoneExpandTimers = [];

function cancelWellDoneExpand(){
    if (wellDoneExpandRaf){
        cancelAnimationFrame(wellDoneExpandRaf);
        wellDoneExpandRaf = null;
    }
    for (let i = 0; i < wellDoneExpandTimers.length; i++) clearTimeout(wellDoneExpandTimers[i]);
    wellDoneExpandTimers.length = 0;
}

function wellDoneAfter(ms, fn){
    const id = setTimeout(fn, ms);
    wellDoneExpandTimers.push(id);
    return id;
}

/**
 * Well Done: black bar + green vignette bloom + text pop. Holds briefly, then
 * dismisses and hands off to the level-complete card via onDone.
 */
function playWellDoneExpand(onDone){
    cancelWellDoneExpand();
    const win = (window.CSApp && CSApp.feel && CSApp.feel.WIN) || {};
    const holdMs = win.WELL_DONE_HOLD_MS ?? 1400;
    const dismissMs = win.WELL_DONE_SHRINK_MS ?? 400;

    wellDoneAfter(holdMs, () => {
        flavourText.classList.add("dismiss");
        wellDoneAfter(dismissMs, () => {
            flavourText.classList.remove("show", "dismiss");
            if (typeof onDone === "function") onDone();
        });
    });
}

function startLevelCompleteFlow(){
    // 1. UI has exited; wide-expand Well Done + fireworks.
    haptic("success");
    clearTimeout(completeTimer);
    cancelWellDoneExpand();
    if (flavourLabel) flavourLabel.textContent = t("wellDone");
    flavourText.classList.remove("dismiss");
    flavourText.classList.add("show");
    playSound("sfx_welldone");
    fadeBackgroundAudio();
    launchFireworks();

    // 2. Expand plays out, then streak / level-complete card.
    playWellDoneExpand(showLevelCompleteUI);
}

function hideWinPercentile(){
    if (!overlayPercentile) return;
    overlayPercentile.hidden = true;
    overlayPercentile.innerHTML = "";
}

/** Show fake “beat X% of players” line. Pass completedLevel, or refreshOnly to keep last roll. */
function setWinPercentile(completedLevel, options){
    if (!overlayPercentile || !window.WinFeedback) {
        hideWinPercentile();
        return;
    }
    const built = WinFeedback.buildBeatPlayersHtml(completedLevel, options || {});
    overlayPercentile.innerHTML = built.html;
    overlayPercentile.hidden = false;
}

function authoredLevelCount(){
    return (typeof LEVELS !== "undefined" && Array.isArray(LEVELS) && LEVELS.length)
        ? LEVELS.length
        : 0;
}

/**
 * Advance progress, then either open the streak celebration first or present
 * the win card immediately. Streak close always continues via onStreakFlowDone.
 */
function showLevelCompleteUI(){
    const finishedLevel = level;
    // Fire contentCompleted before level++ so analytics report the finished
    // authored level (e.g. 40), not the post-increment loop index (41).
    const total = authoredLevelCount();
    if (total > 0 && finishedLevel === total && typeof contentCompleted === "function") {
        contentCompleted();
    }
    level++;
    saveProgress();
    const detail = { completedLevel: finishedLevel };

    if (window.DailyStreak && typeof DailyStreak.OnLevelComplete === "function") {
        // Defer the win-card intro until streak closes (or skips).
        pendingWinFinishedLevel = finishedLevel;
        DailyStreak.OnLevelComplete(detail);
        return;
    }

    presentLevelCompleteUI(finishedLevel);
    queueProgressRewardFlow(detail);
}

/** Play the level-complete overlay intro (hero title → dock → bottom chrome).
 *  Board scales once to its final rest and stays put while chrome animates. */
function presentLevelCompleteUI(finishedLevel){
    clearWinIntroTimers();
    const win = winFeel();
    const heroHold = win.WIN_HERO_HOLD_MS ?? 980;
    const dockMs = win.WIN_DOCK_MS ?? 560;
    const chromeDelay = win.WIN_CHROME_DELAY_MS ?? 40;

    overlayCard.classList.remove("fail", "win-docked", "win-chrome");
    overlayCard.classList.add("win", "win-hero");
    applyWinLayoutVars();
    overlay.classList.add("celebrate");
    animateTitle(overlayTitle, t("completeTitle"));
    setWinPercentile(finishedLevel);
    overlaySubtitle.textContent = t("completeSubtitle");
    // Hold the Continue button until the progress-reward flow has played out.
    overlayBtn.textContent = t("level") + " " + level;
    overlayBtn.className = "nextbtn btn-hidden";
    overlayCard.classList.remove("progress-claimed", "progress-claiming");
    overlayCard.classList.add("progress-pending");
    progressRewardClaimed = false;
    overlay.classList.add("show");
    lockResultOverlay();
    _levelCompleteSndInst = playSound("sfx_levelcomplete");
    launchConfetti();
    // One move into the final title↔chrome band; title/chrome animate around it.
    showBoardInOverlay();

    winIntroTimers.push(setTimeout(() => {
        overlayCard.classList.remove("win-hero");
        overlayCard.classList.add("win-docked");
        winIntroTimers.push(setTimeout(() => {
            overlayCard.classList.add("win-chrome");
            releaseQueuedProgressReward();
        }, dockMs + chromeDelay));
    }, heroHold));
}

// Delay before the progress-reward bar fades into the win card (after chrome
// has already staged in), so the result reads first.
const PROGRESS_REWARD_REVEAL_DELAY = 420;
const PROGRESS_REWARD_SAFETY_MS = 20000;
let progressRewardTimer = null;
let progressRewardSafetyTimer = null;
let progressRewardClaimed = false;

// Reveal the held Continue button once the progress-reward flow has finished
// (or immediately when there is no progress-reward system to wait on).
function revealNextButton(){
    clearTimeout(progressRewardSafetyTimer);
    overlayCard.classList.remove("progress-pending");
    if (progressRewardClaimed) {
        // After a claim, retire the bar for the rest of this win card. Keep
        // `progress-claiming` (which hides the bar panel) applied alongside
        // `progress-claimed` so the panel can never flash back while the module
        // resets/peeks the next tier. Both are cleared by the next level start.
        overlayCard.classList.add("progress-claimed");
    } else {
        overlayCard.classList.remove("progress-claiming");
    }
    overlayBtn.classList.remove("btn-hidden");
}

// Kick off the inline progress-reward flow a beat after the win card lands,
// then reveal the Continue button when it completes.
function startProgressRewardFlow(detail){
    clearTimeout(progressRewardTimer);
    clearTimeout(progressRewardSafetyTimer);
    progressRewardClaimed = false;
    if (!window.ProgressRewards){ revealNextButton(); return; }
    progressRewardTimer = setTimeout(() => {
        const shown = ProgressRewards.OnLevelComplete(detail || {});
        // onComplete (set in init) reveals the button when the flow ends; if
        // nothing was shown, reveal right away so the player isn't stuck.
        if (!shown) {
            revealNextButton();
            return;
        }
        // Belt-and-braces: if onComplete never arrives, don't softlock Continue.
        progressRewardSafetyTimer = setTimeout(() => {
            if (overlayCard.classList.contains("progress-pending") ||
                overlayBtn.classList.contains("btn-hidden")) {
                revealNextButton();
            }
        }, PROGRESS_REWARD_SAFETY_MS);
    }, PROGRESS_REWARD_REVEAL_DELAY);
}

KPFApp.levelFailed = function levelFailedImpl(){
    stopLoop();
    hintOnFail();
    // Soft fail: Times Up offer (RV +30s) instead of the old fail card.
    if (typeof KPFApp.offerTimesUp === "function") {
        stopBackgroundAudio();
        KPFApp.offerTimesUp();
        return;
    }
    startOutro(startLevelFailedFlow);
};

KPFApp.offerTimesUp = function offerTimesUpImpl(){
    stopLoop();
    stopBackgroundAudio();
    clearTimeout(completeTimer);
    cancelWellDoneExpand();
    flavourText.classList.remove("show", "dismiss");
    stopFireworks();
    stopConfetti();
    if (window.AdOffers && typeof AdOffers.showTimesUp === "function") {
        AdOffers.showTimesUp();
    } else {
        startOutro(startLevelFailedFlow);
    }
};

function resumeAfterTimesUp(){
    if (window.AdOffers) AdOffers.hideAll();
    playBackgroundAudio();
    startLoop();
}
window.resumeAfterTimesUp = resumeAfterTimesUp;

function retryAfterTimesUp(){
    // Analytics fail fires once the player commits to retry.
    try {
        document.dispatchEvent(new CustomEvent("kpf:levelFailed", {
            detail: { level: window.level }
        }));
    } catch (_) { /* ignore */ }
    if (window.AdOffers) AdOffers.hideAll();
    clearIntro();
    clearOutro();
    const advance = () => {
        adsOpportunityLevel = null;
        startGame();
    };
    if (window.Ads && typeof Ads.showInterstitial === "function") {
        adsOpportunityLevel = level | 0;
        Ads.showInterstitial("level_fail").then(advance);
    } else {
        advance();
    }
}
window.retryAfterTimesUp = retryAfterTimesUp;

function startLevelFailedFlow(){
    haptic("error");
    clearTimeout(completeTimer);
    cancelWellDoneExpand();
    flavourText.classList.remove("show", "dismiss");
    stopFireworks();
    stopConfetti();
    stopBackgroundAudio();

    // 1. Show "Level Failed" text over gameplay
    failText.querySelector("span").textContent = t("failTitle");
    failText.classList.remove("settle");
    failText.classList.add("show");
    playSound("sfx_levelfail");

    // 2. After 1s, slide text up and show backdrop
    completeTimer = setTimeout(() => {
        failText.classList.add("settle");
        overlayCard.classList.remove("win", "win-hero", "win-docked", "win-chrome");
        overlayCard.classList.add("fail");
        overlay.classList.remove("celebrate");
        overlay.classList.add("backdrop-only");
        overlay.classList.remove("reveal-content");
        overlayTitle.textContent = "";
        hideWinPercentile();
        overlaySubtitle.textContent = t("failSubtitle");
        overlayBtn.textContent = t("retry");
        overlayBtn.className = "nextbtn retrybtn btn-hidden";
        overlay.classList.add("show");
        lockResultOverlay();
    }, 1000);

    // 3. After text settles, reveal the subtitle
    setTimeout(() => {
        overlay.classList.remove("backdrop-only");
        overlay.classList.add("reveal-content");
    }, 1500);

    // 4. After subtitle appears, reveal the button
    setTimeout(() => {
        overlayBtn.classList.remove("btn-hidden");
        overlayBtn.classList.add("btn-visible");
    }, 2000);
}

// Board footprint (viewport space) captured when the board is lifted out, plus
// its original parent so it can be dropped back into the play area afterwards.
let overlayBoardBase = null;
let overlayBoardHome = null;
let overlayBoardObserver = null;
let unlockDimObserver = null;

// Dim the lifted board and drop it behind the card whenever a reward/feature
// unlock takes over the win screen, so the popup layers cleanly above it. The
// embedded ProgressRewards popup flags its takeover with these state classes.
function watchUnlockDim(){
    if (unlockDimObserver) return;
    const prRoot = overlayProgress && overlayProgress.querySelector(".pr-overlay");
    if (!prRoot || typeof MutationObserver === "undefined") return;
    const sync = () => {
        const busy = prRoot.classList.contains("pr-claiming") ||
            prRoot.classList.contains("pr-emerging") ||
            prRoot.classList.contains("pr-revealing");
        gameScreen.classList.toggle("board-unlock-dim", busy);
    };
    unlockDimObserver = new MutationObserver(sync);
    unlockDimObserver.observe(prRoot, { attributes: true, attributeFilter: ["class"] });
    sync();
}

// Scale/translate the live game board (.cs-canvas) into the gap between the
// docked title and bottom chrome. Tall boards shrink; nothing overlaps copy.
function positionOverlayBoard(){
    if (!gameScreen.classList.contains("board-in-overlay")) return;
    if (typeof csCanvas === "undefined" || !csCanvas || !overlayBoardBase) return;
    if (!overlayCard || !overlayCard.classList.contains("win")) return;
    const base = overlayBoardBase;
    const feel = winFeel();
    const inset = feel.OVERLAY_BOARD_INSET == null ? 1 : feel.OVERLAY_BOARD_INSET;
    const band = overlayBoardFitBand();
    if (!band.width || !band.height) return;
    syncOverlayBoardSlot(band);
    const scale = Math.min(Math.max(0.35, inset), 1) *
        Math.min(band.height / base.h, band.width / base.w);
    const dx = band.cx - base.cx;
    const dy = band.cy - base.cy;
    csCanvas.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
}

function showBoardInOverlay(){
    if (typeof csCanvas === "undefined" || !csCanvas || !overlayBoardSlot) return;
    const playArea = csCanvas.parentElement;
    if (!playArea) return;
    const play = playArea.getBoundingClientRect();
    const box = csCanvas.getBoundingClientRect();
    if (!play.width || !play.height) return;
    // The board is fitted to the play-area box; its centre matches the canvas
    // centre because the render overscan is symmetric above and below.
    overlayBoardBase = {
        cx: play.left + play.width / 2,
        cy: play.top + play.height / 2,
        w: play.width,
        h: play.height,
    };
    overlayBoardHome = playArea;
    // Lift the canvas out of the game screen and onto the level-complete overlay
    // so it renders as part of it. The overlay's backdrop-filter makes it the
    // containing block, so pin with absolute coords relative to the overlay box.
    overlay.appendChild(csCanvas);
    const host = overlay.getBoundingClientRect();
    csCanvas.style.position = "absolute";
    csCanvas.style.left = (box.left - host.left) + "px";
    csCanvas.style.top = (box.top - host.top) + "px";
    csCanvas.style.width = box.width + "px";
    csCanvas.style.height = box.height + "px";
    gameScreen.classList.add("board-in-overlay");
    // Park at the final title↔chrome band immediately (one CSS scale/translate).
    requestAnimationFrame(() => requestAnimationFrame(positionOverlayBoard));
    setTimeout(positionOverlayBoard, 60);
    if (!overlayBoardObserver && typeof ResizeObserver !== "undefined"){
        overlayBoardObserver = new ResizeObserver(() => positionOverlayBoard());
    }
    if (overlayBoardObserver) {
        overlayBoardObserver.observe(overlayCard);
        if (overlayBoardSlot) overlayBoardObserver.observe(overlayBoardSlot);
        const bottomRoot = document.getElementById("overlayBottom");
        if (bottomRoot) overlayBoardObserver.observe(bottomRoot);
    }
    window.addEventListener("resize", positionOverlayBoard);
    watchUnlockDim();
}

function hideBoardInOverlay(){
    if (overlayBoardObserver) overlayBoardObserver.disconnect();
    window.removeEventListener("resize", positionOverlayBoard);
    gameScreen.classList.remove("board-in-overlay");
    gameScreen.classList.remove("board-unlock-dim");
    if (typeof csCanvas !== "undefined" && csCanvas){
        csCanvas.style.transform = "";
        csCanvas.style.position = "";
        csCanvas.style.left = "";
        csCanvas.style.top = "";
        csCanvas.style.width = "";
        csCanvas.style.height = "";
        // Drop the board back into the play area for the next level.
        if (overlayBoardHome && csCanvas.parentElement !== overlayBoardHome){
            overlayBoardHome.appendChild(csCanvas);
        }
    }
    overlayBoardBase = null;
    overlayBoardHome = null;
}

function lockResultOverlay(){
    overlay.classList.add("result-locked", "show");
}

function unlockResultOverlay(){
    overlay.classList.remove("result-locked");
}

function hideOverlay(){
    clearTimeout(completeTimer);
    clearTimeout(progressRewardTimer);
    clearTimeout(progressRewardSafetyTimer);
    clearWinIntroTimers();
    cancelWellDoneExpand();
    flavourText.classList.remove("show", "dismiss");
    pendingWinFinishedLevel = null;
    pendingProgressDetail = null;
    if (window.ProgressRewards) ProgressRewards.hide();
    if (window.DailyStreak && DailyStreak.isOpen && DailyStreak.isOpen()) DailyStreak.hide();
    if (window.AdOffers) AdOffers.hideAll();
    unlockResultOverlay();
    hideBoardInOverlay();
    overlayCard.classList.remove("win-hero", "win-docked", "win-chrome");
    overlay.classList.remove("show");
    overlay.classList.remove("celebrate");
    overlay.classList.remove("backdrop-only");
    overlay.classList.remove("reveal-content");
    stopConfetti();
    stopFireworks();
}

// Split the title into per-letter spans so each expands in with a stagger.
function animateTitle(el, text){
    el.textContent = "";
    let i = 0;
    [...text].forEach((ch) => {
        if (ch === "\n"){
            el.appendChild(document.createElement("br"));
            return;
        }
        const span = document.createElement("span");
        span.className = "ltr";
        span.textContent = ch;
        span.style.animationDelay = (i * 34) + "ms";
        el.appendChild(span);
        i++;
    });
}

function launchConfetti(){
    const rect = confettiCanvas.getBoundingClientRect();
    confettiCanvas.width = rect.width;
    confettiCanvas.height = rect.height;
    const W = confettiCanvas.width;
    const H = confettiCanvas.height;
    const colors = ["#38dc85", "#ffcb3d", "#ff6b70", "#4d9bff", "#c86bff", "#ffffff"];

    while (confettiParticles.length < CONFETTI.PARTICLE_COUNT) {
        confettiParticles.push({});
    }
    confettiParticles.length = CONFETTI.PARTICLE_COUNT;
    for (let i = 0; i < confettiParticles.length; i++) {
        resetConfettiParticle(confettiParticles[i], W, H, colors, true);
    }

    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    let lastVFX = 0;

    function frame(now){
        confettiRAF = requestAnimationFrame(frame);
        if (now - lastVFX < FRAME_MS) return;
        lastVFX = now;
        cctx.clearRect(0, 0, W, H);
        for (let i = 0; i < confettiParticles.length; i++) {
            const p = confettiParticles[i];
            p.sway += 0.05;
            p.x += p.vx + Math.sin(p.sway) * 0.6;
            p.y += p.vy;
            p.rot += p.vr;
            if (p.y > H + CONFETTI.DESPAWN_PAD) {
                resetConfettiParticle(p, W, H, colors, false);
            }
            const cos = Math.cos(p.rot);
            const sin = Math.sin(p.rot);
            cctx.setTransform(cos, sin, -sin, cos, p.x, p.y);
            cctx.fillStyle = p.color;
            cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        cctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    confettiRAF = requestAnimationFrame(frame);
}

function resetConfettiParticle(p, width, height, colors, distribute) {
    p.x = Math.random() * width;
    p.y = distribute
        ? Math.random() * (height + CONFETTI.DESPAWN_PAD) - CONFETTI.DESPAWN_PAD
        : CONFETTI.SPAWN_Y;
    p.w = 6 + Math.random() * 6;
    p.h = 8 + Math.random() * 8;
    p.color = colors[(Math.random() * colors.length) | 0];
    p.vx = (Math.random() - 0.5) * 1.6;
    p.vy = 2 + Math.random() * 3;
    p.rot = Math.random() * Math.PI * 2;
    p.vr = (Math.random() - 0.5) * 0.3;
    p.sway = Math.random() * Math.PI * 2;
}

function stopConfetti(){
    if (confettiRAF){
        cancelAnimationFrame(confettiRAF);
        confettiRAF = null;
    }
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

const FW_COLORS = ["#38dc85", "#ffcb3d", "#ff6b70", "#4d9bff", "#c86bff", "#ffffff", "#ff9f43"];

function launchFireworks(){
    const rect = fireworksCanvas.getBoundingClientRect();
    fireworksCanvas.width = rect.width;
    fireworksCanvas.height = rect.height;
    const W = fireworksCanvas.width;
    const H = fireworksCanvas.height;

    fwRockets = [];
    fwParticles = [];

    let launched = 0;
    let nextLaunch = 0;
    const maxLaunch = 6;
    const start = performance.now();

    function spawnRocket(){
        fwRockets.push({
            x: W * (0.2 + Math.random() * 0.6),
            y: H + 10,
            vy: -(H * 0.013 + Math.random() * 2.4),
            targetY: H * (0.18 + Math.random() * 0.32),
            color: FW_COLORS[(Math.random() * FW_COLORS.length) | 0]
        });
    }

    function explode(x, y, color){
        const n = 42 + (Math.random() * 28 | 0);
        for (let i = 0; i < n; i++){
            const ang = (Math.PI * 2 * i) / n + Math.random() * 0.2;
            const speed = 1.8 + Math.random() * 4.1;
            fwParticles.push({
                x, y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                life: 1,
                decay: 0.012 + Math.random() * 0.014,
                color: Math.random() < 0.15 ? "#ffffff" : color,
                size: 2 + Math.random() * 2
            });
        }
    }

    if (fireworksRAF) cancelAnimationFrame(fireworksRAF);
    let lastVFX = 0;

    function frame(now){
        fireworksRAF = requestAnimationFrame(frame);
        if (now - lastVFX < FRAME_MS) return;
        lastVFX = now;
        const t = now - start;
        fwctx.clearRect(0, 0, W, H);

        if (launched < maxLaunch && t >= nextLaunch){
            spawnRocket();
            launched++;
            nextLaunch = t + 130 + Math.random() * 170;
        }

        for (let i = fwRockets.length - 1; i >= 0; i--){
            const r = fwRockets[i];
            r.y += r.vy;
            r.vy += 0.05;
            fwctx.fillStyle = r.color;
            fwctx.beginPath();
            fwctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
            fwctx.fill();
            if (r.y <= r.targetY || r.vy >= 0){
                explode(r.x, r.y, r.color);
                fwRockets.splice(i, 1);
            }
        }

        let len = fwParticles.length;
        for (let i = len - 1; i >= 0; i--){
            const p = fwParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.04;
            p.vx *= 0.99;
            p.vy *= 0.99;
            p.life -= p.decay;
            if (p.life <= 0){ fwParticles[i] = fwParticles[--len]; continue; }
            fwctx.globalAlpha = p.life;
            fwctx.fillStyle = p.color;
            fwctx.beginPath();
            fwctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            fwctx.fill();
        }
        fwParticles.length = len;
        fwctx.globalAlpha = 1;

        const active = fwRockets.length || len || launched < maxLaunch;
        if (!active || t >= 4500){
            cancelAnimationFrame(fireworksRAF);
            fwctx.clearRect(0, 0, W, H);
            fireworksRAF = null;
        }
    }
    fireworksRAF = requestAnimationFrame(frame);
}

function stopFireworks(){
    if (fireworksRAF){
        cancelAnimationFrame(fireworksRAF);
        fireworksRAF = null;
    }
    fwRockets = [];
    fwParticles = [];
    fwctx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
}

function onOverlayContinue(){
    // Advance to next level on a win, retry the same level on a fail.
    haptic("tap");
    const won = overlayCard.classList.contains("win");
    // Win card already incremented `level`; gate on the level that just ended.
    const gateLevel = won ? Math.max(1, (level | 0) - 1) : (level | 0);
    const advance = () => {
        adsOpportunityLevel = null;
        saveProgress();
        startGame();
    };
    if (window.Ads && typeof Ads.showInterstitial === "function") {
        adsOpportunityLevel = gateLevel;
        Ads.showInterstitial(won ? "level_complete" : "level_fail").then(advance);
    } else {
        advance();
    }
}

function openSettings(){
    // Only show Restart when opened from the game screen.
    const inGame = gameScreen.classList.contains("active");
    const tutorialBlocksSettings = csTutorial && csTutorial.phase !== "level-reminder";
    if (inGame && (csIntro || csLevelDone || csGameOver || tutorialBlocksSettings ||
        settingsBtnGame.disabled)) return;
    closeQuitConfirm();
    settingsQuit.style.display = inGame ? "block" : "none";
    sfxPopup();
    settingsOverlay.classList.add("show");
    if (window.SettingsBlockToggles) SettingsBlockToggles.refresh();
}

function closeSettings(){
    settingsOverlay.classList.remove("show");
    if (window.SettingsBlockToggles && typeof SettingsBlockToggles.dispose === "function") {
        SettingsBlockToggles.dispose();
    }
}

function openQuitConfirm(){
    const inGame = gameScreen.classList.contains("active");
    const tutorialBlocksQuit = csTutorial && csTutorial.phase !== "level-reminder";
    if (!inGame || csIntro || csLevelDone || csGameOver || tutorialBlocksQuit ||
        backBtnGame.disabled) return;
    closeSettings();
    sfxPopup();
    quitConfirm.classList.add("show");
}

function closeQuitConfirm(){
    quitConfirm.classList.remove("show");
}

function quitToHome(){
    // Splash-styled cover (same as startGame), then swap to home under it.
    clearTimeout(fadeTimer);
    stopLoop();
    stopBackgroundAudio();
    fadeBlack.classList.add("show");
    fadeTimer = setTimeout(() => {
        try {
            closeSettings();
            closeQuitConfirm();
            hideOverlay();
            clearIntro();
            clearOutro();
            // Drop game + Spine WebGL before HomeBoard claims a context. Without
            // this, Capacitor WebViews often lose the game canvas after quit→play.
            releaseGameGpu();
            showScreen(startScreen);
        } catch (err) {
            console.error("[KPF] quitToHome failed", err);
        } finally {
            requestAnimationFrame(() => fadeBlack.classList.remove("show"));
        }
    }, 420);
}

function restartLevel(){
    closeSettings();
    closeQuitConfirm();
    stopLoop();
    clearIntro();
    clearOutro();
    if (window.AdOffers) AdOffers.hideAll();
    const advance = () => {
        adsOpportunityLevel = null;
        startGame();
    };
    if (window.Ads && typeof Ads.showInterstitial === "function") {
        adsOpportunityLevel = level | 0;
        Ads.showInterstitial("level_fail").then(advance);
    } else {
        advance();
    }
}

playBtn.addEventListener("click", () => { sfxClick(); startGame(); });
overlayBtn.addEventListener("click", () => { sfxClick(); onOverlayContinue(); });
csHintBtn.addEventListener("click", onHintPress);
csHintBtn.addEventListener("animationend", (event) => {
    if (event.animationName === "csHintButtonPress") {
        csHintBtn.classList.remove("is-pressed");
    }
});
debugWin.addEventListener("click", () => { levelComplete(); });
debugFail.addEventListener("click", () => { levelFailed(); });
debugProgress.addEventListener("click", () => {
    if (!window.ProgressRewards) return;
    ProgressRewards.UpdateProgress();
});
(function wireDebugFaceCycle() {
    const btn = document.getElementById("debugFaceCycle");
    if (!btn) return;
    let faceIdx = -1;
    const charId = () => (window.BlockCharacters && typeof BlockCharacters.getSelectedCharacter === "function")
        ? BlockCharacters.getSelectedCharacter()
        : "?";
    const label = () => {
        const list = (window.BlockCharacters && typeof BlockCharacters.listExpressions === "function")
            ? BlockCharacters.listExpressions(null)
            : [];
        if (!list.length) {
            btn.textContent = "Face: —";
            return;
        }
        const i = faceIdx < 0 ? 0 : (((faceIdx % list.length) + list.length) % list.length);
        const name = faceIdx < 0 ? "—" : list[i].id;
        btn.textContent = charId() + ": " + name + " (" + (faceIdx < 0 ? 0 : (i + 1)) + "/" + list.length + ")";
        btn.title = "Cycle faces for selected character (" + charId() + ")";
    };
    label();
    btn.addEventListener("click", () => {
        if (!window.BlockCharacters || typeof BlockCharacters.setAllBlockExpressions !== "function") {
            return;
        }
        const list = BlockCharacters.listExpressions(null);
        if (!list.length) return;
        faceIdx = (faceIdx + 1) % list.length;
        const result = BlockCharacters.setAllBlockExpressions(faceIdx, {
            playIntro: true,
            force: true,
            blocks: blocks
        });
        if (result) {
            btn.textContent = charId() + ": " + result.id + " (" + (result.index + 1) + "/" + result.total + ")";
            console.log("[debug] face →", charId(), result.id, "on", result.count, "blocks");
        } else {
            label();
        }
    });
    // Let the character cycle button reset the face label after a pet swap.
    btn._bcDebugFaceLabel = label;
    btn._bcDebugFaceReset = () => { faceIdx = -1; label(); };
})();
(function wireDebugCharCycle() {
    const btn = document.getElementById("debugCharCycle");
    if (!btn) return;
    const catalogIds = () => {
        const cat = (window.BlockCharacters && typeof BlockCharacters.getCatalog === "function")
            ? BlockCharacters.getCatalog()
            : (window.CHARACTER_CATALOG || {});
        return Object.keys(cat);
    };
    const label = () => {
        const id = (window.BlockCharacters && typeof BlockCharacters.getSelectedCharacter === "function")
            ? BlockCharacters.getSelectedCharacter()
            : "?";
        const ids = catalogIds();
        const i = ids.indexOf(id);
        btn.textContent = "Char: " + id + (ids.length ? " (" + (i < 0 ? "?" : (i + 1)) + "/" + ids.length + ")" : "");
        btn.title = "Cycle block characters — unlocks + swaps live blocks (" + ids.join(" / ") + ")";
    };
    label();
    btn.addEventListener("click", () => {
        if (!window.BlockCharacters || typeof BlockCharacters.setSelectedCharacter !== "function") {
            return;
        }
        const ids = catalogIds();
        if (!ids.length) return;
        const cur = BlockCharacters.getSelectedCharacter();
        const next = ids[(Math.max(0, ids.indexOf(cur)) + 1) % ids.length];
        const ok = BlockCharacters.setSelectedCharacter(next, {
            unlock: true,
            blocks: blocks
        });
        label();
        const faceBtn = document.getElementById("debugFaceCycle");
        if (faceBtn && typeof faceBtn._bcDebugFaceReset === "function") {
            faceBtn._bcDebugFaceReset();
        }
        console.log("[debug] character →", ok ? next : ("failed (" + next + ")"));
    });
})();
(function wireDebugSpineToggle() {
    const btn = document.getElementById("debugSpineToggle");
    if (!btn) return;
    const label = () => {
        const on = !(window.BlockCharacters && typeof BlockCharacters.getUseSpine === "function")
            || BlockCharacters.getUseSpine();
        btn.textContent = on ? "Spine: On" : "Spine: Off";
        btn.title = on
            ? "Spine faces on — click to use static PNG fallback (perf A/B)"
            : "Static PNG faces — click to re-enable Spine";
    };
    label();
    btn.addEventListener("click", () => {
        if (!window.BlockCharacters || typeof BlockCharacters.setUseSpine !== "function") {
            return;
        }
        const next = !BlockCharacters.getUseSpine();
        BlockCharacters.setUseSpine(next, { blocks: blocks });
        label();
        console.log("[debug] Spine playback →", next ? "on" : "off (static PNG)");
    });
})();
debugLang.addEventListener("click", toggleLanguage);
debugToggle.addEventListener("click", () => {
    debugPanel.classList.toggle("collapsed");
});

(function wireDebugViewToggles() {
    const hidePanelBtn = document.getElementById("debugHidePanel");
    const hideUiBtn = document.getElementById("debugHideUi");
    if (!hidePanelBtn || !hideUiBtn) return;

    const isTypingTarget = (el) =>
        /^(INPUT|TEXTAREA|SELECT)$/.test((el && el.tagName) || "");

    const setDebugGone = (gone) => {
        debugPanel.classList.toggle("debug-gone", !!gone);
        if (gone) {
            debugPanel.classList.remove("mixer-open", "cs3d-open", "home-open");
            const meter = document.getElementById("meterPanel");
            if (meter) meter.classList.remove("show");
        }
    };

    const setHideUi = (hidden) => {
        document.body.classList.toggle("hide-game-ui", !!hidden);
        if (hidden) {
            // Collapse nested debug panels so they don't pop back open oddly.
            debugPanel.classList.remove("mixer-open", "cs3d-open", "home-open");
            const meter = document.getElementById("meterPanel");
            if (meter) meter.classList.remove("show");
            if (typeof closeSettings === "function") closeSettings();
        }
    };

    hidePanelBtn.addEventListener("click", () => setDebugGone(true));
    hideUiBtn.addEventListener("click", () => setHideUi(true));

    window.addEventListener("keydown", (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isTypingTarget(event.target)) return;
        const key = (event.key || "").toLowerCase();
        if (key === "h") {
            // Toggle debug panel visibility (restore when fully hidden).
            setDebugGone(!debugPanel.classList.contains("debug-gone"));
            event.preventDefault();
        } else if (key === "u") {
            setHideUi(!document.body.classList.contains("hide-game-ui"));
            event.preventDefault();
        }
    });
})();

document.getElementById("debug3dToggle").addEventListener("click", () => {
    const opening = !debugPanel.classList.contains("cs3d-open");
    debugPanel.classList.remove("mixer-open", "home-open", "collapsed");
    debugPanel.classList.toggle("cs3d-open", opening);
    if (opening && cs3dDebugRefresh) cs3dDebugRefresh();
});
window.addEventListener("keydown", (event) => {
    if ((event.key || "").toLowerCase() !== "d" ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const opening = !debugPanel.classList.contains("cs3d-open");
    debugPanel.classList.remove("mixer-open", "home-open", "collapsed");
    debugPanel.classList.toggle("cs3d-open", opening);
    if (opening && cs3dDebugRefresh) cs3dDebugRefresh();
});
document.getElementById("debugFpsToggle").addEventListener("click", (e) => {
    cs3dSetPerfHud(!csPerfOn);
    e.currentTarget.blur();
});
cs3dSetPerfHud(csPerfOn); // reflect initial state on the button
debugSkipLevel.addEventListener("click", () => {
    const val = parseInt(debugLevelInput.value, 10);
    if (val >= 1) {
        level = val;
        saveProgress();
        debugLevelInput.value = "";
        csSkipNextIntro = true; // debug jumps bypass the level intro
        startGame();
    }
});
debugSetStreak.addEventListener("click", () => {
    if (!window.DailyStreak || typeof DailyStreak.SetStreakDay !== "function") return;
    const raw = debugStreakInput.value;
    if (raw === "" || raw == null) return;
    const val = parseInt(raw, 10);
    if (!Number.isFinite(val) || val < 0) return;
    DailyStreak.SetStreakDay(val);
    debugStreakInput.value = "";
});
if (debugStreakAdvance) {
    debugStreakAdvance.addEventListener("click", () => {
        if (!window.DailyStreak || typeof DailyStreak.DebugAdvanceAndCelebrate !== "function") return;
        DailyStreak.DebugAdvanceAndCelebrate();
    });
}
if (debugRewardFlow) {
    // The reward bar is embedded in the win card, so replay the real win-card
    // path (minus the streak beat) rather than opening the module standalone —
    // that way the inline bar, chest takeover and claim all read as in game.
    debugRewardFlow.addEventListener("click", () => {
        if (!window.ProgressRewards ||
            typeof ProgressRewards.DebugArmNextUnlock !== "function") return;
        if (!ProgressRewards.DebugArmNextUnlock()) return;
        clearTimeout(progressRewardTimer);
        ProgressRewards.hide();
        const finishedLevel = Math.max(1, level - 1);
        presentLevelCompleteUI(finishedLevel);
        queueProgressRewardFlow({ completedLevel: finishedLevel });
    });
}
debugReset.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.level);
    localStorage.removeItem(STORAGE_KEYS.mechanicTutorials);
    localStorage.removeItem(STORAGE_KEYS.hintTutorial);
    localStorage.removeItem(STORAGE_KEYS.failedExpansionTutorial);
    if (window.ProgressRewards) ProgressRewards.ResetProgress();
    if (window.DailyStreak) DailyStreak.Reset();
    if (window.Items && typeof Items.Reset === "function") Items.Reset();
    else if (window.Inventory) Inventory.Reset();
    if (window.BlockCharacters && typeof BlockCharacters.Reset === "function") {
        BlockCharacters.Reset();
    }
    location.reload();
});

document.getElementById("debugResetFtue").addEventListener("click", () => {
    // Clear persisted FTUE / tutorial completion without wiping level progress.
    completedMechanicTutorials.clear();
    localStorage.removeItem(STORAGE_KEYS.mechanicTutorials);
    completedHintTutorial = false;
    localStorage.removeItem(STORAGE_KEYS.hintTutorial);
    completedFailedExpansionTutorial = false;
    localStorage.removeItem(STORAGE_KEYS.failedExpansionTutorial);
    if (typeof failedExpansionStreak !== "undefined") failedExpansionStreak = 0;
    if (typeof hideHintFeatureIntro === "function") hideHintFeatureIntro();
    if (typeof hideTutorial === "function") hideTutorial();
    const inGame = gameScreen.classList.contains("active");
    if (inGame && !csIntro && !csLevelDone && !csGameOver &&
        typeof startLevelTutorial === "function") {
        startLevelTutorial();
        console.log("[debug] FTUE reset — replaying tutorials on this level");
    } else {
        console.log("[debug] FTUE reset — tutorials will play on next eligible level start");
    }
});

// Mixer toggle (also shows/hides loudness meter)
const meterPanel = document.getElementById("meterPanel");
document.getElementById("debugMixerToggle").addEventListener("click", () => {
    const opening = !debugPanel.classList.contains("mixer-open");
    debugPanel.classList.remove("cs3d-open", "home-open", "ads-open");
    debugPanel.classList.toggle("mixer-open", opening);
    if (opening) {
        meterPanel.classList.add("show");
        startMeter();
    } else {
        meterPanel.classList.remove("show");
        stopMeter();
    }
});

(function wireAdsDebugPanel() {
    const adsToggle = document.getElementById("debugAdsToggle");
    const gateEl = document.getElementById("debugAdGate");
    const noFill = document.getElementById("debugAdNoFill");
    if (!adsToggle) return;

    function refreshGate() {
        if (!gateEl || !window.Ads || typeof Ads.getInterstitialGate !== "function") {
            if (gateEl) gateEl.textContent = "Ads not ready";
            return;
        }
        try {
            gateEl.textContent = JSON.stringify(Ads.getInterstitialGate(), null, 2);
        } catch (err) {
            gateEl.textContent = String(err);
        }
    }

    adsToggle.addEventListener("click", () => {
        const opening = !debugPanel.classList.contains("ads-open");
        debugPanel.classList.remove("mixer-open", "cs3d-open", "home-open");
        debugPanel.classList.toggle("ads-open", opening);
        meterPanel.classList.remove("show");
        stopMeter();
        if (opening) refreshGate();
    });

    const intBtn = document.getElementById("debugAdInt");
    const rvBtn = document.getElementById("debugAdRv");
    const bannerBtn = document.getElementById("debugAdBanner");
    const bannerHide = document.getElementById("debugAdBannerHide");
    if (intBtn) {
        intBtn.addEventListener("click", () => {
            if (!window.Ads) return;
            Ads.showInterstitial("debug").then(refreshGate);
        });
    }
    if (rvBtn) {
        rvBtn.addEventListener("click", () => {
            if (!window.Ads) return;
            Ads.showRewardedAd("debug").then(refreshGate);
        });
    }
    if (bannerBtn) {
        bannerBtn.addEventListener("click", () => {
            if (!window.Ads) return;
            Ads.showBanner("debug").then(refreshGate);
        });
    }
    if (bannerHide) {
        bannerHide.addEventListener("click", () => {
            if (!window.Ads) return;
            Ads.hideBanner().then(refreshGate);
        });
    }
    if (noFill) {
        noFill.addEventListener("change", () => {
            if (window.Ads && typeof Ads.setForceNoFill === "function") {
                Ads.setForceNoFill(!!noFill.checked);
            }
            refreshGate();
        });
    }
})();

document.getElementById("meterReset").addEventListener("click", resetMeter);

// Init mixer controls
initMixerControls();
preloadAllAudio();

settingsBtnStart.addEventListener("click", openSettings);
settingsBtnGame.addEventListener("click", openSettings);
backBtnGame.addEventListener("click", () => {
    if (backBtnGame.disabled) return;
    openQuitConfirm();
});
settingsClose.addEventListener("click", () => { sfxClick(); closeSettings(); });

settingsQuit.addEventListener("click", () => {
    sfxClick();
    restartLevel();
});
quitYes.addEventListener("click", () => {
    sfxClick();
    closeQuitConfirm();
    quitToHome();
});
quitNo.addEventListener("click", () => {
    sfxClick();
    closeQuitConfirm();
});

// Settings closes via X / Android back only — not backdrop tap (SP-958).
quitConfirm.addEventListener("click", (e) => {
    if (e.target === quitConfirm) {
        sfxClick();
        closeQuitConfirm();
    }
});

// Native Android back presses must never dismiss a tutorial or result flow,
// because both require their on-screen action to advance the game lifecycle.
(function initAndroidBackHandling() {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    const consumeBackButton = (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
    };
    const handleBackButton = (event) => {
        if (quitConfirm.classList.contains("show")) {
            consumeBackButton(event);
            closeQuitConfirm();
            return;
        }
        if (settingsOverlay.classList.contains("show")) {
            consumeBackButton(event);
            closeSettings();
            return;
        }
        const protectedFlow = csIntro || csTutorial || csLevelDone || csGameOver ||
            overlay.classList.contains("show") || flavourText.classList.contains("show") ||
            failText.classList.contains("show");
        if (protectedFlow) {
            consumeBackButton(event);
            return;
        }
        if (gameScreen.classList.contains("active")) {
            consumeBackButton(event);
            openQuitConfirm();
            return;
        }
        if (App && typeof App.exitApp === "function") App.exitApp();
    };
    // Some Android shells emit Cordova's DOM event instead of Capacitor's plugin event.
    document.addEventListener("backbutton", handleBackButton);
    if (App && typeof App.addListener === "function") {
        App.addListener("backButton", handleBackButton);
    }
})();

// Locked tab toasts
document.querySelectorAll(".home-bar .tab.locked").forEach((tab) => {
    tab.addEventListener("click", () => {
        haptic("tap");
        sfxClick();
        const rect = tab.getBoundingClientRect();
        const appRect = tab.closest(".app").getBoundingClientRect();
        const toast = document.createElement("span");
        toast.className = "locked-toast";
        toast.textContent = t("keepPlaying");
        toast.style.top = (rect.top - appRect.top - 8) + "px";
        tab.closest(".app").appendChild(toast);
        // Centre on the tab, clamped so it stays on-screen
        const tw = toast.offsetWidth;
        const centre = rect.left - appRect.left + rect.width / 2;
        const left = Math.max(8, Math.min(appRect.width - tw - 8, centre - tw / 2));
        toast.style.left = left + "px";
        toast.addEventListener("animationend", () => toast.remove());
    });
});

// ---------- Orientation Lock (PORTRAIT ONLY) ----------
// The game must never rotate to landscape. In Capacitor builds the native
// manifest (android:screenOrientation="portrait") prevents rotation at the OS
// level. We also call the Capacitor ScreenOrientation plugin as a belt-and-
// suspenders measure.
//
// IMPORTANT: We intentionally do NOT call screen.orientation.lock() in plain
// browsers because Chrome shows a "rotate" button in the bottom-left corner
// whenever it detects a JS orientation lock, which lets users override it.
// By skipping it, that button never appears.
(function lockPortrait() {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;
    // Capacitor ScreenOrientation plugin (preferred — native-level lock)
    const { ScreenOrientation } = window.Capacitor.Plugins;
    if (ScreenOrientation && ScreenOrientation.lock) {
        ScreenOrientation.lock({ orientation: "portrait" }).catch(() => {});
    }
    // Fallback: standard API inside Capacitor's webview (no Chrome rotate button
    // appears because the Activity manifest already locks orientation).
    const so = window.screen && window.screen.orientation;
    if (so && typeof so.lock === "function") {
        Promise.resolve(so.lock("portrait-primary")).catch(() => {
            Promise.resolve(so.lock("portrait")).catch(() => {});
        });
    }
})();

applyLanguage();
updateLevelLabels();
csInit();

// Preload cat Spine + idle face cache during boot / splash so expands are ready.
if (window.BlockCharacters) {
    if (typeof BlockCharacters.init === "function") BlockCharacters.init();
    else if (typeof BlockCharacters.preloadSelectedSpine === "function") {
        BlockCharacters.preloadSelectedSpine();
    }
}

if (window.WinFeedback) {
    WinFeedback.init({
        getCopy: (key) => t(key)
    });
}

if (window.ProgressRewards) {
    ProgressRewards.init({
        root: overlayProgress,
        embed: true,
        getCopy: (key) => t(key),
        // Streak celebration runs first; DailyStreak forwards via onStreakFlowDone.
        listenToLevelComplete: false,
        chestBarSizePx: 104,
        onComplete: () => { revealNextButton(); },
        onBarProgress: () => {
            playSound("sfx_barmovement");
            haptic("tap");
        },
        onBarFilled: () => {
            playSound("sfx_streakunlocked");
            haptic("heavy");
        },
        // Crate leaves the bar and flies to centre...
        onChestUnlockStart: () => {
            playSound("sfx_giftboxmovement");
            haptic("tap");
        },
        // ...then bursts open once it lands.
        onChestOpen: () => {
            playSound("sfx_giftboxunlock");
            haptic("heavy");
        },
        onFeaturePopup: () => {
            playSound("sfx_newfeaturepopup");
            haptic("success");
        },
        onClaimPress: () => {
            playSound("sfx_button");
            haptic("tap");
        },
        onClaim: () => {
            // A reward was claimed this flow: collapse the bar on the way back
            // to the win card so the moment stays about the prize.
            progressRewardClaimed = true;
            overlayCard.classList.add("progress-claiming");
            if (typeof updateHintButton === "function") updateHintButton();
        }
    });
}

if (window.DailyStreak) {
    DailyStreak.init({
        root: document.querySelector(".app") || document.body,
        homeRoot: startScreen,
        getCopy: (key) => t(key),
        // Host calls OnLevelComplete so the win-card intro can wait on streak close.
        listenToLevelComplete: false,
        onOpen: () => {
            playSound("sfx_streakpopup");
            haptic("tap");
        },
        // The streak-up beat: whoosh under the number roll, then an ascending
        // pitch as the day lights up so day 7 lands higher than day 1.
        onCountTick: () => {
            playSound("sfx_barmovement");
            haptic("heavy");
        },
        onSlotLit: (info) => {
            const day = Math.max(1, (info && info.day) || 1);
            const steps = Math.max(1, (info && info.cycleLength) || 7);
            const index = ((day - 1) % steps) + 1;
            playSound("expand_" + Math.min(11, index));
            haptic("tap");
        },
        onCtaPress: () => { playSound("sfx_button"); haptic("tap"); },
        onGiftPress: () => { playSound("sfx_button"); haptic("tap"); },
        onRewardUnlocked: () => {
            playSound("sfx_streakunlocked");
            haptic("success");
        },
        onKeepStreak: () => {
            playSound("sfx_button");
            haptic("tap");
            if (!window.Ads || typeof Ads.showRewardedAd !== "function") {
                if (window.AdOffers) AdOffers.showToast(t("adUnavailable"));
                return Promise.resolve(false);
            }
            return Ads.showRewardedAd("keep_streak").then((res) => {
                if (res && res.earned) {
                    DailyStreak.recoverStreak();
                    return true;
                }
                if (window.AdOffers) AdOffers.handleRewardResult(res);
                return false;
            });
        },
        onResetStreak: () => {
            playSound("sfx_button");
            haptic("tap");
        },
        onStreakFlowDone: (detail) => {
            // Debug "Streak +1" only exercises the streak overlay — don't chain
            // the win card or ProgressRewards after Continue.
            if (detail && detail.__debugStreak) return;
            if (pendingWinFinishedLevel != null) {
                const finishedLevel = pendingWinFinishedLevel;
                pendingWinFinishedLevel = null;
                presentLevelCompleteUI(finishedLevel);
            }
            queueProgressRewardFlow(detail || {});
        }
    });
}

if (window.Ads) {
    Ads.init({
        config: window.ADS_CONFIG,
        getLevel: () => (adsOpportunityLevel != null ? adsOpportunityLevel : level),
        mount: document.querySelector(".app") || document.body,
        translate: t,
        onAdOpen: () => {
            _loopWasRunningBeforeAd = isLoopRunning();
            stopLoop();
            stopBackgroundAudio();
        },
        onAdClose: () => {
            if (_actx && _actx.state === "suspended") _actx.resume();
            if (_loopWasRunningBeforeAd) {
                startLoop();
                playBackgroundAudio();
            }
        },
        onBannerHeightChange: () => {
            // No visual-preset resize helper in this project; CSS vars handle inset.
        }
    });
}

if (window.AdOffers) AdOffers.init();

// Load the authoritative level list from LEVELS.json (served over HTTP).
// Falls back silently to the inline LEVELS default if it can't be fetched.
(function loadLevelsFile(){
    fetch("LEVELS.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
            if (Array.isArray(data) && data.length && Array.isArray(data[0].grid)) {
                LEVELS = data;
                // If the current level is already on screen, rebuild it from the
                // freshly loaded data so nothing is drawn from the stale fallback.
                if (gameScreen.classList.contains("active") && !csLevelDone && !csGameOver) {
                    csLoadLevel(level);
                }
            }
        })
        .catch(() => { /* keep inline fallback */ });
})();

// ---------- Splash sequence ----------
// Show content, animate the loading bar across the hold period, then transition.
(function runSplash() {
    const SPLASH_TOTAL_MS = 2600;
    const BAR_START_MS    = 200;
    const BAR_END_MS      = 2000;
    const FADE_OUT_MS     = 400;

    // Reveal the splash content (title + logo + bar).
    setTimeout(() => {
        if (splashContent) splashContent.classList.add("visible");
    }, 80);

    // Smoothly animate the loading bar with requestAnimationFrame + ease-out.
    let splashStart = null;
    let splashDone = false;
    function splashTick(now) {
        if (!splashStart) splashStart = now;
        const elapsed = now - splashStart;
        const barDuration = BAR_END_MS - BAR_START_MS;
        const t = Math.min(1, Math.max(0, (elapsed - BAR_START_MS) / barDuration));
        // ease-out cubic for a snappy start that decelerates smoothly
        const eased = 1 - Math.pow(1 - t, 3);
        const pct = eased * 100;
        if (splashBarFill) splashBarFill.style.width = pct.toFixed(1) + "%";
        if (t >= 1 && !splashDone) {
            splashDone = true;
            if (splashBarFill) splashBarFill.classList.add("complete");
            if (splashBarLabel) splashBarLabel.textContent = t("splashReady");
        }
        if (t < 1) requestAnimationFrame(splashTick);
    }
    requestAnimationFrame(splashTick);

    // Fade out the splash content, then switch screen.
    setTimeout(() => {
        if (splashContent) splashContent.classList.remove("visible");
    }, SPLASH_TOTAL_MS - FADE_OUT_MS);

    setTimeout(() => {
        if (level === 1) {
            // First-time player: skip home, go straight into level 1 via
            // startGame() so analytics (kpf:levelStarted) fires for Level 1.
            startGame();
        } else {
            showScreen(startScreen);
            setTimeout(() => {
                if (window.DailyStreak && typeof DailyStreak.ShowStreakDangerPopup === "function") {
                    DailyStreak.ShowStreakDangerPopup();
                }
            }, 1000);
        }
    }, SPLASH_TOTAL_MS);
})();


