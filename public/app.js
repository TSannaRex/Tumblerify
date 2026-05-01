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

  const maxW  = 640;
  const bbox  = boundingBox(params);
  const scale = Math.min(maxW / bbox.width, 480 / bbox.height);

  const cw = Math.ceil(bbox.width  * scale);
  const ch = Math.ceil(bbox.height * scale);
  const cx = bbox.cx * scale;
  const cy = bbox.cy * scale;

  flatCanvas.width  = cw;
  flatCanvas.height = ch;

  const ctx = flatCanvas.getContext('2d');
  ctx.clearRect(0, 0, cw, ch);

  const pathData = arcPath(params, scale);

  // Translate origin to arc centre
  ctx.save();
  ctx.translate(cx, cy);

  const mainPath   = new Path2D(pathData.d);
  const olPath     = new Path2D(pathData.overlapLine);

  if (state.imageEl) {
    ctx.save();
    ctx.clip(mainPath);
    // Draw image filling the bounding rect
    ctx.drawImage(state.imageEl, -cx, 0, cw, ch);
    ctx.restore();
    canvasEmpty.style.display = 'none';
  } else {
    ctx.fillStyle = '#c8c5f0';
    ctx.fill(mainPath);
  }

  // Outline
  ctx.strokeStyle = '#5C5BD4';
  ctx.lineWidth   = 2;
  ctx.stroke(mainPath);

  // Overlap line (dashed)
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#9999e0';
  ctx.lineWidth   = 1.5;
  ctx.stroke(olPath);
  ctx.restore();

  ctx.restore();

  // Dimension label
  if (state.imageEl) {
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(8, ch - 30, 330, 22);
    ctx.fillStyle = '#534AB7';
    ctx.font = '500 10.5px Poppins, sans-serif';
    ctx.fillText(
      `${params.label}  ·  top arc ${Math.round(params.outerArc)}mm  ·  bottom arc ${Math.round(params.innerArc)}mm  ·  height ${Math.round(params.slant)}mm`,
      12, ch - 14
    );
  }

  // Show empty state overlay only when no image
  canvasEmpty.style.display = state.imageEl ? 'none' : '';
}

// ── 3D Cup renderer ──────────────────────────────────────────────────────────
function render3DCup() {
  if (!state.imageEl) {
    cup3dCanvas.width  = 400;
    cup3dCanvas.height = 500;
    const ctx = cup3dCanvas.getContext('2d');
    ctx.clearRect(0, 0, 400, 500);
    ctx.fillStyle = '#f0f0f8';
    ctx.fillRect(0, 0, 400, 500);
    ctx.fillStyle = '#aaa';
    ctx.font = '14px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Upload a design to see 3D preview', 200, 250);
    return;
  }

  const params = state.params;
  const W = 400, H = 520;
  cup3dCanvas.width  = W;
  cup3dCanvas.height = H;

  const ctx = cup3dCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Cup geometry in pixels
  const cupTopW   = params.topDia * 1.6;
  const cupBotW   = params.botDia * 1.6;
  const cupHeight = params.height * 1.6;

  const cx   = W / 2;
  const topY = (H - cupHeight) / 2;
  const botY = topY + cupHeight;

  // Half-widths (for the ellipses)
  const topRx = cupTopW / 2;
  const botRx = cupBotW / 2;
  const ry = 10; // ellipse y-radius (perspective)

  // Draw the cup silhouette with the design texture
  drawCupBody(ctx, cx, topY, botY, topRx, botRx, ry, W, H);
  drawCupTop(ctx, cx, topY, topRx, ry);
  drawCupBottom(ctx, cx, botY, botRx, ry);
}

function drawCupBody(ctx, cx, topY, botY, topRx, botRx, ry, W, H) {
  const params = state.params;
  const img    = state.imageEl;

  // Number of vertical slices for the cylindrical warp
  const slices = 80;
  const sliceAngleDeg = params.sweepDeg / slices;
  const startAngle    = -params.sweepDeg / 2;

  for (let i = 0; i < slices; i++) {
    const angleDeg = startAngle + i * sliceAngleDeg;
    const nextDeg  = angleDeg + sliceAngleDeg;

    // Convert angle to x position on ellipse (front = centre, sides = edges)
    const x1_top = cx + topRx * Math.sin(angleDeg * Math.PI / 180);
    const x2_top = cx + topRx * Math.sin(nextDeg  * Math.PI / 180);
    const x1_bot = cx + botRx * Math.sin(angleDeg * Math.PI / 180);
    const x2_bot = cx + botRx * Math.sin(nextDeg  * Math.PI / 180);

    const y1_top = topY;
    const y2_top = topY;
    const y1_bot = botY;
    const y2_bot = botY;

    // Source position in image (map angle fraction to image x)
    const tNorm = (angleDeg - startAngle) / params.sweepDeg;
    const srcX  = tNorm * img.naturalWidth;
    const srcW  = (sliceAngleDeg / params.sweepDeg) * img.naturalWidth;

    // Lighting: simple cosine shading from front
    const midAngle = (angleDeg + sliceAngleDeg / 2) * Math.PI / 180;
    const brightness = Math.max(0.35, Math.cos(midAngle));

    // Draw trapezoid slice
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1_top, y1_top);
    ctx.lineTo(x2_top, y2_top);
    ctx.lineTo(x2_bot, y2_bot);
    ctx.lineTo(x1_bot, y1_bot);
    ctx.closePath();
    ctx.clip();

    // Draw the image strip stretched to this trapezoid
    const dstX = Math.min(x1_top, x2_top, x1_bot, x2_bot) - 1;
    const dstW = Math.abs(x2_top - x1_top) + 2;
    ctx.drawImage(img, srcX, 0, Math.max(1, srcW), img.naturalHeight,
                       dstX, topY, Math.max(1, dstW), botY - topY);

    // Lighting overlay
    ctx.fillStyle = brightness < 1
      ? `rgba(0,0,0,${(1 - brightness) * 0.45})`
      : 'transparent';
    ctx.fillRect(dstX, topY, dstW + 2, botY - topY);

    ctx.restore();
  }

  // Cup outline
  ctx.beginPath();
  ctx.moveTo(cx - topRx, topY);
  ctx.lineTo(cx - botRx, botY);
  ctx.moveTo(cx + topRx, topY);
  ctx.lineTo(cx + botRx, botY);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

function drawCupTop(ctx, cx, topY, topRx, ry) {
  // Elliptical rim
  ctx.beginPath();
  ctx.ellipse(cx, topY, topRx, ry, 0, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx, topY, 0, cx, topY, topRx);
  grad.addColorStop(0, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(200,200,220,0.4)');
  ctx.fillStyle   = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

function drawCupBottom(ctx, cx, botY, botRx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, botY, botRx, ry * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
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
renderPreview();
