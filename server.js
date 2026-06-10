const express = require('express');
const path = require('path');
const { installQuizRoutes } = require('./quiz-generation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
installQuizRoutes(app);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Morskoy Dungeon running on http://localhost:${PORT}`);
});
