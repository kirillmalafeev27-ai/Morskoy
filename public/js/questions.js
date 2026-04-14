// Question system powered by Claude API
// One-time batch generation per topic, smart rotation during game

// Grammar topics list
const GRAMMAR_TOPICS = [
  // Verben
  'Präsens', 'Perfekt', 'Präteritum', 'Futur I', 'Imperativ',
  'Modalverben', 'Trennbare Verben', 'Reflexive Verben',
  'Verben mit Präpositionen', 'Lassen',
  // Nomen & Artikel
  'Artikel', 'Nominativ', 'Akkusativ', 'Dativ', 'Genitiv',
  'N-Deklination', 'Pronomen', 'Pronominaladverbien',
  'Possessivpronomen in verschiedenen Kasus',
  // Adjektive
  'Adjektivdeklination', 'Steigerung',
  // Präpositionen
  'Wechselpräpositionen', 'Lokale Präpositionen',
  'Temporale Präpositionen', 'Kausale Präpositionen',
  // Satzbau
  'Negation', 'Satzklammer', 'Wortstellung im Hauptsatz', 'Wortstellung im Nebensatz',
  // Nebensätze
  'weil-Sätze', 'dass-Sätze', 'obwohl-Sätze', 'wenn-Sätze',
  'Relativsätze', 'Indirekte Fragen', 'Infinitiv mit zu',
  // Fortgeschritten
  'Konjunktiv II', 'Passiv', 'Zustandspassiv',
  'Plusquamperfekt', 'Konjunktiv I',
  'Doppelkonjunktionen', 'als vs. wenn',
  'Partizip I und II als Adjektive',
];

// Lexical topics (Wortschatz)
const LEXICAL_TOPICS = [
  'Begrüßung', 'Familie', 'Schule', 'Essen und Trinken',
  'Tagesablauf', 'Wetter', 'Stadt', 'Hobbys und Freizeit',
  'Reisen und Urlaub', 'Einkaufen', 'Natur und Umwelt', 'Wohnen',
  'Kleidung', 'Körper und Gesundheit', 'Berufe', 'Verkehrsmittel',
  'Feste und Feiertage', 'Medien und Technik',
];

// Bonus slot definitions (fixed bonuses, player assigns grammar topics)
const BONUS_SLOTS = [
  { id: 'wortstellung', bonus: 'move2', bonusLabel: '2 хода', name: 'Wortstellung', isWortstellung: true, fixed: true },
  { id: 'slot2', bonus: 'move1', bonusLabel: '+1 ход', name: null },
  { id: 'slot3', bonus: 'vision', bonusLabel: 'Расш. зрение', name: null },
  { id: 'slot4', bonus: 'bait', bonusLabel: 'Приманка', name: null },
  { id: 'slot5', bonus: 'reveal', bonusLabel: 'Показать монстра', name: null },
];

class QuestionManager {
  constructor(level) {
    this.level = level || 'A2';
    this.lexicalTopic = null;
    this.questionPool = {};   // slotId -> array of remaining questions
    this.fetching = {};       // slotId -> boolean
    this.slots = [];
    this._initialFetchDone = false; // one-shot flag — prefetchAll runs only once per topic/level
  }

  setLevel(level) {
    if (this.level !== level) {
      this.level = level;
      this.questionPool = {}; // level changed — pool invalid
      this._initialFetchDone = false;
    }
  }

  setLexicalTopic(topic) {
    if (this.lexicalTopic !== topic) {
      this.lexicalTopic = topic;
      this.questionPool = {}; // topic changed — pool invalid
      this._initialFetchDone = false;
    }
  }

  configureSlots(slotConfigs) {
    // If slot grammar topics changed, invalidate pools for those slots
    const prev = this.slots || [];
    for (const newCfg of slotConfigs) {
      const prevCfg = prev.find(p => p.slotDef.id === newCfg.slotDef.id);
      if (prevCfg && prevCfg.grammarTopic !== newCfg.grammarTopic) {
        delete this.questionPool[newCfg.slotDef.id];
        this._initialFetchDone = false;
      }
    }
    this.slots = slotConfigs;
    // Don't clear pools here (unless grammar changed) — they persist across restarts until exhausted
  }

  // Fetch 30 questions for all slots. Runs ONCE per game session (per level/topic).
  // After death, this is a no-op — no API calls on restart.
  // New fetches happen only when a slot's pool is exhausted (see onCorrectAnswer).
  async prefetchAll() {
    if (this._initialFetchDone) return;
    const promises = this.slots
      .filter(slot => !this.questionPool[slot.slotDef.id] || this.questionPool[slot.slotDef.id].length === 0)
      .map(slot => this._fetchForSlot(slot.slotDef.id));
    await Promise.allSettled(promises);
    this._initialFetchDone = true;
  }

  // Get next question for a slot
  getQuestion(slotId) {
    const slotConfig = this.slots.find(s => s.slotDef.id === slotId);
    if (!slotConfig) return null;

    const pool = this.questionPool[slotId];
    if (!pool || pool.length === 0) return this._fallbackQuestion(slotConfig);

    // Take first question from pool
    const q = pool.shift();
    // Store it temporarily so we can put it back on wrong answer
    this._lastQuestion = { slotId, question: q };
    return this._formatQuestion(q, slotConfig);
  }

  // Correct answer — question is gone (already removed from pool by shift)
  onCorrectAnswer(slotId) {
    this._lastQuestion = null;
    // If pool is now empty, trigger background refetch for next game
    if (!this.questionPool[slotId] || this.questionPool[slotId].length === 0) {
      this._fetchForSlot(slotId);
    }
  }

  // User flagged current question as broken — drop it permanently and tell server
  reportCurrentQuestion() {
    if (!this._lastQuestion) return null;
    const { slotId, question } = this._lastQuestion;

    // Make sure it's out of the pool (it was already shifted, but in case of edge paths)
    const pool = this.questionPool[slotId];
    if (pool) {
      const idx = pool.indexOf(question);
      if (idx >= 0) pool.splice(idx, 1);
    }

    const slotConfig = this.slots.find(s => s.slotDef.id === slotId);
    const payload = {
      level: this.level,
      lexicalTopic: this.lexicalTopic,
      grammarTopic: slotConfig ? slotConfig.grammarTopic : null,
      isWortstellung: slotConfig ? !!slotConfig.slotDef.isWortstellung : false,
      display: question.display,
    };

    fetch('/api/report-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('Failed to report question:', err));

    this._lastQuestion = null;
    return slotId;
  }

  // Wrong answer — put question back into pool at random position
  onWrongAnswer(slotId) {
    if (this._lastQuestion && this._lastQuestion.slotId === slotId) {
      const pool = this.questionPool[slotId];
      if (pool) {
        const pos = Math.floor(Math.random() * (pool.length + 1));
        pool.splice(pos, 0, this._lastQuestion.question);
      }
      this._lastQuestion = null;
    }
  }

  // Shuffle pools on new game (so order is fresh each game)
  shuffleAllPools() {
    for (const slotId of Object.keys(this.questionPool)) {
      const arr = this.questionPool[slotId];
      if (arr && arr.length > 1) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      }
    }
  }

  // Returns count of remaining questions per slot (for UI if needed)
  getPoolSize(slotId) {
    return (this.questionPool[slotId] || []).length;
  }

  async _fetchForSlot(slotId) {
    if (this.fetching[slotId]) return;
    this.fetching[slotId] = true;

    const slotConfig = this.slots.find(s => s.slotDef.id === slotId);
    if (!slotConfig) { this.fetching[slotId] = false; return; }

    try {
      const resp = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: this.level,
          lexicalTopic: this.lexicalTopic,
          grammarTopic: slotConfig.grammarTopic,
          isWortstellung: slotConfig.slotDef.isWortstellung || false,
          count: 30,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.questions && data.questions.length > 0) {
        // Extra safety: drop questions with duplicate options (shouldn't happen,
        // but guards against the "no correct answer" UX when the LLM slips up).
        const qs = data.questions.filter(q =>
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          new Set(q.options).size === 4 &&
          typeof q.correct === 'number' &&
          q.correct >= 0 && q.correct <= 3
        );
        // Shuffle received questions
        for (let i = qs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [qs[i], qs[j]] = [qs[j], qs[i]];
        }
        this.questionPool[slotId] = qs;
      }
    } catch (err) {
      console.warn(`Failed to fetch questions for slot ${slotId}:`, err);
    }

    this.fetching[slotId] = false;
  }

  _formatQuestion(rawQ, slotConfig) {
    const correctAnswer = rawQ.options[rawQ.correct];
    const shuffled = [...rawQ.options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const newCorrectIdx = shuffled.indexOf(correctAnswer);

    return {
      slotId: slotConfig.slotDef.id,
      slotDef: slotConfig.slotDef,
      grammarTopic: slotConfig.grammarTopic,
      text: rawQ.text,
      display: rawQ.display,
      options: { options: shuffled, correctIndex: newCorrectIdx },
      level: this.level,
    };
  }

  _fallbackQuestion(slotConfig) {
    const grammar = slotConfig.grammarTopic;
    return {
      slotId: slotConfig.slotDef.id,
      slotDef: slotConfig.slotDef,
      grammarTopic: grammar,
      text: `Übung: ${grammar}`,
      display: `[Упражнения закончились. Бонус выдан автоматически.]`,
      options: { options: ['OK', '—', '—', '—'], correctIndex: 0 },
      level: this.level,
    };
  }
}
