[README (3).md](https://github.com/user-attachments/files/27390233/README.3.md)
# Tumblerify v3.1

AI-generated or uploaded designs → print-ready tumbler wraps at any size. Built for integration into Creative Fabrica Studio's paid tier.

## What this does

1. User picks a tumbler size (8 industry-standard options).
2. User either uploads a design OR generates one with AI from a text prompt.
3. App outputs print-ready PNGs at exact print dimensions:
   - **Flat/Straight** — design at full print resolution for the chosen size
   - **Tapered/Warped** — same design transformed into the trapezoid that compensates for the cup's taper

A Straight/Warped toggle in the results section lets users preview both output formats before downloading.

## AI architecture (v3.1)

**Quality cascade with automatic fallback:**

```
User clicks "Generate"
     ↓
Try Nano Banana Pro (gemini-3-pro-image-preview, 4K)
     ↓ transient failure (503/429/timeout)
Retry Nano Banana Pro after 1s
     ↓ transient failure again
Fall back to Nano Banana 2 (gemini-3.1-flash-image-preview, 4K)
     ↓ success
Return image + which model was used
```

**Why this design:**
- Pro produces highest quality, especially for designs with text (Mom, Mama, names, dates)
- Pro is in preview status with reported 45% failure rate during peak hours
- Fallback to NB2 means the user always gets a generated image rather than an error
- Hard errors (auth, safety filter, malformed request) fail loudly without retry — they're not capacity issues

The `modelUsed` field in API responses tells the client which model actually produced the image. You can surface this in your CF Studio coin-deduction logic (charge the same regardless, or charge less when fallback was used — your call).

## Smart fit for uploads

When a user uploads an image whose aspect ratio doesn't match the cup, three options appear:
- **Crop to fit** — fastest, free, loses edges
- **Mirror extend** — free, instant, best for symmetric/abstract designs
- **AI extend ✨** — uses the same Pro→NB2 cascade to outpaint the missing edges

## CF Studio integration notes

The recommended path for "use design from another CF tool → make tumbler" flow:

```javascript
// User just generated an image in nano banana 2 elsewhere in CF Studio.
// One click to "Use as tumbler":
fetch('https://tumblerify.creativefabrica.com/api/extend-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageDataUrl: theGeneratedImage,
    aspectRatio: '5:4',      // for 20oz Skinny — see TUMBLER_SIZES.aiRatio
    imageSize: '4K'
  })
})
```

The tapering and download steps remain client-side, so once the image is fitted to the right aspect, it can be passed back to the user's browser for the final processing.

## Setup

```bash
npm install
export GOOGLE_API_KEY=your-gemini-key   # or GEMINI_API_KEY
npm start
# → http://localhost:3000
```

The Gemini key needs **billing enabled** — Nano Banana Pro and Nano Banana 2 are paid preview models with no free tier.

## Cost ledger (per generation, before CF markup)

| Action | Model used | API cost | Notes |
|---|---|---|---|
| Generate from prompt (Pro 4K) | Pro | $0.134 | Primary path |
| Generate from prompt (Pro 4K, fallback) | NB2 | $0.045 | When Pro fails |
| AI extend uploaded image | Pro | $0.134 | Same cascade |
| Upload + cover/mirror fit + tapered | none | $0 | Pure client-side canvas |

Build your coin pricing on top of these numbers. Suggested 3x markup yields ~40 coins per Pro generation if you peg 1 coin = $0.01.

## Deploy to Render

1. Push to GitHub.
2. New → Web Service → connect repo.
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Add env var: `GOOGLE_API_KEY` = your key (with billing enabled)
6. Node version: 18+

## Architecture

```
tumblerify/
├── server.js          # ~170 lines — static + AI endpoints with quality cascade
├── package.json       # only dep: express
├── public/
│   └── index.html     # SPA — UI, canvas processing, fit strategies
└── README.md
```

Server endpoints:
- `GET  /api/config`         — `{ aiEnabled, primaryModel }`
- `POST /api/generate-image` — text → image, returns `{ dataUrl, modelUsed }`
- `POST /api/extend-image`   — image + ratio → outpainted, returns `{ dataUrl, modelUsed }`

## Tumbler sizes

Industry-standard sublimation specs at 300 DPI for: 11oz Mug, 12oz Skinny, 15oz Mug, 16oz Pint, **20oz Skinny**, 22oz Fatty, 30oz Tumbler, 40oz Quencher.

Each size has an `aiRatio` field mapping to the closest Gemini-supported aspect ratio. Edit `TUMBLER_SIZES` at the top of `<script>` in `public/index.html` to adjust for non-standard cup vendors.
