import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import Frustum from './public/frustum.js';

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MM = 2.8346;
function hex2rgb(hex) {
  const h = hex.replace('#','');
  return { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255 };
}

// ── Analyze ───────────────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    const b64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype;
    const params = Frustum.compute(req.body.sizeKey || '16oz', 10);
    const prompt = `You are analyzing a design image that will be printed as a tumbler wrap for a ${params.label} cup. The wrap will be ${Math.round(params.outerArc)}mm wide at the top and ${Math.round(params.innerArc)}mm wide at the bottom, ${Math.round(params.slant)}mm tall.
Respond ONLY with valid JSON, no markdown, no backticks:
{"style":"2-4 word style description","colors":["#hex1","#hex2","#hex3","#hex4","#hex5"],"colorNames":["name1","name2","name3","name4","name5"],"mood":"one sentence describing the feel","printQuality":"good|fair|low","printNote":"one sentence about print quality","recommendation":"one practical tip"}`;
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: prompt }] }]
    });
    let json;
    try { json = JSON.parse(result.candidates[0].content.parts[0].text.trim().replace(/```json|```/g,'').trim()); }
    catch { json = { style:'Custom design', colors:['#e8b4b8','#a8d8ea','#f7e7ce','#cce2cb','#b8b3c8'], colorNames:['Rose','Sky','Cream','Sage','Lavender'], mood:'A beautiful design ready to wrap your tumbler.', printQuality:'good', printNote:'Design looks good for this wrap size.', recommendation:'Ensure your image is at least 150dpi for crisp results.' }; }
    res.json(json);
  } catch (err) { console.error('Analyze error:', err); res.status(500).json({ error: err.message }); }
});

// ── Generate PDF + SVG + ZIP ──────────────────────────────────────────────────
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    const sizeKey   = req.body.sizeKey || '16oz';
    const overlapMm = parseFloat(req.body.overlapMm) || 10;
    const analysisJson = req.body.analysis ? JSON.parse(req.body.analysis) : null;
    const params    = Frustum.compute(sizeKey, overlapMm);

    // Convert uploaded image to PNG
    const pngBuffer = await sharp(req.file.buffer).png().toBuffer();

    // ── SVG cutfile ──────────────────────────────────────────────────────────
    const { arcPath, boundingBox } = Frustum;
    const scSVG  = 3.7795;
    const bbox   = boundingBox(params);
    const paths  = arcPath(params, scSVG);
    const svgCutfile = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(bbox.width*scSVG).toFixed(1)}px" height="${(bbox.height*scSVG).toFixed(1)}px" viewBox="0 0 ${(bbox.width*scSVG).toFixed(1)} ${(bbox.height*scSVG).toFixed(1)}">
  <title>Tumbler Wrap Cutfile - ${params.label}</title>
  <desc>Top arc: ${Math.round(params.outerArc)}mm  Bottom arc: ${Math.round(params.innerArc)}mm  Height: ${Math.round(params.slant)}mm  Overlap: ${overlapMm}mm</desc>
  <g transform="translate(${(bbox.cx*scSVG).toFixed(1)}, ${(bbox.cy*scSVG).toFixed(1)})">
    <path d="${paths.d}" fill="none" stroke="#000000" stroke-width="0.5"/>
    <path d="${paths.overlapLine}" fill="none" stroke="#000000" stroke-width="0.5" stroke-dasharray="4,3"/>
  </g>
</svg>`;

    // ── PDF with pdf-lib ─────────────────────────────────────────────────────
    const pdfDoc   = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontB    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pngImage = await pdfDoc.embedPng(pngBuffer);

    const A4W = 595.28, A4H = 841.89, MAR = 14 * MM;
    const purple      = rgb(0.361, 0.357, 0.831);
    const purpleLight = rgb(0.933, 0.929, 0.996);
    const purpleDark  = rgb(0.235, 0.204, 0.537);
    const grayC       = rgb(0.53, 0.53, 0.53);
    const lightGray   = rgb(0.96, 0.96, 0.97);
    const blackC      = rgb(0.1, 0.1, 0.1);
    const white       = rgb(1, 1, 1);

    // PAGE 1 — Info sheet
    const p1 = pdfDoc.addPage([A4W, A4H]);
    p1.drawRectangle({ x:0, y:A4H-28, width:A4W, height:28, color:purple });
    p1.drawText('TUMBLERIFY', { x:MAR, y:A4H-19, size:9, font:fontB, color:white });
    p1.drawText(`${params.label} Tumbler Wrap`, { x:A4W-MAR-110, y:A4H-19, size:9, font, color:white });

    // Image preview
    const imgH = 160, imgY = A4H - 28 - MAR - imgH;
    const imgW = A4W - MAR*2;
    p1.drawRectangle({ x:MAR, y:imgY, width:imgW, height:imgH, color:lightGray });
    const ar = pngImage.width / pngImage.height;
    let dw = imgW - 16, dh = dw / ar;
    if (dh > imgH - 16) { dh = imgH-16; dw = dh*ar; }
    p1.drawImage(pngImage, { x: MAR+(imgW-dw)/2, y: imgY+(imgH-dh)/2, width:dw, height:dh });
    p1.drawText('Design preview — see page 2 for the print-ready wrap template', { x:MAR, y:imgY-11, size:7, font, color:grayC });

    // Spec cards
    const specData = [
      ['TOP CIRCUMFERENCE', `${Math.round(params.outerArc)} mm`],
      ['BOTTOM CIRCUMFERENCE', `${Math.round(params.innerArc)} mm`],
      ['WRAP HEIGHT (SLANT)', `${Math.round(params.slant)} mm`],
      ['OVERLAP TAB', `${overlapMm} mm`],
    ];
    const specCardW = (imgW - 9) / 4;
    const specY = imgY - 52;
    specData.forEach(([label, val], i) => {
      const sx = MAR + i * (specCardW + 3);
      p1.drawRectangle({ x:sx, y:specY-8, width:specCardW, height:40, color:lightGray });
      p1.drawText(label, { x:sx+5, y:specY+24, size:5.5, font, color:grayC });
      p1.drawText(val,   { x:sx+5, y:specY+8,  size:11, font:fontB, color:blackC });
    });

    // AI panel
    let curY = specY - 20;
    if (analysisJson) {
      p1.drawRectangle({ x:MAR, y:curY-72, width:imgW, height:80, color:purpleLight });
      p1.drawText('AI DESIGN ANALYSIS', { x:MAR+8, y:curY+1, size:7, font:fontB, color:purpleDark });

      const qLabel = analysisJson.printQuality === 'good' ? 'PRINT READY' : analysisJson.printQuality === 'fair' ? 'CHECK RESOLUTION' : 'LOW RESOLUTION';
      const qColor = analysisJson.printQuality === 'good' ? rgb(0.15,0.31,0.04) : analysisJson.printQuality === 'fair' ? rgb(0.52,0.22,0.02) : rgb(0.63,0.12,0.12);
      p1.drawText(qLabel, { x:A4W-MAR-88, y:curY+1, size:7, font:fontB, color:qColor });

      (analysisJson.colors || []).slice(0,5).forEach((hex, i) => {
        const c = hex2rgb(hex);
        p1.drawRectangle({ x:MAR+8+i*22, y:curY-22, width:18, height:18, color:rgb(c.r,c.g,c.b) });
      });
      p1.drawText(analysisJson.style || '', { x:MAR+8, y:curY-34, size:9, font:fontB, color:purpleDark });
      p1.drawText((analysisJson.mood||'').slice(0,100), { x:MAR+8, y:curY-46, size:8, font, color:purpleDark });
      p1.drawText((analysisJson.printNote||'').slice(0,100), { x:MAR+8, y:curY-58, size:7, font, color:grayC });
      curY -= 88;

      // Tip
      p1.drawRectangle({ x:MAR, y:curY-22, width:3, height:30, color:purple });
      p1.drawText('PRINT TIP', { x:MAR+9, y:curY+2, size:7, font:fontB, color:purple });
      p1.drawText((analysisJson.recommendation||'').slice(0,110), { x:MAR+9, y:curY-10, size:8, font, color:blackC });
    }

    // Footer
    p1.drawLine({ start:{x:MAR,y:26}, end:{x:A4W-MAR,y:26}, thickness:0.5, color:lightGray });
    p1.drawText(`Generated by Tumblerify  •  ${params.label}  •  Arc angle: ${params.sweepDeg.toFixed(1)}°`, { x:MAR, y:12, size:7, font, color:grayC });
    p1.drawText('Print at 100% scale — do not scale to fit', { x:A4W-MAR-155, y:12, size:7, font, color:grayC });

    // PAGE 2 — Print & cut sheet at actual dimensions
    const p2 = pdfDoc.addPage([A4W, A4H]);
    p2.drawText('PRINT & CUT SHEET  —  Print at 100%, do not scale to fit', { x:MAR, y:A4H-MAR-10, size:8, font:fontB, color:purple });
    p2.drawText(`${params.label}  •  Top ${Math.round(params.outerArc)}mm  •  Bottom ${Math.round(params.innerArc)}mm  •  Height ${Math.round(params.slant)}mm  •  Overlap ${overlapMm}mm`, { x:MAR, y:A4H-MAR-22, size:7, font, color:grayC });

    // Scale image to actual wrap size in points, fit within page
    const wrapWpt = params.outerArc * MM;
    const wrapHpt = params.slant    * MM;
    const printableW = A4W - MAR*2;
    const printableH = A4H - MAR*2 - 50;
    const fitSc = Math.min(printableW / wrapWpt, printableH / wrapHpt, 1);
    const fw = wrapWpt * fitSc;
    const fh = wrapHpt * fitSc;
    const ix = (A4W - fw) / 2;
    const iy = (A4H - fh) / 2 - 10;

    p2.drawImage(pngImage, { x:ix, y:iy, width:fw, height:fh });
    // Cut border
    p2.drawRectangle({ x:ix, y:iy, width:fw, height:fh, borderColor:purple, borderWidth:1, opacity:0 });
    // Overlap tab dashed line
    const overlapPt = (overlapMm * MM) * fitSc;
    p2.drawLine({ start:{x:ix+fw-overlapPt, y:iy}, end:{x:ix+fw-overlapPt, y:iy+fh}, thickness:1, color:purple, dashArray:[4,3] });

    // Dimension annotations
    p2.drawText(`|-- ${Math.round(params.outerArc)} mm --|`, { x:ix + fw/2 - 18, y:iy + fh + 8, size:7, font, color:blackC });
    p2.drawText(`H: ${Math.round(params.slant)} mm`, { x:ix + fw + 5, y:iy + fh/2, size:7, font, color:blackC });
    p2.drawText(`overlap tab: ${overlapMm}mm`, { x:ix + fw - overlapPt - 58, y:iy - 12, size:7, font, color:purple });

    if (fitSc < 0.99) {
      p2.drawText(`Note: scaled to ${(fitSc*100).toFixed(0)}% to fit A4. For true 1:1, print on larger paper or use a print shop.`, { x:MAR, y:iy-22, size:7, font, color:grayC });
    }

    p2.drawLine({ start:{x:MAR,y:26}, end:{x:A4W-MAR,y:26}, thickness:0.5, color:lightGray });
    p2.drawText('Use the included SVG cutfile in Cricut Design Space / Silhouette Studio / Inkscape for the precise arc cut path', { x:MAR, y:12, size:7, font, color:grayC });

    const pdfBytes = await pdfDoc.save();

    // ── ZIP ───────────────────────────────────────────────────────────────────
    const sizeName = sizeKey.replace('/','');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="tumblerify-${sizeName}.zip"`);
    const archive = archiver('zip', { zlib: { level:6 } });
    archive.pipe(res);
    archive.append(Buffer.from(pdfBytes), { name:`tumbler-wrap-${sizeName}.pdf` });
    archive.append(Buffer.from(svgCutfile), { name:`tumbler-cutfile-${sizeName}.svg` });
    await archive.finalize();

  } catch (err) {
    console.error('Generate error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tumblerify running on port ${PORT}`));
