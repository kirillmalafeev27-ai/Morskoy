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

// Ausdrücklich an alle Interfaces binden: Im Container erreicht der
// Healthcheck der Plattform sonst nur den Loopback.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Morskoy Dungeon running on port ${PORT}`);
});
