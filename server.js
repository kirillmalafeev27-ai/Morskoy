const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Claude API client
const anthropic = new Anthropic();

// Generate grammar exercises via Claude API
app.post('/api/generate-questions', async (req, res) => {
  const { level, lexicalTopic, grammarTopic, isWortstellung, count } = req.body;

  if (!level || !grammarTopic) {
    return res.status(400).json({ error: 'level and grammarTopic are required' });
  }

  const questionsCount = count || 3;

  let taskDescription;
  if (isWortstellung) {
    taskDescription = `Создай ${questionsCount} упражнений на ПОРЯДОК СЛОВ (Wortstellung) в немецком языке.
Грамматическая тема, которая должна быть использована в предложениях: ${grammarTopic}.
${lexicalTopic ? `Лексическая тема: ${lexicalTopic}. Все предложения должны использовать слова из этой темы.` : ''}
Формат: даны слова через " / ", нужно выбрать правильный порядок слов из 4 вариантов.
Инструкция (text) должна быть на русском, варианты ответов — полные немецкие предложения.`;
  } else {
    taskDescription = `Создай ${questionsCount} упражнений по немецкой грамматике.
Грамматическая тема: ${grammarTopic}.
${lexicalTopic ? `Лексическая тема: ${lexicalTopic}. Все предложения должны использовать слова из этой темы.` : ''}
Формат: предложение с пропуском ___, нужно выбрать правильный вариант из 4.
Инструкция (text) на русском, display — немецкое предложение с пропуском, варианты — на немецком.`;
  }

  const prompt = `${taskDescription}

Уровень CEFR: ${level}. Строго соблюдай уровень! Не используй грамматику и лексику выше ${level}.

Ответь ТОЛЬКО валидным JSON-массивом без markdown, без пояснений. Формат:
[
  {
    "text": "Инструкция на русском",
    "display": "Немецкий текст задания",
    "options": ["вариант1", "вариант2", "вариант3", "вариант4"],
    "correct": 0
  }
]

correct — индекс правильного ответа (0-3). Правильный ответ должен быть НА РАЗНЫХ позициях (не всегда 0).
Все 4 варианта должны быть правдоподобными, но только один правильный.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text.trim();

    // Parse JSON from response (handle possible markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const questions = JSON.parse(jsonStr);

    // Validate structure
    const valid = questions.filter(q =>
      q.text && q.display && Array.isArray(q.options) &&
      q.options.length === 4 && typeof q.correct === 'number' &&
      q.correct >= 0 && q.correct <= 3
    );

    res.json({ questions: valid });
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
