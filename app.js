/* ============================================================
   FIND THE BOMB — SCIENCE EDITION
   app.js — Complete Game Logic
   Pure HTML/CSS/JS — no frameworks, no build tools
   ============================================================ */

/* ============================================================
   SECTION 1: CONSTANTS
   ============================================================ */

const GRID_COLUMNS = 5;
const GITHUB_BASE_URL = 'questions/';
const SAMPLE_QUESTION_FILENAME = 'alkanes-alkenes.json';

/* ============================================================
   SECTION 2: GAME STATE
   ============================================================ */

const gameState = {
  players: [],              // [{ name, score }]
  currentPlayerIndex: 0,
  tileCount: 20,
  timerDuration: 60,        // seconds; 0 = no limit
  questionBank: null,       // { topic, level, questions: [...] }
  tileQuestionMap: [],      // questions assigned per tile index
  bombTileIndex: null,
  decoyTileIndexes: [],     // array of tile indexes that are decoys
  revealedTiles: [],        // booleans per tile index
  permanentlySafeTiles: [], // tiles that were "boomed" via spinner and can't hold bomb again
  currentTileIndex: null,
  timerInterval: null,
  timeRemaining: 0,

  // Twist settings (teacher-controlled every game, not persisted)
  heatMeterEnabled: true,
  decoyCount: 0,
  spinnerWinChance: 100     // 100 = spinner disabled (instant win)
};

/* ============================================================
   SECTION 3: DOM ELEMENT REFERENCES
   ============================================================ */

const el = {
  // Screens
  setupScreen: document.getElementById('setup-screen'),
  gameScreen: document.getElementById('game-screen'),
  endScreen: document.getElementById('end-screen'),

  // Setup — players
  playerCountSelect: document.getElementById('player-count'),
  playerNameInputsContainer: document.getElementById('player-name-inputs'),

  // Setup — grid
  tileCountSlider: document.getElementById('tile-count-slider'),
  tileCountDisplay: document.getElementById('tile-count-display'),

  // Setup — timer
  timerSelect: document.getElementById('timer-select'),

  // Setup — twists
  heatMeterSelect: document.getElementById('heat-meter-select'),
  decoySelect: document.getElementById('decoy-select'),
  spinnerSelect: document.getElementById('spinner-select'),

  // Setup — question loading
  sourceTypeRadios: document.querySelectorAll('input[name="source-type"]'),
  githubLoadSection: document.getElementById('github-load-section'),
  uploadLoadSection: document.getElementById('upload-load-section'),
  jsonFilenameInput: document.getElementById('json-filename'),
  loadQuestionsBtn: document.getElementById('load-questions-btn'),
  useSampleBtn: document.getElementById('use-sample-btn'),
  uploadFileInput: document.getElementById('upload-file-input'),
  loadStatus: document.getElementById('load-status'),

  // Setup — start
  startGameBtn: document.getElementById('start-game-btn'),

  // Game screen
  turnDisplay: document.getElementById('turn-display'),
  timerDisplay: document.getElementById('timer-display'),
  heatLegend: document.getElementById('heat-legend'),
  tileGridContainer: document.getElementById('tile-grid'),
  scoreboardContainer: document.getElementById('scoreboard'),
  toastBanner: document.getElementById('toast-banner'),

  // Question modal
  questionModal: document.getElementById('question-modal'),
  questionText: document.getElementById('question-text'),
  optionsContainer: document.getElementById('options-container'),
  submitAnswerBtn: document.getElementById('submit-answer-btn'),
  questionTimerBar: document.getElementById('question-timer-bar'),
  explanationContainer: document.getElementById('explanation-container'),
  explanationText: document.getElementById('explanation-text'),
  continueBtn: document.getElementById('continue-btn'),

  // Spinner modal
  spinnerModal: document.getElementById('spinner-modal'),
  spinnerWheel: document.getElementById('spinner-wheel'),
  spinBtn: document.getElementById('spin-btn'),
  spinnerResultText: document.getElementById('spinner-result-text'),
  spinnerContinueBtn: document.getElementById('spinner-continue-btn'),

  // End screen
  winnerText: document.getElementById('winner-text'),
  finalScoresContainer: document.getElementById('final-scores'),
  confettiContainer: document.getElementById('confetti-container'),
  playAgainBtn: document.getElementById('play-again-btn'),
  newSettingsBtn: document.getElementById('new-settings-btn')
};

/* ============================================================
   SECTION 4: SCIENCE/MATH TEXT FORMATTER
   ============================================================ */

function formatScienceText(raw) {
  if (!raw) return '';
  let text = raw;

  // 1. Reaction arrows (must run before anything else touches special chars)
  text = text.replace(/<=>/g, '⇌');
  text = text.replace(/->/g, '→');

  // 2. Mixed numbers: mixed{whole}{num}{den}
  text = text.replace(/mixed\{([^{}]+)\}\{([^{}]+)\}\{([^{}]+)\}/g,
    (m, whole, num, den) => {
      return `<span class="mixed-number">${whole}<span class="fraction"><span class="num">${num}</span><span class="den">${den}</span></span></span>`;
    });

  // 3. Fractions: frac{numerator}{denominator} — supports algebra
  text = text.replace(/frac\{([^{}]+)\}\{([^{}]+)\}/g,
    (m, num, den) => {
      return `<span class="fraction"><span class="num">${num}</span><span class="den">${den}</span></span>`;
    });

  // 4. Braced subscripts/superscripts (multi-character): must come before single-char versions
  text = text.replace(/\^\{([^{}]+)\}/g, (m, p1) => `<sup>${p1}</sup>`);
  text = text.replace(/_\{([^{}]+)\}/g, (m, p1) => `<sub>${p1}</sub>`);

  // 5. Single-character subscripts/superscripts
  text = text.replace(/\^([a-zA-Z0-9+\-])/g, (m, p1) => `<sup>${p1}</sup>`);
  text = text.replace(/_([a-zA-Z0-9+\-])/g, (m, p1) => `<sub>${p1}</sub>`);

  return text;
}

/* ============================================================
   SECTION 5: UTILITY FUNCTIONS
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
  const row = Math.floor(tileIndex / GRID_COLUMNS);
  const col = tileIndex % GRID_COLUMNS;
  return { row, col };
}

function showScreen(screenName) {
  el.setupScreen.classList.add('hidden');
  el.gameScreen.classList.add('hidden');
  el.endScreen.classList.add('hidden');

  if (screenName === 'setup') el.setupScreen.classList.remove('hidden');
  if (screenName === 'game') el.gameScreen.classList.remove('hidden');
  if (screenName === 'end') el.endScreen.classList.remove('hidden');
}

function showToast(message, duration = 3000) {
  el.toastBanner.textContent = message;
  el.toastBanner.classList.add('visible');
  clearTimeout(el.toastBanner._hideTimeout);
  el.toastBanner._hideTimeout = setTimeout(() => {
    el.toastBanner.classList.remove('visible');
  }, duration);
}

/* ============================================================
   SECTION 6: SETUP SCREEN — PLAYER NAME INPUTS
   ============================================================ */

function renderPlayerNameInputs() {
  const count = parseInt(el.playerCountSelect.value, 10);
  el.playerNameInputsContainer.innerHTML = '';

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
    el.playerNameInputsContainer.appendChild(wrapper);
  }
}

el.playerCountSelect.addEventListener('change', renderPlayerNameInputs);

/* ============================================================
   SECTION 7: SETUP SCREEN — GRID SLIDER
   ============================================================ */

el.tileCountSlider.addEventListener('input', () => {
  el.tileCountDisplay.textContent = el.tileCountSlider.value;
});

/* ============================================================
   SECTION 8: SETUP SCREEN — QUESTION SOURCE TOGGLE
   ============================================================ */

el.sourceTypeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'github' && radio.checked) {
      el.githubLoadSection.classList.remove('hidden');
      el.uploadLoadSection.classList.add('hidden');
    } else if (radio.value === 'upload' && radio.checked) {
      el.githubLoadSection.classList.add('hidden');
      el.uploadLoadSection.classList.remove('hidden');
    }
  });
});

/* ============================================================
   SECTION 9: SETUP SCREEN — QUESTION LOADING
   ============================================================ */

function setLoadStatus(message, isError) {
  el.loadStatus.textContent = message;
  el.loadStatus.className = isError ? 'load-status error' : 'load-status success';
}

function handleLoadedQuestionData(data) {
  // Validation
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    setLoadStatus('❌ Invalid file: no questions found.', true);
    return false;
  }

  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];
    if (!q.question || typeof q.question !== 'string') {
      setLoadStatus(`❌ Question ${i + 1} is missing question text.`, true);
      return false;
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      setLoadStatus(`❌ Question ${i + 1} needs at least 2 options.`, true);
      return false;
    }
    if (
      typeof q.correctIndex !== 'number' ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length
    ) {
      setLoadStatus(`❌ Question ${i + 1} has an invalid correctIndex.`, true);
      return false;
    }
  }

  gameState.questionBank = data;
  setLoadStatus(`✅ Loaded "${data.topic || 'Untitled'}" — ${data.questions.length} questions.`, false);
  return true;
}

function loadQuestionsFromGithub(filename) {
  if (!filename || !filename.trim()) {
    setLoadStatus('❌ Please enter a filename.', true);
    return;
  }
  const url = GITHUB_BASE_URL + filename.trim();
  setLoadStatus('⏳ Loading...', false);

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => handleLoadedQuestionData(data))
    .catch(err => {
      setLoadStatus(`❌ Failed to load "${filename}". Check the filename and that it exists in /questions/.`, true);
      console.error(err);
    });
}

el.loadQuestionsBtn.addEventListener('click', () => {
  loadQuestionsFromGithub(el.jsonFilenameInput.value);
});

el.useSampleBtn.addEventListener('click', () => {
  el.jsonFilenameInput.value = SAMPLE_QUESTION_FILENAME;
  loadQuestionsFromGithub(SAMPLE_QUESTION_FILENAME);
});

el.uploadFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      handleLoadedQuestionData(data);
    } catch (err) {
      setLoadStatus('❌ Could not parse file as JSON.', true);
      console.error(err);
    }
  };
  reader.readAsText(file);
});

/* ============================================================
   SECTION 10: SETUP SCREEN — READ TWIST SETTINGS
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
  // Players
  const count = parseInt(el.playerCountSelect.value, 10);
  gameState.players = [];
  for (let i = 0; i < count; i++) {
    const input = document.getElementById(`player-name-${i}`);
    const name = (input.value.trim() || `Player ${i + 1}`);
    gameState.players.push({ name, score: 0 });
  }
  gameState.currentPlayerIndex = 0;

  // Grid + timer
  gameState.tileCount = parseInt(el.tileCountSlider.value, 10);
  gameState.timerDuration = parseInt(el.timerSelect.value, 10);

  // Twists
  readTwistSettingsFromUI();

  // Tiles
  gameState.revealedTiles = new Array(gameState.tileCount).fill(false);
  gameState.permanentlySafeTiles = new Array(gameState.tileCount).fill(false);

  // Bomb placement
  gameState.bombTileIndex = getRandomInt(0, gameState.tileCount - 1);

  // Decoy placement (on non-bomb tiles)
  gameState.decoyTileIndexes = [];
  const availableForDecoy = [];
  for (let i = 0; i < gameState.tileCount; i++) {
    if (i !== gameState.bombTileIndex) availableForDecoy.push(i);
  }
  const shuffledAvailable = shuffleArray(availableForDecoy);
  for (let i = 0; i < gameState.decoyCount && i < shuffledAvailable.length; i++) {
    gameState.decoyTileIndexes.push(shuffledAvailable[i]);
  }

  // Question mapping
  gameState.tileQuestionMap = buildTileQuestionMap(
    gameState.tileCount,
    gameState.questionBank.questions
  );
}

/* ============================================================
   SECTION 12: TILE GRID RENDERING
   ============================================================ */

function renderTileGrid() {
  el.tileGridContainer.innerHTML = '';
  el.tileGridContainer.style.gridTemplateColumns = `repeat(${GRID_COLUMNS}, 1fr)`;

  for (let i = 0; i < gameState.tileCount; i++) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.index = i;
    tile.textContent = i + 1;
    tile.addEventListener('click', () => handleTileClick(i));
    el.tileGridContainer.appendChild(tile);
  }

  updateHeatLegendVisibility();
}

function getTileElement(index) {
  return el.tileGridContainer.querySelector(`[data-index="${index}"]`);
}

function setTilesInteractable(interactable) {
  const tiles = el.tileGridContainer.querySelectorAll('.tile');
  tiles.forEach(tile => {
    const idx = parseInt(tile.dataset.index, 10);
    if (interactable && !gameState.revealedTiles[idx]) {
      tile.disabled = false;
    } else {
      tile.disabled = true;
    }
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
   SECTION 13: HEAT METER CALCULATION
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
  el.scoreboardContainer.innerHTML = '';
  gameState.players.forEach((player, idx) => {
    const item = document.createElement('div');
    item.className = 'scoreboard-item';
    if (idx === gameState.currentPlayerIndex) item.classList.add('active-player');
    item.textContent = `${player.name}: ${player.score}`;
    el.scoreboardContainer.appendChild(item);
  });
}

function updateTurnDisplay() {
  const player = gameState.players[gameState.currentPlayerIndex];
  el.turnDisplay.textContent = `${player.name}'s Turn`;
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
  el.explanationContainer.classList.add('hidden');
  el.submitAnswerBtn.disabled = true;
  el.submitAnswerBtn.classList.remove('hidden');
  el.continueBtn.classList.add('hidden');

  const shuffledOptions = questionData.options.map((opt, idx) => ({ opt, idx }));
  // Keep original correctIndex mapping intact by NOT shuffling options
  // (shuffling would require remapping correctIndex — kept simple/stable)

  questionData.options.forEach((optionText, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = formatScienceText(optionText);
    btn.dataset.index = idx;
    btn.addEventListener('click', () => selectOption(idx));
    el.optionsContainer.appendChild(btn);
  });

  el.questionModal.classList.remove('hidden');
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
    el.timerDisplay.textContent = 'No Limit';
    el.questionTimerBar.style.width = '100%';
    return;
  }

  gameState.timeRemaining = gameState.timerDuration;
  el.timerDisplay.textContent = `${gameState.timeRemaining}s`;
  el.questionTimerBar.style.width = '100%';

  gameState.timerInterval = setInterval(() => {
    gameState.timeRemaining--;
    el.timerDisplay.textContent = `${gameState.timeRemaining}s`;
    const pct = (gameState.timeRemaining / gameState.timerDuration) * 100;
    el.questionTimerBar.style.width = `${Math.max(pct, 0)}%`;

    if (gameState.timeRemaining <= 0) {
      stopQuestionTimer();
      processAnswer(false); // timeout = wrong answer
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
   SECTION 17: ANSWER SUBMISSION & PROCESSING
   ============================================================ */

el.submitAnswerBtn.addEventListener('click', () => {
  if (selectedOptionIndex === null) return;
  stopQuestionTimer();
  const questionData = gameState.tileQuestionMap[gameState.currentTileIndex];
  const isCorrect = selectedOptionIndex === questionData.correctIndex;
  processAnswer(isCorrect);
});

function processAnswer(isCorrect) {
  const tileIndex = gameState.currentTileIndex;
  const questionData = gameState.tileQuestionMap[tileIndex];

  // Highlight correct/incorrect options
  const buttons = el.optionsContainer.querySelectorAll('.option-btn');
  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === questionData.correctIndex) btn.classList.add('correct');
    else if (idx === selectedOptionIndex && !isCorrect) btn.classList.add('incorrect');
  });

  el.submitAnswerBtn.classList.add('hidden');
  el.continueBtn.classList.remove('hidden');

  if (questionData.explanation) {
    el.explanationText.innerHTML = formatScienceText(questionData.explanation);
    el.explanationContainer.classList.remove('hidden');
  }

  // Store result for continue-btn handler
  gameState._pendingResult = { tileIndex, isCorrect };
}

/* ============================================================
   SECTION 18: CONTINUE BUTTON — RESOLVE TILE OUTCOME
   ============================================================ */

el.continueBtn.addEventListener('click', () => {
  el.questionModal.classList.add('hidden');
  const { tileIndex, isCorrect } = gameState._pendingResult;

  if (!isCorrect) {
    showToast(`❌ Incorrect! Turn passes.`);
    advanceToNextPlayer();
    return;
  }

  // Correct answer — determine what's under the tile
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

  const player = gameState.players[gameState.currentPlayerIndex];
  player.score += 1;

  if (gameState.heatMeterEnabled) {
    const heat = calculateHeatLevel(tileIndex);
    tileEl.innerHTML = `<span class="heat-emoji">${heat}</span>`;
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

  const player = gameState.players[gameState.currentPlayerIndex];
  player.score += 2; // 1 for correct answer + 1 decoy bonus

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
   SECTION 19: BOMB FOUND — WIN OR SPINNER
   ============================================================ */

function handleBombFound(tileIndex) {
  const tileEl = getTileElement(tileIndex);
  tileEl.classList.add('revealed', 'bomb');
  tileEl.textContent = '💣';

  if (gameState.spinnerWinChance >= 100) {
    // Instant win, classic mode
    const player = gameState.players[gameState.currentPlayerIndex];
    player.score += 1;
    endGame(player);
  } else {
    openSpinnerModal(tileIndex);
  }
}

/* ============================================================
   SECTION 20: DEFUSE SPINNER — ⚙️ FIXED IMPLEMENTATION
   ============================================================
   SPINNER FIX: outcome is now decided FIRST, then the wheel's
   rotation is mathematically calculated to land inside the
   correct colored segment. This guarantees the visual result
   always matches the declared win/lose outcome.
   ============================================================ */

function openSpinnerModal(tileIndex) {
  gameState._spinnerTileIndex = tileIndex;
  renderSpinnerWheel(gameState.spinnerWinChance);
  el.spinBtn.disabled = false;
  el.spinBtn.classList.remove('hidden');
  el.spinnerResultText.textContent = '';
  el.spinnerContinueBtn.classList.add('hidden');
  el.spinnerModal.classList.remove('hidden');
}

// Builds a conic-gradient wheel sized proportionally to the actual win chance
function renderSpinnerWheel(winChancePercent) {
  const greenDeg = winChancePercent * 3.6; // % -> degrees of 360
  el.spinnerWheel.style.background =
    `conic-gradient(#2ecc71 0deg ${greenDeg}deg, #e74c3c ${greenDeg}deg 360deg)`;

  // Reset to a clean, un-rotated, non-animated state
  el.spinnerWheel.classList.remove('spinning');
  el.spinnerWheel.style.transform = 'rotate(0deg)';
}

// Decides outcome first, then computes the rotation needed to land on it
function spinWheel(winChancePercent, onComplete) {
  const wheelEl = el.spinnerWheel;

  // 1. Decide the REAL outcome first — this is the single source of truth
  const isWin = Math.random() * 100 < winChancePercent;
  const greenDeg = winChancePercent * 3.6;
  const padding = 10; // degrees of safety margin away from the color boundary

  // 2. Pick a random angle safely INSIDE the correct segment
  let targetAngle;
  if (isWin) {
    const safeMin = padding;
    const safeMax = Math.max(greenDeg - padding, safeMin + 1);
    targetAngle = safeMin + Math.random() * (safeMax - safeMin);
  } else {
    const safeMin = greenDeg + padding;
    const safeMax = 360 - padding;
    targetAngle = safeMin + Math.random() * (safeMax - safeMin);
  }

  // 3. Convert target angle into a rotation value relative to the fixed
  //    pointer at the top (0deg), plus extra full spins for visual flair
  const fullSpins = 4 + Math.floor(Math.random() * 3); // 4–6 spins, cosmetic only
  const rotationMod = (360 - targetAngle) % 360;
  const finalRotation = fullSpins * 360 + rotationMod;

  // 4. Hard reset (no transition) then force reflow before animating,
  //    so repeated spins in the same session always animate forward cleanly
  wheelEl.classList.remove('spinning');
  wheelEl.style.transform = 'rotate(0deg)';
  void wheelEl.offsetWidth; // force reflow
  wheelEl.classList.add('spinning');

  requestAnimationFrame(() => {
    wheelEl.style.transform = `rotate(${finalRotation}deg)`;
  });

  // 5. Only report the result once the animation has visually finished
  setTimeout(() => {
    onComplete(isWin);
  }, 4100); // slightly longer than the 4s CSS transition
}

el.spinBtn.addEventListener('click', () => {
  el.spinBtn.disabled = true;
  spinWheel(gameState.spinnerWinChance, (isWin) => {
    showSpinnerResult(isWin);
  });
});

function showSpinnerResult(isWin) {
  el.spinBtn.classList.add('hidden');
  el.spinnerContinueBtn.classList.remove('hidden');

  if (isWin) {
    el.spinnerResultText.textContent = '✅ DEFUSED! You win!';
    el.spinnerResultText.className = 'spinner-result win';
  } else {
    el.spinnerResultText.textContent = '💥 BOOM! The bomb relocates...';
    el.spinnerResultText.className = 'spinner-result lose';
  }

  gameState._spinnerResult = isWin;
}

el.spinnerContinueBtn.addEventListener('click', () => {
  el.spinnerModal.classList.add('hidden');
  const tileIndex = gameState._spinnerTileIndex;
  const isWin = gameState._spinnerResult;

  if (isWin) {
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
  // The tile that was just opened becomes permanently safe
  gameState.permanentlySafeTiles[oldTileIndex] = true;
  gameState.revealedTiles[oldTileIndex] = true;

  // Find a new home for the bomb: any uncleared, non-decoy, non-permanently-safe tile
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
    // Fallback: convert a decoy tile into the real bomb if no plain tiles remain
    const decoyFallbacks = gameState.decoyTileIndexes.filter(
      i => !gameState.revealedTiles[i] && !gameState.permanentlySafeTiles[i]
    );
    if (decoyFallbacks.length > 0) {
      const newBombIndex = decoyFallbacks[getRandomInt(0, decoyFallbacks.length - 1)];
      gameState.bombTileIndex = newBombIndex;
      gameState.decoyTileIndexes = gameState.decoyTileIndexes.filter(i => i !== newBombIndex);
    }
  }

  // Update the old tile's visual to show it's now safely cleared
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

  el.finalScoresContainer.innerHTML = '';
  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
  sortedPlayers.forEach(player => {
    const item = document.createElement('div');
    item.className = 'final-score-item';
    item.textContent = `${player.name}: ${player.score} points`;
    el.finalScoresContainer.appendChild(item);
  });

  showScreen('end');
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
   SECTION 22: GAME START / RESTART HANDLERS
   ============================================================ */

el.startGameBtn.addEventListener('click', () => {
  if (!gameState.questionBank) {
    setLoadStatus('❌ Please load a question bank before starting.', true);
    return;
  }

  const count = parseInt(el.playerCountSelect.value, 10);
  for (let i = 0; i < count; i++) {
    const input = document.getElementById(`player-name-${i}`);
    if (!input.value.trim()) {
      // Names are optional — will default to "Player N" — no hard block
    }
  }

  initializeGameState();
  renderTileGrid();
  renderScoreboard();
  updateTurnDisplay();
  setTilesInteractable(true);
  showScreen('game');
});

el.playAgainBtn.addEventListener('click', () => {
  // Same settings, fresh board — re-run initialization with same question bank/config
  initializeGameState();
  renderTileGrid();
  renderScoreboard();
  updateTurnDisplay();
  setTilesInteractable(true);
  showScreen('game');
});

el.newSettingsBtn.addEventListener('click', () => {
  showScreen('setup');
});

/* ============================================================
   SECTION 23: INITIAL PAGE LOAD
   ============================================================ */

renderPlayerNameInputs();