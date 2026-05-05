// Tumblerify v3.1 — Pro-quality with stability fallback.
// Always tries Nano Banana Pro first for highest quality. Falls back to
// Nano Banana 2 on transient errors (503, rate limits, timeouts) so users
// who paid for a generation always get one — just sometimes a hair lower fidelity.
//
// Static files for the SPA, plus three API routes:
//   GET  /api/config         — exposes whether AI features are available
//   POST /api/generate-image — text → image with quality cascade
//   POST /api/extend-image   — image + target ratio → outpainted image

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';

// Quality cascade — always try the best, fall back on transient failure.
// "primary" is the quality target; "fallback" guarantees the user gets *something*.
const MODELS = {
  primary:  'gemini-3-pro-image-preview',       // Nano Banana Pro — 4K, best text, slowest
  fallback: 'gemini-3.1-flash-image-preview'    // Nano Banana 2    — 2K, fast, more stable
};
const ENDPOINT = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

// HTTP status codes that warrant a fallback. Hard errors like 400/401/403 should
// fail loudly — they're not capacity issues, they're broken requests.
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

app.use(express.json({ limit: '20mb' }));   // big enough for base64 images
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

// ─── Health & config ─────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, version: '3.1.0' }));
app.get('/api/config', (_req, res) => res.json({
  aiEnabled: !!API_KEY,
  primaryModel: MODELS.primary
}));

// ─── Helper: call Gemini for one model, one attempt ──────────────────────────
async function tryGenerate({ model, prompt, inputImageDataUrl, aspectRatio, imageSize }) {
  const parts = [{ text: prompt }];
  if (inputImageDataUrl) {
    const m = inputImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) throw new Error('Invalid input image data URL');
    parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  // Gemini's REST API uses snake_case for these fields
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['Image'],
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: imageSize
      }
    }
  };

  // Time-bound the call — Pro can hang for 30+ seconds during overload, and we'd
  // rather fail fast and try the fallback than make the user wait
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);

  let r;
  try {
    r = await fetch(ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError or network error — treat as transient
    const e = new Error(`Network/timeout calling ${model}: ${err.message}`);
    e.transient = true;
    throw e;
  }
  clearTimeout(timer);

  if (!r.ok) {
    const txt = await r.text();
    const e = new Error(`${model} returned ${r.status}: ${txt.slice(0, 300)}`);
    e.status = r.status;
    e.transient = TRANSIENT_STATUSES.has(r.status);
    throw e;
  }

  const data = await r.json();
  for (const c of (data.candidates || [])) {
    for (const p of (c.content?.parts || [])) {
      const inline = p.inline_data || p.inlineData;
      if (inline?.data) {
        const mime = inline.mime_type || inline.mimeType || 'image/png';
        return { dataUrl: `data:${mime};base64,${inline.data}`, model };
      }
    }
  }
  // Sometimes Gemini returns a candidate with only safety blocks or text, no image.
  // That's not transient — the prompt got blocked. Surface it.
  const e = new Error(`${model} returned no image (likely safety filter): ${JSON.stringify(data).slice(0, 300)}`);
  e.transient = false;
  throw e;
}

// ─── Helper: full quality cascade with retry ─────────────────────────────────
//   1. Try primary (Pro)
//   2. On transient failure, retry primary once after 1s
//   3. On second failure, drop to fallback (NB2)
//   4. Surface the original primary error if fallback also fails, so logs stay useful
async function callGeminiWithFallback(args) {
  if (!API_KEY) throw new Error('GOOGLE_API_KEY not configured on server');

  let primaryError;
  // Attempt 1: primary
  try {
    return await tryGenerate({ model: MODELS.primary, ...args });
  } catch (err) {
    primaryError = err;
    if (!err.transient) throw err;     // hard errors propagate immediately
    console.warn(`[primary attempt 1 failed] ${err.message}`);
  }

  // Attempt 2: primary again after 1s (catches blips)
  await new Promise(r => setTimeout(r, 1000));
  try {
    return await tryGenerate({ model: MODELS.primary, ...args });
  } catch (err) {
    if (!err.transient) throw err;
    console.warn(`[primary attempt 2 failed] ${err.message}`);
  }

  // Attempt 3: fallback model. If THIS fails too, throw the original primary error
  // because it's more diagnostic than "fallback also failed"
  try {
    const result = await tryGenerate({ model: MODELS.fallback, ...args });
    console.log(`[fallback used] succeeded on ${MODELS.fallback}`);
    return result;
  } catch (err) {
    console.error(`[fallback failed] ${err.message}`);
    throw primaryError;
  }
}

// ─── Generate from prompt ────────────────────────────────────────────────────
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, aspectRatio = '1:1', imageSize = '4K' } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });

    const augmented = `${prompt.trim()}. Sublimation tumbler wrap design, focal subject centered, clean composition suitable for printing on a stainless steel tumbler.`;

    const result = await callGeminiWithFallback({ prompt: augmented, aspectRatio, imageSize });
    res.json({ dataUrl: result.dataUrl, modelUsed: result.model });
  } catch (err) {
    console.error('generate-image error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Extend / outpaint an uploaded image to a new aspect ratio ───────────────
app.post('/api/extend-image', async (req, res) => {
  try {
    const { imageDataUrl, aspectRatio, imageSize = '4K' } = req.body || {};
    if (!imageDataUrl) return res.status(400).json({ error: 'imageDataUrl required' });

    const prompt = `Extend this image to fill a ${aspectRatio} aspect ratio. Continue the existing artwork seamlessly into the new edge areas, matching style, colors, and content. Do not change the original subject — only extend the background and edges naturally.`;

    const result = await callGeminiWithFallback({ prompt, inputImageDataUrl: imageDataUrl, aspectRatio, imageSize });
    res.json({ dataUrl: result.dataUrl, modelUsed: result.model });
  } catch (err) {
    console.error('extend-image error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Tumblerify v3.1 listening on :${PORT}  (AI ${API_KEY ? 'enabled, primary=' + MODELS.primary : 'DISABLED — set GOOGLE_API_KEY'})`);
});
