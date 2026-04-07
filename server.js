const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic();

// Server-side question cache to avoid duplicate API calls
const questionPool = {}; // key: "level:grammar:lexical" -> array of questions

app.post('/api/generate-questions', async (req, res) => {
  const { level, lexicalTopic, grammarTopic, isWortstellung, count, exclude } = req.body;

  if (!level || !grammarTopic) {
    return res.status(400).json({ error: 'level and grammarTopic are required' });
  }

  const questionsCount = count || 12;
  const cacheKey = `${level}:${grammarTopic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;

  // Return from server cache if available
  if (questionPool[cacheKey] && questionPool[cacheKey].length >= questionsCount) {
    const cached = questionPool[cacheKey].splice(0, questionsCount);
    res.json({ questions: cached });
    return;
  }

  // Short exclusion — send only display texts, max 10
  let excludeNote = '';
  if (exclude && exclude.length > 0) {
    const short = exclude.slice(-10).map(t => `"${t}"`).join(', ');
    excludeNote = `\nНЕ используй эти предложения: ${short}`;
  }

  let taskDescription;
  if (isWortstellung) {
    taskDescription = `Создай ${questionsCount} упражнений на ПОРЯДОК СЛОВ (Wortstellung) в немецком языке.
Грамматическая тема, которая должна быть использована в предложениях: ${grammarTopic}.
${lexicalTopic ? `Лексическая тема: ${lexicalTopic}. Все предложения должны использовать слова из этой темы.` : ''}
Формат: в поле "display" даны слова/фразы через " / " в ПЕРЕМЕШАННОМ (случайном) порядке — НЕ в правильном!
Игрок должен угадать правильный порядок из 4 вариантов.
Инструкция (text) должна быть на русском, варианты ответов — полные немецкие предложения.
ВАЖНО: порядок слов в "display" ОБЯЗАН быть СЛУЧАЙНЫМ и НЕ должен совпадать с правильным ответом! Обязательно перемешай слова.
Каждое упражнение должно использовать РАЗНЫЕ предложения. Не повторяйся!`;
  } else {
    taskDescription = `Создай ${questionsCount} упражнений по немецкой грамматике.
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
2. Неправильные варианты должны содержать ОДНУ ЯСНУЮ ошибку (неверный падеж, артикль, окончание, порядок слов). Не делай абсурдных вариантов.
3. РОВНО ОДИН правильный ответ. Если два варианта грамматически верны — это брак.
4. correct — индекс правильного ответа (0-3). Распределяй РАВНОМЕРНО по позициям.
5. Все ${questionsCount} предложений УНИКАЛЬНЫ: разные подлежащие, глаголы, ситуации. Никакого однообразия.
6. Используй живые, естественные предложения как в учебниках Schritte, Menschen, Aspekte.

Ответь ТОЛЬКО валидным JSON-массивом без markdown, без пояснений:
[{"text":"Инструкция на русском","display":"Немецкий текст","options":["A","B","C","D"],"correct":0}]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text.trim();
    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const questions = JSON.parse(jsonStr);
    const valid = questions.filter(q =>
      q.text && q.display && Array.isArray(q.options) &&
      q.options.length === 4 && typeof q.correct === 'number' &&
      q.correct >= 0 && q.correct <= 3
    );

    // Store extras in server cache
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
