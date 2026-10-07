'use strict';

const path = require('path');
const express = require('express');
const { obfuscate } = require('./src/obfuscator');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/** 极简内存限流（不引入额外依赖） */
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) {
      if (v.reset < now) hits.delete(k);
    }
  }, windowMs);
  timer.unref();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let rec = hits.get(key);

    if (!rec || rec.reset < now) {
      rec = { count: 0, reset: now + windowMs };
      hits.set(key, rec);
    }

    rec.count++;
    if (rec.count > max) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    next();
  };
}

app.post(
  '/api/obfuscate',
  rateLimit({ windowMs: 60_000, max: 60 }),
  (req, res) => {
    const { code, options } = req.body || {};

    if (typeof code !== 'string') {
      return res.status(400).json({ error: 'code 必须是字符串' });
    }
    if (code.trim().length === 0) {
      return res.status(400).json({ error: '代码不能为空' });
    }

    try {
      const result = obfuscate(code, options || {});
      res.json({ ok: true, code: result });
    } catch (err) {
      res.status(400).json({ error: err.message || '混淆失败' });
    }
  }
);

app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// 兜底：未匹配的页面请求返回首页
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Lua Obfuscator 已启动: http://localhost:${PORT}`);
  });
}

module.exports = app;
