[README.md](https://github.com/user-attachments/files/27357113/README.md)
# Tumblerify v2

Generate print-ready tumbler wrap PNGs at any standard sublimation size, with photo-style preview mockups for Etsy listings.

## What changed in v2

- **PNG output instead of PDF/SVG.** Aligns with how sublimation sellers actually use these files.
- **All processing client-side.** No more `archiver`, `pdf-lib`, or `sharp` on the server.
- **Three outputs per size:** Flat, Tapered (print-ready), and 3-tumbler Preview Mockup.
- **Auto-adjusting dimensions.** Switch sizes and every output recalculates to industry-standard sublimation specs at 300 DPI.

## Output files

For each generation you get:

1. **Flat / Square** — design at exact print dimensions for the chosen size (e.g. 20oz = 9.3" × 8.2" @ 300 DPI = 2790 × 2460 px). Use as a flat preview or for "no-trim" wrap workflows.
2. **Tapered (Print-Ready)** — same design transformed into a trapezoid (top wider than bottom) so it lands square when applied to the cup's actual taper.
3. **Preview Mockup** — three-tumbler photo-style PNG (1500 × 1000) for Etsy listing imagery, with cylinder mapping, lighting, and a stainless lid.

## Supported sizes

Industry-standard sublimation specs are baked in for: 11oz Mug, 12oz Skinny, 15oz Mug, 16oz Pint, **20oz Skinny**, 22oz Fatty, 30oz Tumbler, 40oz Quencher.

To add or tweak: edit the `TUMBLER_SIZES` config at the top of the `<script>` block in `public/index.html`.

## Local dev

```bash
npm install
npm start
# → http://localhost:3000
```

## Deploy to Render

1. Push to GitHub.
2. New → Web Service → connect repo.
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Node version: 18+

That's it. No API keys, no environment variables, no external services.

## Architecture

```
tumblerify/
├── server.js          # ~20 lines, just serves /public
├── package.json       # only dependency: express
├── public/
│   └── index.html     # the entire app — UI, canvas math, ZIP download
└── README.md
```

All image generation happens in the browser via Canvas API. JSZip is loaded from CDN for the ZIP download. Files never leave the user's device.
