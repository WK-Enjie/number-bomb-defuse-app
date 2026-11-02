/* ============================================================
   FIND THE BOMB — SCIENCE EDITION
   app.js — Complete Game Logic
   Matched to actual index.html IDs
   Includes: stacked-fraction formatter, spinner fix,
             filename auto-.json, detailed load errors
   ============================================================ */

/* ============================================================
   SECTION 1: CONSTANTS
   ============================================================ */

const GRID_COLUMNS = 5;
const GITHUB_BASE_URL = 'questions/';
const SAMPLE_QUESTION_FILENAME = 'alkanes-alkenes.json';

// Spinner wheel segments: win = RIGHT half (0°-180°), lose = LEFT half (180°-360°)
// These MUST stay in sync with .win-segment / .lose-segment in style.css
const SPINNER_WIN_RANGE = [10, 170];
const SPINNER_LOSE_RANGE = [190, 350];

/* ============================================================
   SECTION 2: GAME STATE
   ============================================================ */

const gameState = {
  players: [],
  currentPlayerIndex: 0,
  tileCount: 20,
  timerDuration: 120,
  questionBank: null,
  tileQuestionMap: [],
  bombTileIndex: null,
  decoyTileIndexes: [],
  revealedTiles: [],
  permanentlySafeTiles: [],
  currentTileIndex: null,
  timerInterval: null,
  timeRemaining: 0,

  heatMeterEnabled: true,
  decoyCount: 0,
  spinnerWinChance: 100,

  _pendingResult: null,
  _spinnerTileIndex: null,
  _spinnerResult: null
};

/* ============================================================
   SECTION 3: DOM ELEMENT REFERENCES
   ============================================================ */

const el = {
  numPlayersSelect: document.getElementById('num-players'),
  playerNamesContainer: document.getElementById('player-names-container'),

  gridSizeSlider: document.getElementById('grid-size'),
  gridSizeValue: document.getElementById('grid-size-value'),

  timerSelect: document.getElementById('timer-select'),

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

  setupScreen: document.getElementById('setup-screen'),
  gameScreen: document.getElementById('game-screen'),

  currentTurnDisplay: document.getElementById('current-turn-display'),
  globalTimerDisplay: document.getElementById('global-timer-display'),
  timerValue: document.getElementById('timer-value'),
  restartBtn: document.getElementById('restart-btn'),
  heatLegend: document.getElementById('heat-legend'),
  tileGrid: document.getElementById('tile-grid'),
  scoreboard: document.getElementById('scoreboard'),

  toastBanner: document.getElementById('toast-banner'),

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

  spinnerModal: document.getElementById('spinner-modal'),
  spinnerWheel: document.getElementById('spinner-wheel'),
  spinBtn: document.getElementById('spin-btn'),
  spinnerResultArea: document.getElementById('spinner-result-area'),
  spinnerResultText: document.getElementById('spinner-result-text'),
  spinnerContinueBtn: document.getElementById('spinner-continue-btn'),

  endScreen: document.getElementById('end-screen'),
  winnerText: document.getElementById('winner-text'),
  confettiContainer: document.getElementById('confetti-container'),
  playAgainBtn: document.getElementById('play-again-btn'),
  newSettingsBtn: document.getElementById('new-settings-btn')
};

/* ============================================================
   SECTION 4: SCIENCE / MATH TEXT FORMATTER
   ============================================================
   Supported shorthand:
     ->            →
     <=>           ⇌
     frac{a}{b}    stacked fraction (works with algebra)
     mixed{w}{n}{d} stacked mixed number
     3/4           AUTO stacked fraction (pure numbers only)
     x^{2n+1}      superscript (braces)
     x^(2n+1)      superscript (parentheses)
     x^2 / x^-3    superscript (numbers, incl. negatives)
     x^n           superscript (single letter)
     C_2 / C_{2n}  subscripts
   ============================================================ */

function formatScienceText(raw) {
  if (!raw) return '';
  let text = raw;

  // --- 1. Reaction arrows (run first, before any other symbol handling)
  text = text.replace(/<=>/g, '⇌');
  text = text.replace(/->/g, '→');

  // --- 2. Mixed numbers: mixed{whole}{num}{den}
  text = text.replace(/mixed\{([^{}]+)\}\{([^{}]+)\}\{([^{}]+)\}/g,
    (m, whole, num, den) =>
      `<span class="mixed-number">${whole}<span class="fraction"><span class="num">${num}</span><span class="den">${den}</span></span></span>`
  );

  // --- 3. Explicit stacked fractions: frac{numerator}{denominator}
  //        Use this for ANY algebraic fraction, e.g. frac{x+1}{y-2}
  text = text.replace(/frac\{([^{}]+)\}\{([^{}]+)\}/g,
    (m, num, den) =>
      `<span class="fraction"><span class="num">${num}</span><span class="den">${den}</span></span>`
  );

  // --- 4. AUTO stacked fractions for plain numeric fractions like 2/3, 1/25, 9/4
  //        Rule: only digits/digits, and NOT immediately after a ^ or an
  //        alphanumeric character. This protects things like x^2/3 (= x² ÷ 3)
  //        and avoids mangling already-generated HTML.
  text = text.replace(/(^|[^\^0-9A-Za-z])(\d+)\/(\d+)/g,
    (m, prefix, num, den) =>
      `${prefix}<span class="fraction"><span class="num">${num}</span><span class="den">${den}</span></span>`
  );

  // --- 5. Multi-character superscripts: braces AND parentheses
  text = text.replace(/\^\{([^{}]+)\}/g, (m, p1) => `<sup>${p1}</sup>`);
  text = text.replace(/\^\(([^()]+)\)/g, (m, p1) => `<sup>${p1}</sup>`);

  // --- 6. Multi-character subscripts: braces
  text = text.replace(/_\{([^{}]+)\}/g, (m, p1) => `<sub>${p1}</sub>`);

  // --- 7. Numeric superscripts, including negatives: ^2, ^-2, ^12
  text = text.replace(/\^(-?\d+)/g, (m, p1) => `<sup>${p1}</sup>`);

  // --- 8. Single-letter superscripts: ^x, ^n, ^a
  text = text.replace(/\^([a-zA-Z])/g, (m, p1) => `<sup>${p1}</sup>`);

  // --- 9. Single-character subscripts: _2, _n
  text = text.replace(/_([a-zA-Z0-9])/g, (m, p1) => `<sub>${p1}</sub>`);

  return text;
}

/* ============================================================
   SECTION 5: UTILITIES
   ============================================================ */

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRowCol(tileIndex) {
  return {
    row: Math.floor(tileIndex / GRID_COLUMNS),
    col: tileIndex % GRID_COLUMNS
  };
}

function showScreen(screenName) {
  el.setupScreen.classList.remove('active');
  el.gameScreen.classList.remove('active');
  if (screenName === 'setup') el.setupScreen.classList.add('active');
  if (screenName === 'game') el.gameScreen.classList.add('active');
}

function openOverlay(overlayEl) {
  overlayEl.classList.remove('hidden');
}

function closeOverlay(overlayEl) {
  overlayEl.classList.add('hidden');
}

function showToast(message, duration = 3000) {
  el.toastBanner.textContent = message;
  el.toastBanner.classList.remove('hidden');
  clearTimeout(el.toastBanner._hideTimeout);
  el.toastBanner._hideTimeout = setTimeout(() => {
    el.toastBanner.classList.add('hidden');
  }, duration);
}

/* ============================================================
   SECTION 6: SETUP — PLAYER NAME INPUTS
   ============================================================ */

function renderPlayerNameInputs() {
  const count = parseInt(el.numPlayersSelect.value, 10);
  el.playerNamesContainer.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'player-input-wrapper';

    const label = document.createElement('label');
    label.textContent = `Player ${i + 1} Name:`;
    label.setAttribute('for', `player-name-${i}`);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `player-name-${i}`;
    input.className = 'player-name-input';
    input.placeholder = `Player ${i + 1}`;
    input.maxLength = 20;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    el.playerNamesContainer.appendChild(wrapper);
  }
}

el.numPlayersSelect.addEventListener('change', renderPlayerNameInputs);

/* ============================================================
   SECTION 7: SETUP — GRID SLIDER
   ============================================================ */

el.gridSizeSlider.addEventListener('input', () => {
  el.gridSizeValue.textContent = el.gridSizeSlider.value;
});

/* ============================================================
   SECTION 8: SETUP — QUESTION SOURCE TOGGLE
   ============================================================ */

el.sourceTypeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'url' && radio.checked) {
      el.urlInputGroup.classList.remove('hidden');
      el.uploadInputGroup.classList.add('hidden');
    } else if (radio.value === 'upload' && radio.checked) {
      el.urlInputGroup.classList.add('hidden');
      el.uploadInputGroup.classList.remove('hidden');
    }
  });
});

/* ============================================================
   SECTION 9: SETUP — QUESTION LOADING
   ============================================================ */

function setLoadStatus(message, isError) {
  el.loadStatus.textContent = message;
  el.loadStatus.className = isError ? 'status-text error' : 'status-text success';
}

function handleLoadedQuestionData(data) {
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    setLoadStatus('❌ Invalid file: no questions found.', true);
    el.startGameBtn.disabled = true;
    return false;
  }

  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];
    if (!q.question || typeof q.question !== 'string') {
      setLoadStatus(`❌ Question ${i + 1} is missing question text.`, true);
      el.startGameBtn.disabled = true;
      return false;
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      setLoadStatus(`❌ Question ${i + 1} needs at least 2 options.`, true);
      el.startGameBtn.disabled = true;
      return false;
    }
    if (
      typeof q.correctIndex !== 'number' ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length
    ) {
      setLoadStatus(`❌ Question ${i + 1} has an invalid correctIndex.`, true);
      el.startGameBtn.disabled = true;
      return false;
    }
  }

  gameState.questionBank = data;
  setLoadStatus(
    `✅ Loaded "${data.topic || 'Untitled'}" — ${data.questions.length} questions.`,
    false
  );
  el.startGameBtn.disabled = false;
  return true;
}

function loadQuestionsFromGithub(filename) {
  if (!filename || !filename.trim()) {
    setLoadStatus('❌ Please enter a filename.', true);
    return;
  }

  let cleanFilename = filename.trim();

  // Strip a leading "questions/" if the user pasted the full path
  if (cleanFilename.toLowerCase().startsWith('questions/')) {
    cleanFilename = cleanFilename.slice('questions/'.length);
  }

  // Auto-append .json if omitted
  if (!cleanFilename.toLowerCase().endsWith('.json')) {
    cleanFilename += '.json';
  }

  const url = GITHUB_BASE_URL + cleanFilename;
  setLoadStatus(`⏳ Loading "${url}"...`, false);

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => handleLoadedQuestionData(data))
    .catch(err => {
      setLoadStatus(
        `❌ Failed to load "${url}" (${err.message}). Check: (1) exact filename and capitalisation, (2) file sits inside the /questions/ folder, (3) GitHub Pages has finished deploying.`,
        true
      );
      console.error(err);
    });
}

el.loadQuestionsBtn.addEventListener('click', () => {
  loadQuestionsFromGithub(el.jsonFilenameInput.value);
});

el.loadPresetBtn.addEventListener('click', () => {
  el.jsonFilenameInput.value = SAMPLE_QUESTION_FILENAME;
  loadQuestionsFromGithub(SAMPLE_QUESTION_FILENAME);
});

el.jsonUploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      handleLoadedQuestionData(data);
    } catch (err) {
      setLoadStatus('❌ Could not parse that file as JSON.', true);
      el.startGameBtn.disabled = true;
      console.error(err);
    }
  };
  reader.readAsText(file);
});

/* ============================================================
   SECTION 10: READ TWIST SETTINGS
   ============================================================ */

function readTwistSettingsFromUI() {
  gameState.heatMeterEnabled = el.heatMeterSelect.value === 'on';
  gameState.decoyCount = parseInt(el.decoySelect.value, 10);
  gameState.spinnerWinChance = parseInt(el.spinnerSelect.value, 10);
}

/* ============================================================
   SECTION 11: GAME INITIALIZATION
   ============================================================ */

function buildTileQuestionMap(tileCount, questions) {
  const shuffled = shuffleArray(questions);
  const map = [];
  for (let i = 0; i < tileCount; i++) {
    map.push(shuffled[i % shuffled.length]);
  }
  return map;
}

function initializeGameState() {
  const count = parseInt(el.numPlayersSelect.value, 10);
  gameState.players = [];
  for (let i = 0; i < count; i++) {
    const input = document.getElementById(`player-name-${i}`);
    const name = (input && input.value.trim()) || `Player ${i + 1}`;
    gameState.players.push({ name, score: 0 });
  }
  gameState.currentPlayerIndex = 0;

  gameState.tileCount = parseInt(el.gridSizeSlider.value, 10);
  gameState.timerDuration = parseInt(el.timerSelect.value, 10);

  readTwistSettingsFromUI();

  gameState.revealedTiles = new Array(gameState.tileCount).fill(false);
  gameState.permanentlySafeTiles = new Array(gameState.tileCount).fill(false);

  gameState.bombTileIndex = getRandomInt(0, gameState.tileCount - 1);

  gameState.decoyTileIndexes = [];
  const availableForDecoy = [];
  for (let i = 0; i < gameState.tileCount; i++) {
    if (i !== gameState.bombTileIndex) availableForDecoy.push(i);
  }
  const shuffledAvailable = shuffleArray(availableForDecoy);
  for (let i = 0; i < gameState.decoyCount && i < shuffledAvailable.length; i++) {
    gameState.decoyTileIndexes.push(shuffledAvailable[i]);
  }

  gameState.tileQuestionMap = buildTileQuestionMap(
    gameState.tileCount,
    gameState.questionBank.questions
  );
}

/* ============================================================
   SECTION 12: TILE GRID
   ============================================================ */

function renderTileGrid() {
  el.tileGrid.innerHTML = '';
  el.tileGrid.style.gridTemplateColumns = `repeat(${GRID_COLUMNS}, 1fr)`;

  for (let i = 0; i < gameState.tileCount; i++) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.type = 'button';
    tile.dataset.index = i;
    tile.textContent = i + 1;
    tile.addEventListener('click', () => handleTileClick(i));
    el.tileGrid.appendChild(tile);
  }

  updateHeatLegendVisibility();
}

function getTileElement(index) {
  return el.tileGrid.querySelector(`[data-index="${index}"]`);
}

function setTilesInteractable(interactable) {
  el.tileGrid.querySelectorAll('.tile').forEach(tile => {
    const idx = parseInt(tile.dataset.index, 10);
    tile.disabled = !(interactable && !gameState.revealedTiles[idx]);
  });
}

function updateHeatLegendVisibility() {
  if (gameState.heatMeterEnabled) {
    el.heatLegend.classList.remove('hidden');
  } else {
    el.heatLegend.classList.add('hidden');
  }
}

/* ============================================================
   SECTION 13: HEAT METER
   ============================================================ */

function calculateHeatLevel(tileIndex) {
  const { row: r1, col: c1 } = getRowCol(tileIndex);
  const { row: r2, col: c2 } = getRowCol(gameState.bombTileIndex);

  const distance = Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(c1 - c2, 2));
  const maxDistance = Math.sqrt(
    Math.pow(GRID_COLUMNS - 1, 2) +
    Math.pow(Math.ceil(gameState.tileCount / GRID_COLUMNS) - 1, 2)
  );
  const normalized = distance / maxDistance;

  if (normalized <= 0.15) return '🔥🔥🔥';
  if (normalized <= 0.35) return '🔥';
  if (normalized <= 0.55) return '🙂';
  if (normalized <= 0.75) return '😎';
  return '🥶';
}

/* ============================================================
   SECTION 14: SCOREBOARD & TURN DISPLAY
   ============================================================ */

function renderScoreboard() {
  el.scoreboard.innerHTML = '';
  gameState.players.forEach((player, idx) => {
    const item = document.createElement('div');
    item.className = 'scoreboard-item';
    if (idx === gameState.currentPlayerIndex) item.classList.add('active-player');
    item.textContent = `${player.name}: ${player.score}`;
    el.scoreboard.appendChild(item);
  });
}

function updateTurnDisplay() {
  const player = gameState.players[gameState.currentPlayerIndex];
  el.currentTurnDisplay.textContent = `${player.name}'s Turn`;
}

/* ============================================================
   SECTION 15: TILE CLICK & QUESTION MODAL
   ============================================================ */

let selectedOptionIndex = null;

function handleTileClick(tileIndex) {
  if (gameState.revealedTiles[tileIndex]) return;
  gameState.currentTileIndex = tileIndex;
  openQuestionModal(gameState.tileQuestionMap[tileIndex]);
}

function openQuestionModal(questionData) {
  selectedOptionIndex = null;
  el.questionText.innerHTML = formatScienceText(questionData.question);
  el.optionsContainer.innerHTML = '';
  el.feedbackArea.classList.add('hidden');
  el.explanationText.textContent = '';
  el.submitAnswerBtn.disabled = true;
  el.submitAnswerBtn.classList.remove('hidden');

  questionData.options.forEach((optionText, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.type = 'button';
    btn.innerHTML = formatScienceText(optionText);
    btn.dataset.index = idx;
    btn.addEventListener('click', () => selectOption(idx));
    el.optionsContainer.appendChild(btn);
  });

  openOverlay(el.questionModal);
  startQuestionTimer();
}

function selectOption(idx) {
  selectedOptionIndex = idx;
  const buttons = el.optionsContainer.querySelectorAll('.option-btn');
  buttons.forEach(btn => btn.classList.remove('selected'));
  buttons[idx].classList.add('selected');
  el.submitAnswerBtn.disabled = false;
}

/* ============================================================
   SECTION 16: QUESTION TIMER
   ============================================================ */

function startQuestionTimer() {
  stopQuestionTimer();

  if (gameState.timerDuration === 0) {
    el.modalTimer.classList.add('hidden');
    el.globalTimerDisplay.classList.add('hidden');
    return;
  }

  gameState.timeRemaining = gameState.timerDuration;
  el.modalTimer.classList.remove('hidden');
  el.globalTimerDisplay.classList.remove('hidden');
  el.modalTimerValue.textContent = gameState.timeRemaining;
  el.timerValue.textContent = gameState.timeRemaining;

  gameState.timerInterval = setInterval(() => {
    gameState.timeRemaining--;
    el.modalTimerValue.textContent = gameState.timeRemaining;
    el.timerValue.textContent = gameState.timeRemaining;

    if (gameState.timeRemaining <= 0) {
      stopQuestionTimer();
      processAnswer(false);
    }
  }, 1000);
}

function stopQuestionTimer() {
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }
}

/* ============================================================
   SECTION 17: ANSWER SUBMISSION
   ============================================================ */

el.submitAnswerBtn.addEventListener('click', () => {
  if (selectedOptionIndex === null) return;
  stopQuestionTimer();
  const questionData = gameState.tileQuestionMap[gameState.currentTileIndex];
  processAnswer(selectedOptionIndex === questionData.correctIndex);
});

function processAnswer(isCorrect) {
  const tileIndex = gameState.currentTileIndex;
  const questionData = gameState.tileQuestionMap[tileIndex];

  el.optionsContainer.querySelectorAll('.option-btn').forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === questionData.correctIndex) btn.classList.add('correct');
    else if (idx === selectedOptionIndex && !isCorrect) btn.classList.add('incorrect');
  });

  el.submitAnswerBtn.classList.add('hidden');
  el.feedbackText.textContent = isCorrect ? '✅ Correct!' : '❌ Incorrect!';

  if (questionData.explanation) {
    el.explanationText.innerHTML = formatScienceText(questionData.explanation);
  } else {
    el.explanationText.textContent = '';
  }

  el.feedbackArea.classList.remove('hidden');
  gameState._pendingResult = { tileIndex, isCorrect };
}

/* ============================================================
   SECTION 18: CONTINUE — RESOLVE TILE OUTCOME
   ============================================================ */

el.continueBtn.addEventListener('click', () => {
  closeOverlay(el.questionModal);
  const { tileIndex, isCorrect } = gameState._pendingResult;

  if (!isCorrect) {
    showToast('❌ Incorrect! Turn passes.');
    advanceToNextPlayer();
    return;
  }

  if (tileIndex === gameState.bombTileIndex) {
    handleBombFound(tileIndex);
  } else if (gameState.decoyTileIndexes.includes(tileIndex)) {
    revealDecoyTile(tileIndex);
  } else {
    revealSafeTile(tileIndex);
  }
});

function revealSafeTile(tileIndex) {
  gameState.revealedTiles[tileIndex] = true;
  const tileEl = getTileElement(tileIndex);
  tileEl.classList.add('revealed', 'safe');
  tileEl.disabled = true;

  gameState.players[gameState.currentPlayerIndex].score += 1;

  if (gameState.heatMeterEnabled) {
    tileEl.innerHTML = `<span class="heat-emoji">${calculateHeatLevel(tileIndex)}</span>`;
  } else {
    tileEl.textContent = '✔️';
  }

  renderScoreboard();
  advanceToNextPlayer();
}

function revealDecoyTile(tileIndex) {
  gameState.revealedTiles[tileIndex] = true;
  const tileEl = getTileElement(tileIndex);
  tileEl.classList.add('revealed', 'decoy');
  tileEl.textContent = '🎭';
  tileEl.disabled = true;

  gameState.players[gameState.currentPlayerIndex].score += 2;

  showToast('💥 FALSE ALARM! That was a decoy bomb. +1 bonus point!');
  renderScoreboard();
  advanceToNextPlayer();
}

function advanceToNextPlayer() {
  gameState.currentPlayerIndex =
    (gameState.currentPlayerIndex + 1) % gameState.players.length;
  updateTurnDisplay();
  renderScoreboard();
  setTilesInteractable(true);
}

/* ============================================================
   SECTION 19: BOMB FOUND
   ============================================================ */

function handleBombFound(tileIndex) {
  const tileEl = getTileElement(tileIndex);
  tileEl.classList.add('revealed', 'bomb');
  tileEl.textContent = '💣';

  if (gameState.spinnerWinChance >= 100) {
    const player = gameState.players[gameState.currentPlayerIndex];
    player.score += 1;
    endGame(player);
  } else {
    openSpinnerModal(tileIndex);
  }
}

/* ============================================================
   SECTION 20: DEFUSE SPINNER (outcome-first, no mismatch)
   ============================================================ */

function openSpinnerModal(tileIndex) {
  gameState._spinnerTileIndex = tileIndex;
  el.spinnerWheel.classList.remove('spinning');
  el.spinnerWheel.style.transform = 'rotate(0deg)';
  el.spinBtn.disabled = false;
  el.spinBtn.classList.remove('hidden');
  el.spinnerResultArea.classList.add('hidden');
  openOverlay(el.spinnerModal);
}

function spinWheel(winChancePercent, onComplete) {
  const wheelEl = el.spinnerWheel;

  // Outcome decided FIRST — single source of truth
  const isWin = Math.random() * 100 < winChancePercent;

  const [minAngle, maxAngle] = isWin ? SPINNER_WIN_RANGE : SPINNER_LOSE_RANGE;
  const targetAngle = minAngle + Math.random() * (maxAngle - minAngle);

  const fullSpins = 4 + Math.floor(Math.random() * 3);
  const rotationMod = (360 - targetAngle) % 360;
  const finalRotation = fullSpins * 360 + rotationMod;

  wheelEl.classList.remove('spinning');
  wheelEl.style.transform = 'rotate(0deg)';
  void wheelEl.offsetWidth; // force reflow so the reset applies
  wheelEl.classList.add('spinning');

  requestAnimationFrame(() => {
    wheelEl.style.transform = `rotate(${finalRotation}deg)`;
  });

  setTimeout(() => onComplete(isWin), 4100);
}

el.spinBtn.addEventListener('click', () => {
  el.spinBtn.disabled = true;
  spinWheel(gameState.spinnerWinChance, showSpinnerResult);
});

function showSpinnerResult(isWin) {
  el.spinBtn.classList.add('hidden');
  el.spinnerResultArea.classList.remove('hidden');

  if (isWin) {
    el.spinnerResultText.textContent = '✅ DEFUSED! You win!';
    el.spinnerResultText.className = 'spinner-result-text win';
  } else {
    el.spinnerResultText.textContent = '💥 BOOM! The bomb relocates...';
    el.spinnerResultText.className = 'spinner-result-text lose';
  }

  gameState._spinnerResult = isWin;
}

el.spinnerContinueBtn.addEventListener('click', () => {
  closeOverlay(el.spinnerModal);
  const tileIndex = gameState._spinnerTileIndex;

  if (gameState._spinnerResult) {
    const player = gameState.players[gameState.currentPlayerIndex];
    player.score += 1;
    endGame(player);
  } else {
    relocateBomb(tileIndex);
    showToast('🔄 The bomb has relocated to a new hidden tile!');
    advanceToNextPlayer();
  }
});

function relocateBomb(oldTileIndex) {
  gameState.permanentlySafeTiles[oldTileIndex] = true;
  gameState.revealedTiles[oldTileIndex] = true;

  const candidates = [];
  for (let i = 0; i < gameState.tileCount; i++) {
    if (
      !gameState.revealedTiles[i] &&
      !gameState.permanentlySafeTiles[i] &&
      !gameState.decoyTileIndexes.includes(i)
    ) {
      candidates.push(i);
    }
  }

  if (candidates.length > 0) {
    gameState.bombTileIndex = candidates[getRandomInt(0, candidates.length - 1)];
  } else {
    const decoyFallbacks = gameState.decoyTileIndexes.filter(
      i => !gameState.revealedTiles[i] && !gameState.permanentlySafeTiles[i]
    );
    if (decoyFallbacks.length > 0) {
      const newBombIndex = decoyFallbacks[getRandomInt(0, decoyFallbacks.length - 1)];
      gameState.bombTileIndex = newBombIndex;
      gameState.decoyTileIndexes =
        gameState.decoyTileIndexes.filter(i => i !== newBombIndex);
    }
  }

  const oldTileEl = getTileElement(oldTileIndex);
  oldTileEl.classList.remove('bomb');
  oldTileEl.classList.add('revealed', 'safe');
  oldTileEl.textContent = '✔️';
  oldTileEl.disabled = true;
}

/* ============================================================
   SECTION 21: END GAME
   ============================================================ */

function endGame(winner) {
  stopQuestionTimer();
  el.winnerText.textContent = `🎉 ${winner.name} wins by finding the bomb!`;

  let finalScoresEl = document.getElementById('final-scores-dynamic');
  if (!finalScoresEl) {
    finalScoresEl = document.createElement('div');
    finalScoresEl.id = 'final-scores-dynamic';
    finalScoresEl.className = 'final-scores';
    el.winnerText.insertAdjacentElement('afterend', finalScoresEl);
  }
  finalScoresEl.innerHTML = '';

  [...gameState.players]
    .sort((a, b) => b.score - a.score)
    .forEach(player => {
      const item = document.createElement('div');
      item.className = 'final-score-item';
      item.textContent = `${player.name}: ${player.score} points`;
      finalScoresEl.appendChild(item);
    });

  openOverlay(el.endScreen);
  triggerConfetti();
}

function triggerConfetti() {
  el.confettiContainer.innerHTML = '';
  const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[getRandomInt(0, colors.length - 1)];
    piece.style.animationDelay = `${Math.random() * 2}s`;
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    el.confettiContainer.appendChild(piece);
  }
}

/* ============================================================
   SECTION 22: START / RESTART HANDLERS
   ============================================================ */

el.startGameBtn.addEventListener('click', () => {
  if (!gameState.questionBank) {
    setLoadStatus('❌ Please load a question bank before starting.', true);
    return;
  }

  initializeGameState();
  renderTileGrid();
  renderScoreboard();
  updateTurnDisplay();
  setTilesInteractable(true);
  showScreen('game');
});

el.restartBtn.addEventListener('click', () => {
  if (confirm('Start a new game? Current progress will be lost.')) {
    showScreen('setup');
  }
});

el.playAgainBtn.addEventListener('click', () => {
  closeOverlay(el.endScreen);
  initializeGameState();
  renderTileGrid();
  renderScoreboard();
  updateTurnDisplay();
  setTilesInteractable(true);
  showScreen('game');
});

el.newSettingsBtn.addEventListener('click', () => {
  closeOverlay(el.endScreen);
  showScreen('setup');
});

/* ============================================================
   SECTION 23: INITIAL PAGE LOAD
   ============================================================ */

renderPlayerNameInputs();