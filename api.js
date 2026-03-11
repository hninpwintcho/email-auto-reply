require('dotenv').config();
const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json());

app.get('/template', (_, res) => {
  res.json(JSON.parse(fs.readFileSync('./template.json', 'utf-8')));
});

app.post('/template', (req, res) => {
  const { subject, content } = req.body;
  fs.writeFileSync('./template.json', JSON.stringify({ subject, content }));
  res.json({ success: true });
});

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});