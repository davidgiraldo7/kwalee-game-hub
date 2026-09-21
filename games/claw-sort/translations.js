/*
 * ============================================================
 *  Mobile Game UI — Editable Text / Localisation
 * ============================================================
 *  ⚠️  ALL user-visible text MUST be defined here.
 *  NEVER hard-code strings directly in index.html.
 *
 *  HOW TO ADD A NEW STRING:
 *    1. Add a  key: "text"  entry inside BOTH "en" and "pl".
 *       e.g.   welcome: "Welcome!"   (en)
 *              welcome: "Witaj!"     (pl)
 *    2. You MUST provide a Polish translation — do not leave
 *       the "pl" value in English.
 *    3. Show it in the UI in one of two ways:
 *       - In index.html add  data-i18n="welcome"  to an element, OR
 *       - In the script use  t("welcome")  to read the value.
 *
 *  HOW TO ADD A NEW LANGUAGE:
 *    1. Copy the whole "en" block, rename it (e.g. "de"),
 *       and translate every value.
 *    2. Add the language code to LANGUAGE_ORDER below so the
 *       debug button can cycle to it.
 *
 *  NOTE: Use \n inside a string to force a line break
 *        (e.g. the "completeTitle" splits onto two lines).
 * ============================================================
 */

// Order the in-game language toggle cycles through.
window.LANGUAGE_ORDER = ["en", "pl"];

window.GAME_TEXT = {
  en: {
    language:         "Polski",              // label shown on the toggle (the language you switch TO)
    level:            "Level",
    debug:            "Debug",
    debugComplete:    "Level Complete",
    debugFail:        "Level Failed",
    completeTitle:    "Level\nComplete!",
    completeSubtitle: "Great job.",
    failTitle:        "Level Failed",
    failSubtitle:     "Try again.",
    retry:            "Retry",
    settings:         "Settings",
    music:            "Music",
    sound:            "Sound",
    haptics:          "Vibration",
    quit:             "Quit to Home",
    tabHome:          "Home",
    tabLocked:        "Locked",
    wellDone:         "Well Done!",
    debugGo:          "Go",
    debugDeleteProgress: "Delete Progress",
    debugShowColliders: "Show Colliders",
    debugHideColliders: "Hide Colliders",
    debugRushOn:      "Force Belt Rush",
    debugRushOff:     "Belt Rush Off",
    debugBeltWarnOn:  "Force Belt Warn",
    debugBeltWarnOff: "Belt Warn Off",
    debugRottenBeltTest: "Rotten Belt Test",
    debugHide:        "Hide Debug Menu",
    debugMixerTitle:  "Mixer",
    debugLightingTitle: "Lighting",
    debugLightingAmbient: "Ambient",
    debugLightingHemisphere: "Hemisphere",
    debugLightingKey: "Key",
    debugLightingFill: "Fill",
    debugLightingColor: "Color",
    debugLightingSky: "Sky",
    debugLightingGround: "Ground",
    debugLightingIntensity: "Intensity",
    debugLightingPosX: "Pos X",
    debugLightingPosY: "Pos Y",
    debugLightingPosZ: "Pos Z",
    debugLightingShadowBias: "Shadow Bias",
    debugLightingNormalBias: "Normal Bias",
    debugLightingShadowRadius: "Shadow Radius",
    debugLightingExport: "Export",
    debugLightingCopy: "Copy",
    debugLightingCopied: "Copied",
    debugLightingHint: "Export then paste the JSON back into chat.",
    debugLightingExportPlaceholder: "Lighting export will appear here",
    quitConfirmTitle: "Are you sure?",
    quitConfirmMsg:   "You will lose level progress",
    quitYes:          "Quit",
    quitCancel:       "Cancel",
    keepPlaying:      "Keep playing to unlock",
    rotateDevice:     "Please rotate your device to portrait mode",
    // FTUE — keep ftueCopy_<mechanic.field> in sync with CLAW_MECHANICS.
    // A missing copy key means that mechanic intro is skipped.
    debugResetFtue:   "Reset FTUE",
    ftueCollectAll:   "Tap and drag to move the claw and collect all the balls",
    ftueTapContinue:  "Tap to continue",
    ftueCopy_beltWarning:   "The belt is running out of spaces, be careful of what color you pick next.",
    ftueCopy_rottenFruit:   "These balls will occupy your conveyor, try to avoid them.",
    ftueCopy_mysteryBall:   "This ball hides its true color until its added to the belt.",
    ftueCopy_bomb:          "This bomb explodes when it reaches the belt, removing all balls from the conveyor.",
    ftueCopy_breakableBox:  "Drop this to smash and free the balls inside."
  },

  pl: {
    language:         "English",
    level:            "Poziom",
    debug:            "Debug",
    debugComplete:    "Poziom Ukończony",
    debugFail:        "Poziom Nieudany",
    completeTitle:    "Poziom\nUkończony!",
    completeSubtitle: "Dobra robota.",
    failTitle:        "Poziom Nieudany",
    failSubtitle:     "Spróbuj ponownie.",
    retry:            "Ponów",
    settings:         "Ustawienia",
    music:            "Muzyka",
    sound:            "Dźwięk",
    haptics:          "Wibracje",
    quit:             "Wyjdź do Domu",
    tabHome:          "Dom",
    tabLocked:        "Zablokowane",
    wellDone:         "Świetnie!",
    debugGo:          "Idź",
    debugDeleteProgress: "Usuń Postęp",
    debugShowColliders: "Pokaż Kolizje",
    debugHideColliders: "Ukryj Kolizje",
    debugRushOn:      "Wymuś pęd taśmy",
    debugRushOff:     "Pęd taśmy wył.",
    debugBeltWarnOn:  "Wymuś ostrzeżenie taśmy",
    debugBeltWarnOff: "Ostrzeżenie taśmy wył.",
    debugRottenBeltTest: "Test zgniłej taśmy",
    debugHide:        "Ukryj menu debug",
    debugMixerTitle:  "Mikser",
    debugLightingTitle: "Oświetlenie",
    debugLightingAmbient: "Otoczenie",
    debugLightingHemisphere: "Półkula",
    debugLightingKey: "Główne",
    debugLightingFill: "Wypełniające",
    debugLightingColor: "Kolor",
    debugLightingSky: "Niebo",
    debugLightingGround: "Podłoże",
    debugLightingIntensity: "Natężenie",
    debugLightingPosX: "Poz X",
    debugLightingPosY: "Poz Y",
    debugLightingPosZ: "Poz Z",
    debugLightingShadowBias: "Bias Cienia",
    debugLightingNormalBias: "Normal Bias",
    debugLightingShadowRadius: "Promień Cienia",
    debugLightingExport: "Eksport",
    debugLightingCopy: "Kopiuj",
    debugLightingCopied: "Skopiowano",
    debugLightingHint: "Wyeksportuj i wklej JSON z powrotem do czatu.",
    debugLightingExportPlaceholder: "Eksport oświetlenia pojawi się tutaj",
    quitConfirmTitle: "Jesteś pewien?",
    quitConfirmMsg:   "Stracisz postęp poziomu",
    quitYes:          "Wyjdź",
    quitCancel:       "Anuluj",
    keepPlaying:      "Graj dalej, aby odblokować",
    rotateDevice:     "Obróć urządzenie do trybu pionowego",
    debugResetFtue:   "Resetuj samouczek",
    ftueCollectAll:   "Dotknij i przeciągnij, aby przesunąć łapę i zebrać wszystkie kulki",
    ftueTapContinue:  "Dotknij, aby kontynuować",
    ftueCopy_beltWarning:   "Na taśmie kończy się miejsce, więc uważaj, jaki kolor wybierzesz jako następny.",
    ftueCopy_rottenFruit:   "Te kulki zajmują miejsce na taśmie, więc najlepiej ich unikać.",
    ftueCopy_mysteryBall:   "Ta kulka ukrywa swój prawdziwy kolor, dopóki nie trafi na taśmę.",
    ftueCopy_bomb:          "Ta bomba wybucha, gdy dotrze do taśmy, usuwając wszystkie kulki z przenośnika.",
    ftueCopy_breakableBox:  "Upuść to, aby rozbić i uwolnić kulki w środku."
  }
};
