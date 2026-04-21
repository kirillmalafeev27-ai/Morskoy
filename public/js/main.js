// Entry point - multi-step menu, grammar slot configuration, game initialization

const game = new Game();

// Restore player name
const savedName = localStorage.getItem('morskoy_player_name');
if (savedName) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('player-name').value = savedName;
  });
}

document.addEventListener('DOMContentLoaded', () => {

  // ===== STATE =====
  let selectedLevel = null;
  let selectedLexical = null;
  let selectedGrammar = null; // currently highlighted grammar tag
  let selectedSlotIdx = null; // currently highlighted slot
  const slotAssignments = [null, null, null, null, null]; // grammarTopic per slot

  // ===== STEP NAVIGATION =====
  function showStep(stepNum) {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`setup-step${i}`);
      if (i === stepNum) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }

  // Step 1 -> 2
  document.getElementById('to-step2-btn').addEventListener('click', () => showStep(2));
  document.getElementById('back-to-step1').addEventListener('click', () => showStep(1));

  // Chase mode forces a single predator — hide the monster-count option in that case.
  const gameModeEl = document.getElementById('game-mode');
  const monsterCountGroup = document.getElementById('monster-count-group');
  function _syncMonsterCountVisibility() {
    if (gameModeEl.value === 'chase') {
      monsterCountGroup.classList.add('hidden');
    } else {
      monsterCountGroup.classList.remove('hidden');
    }
  }
  gameModeEl.addEventListener('change', _syncMonsterCountVisibility);
  _syncMonsterCountVisibility();

  // Step 2 -> 3 (level selection)
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedLevel = btn.dataset.level;
      // Auto-advance to step 3
      setTimeout(() => {
        _buildLexicalGrid();
        showStep(3);
      }, 200);
    });
  });

  document.getElementById('back-to-step2').addEventListener('click', () => showStep(2));

  // ===== STEP 3: LEXICAL TOPICS =====
  function _buildLexicalGrid() {
    const grid = document.getElementById('lexical-grid');
    grid.innerHTML = '';
    LEXICAL_TOPICS.forEach(topic => {
      const btn = document.createElement('button');
      btn.className = 'lexical-btn';
      btn.textContent = topic;
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.lexical-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedLexical = topic;
        // Auto-advance to step 4
        setTimeout(() => {
          _buildStep4();
          showStep(4);
        }, 200);
      });
      grid.appendChild(btn);
    });
  }

  document.getElementById('back-to-step3').addEventListener('click', () => showStep(3));

  // ===== STEP 4: GRAMMAR SLOTS =====
  function _buildStep4() {
    selectedGrammar = null;
    selectedSlotIdx = null;

    // Reset slot assignments (keep slot 0 empty — Wortstellung needs a grammar topic)
    for (let i = 0; i < 5; i++) slotAssignments[i] = null;

    _renderSlots();
    _renderGrammarPicker();
    _updateStartButton();
  }

  function _renderSlots() {
    const slotsContainer = document.getElementById('bonus-slots');
    const slotEls = slotsContainer.querySelectorAll('.bonus-slot');

    slotEls.forEach((el, i) => {
      const grammar = slotAssignments[i];
      el.classList.remove('selected-slot', 'has-topic', 'empty');

      if (grammar) {
        el.classList.add('has-topic');
        if (i === 0) {
          el.querySelector('.slot-topic').textContent = 'Wortstellung';
          el.querySelector('.slot-grammar').textContent = `+ ${grammar}`;
        } else {
          el.querySelector('.slot-topic').textContent = grammar;
          el.querySelector('.slot-grammar').textContent = '';
        }
      } else {
        el.classList.add('empty');
        if (i === 0) {
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

  // Slot click handlers
  document.querySelectorAll('.bonus-slot').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.slot);

      // If a grammar topic is selected, assign it to this slot
      if (selectedGrammar) {
        // Remove grammar from any other slot it was in
        for (let i = 0; i < 5; i++) {
          if (slotAssignments[i] === selectedGrammar) slotAssignments[i] = null;
        }
        slotAssignments[idx] = selectedGrammar;
        selectedGrammar = null;
        selectedSlotIdx = null;
        _renderSlots();
        _renderGrammarPicker();
        _updateStartButton();
        return;
      }

      // Otherwise toggle slot selection (to clear it)
      if (selectedSlotIdx === idx) {
        // Clear this slot
        slotAssignments[idx] = null;
        selectedSlotIdx = null;
      } else {
        selectedSlotIdx = idx;
      }
      _renderSlots();
      _renderGrammarPicker();
      _updateStartButton();
    });
  });

  function _renderGrammarPicker() {
    const picker = document.getElementById('grammar-picker');
    picker.innerHTML = '';

    const usedTopics = slotAssignments.filter(Boolean);

    GRAMMAR_TOPICS.forEach(topic => {
      const tag = document.createElement('button');
      tag.className = 'grammar-tag';
      tag.textContent = topic;

      if (usedTopics.includes(topic)) {
        tag.classList.add('used');
      }

      if (selectedGrammar === topic) {
        tag.classList.add('selected-grammar');
      }

      tag.addEventListener('click', () => {
        if (usedTopics.includes(topic)) return;

        if (selectedGrammar === topic) {
          selectedGrammar = null;
        } else {
          selectedGrammar = topic;
        }

        // If a slot is selected, auto-assign
        if (selectedGrammar && selectedSlotIdx !== null) {
          for (let i = 0; i < 5; i++) {
            if (slotAssignments[i] === selectedGrammar) slotAssignments[i] = null;
          }
          slotAssignments[selectedSlotIdx] = selectedGrammar;
          selectedGrammar = null;
          selectedSlotIdx = null;
        }

        _renderSlots();
        _renderGrammarPicker();
        _updateStartButton();
      });

      picker.appendChild(tag);
    });
  }

  function _updateStartButton() {
    const allFilled = slotAssignments.every(s => s !== null);
    document.getElementById('start-btn').disabled = !allFilled;
  }

  // ===== START GAME =====
  document.getElementById('start-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name');
    const playerName = nameInput.value.trim() || 'Spieler';
    localStorage.setItem('morskoy_player_name', playerName);

    // Build slot configs
    const slotConfigs = BONUS_SLOTS.map((slotDef, i) => ({
      slotDef,
      grammarTopic: slotAssignments[i],
    }));

    const settings = {
      isCreepy: document.getElementById('creepy-mode').checked,
      monsterCount: parseInt(document.getElementById('monster-count').value),
      difficulty: document.getElementById('difficulty').value,
      gameMode: document.getElementById('game-mode').value,
      langLevel: selectedLevel,
      playerName,
      level: 1,
      lexicalTopic: selectedLexical,
      slotConfigs,
    };

    const hasPlayed = localStorage.getItem('morskoy_tutorial_seen');
    if (!hasPlayed) {
      localStorage.setItem('morskoy_tutorial_seen', '1');
      _showTutorial(() => _startGame(settings));
    } else {
      _startGame(settings);
    }
  });

  function _startGame(settings) {
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    game.init(settings);
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

  // ===== DIRECTION BUTTONS =====
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      game.movePlayer(btn.dataset.dir);
    });
  });

  // ===== IN-GAME KEYBOARD =====
  document.addEventListener('keydown', (e) => {
    if (game.state === 'direction_select') {
      const keyMap = {
        'ArrowUp': 'up', 'w': 'up', 'W': 'up',
        'ArrowDown': 'down', 's': 'down', 'S': 'down',
        'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
        'ArrowRight': 'right', 'd': 'right', 'D': 'right',
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        game.movePlayer(keyMap[e.key]);
      }
    }

    if (game.state === 'topic_select') {
      // 1-5 selects corresponding slot
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < game.slotConfigs.length) {
        game.selectTopic(game.slotConfigs[idx].slotDef.id);
      }
    }

    if (game.state === 'question') {
      const optBtns = document.querySelectorAll('#question-options .option-btn');
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < optBtns.length && !optBtns[idx].disabled) {
        optBtns[idx].click();
      }
    }
  });

  // ===== PINCH TO RESIZE QUESTION PANEL (mobile) =====
  (function() {
    const panel = document.getElementById('question-panel');
    let baseScale = 1;
    let startDist = 0;
    let startScale = 1;
    const MIN_SCALE = 0.6;
    const MAX_SCALE = 1.4;

    // Persist scale in sessionStorage
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

  // ===== WIN/LOSE SCREENS =====
  document.getElementById('win-next').addEventListener('click', () => game.nextLevel());

  document.getElementById('win-restart').addEventListener('click', () => {
    game.destroy();
    game.restart();
    document.getElementById('win-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
    showStep(1);
  });

  document.getElementById('lose-restart').addEventListener('click', () => {
    game.destroy();
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    game.init({
      isCreepy: game.isCreepy,
      monsterCount: game.monsterCountSetting,
      difficulty: game.difficulty,
      gameMode: game.gameMode,
      langLevel: game.langLevel,
      playerName: game.playerName,
      level: game.currentLevel,
      lexicalTopic: game.lexicalTopic,
      slotConfigs: game.slotConfigs,
    });
  });

  document.getElementById('lose-menu').addEventListener('click', () => {
    game.destroy();
    game.restart();
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
    showStep(1);
  });

  // ===== LEADERBOARD =====
  document.getElementById('leaderboard-btn').addEventListener('click', () => {
    game.leaderboard.render();
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('leaderboard-screen').classList.add('active');
  });

  document.getElementById('leaderboard-back').addEventListener('click', () => {
    document.getElementById('leaderboard-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
  });
});
