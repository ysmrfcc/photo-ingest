const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 静的配信（必要なら）
app.use(express.static(path.join(__dirname, 'public')));

// ヘルスチェック
app.get('/', (_req, res) => res.send('OK'));

// 実処理（例）
app.get('/api/ping', (_req, res) => res.json({ pong: true }));

app.listen(port, '0.0.0.0', () => {
  console.log(`listening on ${port}`);
});
