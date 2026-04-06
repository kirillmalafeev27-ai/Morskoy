const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for generating grammar exercises via AI
// For now returns structured placeholder - connect your AI provider here
app.post('/api/generate-question', (req, res) => {
  const { topic, level } = req.body;
  // This endpoint is designed to be connected to an AI API (Claude, etc.)
  // For now, it returns from a local bank of questions
  res.json({ success: true, message: 'Use client-side question bank for now' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Morskoy Dungeon running on port ${PORT}`);
});
