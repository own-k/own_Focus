const PDF_STATE_KEY = 'ownFocusPdfState';
const PDF_MARKER_COLORS = {
  amber: 'rgba(224, 168, 46, 0.28)',
  yellow: 'rgba(244, 208, 63, 0.28)',
  green: 'rgba(55, 178, 122, 0.24)',
  blue: 'rgba(68, 137, 255, 0.22)',
  rose: 'rgba(215, 54, 92, 0.2)',
  ink: 'rgba(26, 23, 24, 0.24)',
};
let pdfDoc = null;
let totalPages = 0;
let scale = 1.35;
let fitWidth = false;
let markerMode = false;
let markerColor = 'amber';
let renderToken = 0;
let renderTimer = null;
const markerStrokes = new Map();

function capturePdfViewportAnchor() {
  const wrapper = document.getElementById('pdf-canvas-wrapper');
  if (!wrapper) return null;

  return {
    centerXRatio: wrapper.scrollWidth > 0
      ? Math.min(1, Math.max(0, (wrapper.scrollLeft + (wrapper.clientWidth / 2)) / wrapper.scrollWidth))
      : 0.5,
    centerYRatio: wrapper.scrollHeight > 0
      ? Math.min(1, Math.max(0, (wrapper.scrollTop + (wrapper.clientHeight / 2)) / wrapper.scrollHeight))
      : 0.5,
  };
}

function restorePdfViewportAnchor(anchor) {
  const wrapper = document.getElementById('pdf-canvas-wrapper');
  if (!wrapper || !anchor) return;

  const nextCenterX = anchor.centerXRatio * wrapper.scrollWidth;
  const nextCenterY = anchor.centerYRatio * wrapper.scrollHeight;
  const nextLeft = Math.max(0, nextCenterX - (wrapper.clientWidth / 2));
  const nextTop = Math.max(0, nextCenterY - (wrapper.clientHeight / 2));
  wrapper.scrollLeft = nextLeft;
  wrapper.scrollTop = nextTop;
}

function resetPdfViewer() {
  pdfDoc = null;
  totalPages = 0;
  scale = 1.35;
  fitWidth = false;
  markerMode = false;
  markerColor = 'amber';
  markerStrokes.clear();
  renderToken += 1;
  document.getElementById('pdf-drop-zone').classList.remove('hidden');
  document.getElementById('pdf-controls').classList.add('hidden');
  document.getElementById('pdf-canvas-stack').innerHTML = '';
  document.getElementById('pdf-page-info').textContent = '0 pages';
  document.getElementById('pdf-zoom-level').textContent = '135%';
  document.getElementById('pdf-canvas-wrapper').classList.remove('marker-mode');
  document.querySelectorAll('.pdf-marker-color').forEach((button) => {
    button.classList.toggle('active', button.dataset.pdfColor === markerColor);
  });
}

function setupPdfJs() {
  if (typeof pdfjsLib === 'undefined') return false;
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
  return true;
}

async function loadPdfFile(file) {
  if (!setupPdfJs()) {
    alert('PDF.js not loaded.');
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  try {
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    totalPages = pdfDoc.numPages;
    markerStrokes.clear();
    fitWidth = true;
    chrome.storage.local.set({ [PDF_STATE_KEY]: { fileName: file.name, pageCount: totalPages } });
    document.getElementById('pdf-drop-zone').classList.add('hidden');
    document.getElementById('pdf-controls').classList.remove('hidden');
    await renderDocument();
  } catch (error) {
    alert(`Failed to load PDF: ${error.message}`);
  }
}

function setMarkerMode(enabled) {
  markerMode = enabled;
  const wrapper = document.getElementById('pdf-canvas-wrapper');
  wrapper.classList.toggle('marker-mode', enabled);
  document.getElementById('pdf-marker-toggle').classList.toggle('active', enabled);
}

function clearMarkers() {
  markerStrokes.clear();
  document.querySelectorAll('.pdf-marker-layer').forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

function drawStoredMarkers(pageNumber, canvas) {
  const strokes = markerStrokes.get(pageNumber) || [];
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  strokes.forEach((stroke) => {
    if (!stroke?.points?.length) return;
    ctx.strokeStyle = stroke.color || PDF_MARKER_COLORS.amber;
    ctx.lineWidth = Math.max(10, canvas.width * 0.012);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
    }
    ctx.stroke();
  });
  ctx.globalCompositeOperation = 'source-over';
}

function attachMarkerLayer(layer, pageNumber) {
  let drawing = false;
  let activeStroke = null;

  function getPoint(event) {
    const rect = layer.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function redrawPreview() {
    drawStoredMarkers(pageNumber, layer);
    if (!activeStroke?.points?.length) return;
    const ctx = layer.getContext('2d');
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = activeStroke.color;
    ctx.lineWidth = Math.max(10, layer.width * 0.012);
    ctx.beginPath();
    ctx.moveTo(activeStroke.points[0].x * layer.width, activeStroke.points[0].y * layer.height);
    for (let i = 1; i < activeStroke.points.length; i += 1) {
      ctx.lineTo(activeStroke.points[i].x * layer.width, activeStroke.points[i].y * layer.height);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  layer.addEventListener('pointerdown', (event) => {
    if (!markerMode) return;
    drawing = true;
    layer.setPointerCapture(event.pointerId);
    activeStroke = {
      color: PDF_MARKER_COLORS[markerColor] || PDF_MARKER_COLORS.amber,
      points: [getPoint(event)],
    };
    redrawPreview();
  });

  layer.addEventListener('pointermove', (event) => {
    if (!drawing || !markerMode) return;
    activeStroke.points.push(getPoint(event));
    redrawPreview();
  });

  function finishStroke() {
    if (!drawing || !activeStroke?.points?.length) return;
    const strokes = markerStrokes.get(pageNumber) || [];
    strokes.push(activeStroke);
    markerStrokes.set(pageNumber, strokes);
    activeStroke = null;
    drawing = false;
    drawStoredMarkers(pageNumber, layer);
  }

  layer.addEventListener('pointerup', finishStroke);
  layer.addEventListener('pointercancel', finishStroke);
}

async function renderDocument(options = {}) {
  if (!pdfDoc) return;
  const { restoreView = null } = options;

  const thisRender = ++renderToken;
  const stack = document.getElementById('pdf-canvas-stack');
  const wrapper = document.getElementById('pdf-canvas-wrapper');
  stack.innerHTML = '';
  document.getElementById('pdf-page-info').textContent = `${totalPages} pages`;
  document.getElementById('pdf-zoom-level').textContent = `${Math.round(scale * 100)}%`;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdfDoc.getPage(pageNumber);
    if (thisRender !== renderToken) return;

    let pageScale = scale;
    if (fitWidth) {
      const viewportAtOne = page.getViewport({ scale: 1 });
      pageScale = Math.max(0.5, (wrapper.clientWidth - 32) / viewportAtOne.width);
    }

    const viewport = page.getViewport({ scale: pageScale });
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const pageShell = document.createElement('section');
    pageShell.className = 'pdf-page-shell';

    const pageLabel = document.createElement('div');
    pageLabel.className = 'pdf-page-label';
    pageLabel.textContent = `Page ${pageNumber}`;

    const stage = document.createElement('div');
    stage.className = 'pdf-page-stage';

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas-page';
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const markerLayer = document.createElement('canvas');
    markerLayer.className = 'pdf-marker-layer';
    markerLayer.width = Math.floor(viewport.width * pixelRatio);
    markerLayer.height = Math.floor(viewport.height * pixelRatio);
    markerLayer.style.width = `${Math.floor(viewport.width)}px`;
    markerLayer.style.height = `${Math.floor(viewport.height)}px`;

    stage.appendChild(canvas);
    stage.appendChild(markerLayer);
    pageShell.appendChild(pageLabel);
    pageShell.appendChild(stage);
    stack.appendChild(pageShell);

    const context = canvas.getContext('2d');
    await page.render({
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    }).promise;
    attachMarkerLayer(markerLayer, pageNumber);
    drawStoredMarkers(pageNumber, markerLayer);
  }

  if (restoreView && thisRender === renderToken) {
    requestAnimationFrame(() => {
      if (thisRender !== renderToken) return;
      restorePdfViewportAnchor(restoreView);
    });
  }
}

function updateScale(nextScale) {
  scale = Math.min(3, Math.max(0.6, nextScale));
  fitWidth = false;
  document.getElementById('pdf-zoom-level').textContent = `${Math.round(scale * 100)}%`;
  scheduleRenderDocument(60, true);
}

function scheduleRenderDocument(delay = 0, preserveView = false) {
  if (renderTimer) clearTimeout(renderTimer);
  const restoreView = preserveView ? capturePdfViewportAnchor() : null;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderDocument({ restoreView });
  }, delay);
}

function setupDragDrop(zoneId, onFile) {
  const zone = document.getElementById(zoneId);
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') onFile(file);
  });
}

function initPdfViewer() {
  document.getElementById('pdf-open-btn').addEventListener('click', () => document.getElementById('pdf-file-input').click());
  document.getElementById('pdf-file-input').addEventListener('change', (event) => {
    if (event.target.files[0]) loadPdfFile(event.target.files[0]);
  });
  document.getElementById('pdf-new-file').addEventListener('click', () => {
    resetPdfViewer();
    document.getElementById('pdf-file-input').click();
  });

  document.getElementById('pdf-zoom-in').addEventListener('click', () => updateScale(scale + 0.15));
  document.getElementById('pdf-zoom-out').addEventListener('click', () => updateScale(scale - 0.15));
  document.getElementById('pdf-fit-width').addEventListener('click', async () => {
    const restoreView = capturePdfViewportAnchor();
    fitWidth = true;
    await renderDocument({ restoreView });
  });
  document.getElementById('pdf-marker-toggle').addEventListener('click', () => setMarkerMode(!markerMode));
  document.getElementById('pdf-marker-clear').addEventListener('click', clearMarkers);
  document.querySelectorAll('.pdf-marker-color').forEach((button) => {
    button.addEventListener('click', () => {
      markerColor = button.dataset.pdfColor || 'amber';
      document.querySelectorAll('.pdf-marker-color').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
    });
  });

  setupDragDrop('pdf-drop-zone', loadPdfFile);

  const wrapper = document.getElementById('pdf-canvas-wrapper');
  wrapper.addEventListener('wheel', (event) => {
    if (!pdfDoc) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    updateScale(scale + (event.deltaY < 0 ? 0.08 : -0.08));
  }, { passive: false });

  window.addEventListener('resize', async () => {
    if (pdfDoc && fitWidth) scheduleRenderDocument(90, true);
  });
}
