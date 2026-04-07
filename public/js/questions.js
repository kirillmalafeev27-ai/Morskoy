// Question system powered by Claude API
// Pre-fetches questions at game start, refills in background

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
    this.questionCache = {}; // key: slotId -> array of questions
    this.fetching = {}; // key: slotId -> boolean (in-flight request)
    this.slots = []; // configured slots with grammar topics
  }

  setLevel(level) {
    this.level = level;
    this.questionCache = {};
  }

  setLexicalTopic(topic) {
    this.lexicalTopic = topic;
    this.questionCache = {};
  }

  // Configure slots: array of { slotDef, grammarTopic }
  configureSlots(slotConfigs) {
    this.slots = slotConfigs;
    this.questionCache = {};
  }

  // Pre-fetch questions for all configured slots
  async prefetchAll() {
    const promises = this.slots.map(slot => this._fetchForSlot(slot.slotDef.id));
    await Promise.allSettled(promises);
  }

  // Get a question for a specific slot
  async getQuestion(slotId) {
    const slotConfig = this.slots.find(s => s.slotDef.id === slotId);
    if (!slotConfig) return null;

    // Try cache first
    if (this.questionCache[slotId] && this.questionCache[slotId].length > 0) {
      const q = this.questionCache[slotId].shift();
      // Refetch in background if running low
      if (this.questionCache[slotId].length <= 1) {
        this._fetchForSlot(slotId); // fire and forget
      }
      return this._formatQuestion(q, slotConfig);
    }

    // No cache, must fetch
    await this._fetchForSlot(slotId);

    if (this.questionCache[slotId] && this.questionCache[slotId].length > 0) {
      const q = this.questionCache[slotId].shift();
      return this._formatQuestion(q, slotConfig);
    }

    // API failed — return a fallback question
    return this._fallbackQuestion(slotConfig);
  }

  // Called after correct answer — immediately fetch a replacement question
  onCorrectAnswer(slotId) {
    this._fetchForSlot(slotId); // fire and forget
  }

  // Shuffle all cached questions (call on game restart / new game)
  shuffleAllCaches() {
    for (const slotId of Object.keys(this.questionCache)) {
      const arr = this.questionCache[slotId];
      if (arr && arr.length > 1) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      }
    }
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
          count: 4,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.questions && data.questions.length > 0) {
        if (!this.questionCache[slotId]) this.questionCache[slotId] = [];
        // Shuffle new questions before adding to cache
        const newQs = data.questions;
        for (let i = newQs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newQs[i], newQs[j]] = [newQs[j], newQs[i]];
        }
        this.questionCache[slotId].push(...newQs);
      }
    } catch (err) {
      console.warn(`Failed to fetch questions for slot ${slotId}:`, err);
    }

    this.fetching[slotId] = false;
  }

  _formatQuestion(rawQ, slotConfig) {
    // Shuffle options
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
      display: `[Загрузка упражнения не удалась. Бонус выдан автоматически.]`,
      options: { options: ['OK', '—', '—', '—'], correctIndex: 0 },
      level: this.level,
    };
  }
}
