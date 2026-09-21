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

    // ---- Gameplay scene (tutorials, toasts, HUD) ----
    ftueCore1:        "Tap an <b>egg</b> to<br>hatch a hungry bird!",
    ftueCore2:        "The bird is <b>hungry</b>!<br>Tap a <b>cracker</b> to make food.",
    ftueCore3:        "It grinds into <b>food</b>!",
    ftueCore4:        "Birds eat only their <b>own colour</b> —<br>feed the whole flock to <b>win</b>!",
    ftueMystery1:     "New: <b>Mystery crackers</b>!<br>A grey \u201c?\u201d hides its colour until<br>you drop it — take a gamble!",
    ftueLock1:        "New: <b>Locked eggs</b>!<br>This egg is frozen — you can't<br>drop it until it's freed.",
    ftueLock2:        "Grind the cracker carrying the<br><b>key</b> to unlock the egg!",
    toastNestFull:    "Nests are full! Feed a bird<br>to free up a nest.",
    toastBowlFull:    "Bowl full! Feed birds to<br>make room to grind more.",
    toastShuffleSpent:"Only one shuffle per level!",
    toastShuffleSettle:"Let the board settle,<br>then shuffle!",
    gameSkip:         "Skip",
    counterFull:      "FULL",
    gameTapToContinue:"tap to continue",
    gameYourTurn:     "your turn — tap the glowing item",
    loadingMsg:       "Loading the flock..."
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
    quit:             "Wyjdź do ekranu głównego",
    tabHome:          "Główna",
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

    // ---- Gameplay scene (tutorials, toasts, HUD) ----
    ftueCore1:        "Stuknij <b>jajko</b>, aby<br>wykluć głodnego ptaka!",
    ftueCore2:        "Ptak jest <b>głodny</b>!<br>Stuknij <b>krakers</b>, aby zrobić jedzenie.",
    ftueCore3:        "Miele się na <b>jedzenie</b>!",
    ftueCore4:        "Ptaki jedzą tylko swój <b>własny kolor</b> —<br>nakarm całe stado, aby <b>wygrać</b>!",
    ftueMystery1:     "Nowość: <b>Tajemnicze krakersy</b>!<br>Szary „?” skrywa swój kolor, aż<br>go upuścisz — zaryzykuj!",
    ftueLock1:        "Nowość: <b>Zablokowane jajka</b>!<br>To jajko jest zamrożone — nie możesz<br>go upuścić, aż zostanie uwolnione.",
    ftueLock2:        "Zmiel krakers z<br><b>kluczem</b>, aby odblokować jajko!",
    toastNestFull:    "Gniazda są pełne! Nakarm ptaka,<br>aby zwolnić gniazdo.",
    toastBowlFull:    "Miska pełna! Nakarm ptaki,<br>aby zrobić miejsce na więcej mielenia.",
    toastShuffleSpent:"Tylko jedno przetasowanie na poziom!",
    toastShuffleSettle:"Poczekaj, aż plansza się uspokoi,<br>potem przetasuj!",
    gameSkip:         "Pomiń",
    counterFull:      "PEŁNE",
    gameTapToContinue:"dotknij, aby kontynuować",
    gameYourTurn:     "twoja kolej — dotknij świecącego przedmiotu",
    loadingMsg:       "Ładowanie stada..."
  }
};
