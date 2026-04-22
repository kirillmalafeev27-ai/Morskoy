// Entry point - multi-step menu, lobby sync, game initialization

const game = new Game();

const savedName = localStorage.getItem('morskoy_player_name');
if (savedName) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('player-name').value = savedName;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const pvp = new PvpSessionClient();

  let selectedLevel = null;
  let selectedLexical = null;
  let selectedGrammar = null;
  let selectedSlotIdx = null;
  const slotAssignments = [null, null, null, null, null];
  let setupSyncTimer = null;
  let sessionGameStarted = false;
  let pvpInitInFlight = false;

  const gameModeEl = document.getElementById('game-mode');
  const matchTypeEl = document.getElementById('match-type');
  const monsterCountGroup = document.getElementById('monster-count-group');
  const difficultyGroup = document.getElementById('difficulty-group');
  const pvpSessionGroup = document.getElementById('pvp-session-group');
  const pvpRoleEl = document.getElementById('pvp-role');
  const pvpCodeEl = document.getElementById('pvp-session-code');
  const pvpStatusEl = document.getElementById('pvp-session-status');
  const readyHintEl = document.getElementById('pvp-ready-hint');
  const playerNameEl = document.getElementById('player-name');
  const startBtn = document.getElementById('start-btn');

  function isPvpMode() {
    return gameModeEl.value === 'chase' && matchTypeEl.value === 'pvp';
  }

  function currentRole() {
    return pvp.session?.viewerRole || pvp.role || pvpRoleEl.value || 'runner';
  }

  function currentBonusSlots() {
    return getBonusSlots(gameModeEl.value, currentRole());
  }

  function currentViewerReady() {
    const session = pvp.session;
    if (!session) return false;
    const role = session.viewerRole || pvp.role || pvpRoleEl.value || 'runner';
    return Boolean(session.ready?.[role]);
  }

  function showStep(stepNum) {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`setup-step${i}`);
      el.classList.toggle('hidden', i !== stepNum);
    }
  }

  function syncModeControls() {
    const chaseMode = gameModeEl.value === 'chase';
    const pvpMode = isPvpMode();
    monsterCountGroup.classList.toggle('hidden', chaseMode);
    difficultyGroup.classList.toggle('hidden', pvpMode);
    pvpSessionGroup.classList.toggle('hidden', !chaseMode || matchTypeEl.value !== 'pvp');
    readyHintEl.classList.toggle('hidden', !pvpMode);
    _renderSlots();
    _updateStartButton();
  }

  function collectSetupPatch() {
    return {
      isCreepy: document.getElementById('creepy-mode').checked,
      difficulty: document.getElementById('difficulty').value,
      langLevel: selectedLevel,
      lexicalTopic: selectedLexical,
      slotAssignments: [...slotAssignments],
    };
  }

  function isSetupSynced(sessionSetup, localPatch) {
    if (!sessionSetup || !localPatch) return false;
    if (sessionSetup.isCreepy !== localPatch.isCreepy) return false;
    if (sessionSetup.difficulty !== localPatch.difficulty) return false;
    if (sessionSetup.langLevel !== localPatch.langLevel) return false;
    if (sessionSetup.lexicalTopic !== localPatch.lexicalTopic) return false;
    if (!Array.isArray(sessionSetup.slotAssignments) || sessionSetup.slotAssignments.length !== localPatch.slotAssignments.length) {
      return false;
    }
    for (let i = 0; i < localPatch.slotAssignments.length; i++) {
      if (sessionSetup.slotAssignments[i] !== localPatch.slotAssignments[i]) return false;
    }
    return true;
  }

  function schedulePvpSetupSync() {
    if (!isPvpMode() || !pvp.isActive) return;
    clearTimeout(setupSyncTimer);
    setupSyncTimer = setTimeout(() => {
      pvp.updateSetup(collectSetupPatch()).catch(err => {
        console.warn('Failed to sync lobby setup:', err);
        renderPvpStatus(err.message);
      });
    }, 120);
  }

  function renderPvpStatus(extraMessage = '') {
    if (!isPvpMode()) {
      pvpStatusEl.textContent = 'PVP-комната ещё не создана.';
      readyHintEl.textContent = '';
      readyHintEl.classList.add('hidden');
      return;
    }

    if (!pvp.session) {
      pvpStatusEl.textContent = extraMessage || 'Создайте комнату или войдите по коду.';
      readyHintEl.textContent = '';
      readyHintEl.classList.remove('hidden');
      return;
    }

    const session = pvp.session;
    const runner = session.players.runner;
    const hunter = session.players.hunter;
    const statusLines = [
      `Код: ${session.id}`,
      `Вы: ${session.viewerRole === 'runner' ? 'бегун' : 'хищник'}`,
      `Бегун: ${runner ? `${runner.name}${session.ready.runner ? ' (готов)' : ' (ждёт)'}` : 'пусто'}`,
      `Хищник: ${hunter ? `${hunter.name}${session.ready.hunter ? ' (готов)' : ' (ждёт)'}` : 'пусто'}`,
    ];
    pvpStatusEl.textContent = statusLines.join(' | ');

    if (session.phase === 'awaiting_init') {
      readyHintEl.textContent = 'Оба игрока готовы. Запускаем общую карту...';
    } else if (session.phase === 'in_game') {
      readyHintEl.textContent = 'Матч уже идёт.';
    } else if (session.ready.runner || session.ready.hunter) {
      readyHintEl.textContent = 'Один игрок уже готов. Ждём второго перед стартом.';
    } else {
      readyHintEl.textContent = extraMessage || 'Нажмите «Готов», когда оба увидят общий набор тем.';
    }
    readyHintEl.classList.remove('hidden');
  }

  function applySessionSetup(session) {
    if (!session) return;

    const setup = session.setup || {};
    matchTypeEl.value = 'pvp';
    gameModeEl.value = 'chase';
    pvpRoleEl.value = session.viewerRole || pvpRoleEl.value;

    if (setup.langLevel) selectedLevel = setup.langLevel;
    if (setup.lexicalTopic) selectedLexical = setup.lexicalTopic;
    if (Array.isArray(setup.slotAssignments)) {
      for (let i = 0; i < slotAssignments.length; i++) {
        slotAssignments[i] = setup.slotAssignments[i] || null;
      }
    }

    if (typeof setup.isCreepy === 'boolean') {
      document.getElementById('creepy-mode').checked = setup.isCreepy;
    }
    if (setup.difficulty) {
      document.getElementById('difficulty').value = setup.difficulty;
    }

    syncModeControls();
    _renderSlots();
    _renderGrammarPicker();
    _buildLexicalGrid();
    _updateLevelButtons();
    _updateStartButton();
  }

  function _updateLevelButtons() {
    document.querySelectorAll('.level-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.level === selectedLevel);
    });
  }

  function _buildLexicalGrid() {
    const grid = document.getElementById('lexical-grid');
    grid.innerHTML = '';
    LEXICAL_TOPICS.forEach(topic => {
      const btn = document.createElement('button');
      btn.className = 'lexical-btn';
      btn.textContent = topic;
      btn.classList.toggle('selected', topic === selectedLexical);
      btn.addEventListener('click', () => {
        selectedLexical = topic;
        _buildLexicalGrid();
        schedulePvpSetupSync();
        setTimeout(() => {
          _buildStep4();
          showStep(4);
        }, 150);
      });
      grid.appendChild(btn);
    });
  }

  function _buildStep4() {
    selectedGrammar = null;
    selectedSlotIdx = null;
    _renderSlots();
    _renderGrammarPicker();
    _updateStartButton();
  }

  function _renderSlots() {
    const slots = currentBonusSlots();
    const slotEls = document.getElementById('bonus-slots').querySelectorAll('.bonus-slot');

    slotEls.forEach((el, i) => {
      const grammar = slotAssignments[i];
      const slotDef = slots[i];

      el.classList.remove('selected-slot', 'has-topic', 'empty', 'filled');
      el.querySelector('.slot-bonus').textContent = slotDef?.bonusLabel || '';

      if (grammar) {
        el.classList.add('has-topic');
        if (slotDef?.isWortstellung) {
          el.querySelector('.slot-topic').textContent = 'Wortstellung';
          el.querySelector('.slot-grammar').textContent = `+ ${grammar}`;
        } else {
          el.querySelector('.slot-topic').textContent = grammar;
          el.querySelector('.slot-grammar').textContent = '';
        }
      } else {
        el.classList.add(slotDef?.fixed ? 'filled' : 'empty');
        if (slotDef?.isWortstellung) {
          el.querySelector('.slot-topic').textContent = 'Wortstellung';
          el.querySelector('.slot-grammar').textContent = '+ выберите тему';
        } else {
          el.querySelector('.slot-topic').textContent = 'Пусто';
          el.querySelector('.slot-grammar').textContent = '';
        }
      }

      if (selectedSlotIdx === i) el.classList.add('selected-slot');
    });
  }

  function _renderGrammarPicker() {
    const picker = document.getElementById('grammar-picker');
    picker.innerHTML = '';
    const usedTopics = slotAssignments.filter(Boolean);

    GRAMMAR_TOPICS.forEach(topic => {
      const tag = document.createElement('button');
      tag.className = 'grammar-tag';
      tag.textContent = topic;

      if (usedTopics.includes(topic)) tag.classList.add('used');
      if (selectedGrammar === topic) tag.classList.add('selected-grammar');

      tag.addEventListener('click', () => {
        if (usedTopics.includes(topic)) return;

        selectedGrammar = selectedGrammar === topic ? null : topic;
        if (selectedGrammar && selectedSlotIdx !== null) {
          for (let i = 0; i < slotAssignments.length; i++) {
            if (slotAssignments[i] === selectedGrammar) slotAssignments[i] = null;
          }
          slotAssignments[selectedSlotIdx] = selectedGrammar;
          selectedGrammar = null;
          selectedSlotIdx = null;
          schedulePvpSetupSync();
        }

        _renderSlots();
        _renderGrammarPicker();
        _updateStartButton();
      });

      picker.appendChild(tag);
    });
  }

  function _updateStartButton() {
    const allFilled = slotAssignments.every(Boolean);
    const setupReady = allFilled && selectedLevel && selectedLexical;
    if (!isPvpMode()) {
      startBtn.disabled = !setupReady;
      startBtn.textContent = 'НАЧАТЬ ИГРУ';
      return;
    }

    const session = pvp.session;
    const localReady = currentViewerReady();
    const isLaunching = session?.phase === 'awaiting_init';
    const isRunning = session?.phase === 'in_game';

    startBtn.disabled = !(
      setupReady &&
      pvp.isActive &&
      session?.canStart &&
      !localReady &&
      !isLaunching &&
      !isRunning
    );

    if (isRunning) {
      startBtn.textContent = 'ИГРА ИДЁТ';
    } else if (isLaunching) {
      startBtn.textContent = 'ЗАПУСК...';
    } else if (localReady) {
      startBtn.textContent = 'ЖДЁМ ИГРОКА';
    } else {
      startBtn.textContent = 'ГОТОВ';
    }
  }

  function buildSlotConfigsForRole(role) {
    return getBonusSlots(gameModeEl.value, role).map((slotDef, index) => ({
      slotDef,
      grammarTopic: slotAssignments[index],
    }));
  }

  function buildSharedSettings(slotConfigs, extra = {}) {
    return {
      isCreepy: document.getElementById('creepy-mode').checked,
      monsterCount: parseInt(document.getElementById('monster-count').value, 10),
      difficulty: document.getElementById('difficulty').value,
      gameMode: gameModeEl.value,
      matchType: matchTypeEl.value,
      langLevel: selectedLevel,
      playerName: playerNameEl.value.trim() || 'Spieler',
      level: 1,
      lexicalTopic: selectedLexical,
      slotConfigs,
      ...extra,
    };
  }

  function findNearestPathCell(mazeGen, targetX, targetY) {
    const maxRadius = Math.max(mazeGen.width, mazeGen.height);
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = targetX + dx;
          const y = targetY + dy;
          if (x < 0 || x >= mazeGen.width || y < 0 || y >= mazeGen.height) continue;
          if (mazeGen.grid[y][x] === 1) return { x, y };
        }
      }
    }
    return { x: 1, y: 1 };
  }

  function buildPvpInitPayload() {
    const levelCfg = LEVEL_CONFIG[0];
    const mazeGen = new MazeGenerator(levelCfg.mazeW, levelCfg.mazeH);
    mazeGen.generate();
    const hunterSpawn = findNearestPathCell(mazeGen, mazeGen.width - 2, mazeGen.height - 2);
    return {
      maze: {
        width: mazeGen.width,
        height: mazeGen.height,
        grid: mazeGen.grid.map(row => [...row]),
      },
      players: {
        runner: { x: 1, y: 1 },
        hunter: hunterSpawn,
      },
      escapeTarget: 8,
    };
  }

  function _showTutorial(onClose) {
    const overlay = document.getElementById('tutorial-overlay');
    overlay.classList.remove('hidden');
    const closeBtn = document.getElementById('tutorial-close');
    const handler = () => {
      overlay.classList.add('hidden');
      closeBtn.removeEventListener('click', handler);
      if (onClose) onClose();
    };
    closeBtn.addEventListener('click', handler);
  }

  function maybeWithTutorial(next) {
    const hasPlayed = localStorage.getItem('morskoy_tutorial_seen');
    if (!hasPlayed) {
      localStorage.setItem('morskoy_tutorial_seen', '1');
      _showTutorial(next);
      return;
    }
    next();
  }

  function startSoloGame() {
    const playerName = playerNameEl.value.trim() || 'Spieler';
    localStorage.setItem('morskoy_player_name', playerName);
    const settings = buildSharedSettings(buildSlotConfigsForRole('runner'));
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    game.init(settings);
  }

  async function startPvpReadyFlow() {
    if (!pvp.session) return;
    const playerName = playerNameEl.value.trim() || 'Spieler';
    localStorage.setItem('morskoy_player_name', playerName);
    clearTimeout(setupSyncTimer);
    setupSyncTimer = null;

    try {
      const setupPatch = collectSetupPatch();
      if (!isSetupSynced(pvp.session.setup, setupPatch)) {
        await pvp.updateSetup(setupPatch);
      }
      await pvp.setReady(true);
      renderPvpStatus();
    } catch (err) {
      renderPvpStatus(err.message);
    }
  }

  function startPvpGame(session) {
    if (!session?.game || sessionGameStarted) return;
    sessionGameStarted = true;

    const slotConfigs = getBonusSlots('chase', session.viewerRole).map((slotDef, index) => ({
      slotDef,
      grammarTopic: session.setup.slotAssignments[index],
    }));

    const settings = {
      isCreepy: session.setup.isCreepy,
      monsterCount: 1,
      difficulty: session.setup.difficulty || 'medium',
      gameMode: 'chase',
      matchType: 'pvp',
      langLevel: session.setup.langLevel,
      playerName: playerNameEl.value.trim() || 'Spieler',
      level: 1,
      lexicalTopic: session.setup.lexicalTopic,
      slotConfigs,
      pvp: {
        client: pvp,
        role: session.viewerRole,
        session,
        gameState: session.game,
      },
    };

    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    game.init(settings);
  }

  async function returnToMenu({ leavePvp = false } = {}) {
    game.destroy();
    game.restart();
    sessionGameStarted = false;

    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('win-screen').classList.remove('active');
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
    showStep(1);

    if (leavePvp && pvp.isActive) {
      await pvp.leaveSession();
    }

    renderPvpStatus();
  }

  document.getElementById('to-step2-btn').addEventListener('click', () => showStep(2));
  document.getElementById('back-to-step1').addEventListener('click', () => showStep(1));
  document.getElementById('back-to-step2').addEventListener('click', () => showStep(2));
  document.getElementById('back-to-step3').addEventListener('click', () => showStep(3));

  gameModeEl.addEventListener('change', syncModeControls);
  matchTypeEl.addEventListener('change', syncModeControls);
  pvpRoleEl.addEventListener('change', () => {
    syncModeControls();
    renderPvpStatus();
  });
  document.getElementById('creepy-mode').addEventListener('change', schedulePvpSetupSync);
  document.getElementById('difficulty').addEventListener('change', schedulePvpSetupSync);
  playerNameEl.addEventListener('change', () => {
    localStorage.setItem('morskoy_player_name', playerNameEl.value.trim());
  });

  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedLevel = btn.dataset.level;
      _updateLevelButtons();
      schedulePvpSetupSync();
      setTimeout(() => {
        _buildLexicalGrid();
        showStep(3);
      }, 150);
    });
  });

  document.querySelectorAll('.bonus-slot').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.slot, 10);
      if (selectedGrammar) {
        for (let i = 0; i < slotAssignments.length; i++) {
          if (slotAssignments[i] === selectedGrammar) slotAssignments[i] = null;
        }
        slotAssignments[idx] = selectedGrammar;
        selectedGrammar = null;
        selectedSlotIdx = null;
        schedulePvpSetupSync();
      } else if (selectedSlotIdx === idx) {
        slotAssignments[idx] = null;
        selectedSlotIdx = null;
        schedulePvpSetupSync();
      } else {
        selectedSlotIdx = idx;
      }

      _renderSlots();
      _renderGrammarPicker();
      _updateStartButton();
    });
  });

  document.getElementById('pvp-create-btn').addEventListener('click', async () => {
    try {
      const playerName = playerNameEl.value.trim() || 'Spieler';
      await pvp.createSession(playerName, pvpRoleEl.value);
      await pvp.updateSetup(collectSetupPatch());
      renderPvpStatus('Комната создана. Отправьте код второму игроку.');
      _updateStartButton();
    } catch (err) {
      renderPvpStatus(err.message);
    }
  });

  document.getElementById('pvp-join-btn').addEventListener('click', async () => {
    const code = pvpCodeEl.value.trim().toUpperCase();
    if (!code) {
      renderPvpStatus('Введите код сессии.');
      return;
    }

    try {
      const playerName = playerNameEl.value.trim() || 'Spieler';
      await pvp.joinSession(code, playerName, pvpRoleEl.value);
      applySessionSetup(pvp.session);
      renderPvpStatus('Вы подключились к общей комнате.');
      _updateStartButton();
    } catch (err) {
      renderPvpStatus(err.message);
    }
  });

  pvp.onChange(async (session) => {
    if (!session) {
      renderPvpStatus();
      _updateStartButton();
      return;
    }

    applySessionSetup(session);
    renderPvpStatus();

    if (session.phase === 'awaiting_init' && session.hostRole === session.viewerRole && !session.game && !pvpInitInFlight) {
      pvpInitInFlight = true;
      try {
        await pvp.initGame(buildPvpInitPayload());
      } catch (err) {
        renderPvpStatus(err.message);
      } finally {
        pvpInitInFlight = false;
      }
      return;
    }

    if ((session.phase === 'in_game' || session.phase === 'finished') && session.game) {
      if (!sessionGameStarted) {
        if (session.phase === 'in_game') {
          startPvpGame(session);
        }
      } else {
        game.syncPvpSession(session);
      }
    }

    if (session.phase === 'lobby' || session.phase === 'awaiting_init') {
      sessionGameStarted = false;
    }
    if (session.phase !== 'awaiting_init') {
      pvpInitInFlight = false;
    }
  });

  startBtn.addEventListener('click', () => {
    maybeWithTutorial(() => {
      if (isPvpMode()) {
        startPvpReadyFlow();
      } else {
        startSoloGame();
      }
    });
  });

  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => game.movePlayer(btn.dataset.dir));
  });

  document.addEventListener('keydown', (e) => {
    if (game.state === 'direction_select') {
      const keyMap = {
        ArrowUp: 'up', w: 'up', W: 'up',
        ArrowDown: 'down', s: 'down', S: 'down',
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        game.movePlayer(keyMap[e.key]);
      }
    }

    if (game.state === 'topic_select') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < game.slotConfigs.length) {
        game.selectTopic(game.slotConfigs[idx].slotDef.id);
      }
    }

    if (game.state === 'question') {
      const optBtns = document.querySelectorAll('#question-options .option-btn');
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < optBtns.length && !optBtns[idx].disabled) {
        optBtns[idx].click();
      }
    }
  });

  (function enablePinchResize() {
    const panel = document.getElementById('question-panel');
    let baseScale = 1;
    let startDist = 0;
    let startScale = 1;
    const MIN_SCALE = 0.6;
    const MAX_SCALE = 1.4;

    const saved = sessionStorage.getItem('questionPanelScale');
    if (saved) {
      baseScale = parseFloat(saved);
      panel.style.transform = `translateX(-50%) scale(${baseScale})`;
      panel.style.transformOrigin = 'bottom center';
    }

    function getDist(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    panel.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        startDist = getDist(e.touches);
        startScale = baseScale;
      }
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dist = getDist(e.touches);
        const ratio = dist / startDist;
        baseScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale * ratio));
        panel.style.transform = `translateX(-50%) scale(${baseScale})`;
        panel.style.transformOrigin = 'bottom center';
      }
    }, { passive: true });

    panel.addEventListener('touchend', () => {
      sessionStorage.setItem('questionPanelScale', baseScale.toString());
    }, { passive: true });
  })();

  document.getElementById('win-next').addEventListener('click', () => game.nextLevel());

  document.getElementById('win-restart').addEventListener('click', () => {
    returnToMenu({ leavePvp: game.isPvp });
  });

  document.getElementById('lose-restart').addEventListener('click', () => {
    if (game.isPvp) {
      returnToMenu({ leavePvp: true });
      return;
    }

    game.destroy();
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    game.init({
      isCreepy: game.isCreepy,
      monsterCount: game.monsterCountSetting,
      difficulty: game.difficulty,
      gameMode: game.gameMode,
      matchType: game.matchType,
      langLevel: game.langLevel,
      playerName: game.playerName,
      level: game.currentLevel,
      lexicalTopic: game.lexicalTopic,
      slotConfigs: game.slotConfigs,
    });
  });

  document.getElementById('lose-menu').addEventListener('click', () => {
    returnToMenu({ leavePvp: game.isPvp });
  });

  document.getElementById('leaderboard-btn').addEventListener('click', () => {
    game.leaderboard.render();
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('leaderboard-screen').classList.add('active');
  });

  document.getElementById('leaderboard-back').addEventListener('click', () => {
    document.getElementById('leaderboard-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
  });

  syncModeControls();
  _buildLexicalGrid();
  _buildStep4();
  renderPvpStatus();
});
