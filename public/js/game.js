// Main game state and logic
// Slot-based topic system with Claude API question generation

// Level progression config
const LEVEL_CONFIG = [
  { level: 1, mazeW: 19, mazeH: 19, monsters: 1, monsterSpeed: 4500, treasures: 3 },
  { level: 2, mazeW: 21, mazeH: 21, monsters: 1, monsterSpeed: 4000, treasures: 3 },
  { level: 3, mazeW: 23, mazeH: 23, monsters: 2, monsterSpeed: 3800, treasures: 3 },
  { level: 4, mazeW: 25, mazeH: 25, monsters: 2, monsterSpeed: 3400, treasures: 3 },
  { level: 5, mazeW: 27, mazeH: 27, monsters: 2, monsterSpeed: 3000, treasures: 3 },
  { level: 6, mazeW: 27, mazeH: 27, monsters: 3, monsterSpeed: 2800, treasures: 3 },
  { level: 7, mazeW: 29, mazeH: 29, monsters: 3, monsterSpeed: 2500, treasures: 3 },
  { level: 8, mazeW: 31, mazeH: 31, monsters: 3, monsterSpeed: 2200, treasures: 3 },
];

// Leaderboard (localStorage)
class Leaderboard {
  constructor() { this.key = 'morskoy_leaderboard'; }

  getScores() {
    try { return JSON.parse(localStorage.getItem(this.key)) || []; }
    catch { return []; }
  }

  addScore(entry) {
    const scores = this.getScores();
    scores.push(entry);
    scores.sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.treasures !== a.treasures) return b.treasures - a.treasures;
      return b.accuracy - a.accuracy;
    });
    localStorage.setItem(this.key, JSON.stringify(scores.slice(0, 20)));
  }

  render() {
    const scores = this.getScores();
    const tbody = document.getElementById('leaderboard-body');
    const emptyMsg = document.getElementById('leaderboard-empty');
    tbody.innerHTML = '';

    if (scores.length === 0) { emptyMsg.classList.remove('hidden'); return; }
    emptyMsg.classList.add('hidden');

    scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (i < 3) tr.className = `rank-${i + 1}`;
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${this._escapeHtml(s.name)}</td>
        <td>${s.level}</td>
        <td>${s.treasures}</td>
        <td>${s.accuracy}%</td>
      `;
      tbody.appendChild(tr);
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

class Game {
  constructor() {
    this.state = 'menu';
    this.maze = null;
    this.mazeGen = null;
    this.renderer = null;
    this.audio = null;
    this.questionManager = null;
    this.leaderboard = new Leaderboard();

    // Settings
    this.isCreepy = true;
    this.monsterCountSetting = 1;
    this.langLevel = 'A2';
    this.playerName = '';
    this.lexicalTopic = null;
    this.slotConfigs = []; // { slotDef, grammarTopic }

    // Level
    this.currentLevel = 1;

    // Player
    this.playerX = 1;
    this.playerY = 1;
    this.treasuresCollected = 0;
    this.totalTreasures = 3;
    this.movesLeft = 0;
    this.questionsAnswered = 0;
    this.questionsCorrect = 0;

    // Monsters
    this.monsters = [];

    // Treasures
    this.treasures = [];

    // Effects
    this.expandedVisionTurns = 0;
    this.monsterRevealed = false;
    this.revealTurns = 0;
    this.currentSlotId = null;
    this.currentQuestion = null;

    // Touch/swipe
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.swipeThreshold = 30;

    this._initTouchControls();
  }

  _initTouchControls() {
    const canvas = document.getElementById('game-canvas');

    canvas.addEventListener('touchstart', (e) => {
      if (this.state !== 'direction_select') return;
      e.preventDefault();
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (this.state !== 'direction_select') return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;

      if (Math.abs(dx) < this.swipeThreshold && Math.abs(dy) < this.swipeThreshold) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.movePlayer(dx > 0 ? 'right' : 'left');
      } else {
        this.movePlayer(dy > 0 ? 'down' : 'up');
      }
    }, { passive: false });
  }

  async init(settings) {
    this.isCreepy = settings.isCreepy;
    this.monsterCountSetting = settings.monsterCount;
    this.langLevel = settings.langLevel;
    this.playerName = settings.playerName || 'Unknown';
    this.currentLevel = settings.level || 1;
    this.lexicalTopic = settings.lexicalTopic || null;
    this.slotConfigs = settings.slotConfigs || [];

    if (!this.isCreepy) {
      document.body.classList.add('calm-mode');
    } else {
      document.body.classList.remove('calm-mode');
    }

    // Get level config
    const lvlCfg = this._getLevelConfig(this.currentLevel);

    // Generate maze
    this.mazeGen = new MazeGenerator(lvlCfg.mazeW, lvlCfg.mazeH);
    this.maze = this.mazeGen.generate();

    const pathCells = this.mazeGen.getPathCells();

    // Place player
    this.playerX = 1;
    this.playerY = 1;

    // Place treasures
    this.treasures = [];
    this.totalTreasures = lvlCfg.treasures;
    const farCells = pathCells.filter(c =>
      Math.abs(c.x - this.playerX) + Math.abs(c.y - this.playerY) > 8
    );
    const shuffledFar = this._shuffle([...farCells]);
    for (let i = 0; i < this.totalTreasures && i < shuffledFar.length; i++) {
      this.treasures.push({ x: shuffledFar[i].x, y: shuffledFar[i].y, collected: false });
    }

    // Monster count
    const monsterCount = Math.max(lvlCfg.monsters, this.monsterCountSetting);

    // Place monsters
    this.monsters.forEach(m => m.stop());
    this.monsters = [];
    const monsterCells = shuffledFar.filter(c =>
      !this.treasures.some(t => t.x === c.x && t.y === c.y)
    );
    for (let i = 0; i < monsterCount && i + this.totalTreasures < monsterCells.length; i++) {
      const cell = monsterCells[i + this.totalTreasures];
      if (!cell) continue;
      const monster = new Monster(cell.x, cell.y, this.mazeGen);
      monster.moveInterval = lvlCfg.monsterSpeed;
      this.monsters.push(monster);
    }

    // Init renderer
    const canvas = document.getElementById('game-canvas');
    if (this.renderer) this.renderer.dispose();
    this.renderer = new DungeonRenderer(canvas, this.isCreepy);

    const buildScene = () => {
      if (this.state !== 'loading') return; // prevent double call
      this.renderer.buildMaze(this.mazeGen);
      this.renderer.createPlayer(this.playerX, this.playerY);
      this.renderer.updateCamera(this.playerX, this.playerY, true);
      this.monsters.forEach((m, i) => this.renderer.createMonster(m.x, m.y, i));
      this.treasures.forEach((t, i) => this.renderer.createTreasure(t.x, t.y, i));
      this.state = 'waiting_questions'; // mark scene built, prevent re-entry
      this._finishInit();
    };

    this.renderer.loadModels(() => buildScene());
    setTimeout(() => { if (this.state === 'loading') buildScene(); }, 3000);

    // Init audio
    if (this.audio) this.audio.dispose();
    this.audio = new AudioManager();
    this.audio.init(this.isCreepy);

    // Init question manager with configured slots
    if (!this.questionManager) {
      this.questionManager = new QuestionManager(this.langLevel);
    }
    this.questionManager.setLevel(this.langLevel);
    this.questionManager.setLexicalTopic(this.lexicalTopic);
    this.questionManager.configureSlots(this.slotConfigs);

    // Reset state
    this.treasuresCollected = 0;
    this.movesLeft = 0;
    this.expandedVisionTurns = 0;
    this.monsterRevealed = false;
    this.revealTurns = 0;
    this.questionsAnswered = 0;
    this.questionsCorrect = 0;
    this.state = 'loading';

    // Shuffle existing cache (so restarts don't repeat same order) and pre-fetch
    this.questionManager.shuffleAllCaches();
    this._prefetchPromise = this.questionManager.prefetchAll().catch(e => console.warn('Prefetch failed:', e));
  }

  async _finishInit() {
    if (this.state !== 'waiting_questions') return;

    // Wait for questions to load before starting the game
    if (this._prefetchPromise) {
      await this._prefetchPromise;
      this._prefetchPromise = null;
    }

    this.state = 'topic_select';

    this.monsters.forEach(m => {
      m.start(() => ({ x: this.playerX, y: this.playerY }));
      m.onMove = () => this._onMonsterMove();
    });

    this._updateHUD();
    this._showTopicPanel();
    this.renderer.startLoop(() => this._update());
  }

  _getLevelConfig(level) {
    if (level <= LEVEL_CONFIG.length) return LEVEL_CONFIG[level - 1];
    const last = LEVEL_CONFIG[LEVEL_CONFIG.length - 1];
    const extra = level - LEVEL_CONFIG.length;
    return {
      level,
      mazeW: Math.min(last.mazeW + extra * 2, 41),
      mazeH: Math.min(last.mazeH + extra * 2, 41),
      monsters: Math.min(last.monsters + Math.floor(extra / 2), 5),
      monsterSpeed: Math.max(last.monsterSpeed - extra * 200, 1200),
      treasures: 3,
    };
  }

  _update() {
    this.renderer.updatePlayer(this.playerX, this.playerY);
    this.renderer.updateCamera(this.playerX, this.playerY);

    this.monsters.forEach((m, i) => {
      const isVisible = this.renderer.isInVisibleRange(this.playerX, this.playerY, m.x, m.y);
      this.renderer.updateMonster(i, m.x, m.y, isVisible, this.monsterRevealed);
    });

    this.treasures.forEach((t, i) => {
      const isVisible = this.renderer.isInVisibleRange(this.playerX, this.playerY, t.x, t.y);
      this.renderer.updateTreasure(i, isVisible, t.collected);
    });

    if (this.monsters.length > 0 && this.audio) {
      const closest = Math.min(...this.monsters.map(m => m.getDistanceToPlayer()));
      const proximity = Math.max(0, 1 - closest / 12);
      this.audio.updateMonsterProximity(proximity);
    }
  }

  _onMonsterMove() {
    for (const m of this.monsters) {
      if (m.x === this.playerX && m.y === this.playerY) {
        this._gameOver(m);
        return;
      }
    }
  }

  async selectTopic(slotId) {
    if (this.state !== 'topic_select') return;

    this.currentSlotId = slotId;
    this.state = 'question';

    // Show loading briefly if no cached questions
    const question = await this.questionManager.getQuestion(slotId);
    if (!question) {
      this.state = 'topic_select';
      return;
    }

    this.currentQuestion = question;
    this._showQuestion(question);
  }

  answerQuestion(selectedIndex) {
    if (this.state !== 'question' || !this.currentQuestion) return;

    this.questionsAnswered++;
    const isCorrect = selectedIndex === this.currentQuestion.options.correctIndex;

    if (isCorrect) {
      this.questionsCorrect++;
      this.audio.playCorrectAnswer();
      this._applyBonus(this.currentQuestion.slotDef.bonus);
      this._showFeedback(true, this.currentQuestion.options.options[this.currentQuestion.options.correctIndex]);
      // Immediately fetch a replacement question for this slot
      this.questionManager.onCorrectAnswer(this.currentSlotId);

      setTimeout(() => {
        if (this.state === 'lost' || this.state === 'won') return;
        if (this.movesLeft > 0) {
          this.state = 'direction_select';
          this._showDirectionPanel();
        } else {
          this.state = 'topic_select';
          this._showTopicPanel();
        }
      }, 1000);
    } else {
      this.audio.playWrongAnswer();
      this._showFeedback(false, this.currentQuestion.options.options[this.currentQuestion.options.correctIndex]);

      setTimeout(() => {
        if (this.state === 'lost' || this.state === 'won') return;
        this.state = 'topic_select';
        this._showTopicPanel();
      }, 1500);
    }
  }

  _applyBonus(bonusType) {
    switch (bonusType) {
      case 'move1':
        this.movesLeft = 1;
        break;
      case 'move2':
        this.movesLeft = 2;
        break;
      case 'vision':
        this.expandedVisionTurns = 3;
        this.renderer.setVisibleRadius(5);
        this._updateStatusEffects();
        break;
      case 'bait':
        this._placeBait();
        break;
      case 'reveal':
        this.monsterRevealed = true;
        this.revealTurns = 3;
        this._updateStatusEffects();
        break;
    }
  }

  _placeBait() {
    const pathCells = this.mazeGen.getPathCells();
    const candidates = pathCells.filter(c => {
      const dist = Math.abs(c.x - this.playerX) + Math.abs(c.y - this.playerY);
      return dist >= 5 && dist <= 10;
    });

    if (candidates.length > 0) {
      const bait = candidates[Math.floor(Math.random() * candidates.length)];
      this.renderer.placeBait(bait.x, bait.y);
      this.monsters.forEach(m => m.setBait(bait.x, bait.y));
      setTimeout(() => this.renderer.removeBait(), 20000);
    }
  }

  movePlayer(direction) {
    if (this.state !== 'direction_select' || this.movesLeft <= 0) return;

    const dirs = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const dir = dirs[direction];
    if (!dir) return;

    const newX = this.playerX + dir.x;
    const newY = this.playerY + dir.y;

    if (newX < 0 || newX >= this.mazeGen.width || newY < 0 || newY >= this.mazeGen.height) return;
    if (this.mazeGen.grid[newY][newX] === 0) return;

    this.playerX = newX;
    this.playerY = newY;
    this.movesLeft--;

    this.audio.playStep();
    this._checkTreasures();

    for (const m of this.monsters) {
      if (m.x === this.playerX && m.y === this.playerY) {
        this._gameOver(m);
        return;
      }
    }

    if (this.treasuresCollected >= this.totalTreasures) {
      this._win();
      return;
    }

    this._tickEffects();

    if (this.movesLeft > 0) {
      this._updateDirectionButtons();
    } else {
      this.state = 'topic_select';
      this._showTopicPanel();
    }

    this._updateHUD();
  }

  _checkTreasures() {
    for (const t of this.treasures) {
      if (!t.collected && t.x === this.playerX && t.y === this.playerY) {
        t.collected = true;
        this.treasuresCollected++;
        this.audio.playTreasureCollect();
        this._updateHUD();
      }
    }
  }

  _tickEffects() {
    if (this.expandedVisionTurns > 0) {
      this.expandedVisionTurns--;
      if (this.expandedVisionTurns <= 0) this.renderer.resetVisibleRadius();
    }
    if (this.revealTurns > 0) {
      this.revealTurns--;
      if (this.revealTurns <= 0) this.monsterRevealed = false;
    }
    this._updateStatusEffects();
  }

  _gameOver(killerMonster) {
    if (this.state === 'lost') return;
    this.state = 'lost';
    this.monsters.forEach(m => m.stop());
    this.audio.playMonsterCatch();

    const accuracy = this.questionsAnswered > 0
      ? Math.round((this.questionsCorrect / this.questionsAnswered) * 100) : 0;
    this.leaderboard.addScore({
      name: this.playerName, level: this.currentLevel,
      treasures: this.treasuresCollected, accuracy,
      date: new Date().toISOString().split('T')[0],
    });

    const mx = killerMonster ? killerMonster.x : this.playerX;
    const my = killerMonster ? killerMonster.y : this.playerY;

    this.renderer.playDeathAnimation(mx, my, () => {
      this.renderer.stopLoop();
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('lose-screen').classList.add('active');
      document.getElementById('lose-stats').textContent =
        `Уровень: ${this.currentLevel} | Вопросов: ${this.questionsAnswered} | Правильных: ${this.questionsCorrect} | Сокровищ: ${this.treasuresCollected}/${this.totalTreasures}`;
    });
  }

  _win() {
    this.state = 'won';
    this.monsters.forEach(m => m.stop());
    this.renderer.stopLoop();
    this.audio.playTreasureCollect();

    const accuracy = this.questionsAnswered > 0
      ? Math.round((this.questionsCorrect / this.questionsAnswered) * 100) : 0;
    this.leaderboard.addScore({
      name: this.playerName, level: this.currentLevel,
      treasures: this.treasuresCollected, accuracy,
      date: new Date().toISOString().split('T')[0],
    });

    setTimeout(() => {
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('win-screen').classList.add('active');
      document.getElementById('win-stats').textContent =
        `Уровень ${this.currentLevel} пройден! | Точность: ${accuracy}%`;
    }, 500);
  }

  nextLevel() {
    this.currentLevel++;
    document.getElementById('win-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    this.init({
      isCreepy: this.isCreepy,
      monsterCount: this.monsterCountSetting,
      langLevel: this.langLevel,
      playerName: this.playerName,
      level: this.currentLevel,
      lexicalTopic: this.lexicalTopic,
      slotConfigs: this.slotConfigs,
    });
  }

  restart() { this.currentLevel = 1; }

  // === UI Methods ===

  _showTopicPanel() {
    document.getElementById('topic-panel').classList.remove('hidden');
    document.getElementById('question-panel').classList.add('hidden');
    document.getElementById('direction-panel').classList.add('hidden');

    // Build topic buttons from configured slots
    const container = document.getElementById('topic-buttons');
    container.innerHTML = '';

    this.slotConfigs.forEach((cfg, i) => {
      const btn = document.createElement('button');
      btn.className = 'topic-btn';
      btn.dataset.slot = cfg.slotDef.id;

      const name = cfg.slotDef.isWortstellung
        ? `Wortstellung + ${cfg.grammarTopic}`
        : cfg.grammarTopic;

      btn.innerHTML = `
        <span class="topic-name">${name}</span>
        <span class="topic-bonus">${cfg.slotDef.bonusLabel}</span>
      `;

      btn.addEventListener('click', () => this.selectTopic(cfg.slotDef.id));
      container.appendChild(btn);
    });
  }

  _showQuestion(question) {
    document.getElementById('topic-panel').classList.add('hidden');
    document.getElementById('direction-panel').classList.add('hidden');

    const panel = document.getElementById('question-panel');
    panel.classList.remove('hidden');

    const topicLabel = question.slotDef.isWortstellung
      ? `Wortstellung + ${question.grammarTopic}`
      : question.grammarTopic;
    document.getElementById('question-topic-label').textContent =
      `${topicLabel} (${question.level})`;
    document.getElementById('question-text').innerHTML =
      `${question.text}<br><strong>${question.display}</strong>`;

    const optionsDiv = document.getElementById('question-options');
    optionsDiv.innerHTML = '';

    const { options, correctIndex } = question.options;
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        optionsDiv.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        btn.classList.add(i === correctIndex ? 'correct' : 'wrong');
        if (i !== correctIndex) optionsDiv.children[correctIndex].classList.add('correct');
        this.answerQuestion(i);
      });
      optionsDiv.appendChild(btn);
    });

    document.getElementById('question-feedback').classList.add('hidden');
  }

  _showFeedback(isCorrect, correctAnswer) {
    const feedback = document.getElementById('question-feedback');
    feedback.classList.remove('hidden', 'correct', 'wrong');
    feedback.classList.add(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      const slot = this.slotConfigs.find(s => s.slotDef.id === this.currentSlotId);
      feedback.textContent = `Richtig! Бонус: ${slot ? slot.slotDef.bonusLabel : ''}`;
    } else {
      feedback.textContent = `Falsch. Правильный ответ: ${correctAnswer}`;
    }
  }

  _showDirectionPanel() {
    document.getElementById('topic-panel').classList.add('hidden');
    document.getElementById('question-panel').classList.add('hidden');

    const panel = document.getElementById('direction-panel');
    panel.classList.remove('hidden');
    panel.querySelector('.direction-prompt').textContent =
      `Выберите направление (ходов: ${this.movesLeft}):`;

    this._updateDirectionButtons();

    if ('ontouchstart' in window) {
      const hint = document.getElementById('swipe-hint');
      hint.textContent = 'Свайпните по экрану для движения';
      hint.classList.add('show');
      setTimeout(() => hint.classList.remove('show'), 2000);
    }
  }

  _updateDirectionButtons() {
    const dirs = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
      left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
    };

    document.querySelectorAll('.dir-btn').forEach(btn => {
      const dir = dirs[btn.dataset.dir];
      const nx = this.playerX + dir.x;
      const ny = this.playerY + dir.y;
      btn.disabled = !(nx >= 0 && nx < this.mazeGen.width &&
                       ny >= 0 && ny < this.mazeGen.height &&
                       this.mazeGen.grid[ny][nx] === 1);
    });

    document.querySelector('#direction-panel .direction-prompt').textContent =
      `Выберите направление (ходов: ${this.movesLeft}):`;
  }

  _updateHUD() {
    document.getElementById('treasure-count').textContent = this.treasuresCollected;
    document.getElementById('level-num').textContent = this.currentLevel;
  }

  _updateStatusEffects() {
    const container = document.getElementById('status-effects');
    container.innerHTML = '';
    if (this.expandedVisionTurns > 0) {
      const badge = document.createElement('div');
      badge.className = 'status-badge';
      badge.textContent = `Зрение +${this.expandedVisionTurns}`;
      container.appendChild(badge);
    }
    if (this.revealTurns > 0) {
      const badge = document.createElement('div');
      badge.className = 'status-badge';
      badge.textContent = `Монстр виден ${this.revealTurns}`;
      container.appendChild(badge);
    }
  }

  destroy() {
    this.monsters.forEach(m => m.stop());
    if (this.renderer) this.renderer.dispose();
    if (this.audio) this.audio.dispose();
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
