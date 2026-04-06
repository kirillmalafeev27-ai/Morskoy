// Main game state and logic

class Game {
  constructor() {
    this.state = 'menu'; // menu, playing, topic_select, question, direction_select, won, lost
    this.maze = null;
    this.mazeGen = null;
    this.renderer = null;
    this.audio = null;
    this.questionManager = null;

    // Settings
    this.isCreepy = true;
    this.monsterCount = 1;
    this.langLevel = 'A2';
    this.mazeWidth = 25;
    this.mazeHeight = 25;

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
    this.treasures = []; // {x, y, collected}

    // Effects
    this.expandedVisionTurns = 0;
    this.monsterRevealed = false;
    this.revealTurns = 0;
    this.currentTopic = null;
    this.currentQuestion = null;
  }

  init(settings) {
    this.isCreepy = settings.isCreepy;
    this.monsterCount = settings.monsterCount;
    this.langLevel = settings.langLevel;

    // Apply atmosphere
    if (!this.isCreepy) {
      document.body.classList.add('calm-mode');
    } else {
      document.body.classList.remove('calm-mode');
    }

    // Generate maze
    this.mazeGen = new MazeGenerator(this.mazeWidth, this.mazeHeight);
    this.maze = this.mazeGen.generate();

    // Get walkable cells
    const pathCells = this.mazeGen.getPathCells();

    // Place player at start
    this.playerX = 1;
    this.playerY = 1;

    // Place treasures far from player
    this.treasures = [];
    const farCells = pathCells.filter(c =>
      Math.abs(c.x - this.playerX) + Math.abs(c.y - this.playerY) > 10
    );
    const shuffledFar = this._shuffle([...farCells]);
    for (let i = 0; i < this.totalTreasures && i < shuffledFar.length; i++) {
      this.treasures.push({ x: shuffledFar[i].x, y: shuffledFar[i].y, collected: false });
    }

    // Place monsters far from player but not on treasures
    this.monsters.forEach(m => m.stop());
    this.monsters = [];
    const monsterCells = shuffledFar.filter(c =>
      !this.treasures.some(t => t.x === c.x && t.y === c.y)
    );
    for (let i = 0; i < this.monsterCount && i < monsterCells.length; i++) {
      const cell = monsterCells[i + this.totalTreasures]; // offset past treasure cells
      if (!cell) continue;
      const monster = new Monster(cell.x, cell.y, this.mazeGen);
      this.monsters.push(monster);
    }

    // Init renderer
    const canvas = document.getElementById('game-canvas');
    if (this.renderer) this.renderer.dispose();
    this.renderer = new DungeonRenderer(canvas, this.isCreepy);
    this.renderer.buildMaze(this.mazeGen);
    this.renderer.createPlayer(this.playerX, this.playerY);
    // Snap camera to player immediately (no slow lerp on first frame)
    this.renderer.updateCamera(this.playerX, this.playerY, true);

    // Create monster meshes
    this.monsters.forEach((m, i) => {
      this.renderer.createMonster(m.x, m.y, i);
    });

    // Create treasure meshes
    this.treasures.forEach((t, i) => {
      this.renderer.createTreasure(t.x, t.y, i);
    });

    // Init audio
    if (this.audio) this.audio.dispose();
    this.audio = new AudioManager();
    this.audio.init(this.isCreepy);

    // Init questions
    this.questionManager = new QuestionManager(this.langLevel);

    // Reset state
    this.treasuresCollected = 0;
    this.movesLeft = 0;
    this.expandedVisionTurns = 0;
    this.monsterRevealed = false;
    this.revealTurns = 0;
    this.questionsAnswered = 0;
    this.questionsCorrect = 0;
    this.state = 'topic_select';

    // Start monsters
    this.monsters.forEach(m => {
      m.start(() => ({ x: this.playerX, y: this.playerY }));
      m.onMove = () => this._onMonsterMove();
    });

    // Update HUD
    this._updateHUD();

    // Show topic panel
    this._showTopicPanel();

    // Start render loop
    this.renderer.startLoop(() => this._update());
  }

  _update() {
    // Update player mesh position (smooth)
    this.renderer.updatePlayer(this.playerX, this.playerY);
    this.renderer.updateCamera(this.playerX, this.playerY);

    // Update monsters
    this.monsters.forEach((m, i) => {
      const isVisible = this.renderer.isInVisibleRange(this.playerX, this.playerY, m.x, m.y);
      const isRevealed = this.monsterRevealed;
      this.renderer.updateMonster(i, m.x, m.y, isVisible, isRevealed);
    });

    // Update treasures
    this.treasures.forEach((t, i) => {
      const isVisible = this.renderer.isInVisibleRange(this.playerX, this.playerY, t.x, t.y);
      this.renderer.updateTreasure(i, isVisible, t.collected);
    });

    // Update audio proximity
    if (this.monsters.length > 0) {
      const closest = Math.min(...this.monsters.map(m => m.getDistanceToPlayer()));
      // Map distance to proximity: closer = higher value
      const maxHearDistance = 12;
      const proximity = Math.max(0, 1 - closest / maxHearDistance);
      this.audio.updateMonsterProximity(proximity);
    }
  }

  _onMonsterMove() {
    // Check collision with player
    for (const m of this.monsters) {
      if (m.x === this.playerX && m.y === this.playerY) {
        this._gameOver();
        return;
      }
    }
  }

  selectTopic(topicKey) {
    if (this.state !== 'topic_select') return;

    this.currentTopic = topicKey;
    const question = this.questionManager.getQuestion(topicKey);
    if (!question) return;

    this.currentQuestion = question;
    this.state = 'question';
    this._showQuestion(question);
  }

  answerQuestion(selectedIndex) {
    if (this.state !== 'question' || !this.currentQuestion) return;

    this.questionsAnswered++;
    const isCorrect = selectedIndex === this.currentQuestion.options.correctIndex;

    if (isCorrect) {
      this.questionsCorrect++;
      this.audio.playCorrectAnswer();
      this._applyBonus(this.currentQuestion.topicInfo.bonus);
      this._showFeedback(true, this.currentQuestion.options.options[this.currentQuestion.options.correctIndex]);

      // After short delay, go to direction select if bonus gives moves
      setTimeout(() => {
        if (this.movesLeft > 0) {
          this.state = 'direction_select';
          this._showDirectionPanel();
        } else {
          // Bonus was non-movement (vision, reveal, bait)
          this.state = 'topic_select';
          this._showTopicPanel();
        }
      }, 1000);
    } else {
      this.audio.playWrongAnswer();
      this._showFeedback(false, this.currentQuestion.options.options[this.currentQuestion.options.correctIndex]);

      // No move - back to topic select
      setTimeout(() => {
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
    // Place bait 5-8 cells away from player in a random walkable direction
    const pathCells = this.mazeGen.getPathCells();
    const candidates = pathCells.filter(c => {
      const dist = Math.abs(c.x - this.playerX) + Math.abs(c.y - this.playerY);
      return dist >= 5 && dist <= 10;
    });

    if (candidates.length > 0) {
      const bait = candidates[Math.floor(Math.random() * candidates.length)];
      this.renderer.placeBait(bait.x, bait.y);
      this.monsters.forEach(m => m.setBait(bait.x, bait.y));

      // Remove bait visual after some time
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

    // Check bounds and walls
    if (newX < 0 || newX >= this.mazeGen.width || newY < 0 || newY >= this.mazeGen.height) return;
    if (this.mazeGen.grid[newY][newX] === 0) return;

    this.playerX = newX;
    this.playerY = newY;
    this.movesLeft--;

    this.audio.playStep();

    // Check treasure pickup
    this._checkTreasures();

    // Check monster collision
    for (const m of this.monsters) {
      if (m.x === this.playerX && m.y === this.playerY) {
        this._gameOver();
        return;
      }
    }

    // Check win
    if (this.treasuresCollected >= this.totalTreasures) {
      this._win();
      return;
    }

    // Decrement effect turns
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
      if (this.expandedVisionTurns <= 0) {
        this.renderer.resetVisibleRadius();
      }
    }

    if (this.revealTurns > 0) {
      this.revealTurns--;
      if (this.revealTurns <= 0) {
        this.monsterRevealed = false;
      }
    }

    this._updateStatusEffects();
  }

  _gameOver() {
    this.state = 'lost';
    this.monsters.forEach(m => m.stop());
    this.renderer.stopLoop();
    this.audio.playMonsterCatch();

    setTimeout(() => {
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('lose-screen').classList.add('active');
      document.getElementById('lose-stats').textContent =
        `Вопросов: ${this.questionsAnswered} | Правильных: ${this.questionsCorrect} | Сокровищ: ${this.treasuresCollected}/${this.totalTreasures}`;
    }, 1000);
  }

  _win() {
    this.state = 'won';
    this.monsters.forEach(m => m.stop());
    this.renderer.stopLoop();
    this.audio.playTreasureCollect();

    setTimeout(() => {
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('win-screen').classList.add('active');
      document.getElementById('win-stats').textContent =
        `Вопросов: ${this.questionsAnswered} | Правильных: ${this.questionsCorrect}`;
    }, 500);
  }

  // === UI Methods ===

  _showTopicPanel() {
    document.getElementById('topic-panel').classList.remove('hidden');
    document.getElementById('question-panel').classList.add('hidden');
    document.getElementById('direction-panel').classList.add('hidden');
  }

  _showQuestion(question) {
    document.getElementById('topic-panel').classList.add('hidden');
    document.getElementById('direction-panel').classList.add('hidden');

    const panel = document.getElementById('question-panel');
    panel.classList.remove('hidden');

    document.getElementById('question-topic-label').textContent =
      `${question.topicInfo.name} (${question.level})`;
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
        // Disable all buttons
        optionsDiv.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        // Highlight correct/wrong
        btn.classList.add(i === correctIndex ? 'correct' : 'wrong');
        if (i !== correctIndex) {
          optionsDiv.children[correctIndex].classList.add('correct');
        }
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
      const bonusLabel = TOPICS[this.currentTopic].bonusLabel;
      feedback.textContent = `Richtig! Бонус: ${bonusLabel}`;
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
  }

  _updateDirectionButtons() {
    const dirs = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };

    document.querySelectorAll('.dir-btn').forEach(btn => {
      const dir = dirs[btn.dataset.dir];
      const nx = this.playerX + dir.x;
      const ny = this.playerY + dir.y;
      const canMove = nx >= 0 && nx < this.mazeGen.width &&
                      ny >= 0 && ny < this.mazeGen.height &&
                      this.mazeGen.grid[ny][nx] === 1;
      btn.disabled = !canMove;
    });

    // Update move count display
    const panel = document.getElementById('direction-panel');
    panel.querySelector('.direction-prompt').textContent =
      `Выберите направление (ходов: ${this.movesLeft}):`;
  }

  _updateHUD() {
    document.getElementById('treasure-count').textContent = this.treasuresCollected;
  }

  _updateStatusEffects() {
    const container = document.getElementById('status-effects');
    container.innerHTML = '';

    if (this.expandedVisionTurns > 0) {
      const badge = document.createElement('div');
      badge.className = 'status-badge';
      badge.textContent = `👁 Зрение +${this.expandedVisionTurns}`;
      container.appendChild(badge);
    }

    if (this.revealTurns > 0) {
      const badge = document.createElement('div');
      badge.className = 'status-badge';
      badge.textContent = `📍 Монстр виден ${this.revealTurns}`;
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
