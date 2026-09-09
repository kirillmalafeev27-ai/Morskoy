'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseTextExercises } = require('../quiz-generation');
const { validateBatch } = require('../lib/exercise-validation');

/** So sieht eine Modellantwort im Textformat aus. */
const MODEL_ANSWER = `AUFGABEN
1. Format: satzvarianten
Anweisung: Выбери грамматически правильный вариант.
Aufgabe: Sein Zug fährt um sechs. (vorhaben – früh aufstehen)
A) Er hat vor, morgen früh aufzustehen.
B) Er hat vor, morgen früh zu aufstehen.
C) Er hat vor, morgen früh aufstehen zu.
D) Er hat vor, morgen früh aufstehen.

2. Format: verbindung
Anweisung: Соедини два предложения в одно.
Aufgabe: Verbinde: "Der Turm ist sehr alt." + "Man kann den Turm vom Bahnhof aus sehen."
A) Der Turm, der man vom Bahnhof aus sehen kann, ist sehr alt.
B) Der Turm, den man vom Bahnhof aus sehen kann, ist sehr alt.
C) Der Turm, dem man vom Bahnhof aus sehen kann, ist sehr alt.
D) Der Turm, den man kann vom Bahnhof aus sehen, ist sehr alt.

LÖSUNGEN
1: A = Er hat vor, morgen früh aufzustehen.
2: B = Der Turm, den man vom Bahnhof aus sehen kann, ist sehr alt.`;

test('das Textformat wird samt Format-, Anweisungs- und Lösungszeile gelesen', () => {
  const parsed = parseTextExercises(MODEL_ANSWER, 10);

  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].format, 'satzvarianten');
  assert.strictEqual(parsed[0].text, 'Выбери грамматически правильный вариант.');
  assert.match(parsed[0].display, /Sein Zug fährt um sechs/);
  assert.strictEqual(parsed[0].options.length, 4);
  assert.strictEqual(parsed[0].correct, 0);

  assert.strictEqual(parsed[1].format, 'verbindung');
  assert.strictEqual(parsed[1].correct, 1);
  assert.strictEqual(parsed[1].options[1], parsed[1].correctAnswer);
});

test('ohne Lösungsteil wird nichts übernommen', () => {
  const withoutKeys = MODEL_ANSWER.slice(0, MODEL_ANSWER.indexOf('LÖSUNGEN'));
  assert.deepStrictEqual(parseTextExercises(withoutKeys, 10), []);
});

test('ein Lösungsschlüssel, der zur Aufgabe nicht passt, fällt in der Prüfung durch', () => {
  const broken = MODEL_ANSWER.replace(
    '1: A = Er hat vor, morgen früh aufzustehen.',
    '1: A = Ein Satz, der so gar nicht in den Optionen steht.'
  );
  const parsed = parseTextExercises(broken, 10);
  const { questions, rejected } = validateBatch(parsed, {
    grammarTopic: 'Infinitiv mit zu',
    count: 10,
  });

  assert.strictEqual(questions.length, 1, 'nur die zweite Aufgabe darf durchkommen');
  assert.ok(rejected.some((reason) => /correctAnswer/.test(reason)));
});

test('geparste Aufgaben überstehen die Batch-Prüfung', () => {
  const { questions, rejected } = validateBatch(parseTextExercises(MODEL_ANSWER, 10), {
    grammarTopic: 'Infinitiv mit zu',
    count: 10,
  });
  assert.deepStrictEqual(rejected, []);
  assert.strictEqual(questions.length, 2);
  assert.strictEqual(questions[0].correct, 0);
});
