// Tumblerify v2 — minimal static-serving Express app.
// All image generation happens client-side via Canvas API.
// No more archiver, pdf-lib, sharp, or server-side processing.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// Serve the static SPA from /public
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// Health check for Render
app.get('/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));

// SPA fallback — anything else routes to index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Tumblerify v2 listening on port ${PORT}`);
});
