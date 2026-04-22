// Main game state and logic
// Slot-based topic system with shared chase/PVP support

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

class Leaderboard {
  constructor() {
    this.key = 'morskoy_leaderboard';
  }

  getScores() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || [];
    } catch {
      return [];
    }
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

    if (scores.length === 0) {
      emptyMsg.classList.remove('hidden');
      return;
    }

    emptyMsg.classList.add('hidden');
    scores.forEach((score, index) => {
      const tr = document.createElement('tr');
      if (index < 3) tr.className = `rank-${index + 1}`;
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${this._escapeHtml(score.name)}</td>
        <td>${score.level}</td>
        <td>${score.treasures}</td>
        <td>${score.accuracy}%</td>
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

    this.isCreepy = true;
    this.monsterCountSetting = 1;
    this.difficulty = 'medium';
    this.langLevel = 'A2';
    this.playerName = '';
    this.lexicalTopic = null;
    this.slotConfigs = [];
    this.gameMode = 'classic';
    this.matchType = 'solo';
    this.isPvp = false;
    this.pvpClient = null;
    this.pvpRole = 'runner';
    this.remoteRole = null;
    this.remotePlayer = null;
    this._pvpSession = null;
    this._pvpEndHandled = false;
    this._mapRevealApplied = false;
    this._trailVisible = false;
    this._lastTrapSignature = '';
    this._lastTrailSignature = '';
    this._lastHuntZoneSignature = '';

    this.currentLevel = 1;
    this.playerX = 1;
    this.playerY = 1;
    this.treasuresCollected = 0;
    this.totalTreasures = 3;
    this.movesLeft = 0;
    this.specialMove = null;
    this.questionsAnswered = 0;
    this.questionsCorrect = 0;
    this.chaseProgress = 0;
    this.chaseTarget = 8;

    this.monsters = [];
    this.treasures = [];
    this.traps = [];
    this.runnerTrail = [];

    this.camouflageTurns = 0;
    this.camouflageCooldownUntil = 0;
    this.monsterRevealed = false;
    this.revealTurns = 0;
    this.huntMapUntil = 0;
    this.huntZone = null;
    this.trailRevealUntil = 0;
    this.localStunTurns = 0;

    this.currentSlotId = null;
    this.currentQuestion = null;
    this._topicPanelTimer = null;

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
    this.difficulty = settings.difficulty || 'medium';
    this.langLevel = settings.langLevel;
    this.playerName = settings.playerName || 'Unknown';
    this.currentLevel = settings.level || 1;
    this.lexicalTopic = settings.lexicalTopic || null;
    this.slotConfigs = settings.slotConfigs || [];
    this.gameMode = settings.gameMode || 'classic';
    this.matchType = settings.matchType || 'solo';
    this.isPvp = this.matchType === 'pvp' && Boolean(settings.pvp);
    this.pvpClient = settings.pvp?.client || null;
    this.pvpRole = settings.pvp?.role || 'runner';
    this.remoteRole = this.isPvp ? (this.pvpRole === 'runner' ? 'hunter' : 'runner') : null;
    this.remotePlayer = null;
    this._pvpSession = settings.pvp?.session || null;
    this._pvpEndHandled = false;
    this._mapRevealApplied = false;
    this._trailVisible = false;
    this._lastTrapSignature = '';
    this._lastTrailSignature = '';
    this._lastHuntZoneSignature = '';

    document.body.classList.toggle('calm-mode', !this.isCreepy);

    const levelCfg = this._getLevelConfig(this.currentLevel);
    const pvpGame = settings.pvp?.gameState || this._pvpSession?.game || null;

    if (this.isPvp && pvpGame?.maze) {
      this.mazeGen = new MazeGenerator(pvpGame.maze.width, pvpGame.maze.height);
      this.mazeGen.grid = pvpGame.maze.grid.map(row => [...row]);
      this.maze = this.mazeGen.grid;
      this.playerX = pvpGame.players[this.pvpRole].x;
      this.playerY = pvpGame.players[this.pvpRole].y;
      this.remotePlayer = {
        x: pvpGame.players[this.remoteRole].x,
        y: pvpGame.players[this.remoteRole].y,
      };
    } else {
      this.mazeGen = new MazeGenerator(levelCfg.mazeW, levelCfg.mazeH);
      this.maze = this.mazeGen.generate();
      this.playerX = 1;
      this.playerY = 1;
    }

    const isChase = this.gameMode === 'chase';
    const pathCells = this.mazeGen.getPathCells();
    const farCells = pathCells.filter(c => Math.abs(c.x - this.playerX) + Math.abs(c.y - this.playerY) > 8);
    const shuffledFar = this._shuffle([...farCells]);

    this.treasures = [];
    this.totalTreasures = isChase ? 0 : levelCfg.treasures;
    if (!isChase && !this.isPvp) {
      for (let i = 0; i < this.totalTreasures && i < shuffledFar.length; i++) {
        this.treasures.push({ x: shuffledFar[i].x, y: shuffledFar[i].y, collected: false });
      }
    }

    this.monsters.forEach(monster => monster.stop());
    this.monsters = [];
    if (isChase && !this.isPvp) {
      const cornerCell = this._findNearestPathCell(this.mazeGen.width - 2, this.mazeGen.height - 2);
      if (cornerCell) {
        const monster = new Monster(cornerCell.x, cornerCell.y, this.mazeGen);
        monster.moveInterval = this._getMonsterInterval();
        this.monsters.push(monster);
      }
    } else if (!this.isPvp) {
      const monsterCount = Math.max(levelCfg.monsters, this.monsterCountSetting);
      const monsterCells = shuffledFar.filter(cell =>
        !this.treasures.some(treasure => treasure.x === cell.x && treasure.y === cell.y)
      );
      for (let i = 0; i < monsterCount && i + this.totalTreasures < monsterCells.length; i++) {
        const cell = monsterCells[i + this.totalTreasures];
        if (!cell) continue;
        const monster = new Monster(cell.x, cell.y, this.mazeGen);
        monster.moveInterval = this._getMonsterInterval();
        this.monsters.push(monster);
      }
    }

    this.treasuresCollected = 0;
    this.movesLeft = 0;
    this.specialMove = null;
    this.questionsAnswered = 0;
    this.questionsCorrect = 0;
    this.chaseProgress = 0;
    this.camouflageTurns = 0;
    this.camouflageCooldownUntil = 0;
    this.monsterRevealed = false;
    this.revealTurns = 0;
    this.traps = [];
    this.runnerTrail = [];
    this.huntMapUntil = 0;
    this.huntZone = null;
    this.trailRevealUntil = 0;
    this.localStunTurns = 0;
    this.currentSlotId = null;
    this.currentQuestion = null;
    this.state = 'loading';

    if (this.renderer) this.renderer.dispose();
    this.renderer = new DungeonRenderer(document.getElementById('game-canvas'), this.isCreepy);

    if (this.audio) this.audio.dispose();
    this.audio = new AudioManager();
    this.audio.init(this.isCreepy);

    if (!this.questionManager) {
      this.questionManager = new QuestionManager(this.langLevel);
    }
    this.questionManager.setLevel(this.langLevel);
    this.questionManager.setLexicalTopic(this.lexicalTopic);
    this.questionManager.configureSlots(this.slotConfigs);
    this.questionManager.shuffleAllPools();
    this._prefetchPromise = this.questionManager.prefetchAll().catch(err => console.warn('Prefetch failed:', err));

    this._syncModeUI();

    const buildScene = () => {
      if (this.state !== 'loading') return;
      this.renderer.buildMaze(this.mazeGen);
      this.renderer.createPlayer(this.playerX, this.playerY);
      this.renderer.updateCamera(this.playerX, this.playerY, true);

      if (this.isPvp) {
        if (this.remoteRole === 'hunter' && this.remotePlayer) {
          this.renderer.createMonster(this.remotePlayer.x, this.remotePlayer.y, 0);
        }
        if (this.remoteRole === 'runner' && this.remotePlayer) {
          this.renderer.createRemoteRunner(this.remotePlayer.x, this.remotePlayer.y);
        }
      } else {
        this.monsters.forEach((monster, index) => this.renderer.createMonster(monster.x, monster.y, index));
      }

      this.treasures.forEach((treasure, index) => this.renderer.createTreasure(treasure.x, treasure.y, index));
      this.state = 'waiting_questions';
      this._finishInit();
    };

    this.renderer.loadModels(() => buildScene());
    setTimeout(() => {
      if (this.state === 'loading') buildScene();
    }, 3000);

    if (this.isPvp && this._pvpSession) {
      this.syncPvpSession(this._pvpSession);
    }
  }

  _getMonsterInterval() {
    const difficultyIntervals = { easy: 10000, medium: 8000, hard: 6000 };
    return difficultyIntervals[this.difficulty] ?? difficultyIntervals.medium;
  }

  async _finishInit() {
    if (this.state !== 'waiting_questions') return;

    if (this._prefetchPromise) {
      await this._prefetchPromise;
      this._prefetchPromise = null;
    }

    if (!this.isPvp) {
      this.monsters.forEach(monster => {
        monster.start(() => ({ x: this.playerX, y: this.playerY }));
        monster.onMove = () => this._onMonsterMove();
      });
    }

    this._updateHUD();
    this._updateStatusEffects();
    this._syncPvpVisuals(true);

    this.state = this._canMoveNow() ? 'direction_select' : 'topic_select';
    if (this.state === 'direction_select') {
      this._showDirectionPanel();
    } else {
      this._showTopicPanel();
    }

    this.renderer.startLoop(() => this._update());
  }

  _findNearestPathCell(targetX, targetY) {
    const w = this.mazeGen.width;
    const h = this.mazeGen.height;
    const maxR = Math.max(w, h);

    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = targetX + dx;
          const y = targetY + dy;
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          if (this.mazeGen.grid[y][x] === 1) return { x, y };
        }
      }
    }

    return null;
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

  _getLocalPvpActor() {
    return this._pvpSession?.game?.players?.[this.pvpRole] || null;
  }

  _canMoveNow() {
    if (this.isPvp) {
      const actor = this._getLocalPvpActor();
      return Boolean(actor && (actor.specialMove || actor.movesLeft > 0));
    }
    return Boolean(this.specialMove || this.movesLeft > 0);
  }

  _update() {
    this.renderer.updatePlayer(this.playerX, this.playerY);
    this.renderer.updateCamera(this.playerX, this.playerY);

    if (this.isPvp) {
      this._syncPvpVisuals();
      const other = this.remotePlayer;
      if (other && this.audio) {
        const dx = other.x - this.playerX;
        const dy = other.y - this.playerY;
        const distance = Math.abs(dx) + Math.abs(dy);
        const proximity = Math.max(0, 1 - distance / 12);
        this.audio.updateMonsterProximity(proximity);
      }
      return;
    }

    this.monsters.forEach((monster, index) => {
      const isVisible = this.renderer.isInVisibleRange(this.playerX, this.playerY, monster.x, monster.y);
      this.renderer.updateMonster(index, monster.x, monster.y, isVisible, this.monsterRevealed);
    });

    this.treasures.forEach((treasure, index) => {
      const isVisible = this.renderer.isInVisibleRange(this.playerX, this.playerY, treasure.x, treasure.y);
      this.renderer.updateTreasure(index, isVisible, treasure.collected);
    });

    if (this.monsters.length > 0 && this.audio) {
      const closest = Math.min(...this.monsters.map(monster => monster.getDistanceToPlayer()));
      const proximity = Math.max(0, 1 - closest / 12);
      this.audio.updateMonsterProximity(proximity);
    }
  }

  _syncPvpVisuals(force = false) {
    if (!this.isPvp || !this.renderer) return;

    const now = Date.now();
    const mapRevealActive = this.pvpRole === 'hunter' && now < this.huntMapUntil;
    const huntZoneSignature = JSON.stringify(this.huntZone || null);
    if (force || mapRevealActive !== this._mapRevealApplied || huntZoneSignature !== this._lastHuntZoneSignature) {
      if (mapRevealActive) {
        this.renderer.setVisibleRadius(99);
        this.renderer.showHuntZone(this.huntZone);
      } else {
        this.renderer.resetVisibleRadius();
        this.renderer.clearHuntZone();
      }
      this._mapRevealApplied = mapRevealActive;
      this._lastHuntZoneSignature = huntZoneSignature;
    }

    const trailVisible = this.pvpRole === 'hunter' && now < this.trailRevealUntil;
    const trapSignature = JSON.stringify(this.traps);
    const trailSignature = JSON.stringify(this.runnerTrail);
    if (force || trapSignature !== this._lastTrapSignature) {
      this.renderer.setTrapMarkers(this.traps, this.pvpRole === 'runner');
      this._lastTrapSignature = trapSignature;
    }
    if (force || trailVisible !== this._trailVisible || trailSignature !== this._lastTrailSignature) {
      this.renderer.setTrailMarkers(this.runnerTrail, trailVisible);
      this._trailVisible = trailVisible;
      this._lastTrailSignature = trailSignature;
    }

    if (!this.remotePlayer) return;

    if (this.remoteRole === 'hunter') {
      const visible = this.renderer.isInVisibleRange(this.playerX, this.playerY, this.remotePlayer.x, this.remotePlayer.y);
      this.renderer.updateMonster(0, this.remotePlayer.x, this.remotePlayer.y, visible, false);
    } else {
      const hiddenByCamouflage = this.camouflageTurns > 0;
      const hiddenByMapReveal = mapRevealActive;
      const visible = !hiddenByCamouflage &&
        !hiddenByMapReveal &&
        this.renderer.isInVisibleRange(this.playerX, this.playerY, this.remotePlayer.x, this.remotePlayer.y);
      this.renderer.updateRemoteRunner(this.remotePlayer.x, this.remotePlayer.y, visible);
    }
  }

  syncPvpSession(session) {
    this._pvpSession = session;
    if (!this.isPvp || !session?.game) return;

    const game = session.game;
    const local = game.players[this.pvpRole];
    const remote = game.players[this.remoteRole];
    if (!local || !remote) return;

    this.playerX = local.x;
    this.playerY = local.y;
    this.remotePlayer = { x: remote.x, y: remote.y };
    this.movesLeft = local.movesLeft || 0;
    this.specialMove = local.specialMove || null;
    this.localStunTurns = local.stunTurns || 0;
    this.chaseProgress = game.chaseProgress || 0;
    this.traps = Array.isArray(game.traps) ? game.traps.map(trap => ({ ...trap })) : [];
    this.runnerTrail = Array.isArray(game.runnerTrail) ? game.runnerTrail.map(point => ({ ...point })) : [];
    this.camouflageTurns = game.effects?.runnerCamouflageTurns || 0;
    this.huntMapUntil = game.effects?.huntMapUntil || 0;
    this.huntZone = game.effects?.huntZone || null;
    this.trailRevealUntil = game.effects?.trailRevealUntil || 0;

    this._updateHUD();
    this._updateStatusEffects();
    this._syncPvpVisuals(true);

    if (game.status === 'finished' && !this._pvpEndHandled) {
      this._pvpEndHandled = true;
      if (game.winner === this.pvpRole) {
        this._win();
      } else {
        this._gameOver(null);
      }
    }
  }

  _onMonsterMove() {
    for (const monster of this.monsters) {
      const trapIndex = this.traps.findIndex(trap => trap.x === monster.x && trap.y === monster.y);
      if (trapIndex >= 0) {
        this.traps.splice(trapIndex, 1);
        monster.stun(TRAP_STUN_TURNS);
        this.renderer.setTrapMarkers(this.traps, this.traps.length > 0);
      }

      if (monster.x === this.playerX && monster.y === this.playerY) {
        this._gameOver(monster);
        return;
      }
    }
  }

  selectTopic(slotId) {
    if (this.state !== 'topic_select') return;

    const slotConfig = this.slotConfigs.find(slot => slot.slotDef.id === slotId);
    if (slotConfig?.slotDef.bonus === 'camouflage') {
      if (this.camouflageTurns > 0) return;
      if (Date.now() < this.camouflageCooldownUntil) return;
    }

    this.currentSlotId = slotId;
    this.state = 'question';

    if (this._topicPanelTimer) {
      clearInterval(this._topicPanelTimer);
      this._topicPanelTimer = null;
    }

    const question = this.questionManager.getQuestion(slotId);
    if (!question) {
      this.state = 'topic_select';
      return;
    }

    this.currentQuestion = question;
    this._showQuestion(question);
  }

  async answerQuestion(selectedIndex) {
    if (this.state !== 'question' || !this.currentQuestion) return;
    if (this.isPvp) {
      await this._answerQuestionPvp(selectedIndex);
      return;
    }
    this._answerQuestionSolo(selectedIndex);
  }

  async _answerQuestionPvp(selectedIndex) {
    this.questionsAnswered++;
    const isCorrect = selectedIndex === this.currentQuestion.options.correctIndex;
    const correctAnswer = this.currentQuestion.options.options[this.currentQuestion.options.correctIndex];

    if (!isCorrect) {
      this.audio.playWrongAnswer();
      this._showFeedback(false, correctAnswer);
      this.questionManager.onWrongAnswer(this.currentSlotId);
      setTimeout(() => {
        if (this.state === 'lost' || this.state === 'won') return;
        this.state = 'topic_select';
        this._showTopicPanel();
      }, 1200);
      return;
    }

    this.questionsCorrect++;
    this.audio.playCorrectAnswer();

    try {
      const result = await this.pvpClient.submitAnswer(this.currentSlotId, true);
      this.questionManager.onCorrectAnswer(this.currentSlotId);
      this.syncPvpSession(result.session);

      if (result.result === 'stunned') {
        this._showFeedback(true, `Оглушение: пропуск ходов (${result.remainingStunTurns})`);
      } else {
        this._showFeedback(true, correctAnswer);
      }
    } catch (err) {
      console.warn('PVP answer failed:', err);
      this._showFeedback(false, 'Сеть прервалась. Попробуйте снова.');
      setTimeout(() => {
        this.state = 'topic_select';
        this._showTopicPanel();
      }, 1200);
      return;
    }

    setTimeout(() => {
      if (this.state === 'lost' || this.state === 'won') return;
      if (this._canMoveNow()) {
        this.state = 'direction_select';
        this._showDirectionPanel();
      } else {
        this.state = 'topic_select';
        this._showTopicPanel();
      }
    }, 900);
  }

  _answerQuestionSolo(selectedIndex) {
    this.questionsAnswered++;
    const isCorrect = selectedIndex === this.currentQuestion.options.correctIndex;
    const correctAnswer = this.currentQuestion.options.options[this.currentQuestion.options.correctIndex];

    if (isCorrect) {
      this.questionsCorrect++;
      this.audio.playCorrectAnswer();
      this._applyBonus(this.currentQuestion.slotDef.bonus);
      this._showFeedback(true, correctAnswer);
      this.questionManager.onCorrectAnswer(this.currentSlotId);

      if (this.gameMode === 'chase') {
        this.chaseProgress++;
        this._updateHUD();
        if (this.chaseProgress >= this.chaseTarget) {
          this._win();
          return;
        }
      }

      setTimeout(() => {
        if (this.state === 'lost' || this.state === 'won') return;
        if (this._canMoveNow()) {
          this.state = 'direction_select';
          this._showDirectionPanel();
        } else {
          this.state = 'topic_select';
          this._showTopicPanel();
        }
      }, 900);
      return;
    }

    this.audio.playWrongAnswer();
    this._showFeedback(false, correctAnswer);
    this.questionManager.onWrongAnswer(this.currentSlotId);
    setTimeout(() => {
      if (this.state === 'lost' || this.state === 'won') return;
      this.state = 'topic_select';
      this._showTopicPanel();
    }, 1200);
  }

  _applyBonus(bonusType) {
    switch (bonusType) {
      case 'move1':
        this.movesLeft = Math.max(this.movesLeft, 1);
        this.specialMove = null;
        break;
      case 'move2':
        this.movesLeft = Math.max(this.movesLeft, 2);
        this.specialMove = null;
        break;
      case 'camouflage':
        this._activateCamouflage();
        break;
      case 'bait':
        this._placeBait();
        break;
      case 'reveal':
        this.monsterRevealed = true;
        this.revealTurns = 3;
        this._updateStatusEffects();
        break;
      case 'trap':
        this._placeTrap();
        break;
      case 'dash':
      case 'pounce':
        this.specialMove = { type: bonusType, distance: 3 };
        this.movesLeft = 0;
        this._updateStatusEffects();
        break;
      case 'hunt_map':
        this.huntMapUntil = Date.now() + HUNT_MAP_REVEAL_MS;
        this._updateStatusEffects();
        break;
      case 'trail':
        this.trailRevealUntil = Date.now() + TRAIL_REVEAL_MS;
        this._updateStatusEffects();
        break;
    }
  }

  _activateCamouflage() {
    if (Date.now() < this.camouflageCooldownUntil) {
      this.movesLeft = Math.max(this.movesLeft, 1);
      return;
    }
    this.camouflageTurns = CAMOUFLAGE_TURNS;
    this.camouflageCooldownUntil = Date.now() + CAMOUFLAGE_COOLDOWN_MS;
    this.monsters.forEach(monster => monster.setBlind(true));
    this._updateStatusEffects();
  }

  _endCamouflage() {
    this.camouflageTurns = 0;
    this.monsters.forEach(monster => monster.setBlind(false));
  }

  _placeBait() {
    const pathCells = this.mazeGen.getPathCells();
    const candidates = pathCells.filter(cell => {
      const dist = Math.abs(cell.x - this.playerX) + Math.abs(cell.y - this.playerY);
      return dist >= 5 && dist <= 10;
    });

    if (candidates.length === 0) return;

    const bait = candidates[Math.floor(Math.random() * candidates.length)];
    this.renderer.placeBait(bait.x, bait.y);
    this.monsters.forEach(monster => monster.setBait(bait.x, bait.y));
    setTimeout(() => this.renderer.removeBait(), 20000);
  }

  _placeTrap() {
    this.traps = this.traps.filter(trap => !(trap.x === this.playerX && trap.y === this.playerY));
    this.traps.push({ x: this.playerX, y: this.playerY, stunTurns: TRAP_STUN_TURNS });
    this.renderer.setTrapMarkers(this.traps, true);
    this._updateStatusEffects();
  }

  async movePlayer(direction) {
    if (this.state !== 'direction_select') return;
    if (this.isPvp) {
      await this._movePlayerPvp(direction);
      return;
    }
    this._movePlayerSolo(direction);
  }

  async _movePlayerPvp(direction) {
    const actor = this._getLocalPvpActor();
    if (!actor || (!actor.specialMove && actor.movesLeft <= 0)) return;

    try {
      const result = await this.pvpClient.move(direction);
      this.syncPvpSession(result.session);
    } catch (err) {
      console.warn('PVP move failed:', err);
      return;
    }

    this.audio.playStep();
    if (this.state === 'lost' || this.state === 'won') return;

    if (this._canMoveNow()) {
      this.state = 'direction_select';
      this._showDirectionPanel();
    } else {
      this.state = 'topic_select';
      this._showTopicPanel();
    }
  }

  _movePlayerSolo(direction) {
    if (!this.specialMove && this.movesLeft <= 0) return;

    const moved = this._stepLocalPlayer(direction, this.specialMove ? this.specialMove.distance : 1);
    if (moved <= 0) return;

    this.audio.playStep();
    if (this.specialMove) {
      this.specialMove = null;
    } else {
      this.movesLeft--;
    }

    this._checkTreasures();
    for (const monster of this.monsters) {
      if (monster.x === this.playerX && monster.y === this.playerY) {
        this._gameOver(monster);
        return;
      }
    }

    if (this.treasuresCollected >= this.totalTreasures) {
      this._win();
      return;
    }

    this._tickEffects();

    if (this._canMoveNow()) {
      this._updateDirectionButtons();
    } else {
      this.state = 'topic_select';
      this._showTopicPanel();
    }

    this._updateHUD();
  }

  _stepLocalPlayer(direction, maxSteps) {
    const dirs = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const dir = dirs[direction];
    if (!dir) return 0;

    let moved = 0;
    for (let i = 0; i < maxSteps; i++) {
      const nx = this.playerX + dir.x;
      const ny = this.playerY + dir.y;
      if (nx < 0 || nx >= this.mazeGen.width || ny < 0 || ny >= this.mazeGen.height) break;
      if (this.mazeGen.grid[ny][nx] === 0) break;

      this.playerX = nx;
      this.playerY = ny;
      moved++;
    }

    return moved;
  }

  _checkTreasures() {
    for (const treasure of this.treasures) {
      if (!treasure.collected && treasure.x === this.playerX && treasure.y === this.playerY) {
        treasure.collected = true;
        this.treasuresCollected++;
        this.audio.playTreasureCollect();
        this._updateHUD();
      }
    }
  }

  _tickEffects() {
    if (this.camouflageTurns > 0) {
      this.camouflageTurns--;
      if (this.camouflageTurns <= 0) this._endCamouflage();
    }

    if (this.revealTurns > 0) {
      this.revealTurns--;
      if (this.revealTurns <= 0) this.monsterRevealed = false;
    }

    this._updateStatusEffects();
  }

  _syncModeUI() {
    const treasureEl = document.getElementById('treasure-counter');
    const chaseEl = document.getElementById('chase-counter');
    const roleEl = document.getElementById('pvp-role-indicator');
    const winNextBtn = document.getElementById('win-next');

    if (this.gameMode === 'chase') {
      treasureEl.classList.add('hidden');
      chaseEl.classList.remove('hidden');
    } else {
      treasureEl.classList.remove('hidden');
      chaseEl.classList.add('hidden');
    }

    if (this.isPvp) {
      roleEl.classList.remove('hidden');
      roleEl.textContent = this.pvpRole === 'runner' ? 'Роль: Бегун' : 'Роль: Хищник';
      winNextBtn.classList.add('hidden');
    } else {
      roleEl.classList.add('hidden');
      roleEl.textContent = '';
      winNextBtn.classList.remove('hidden');
    }

    document.getElementById('chase-target').textContent = this.chaseTarget;
    document.getElementById('chase-progress').textContent = this.chaseProgress;
  }

  _showTopicPanel() {
    document.getElementById('topic-panel').classList.remove('hidden');
    document.getElementById('question-panel').classList.add('hidden');
    document.getElementById('direction-panel').classList.add('hidden');
    this._renderTopicButtons();

    if (this._topicPanelTimer) clearInterval(this._topicPanelTimer);
    this._topicPanelTimer = setInterval(() => {
      if (this.state !== 'topic_select') {
        clearInterval(this._topicPanelTimer);
        this._topicPanelTimer = null;
        return;
      }
      this._renderTopicButtons();
      this._updateStatusEffects();
    }, 1000);
  }

  _renderTopicButtons() {
    const container = document.getElementById('topic-buttons');
    container.innerHTML = '';

    this.slotConfigs.forEach((cfg) => {
      const btn = document.createElement('button');
      btn.className = 'topic-btn';
      btn.dataset.slot = cfg.slotDef.id;

      const name = cfg.slotDef.isWortstellung
        ? `Wortstellung + ${cfg.grammarTopic}`
        : cfg.grammarTopic;

      let bonusText = cfg.slotDef.bonusLabel;
      let disabled = false;

      if (cfg.slotDef.bonus === 'camouflage') {
        if (this.camouflageTurns > 0) {
          bonusText = `Маскировка ${this.camouflageTurns}`;
          disabled = true;
        } else {
          const cooldownLeft = this.camouflageCooldownUntil - Date.now();
          if (cooldownLeft > 0) {
            bonusText = `Откат ${this._formatMs(cooldownLeft)}`;
            disabled = true;
          }
        }
      }

      btn.innerHTML = `
        <span class="topic-name">${name}</span>
        <span class="topic-bonus">${bonusText}</span>
      `;

      if (disabled) {
        btn.disabled = true;
        btn.classList.add('cooldown');
      } else {
        btn.addEventListener('click', () => this.selectTopic(cfg.slotDef.id));
      }

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

    document.getElementById('question-topic-label').textContent = `${topicLabel} (${question.level})`;
    document.getElementById('question-text').innerHTML = `${question.text}<br><strong>${question.display}</strong>`;

    const optionsDiv = document.getElementById('question-options');
    optionsDiv.innerHTML = '';

    question.options.options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = option;
      btn.addEventListener('click', () => {
        optionsDiv.querySelectorAll('.option-btn').forEach(node => { node.disabled = true; });
        btn.classList.add(index === question.options.correctIndex ? 'correct' : 'wrong');
        if (index !== question.options.correctIndex) {
          optionsDiv.children[question.options.correctIndex].classList.add('correct');
        }
        this.answerQuestion(index);
      });
      optionsDiv.appendChild(btn);
    });

    document.getElementById('question-feedback').classList.add('hidden');
  }

  _showFeedback(isCorrect, detail) {
    const feedback = document.getElementById('question-feedback');
    feedback.classList.remove('hidden', 'correct', 'wrong');
    feedback.classList.add(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      const slot = this.slotConfigs.find(cfg => cfg.slotDef.id === this.currentSlotId);
      const extra = typeof detail === 'string' && detail.startsWith('Оглушение') ? ` | ${detail}` : '';
      feedback.textContent = `Richtig! Бонус: ${slot ? slot.slotDef.bonusLabel : ''}${extra}`;
    } else {
      feedback.textContent = `Falsch. Правильный ответ: ${detail}`;
    }
  }

  _showDirectionPanel() {
    document.getElementById('topic-panel').classList.add('hidden');
    document.getElementById('question-panel').classList.add('hidden');

    const panel = document.getElementById('direction-panel');
    panel.classList.remove('hidden');
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
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };

    document.querySelectorAll('.dir-btn').forEach(btn => {
      const dir = dirs[btn.dataset.dir];
      const nx = this.playerX + dir.x;
      const ny = this.playerY + dir.y;
      btn.disabled = !(nx >= 0 && nx < this.mazeGen.width &&
        ny >= 0 && ny < this.mazeGen.height &&
        this.mazeGen.grid[ny][nx] === 1);
    });

    const prompt = this.specialMove
      ? `Выберите направление для рывка (${this.specialMove.distance} клетки):`
      : `Выберите направление (ходов: ${this.movesLeft}):`;
    document.querySelector('#direction-panel .direction-prompt').textContent = prompt;
  }

  _updateHUD() {
    document.getElementById('treasure-count').textContent = this.treasuresCollected;
    document.getElementById('level-num').textContent = this.currentLevel;
    document.getElementById('chase-progress').textContent = this.chaseProgress;
    document.getElementById('chase-target').textContent = this.chaseTarget;
  }

  _updateStatusEffects() {
    const container = document.getElementById('status-effects');
    container.innerHTML = '';

    const addBadge = (text) => {
      const badge = document.createElement('div');
      badge.className = 'status-badge';
      badge.textContent = text;
      container.appendChild(badge);
    };

    if (this.camouflageTurns > 0) addBadge(`Маскировка ${this.camouflageTurns}`);
    if (this.revealTurns > 0) addBadge(`Монстр виден ${this.revealTurns}`);
    if (this.traps.length > 0 && !this.isPvp) addBadge(`Ловушки ${this.traps.length}`);
    if (this.specialMove) addBadge(this.specialMove.type === 'pounce' ? 'Бросок готов' : 'Рывок готов');
    if (this.localStunTurns > 0) addBadge(`Оглушение ${this.localStunTurns}`);
    if (this.isPvp && Date.now() < this.huntMapUntil) addBadge('Вся карта открыта');
    if (this.isPvp && Date.now() < this.trailRevealUntil) addBadge('След бегуна виден');

    const cooldownLeft = this.camouflageCooldownUntil - Date.now();
    if (this.camouflageTurns <= 0 && cooldownLeft > 0) {
      addBadge(`Маскировка КД ${this._formatMs(cooldownLeft)}`);
    }
  }

  _gameOver(killerMonster) {
    if (this.state === 'lost') return;
    this.state = 'lost';
    this.monsters.forEach(monster => monster.stop());

    const accuracy = this.questionsAnswered > 0
      ? Math.round((this.questionsCorrect / this.questionsAnswered) * 100)
      : 0;
    const scoreValue = this.gameMode === 'chase' ? this.chaseProgress : this.treasuresCollected;
    this.leaderboard.addScore({
      name: this.playerName,
      level: this.currentLevel,
      treasures: scoreValue,
      accuracy,
      date: new Date().toISOString().split('T')[0],
    });

    document.getElementById('lose-message').textContent = this.isPvp
      ? (this.pvpRole === 'runner' ? 'Хищник настиг вас.' : 'Бегун смог вырваться.')
      : 'Монстр вас настиг...';

    const showLose = () => {
      this.renderer.stopLoop();
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('lose-screen').classList.add('active');
      const progress = this.gameMode === 'chase'
        ? `Побег: ${this.chaseProgress}/${this.chaseTarget}`
        : `Сокровища: ${this.treasuresCollected}/${this.totalTreasures}`;
      document.getElementById('lose-stats').textContent =
        `Уровень: ${this.currentLevel} | Вопросов: ${this.questionsAnswered} | Правильных: ${this.questionsCorrect} | ${progress}`;
    };

    if (this.isPvp) {
      this.audio.playMonsterCatch();
      setTimeout(showLose, 250);
      return;
    }

    const mx = killerMonster ? killerMonster.x : this.playerX;
    const my = killerMonster ? killerMonster.y : this.playerY;
    this.audio.playMonsterCatch();
    this.renderer.playDeathAnimation(mx, my, showLose);
  }

  _win() {
    if (this.state === 'won') return;
    this.state = 'won';
    this.monsters.forEach(monster => monster.stop());
    this.renderer.stopLoop();
    this.audio.playTreasureCollect();

    const accuracy = this.questionsAnswered > 0
      ? Math.round((this.questionsCorrect / this.questionsAnswered) * 100)
      : 0;
    const scoreValue = this.gameMode === 'chase' ? this.chaseProgress : this.treasuresCollected;
    this.leaderboard.addScore({
      name: this.playerName,
      level: this.currentLevel,
      treasures: scoreValue,
      accuracy,
      date: new Date().toISOString().split('T')[0],
    });

    const showWin = () => {
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('win-screen').classList.add('active');
      let modeNote = '';
      if (this.gameMode === 'chase' && this.isPvp) {
        modeNote = this.pvpRole === 'runner' ? ' | Бегун ушёл от хищника!' : ' | Хищник поймал добычу!';
      } else if (this.gameMode === 'chase') {
        modeNote = ' | Побег удался!';
      }
      document.getElementById('win-stats').textContent =
        `Уровень ${this.currentLevel} пройден!${modeNote} | Точность: ${accuracy}%`;
    };

    setTimeout(showWin, 400);
  }

  nextLevel() {
    if (this.isPvp) return;
    this.currentLevel++;
    document.getElementById('win-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    this.init({
      isCreepy: this.isCreepy,
      monsterCount: this.monsterCountSetting,
      difficulty: this.difficulty,
      langLevel: this.langLevel,
      playerName: this.playerName,
      level: this.currentLevel,
      lexicalTopic: this.lexicalTopic,
      slotConfigs: this.slotConfigs,
      gameMode: this.gameMode,
      matchType: this.matchType,
    });
  }

  restart() {
    this.currentLevel = 1;
  }

  _formatMs(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  destroy() {
    this.monsters.forEach(monster => monster.stop());
    if (this._topicPanelTimer) {
      clearInterval(this._topicPanelTimer);
      this._topicPanelTimer = null;
    }
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
