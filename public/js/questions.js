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
      { text: 'Составьте правильное предложение:', display: 'heute / ich / gehe / in die Schule', options: ['Ich gehe heute in die Schule.', 'Heute ich gehe in die Schule.', 'Gehe ich heute in die Schule.', 'In die Schule heute ich gehe.'], correct: 0 },
      { text: 'Какой порядок слов правильный?', display: 'morgen / wir / fahren / nach Berlin', options: ['Morgen fahren wir nach Berlin.', 'Morgen wir fahren nach Berlin.', 'Wir morgen fahren nach Berlin.', 'Nach Berlin morgen wir fahren.'], correct: 0 },
      { text: 'Выберите правильный порядок слов:', display: 'am Montag / er / hat / Deutsch', options: ['Am Montag hat er Deutsch.', 'Am Montag er hat Deutsch.', 'Er am Montag Deutsch hat.', 'Hat er am Montag Deutsch.'], correct: 0 },
      { text: 'Расположите слова правильно:', display: 'gern / sie / liest / Bücher', options: ['Sie liest gern Bücher.', 'Gern sie liest Bücher.', 'Bücher liest sie gern.', 'Sie gern liest Bücher.'], correct: 0 },
      { text: 'Составьте предложение:', display: 'oft / wir / gehen / ins Kino', options: ['Wir gehen oft ins Kino.', 'Oft wir gehen ins Kino.', 'Ins Kino oft wir gehen.', 'Gehen wir oft ins Kino.'], correct: 0 },
      { text: 'Какой вариант верный?', display: 'jetzt / ich / mache / Hausaufgaben', options: ['Jetzt mache ich Hausaufgaben.', 'Jetzt ich mache Hausaufgaben.', 'Ich jetzt mache Hausaufgaben.', 'Hausaufgaben ich jetzt mache.'], correct: 0 },
      { text: 'Выберите правильное предложение:', display: 'immer / du / trinkst / Kaffee', options: ['Du trinkst immer Kaffee.', 'Immer du trinkst Kaffee.', 'Trinkst du immer Kaffee.', 'Kaffee du immer trinkst.'], correct: 0 },
    ],
    A2: [
      { text: 'Составьте правильное предложение:', display: 'gestern / ich / habe / einen Film / gesehen', options: ['Gestern habe ich einen Film gesehen.', 'Gestern ich habe einen Film gesehen.', 'Ich gestern habe einen Film gesehen.', 'Gesehen habe ich gestern einen Film.'], correct: 0 },
      { text: 'Какой порядок слов верный?', display: 'letztes Jahr / sie / ist / nach Spanien / geflogen', options: ['Letztes Jahr ist sie nach Spanien geflogen.', 'Letztes Jahr sie ist nach Spanien geflogen.', 'Sie letztes Jahr ist nach Spanien geflogen.', 'Geflogen ist sie letztes Jahr nach Spanien.'], correct: 0 },
      { text: 'Выберите правильный вариант:', display: 'leider / ich / kann / nicht / kommen', options: ['Leider kann ich nicht kommen.', 'Leider ich kann nicht kommen.', 'Ich leider kann nicht kommen.', 'Kann ich leider nicht kommen.'], correct: 0 },
      { text: 'Расположите слова:', display: 'danach / wir / sind / ins Restaurant / gegangen', options: ['Danach sind wir ins Restaurant gegangen.', 'Danach wir sind ins Restaurant gegangen.', 'Wir danach sind ins Restaurant gegangen.', 'Gegangen sind wir danach ins Restaurant.'], correct: 0 },
      { text: 'Какой порядок верный?', display: 'zum Glück / er / hat / den Zug / erreicht', options: ['Zum Glück hat er den Zug erreicht.', 'Zum Glück er hat den Zug erreicht.', 'Er zum Glück hat den Zug erreicht.', 'Den Zug hat er zum Glück erreicht.'], correct: 0 },
      { text: 'Составьте предложение:', display: 'am Wochenende / sie / hat / ihre Freundin / besucht', options: ['Am Wochenende hat sie ihre Freundin besucht.', 'Am Wochenende sie hat ihre Freundin besucht.', 'Sie am Wochenende hat ihre Freundin besucht.', 'Besucht hat sie am Wochenende ihre Freundin.'], correct: 0 },
    ],
    B1: [
      { text: 'Составьте предложение с правильным порядком слов:', display: 'trotzdem / er / hat / die Prüfung / bestanden', options: ['Trotzdem hat er die Prüfung bestanden.', 'Trotzdem er hat die Prüfung bestanden.', 'Er trotzdem hat die Prüfung bestanden.', 'Die Prüfung hat er trotzdem bestanden.'], correct: 0 },
      { text: 'Какой порядок слов верный?', display: 'deshalb / wir / müssen / früh / aufstehen', options: ['Deshalb müssen wir früh aufstehen.', 'Deshalb wir müssen früh aufstehen.', 'Wir deshalb müssen früh aufstehen.', 'Aufstehen müssen wir deshalb früh.'], correct: 0 },
      { text: 'Выберите верный порядок:', display: 'außerdem / ich / möchte / Deutsch / lernen', options: ['Außerdem möchte ich Deutsch lernen.', 'Außerdem ich möchte Deutsch lernen.', 'Ich außerdem möchte Deutsch lernen.', 'Lernen möchte ich außerdem Deutsch.'], correct: 0 },
      { text: 'Составьте предложение:', display: 'allerdings / man / muss / vorsichtig / sein', options: ['Allerdings muss man vorsichtig sein.', 'Allerdings man muss vorsichtig sein.', 'Man allerdings muss vorsichtig sein.', 'Vorsichtig muss man allerdings sein.'], correct: 0 },
    ],
    B2: [
      { text: 'Выберите правильный порядок слов:', display: 'Nicht nur ... sondern auch / er / spricht / Deutsch / Französisch', options: ['Nicht nur spricht er Deutsch, sondern auch Französisch.', 'Er spricht nicht nur Deutsch, sondern auch Französisch.', 'Nicht nur er spricht Deutsch, sondern auch Französisch.', 'Er nicht nur Deutsch spricht, sondern auch Französisch.'], correct: 1 },
      { text: 'Какой вариант грамматически верен?', display: 'Kaum / er / hatte / das Haus / verlassen / es / begann / zu regnen', options: ['Kaum hatte er das Haus verlassen, begann es zu regnen.', 'Kaum er hatte das Haus verlassen, begann es zu regnen.', 'Kaum hat er das Haus verlassen, es begann zu regnen.', 'Kaum verlassen hatte er das Haus, begann es zu regnen.'], correct: 0 },
      { text: 'Выберите правильную конструкцию:', display: 'Je / mehr / ich / lerne / desto / besser / verstehe / ich', options: ['Je mehr ich lerne, desto besser verstehe ich.', 'Je ich mehr lerne, desto ich besser verstehe.', 'Je mehr lerne ich, desto besser ich verstehe.', 'Mehr je ich lerne, besser desto ich verstehe.'], correct: 0 },
    ],
  },

  artikel: {
    A1: [
      { text: 'Выберите правильный артикль:', display: '___ Hund ist groß.', options: ['Der', 'Die', 'Das', 'Den'], correct: 0 },
      { text: 'Какой артикль подходит?', display: '___ Katze schläft.', options: ['Die', 'Der', 'Das', 'Dem'], correct: 0 },
      { text: 'Заполните артикль:', display: '___ Kind spielt.', options: ['Das', 'Der', 'Die', 'Den'], correct: 0 },
      { text: 'Выберите правильный артикль:', display: 'Ich sehe ___ Mann.', options: ['den', 'der', 'dem', 'des'], correct: 0 },
      { text: 'Какой артикль верный?', display: 'Das ist ___ Buch.', options: ['ein', 'eine', 'einer', 'einem'], correct: 0 },
      { text: 'Выберите артикль:', display: '___ Sonne scheint.', options: ['Die', 'Der', 'Das', 'Den'], correct: 0 },
      { text: 'Какой артикль?', display: '___ Haus ist alt.', options: ['Das', 'Der', 'Die', 'Dem'], correct: 0 },
    ],
    A2: [
      { text: 'Выберите правильную форму:', display: 'Ich gebe ___ Frau das Buch.', options: ['der', 'die', 'den', 'das'], correct: 0 },
      { text: 'Заполните:', display: 'Er hilft ___ Kind.', options: ['dem', 'das', 'den', 'der'], correct: 0 },
      { text: 'Какой падеж?', display: 'Wir fahren mit ___ Bus.', options: ['dem', 'den', 'der', 'das'], correct: 0 },
      { text: 'Выберите верный артикль:', display: 'Das Haus ___ Lehrers ist alt.', options: ['des', 'dem', 'den', 'der'], correct: 0 },
      { text: 'Заполните артикль:', display: 'Sie wartet auf ___ Bus.', options: ['den', 'dem', 'der', 'das'], correct: 0 },
      { text: 'Какой артикль верный?', display: 'Er geht zu ___ Arzt.', options: ['dem', 'den', 'der', 'das'], correct: 0 },
    ],
    B1: [
      { text: 'Выберите правильное окончание:', display: 'der gut___ Mann', options: ['-e', '-er', '-en', '-em'], correct: 0 },
      { text: 'Заполните окончание:', display: 'mit einem neu___ Auto', options: ['-en', '-em', '-er', '-es'], correct: 0 },
      { text: 'Какое окончание верное?', display: 'wegen des schlecht___ Wetters', options: ['-en', '-em', '-er', '-es'], correct: 0 },
      { text: 'Выберите окончание:', display: 'die klein___ Kinder spielen', options: ['-en', '-e', '-er', '-em'], correct: 0 },
      { text: 'Заполните:', display: 'ein alt___ Freund von mir', options: ['-er', '-e', '-en', '-em'], correct: 0 },
    ],
    B2: [
      { text: 'Выберите правильную форму:', display: '___ der Tatsache, dass es regnet, gehen wir spazieren.', options: ['Trotz', 'Wegen', 'Aufgrund', 'Mangels'], correct: 0 },
      { text: 'Какой предлог с Genitiv?', display: '___ des Regens blieben wir zu Hause.', options: ['Wegen', 'Mit', 'Von', 'Bei'], correct: 0 },
    ],
  },

  konjugation: {
    A1: [
      { text: 'Проспрягайте глагол:', display: 'Er ___ (gehen) in die Schule.', options: ['geht', 'gehen', 'gehst', 'gehe'], correct: 0 },
      { text: 'Выберите правильную форму:', display: 'Wir ___ (spielen) Fußball.', options: ['spielen', 'spielt', 'spielst', 'spiele'], correct: 0 },
      { text: 'Заполните глагол:', display: 'Du ___ (haben) ein Buch.', options: ['hast', 'hat', 'haben', 'habe'], correct: 0 },
      { text: 'Какая форма верная?', display: 'Ich ___ (sein) müde.', options: ['bin', 'bist', 'ist', 'sind'], correct: 0 },
      { text: 'Проспрягайте:', display: 'Ihr ___ (essen) Pizza.', options: ['esst', 'isst', 'essen', 'esse'], correct: 0 },
      { text: 'Выберите форму глагола:', display: 'Sie (она) ___ (lesen) ein Buch.', options: ['liest', 'lest', 'lesen', 'lese'], correct: 0 },
      { text: 'Заполните:', display: 'Er ___ (sprechen) Deutsch.', options: ['spricht', 'sprecht', 'sprechen', 'sprechst'], correct: 0 },
    ],
    A2: [
      { text: 'Поставьте в Perfekt:', display: 'Er ___ nach Hause ___ (gehen).', options: ['ist ... gegangen', 'hat ... gegangen', 'ist ... gegangt', 'hat ... gegeht'], correct: 0 },
      { text: 'Выберите правильную форму Perfekt:', display: 'Wir ___ einen Kuchen ___ (backen).', options: ['haben ... gebacken', 'sind ... gebacken', 'haben ... gebackt', 'sind ... gebackt'], correct: 0 },
      { text: 'Заполните в Präteritum:', display: 'Er ___ (kommen) gestern.', options: ['kam', 'komm', 'kamt', 'kommte'], correct: 0 },
      { text: 'Perfekt:', display: 'Sie ___ gestern viel ___ (arbeiten).', options: ['hat ... gearbeitet', 'ist ... gearbeitet', 'hat ... gearbeiten', 'ist ... gearbeit'], correct: 0 },
      { text: 'Выберите Perfekt:', display: 'Wir ___ ins Kino ___ (gehen).', options: ['sind ... gegangen', 'haben ... gegangen', 'sind ... gegeht', 'haben ... gegangt'], correct: 0 },
      { text: 'Präteritum:', display: 'Sie (они) ___ (fahren) nach München.', options: ['fuhren', 'fahrten', 'fuhrten', 'fährten'], correct: 0 },
    ],
    B1: [
      { text: 'Поставьте в Plusquamperfekt:', display: 'Nachdem er ___ (ankommen), rief er mich an.', options: ['angekommen war', 'ankam', 'angekommen ist', 'ankommen war'], correct: 0 },
      { text: 'Выберите форму Futur I:', display: 'Sie ___ morgen ___ (fliegen).', options: ['wird ... fliegen', 'wirst ... fliegen', 'werden ... fliegen', 'fliegt ... werden'], correct: 0 },
      { text: 'Заполните Plusquamperfekt:', display: 'Bevor ich ___ (essen), hatte ich eingekauft.', options: ['gegessen hatte', 'aß', 'gegessen habe', 'esse'], correct: 0 },
      { text: 'Futur I:', display: 'Wir ___ nächstes Jahr nach Japan ___ (reisen).', options: ['werden ... reisen', 'wird ... reisen', 'wirst ... reisen', 'werdet ... reisen'], correct: 0 },
    ],
    B2: [
      { text: 'Поставьте в Passiv:', display: 'Das Buch ___ von vielen Leuten ___ (lesen).', options: ['wird ... gelesen', 'ist ... gelesen', 'wurde ... gelesen', 'wird ... lesen'], correct: 0 },
      { text: 'Passiv в Präteritum:', display: 'Die Brücke ___ 1990 ___ (bauen).', options: ['wurde ... gebaut', 'wird ... gebaut', 'ist ... gebaut', 'war ... gebaut'], correct: 0 },
      { text: 'Zustandspassiv:', display: 'Das Fenster ___ ___ (öffnen).', options: ['ist ... geöffnet', 'wird ... geöffnet', 'wurde ... geöffnet', 'hat ... geöffnet'], correct: 0 },
    ],
  },

  nebensaetze: {
    A1: [
      { text: 'Выберите правильный союз:', display: 'Ich trinke Kaffee, ___ ich müde bin.', options: ['wenn', 'wann', 'als', 'ob'], correct: 0 },
      { text: 'Какой союз подходит?', display: 'Ich lerne Deutsch, ___ ich in Deutschland leben will.', options: ['weil', 'dass', 'ob', 'wenn'], correct: 0 },
    ],
    A2: [
      { text: 'Заполните союз:', display: 'Ich bleibe zu Hause, ___ ich krank bin.', options: ['weil', 'denn', 'deshalb', 'trotzdem'], correct: 0 },
      { text: 'Выберите правильный вариант:', display: 'Er sagt, ___ er morgen kommt.', options: ['dass', 'das', 'weil', 'wenn'], correct: 0 },
      { text: 'Какой союз подходит?', display: '___ es regnet, bleiben wir zu Hause.', options: ['Wenn', 'Weil', 'Dass', 'Ob'], correct: 0 },
      { text: 'Заполните:', display: 'Ich weiß nicht, ___ er kommt.', options: ['ob', 'dass', 'weil', 'denn'], correct: 0 },
      { text: 'Выберите союз:', display: '___ ich klein war, wohnte ich in Berlin.', options: ['Als', 'Wenn', 'Weil', 'Dass'], correct: 0 },
      { text: 'Какой вариант верный?', display: 'Ich rufe dich an, ___ ich zu Hause bin.', options: ['wenn', 'weil', 'dass', 'ob'], correct: 0 },
    ],
    B1: [
      { text: 'Выберите правильное придаточное:', display: 'Das ist der Mann, ___ ich gestern gesehen habe.', options: ['den', 'der', 'dem', 'dessen'], correct: 0 },
      { text: 'Заполните:', display: 'Ich weiß nicht, ___ er heute kommt.', options: ['ob', 'dass', 'weil', 'wenn'], correct: 0 },
      { text: 'Какой вариант верный?', display: 'Die Stadt, ___ ___ ich wohne, ist schön.', options: ['in der', 'in die', 'wo der', 'in dem'], correct: 0 },
      { text: 'Выберите правильный порядок слов:', display: 'Ich hoffe, dass ___', options: ['er bald kommt.', 'er kommt bald.', 'bald er kommt.', 'kommt er bald.'], correct: 0 },
      { text: 'Заполните относительное местоимение:', display: 'Die Frau, ___ Tasche rot ist, ist meine Lehrerin.', options: ['deren', 'die', 'der', 'dessen'], correct: 0 },
      { text: 'Выберите:', display: 'Das Buch, ___ ich gelesen habe, war spannend.', options: ['das', 'dem', 'dessen', 'den'], correct: 0 },
    ],
    B2: [
      { text: 'Заполните:', display: '___ mehr er lernt, ___ besser werden seine Noten.', options: ['Je ... desto', 'Wenn ... dann', 'Ob ... oder', 'Weder ... noch'], correct: 0 },
      { text: 'Выберите правильный союз:', display: 'Er kam nicht zur Arbeit, ___ er krank war.', options: ['da', 'obwohl', 'damit', 'indem'], correct: 0 },
      { text: 'Какой союз верный?', display: 'Er lernt viel, ___ er die Prüfung besteht.', options: ['damit', 'weil', 'obwohl', 'indem'], correct: 0 },
      { text: 'Заполните:', display: '___ er auch versucht hat, es hat nicht geklappt.', options: ['Was', 'Dass', 'Weil', 'Ob'], correct: 0 },
      { text: 'Выберите правильный вариант:', display: 'Sie spricht so, ___ ___ sie alles wüsste.', options: ['als ob', 'als wenn', 'so dass', 'damit'], correct: 0 },
      { text: 'Какой союз подходит?', display: 'Anstatt ___ er lernt, spielt er Computerspiele.', options: ['dass', 'weil', 'ob', 'wenn'], correct: 0 },
    ],
  },

  konjunktiv: {
    A1: [
      { text: 'Какая форма вежливее?', display: 'Ich ___ gern einen Tee.', options: ['möchte', 'will', 'muss', 'soll'], correct: 0 },
      { text: 'Вежливая просьба:', display: '___ ich bitte ein Glas Wasser haben?', options: ['Könnte', 'Kann', 'Muss', 'Will'], correct: 0 },
    ],
    A2: [
      { text: 'Выберите вежливую форму:', display: 'Ich ___ gern ein Wasser.', options: ['hätte', 'habe', 'hatte', 'hat'], correct: 0 },
      { text: 'Какая форма выражает желание?', display: '___ du mir helfen?', options: ['Könntest', 'Kannst', 'Konntest', 'Könnt'], correct: 0 },
      { text: 'Вежливая форма:', display: '___ Sie mir bitte sagen, wo der Bahnhof ist?', options: ['Könnten', 'Können', 'Konnten', 'Konnt'], correct: 0 },
      { text: 'Выберите:', display: 'Ich ___ gern eine Tasse Kaffee.', options: ['hätte', 'habe', 'hatte', 'haben'], correct: 0 },
      { text: 'Какая форма верная?', display: 'An deiner Stelle ___ ich mehr lernen.', options: ['würde', 'werde', 'will', 'wurde'], correct: 0 },
    ],
    B1: [
      { text: 'Поставьте в Konjunktiv II:', display: 'Wenn ich reich ___ (sein), ___ ich ein Haus kaufen.', options: ['wäre ... würde', 'bin ... werde', 'sei ... will', 'war ... wurde'], correct: 0 },
      { text: 'Выберите правильный Konjunktiv II:', display: 'Er tat so, als ___ er alles (wissen).', options: ['wüsste', 'weiß', 'wusste', 'gewusst'], correct: 0 },
      { text: 'Заполните:', display: 'Wenn ich Zeit ___, ___ ich ins Kino gehen.', options: ['hätte ... würde', 'habe ... werde', 'hatte ... wurde', 'habe ... würde'], correct: 0 },
      { text: 'Konjunktiv II:', display: 'Wenn ich du ___, ___ ich das nicht machen.', options: ['wäre ... würde', 'bin ... werde', 'sei ... will', 'war ... wurde'], correct: 0 },
      { text: 'Выберите:', display: 'Wenn es nicht so kalt ___, ___ wir spazieren gehen.', options: ['wäre ... würden', 'ist ... werden', 'war ... wurden', 'sei ... wollen'], correct: 0 },
      { text: 'Заполните:', display: 'Ich ___ (können) dir helfen, wenn du mich fragst.', options: ['könnte', 'kann', 'konnte', 'können'], correct: 0 },
    ],
    B2: [
      { text: 'Выберите правильный вариант:', display: 'Hätte ich das gewusst, ___ ich anders gehandelt.', options: ['hätte', 'habe', 'würde', 'wäre'], correct: 0 },
      { text: 'Konjunktiv II в прошедшем:', display: 'Wenn er früher ___ (kommen), ___ wir pünktlich gewesen.', options: ['gekommen wäre ... wären', 'kam ... waren', 'gekommen ist ... sind', 'kommen würde ... werden'], correct: 0 },
      { text: 'Выберите:', display: 'Wäre ich nicht krank gewesen, ___ ich mitgekommen.', options: ['wäre', 'hätte', 'würde', 'bin'], correct: 0 },
      { text: 'Konjunktiv I (косвенная речь):', display: 'Er sagte, er ___ keine Zeit.', options: ['habe', 'hat', 'hätte', 'hatte'], correct: 0 },
      { text: 'Заполните:', display: 'Sie behauptete, sie ___ das nicht gewusst.', options: ['habe', 'hat', 'hätte', 'hatte'], correct: 0 },
      { text: 'Konjunktiv II в прошедшем:', display: 'Hätten wir das ___, wären wir nicht gefahren.', options: ['gewusst', 'wissen', 'wussten', 'wüssten'], correct: 0 },
      { text: 'Выберите правильный Konjunktiv I:', display: 'Der Lehrer sagte, die Schüler ___ fleißiger lernen.', options: ['sollten', 'sollen', 'solltet', 'sollt'], correct: 0 },
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
