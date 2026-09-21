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
    failSubtitle:     "You ran out of space",
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
    quitConfirmTitle: "Are you sure?",
    quitConfirmMsg:   "You will lose level progress",
    quitYes:          "Quit",
    quitCancel:       "Cancel",
    keepPlaying:      "Keep playing to unlock",
    rotateDevice:     "Please rotate your device to portrait mode",
    gameTitle:        "Sausage Sort",
    nextLevel:        "Next Level",
    letsGo:           "Let's go!",
    ftueTooltip:      "Tap a sausage on the tray to release it",
    howToPlayTitle:   "How to Play",
    howToPlaySub:     "Tap a sausage on the tray to send it to a matching bun",
    longTitle:        "Long Sausage!",
    longSub:          "Tap it to slice it into pieces!",
    bicolourTitle:    "Multi-Colored Sausage!",
    bicolourSub:      "Tap it to split it into its two colours!",
    hiddenTitle:      "Mystery Sausage!",
    hiddenSub:        "Tap it to reveal its true colour!"
  },

  pl: {
    language:         "English",
    level:            "Poziom",
    debug:            "Debug",
    debugComplete:    "Poziom ukończony",
    debugFail:        "Poziom nieudany",
    completeTitle:    "Poziom\nukończony!",
    completeSubtitle: "Dobra robota.",
    failTitle:        "Poziom nieudany",
    failSubtitle:     "Zabrakło miejsca",
    retry:            "Ponów",
    settings:         "Ustawienia",
    music:            "Muzyka",
    sound:            "Dźwięk",
    haptics:          "Wibracja",
    quit:             "Wróć do Dom",
    tabHome:          "Dom",
    tabLocked:        "Zablokowane",
    wellDone:         "Świetnie!",
    debugGo:          "Idź",
    debugDeleteProgress: "Usuń postęp",
    quitConfirmTitle: "Czy na pewno?",
    quitConfirmMsg:   "Utracisz postęp w poziomie",
    quitYes:          "Wyjdź",
    quitCancel:       "Anuluj",
    keepPlaying:      "Graj dalej, aby odblokować kolejne poziomy",
    rotateDevice:     "Obróć urządzenie do trybu pionowego",
    gameTitle:        "Sortowanie kiełbasek",
    nextLevel:        "Następny poziom",
    letsGo:           "Zaczynamy!",
    ftueTooltip:      "Dotknij kiełbaski na tacy, aby ją wypuścić",
    howToPlayTitle:   "Jak grać",
    howToPlaySub:     "Dotknij kiełbaski na tacy, aby wysłać ją do odpowiedniej bułki",
    longTitle:        "Długa kiełbaska!",
    longSub:          "Dotknij, aby pokroić ją na kawałki!",
    bicolourTitle:    "Wielokolorowa kiełbaska!",
    bicolourSub:      "Dotknij, aby rozdzielić ją na dwa kolory!",
    hiddenTitle:      "Tajemnicza kiełbaska!",
    hiddenSub:        "Dotknij, aby odkryć jej prawdziwy kolor!"
  }
};
