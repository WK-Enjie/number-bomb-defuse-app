/* ============================================================
   FIND THE BOMB — SCIENCE EDITION
   app.js — PART A (Final Consolidated Version)
   Handles: state, setup screen, dynamic player inputs,
   question loading (by filename / file upload),
   science + math text formatter (fractions, mixed numbers,
   subscripts, superscripts, reaction arrows)
   ============================================================ */

// ---------------- GRID LOGIC CONSTANT ----------------
// Fixed logical column count used for row/col heat-distance math.
// This matches the primary desktop CSS layout (repeat(5, 1fr)).
const GRID_COLUMNS = 5;

/* ============================================================
   QUESTION FILE BASE PATH
   Admins: set this ONCE to point to where your question JSON
   files live. Then everyone just types a file name — no long
   URLs needed.

   OPTION A — Files live in THIS same repo's /questions folder:
     const GITHUB_BASE_URL = 'questions/';

   OPTION B — Files live in a DIFFERENT GitHub repo:
     const GITHUB_BASE_URL =
       'https://raw.githubusercontent.com/<username>/<repo>/<branch>/questions/';
   ============================================================ */
const GITHUB_BASE_URL = 'questions/';
const SAMPLE_QUESTION_FILENAME = 'alkanes-alkenes.json';

// ---------------- GLOBAL STATE ----------------
const gameState = {
  numPlayers: 2,
  playerNames: [],
  scores: [],
  gridSize: 20,
  timeLimit: 120,        // seconds; 0 = no limit

  // --- Twist settings ---
  heatMeterOn: true,
  numDecoys: 0,
  spinnerWinChance: 100, // 100 = classic instant win, no spinner shown

  questions: [],
  usedQuestionIndices: [],

  bombIndex: null,
  decoyIndices: [],      // array of tile indices acting as fake bombs
  tiles: [],             // {index, cleared, isBomb, isDecoy}

  currentPlayerIndex: 0,
  gameActive: false,
  timerInterval: null,
  timeRemaining: 0,

  pendingTileIndex: null,   // tile currently being answered
  selectedOptionIndex: null,
  pendingResultCorrect: null,

  spinnerPendingTileIndex: null,
  pendingSpinnerOutcome: null // 'win' or 'lose', set after spin resolves
};

// ---------------- DOM REFERENCES ----------------
const el = {
  // setup screen
  numPlayersSelect: document.getElementById('num-players'),
  playerNamesContainer: document.getElementById('player-names-container'),
  gridSizeSlider: document.getElementById('grid-size'),
  gridSizeValue: document.getElementById('grid-size-value'),
  timerSelect: document.getElementById('timer-select'),

  // twist setup controls
  heatMeterSelect: document.getElementById('heat-meter-select'),
  decoySelect: document.getElementById('decoy-select'),
  spinnerSelect: document.getElementById('spinner-select'),

  sourceTypeRadios: document.querySelectorAll('input[name="source-type"]'),
  urlInputGroup: document.getElementById('url-input-group'),
  uploadInputGroup: document.getElementById('upload-input-group'),
  jsonFilenameInput: document.getElementById('json-filename'),
  loadPresetBtn: document.getElementById('load-preset-btn'),
  jsonUploadInput: document.getElementById('json-upload'),
  loadQuestionsBtn: document.getElementById('load-questions-btn'),
  loadStatus: document.getElementById('load-status'),
  startGameBtn: document.getElementById('start-game-btn'),

  // screens
  setupScreen: document.getElementById('setup-screen'),
  gameScreen: document.getElementById('game-screen'),

  // game screen
  currentTurnDisplay: document.getElementById('current-turn-display'),
  globalTimerDisplay: document.getElementById('global-timer-display'),
  timerValue: document.getElementById('timer-value'),
  heatLegend: document.getElementById('heat-legend'),
  tileGrid: document.getElementById('tile-grid'),
  scoreboard: document.getElementById('scoreboard'),
  restartBtn: document.getElementById('restart-btn'),

  // toast
  toastBanner: document.getElementById('toast-banner'),

  // question modal
  questionModal: document.getElementById('question-modal'),
  modalTimer: document.getElementById('modal-timer'),
  modalTimerValue: document.getElementById('modal-timer-value'),
  questionText: document.getElementById('question-text'),
  optionsContainer: document.getElementById('options-container'),
  submitAnswerBtn: document.getElementById('submit-answer-btn'),
  feedbackArea: document.getElementById('feedback-area'),
  feedbackText: document.getElementById('feedback-text'),
  explanationText: document.getElementById('explanation-text'),
  continueBtn: document.getElementById('continue-btn'),

  // spinner modal
  spinnerModal: document.getElementById('spinner-modal'),
  spinnerIntroText: document.getElementById('spinner-intro-text'),
  spinnerWheel: document.getElementById('spinner-wheel'),
  spinBtn: document.getElementById('spin-btn'),
  spinnerResultArea: document.getElementById('spinner-result-area'),
  spinnerResultText: document.getElementById('spinner-result-text'),
  spinnerContinueBtn: document.getElementById('spinner-continue-btn'),

  // end screen
  endScreen: document.getElementById('end-screen'),
  winnerText: document.getElementById('winner-text'),
  confettiContainer: document.getElementById('confetti-container'),
  playAgainBtn: document.getElementById('play-again-btn'),
  newSettingsBtn: document.getElementById('new-settings-btn')
};

/* ============================================================
   SCIENCE + MATH TEXT FORMATTER
   Converts shorthand notation into HTML for display.

   Supported syntax:
     C_2H_6            -> C<sub>2</sub>H<sub>6</sub>
     C_nH_{2n+2}       -> CₙH₂ₙ₊₂ (braces for multi-character)
     x^2               -> x²
     x^{2n+1}          -> x²ⁿ⁺¹ (braces for multi-character/algebra)
     Fe^{3+}           -> Fe³⁺
     ->                -> → (reaction/sequence arrow)
     <=>               -> ⇌ (equilibrium arrow)
     frac{1}{2}        -> stacked fraction (numeric or algebraic)
     mixed{2}{1}{2}    -> stacked mixed number (whole + fraction)
   ============================================================ */
function formatScienceText(rawText) {
  if (!rawText) return '';
  let text = String(rawText);

  // Reaction / equilibrium arrows (process first to avoid clashes)
  text = text.replace(/<=>/g, '<span class="chem-arrow">⇌</span>');
  text = text.replace(/->/g, '<span class="chem-arrow">→</span>');

  // Mixed numbers: mixed{whole}{num}{den} -> whole number + stacked fraction
  text = text.replace(
    /mixed\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}/g,
    '<span class="mixed-number"><span class="whole">$1</span>' +
    '<span class="fraction"><span class="numerator">$2</span><span class="denominator">$3</span></span></span>'
  );

  // Fractions: frac{num}{den} -> stacked fraction display
  // Supports numeric AND algebraic content, e.g. frac{x+1}{y-2}
  text = text.replace(
    /frac\{([^}]+)\}\{([^}]+)\}/g,
    '<span class="fraction"><span class="numerator">$1</span><span class="denominator">$2</span></span>'
  );

  // Braced subscript/superscript groups (required for algebra/multi-char)
  text = text.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
  text = text.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');

  // Single-character subscript/superscript (simple numeric cases)
  text = text.replace(/_([A-Za-z0-9+\-]+)/g, '<sub>$1</sub>');
  text = text.replace(/\^([A-Za-z0-9+\-]+)/g, '<sup>$1</sup>');

  return text;
}

/* ============================================================
   SETUP SCREEN: Dynamic player name inputs
   ============================================================ */
function renderPlayerNameInputs() {
  const count = parseInt(el.numPlayersSelect.value, 10);
  el.playerNamesContainer.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `player-name-${i}`;
    input.placeholder = `Player ${i + 1} name`;
    input.maxLength = 16;
    el.playerNamesContainer.appendChild(input);
  }
}

el.numPlayersSelect.addEventListener('change', renderPlayerNameInputs);

/* ============================================================
   SETUP SCREEN: Grid size slider
   ============================================================ */
el.gridSizeSlider.addEventListener('input', () => {
  el.gridSizeValue.textContent = el.gridSizeSlider.value;
  checkReadyToStart();
});

/* ============================================================
   SETUP SCREEN: Toggle URL(filename) vs Upload input
   ============================================================ */
el.sourceTypeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'url') {
      el.urlInputGroup.classList.remove('hidden');
      el.uploadInputGroup.classList.add('hidden');
    } else {
      el.urlInputGroup.classList.add('hidden');
      el.uploadInputGroup.classList.remove('hidden');
    }
  });
});

/* ============================================================
   SETUP SCREEN: "Use Sample" quick-load button
   ============================================================ */
el.loadPresetBtn.addEventListener('click', () => {
  el.jsonFilenameInput.value = SAMPLE_QUESTION_FILENAME;
  loadQuestionsFromUrl(GITHUB_BASE_URL + SAMPLE_QUESTION_FILENAME);
});

/* ============================================================
   LOAD QUESTIONS — main button
   ============================================================ */
el.loadQuestionsBtn.addEventListener('click', () => {
  const sourceType = document.querySelector('input[name="source-type"]:checked').value;

  if (sourceType === 'url') {
    const filename = el.jsonFilenameInput.value.trim();
    if (!filename) {
      setLoadStatus('Please enter a file name or click "Use Sample".', 'error');
      return;
    }
    const fullUrl = GITHUB_BASE_URL + filename;
    loadQuestionsFromUrl(fullUrl);
  } else {
    const file = el.jsonUploadInput.files[0];
    if (!file) {
      setLoadStatus('Please choose a JSON file to upload.', 'error');
      return;
    }
    loadQuestionsFromFile(file);
  }
});

function loadQuestionsFromUrl(url) {
  setLoadStatus('Loading questions...', '');
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: could not fetch file`);
      }
      return response.json();
    })
    .then(data => handleLoadedQuestionData(data))
    .catch(err => {
      setLoadStatus(`❌ Failed to load: ${err.message}`, 'error');
      console.error(err);
    });
}

function loadQuestionsFromFile(file) {
  setLoadStatus('Reading file...', '');
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      handleLoadedQuestionData(data);
    } catch (err) {
      setLoadStatus(`❌ Invalid JSON file: ${err.message}`, 'error');
      console.error(err);
    }
  };
  reader.onerror = () => {
    setLoadStatus('❌ Could not read the file.', 'error');
  };
  reader.readAsText(file);
}

function handleLoadedQuestionData(data) {
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    setLoadStatus('❌ JSON file has no valid "questions" array.', 'error');
    return;
  }

  const invalid = data.questions.find(q =>
    !q.question ||
    !Array.isArray(q.options) ||
    q.options.length < 2 ||
    typeof q.correctIndex !== 'number' ||
    q.correctIndex < 0 ||
    q.correctIndex >= q.options.length
  );

  if (invalid) {
    setLoadStatus('❌ One or more questions are malformed. Check format.', 'error');
    console.error('Malformed question:', invalid);
    return;
  }

  gameState.questions = data.questions;
  gameState.usedQuestionIndices = [];

  const topicLabel = data.topic ? ` — "${data.topic}"` : '';
  setLoadStatus(`✅ Loaded ${data.questions.length} questions${topicLabel}`, 'success');

  checkReadyToStart();
}

function setLoadStatus(message, type) {
  el.loadStatus.textContent = message;
  el.loadStatus.className = 'status-text' + (type ? ` ${type}` : '');
}

/* ============================================================
   CHECK IF GAME CAN START
   ============================================================ */
function checkReadyToStart() {
  const gridSize = parseInt(el.gridSizeSlider.value, 10);
  const hasEnoughQuestions = gameState.questions.length >= gridSize;

  if (gameState.questions.length > 0 && !hasEnoughQuestions) {
    setLoadStatus(
      `⚠️ You have ${gameState.questions.length} questions but selected ${gridSize} tiles. ` +
      `Questions will repeat if needed, or reduce tile count.`,
      'error'
    );
  }

  el.startGameBtn.disabled = gameState.questions.length === 0;
}

/* ============================================================
   READ TWIST SETTINGS FROM SETUP SCREEN INTO STATE
   Called when the game starts (teacher-controlled every game).
   ============================================================ */
function readTwistSettingsFromUI() {
  gameState.heatMeterOn = el.heatMeterSelect.value === 'on';
  gameState.numDecoys = parseInt(el.decoySelect.value, 10);
  gameState.spinnerWinChance = parseInt(el.spinnerSelect.value, 10);
}

/* ============================================================
   INITIALIZE SETUP SCREEN ON PAGE LOAD
   ============================================================ */
renderPlayerNameInputs();

/* ============================================================
   FIND THE BOMB — SCIENCE EDITION
   app.js — PART B (Final Consolidated Version)
   Handles: grid generation, tile clicks, question modal flow,
   heat meter, decoy bombs, defuse spinner, bomb relocation,
   turn switching, win detection, confetti, restart
   ============================================================ */

// ---------------- UTILITIES ----------------
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRandomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

/* ============================================================
   BUILD TILE → QUESTION MAPPING
   ============================================================ */
function buildTileQuestionMap(gridSize, totalQuestions) {
  const map = [];
  let pool = shuffleArray(Array.from({ length: totalQuestions }, (_, i) => i));

  while (map.length < gridSize) {
    if (pool.length === 0) {
      pool = shuffleArray(Array.from({ length: totalQuestions }, (_, i) => i));
    }
    map.push(pool.pop());
  }
  return map;
}

/* ============================================================
   GRID POSITION / HEAT MATH
   ============================================================ */
function getRowCol(index) {
  return {
    row: Math.floor(index / GRID_COLUMNS),
    col: index % GRID_COLUMNS
  };
}

// Returns a {emoji, label} object describing proximity to the CURRENT bomb.
function calculateHeatLevel(tileIndex) {
  const a = getRowCol(tileIndex);
  const b = getRowCol(gameState.bombIndex);
  const dist = Math.sqrt(Math.pow(a.row - b.row, 2) + Math.pow(a.col - b.col, 2));

  const rows = Math.ceil(gameState.gridSize / GRID_COLUMNS);
  const maxDist = Math.sqrt(Math.pow(rows - 1, 2) + Math.pow(GRID_COLUMNS - 1, 2));
  const normalized = maxDist === 0 ? 0 : dist / maxDist;

  if (normalized <= 0.15) return { emoji: '🔥🔥🔥', label: 'Blazing' };
  if (normalized <= 0.35) return { emoji: '🔥', label: 'Hot' };
  if (normalized <= 0.55) return { emoji: '🙂', label: 'Warm' };
  if (normalized <= 0.75) return { emoji: '😎', label: 'Cool' };
  return { emoji: '🥶', label: 'Ice Cold' };
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
let toastTimeoutHandle = null;

function showToast(message, extraClass) {
  clearTimeout(toastTimeoutHandle);
  el.toastBanner.textContent = message;
  el.toastBanner.className = 'toast-banner show' + (extraClass ? ` ${extraClass}` : '');

  toastTimeoutHandle = setTimeout(() => {
    el.toastBanner.classList.remove('show');
  }, 3500);
}

/* ============================================================
   INITIALIZE A NEW GAME ROUND
   ============================================================ */
function initializeGameState(isReplay = false) {
  if (!isReplay) {
    gameState.numPlayers = parseInt(el.numPlayersSelect.value, 10);
    gameState.playerNames = [];
    for (let i = 0; i < gameState.numPlayers; i++) {
      const input = document.getElementById(`player-name-${i}`);
      const name = (input && input.value.trim()) || `Player ${i + 1}`;
      gameState.playerNames.push(name);
    }
    gameState.gridSize = parseInt(el.gridSizeSlider.value, 10);
    gameState.timeLimit = parseInt(el.timerSelect.value, 10);
    readTwistSettingsFromUI();
  }

  gameState.scores = new Array(gameState.numPlayers).fill(0);
  gameState.currentPlayerIndex = 0;
  gameState.bombIndex = getRandomInt(gameState.gridSize);

  gameState.tiles = [];
  for (let i = 0; i < gameState.gridSize; i++) {
    gameState.tiles.push({
      index: i,
      cleared: false,
      isBomb: i === gameState.bombIndex,
      isDecoy: false
    });
  }

  // Place decoy bombs on remaining non-bomb tiles
  gameState.decoyIndices = [];
  const decoyCandidates = shuffleArray(
    gameState.tiles.filter(t => !t.isBomb).map(t => t.index)
  );
  const decoyCount = Math.min(gameState.numDecoys, decoyCandidates.length);
  for (let i = 0; i < decoyCount; i++) {
    const idx = decoyCandidates[i];
    gameState.tiles[idx].isDecoy = true;
    gameState.decoyIndices.push(idx);
  }

  gameState.tileQuestionMap = buildTileQuestionMap(
    gameState.gridSize,
    gameState.questions.length
  );

  gameState.gameActive = true;
  gameState.pendingTileIndex = null;
  gameState.selectedOptionIndex = null;
  gameState.currentQuestion = null;
  gameState.pendingResultCorrect = null;
  gameState.spinnerPendingTileIndex = null;
  gameState.pendingSpinnerOutcome = null;
}

/* ============================================================
   RENDER TILE GRID
   ============================================================ */
function renderTileGrid() {
  el.tileGrid.innerHTML = '';

  gameState.tiles.forEach((tile) => {
    const tileEl = document.createElement('div');
    tileEl.className = 'tile';
    tileEl.dataset.index = tile.index;
    tileEl.textContent = '?';
    tileEl.addEventListener('click', () => handleTileClick(tile.index));
    el.tileGrid.appendChild(tileEl);
  });

  updateHeatLegendVisibility();
}

function getTileElement(index) {
  return el.tileGrid.querySelector(`.tile[data-index="${index}"]`);
}

function setTilesInteractable(isInteractable) {
  const allTiles = el.tileGrid.querySelectorAll('.tile');
  allTiles.forEach((t) => {
    const idx = parseInt(t.dataset.index, 10);
    const tileData = gameState.tiles[idx];
    if (tileData.cleared) return;
    t.classList.toggle('disabled', !isInteractable);
  });
}

function updateHeatLegendVisibility() {
  el.heatLegend.classList.toggle('hidden', !gameState.heatMeterOn);
}

/* ============================================================
   REVEAL TILE (safe / bomb / decoy)
   ============================================================ */
function revealTile(tileIndex, type) {
  const tileEl = getTileElement(tileIndex);
  tileEl.classList.add('cleared');
  tileEl.classList.remove('bomb-reveal', 'decoy-reveal');
  tileEl.innerHTML = '';

  if (type === 'bomb') {
    tileEl.classList.add('bomb-reveal');
    tileEl.innerHTML = '💣';
  } else if (type === 'decoy') {
    tileEl.classList.add('decoy-reveal');
    tileEl.innerHTML = '🎭';
  } else {
    // safe tile
    const checkLine = document.createElement('div');
    checkLine.textContent = '✔';
    tileEl.appendChild(checkLine);

    if (gameState.heatMeterOn) {
      const heat = calculateHeatLevel(tileIndex);
      const heatLine = document.createElement('div');
      heatLine.className = 'tile-heat-label';
      heatLine.textContent = heat.emoji;
      tileEl.appendChild(heatLine);
    }
  }
}

/* ============================================================
   RENDER SCOREBOARD
   ============================================================ */
function renderScoreboard() {
  el.scoreboard.innerHTML = '';
  gameState.playerNames.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'score-chip' + (i === gameState.currentPlayerIndex ? ' active-player' : '');
    chip.textContent = `${name}: ${gameState.scores[i]} ✅`;
    el.scoreboard.appendChild(chip);
  });
}

function updateTurnDisplay() {
  const name = gameState.playerNames[gameState.currentPlayerIndex];
  el.currentTurnDisplay.textContent = `${name}'s Turn`;
  renderScoreboard();
}

/* ============================================================
   TILE CLICK → OPEN QUESTION MODAL
   ============================================================ */
function handleTileClick(tileIndex) {
  if (!gameState.gameActive) return;
  const tile = gameState.tiles[tileIndex];
  if (tile.cleared) return;
  if (gameState.pendingTileIndex !== null) return;

  gameState.pendingTileIndex = tileIndex;
  setTilesInteractable(false);
  openQuestionModal(tileIndex);
}

/* ============================================================
   QUESTION MODAL
   ============================================================ */
function openQuestionModal(tileIndex) {
  const questionIdx = gameState.tileQuestionMap[tileIndex];
  const question = gameState.questions[questionIdx];
  gameState.currentQuestion = question;
  gameState.selectedOptionIndex = null;

  el.questionText.innerHTML = formatScienceText(question.question);

  el.optionsContainer.innerHTML = '';
  question.options.forEach((optionText, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.innerHTML = formatScienceText(optionText);
    btn.addEventListener('click', () => selectOption(i, btn));
    el.optionsContainer.appendChild(btn);
  });

  el.submitAnswerBtn.disabled = true;
  el.submitAnswerBtn.classList.remove('hidden');
  el.feedbackArea.classList.add('hidden');

  el.questionModal.classList.remove('hidden');

  startQuestionTimer();
}

function selectOption(optionIndex, btnEl) {
  gameState.selectedOptionIndex = optionIndex;

  const allBtns = el.optionsContainer.querySelectorAll('.option-btn');
  allBtns.forEach((b) => b.classList.remove('selected'));
  btnEl.classList.add('selected');

  el.submitAnswerBtn.disabled = false;
}

/* ============================================================
   PER-QUESTION TIMER
   ============================================================ */
function startQuestionTimer() {
  clearInterval(gameState.timerInterval);

  if (gameState.timeLimit === 0) {
    el.modalTimer.classList.add('hidden');
    return;
  }

  gameState.timeRemaining = gameState.timeLimit;
  el.modalTimer.classList.remove('hidden');
  el.modalTimer.classList.remove('urgent');
  el.modalTimerValue.textContent = gameState.timeRemaining;

  gameState.timerInterval = setInterval(() => {
    gameState.timeRemaining--;
    el.modalTimerValue.textContent = gameState.timeRemaining;

    if (gameState.timeRemaining <= 10) {
      el.modalTimer.classList.add('urgent');
    }

    if (gameState.timeRemaining <= 0) {
      clearInterval(gameState.timerInterval);
      processAnswer(null, true);
    }
  }, 1000);
}

function stopQuestionTimer() {
  clearInterval(gameState.timerInterval);
  gameState.timerInterval = null;
}

/* ============================================================
   SUBMIT ANSWER
   ============================================================ */
el.submitAnswerBtn.addEventListener('click', () => {
  if (gameState.selectedOptionIndex === null) return;
  processAnswer(gameState.selectedOptionIndex, false);
});

function processAnswer(selectedIndex, isTimeout) {
  stopQuestionTimer();

  const question = gameState.currentQuestion;
  const isCorrect = !isTimeout && selectedIndex === question.correctIndex;

  const allBtns = el.optionsContainer.querySelectorAll('.option-btn');
  allBtns.forEach((b, i) => {
    b.disabled = true;
    if (i === question.correctIndex) {
      b.classList.add('correct');
    } else if (i === selectedIndex && !isCorrect) {
      b.classList.add('incorrect');
    }
  });

  el.submitAnswerBtn.classList.add('hidden');

  if (isTimeout) {
    el.feedbackText.textContent = "⏰ Time's up!";
    el.feedbackText.style.color = 'var(--color-danger)';
  } else if (isCorrect) {
    el.feedbackText.textContent = '✅ Correct!';
    el.feedbackText.style.color = 'var(--color-success)';
  } else {
    el.feedbackText.textContent = '❌ Not quite.';
    el.feedbackText.style.color = 'var(--color-danger)';
  }

  el.explanationText.innerHTML = question.explanation
    ? formatScienceText(question.explanation)
    : '';

  el.feedbackArea.classList.remove('hidden');

  gameState.pendingResultCorrect = isCorrect;
}

/* ============================================================
   CONTINUE → RESOLVE TILE (safe / decoy / bomb) & ADVANCE
   ============================================================ */
el.continueBtn.addEventListener('click', () => {
  el.questionModal.classList.add('hidden');

  const tileIndex = gameState.pendingTileIndex;
  const tile = gameState.tiles[tileIndex];
  const wasCorrect = gameState.pendingResultCorrect;

  if (!wasCorrect) {
    // Tile stays hidden — nothing revealed
    gameState.pendingTileIndex = null;
    advanceToNextPlayer();
    return;
  }

  // Correct answer always earns 1 point
  gameState.scores[gameState.currentPlayerIndex]++;
  tile.cleared = true;

  if (tile.isBomb) {
    gameState.pendingTileIndex = null;
    handleBombFound(tileIndex);
    return;
  }

  if (tile.isDecoy) {
    // Bonus point for finding a decoy
    gameState.scores[gameState.currentPlayerIndex]++;
    revealTile(tileIndex, 'decoy');
    showToast('💥 FALSE ALARM! That was a decoy bomb. +1 bonus point!', 'toast-decoy');
    gameState.pendingTileIndex = null;
    advanceToNextPlayer();
    return;
  }

  // Normal safe tile
  revealTile(tileIndex, 'safe');
  gameState.pendingTileIndex = null;
  advanceToNextPlayer();
});

function advanceToNextPlayer() {
  gameState.currentPlayerIndex =
    (gameState.currentPlayerIndex + 1) % gameState.numPlayers;
  updateTurnDisplay();
  setTilesInteractable(true);
}

/* ============================================================
   BOMB FOUND → INSTANT WIN OR DEFUSE SPINNER
   ============================================================ */
function handleBombFound(tileIndex) {
  if (gameState.spinnerWinChance >= 100) {
    revealTile(tileIndex, 'bomb');
    endGame(gameState.currentPlayerIndex);
    return;
  }

  gameState.spinnerPendingTileIndex = tileIndex;
  openSpinnerModal();
}

/* ============================================================
   DEFUSE SPINNER
   ============================================================ */
function openSpinnerModal() {
  const name = gameState.playerNames[gameState.currentPlayerIndex];
  el.spinnerIntroText.textContent =
    `${name} found the bomb! Spin the wheel to see if it's defused...`;

  // Reset wheel rotation instantly (no transition) before showing
  el.spinnerWheel.style.transition = 'none';
  el.spinnerWheel.style.transform = 'rotate(0deg)';
  void el.spinnerWheel.offsetWidth; // force reflow to apply reset
  el.spinnerWheel.style.transition = '';

  el.spinnerResultArea.classList.add('hidden');
  el.spinBtn.disabled = false;
  el.spinBtn.classList.remove('hidden');

  el.spinnerModal.classList.remove('hidden');
}

el.spinBtn.addEventListener('click', () => {
  el.spinBtn.disabled = true;

  const roll = Math.random() * 100;
  const isWin = roll < gameState.spinnerWinChance;
  gameState.pendingSpinnerOutcome = isWin ? 'win' : 'lose';

  // Decorative spin: several full rotations + offset depending on outcome
  const spins = 4 + getRandomInt(3); // 4–6 full rotations
  const landingOffset = isWin ? 180 : 0;
  const wobble = Math.random() * 20 - 10;
  const finalDeg = spins * 360 + landingOffset + wobble;

  el.spinnerWheel.style.transform = `rotate(${finalDeg}deg)`;

  setTimeout(() => {
    showSpinnerResult(isWin);
  }, 4100); // matches CSS 4s transition + small buffer
});

function showSpinnerResult(isWin) {
  el.spinBtn.classList.add('hidden');
  el.spinnerResultArea.classList.remove('hidden');

  if (isWin) {
    el.spinnerResultText.textContent = '✅ DEFUSED! The bomb is disarmed!';
    el.spinnerResultText.className = 'spinner-result-text result-win';
  } else {
    el.spinnerResultText.textContent = '💥 BOOM! The bomb resets to a new secret tile...';
    el.spinnerResultText.className = 'spinner-result-text result-lose';
  }
}

el.spinnerContinueBtn.addEventListener('click', () => {
  el.spinnerModal.classList.add('hidden');

  const tileIndex = gameState.spinnerPendingTileIndex;
  const tile = gameState.tiles[tileIndex];

  if (gameState.pendingSpinnerOutcome === 'win') {
    revealTile(tileIndex, 'bomb');
    gameState.spinnerPendingTileIndex = null;
    gameState.pendingSpinnerOutcome = null;
    endGame(gameState.currentPlayerIndex);
    return;
  }

  // Lose: relocate bomb to a new hidden tile, this tile becomes permanently safe
  tile.isBomb = false;
  relocateBomb(tileIndex);
  revealTile(tileIndex, 'safe');

  gameState.spinnerPendingTileIndex = null;
  gameState.pendingSpinnerOutcome = null;
  advanceToNextPlayer();
});

/* ============================================================
   RELOCATE BOMB (after a failed defuse spin)
   ============================================================ */
function relocateBomb(excludeIndex) {
  const candidates = gameState.tiles
    .filter(t => !t.cleared && !t.isDecoy && t.index !== excludeIndex)
    .map(t => t.index);

  if (candidates.length > 0) {
    const newBombIndex = candidates[getRandomInt(candidates.length)];
    gameState.tiles[newBombIndex].isBomb = true;
    gameState.bombIndex = newBombIndex;
    showToast('🔄 The bomb has relocated to a new hidden tile!', 'toast-info');
    return;
  }

  // Fallback: no plain hidden tiles left — convert a hidden decoy into the real bomb
  const decoyFallback = gameState.tiles.filter(t => !t.cleared && t.index !== excludeIndex);
  if (decoyFallback.length > 0) {
    const chosen = decoyFallback[0];
    chosen.isBomb = true;
    chosen.isDecoy = false;
    gameState.bombIndex = chosen.index;
    showToast('🔄 The bomb has relocated to a new hidden tile!', 'toast-info');
    return;
  }

  // Extremely rare: no tiles left at all to relocate to
  gameState.bombIndex = null;
}

/* ============================================================
   END GAME
   ============================================================ */
function endGame(winnerIndex) {
  gameState.gameActive = false;
  stopQuestionTimer();

  const winnerName = gameState.playerNames[winnerIndex];
  el.winnerText.textContent = `🎉 ${winnerName} found the bomb and WINS! 🎉`;

  el.endScreen.classList.remove('hidden');
  triggerConfetti();
}

/* ============================================================
   CONFETTI EFFECT
   ============================================================ */
function triggerConfetti() {
  el.confettiContainer.innerHTML = '';
  const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#9333ea'];

  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[getRandomInt(colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.confettiContainer.appendChild(piece);
  }
}

/* ============================================================
   SCREEN NAVIGATION
   ============================================================ */
function showScreen(screenEl) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  screenEl.classList.add('active');
}

/* ============================================================
   START GAME BUTTON
   ============================================================ */
el.startGameBtn.addEventListener('click', () => {
  if (gameState.questions.length === 0) return;

  initializeGameState(false);
  renderTileGrid();
  updateTurnDisplay();
  showScreen(el.gameScreen);
});

/* ============================================================
   RESTART / NEW GAME (mid-game topbar button)
   ============================================================ */
el.restartBtn.addEventListener('click', () => {
  const confirmReset = confirm('Start a new game? Current progress will be lost.');
  if (!confirmReset) return;

  gameState.gameActive = false;
  stopQuestionTimer();
  el.questionModal.classList.add('hidden');
  el.spinnerModal.classList.add('hidden');
  showScreen(el.setupScreen);
});

/* ============================================================
   END SCREEN: PLAY AGAIN (same settings, new bomb position)
   ============================================================ */
el.playAgainBtn.addEventListener('click', () => {
  el.endScreen.classList.add('hidden');
  initializeGameState(true);
  renderTileGrid();
  updateTurnDisplay();
  showScreen(el.gameScreen);
});

/* ============================================================
   END SCREEN: CHANGE SETTINGS (back to setup)
   ============================================================ */
el.newSettingsBtn.addEventListener('click', () => {
  el.endScreen.classList.add('hidden');
  showScreen(el.setupScreen);
});