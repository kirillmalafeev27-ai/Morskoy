// Entry point - menu handling and game initialization

const game = new Game();

document.addEventListener('DOMContentLoaded', () => {
  // Start button
  document.getElementById('start-btn').addEventListener('click', () => {
    const settings = {
      isCreepy: document.getElementById('creepy-mode').checked,
      monsterCount: parseInt(document.getElementById('monster-count').value),
      langLevel: document.getElementById('lang-level').value,
    };

    // Switch screens
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    game.init(settings);
  });

  // Topic buttons
  document.querySelectorAll('.topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      game.selectTopic(btn.dataset.topic);
    });
  });

  // Direction buttons
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      game.movePlayer(btn.dataset.dir);
    });
  });

  // Keyboard controls for direction
  document.addEventListener('keydown', (e) => {
    if (game.state === 'direction_select') {
      const keyMap = {
        'ArrowUp': 'up', 'w': 'up', 'W': 'up', 'ц': 'up', 'Ц': 'up',
        'ArrowDown': 'down', 's': 'down', 'S': 'down', 'ы': 'down', 'Ы': 'down',
        'ArrowLeft': 'left', 'a': 'left', 'A': 'left', 'ф': 'left', 'Ф': 'left',
        'ArrowRight': 'right', 'd': 'right', 'D': 'right', 'в': 'right', 'В': 'right',
      };
      if (keyMap[e.key]) {
        game.movePlayer(keyMap[e.key]);
      }
    }

    // Quick topic selection with number keys
    if (game.state === 'topic_select') {
      const topicMap = {
        '1': 'wortstellung',
        '2': 'artikel',
        '3': 'konjugation',
        '4': 'nebensaetze',
        '5': 'konjunktiv',
      };
      if (topicMap[e.key]) {
        game.selectTopic(topicMap[e.key]);
      }
    }

    // Quick answer selection with number keys
    if (game.state === 'question') {
      const optBtns = document.querySelectorAll('#question-options .option-btn');
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < optBtns.length && !optBtns[idx].disabled) {
        optBtns[idx].click();
      }
    }
  });

  // Restart buttons
  document.getElementById('win-restart').addEventListener('click', () => {
    game.destroy();
    document.getElementById('win-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
  });

  document.getElementById('lose-restart').addEventListener('click', () => {
    game.destroy();
    document.getElementById('lose-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
  });
});
