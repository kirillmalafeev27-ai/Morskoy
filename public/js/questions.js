// Grammar question system
// Topics with difficulty and bonuses
// Questions are generated from templates per level

const TOPICS = {
  wortstellung: {
    name: 'Wortstellung',
    nameRu: 'Порядок слов',
    bonus: 'move1',
    bonusLabel: '1 ход',
    difficulty: 1,
  },
  artikel: {
    name: 'Artikel & Deklination',
    nameRu: 'Артикли и склонение',
    bonus: 'vision',
    bonusLabel: 'Расш. зрение (3 хода)',
    difficulty: 2,
  },
  konjugation: {
    name: 'Konjugation',
    nameRu: 'Спряжение глаголов',
    bonus: 'move2',
    bonusLabel: '2 хода',
    difficulty: 3,
  },
  nebensaetze: {
    name: 'Nebensätze',
    nameRu: 'Придаточные предложения',
    bonus: 'bait',
    bonusLabel: 'Приманка для монстра',
    difficulty: 4,
  },
  konjunktiv: {
    name: 'Konjunktiv II',
    nameRu: 'Сослагательное наклонение',
    bonus: 'reveal',
    bonusLabel: 'Показать монстра',
    difficulty: 5,
  }
};

// Question bank organized by topic and level
const QUESTION_BANK = {
  wortstellung: {
    A1: [
      {
        text: 'Составьте правильное предложение:',
        display: 'heute / ich / gehe / in die Schule',
        options: ['Ich gehe heute in die Schule.', 'Heute ich gehe in die Schule.', 'Gehe ich heute in die Schule.', 'In die Schule heute ich gehe.'],
        correct: 0
      },
      {
        text: 'Какой порядок слов правильный?',
        display: 'morgen / wir / fahren / nach Berlin',
        options: ['Morgen fahren wir nach Berlin.', 'Morgen wir fahren nach Berlin.', 'Wir morgen fahren nach Berlin.', 'Nach Berlin morgen wir fahren.'],
        correct: 0
      },
      {
        text: 'Выберите правильный порядок слов:',
        display: 'am Montag / er / hat / Deutsch',
        options: ['Am Montag hat er Deutsch.', 'Am Montag er hat Deutsch.', 'Er am Montag Deutsch hat.', 'Hat er am Montag Deutsch.'],
        correct: 0
      },
      {
        text: 'Расположите слова правильно:',
        display: 'gern / sie / liest / Bücher',
        options: ['Sie liest gern Bücher.', 'Gern sie liest Bücher.', 'Bücher liest sie gern.', 'Sie gern liest Bücher.'],
        correct: 0
      },
    ],
    A2: [
      {
        text: 'Составьте правильное предложение:',
        display: 'gestern / ich / habe / einen Film / gesehen',
        options: ['Gestern habe ich einen Film gesehen.', 'Gestern ich habe einen Film gesehen.', 'Ich gestern habe einen Film gesehen.', 'Gesehen habe ich gestern einen Film.'],
        correct: 0
      },
      {
        text: 'Какой порядок слов верный?',
        display: 'letztes Jahr / sie / ist / nach Spanien / geflogen',
        options: ['Letztes Jahr ist sie nach Spanien geflogen.', 'Letztes Jahr sie ist nach Spanien geflogen.', 'Sie letztes Jahr ist nach Spanien geflogen.', 'Geflogen ist sie letztes Jahr nach Spanien.'],
        correct: 0
      },
      {
        text: 'Выберите правильный вариант:',
        display: 'leider / ich / kann / nicht / kommen',
        options: ['Leider kann ich nicht kommen.', 'Leider ich kann nicht kommen.', 'Ich leider kann nicht kommen.', 'Kann ich leider nicht kommen.'],
        correct: 0
      },
    ],
    B1: [
      {
        text: 'Составьте предложение с правильным порядком слов:',
        display: 'trotzdem / er / hat / die Prüfung / bestanden',
        options: ['Trotzdem hat er die Prüfung bestanden.', 'Trotzdem er hat die Prüfung bestanden.', 'Er trotzdem hat die Prüfung bestanden.', 'Die Prüfung hat er trotzdem bestanden.'],
        correct: 0
      },
      {
        text: 'Какой порядок слов верный?',
        display: 'deshalb / wir / müssen / früh / aufstehen',
        options: ['Deshalb müssen wir früh aufstehen.', 'Deshalb wir müssen früh aufstehen.', 'Wir deshalb müssen früh aufstehen.', 'Aufstehen müssen wir deshalb früh.'],
        correct: 0
      },
    ],
    B2: [
      {
        text: 'Выберите правильный порядок слов:',
        display: 'Nicht nur ... sondern auch / er / spricht / Deutsch / Französisch',
        options: ['Nicht nur spricht er Deutsch, sondern auch Französisch.', 'Er spricht nicht nur Deutsch, sondern auch Französisch.', 'Nicht nur er spricht Deutsch, sondern auch Französisch.', 'Er nicht nur Deutsch spricht, sondern auch Französisch.'],
        correct: 1
      },
    ],
  },

  artikel: {
    A1: [
      { text: 'Выберите правильный артикль:', display: '___ Hund ist groß.', options: ['Der', 'Die', 'Das', 'Den'], correct: 0 },
      { text: 'Какой артикль подходит?', display: '___ Katze schläft.', options: ['Die', 'Der', 'Das', 'Dem'], correct: 0 },
      { text: 'Заполните артикль:', display: '___ Kind spielt.', options: ['Das', 'Der', 'Die', 'Den'], correct: 0 },
      { text: 'Выберите правильный артикль:', display: 'Ich sehe ___ Mann.', options: ['den', 'der', 'dem', 'des'], correct: 0 },
      { text: 'Какой артикль верный?', display: 'Das ist ___ Buch.', options: ['ein', 'eine', 'einer', 'einem'], correct: 0 },
    ],
    A2: [
      { text: 'Выберите правильную форму:', display: 'Ich gebe ___ Frau das Buch.', options: ['der', 'die', 'den', 'das'], correct: 0 },
      { text: 'Заполните:', display: 'Er hilft ___ Kind.', options: ['dem', 'das', 'den', 'der'], correct: 0 },
      { text: 'Какой падеж?', display: 'Wir fahren mit ___ Bus.', options: ['dem', 'den', 'der', 'das'], correct: 0 },
      { text: 'Выберите верный артикль:', display: 'Das Haus ___ Lehrers ist alt.', options: ['des', 'dem', 'den', 'der'], correct: 0 },
    ],
    B1: [
      { text: 'Выберите правильное окончание:', display: 'der gut___ Mann', options: ['-e', '-er', '-en', '-em'], correct: 0 },
      { text: 'Заполните окончание:', display: 'mit einem neu___ Auto', options: ['-en', '-em', '-er', '-es'], correct: 0 },
      { text: 'Какое окончание верное?', display: 'wegen des schlecht___ Wetters', options: ['-en', '-em', '-er', '-es'], correct: 0 },
    ],
    B2: [
      { text: 'Выберите правильную форму:', display: '___ der Tatsache, dass es regnet, gehen wir spazieren.', options: ['Trotz', 'Wegen', 'Aufgrund', 'Mangels'], correct: 0 },
    ],
  },

  konjugation: {
    A1: [
      { text: 'Проспрягайте глагол:', display: 'Er ___ (gehen) in die Schule.', options: ['geht', 'gehen', 'gehst', 'gehe'], correct: 0 },
      { text: 'Выберите правильную форму:', display: 'Wir ___ (spielen) Fußball.', options: ['spielen', 'spielt', 'spielst', 'spiele'], correct: 0 },
      { text: 'Заполните глагол:', display: 'Du ___ (haben) ein Buch.', options: ['hast', 'hat', 'haben', 'habe'], correct: 0 },
      { text: 'Какая форма верная?', display: 'Ich ___ (sein) müde.', options: ['bin', 'bist', 'ist', 'sind'], correct: 0 },
      { text: 'Проспрягайте:', display: 'Ihr ___ (essen) Pizza.', options: ['esst', 'isst', 'essen', 'esse'], correct: 0 },
    ],
    A2: [
      { text: 'Поставьте в Perfekt:', display: 'Er ___ nach Hause ___ (gehen).', options: ['ist ... gegangen', 'hat ... gegangen', 'ist ... gegangt', 'hat ... gegeht'], correct: 0 },
      { text: 'Выберите правильную форму Perfekt:', display: 'Wir ___ einen Kuchen ___ (backen).', options: ['haben ... gebacken', 'sind ... gebacken', 'haben ... gebackt', 'sind ... gebackt'], correct: 0 },
      { text: 'Заполните в Präteritum:', display: 'Er ___ (kommen) gestern.', options: ['kam', 'komm', 'kamt', 'kommte'], correct: 0 },
    ],
    B1: [
      { text: 'Поставьте в Plusquamperfekt:', display: 'Nachdem er ___ (ankommen), rief er mich an.', options: ['angekommen war', 'ankam', 'angekommen ist', 'ankommen war'], correct: 0 },
      { text: 'Выберите форму Futur I:', display: 'Sie ___ morgen ___ (fliegen).', options: ['wird ... fliegen', 'wirst ... fliegen', 'werden ... fliegen', 'fliegt ... werden'], correct: 0 },
    ],
    B2: [
      { text: 'Поставьте в Passiv:', display: 'Das Buch ___ von vielen Leuten ___ (lesen).', options: ['wird ... gelesen', 'ist ... gelesen', 'wurde ... gelesen', 'wird ... lesen'], correct: 0 },
    ],
  },

  nebensaetze: {
    A2: [
      { text: 'Заполните союз и порядок слов:', display: 'Ich bleibe zu Hause, ___ ich krank bin.', options: ['weil', 'denn', 'deshalb', 'trotzdem'], correct: 0 },
      { text: 'Выберите правильный вариант:', display: 'Er sagt, ___ er morgen kommt.', options: ['dass', 'das', 'weil', 'wenn'], correct: 0 },
      { text: 'Какой союз подходит?', display: '___ es regnet, bleiben wir zu Hause.', options: ['Wenn', 'Weil', 'Dass', 'Ob'], correct: 0 },
    ],
    B1: [
      { text: 'Выберите правильное придаточное:', display: 'Das ist der Mann, ___ ich gestern gesehen habe.', options: ['den', 'der', 'dem', 'dessen'], correct: 0 },
      { text: 'Заполните:', display: 'Ich weiß nicht, ___ er heute kommt.', options: ['ob', 'dass', 'weil', 'wenn'], correct: 0 },
      { text: 'Какой вариант верный?', display: 'Die Stadt, ___ ___ ich wohne, ist schön.', options: ['in der', 'in die', 'wo der', 'in dem'], correct: 0 },
      { text: 'Выберите правильный порядок слов:', display: 'Ich hoffe, dass ___', options: ['er bald kommt.', 'er kommt bald.', 'bald er kommt.', 'kommt er bald.'], correct: 0 },
    ],
    B2: [
      { text: 'Заполните:', display: '___ mehr er lernt, ___ besser werden seine Noten.', options: ['Je ... desto', 'Wenn ... dann', 'Ob ... oder', 'Weder ... noch'], correct: 0 },
      { text: 'Выберите правильный союз:', display: 'Er kam nicht zur Arbeit, ___ er krank war.', options: ['da', 'obwohl', 'damit', 'indem'], correct: 0 },
    ],
    A1: [
      { text: 'Выберите правильный союз:', display: 'Ich trinke Kaffee ___ ich müde bin.', options: ['wenn', 'wann', 'als', 'ob'], correct: 0 },
    ],
  },

  konjunktiv: {
    A2: [
      { text: 'Выберите вежливую форму:', display: 'Ich ___ gern ein Wasser.', options: ['hätte', 'habe', 'hatte', 'hat'], correct: 0 },
      { text: 'Какая форма выражает желание?', display: '___ du mir helfen?', options: ['Könntest', 'Kannst', 'Konntest', 'Könnt'], correct: 0 },
    ],
    B1: [
      { text: 'Поставьте в Konjunktiv II:', display: 'Wenn ich reich ___ (sein), ___ ich ein Haus kaufen.', options: ['wäre ... würde', 'bin ... werde', 'sei ... will', 'war ... wurde'], correct: 0 },
      { text: 'Выберите правильный Konjunktiv II:', display: 'Er tat so, als ___ er alles (wissen).', options: ['wüsste', 'weiß', 'wusste', 'gewusst'], correct: 0 },
      { text: 'Заполните:', display: 'Wenn ich Zeit ___, ___ ich ins Kino gehen.', options: ['hätte ... würde', 'habe ... werde', 'hatte ... wurde', 'habe ... würde'], correct: 0 },
    ],
    B2: [
      { text: 'Выберите правильный вариант:', display: 'Hätte ich das gewusst, ___ ich anders gehandelt.', options: ['hätte', 'habe', 'würde', 'wäre'], correct: 0 },
      { text: 'Konjunktiv II в прошедшем:', display: 'Wenn er früher ___ (kommen), ___ wir pünktlich gewesen.', options: ['gekommen wäre ... wären', 'kam ... waren', 'gekommen ist ... sind', 'kommen würde ... werden'], correct: 0 },
    ],
    A1: [
      { text: 'Какая форма вежливее?', display: 'Ich ___ gern einen Tee.', options: ['möchte', 'will', 'muss', 'soll'], correct: 0 },
    ],
  }
};

class QuestionManager {
  constructor(level) {
    this.level = level || 'A2';
    this.usedQuestions = new Set();
  }

  setLevel(level) {
    this.level = level;
    this.usedQuestions.clear();
  }

  getQuestion(topicKey) {
    const topicBank = QUESTION_BANK[topicKey];
    if (!topicBank) return null;

    // Try exact level, then fall back to adjacent levels
    const levelOrder = this._getLevelFallback(this.level);

    for (const level of levelOrder) {
      const questions = topicBank[level];
      if (!questions || questions.length === 0) continue;

      // Find unused question
      const available = questions.filter((_, i) => !this.usedQuestions.has(`${topicKey}_${level}_${i}`));

      if (available.length > 0) {
        const idx = Math.floor(Math.random() * available.length);
        const originalIdx = questions.indexOf(available[idx]);
        this.usedQuestions.add(`${topicKey}_${level}_${originalIdx}`);

        const q = available[idx];
        return {
          topic: topicKey,
          topicInfo: TOPICS[topicKey],
          text: q.text,
          display: q.display,
          options: this._shuffleOptions(q.options, q.correct),
          level: level
        };
      }
    }

    // All used, reset and try again
    this.usedQuestions.clear();
    return this.getQuestion(topicKey);
  }

  _getLevelFallback(level) {
    const levels = ['A1', 'A2', 'B1', 'B2'];
    const idx = levels.indexOf(level);
    const result = [level];
    // Try levels around current
    for (let d = 1; d < levels.length; d++) {
      if (idx - d >= 0) result.push(levels[idx - d]);
      if (idx + d < levels.length) result.push(levels[idx + d]);
    }
    return result;
  }

  _shuffleOptions(options, correctIdx) {
    const correctAnswer = options[correctIdx];
    const shuffled = [...options];
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const newCorrectIdx = shuffled.indexOf(correctAnswer);
    return { options: shuffled, correctIndex: newCorrectIdx };
  }
}
