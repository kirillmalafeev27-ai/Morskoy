const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic();

// Server-side question cache to avoid duplicate API calls
const questionPool = {}; // key: "level:grammar:lexical:mode" -> array of extras

// Blacklist of reported-bad questions, keyed by cacheKey -> Set of display texts
const reportedQuestions = {};

function buildCacheKey(level, grammarTopic, lexicalTopic, isWortstellung) {
  return `${level}:${grammarTopic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;
}

function extractText(message) {
  // With extended thinking, content contains thinking blocks + text blocks
  const textBlock = (message.content || []).find(b => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}

function extractJsonArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : text;
}

// Verify a batch of generated questions with a second model call.
// Returns a Set of indices that passed verification.
async function verifyBatch(questions, level, grammarTopic, lexicalTopic, isWortstellung) {
  if (questions.length === 0) return new Set();

  const modeNote = isWortstellung
    ? 'Это упражнение на ПОРЯДОК СЛОВ: в display слова даны в перемешанном порядке, а варианты ответов — это полные предложения. Правильный вариант должен быть ЕДИНСТВЕННЫМ грамматически корректным порядком слов (инверсия тоже правильна, если допустима).'
    : 'Это упражнение на грамматику: display содержит предложение с пропуском ___, и нужно подставить правильный вариант. Правильный вариант при подстановке должен давать ЕДИНСТВЕННОЕ грамматически корректное предложение.';

  const itemList = questions.map((q, i) =>
    `IDX ${i}: display="${q.display}"\n` +
    q.options.map((o, j) => `   [${j}]${j === q.correct ? ' ← заявлен правильным' : ''}: ${o}`).join('\n')
  ).join('\n\n');

  const verifierPrompt = `Ты — строгий немецкий лингвист и корректор учебных материалов. Проверь качество сгенерированных упражнений.

Грамматическая тема: ${grammarTopic}. Уровень CEFR: ${level}.${lexicalTopic ? ` Лексика: ${lexicalTopic}.` : ''}
${modeNote}

Для КАЖДОГО упражнения определи ok=true ТОЛЬКО если ВСЕ условия выполнены:
1. Заявленный правильный вариант — грамматически БЕЗУПРЕЧЕН при подстановке.
2. Остальные 3 варианта содержат ЯВНУЮ грамматическую ошибку (род, падеж, окончание, порядок слов и т.п.) — ни один из них не является вторым допустимым ответом.
3. Все 4 варианта различны.
4. Предложение логично, завершено по смыслу.
5. Соответствует уровню ${level} — не сложнее.

Если есть ХОТЬ ОДНО сомнение — ok=false.

Упражнения для проверки:

${itemList}

Ответь ТОЛЬКО валидным JSON-массивом, без markdown:
[{"idx":0,"ok":true},{"idx":1,"ok":false,"reason":"краткая причина"}, ...]
Включи ВСЕ упражнения (${questions.length} шт.) в ответ.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      messages: [{ role: 'user', content: verifierPrompt }],
    });

    const raw = extractText(message);
    const results = JSON.parse(extractJsonArray(raw));
    const ok = new Set();
    for (const r of results) {
      if (r && r.ok === true && typeof r.idx === 'number') ok.add(r.idx);
    }
    return ok;
  } catch (err) {
    console.warn('Verifier error, keeping all questions as fallback:', err.message);
    // Fallback: keep all. Better to show maybe-imperfect than to fail entirely.
    return new Set(questions.map((_, i) => i));
  }
}

app.post('/api/generate-questions', async (req, res) => {
  const { level, lexicalTopic, grammarTopic, isWortstellung, count } = req.body;

  if (!level || !grammarTopic) {
    return res.status(400).json({ error: 'level and grammarTopic are required' });
  }

  const questionsCount = count || 30;
  const cacheKey = buildCacheKey(level, grammarTopic, lexicalTopic, isWortstellung);

  // Return from server cache if available (already verified upstream)
  if (questionPool[cacheKey] && questionPool[cacheKey].length >= questionsCount) {
    const cached = questionPool[cacheKey].splice(0, questionsCount);
    return res.json({ questions: cached });
  }

  // Merge server-side blacklist into the exclusion list shown to the model
  const blacklist = reportedQuestions[cacheKey]
    ? Array.from(reportedQuestions[cacheKey])
    : [];
  const excludeList = blacklist.slice(-20);
  const excludeNote = excludeList.length > 0
    ? `\nНЕ генерируй эти предложения (они уже были отмечены как ошибочные): ${excludeList.map(t => `"${t}"`).join(', ')}`
    : '';

  // Ask for extras so the verifier can drop some without leaving us short
  const generateCount = Math.ceil(questionsCount * 1.5);

  let taskDescription;
  if (isWortstellung) {
    taskDescription = `Создай ${generateCount} упражнений на ПОРЯДОК СЛОВ (Wortstellung) в немецком языке.
Грамматическая тема, которая должна быть использована в предложениях: ${grammarTopic}.
${lexicalTopic ? `Лексическая тема: ${lexicalTopic}. Все предложения должны использовать слова из этой темы.` : ''}
Формат: в поле "display" даны слова/фразы через " / " в ПЕРЕМЕШАННОМ (случайном) порядке — НЕ в правильном!
Игрок должен угадать правильный порядок из 4 вариантов.
Инструкция (text) должна быть на русском, варианты ответов — полные немецкие предложения.
ВАЖНО: порядок слов в "display" ОБЯЗАН быть СЛУЧАЙНЫМ и НЕ должен совпадать с правильным ответом! Обязательно перемешай слова.
СТРОГО: только ОДИН вариант правильный! Инверсия (например "Morgen gehe ich..." вместо "Ich gehe morgen...") — это тоже правильный порядок слов! Если инверсия допустима, НЕ включай её как неправильный вариант. Неправильные варианты должны содержать ЯВНУЮ ошибку порядка слов (глагол не на 2-м месте, неверная позиция в Nebensatz и т.д.).
Каждое упражнение должно использовать РАЗНЫЕ предложения. Не повторяйся!`;
  } else {
    taskDescription = `Создай ${generateCount} упражнений по немецкой грамматике.
Грамматическая тема: ${grammarTopic}.
${lexicalTopic ? `Лексическая тема: ${lexicalTopic}. Все предложения должны использовать слова из этой темы.` : ''}
Формат: предложение с пропуском ___, нужно выбрать правильный вариант из 4.
Инструкция (text) на русском, display — немецкое предложение с пропуском, варианты — на немецком.
Каждое упражнение должно использовать РАЗНЫЕ предложения. Не повторяйся!`;
  }

  const prompt = `Ты — опытный преподаватель немецкого языка. Создаёшь упражнения для учеников.

${taskDescription}

Уровень CEFR: ${level}. Строго соблюдай уровень! Не используй грамматику и лексику выше ${level}.
${excludeNote}

КРИТИЧЕСКИЕ ПРАВИЛА (нарушение = брак):
1. Правильный ответ ДОЛЖЕН быть грамматически БЕЗУПРЕЧНЫМ. Перед выдачей мысленно проверь каждое предложение: подлежащее, сказуемое, падеж, род, число, порядок слов.
2. Каждое предложение ДОЛЖНО быть ПОЛНЫМ и ЗАВЕРШЁННЫМ по смыслу. Нельзя обрезать предложение! Если для грамматической правильности нужно длинное предложение — пиши длинное. Длина НЕ ограничена.
3. Неправильные варианты должны содержать ОДНУ ЯСНУЮ ошибку (неверный падеж, артикль, окончание, порядок слов). Не делай абсурдных вариантов.
4. РОВНО ОДИН правильный ответ. Если два варианта грамматически верны — это брак.
5. Все 4 варианта должны быть РАЗНЫМИ строками — никаких дубликатов.
6. correct — индекс правильного ответа (0-3). Распределяй РАВНОМЕРНО по позициям.
7. Все ${generateCount} предложений УНИКАЛЬНЫ: разные подлежащие, глаголы, ситуации. Никакого однообразия.
8. Используй живые, естественные предложения как в учебниках Schritte, Menschen, Aspekte.

Ответь ТОЛЬКО валидным JSON-массивом без markdown, без пояснений:
[{"text":"Инструкция на русском","display":"Немецкий текст","options":["A","B","C","D"],"correct":0}]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 6000 },
      messages: [{ role: 'user', content: prompt }],
    });

    const text = extractText(message);
    const questions = JSON.parse(extractJsonArray(text));

    // Structural + uniqueness filter
    const structurallyValid = questions.filter(q =>
      q && typeof q.text === 'string' && typeof q.display === 'string' &&
      Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every(o => typeof o === 'string') &&
      new Set(q.options).size === 4 &&
      typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3
    );

    // Drop any that landed on the blacklist (exact display match)
    const blacklistSet = reportedQuestions[cacheKey] || new Set();
    const notBlacklisted = structurallyValid.filter(q => !blacklistSet.has(q.display));

    // Verifier pass — split into batches of 10 to keep each call manageable
    const verifiedQuestions = [];
    const BATCH = 10;
    for (let i = 0; i < notBlacklisted.length; i += BATCH) {
      const batch = notBlacklisted.slice(i, i + BATCH);
      const okSet = await verifyBatch(batch, level, grammarTopic, lexicalTopic, isWortstellung);
      for (let j = 0; j < batch.length; j++) {
        if (okSet.has(j)) verifiedQuestions.push(batch[j]);
      }
    }

    // Store extras in server cache for future requests
    if (verifiedQuestions.length > questionsCount) {
      if (!questionPool[cacheKey]) questionPool[cacheKey] = [];
      questionPool[cacheKey].push(...verifiedQuestions.slice(questionsCount));
    }

    res.json({ questions: verifiedQuestions.slice(0, questionsCount) });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to generate questions', detail: err.message });
  }
});

// Report a bad question so it won't be regenerated next time this topic is exhausted
app.post('/api/report-question', (req, res) => {
  const { level, grammarTopic, lexicalTopic, isWortstellung, display } = req.body;
  if (!level || !grammarTopic || !display) {
    return res.status(400).json({ error: 'level, grammarTopic, display are required' });
  }

  const cacheKey = buildCacheKey(level, grammarTopic, lexicalTopic, isWortstellung);
  if (!reportedQuestions[cacheKey]) reportedQuestions[cacheKey] = new Set();
  reportedQuestions[cacheKey].add(display);

  // Also drop from any pending server cache so future requests don't return it
  if (questionPool[cacheKey]) {
    questionPool[cacheKey] = questionPool[cacheKey].filter(q => q.display !== display);
  }

  res.json({ ok: true, blacklistSize: reportedQuestions[cacheKey].size });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Morskoy Dungeon running on port ${PORT}`);
});
