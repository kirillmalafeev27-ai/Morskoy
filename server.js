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

  const questionsCount = count || 6;
  const cacheKey = `${level}:${grammarTopic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;

  // Return from server cache if available
  if (questionPool[cacheKey] && questionPool[cacheKey].length >= questionsCount) {
    const cached = questionPool[cacheKey].splice(0, questionsCount);
    res.json({ questions: cached });
    return;
  }

  // Sentence length guide per CEFR level
  const lengthGuide = {
    'A1': '3-5 слов, простые предложения (Ich bin müde. Er hat einen Hund.)',
    'A2': '5-8 слов, простые распространённые предложения (Ich gehe morgen in die Schule.)',
    'B1': '8-12 слов, сложносочинённые и сложноподчинённые (Ich weiß, dass er morgen nach Berlin fährt.)',
    'B2': '10-15 слов, сложные конструкции (Obwohl er müde war, hat er das Buch zu Ende gelesen.)',
  };
  const sentenceLen = lengthGuide[level] || lengthGuide['A2'];

  // Short exclusion — send only display texts, max 10
  let excludeNote = '';
  if (exclude && exclude.length > 0) {
    const short = exclude.slice(-10).map(t => `"${t}"`).join(', ');
    excludeNote = `\nНЕ используй эти предложения: ${short}`;
  }

  let task;
  if (isWortstellung) {
    task = `${questionsCount} упражнений на Wortstellung (${grammarTopic}).${lexicalTopic ? ` Тема: ${lexicalTopic}.` : ''}
display: слова через " / " в СЛУЧАЙНОМ порядке (НЕ правильном!). options: 4 полных предложения, 1 правильное.`;
  } else {
    task = `${questionsCount} упражнений: ${grammarTopic}, пропуск ___.${lexicalTopic ? ` Тема: ${lexicalTopic}.` : ''}
display: предложение с ___. options: 4 варианта, 1 правильный.`;
  }

  const prompt = `Немецкая грамматика, ${level}. ${task}
Длина предложений: ${sentenceLen}.
text — задание на русском. correct — индекс (0-3), распределяй равномерно.
Все предложения УНИКАЛЬНЫЕ, разнообразные, грамматически безупречные. Один правильный ответ.${excludeNote}
JSON-массив без markdown:
[{"text":"...","display":"...","options":["...","...","...","..."],"correct":0}]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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
