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
const CLASSIC_BONUS_SLOTS = [
  { id: 'wortstellung', bonus: 'dash', bonusLabel: 'Рывок', name: 'Wortstellung', isWortstellung: true, fixed: true },
  { id: 'slot2', bonus: 'move2', bonusLabel: '2 хода', name: null },
  { id: 'slot3', bonus: 'camouflage', bonusLabel: 'Маскировка', name: null },
  { id: 'slot4', bonus: 'bait', bonusLabel: 'Приманка', name: null },
  { id: 'slot5', bonus: 'reveal', bonusLabel: 'Показать монстра', name: null },
];

const CHASE_RUNNER_BONUS_SLOTS = [
  { id: 'wortstellung', bonus: 'dash', bonusLabel: 'Рывок', name: 'Wortstellung', isWortstellung: true, fixed: true },
  { id: 'slot2', bonus: 'move2', bonusLabel: '2 хода', name: null },
  { id: 'slot3', bonus: 'camouflage', bonusLabel: 'Маскировка', name: null },
  { id: 'slot4', bonus: 'trap', bonusLabel: 'Ловушка', name: null },
  { id: 'slot5', bonus: 'dash', bonusLabel: 'Рывок', name: null },
];

const CHASE_HUNTER_BONUS_SLOTS = [
  { id: 'wortstellung', bonus: 'pounce', bonusLabel: 'Бросок', name: 'Wortstellung', isWortstellung: true, fixed: true },
  { id: 'slot2', bonus: 'move2', bonusLabel: '2 хода', name: null },
  { id: 'slot3', bonus: 'hunt_map', bonusLabel: 'Охотничий обзор', name: null },
  { id: 'slot4', bonus: 'trail', bonusLabel: 'След', name: null },
  { id: 'slot5', bonus: 'pounce', bonusLabel: 'Бросок', name: null },
];

function getBonusSlots(gameMode, role = 'runner') {
  if (gameMode === 'chase') {
    return role === 'hunter' ? CHASE_HUNTER_BONUS_SLOTS : CHASE_RUNNER_BONUS_SLOTS;
  }
  return CLASSIC_BONUS_SLOTS;
}

const BONUS_SLOTS = CLASSIC_BONUS_SLOTS;

// Camouflage config: 5 player turns of invisibility, 3-minute cooldown
const CAMOUFLAGE_TURNS = 5;
const CAMOUFLAGE_COOLDOWN_MS = 3 * 60 * 1000;
const TRAP_STUN_TURNS = 3;
const TRAP_RADIUS = 2;
const HUNT_MAP_REVEAL_MS = 1500;
const TRAIL_REVEAL_MS = 8000;

class QuestionManager {
  constructor(level) {
    this.level = level || 'A2';
    this.lexicalTopic = null;
    this.questionPool = {};   // slotId -> array of remaining questions
    this.fetching = {};       // slotId -> boolean
    this.slots = [];
  }

  setLevel(level) {
    if (this.level !== level) {
      this.level = level;
      this.questionPool = {}; // level changed - pool invalid
    }
  }

  setLexicalTopic(topic) {
    if (this.lexicalTopic !== topic) {
      this.lexicalTopic = topic;
      this.questionPool = {}; // topic changed - pool invalid
    }
  }

  configureSlots(slotConfigs) {
    this.slots = slotConfigs;
    // Don't clear pools here - they persist across games until exhausted
  }

  // Fetch 10 questions for slots that have no pool yet
  async prefetchAll() {
    const promises = this.slots
      .filter(slot => !this.questionPool[slot.slotDef.id] || this.questionPool[slot.slotDef.id].length === 0)
      .map(slot => this._fetchForSlot(slot.slotDef.id));
    await Promise.allSettled(promises);
  }

  // Get next question for a slot
  getQuestion(slotId) {
    const slotConfig = this.slots.find(s => s.slotDef.id === slotId);
    if (!slotConfig) return null;

    const pool = this.questionPool[slotId];
    if (!pool || pool.length === 0) return this._fallbackQuestion(slotConfig);

    const q = pool.shift();
    this._lastQuestion = { slotId, question: q };
    return this._formatQuestion(q, slotConfig);
  }

  onCorrectAnswer(slotId) {
    this._lastQuestion = null;
    if (!this.questionPool[slotId] || this.questionPool[slotId].length === 0) {
      this._fetchForSlot(slotId);
    }
  }

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

  getPoolSize(slotId) {
    return (this.questionPool[slotId] || []).length;
  }

  async _fetchForSlot(slotId) {
    if (this.fetching[slotId]) return;
    this.fetching[slotId] = true;

    const slotConfig = this.slots.find(s => s.slotDef.id === slotId);
    if (!slotConfig) {
      this.fetching[slotId] = false;
      return;
    }

    try {
      const resp = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: this.level,
          lexicalTopic: this.lexicalTopic,
          grammarTopic: slotConfig.grammarTopic,
          isWortstellung: slotConfig.slotDef.isWortstellung || false,
          count: 10,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.questions && data.questions.length > 0) {
        const qs = data.questions;
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
      display: '[Упражнения закончились. Бонус выдан автоматически.]',
      options: { options: ['OK', '—', '—', '—'], correctIndex: 0 },
      level: this.level,
    };
  }
}
