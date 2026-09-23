const BOARD_RADIUS = 4;
const HEX_WIDTH = 34;
const HEX_HEIGHT = 39.26;
const STATE_NEUTRAL = 0;
const STATE_PLAYED = 1;
const STATE_CAPTURED = 2;
const WIN_SCORE = 4;
const TURN_TIME = 30;
const LETTERS = "EEEEEEEEEEEEAAAAAAAIIIIIIIOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";
const FALLBACK_WORDS = ["the","and","you","that","was","for","are","with","his","they","this","have","from","one","had","word","but","not","what","all","were","when","your","can","said","there","use","each","which","she","how","their","will","other","about","many","then","them","these","some","her","would","make","like","him","into","time","has","look","two","more","write","go","see","number","no","way","could","people","been","call","who","oil","its","now","find","long","down","day","did","get","come","made","may","part","hex","bot","zap","zip","qat","win","game","play","run","cat","dog"];

let board = [];
let currentPlayer = 1;
let selectedPath = [];
let isDragging = false;
let scores = { 1: 0, 2: 0 };
let isProcessing = false;
let trieRoot = {};
let dictLoaded = false;
let turnTimer;
let timeLeft = TURN_TIME;
let isTimerActive = false;
let pressTimer;
let longPressedHex = null;
let isSwapMode = false;
let hintsRemaining = 1;
let hasSwappedThisTurn = false;
let playedPaths = new Set();
let hubScoreSent = false;

const boardEl = document.getElementById('board');
const selectionPath = document.getElementById('selection-path');
const currentWordEl = document.getElementById('current-word');
const submitBtn = document.getElementById('btn-submit');
const hintBtn = document.getElementById('btn-hint');
const timerDisplay = document.getElementById('timer-display');
const toastContainer = document.getElementById('toast-container');
let eventsBound = false;
let matchLive = false;
let generation = 0;
let timerAcc = 0;

function buzz(kind) {
  if (typeof window.haptic === "function") window.haptic(kind || "tap");
  else if (navigator.vibrate) navigator.vibrate(50);
}

function sendHubScore() {
  if (hubScoreSent) return;
  hubScoreSent = true;
  try {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "kwalee.reward", xp: 10, coins: 1, score: Number(scores[1]) || 0, streak: Number(scores[1]) || 0 }, "*");
  } catch (err) { /* ignore */ }
}

function loadDictionary() {
  function ready(label) {
    dictLoaded = true;
    var loading = document.getElementById("loading-dict");
    if (loading) loading.innerText = label || "Dictionary Loaded!";
    var play = document.getElementById("playBtn");
    if (play) play.disabled = false;
  }
  if (window.HEXIWORD_WORDS && HEXIWORD_WORDS.length) {
    buildTrie(HEXIWORD_WORDS);
    ready("Dictionary Loaded!");
  }
  var extra = fetch("https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt");
  var timer = extra.then(function (response) {
    if (!response.ok) throw new Error("Primary dict failed");
    return response.text();
  }).then(function (text) {
    buildTrie(text.split("\n"));
    ready("Dictionary Loaded!");
  }).catch(function () {
    return fetch("https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt")
      .then(function (res) { return res.text(); })
      .then(function (text) {
        buildTrie(text.split("\n"));
        ready("Dictionary Loaded!");
      });
  }).catch(function () {
    if (!dictLoaded) {
      buildTrie(FALLBACK_WORDS);
      ready("Offline Mode (Limited words)");
    }
  });
  setTimeout(function () {
    if (!dictLoaded) {
      buildTrie(FALLBACK_WORDS);
      ready("Offline Mode (Limited words)");
    }
  }, 2500);
}

function buildTrie(wordArray) {
  wordArray.forEach(function (word) {
    word = String(word).trim().toLowerCase();
    if (word.length >= 3) {
      var node = trieRoot;
      for (var i = 0; i < word.length; i++) {
        var ch = word[i];
        if (!node[ch]) node[ch] = {};
        node = node[ch];
      }
      node.isWord = true;
    }
  });
  dictLoaded = true;
}

function generateBoard() {
  board = [];
  for (var q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
    for (var r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
      if (Math.abs(q + r) <= BOARD_RADIUS) {
        board.push({
          id: "hex-" + q + "-" + r, q: q, r: r,
          letter: getRandomLetter(),
          owner: 0, state: STATE_NEUTRAL, element: null
        });
      }
    }
  }
}

function renderBoard() {
  boardEl.querySelectorAll(".hex").forEach(function (h) { h.remove(); });
  var rect = boardEl.getBoundingClientRect();
  var centerX = (rect.width > 0 ? rect.width : 350) / 2;
  var centerY = (rect.height > 0 ? rect.height : 400) / 2;
  board.forEach(function (hex) {
    var el = document.createElement("div");
    el.className = "hex neutral";
    el.id = hex.id;
    hex.x = centerX + HEX_WIDTH * (hex.q + hex.r / 2);
    hex.y = centerY + HEX_HEIGHT * 0.75 * hex.r;
    el.style.left = (hex.x - HEX_WIDTH / 2) + "px";
    el.style.top = (hex.y - HEX_HEIGHT / 2) + "px";
    hex.element = el;
    boardEl.appendChild(el);
  });
  updateBoardVisuals();
  drawConnectingLine();
}

function getRandomLetter() { return LETTERS[Math.floor(Math.random() * LETTERS.length)]; }

function initGame() {
  generateBoard();
  renderBoard();
  setupEvents();
  setTimeout(renderBoard, 100);
}

function setupEvents() {
  if (eventsBound) return;
  eventsBound = true;
  boardEl.addEventListener("touchstart", handleStart, { passive: false });
  boardEl.addEventListener("touchmove", handleMove, { passive: false });
  boardEl.addEventListener("touchend", handleEnd);
  boardEl.addEventListener("mousedown", handleStart);
  document.addEventListener("mousemove", handleMove, { passive: false });
  document.addEventListener("mouseup", handleEnd);
  submitBtn.addEventListener("click", function () {
    if (submitBtn.disabled) return;
    buzz("tap");
    playSelectedWord();
  });
  hintBtn.addEventListener("click", function () {
    if (currentPlayer !== 1 || isProcessing) return;
    buzz("tap");
    showHint(1);
  });
  window.addEventListener("resize", function () { if (board.length > 0) renderBoard(); });
}

function getHexFromEvent(e) {
  var clientX = e.touches ? e.touches[0].clientX : e.clientX;
  var clientY = e.touches ? e.touches[0].clientY : e.clientY;
  var el = document.elementFromPoint(clientX, clientY);
  if (el && el.classList.contains("hex")) return board.find(function (h) { return h.id === el.id; });
  return null;
}

function isAdjacent(h1, h2) {
  if (!h1 || !h2) return false;
  var dq = h1.q - h2.q;
  var dr = h1.r - h2.r;
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].some(function (d) { return d[0] === dq && d[1] === dr; });
}

function handleStart(e) {
  if (isProcessing || currentPlayer !== 1 || e.target.closest("button")) return;
  var hex = getHexFromEvent(e);
  if (!hex || hex.owner === 2) { clearSelection(); return; }
  if (e.cancelable) e.preventDefault();
  if (hex.state !== STATE_CAPTURED && !hasSwappedThisTurn) {
    pressTimer = setTimeout(function () {
      isSwapMode = true;
      longPressedHex = hex;
      hex.element.classList.add("swapping");
      buzz("tap");
    }, 500);
  }
  isDragging = true;
  clearSelection();
  addToSelection(hex);
}

function handleMove(e) {
  if (!isDragging || !isTimerActive) return;
  if (e.cancelable) e.preventDefault();
  var hex = getHexFromEvent(e);
  if (!hex) return;
  if (isSwapMode) return;
  clearTimeout(pressTimer);
  var index = selectedPath.indexOf(hex);
  if (index !== -1) {
    if (index < selectedPath.length - 1) {
      selectedPath.splice(index + 1);
      updateWordDisplay();
    }
  } else {
    var lastHex = selectedPath[selectedPath.length - 1];
    if (isAdjacent(lastHex, hex) && hex.owner !== 2) addToSelection(hex);
  }
}

function handleEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  clearTimeout(pressTimer);
  if (isSwapMode && longPressedHex) {
    var hex = getHexFromEvent(e);
    if (hex && hex !== longPressedHex && isAdjacent(longPressedHex, hex) && hex.state !== STATE_CAPTURED) {
      var tempLetter = longPressedHex.letter;
      longPressedHex.letter = hex.letter;
      hex.letter = tempLetter;
      updateBoardVisuals();
      clearSelection();
      showToast("Swapped!");
      hasSwappedThisTurn = true;
    } else {
      longPressedHex.element.classList.remove("swapping");
      clearSelection();
    }
    isSwapMode = false;
    longPressedHex = null;
  }
}

function addToSelection(hex) { selectedPath.push(hex); updateWordDisplay(); }
function clearSelection() { selectedPath = []; updateWordDisplay(); }

function updateWordDisplay() {
  var word = selectedPath.map(function (h) { return h.letter; }).join("");
  currentWordEl.innerText = word;
  board.forEach(function (h) { h.element.classList.remove("selected"); });
  selectedPath.forEach(function (h) { h.element.classList.add("selected"); });
  drawConnectingLine();
  submitBtn.disabled = word.length < 3;
}

function drawConnectingLine() {
  if (selectedPath.length < 2) { selectionPath.setAttribute("d", ""); return; }
  var d = "M " + selectedPath[0].x + " " + selectedPath[0].y;
  for (var i = 1; i < selectedPath.length; i++) d += " L " + selectedPath[i].x + " " + selectedPath[i].y;
  selectionPath.setAttribute("d", d);
  selectionPath.setAttribute("stroke", currentPlayer === 1 ? "#38bdf8" : "#fb7185");
}

function updateBoardVisuals() {
  board.forEach(function (hex) {
    var classes = ["hex"];
    if (hex.state === STATE_NEUTRAL) classes.push("neutral");
    if (hex.owner === 1) classes.push("p1");
    if (hex.owner === 2) classes.push("p2");
    if (hex.state === STATE_CAPTURED) classes.push("captured");
    if (selectedPath.includes(hex)) classes.push("selected");
    if (hex === longPressedHex && isSwapMode) classes.push("swapping");
    hex.element.className = classes.join(" ");
    if (hex.state === STATE_CAPTURED && !hex.element.querySelector("svg")) {
      hex.element.innerHTML = hex.letter + '<svg class="absolute w-4 h-4 opacity-70 text-yellow-300 drop-shadow-md" style="bottom: 2px;" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>';
    } else if (hex.state !== STATE_CAPTURED) {
      hex.element.innerHTML = hex.letter;
    }
  });
}

function checkWordValid(word) {
  word = word.toLowerCase();
  var node = trieRoot;
  for (var i = 0; i < word.length; i++) {
    if (!node[word[i]]) return false;
    node = node[word[i]];
  }
  return node.isWord === true;
}

function playSelectedWord() {
  var word = selectedPath.map(function (h) { return h.letter; }).join("");
  var pathId = selectedPath.map(function (h) { return h.id; }).join(",");
  if (!checkWordValid(word)) {
    showToast("Invalid Word!");
    currentWordEl.classList.add("text-rose-500");
    setTimeout(function () { currentWordEl.classList.remove("text-rose-500"); }, 500);
    return;
  }
  if (playedPaths.has(pathId)) {
    showToast("Path already played!");
    currentWordEl.classList.add("text-rose-500");
    setTimeout(function () { currentWordEl.classList.remove("text-rose-500"); }, 500);
    return;
  }
  playedPaths.add(pathId);
  isProcessing = true;
  pauseTimer();
  selectedPath.forEach(function (hex, i) {
    setTimeout(function () {
      if (hex.state !== STATE_CAPTURED) {
        hex.state = STATE_PLAYED;
        hex.owner = currentPlayer;
      }
      updateBoardVisuals();
      hex.element.style.transform = "scale(1.3)";
      setTimeout(function () { hex.element.style.transform = ""; }, 200);
    }, i * 100);
  });
  setTimeout(function () {
    checkHexicons();
    clearSelection();
    if (scores[1] >= WIN_SCORE || scores[2] >= WIN_SCORE) endGame();
    else { isProcessing = false; switchTurn(); }
  }, selectedPath.length * 100 + 300);
}

function getNeighbors(hex) {
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
    .map(function (d) { return board.find(function (h) { return h.q === hex.q + d[0] && h.r === hex.r + d[1]; }); })
    .filter(function (h) { return h; });
}

function checkHexicons() {
  board.forEach(function (center) {
    if (center.state === STATE_CAPTURED) return;
    var neighbors = getNeighbors(center);
    if (neighbors.length < 6) return;
    var allSeven = [center].concat(neighbors);
    if (allSeven.every(function (h) { return h.state !== STATE_NEUTRAL; })) {
      var p1Count = allSeven.filter(function (h) { return h.owner === 1; }).length;
      var p2Count = allSeven.filter(function (h) { return h.owner === 2; }).length;
      var winner = p1Count > p2Count ? 1 : 2;
      center.state = STATE_CAPTURED;
      center.owner = winner;
      scores[winner]++;
      showToast((winner === 1 ? "Blue" : "Red") + " Captures!");
      center.element.style.transform = "scale(1.8) rotate(15deg)";
      setTimeout(function () { center.element.style.transform = ""; }, 400);
      neighbors.forEach(function (n) {
        if (n.state !== STATE_CAPTURED) {
          n.state = STATE_NEUTRAL;
          n.owner = 0;
          n.letter = getRandomLetter();
        }
      });
      updateUI();
      updateBoardVisuals();
    }
  });
}

function switchTurn() {
  if (!matchLive) return;
  currentPlayer = currentPlayer === 1 ? 2 : 1;
  hasSwappedThisTurn = false;
  updateUI();
  startTimer();
  if (currentPlayer === 2) setTimeout(playAI, 1000);
}

function startTimer() {
  timeLeft = TURN_TIME;
  isTimerActive = true;
  timerAcc = 0;
  timerDisplay.innerText = timeLeft;
  timerDisplay.classList.remove("text-rose-500");
}

function pauseTimer() { isTimerActive = false; }

function tickTimer(dt) {
  if (!isTimerActive || !matchLive) return;
  timerAcc += Math.min(dt, 100);
  while (timerAcc >= 1000) {
    timerAcc -= 1000;
    timeLeft--;
    timerDisplay.innerText = timeLeft;
    if (timeLeft <= 5) timerDisplay.classList.add("text-rose-500");
    if (timeLeft <= 0) {
      pauseTimer();
      showToast("Time's Up!");
      clearSelection();
      isProcessing = true;
      var gen = generation;
      setTimeout(function () {
        if (gen !== generation || !matchLive) return;
        isProcessing = false;
        switchTurn();
      }, 1500);
      break;
    }
  }
}

function updateUI() {
  document.getElementById("p1-score").innerText = scores[1];
  document.getElementById("p2-score").innerText = scores[2];
  var p1Card = document.getElementById("p1-card");
  var p2Card = document.getElementById("p2-card");
  if (currentPlayer === 1) {
    p1Card.classList.replace("bg-slate-300", "bg-sky-400");
    p2Card.classList.replace("bg-rose-400", "bg-slate-300");
  } else {
    p2Card.classList.replace("bg-slate-300", "bg-rose-400");
    p1Card.classList.replace("bg-sky-400", "bg-slate-300");
  }
}

function playAI() {
  if (!matchLive) return;
  isProcessing = true;
  pauseTimer();
  var moves = findAllValidWords(2);
  if (moves.length === 0) {
    showToast("Opponent passes!");
    setTimeout(function () { isProcessing = false; switchTurn(); }, 1500);
    return;
  }
  moves.sort(function (a, b) { return b.score - a.score; });
  var bestMove = moves[0].path;
  selectedPath = [];
  bestMove.forEach(function (hex, i) {
    setTimeout(function () {
      addToSelection(hex);
      if (i === bestMove.length - 1) setTimeout(playSelectedWord, 500);
    }, i * 300);
  });
}

function showHint(playerId) {
  if (hintsRemaining <= 0) { showToast("No hints left!"); return; }
  var moves = findAllValidWords(playerId);
  if (moves.length > 0) {
    moves.sort(function (a, b) { return b.score - a.score; });
    clearSelection();
    moves[0].path.forEach(function (h) { addToSelection(h); });
    hintsRemaining--;
    document.getElementById("hint-count").innerText = hintsRemaining;
    if (hintsRemaining === 0) hintBtn.disabled = true;
    showToast("Hint applied!");
  } else {
    showToast("No words found!");
  }
}

function findAllValidWords(playerId) {
  var moves = [];
  var visitedPaths = new Set();
  for (var i = 0; i < board.length; i++) {
    var hex = board[i];
    if (hex.owner === 0 || hex.owner === playerId) {
      var start = trieRoot[hex.letter.toLowerCase()];
      dfsFindWords(hex, [hex], start, moves, visitedPaths, playerId);
    }
  }
  return moves;
}

function dfsFindWords(currentHex, path, trieNode, moves, visitedPaths, playerId) {
  if (!trieNode || path.length >= 7) return;
  if (trieNode.isWord && path.length >= 3) {
    var pathId = path.map(function (h) { return h.id; }).join(",");
    if (!visitedPaths.has(pathId) && !playedPaths.has(pathId)) {
      visitedPaths.add(pathId);
      moves.push({ path: path.slice(), score: evaluateMove(path, playerId) });
    }
  }
  getNeighbors(currentHex).forEach(function (n) {
    if (path.indexOf(n) === -1 && (n.owner === 0 || n.owner === playerId)) {
      dfsFindWords(n, path.concat([n]), trieNode[n.letter.toLowerCase()], moves, visitedPaths, playerId);
    }
  });
}

function evaluateMove(path, playerId) {
  var score = path.length;
  var simState = board.map(function (h) { return { id: h.id, owner: h.owner, state: h.state }; });
  path.forEach(function (ph) {
    var sHex = simState.find(function (s) { return s.id === ph.id; });
    if (sHex.state !== STATE_CAPTURED) { sHex.state = STATE_PLAYED; sHex.owner = playerId; }
  });
  board.forEach(function (center) {
    if (center.state === STATE_CAPTURED) return;
    var neighbors = getNeighbors(center);
    if (neighbors.length < 6) return;
    var allSevenIds = [center.id].concat(neighbors.map(function (n) { return n.id; }));
    var allSevenSim = allSevenIds.map(function (id) { return simState.find(function (s) { return s.id === id; }); });
    if (allSevenSim.every(function (h) { return h.state !== STATE_NEUTRAL; })) {
      var myCount = allSevenSim.filter(function (h) { return h.owner === playerId; }).length;
      var oppCount = allSevenSim.filter(function (h) { return h.owner !== playerId && h.owner !== 0; }).length;
      if (myCount > oppCount) score += 50;
    }
  });
  return score;
}

function showToast(msg) {
  var el = document.createElement("div");
  el.className = "toast";
  el.innerText = msg;
  toastContainer.appendChild(el);
  setTimeout(function () {
    el.style.animation = "toastOut 0.3s forwards";
    setTimeout(function () { el.remove(); }, 300);
  }, 2000);
}

function endGame() {
  if (!matchLive) return;
  matchLive = false;
  generation++;
  isProcessing = true;
  pauseTimer();
  window.HexiwordScoreLine = scores[1] + " to " + scores[2];
  var won = scores[1] >= WIN_SCORE;
  if (won) {
    if (typeof window.levelComplete === "function") window.levelComplete();
    else sendHubScore();
  } else {
    if (typeof window.KwaleeHubReward === "function") window.KwaleeHubReward();
    else sendHubScore();
    if (typeof window.levelFailed === "function") window.levelFailed();
  }
}

function beginMatch() {
  if (!dictLoaded) return;
  generation++;
  var gen = generation;
  matchLive = false;
  pauseTimer();
  var screen = document.getElementById("matchmaking-screen");
  var status = document.getElementById("match-status");
  if (screen) screen.classList.remove("hidden");
  if (status) status.innerText = "Searching...";
  setTimeout(function () {
    if (gen !== generation) return;
    var names = ["LexiMaster", "WordNinja", "VowelOwl", "HexagonHero", "SpellyBelly"];
    var fakeName = names[Math.floor(Math.random() * names.length)];
    var rType = Math.random() < 0.5 ? "men" : "women";
    var rNum = Math.floor(Math.random() * 90) + 1;
    var avatar = document.getElementById("p2-avatar");
    if (avatar) avatar.src = "https://randomuser.me/api/portraits/" + rType + "/" + rNum + ".jpg";
    if (status) status.innerText = "Found: " + fakeName;
    var nameEl = document.getElementById("p2-name");
    if (nameEl) nameEl.innerText = fakeName;
    setTimeout(function () {
      if (gen !== generation) return;
      if (screen) screen.classList.add("hidden");
      scores = { 1: 0, 2: 0 };
      currentPlayer = 1;
      isProcessing = false;
      hintsRemaining = 1;
      hasSwappedThisTurn = false;
      playedPaths = new Set();
      hubScoreSent = false;
      hintBtn.disabled = false;
      document.getElementById("hint-count").innerText = "1";
      clearSelection();
      matchLive = true;
      initGame();
      updateUI();
      startTimer();
    }, 1500);
  }, 1200);
}

(function () {
  var play = document.getElementById("playBtn");
  if (play && !dictLoaded) play.disabled = true;
  function openRules() {
    buzz("tap");
    var rules = document.getElementById("rules-screen");
    if (!rules) return;
    if (rules.parentElement !== document.body) document.body.appendChild(rules);
    rules.classList.remove("hidden");
  }
  function closeRules() {
    buzz("tap");
    var rules = document.getElementById("rules-screen");
    if (rules) rules.classList.add("hidden");
  }
  var rulesBtn = document.getElementById("btn-rules-menu");
  var rulesHome = document.getElementById("btn-rules-home");
  var closeRulesBtn = document.getElementById("btn-close-rules");
  if (rulesBtn) rulesBtn.addEventListener("click", openRules);
  if (rulesHome) rulesHome.addEventListener("click", openRules);
  if (closeRulesBtn) closeRulesBtn.addEventListener("click", closeRules);
  loadDictionary();
})();

window.Hexiword = {
  beginMatch: beginMatch,
  tick: tickTimer
};
