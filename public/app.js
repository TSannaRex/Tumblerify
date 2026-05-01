// app.js — Tumblerify frontend
import Frustum from './frustum.js';

// ── State ───────────────────────────────────────────────────────────────────
let state = {
  sizeKey:    '16oz',
  overlapMm:  10,
  imageFile:  null,
  imageUrl:   null,
  imageEl:    null,
  previewMode: 'flat',
  analysis:   null,
  params:     null
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const sizeGrid      = document.getElementById('sizeGrid');
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const uploadPreview = document.getElementById('uploadPreview');
const previewThumb  = document.getElementById('previewThumb');
const clearImageBtn = document.getElementById('clearImage');
const overlapSlider = document.getElementById('overlapSlider');
const overlapVal    = document.getElementById('overlapVal');
const flatCanvas    = document.getElementById('flatCanvas');
const cup3dCanvas   = document.getElementById('cup3dCanvas');
const flatWrap      = document.getElementById('flatWrap');
const cup3dWrap     = document.getElementById('cup3dWrap');
const canvasEmpty   = document.getElementById('canvasEmpty');
const previewLabel  = document.getElementById('previewLabel');
const previewDims   = document.getElementById('previewDims');
const aiPanel       = document.getElementById('aiPanel');
const btnAnalyze    = document.getElementById('btnAnalyze');
const btnDownload   = document.getElementById('btnDownload');

// ── Init size buttons ────────────────────────────────────────────────────────
function initSizeGrid() {
  const sizes = Frustum.SIZES;
  Object.entries(sizes).forEach(([key, s]) => {
    const btn = document.createElement('button');
    btn.className = 'size-btn' + (key === state.sizeKey ? ' active' : '');
    btn.dataset.key = key;
    btn.innerHTML = `<span class="sz-label">${s.label}</span><span class="sz-sub">${key}</span>`;
    btn.addEventListener('click', () => selectSize(key));
    sizeGrid.appendChild(btn);
  });
}

function selectSize(key) {
  state.sizeKey = key;
  state.params  = Frustum.compute(key, state.overlapMm);
  document.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
  updatePreviewLabel();
  renderPreview();
}

// ── Upload ───────────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});

clearImageBtn.addEventListener('click', () => {
  state.imageFile = null;
  state.imageUrl  = null;
  state.imageEl   = null;
  state.analysis  = null;
  uploadPreview.style.display = 'none';
  uploadZone.style.display    = '';
  aiPanel.style.display       = 'none';
  fileInput.value = '';
  updateButtons();
  renderPreview();
});

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  state.imageFile = file;
  state.analysis  = null;
  aiPanel.style.display = 'none';

  const url = URL.createObjectURL(file);
  state.imageUrl = url;
  previewThumb.src = url;
  uploadZone.style.display    = 'none';
  uploadPreview.style.display = 'flex';

  const img = new Image();
  img.onload = () => {
    state.imageEl = img;
    updateButtons();
    renderPreview();
  };
  img.src = url;
}

// ── Overlap slider ───────────────────────────────────────────────────────────
overlapSlider.addEventListener('input', () => {
  state.overlapMm = parseInt(overlapSlider.value);
  overlapVal.textContent = state.overlapMm + ' mm';
  state.params = Frustum.compute(state.sizeKey, state.overlapMm);
  renderPreview();
});

// ── Preview mode ─────────────────────────────────────────────────────────────
window.setPreviewMode = function(mode) {
  state.previewMode = mode;
  document.getElementById('btnFlat').classList.toggle('active', mode === 'flat');
  document.getElementById('btn3d').classList.toggle('active',   mode === '3d');
  flatWrap.style.display   = mode === 'flat' ? '' : 'none';
  cup3dWrap.style.display  = mode === '3d'   ? '' : 'none';
  if (mode === '3d') render3DCup();
};

// ── Render flat wrap ─────────────────────────────────────────────────────────
function renderPreview() {
  state.params = Frustum.compute(state.sizeKey, state.overlapMm);
  if (state.previewMode === 'flat') renderFlatWrap();
  else render3DCup();
  updatePreviewLabel();
}

function renderFlatWrap() {
  const params = state.params;
  const { arcPath, boundingBox } = Frustum;

  // Scale to fill preview panel width nicely
  const maxW = Math.min((flatWrap.clientWidth > 100 ? flatWrap.clientWidth - 20 : 700), 800);
  const bbox  = boundingBox(params);
  const scale = Math.min(maxW / bbox.width, 500 / bbox.height);

  const cw = Math.ceil(bbox.width  * scale);
  const ch = Math.ceil(bbox.height * scale);
  const cx = bbox.cx * scale;   // x offset to arc centre within canvas
  const cy = bbox.cy * scale;   // y offset (top margin)

  flatCanvas.width  = cw;
  flatCanvas.height = ch;
  flatCanvas.style.width  = cw + 'px';
  flatCanvas.style.height = ch + 'px';

  const ctx = flatCanvas.getContext('2d');
  ctx.clearRect(0, 0, cw, ch);

  const pathData = arcPath(params, scale);

  // All drawing is offset by (cx, cy) — the arc is centred at that origin
  ctx.save();
  ctx.translate(cx, cy);

  const mainPath = new Path2D(pathData.d);
  const olPath   = new Path2D(pathData.overlapLine);

  if (state.imageEl) {
    // Clip to arc shape, then draw image STRETCHED to fill the arc bounding box.
    // This is correct — the printed wrap is exactly this rectangle mapped to the arc.
    ctx.save();
    ctx.clip(mainPath);
    // The arc bounding box in translated coords:
    // left edge is at -cx, right edge is at (cw - cx), top is 0, bottom is (ch - cy)
    ctx.drawImage(state.imageEl, -cx, 0, cw, ch - cy);
    ctx.restore();
    canvasEmpty.style.display = 'none';
  } else {
    // No image — show template shape with subtle fill + grid hint
    ctx.fillStyle = '#dddaf8';
    ctx.fill(mainPath);
    // Draw a light grid inside to hint at "design goes here"
    ctx.save();
    ctx.clip(mainPath);
    ctx.strokeStyle = 'rgba(92,91,212,0.15)';
    ctx.lineWidth = 1;
    const gridStep = 30;
    for (let x = -cx; x < cw; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, -cy); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(-cx, y); ctx.lineTo(cw, y); ctx.stroke();
    }
    ctx.restore();
  }

  // Arc outline (cut line)
  ctx.strokeStyle = '#5C5BD4';
  ctx.lineWidth   = 2;
  ctx.stroke(mainPath);

  // Overlap dashed line (fold/score line)
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = '#9999e0';
  ctx.lineWidth   = 1.5;
  ctx.stroke(olPath);
  ctx.restore();

  ctx.restore(); // undo translate

  // Dimension label bar at bottom
  ctx.fillStyle = state.imageEl ? 'rgba(255,255,255,0.9)' : 'rgba(237,237,254,0.95)';
  ctx.fillRect(0, ch - 26, cw, 26);
  ctx.fillStyle = '#534AB7';
  ctx.font = '500 11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `${params.label}  ·  top ${Math.round(params.outerArc)}mm  ·  bottom ${Math.round(params.innerArc)}mm  ·  height ${Math.round(params.slant)}mm  ·  overlap ${params.overlapMm}mm`,
    10, ch - 13
  );

  canvasEmpty.style.display = 'none';
}

// ── 3D Cup renderer ──────────────────────────────────────────────────────────
// Renders a realistic tapered cup with the design wrapped around it.
// The design image is treated as the flat wrap — stretched to cover 360°
// of the cup surface (with the overlap tab covering the seam).
function render3DCup() {
  const W = Math.min((flatWrap.clientWidth > 100 ? flatWrap.clientWidth - 20 : 500), 600);
  const H = Math.round(W * 1.2);
  cup3dCanvas.width  = W;
  cup3dCanvas.height = H;
  cup3dCanvas.style.width  = W + 'px';
  cup3dCanvas.style.height = H + 'px';

  const ctx = cup3dCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  if (!state.imageEl) {
    ctx.fillStyle = '#f4f4fb';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#aaa';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Upload a design to see 3D preview', W/2, H/2);
    return;
  }

  const params = state.params;
  const img    = state.imageEl;

  // Scale cup to fit canvas with padding
  const scale   = Math.min((W * 0.7) / params.topDia, (H * 0.78) / params.height);
  const topRx   = (params.topDia / 2) * scale;
  const botRx   = (params.botDia / 2) * scale;
  const cupH    = params.height * scale;
  const rimRy   = topRx * 0.13;  // ellipse depth for perspective
  const botRy   = botRx * 0.10;

  const cx    = W / 2;
  const topY  = (H - cupH) / 2 - rimRy;
  const botY  = topY + cupH;

  // ── Draw cup body with image mapped onto cylinder ─────────────────────────
  // We slice the cup into vertical strips. Each strip samples a horizontal
  // slice of the design image proportional to its angular position.
  // The design covers the full 360° (sweepDeg ≈ 360° for most tumblers).
  const slices = 120;
  // We show the front 180° of the cup (the visible face)
  const visibleStart = -90; // degrees
  const visibleEnd   =  90;
  const totalSweep   = params.sweepDeg; // full wrap angle

  for (let i = 0; i < slices; i++) {
    const t0 = i / slices;
    const t1 = (i + 1) / slices;
    const angleDeg0 = visibleStart + t0 * (visibleEnd - visibleStart);
    const angleDeg1 = visibleStart + t1 * (visibleEnd - visibleStart);
    const angleRad0 = angleDeg0 * Math.PI / 180;
    const angleRad1 = angleDeg1 * Math.PI / 180;

    // X positions on the ellipse
    const x0_top = cx + topRx * Math.sin(angleRad0);
    const x1_top = cx + topRx * Math.sin(angleRad1);
    const x0_bot = cx + botRx * Math.sin(angleRad0);
    const x1_bot = cx + botRx * Math.sin(angleRad1);

    // Map visible angle to image x — centre of cup = centre of image
    // angular position within the full sweep (0 = left edge, 1 = right edge)
    const imgT0 = (angleDeg0 + totalSweep / 2) / totalSweep;
    const imgT1 = (angleDeg1 + totalSweep / 2) / totalSweep;
    const srcX  = Math.max(0, imgT0 * img.naturalWidth);
    const srcW  = Math.max(1, (imgT1 - imgT0) * img.naturalWidth);

    // Cosine lighting — front (angle=0) is brightest
    const midRad = ((angleDeg0 + angleDeg1) / 2) * Math.PI / 180;
    const light  = Math.max(0.25, Math.cos(midRad));
    const shadow = (1 - light) * 0.55;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0_top, topY + rimRy);
    ctx.lineTo(x1_top, topY + rimRy);
    ctx.lineTo(x1_bot, botY);
    ctx.lineTo(x0_bot, botY);
    ctx.closePath();
    ctx.clip();

    const dstX = Math.min(x0_top, x0_bot) - 1;
    const dstW = Math.max(1, Math.abs(x1_top - x0_top) + 2);
    ctx.drawImage(img, srcX, 0, srcW, img.naturalHeight,
                       dstX, topY + rimRy, dstW, botY - topY - rimRy);

    // Lighting shadow overlay
    if (shadow > 0.02) {
      ctx.fillStyle = `rgba(0,0,0,${shadow.toFixed(3)})`;
      ctx.fillRect(dstX, topY + rimRy, dstW + 1, botY - topY - rimRy);
    }
    ctx.restore();
  }

  // ── Cup outline ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(cx - topRx, topY + rimRy);
  ctx.lineTo(cx - botRx, botY);
  ctx.moveTo(cx + topRx, topY + rimRy);
  ctx.lineTo(cx + botRx, botY);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Elliptical top rim ────────────────────────────────────────────────────
  // Back half (behind)
  ctx.beginPath();
  ctx.ellipse(cx, topY + rimRy, topRx, rimRy, 0, 0, Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  // Front half (rim face)
  ctx.beginPath();
  ctx.ellipse(cx, topY + rimRy, topRx, rimRy, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = 'rgba(240,240,255,0.5)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Bottom ellipse ────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.ellipse(cx, botY, botRx, botRy, 0, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(0,0,0,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth   = 1;
  ctx.stroke();
}

// ── Preview label ─────────────────────────────────────────────────────────────
function updatePreviewLabel() {
  const p = state.params || Frustum.compute(state.sizeKey, state.overlapMm);
  previewLabel.textContent = `${p.label} tumbler wrap`;
  previewDims.textContent  = `↑ ${Math.round(p.outerArc)}mm  ↓ ${Math.round(p.innerArc)}mm  ↕ ${Math.round(p.slant)}mm`;
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function updateButtons() {
  const ready = !!state.imageEl;
  btnAnalyze.disabled  = !ready;
  btnDownload.disabled = !ready;
}

// ── AI Analyze ────────────────────────────────────────────────────────────────
btnAnalyze.addEventListener('click', async () => {
  if (!state.imageFile) return;
  showLoading('Analyzing design with Gemini…');

  try {
    const fd = new FormData();
    fd.append('image', state.imageFile);
    fd.append('sizeKey', state.sizeKey);

    const res  = await fetch('/api/analyze', { method: 'POST', body: fd });
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    state.analysis = data;
    renderAIPanel(data);
    toast('Analysis complete ✦');
  } catch (err) {
    toast('Analysis failed: ' + err.message);
  } finally {
    hideLoading();
  }
});

function renderAIPanel(data) {
  // Quality badge
  const qEl = document.getElementById('aiQuality');
  qEl.textContent  = data.printQuality === 'good' ? 'Print ready' : data.printQuality === 'fair' ? 'Check resolution' : 'Low resolution';
  qEl.className    = 'ai-quality ' + data.printQuality;

  // Swatches
  const swatchesEl = document.getElementById('aiSwatches');
  swatchesEl.innerHTML = (data.colors || []).slice(0, 5).map((c, i) =>
    `<div class="ai-swatch" style="background:${c}" title="${(data.colorNames||[])[i]||c}">
       <span class="ai-swatch-name">${(data.colorNames||[])[i]||''}</span>
     </div>`
  ).join('');

  document.getElementById('aiStyle').textContent = data.style || '';
  document.getElementById('aiMood').textContent  = data.mood  || '';
  document.getElementById('aiNote').textContent  = data.printNote || '';
  document.getElementById('aiTip').textContent   = '💡 ' + (data.recommendation || '');

  aiPanel.style.display = '';
}

// ── Download ──────────────────────────────────────────────────────────────────
btnDownload.addEventListener('click', async () => {
  if (!state.imageFile) return;
  showLoading('Generating PDF & cutfile…');
  btnDownload.classList.add('loading');
  btnDownload.textContent = 'Generating…';

  try {
    const fd = new FormData();
    fd.append('image',      state.imageFile);
    fd.append('sizeKey',    state.sizeKey);
    fd.append('overlapMm',  state.overlapMm);
    if (state.analysis) fd.append('analysis', JSON.stringify(state.analysis));

    const res = await fetch('/api/generate', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Generation failed');
    }

    const blob     = await res.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `tumblerify-${state.sizeKey}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Download started ↓');
  } catch (err) {
    toast('Error: ' + err.message);
  } finally {
    hideLoading();
    btnDownload.classList.remove('loading');
    btnDownload.textContent = '↓ Download PDF + Cutfile';
  }
});

// ── Loading / toast ───────────────────────────────────────────────────────────
let loadingEl;
function showLoading(msg) {
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'loading-overlay';
    loadingEl.innerHTML = `<div class="loading-spinner"></div><div class="loading-text" id="loadingMsg"></div>`;
    document.body.appendChild(loadingEl);
  }
  document.getElementById('loadingMsg').textContent = msg;
  loadingEl.classList.add('visible');
}
function hideLoading() {
  if (loadingEl) loadingEl.classList.remove('visible');
}

let toastEl, toastTimer;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initSizeGrid();
state.params = Frustum.compute(state.sizeKey, state.overlapMm);
updatePreviewLabel();
// Wait for layout so clientWidth is available
requestAnimationFrame(() => renderPreview());
