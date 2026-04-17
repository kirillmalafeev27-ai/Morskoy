const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic();

const questionPool = {};

const TOPIC_RULES = {
  'Infinitiv mit zu': `Verwende NUR Verben, die "zu + Infinitiv" verlangen: versuchen, beginnen, anfangen, aufhören, vorhaben, hoffen, vergessen, planen, sich freuen, Lust haben, Es ist wichtig/möglich/schwer...
NIEMALS Modalverben (können, müssen, sollen, wollen, dürfen, mögen) — diese stehen mit Infinitiv OHNE "zu"!
Richtig: "Er versucht, den Bahnhof zu finden." | Falsch: "Er kann den Bahnhof zu finden."`,

  'Modalverben': `Modalverben: können, müssen, sollen, wollen, dürfen, mögen/möchten.
Modalverb auf Position 2, Infinitiv am Satzende OHNE "zu"!
Richtig: "Er kann den Bahnhof finden." | Falsch: "Er kann den Bahnhof zu finden."`,

  'Perfekt': `sein + Partizip II bei: Bewegungsverben (gehen→ist gegangen, fahren→ist gefahren, kommen→ist gekommen, fliegen→ist geflogen, laufen→ist gelaufen), Zustandsänderung (einschlafen→ist eingeschlafen, aufwachen, sterben, werden, bleiben).
haben + Partizip II bei ALLEN anderen Verben (machen→hat gemacht, essen→hat gegessen, lesen→hat gelesen).
Partizip II: ge-...-t (regelmäßig: gemacht, gekauft), ge-...-en (unregelmäßig: gegangen, geschrieben). Verben auf -ieren: KEIN ge- (studiert, telefoniert). Trennbare: ge- zwischen Präfix und Stamm (ein·ge·kauft, auf·ge·standen). Untrennbare (be-, er-, ver-, ent-, zer-, emp-, miss-): KEIN ge- (besucht, verstanden, erzählt).`,

  'Präteritum': `Regelmäßig: Stamm + -te/-test/-te/-ten/-tet/-ten (machte, sagtest).
Unregelmäßig: Stammvokalwechsel OHNE -te (gehen→ging, sehen→sah, nehmen→nahm, schreiben→schrieb, lesen→las, sprechen→sprach).
Mischverben: Vokalwechsel + -te (bringen→brachte, denken→dachte, kennen→kannte, wissen→wusste).`,

  'Dativ': `Dativpräpositionen: mit, nach, bei, seit, von, zu, aus, gegenüber, ab.
Dativverben: helfen, danken, gehören, gefallen, schmecken, passen, gratulieren, antworten, folgen.
Formen: dem (m/n), der (f), den + -n (Pl). ein→einem (m/n), eine→einer (f).`,

  'Akkusativ': `Akkusativpräpositionen: durch, für, gegen, ohne, um.
Formen: den (m), die (f), das (n), die (Pl). ein→einen (m), eine (f), ein (n).
Transitive Verben: sehen, kaufen, essen, trinken, lesen, schreiben, brauchen, haben, finden.`,

  'Genitiv': `Genitivpräpositionen: wegen, trotz, während, innerhalb, außerhalb, statt/anstatt.
Maskulin/Neutrum: des/eines + Nomen mit -(e)s (des Mannes, eines Kindes).
Feminin: der/einer + Nomen OHNE Endung (der Frau, einer Studentin).
Plural: der + Nomen OHNE Endung (der Kinder).`,

  'Adjektivdeklination': `Nach bestimmtem Artikel (der/die/das): -e (Nom. Sg. alle Genera), -en (alle anderen Fälle).
Nach unbestimmtem Artikel (ein/kein/mein): -er (Nom.m), -es (Nom./Akk.n), -e (Nom./Akk.f), -en (alle anderen).
Ohne Artikel: starke Endungen — Signalendungen des bestimmten Artikels: -er (m.Nom), -e (f.Nom/Akk), -es (n.Nom/Akk), -en (Dat/Gen), -em (m/n.Dat).
Richtig: "ein alter Mann" (m.Nom), "mit dem alten Mann" (m.Dat) | Falsch: "ein alten Mann", "mit dem alter Mann"`,

  'Wechselpräpositionen': `an, auf, hinter, in, neben, über, unter, vor, zwischen.
Wohin? (Bewegung/Richtung) → Akkusativ: "Ich stelle das Buch auf den Tisch." (stellen, legen, setzen, hängen)
Wo? (Position/Ort) → Dativ: "Das Buch steht auf dem Tisch." (stehen, liegen, sitzen, hängen)`,

  'Negation': `"nicht" verneint: Verben, Adjektive, Adverbien, Präpositionalphrasen. Position: vor dem verneinten Element.
"kein/keine/keinen/keinem/keiner" ersetzt unbestimmten Artikel oder Nullartikel + Nomen.
Richtig: "Ich habe kein Auto." | Falsch: "Ich habe nicht Auto."
Richtig: "Ich komme nicht aus Berlin." | Falsch: "Ich komme kein aus Berlin."`,

  'Wortstellung im Hauptsatz': `Finites Verb IMMER auf Position 2!
Inversion bei Adverb/Objekt auf Pos.1: Verb Pos.2, Subjekt Pos.3.
Richtig: "Gestern ging ich ins Kino." | Falsch: "Gestern ich ging ins Kino."`,

  'Wortstellung im Nebensatz': `Nach Konjunktion (weil, dass, wenn, ob, als, nachdem, obwohl): finites Verb am SATZENDE.
Richtig: "Ich weiß, dass er morgen kommt." | Falsch: "Ich weiß, dass er kommt morgen."
Perfekt im Nebensatz: "..., weil er nach Hause gegangen ist." (Hilfsverb am Ende!)`,

  'dass-Sätze': `"dass" + Nebensatzwortstellung (Verb am Ende).
Richtig: "Ich glaube, dass er recht hat." | Falsch: "Ich glaube, dass er hat recht."`,

  'weil-Sätze': `"weil" + Nebensatzwortstellung (Verb am Ende).
Richtig: "Ich bleibe zu Hause, weil ich krank bin." | Falsch: "Ich bleibe zu Hause, weil ich bin krank."`,

  'wenn-Sätze': `"wenn" + Verb am Ende. Hauptsatz nach wenn-Satz: Verb auf Position 1.
Richtig: "Wenn es regnet, bleibe ich zu Hause." | Falsch: "Wenn es regnet, ich bleibe zu Hause."`,

  'Relativsätze': `Relativpronomen: Genus/Numerus vom Bezugswort, Kasus von der Funktion im Relativsatz. Verb am Ende.
Nom: der/die/das/die. Akk: den/die/das/die. Dat: dem/der/dem/denen. Gen: dessen/deren.
Richtig: "Der Mann, den ich gesehen habe, ist mein Nachbar."`,

  'Konjunktiv II': `Irreale Wünsche, höfliche Bitten, Ratschläge.
würde + Infinitiv (Standard). Eigene Formen: wäre, hätte, könnte, müsste, sollte, dürfte, wüsste, käme, ginge, bräuchte.
Richtig: "Wenn ich reich wäre, würde ich reisen." | Falsch: "Wenn ich reich würde sein..."`,

  'Passiv': `Vorgangspassiv: werden + Partizip II. "Das Buch wird gelesen."
Zustandspassiv: sein + Partizip II. "Das Fenster ist geöffnet."
Agens: von + Dativ. Präteritum: wurde + P.II. Perfekt: ist + P.II + worden.`,

  'Präsens': `Konjugation: -e, -st, -t, -en, -t, -en.
Stammvokalwechsel (2./3. Sg.): e→i (sprechen→spricht, helfen→hilft), e→ie (lesen→liest, sehen→sieht), a→ä (fahren→fährt, schlafen→schläft).
Verben auf -ten/-den: Bindevokal -e- (du arbeitest, er arbeitet).`,

  'Futur I': `werden + Infinitiv. werden: werde, wirst, wird, werden, werdet, werden.
Richtig: "Ich werde morgen kommen." | Falsch: "Ich werde morgen zu kommen."`,

  'Imperativ': `du: Stamm (+e optional): "Komm!", "Mach!". e→i/ie bleibt: "Sprich!", "Lies!", "Nimm!" (KEIN -st, KEIN Pronomen). a→ä fällt weg: "Fahr!" (nicht "Fähr!").
ihr: wie Präsens ohne "ihr": "Kommt!", "Lest!".
Sie: Infinitiv + Sie: "Kommen Sie!", "Lesen Sie!"`,

  'Artikel': `Bestimmt: der (m), die (f), das (n), die (Pl). Unbestimmt: ein (m/n), eine (f).
Genus-Regeln: -ung/-heit/-keit/-schaft/-tion/-tät → die. -chen/-lein → das. -er/-ling → oft der.`,

  'Nominativ': `Subjekt im Nominativ. Prädikativ nach sein/werden/bleiben ebenfalls Nominativ.
Richtig: "Der Mann ist ein guter Lehrer." | Falsch: "Der Mann ist einen guten Lehrer."`,
};

app.post('/api/generate-questions', async (req, res) => {
  const { level, lexicalTopic, grammarTopic, isWortstellung, count, exclude } = req.body;

  if (!level || !grammarTopic) {
    return res.status(400).json({ error: 'level and grammarTopic are required' });
  }

  const questionsCount = count || 30;
  const cacheKey = `${level}:${grammarTopic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;

  if (questionPool[cacheKey] && questionPool[cacheKey].length >= questionsCount) {
    const cached = questionPool[cacheKey].splice(0, questionsCount);
    res.json({ questions: cached });
    return;
  }

  let excludeNote = '';
  if (exclude && exclude.length > 0) {
    const short = exclude.slice(-10).map(t => `"${t}"`).join(', ');
    excludeNote = `\nVerwende diese Sätze NICHT: ${short}`;
  }

  const topicRule = TOPIC_RULES[grammarTopic] || '';

  let taskDescription;
  if (isWortstellung) {
    taskDescription = `Erstelle ${questionsCount} Wortstellungsübungen für Deutsch (Niveau ${level}).
Grammatikthema: ${grammarTopic}.
${lexicalTopic ? `Lexikalisches Thema: ${lexicalTopic}. Alle Sätze müssen Wörter aus diesem Thema verwenden.` : ''}

Format:
- "display": Wörter/Phrasen durch " / " getrennt in ZUFÄLLIGER Reihenfolge (NICHT in der korrekten Reihenfolge!)
- "options": 4 vollständige deutsche Sätze — NUR EINER ist grammatisch korrekt
- "correct": Index der korrekten Option (0–3), GLEICHMÄSSIG verteilt
- "text": Kurze Anweisung auf Russisch (z.B. "Расставь слова в правильном порядке:")

Regeln für Wortstellungsübungen:
- Die Wörter in "display" MÜSSEN durcheinander sein — NICHT in der korrekten Reihenfolge!
- NUR EIN Satz darf korrekt sein. Inversionen (z.B. "Morgen gehe ich" statt "Ich gehe morgen") sind AUCH korrekt — biete sie NICHT als falsche Option an!
- Falsche Optionen: klare Wortstellungsfehler (Verb nicht auf Position 2 im Hauptsatz, Verb nicht am Ende im Nebensatz usw.)
- Jeder Satz ANDERS (verschiedene Subjekte, Verben, Situationen)`;
  } else {
    taskDescription = `Erstelle ${questionsCount} Grammatikübungen (Lückenübungen) für Deutsch (Niveau ${level}).
Grammatikthema: ${grammarTopic}.
${lexicalTopic ? `Lexikalisches Thema: ${lexicalTopic}. Alle Sätze müssen Wörter aus diesem Thema verwenden.` : ''}

Format:
- "display": Deutscher Satz mit Lücke ___ an der relevanten Stelle
- "options": 4 Optionen auf Deutsch — NUR EINE ist grammatisch korrekt
- "correct": Index der korrekten Option (0–3), GLEICHMÄSSIG verteilt
- "text": Kurze Anweisung auf Russisch (z.B. "Выбери правильный вариант:")

Regeln für Lückenübungen:
- Falsche Optionen: EINE klare Fehlerart (falscher Kasus, falscher Artikel, falsche Endung, falsche Konjugation)
- Keine absurden oder offensichtlich falschen Optionen — sie müssen plausibel aussehen
- Jeder Satz ANDERS (verschiedene Subjekte, Verben, Situationen)`;
  }

  const prompt = `Du bist ein erfahrener DaF-Lehrer (Deutsch als Fremdsprache) und Lehrbuchautor. Du erstellst Übungen auf dem Qualitätsniveau von Schritte International, Menschen und Aspekte.

${topicRule ? `GRAMMATIKREGELN für "${grammarTopic}" — halte dich STRIKT daran:\n${topicRule}\n` : ''}
${taskDescription}
${excludeNote}

QUALITÄTSKONTROLLE — prüfe JEDE Übung BEVOR du sie ausgibst:
1. Setze die korrekte Option in den Satz ein → ist er grammatisch PERFEKT? Kasus, Genus, Numerus, Konjugation, Wortstellung — alles korrekt?
2. Setze JEDE falsche Option ein → enthält der Satz einen KLAREN grammatischen Fehler?
3. Gibt es GENAU EINE korrekte Antwort? Wenn zwei Optionen korrekt sein könnten → Übung neu formulieren!
4. Passt die Übung zum Thema "${grammarTopic}" und zum Niveau ${level}?
5. Sind die Sätze natürlich und vollständig?

Antworte NUR mit einem validen JSON-Array, KEIN Markdown, KEINE Erklärungen:
[{"text":"Инструкция на русском","display":"Deutscher Text","options":["A","B","C","D"],"correct":0}]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 4096,
      },
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(500).json({ error: 'No text in API response' });
    }

    const rawText = textBlock.text.trim();
    let jsonStr = rawText;
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const questions = JSON.parse(jsonStr);
    const valid = questions.filter(q =>
      q.text && q.display && Array.isArray(q.options) &&
      q.options.length === 4 && typeof q.correct === 'number' &&
      q.correct >= 0 && q.correct <= 3
    );

    if (valid.length > questionsCount) {
      if (!questionPool[cacheKey]) questionPool[cacheKey] = [];
      questionPool[cacheKey].push(...valid.slice(questionsCount));
    }

    res.json({ questions: valid.slice(0, questionsCount) });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to generate questions', detail: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Morskoy Dungeon running on port ${PORT}`);
});
