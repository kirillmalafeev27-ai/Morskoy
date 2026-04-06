// Entry point - menu, tutorial, leaderboard, game initialization

const game = new Game();

// Restore player name from localStorage
const savedName = localStorage.getItem('morskoy_player_name');
if (savedName) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('player-name').value = savedName;
  });
}

document.addEventListener('DOMContentLoaded', () => {

  // ===== START GAME =====
  document.getElementById('start-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name');
    const playerName = nameInput.value.trim() || 'Spieler';

    // Save name
    localStorage.setItem('morskoy_player_name', playerName);

    const settings = {
      isCreepy: document.getElementById('creepy-mode').checked,
      monsterCount: parseInt(document.getElementById('monster-count').value),
      langLevel: document.getElementById('lang-level').value,
      playerName: playerName,
      level: 1,
    };

    // Show tutorial on first play
    const hasPlayed = localStorage.getItem('morskoy_tutorial_seen');
    if (!hasPlayed) {
      localStorage.setItem('morskoy_tutorial_seen', '1');
      _showTutorial(() => {
        _startGame(settings);
      });
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

  // ===== TOPIC BUTTONS =====
  document.querySelectorAll('.topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      game.selectTopic(btn.dataset.topic);
    });
  });

  // ===== DIRECTION BUTTONS =====
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      game.movePlayer(btn.dataset.dir);
    });
  });

  // ===== KEYBOARD =====
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
      const topicMap = {
        '1': 'wortstellung', '2': 'artikel', '3': 'konjugation',
        '4': 'nebensaetze', '5': 'konjunktiv',
      };
      if (topicMap[e.key]) {
        game.selectTopic(topicMap[e.key]);
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

  // ===== WIN SCREEN =====
  document.getElementById('win-next').addEventListener('click', () => {
    game.nextLevel();
  });

  document.getElementById('win-restart').addEventListener('click', () => {
    game.destroy();
    game.restart();
    document.getElementById('win-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
  });

  // ===== LOSE SCREEN =====
  document.getElementById('lose-restart').addEventListener('click', () => {
    // Retry same level
    game.destroy();
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    game.init({
      isCreepy: game.isCreepy,
      monsterCount: game.monsterCountSetting,
      langLevel: game.langLevel,
      playerName: game.playerName,
      level: game.currentLevel,
    });
  });

  document.getElementById('lose-menu').addEventListener('click', () => {
    game.destroy();
    game.restart();
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
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
