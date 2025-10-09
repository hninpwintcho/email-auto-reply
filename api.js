const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json());

app.get('/template', (_, res) => {
  res.send(JSON.parse(fs.readFileSync('./template.json', 'utf-8')));
});

app.post('/template', (req, res) => {
  const { subject, content } = req.body;
  fs.writeFileSync('./template.json', JSON.stringify({ subject, content }));
  res.send({ success: true });
});

module.exports = () => {
  app.listen(process.env.API_PORT, () => {
    console.log(`API server running on port ${process.env.API_PORT}`);
  });
};
