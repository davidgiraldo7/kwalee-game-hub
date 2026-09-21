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
    failReasonMix:    "The different colours mixed!",
    retry:            "Retry",
    settings:         "Settings",
    music:            "Music",
    sound:            "Sound",
    haptics:          "Haptics",
    quit:             "Quit to Home",
    tabHome:          "Home",
    tabLocked:        "Locked",
    wellDone:         "Well Done!",
    debugGo:          "Go",
    debugDeleteProgress: "Delete Progress",
    quitConfirmTitle: "Are you sure?",
    quitConfirmMsg:   "You will lose level progress",
    quitYes:          "Quit",
    quitCancel:       "Cancel",
    keepPlaying:      "Keep playing to unlock",
    rotateDevice:     "Please rotate your device to portrait mode",

    // --- WaterBlockJam (tutorial + liquid names) ---
    ftueMoveL1:       "Drag the purple block",
    ftueMoveL2:       "to drain all the water!",
    ftueFlowL1:       "Water must have a path",
    ftueFlowL2:       "to flow to the drain.",
    ftueWater:        "Water",
    ftueDrain:        "Drain",
    ftueDrainsL1:     "Each colour of water",
    ftueDrainsL2:     "has its own drain.",
    ftueMixL1:        "Do not let the different colours mix!",
    ftueMixL2:        "cannot mix!",
    ftueGateL1:       "Slime blocks only melt away",
    ftueGateL2:       "once their colour is drained.",
    cheer1:           "Nice work!",
    cheer2:           "Well done!",
    cheer3:           "Great!",
    cheer4:           "Awesome!",
    cheer5:           "Perfect!",
    tapContinue:      "Tap to continue  \u25B8",
    liqRose:          "Rose",
    liqSky:           "Sky",
    liqMint:          "Mint",
    liqSun:           "Sun"
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
    failReasonMix:    "Różne kolory się wymieszały!",
    retry:            "Ponów",
    settings:         "Ustawienia",
    music:            "Muzyka",
    sound:            "Dźwięk",
    haptics:          "Wibracje",
    quit:             "Wróć do strony głównej",
    tabHome:          "Strona główna",
    tabLocked:        "Zablokowane",
    wellDone:         "Świetnie!",
    debugGo:          "Idź",
    debugDeleteProgress: "Usuń Postęp",
    quitConfirmTitle: "Jesteś pewien?",
    quitConfirmMsg:   "Stracisz postęp poziomu",
    quitYes:          "Wyjdź",
    quitCancel:       "Anuluj",
    keepPlaying:      "Graj dalej, aby odblokować",
    rotateDevice:     "Obróć urządzenie do trybu pionowego",

    // --- WaterBlockJam (tutorial + liquid names) ---
    ftueMoveL1:       "Przeciągnij fioletowy blok,",
    ftueMoveL2:       "aby spuścić całą wodę!",
    ftueFlowL1:       "Woda musi mieć drogę",
    ftueFlowL2:       "do odpływu.",
    ftueWater:        "Woda",
    ftueDrain:        "Odpływ",
    ftueDrainsL1:     "Każdy kolor wody",
    ftueDrainsL2:     "ma własny odpływ.",
    ftueMixL1:        "Nie pozwól, by różne kolory się zmieszały!",
    ftueMixL2:        "nie mogą się mieszać!",
    ftueGateL1:       "Bloki szlamu znikają dopiero,",
    ftueGateL2:       "gdy ich kolor zostanie spuszczony.",
    cheer1:           "Dobra robota!",
    cheer2:           "Świetnie!",
    cheer3:           "Super!",
    cheer4:           "Wspaniale!",
    cheer5:           "Idealnie!",
    tapContinue:      "Dotknij, aby kontynuować  \u25B8",
    liqRose:          "Róża",
    liqSky:           "Niebo",
    liqMint:          "Mięta",
    liqSun:           "Słońce"
  }
};
