// sidepanel.js — Navigation router + tool init registry

// ── Home message ────────────────────────────────────────────────────────────
(function setMotivation() {
  const lines = [
    'Progress over perfection.',
    'Build momentum, not excuses.',
    'Slow focus beats fast distraction.',
    'Show up. Stay deep.',
    'Quiet mind. Sharp work.',
    'Less noise. Better output.',
    'Depth makes the difference.',
    'Stay here. Finish strong.',
  ];
  const el = document.querySelector('.home-motivation');
  if (!el) return;
  el.textContent = lines[Math.floor(Math.random() * lines.length)];
})();

const views = {};
const toolInited = {};

['home','ai-chat','desmos','youtube','pdf-viewer','pomodoro','stopwatch','notes','clipboard','todo','lock-in']
  .forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) views[id] = el;
  });

let currentView = 'home';

function navigateTo(toolId) {
  const prev = views[currentView];
  const next = views[toolId];
  if (!next || toolId === currentView) return;

  if (prev) prev.classList.remove('active');
  currentView = toolId;
  next.classList.add('active');

  if (!toolInited[toolId]) {
    toolInited[toolId] = true;
    initTool(toolId);
  }
}

function navigateHome() { navigateTo('home'); }

function initTool(id) {
  const map = {
    'ai-chat':    () => typeof initAiChat    === 'function' && initAiChat(),
    'desmos':     () => typeof initDesmos    === 'function' && initDesmos(),
    'youtube':    () => typeof initYoutube   === 'function' && initYoutube(),
    'pdf-viewer': () => typeof initPdfViewer === 'function' && initPdfViewer(),
    'pomodoro':   () => typeof initPomodoro  === 'function' && initPomodoro(),
    'stopwatch':  () => typeof initStopwatch === 'function' && initStopwatch(),
    'notes':      () => typeof initNotes     === 'function' && initNotes(),
    'clipboard':  () => typeof initClipboard === 'function' && initClipboard(),
    'todo':       () => typeof initTodo      === 'function' && initTodo(),
    'lock-in':    () => typeof initLockIn    === 'function' && initLockIn(),
  };
  map[id]?.();
}

// Home screen card clicks
document.addEventListener('click', e => {
  const card = e.target.closest('[data-tool]');
  if (card) navigateTo(card.dataset.tool);
});

// Back buttons
document.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) navigateHome();
});

// Keyboard shortcuts (1-0 on home, Escape anywhere)
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  if (isEditing) return;

  const toolMap = {'1':'ai-chat','2':'desmos','3':'youtube','4':'pdf-viewer','5':'pomodoro','6':'stopwatch','7':'notes','8':'clipboard','9':'todo','0':'lock-in'};
  if (currentView === 'home' && toolMap[e.key]) {
    navigateTo(toolMap[e.key]);
  } else if (e.key === 'Escape' && currentView !== 'home') {
    navigateHome();
  }
});

// Message from content script (Lock In return)
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'LOCK_IN_RETURN' && typeof handleLockInReturn === 'function') {
    handleLockInReturn();
  }
});

window.__ownNav = { navigateTo, navigateHome };

// ── Draggable tool card reordering ──────────────────────────────────────────
(function initDraggableCards() {
  const grid = document.querySelector('.tool-grid');
  if (!grid) return;

  // Restore saved order from localStorage
  const saved = localStorage.getItem('own-focus-card-order');
  if (saved) {
    try {
      JSON.parse(saved).forEach(toolId => {
        const card = grid.querySelector(`[data-tool="${toolId}"]`);
        if (card) grid.appendChild(card);
      });
    } catch (_) {}
  }

  let dragSrc = null;

  grid.querySelectorAll('.tool-card').forEach(card => {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', e => {
      dragSrc = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.tool);
    });

    card.addEventListener('dragend', () => {
      dragSrc = null;
      grid.querySelectorAll('.tool-card').forEach(c => {
        c.classList.remove('dragging', 'drag-over');
      });
      // Save new order
      const order = [...grid.querySelectorAll('.tool-card')].map(c => c.dataset.tool);
      localStorage.setItem('own-focus-card-order', JSON.stringify(order));
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card !== dragSrc) {
        grid.querySelectorAll('.tool-card').forEach(c => c.classList.remove('drag-over'));
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === card) return;
      const allCards = [...grid.querySelectorAll('.tool-card')];
      const srcIdx = allCards.indexOf(dragSrc);
      const tgtIdx = allCards.indexOf(card);
      grid.insertBefore(dragSrc, srcIdx < tgtIdx ? card.nextSibling : card);
    });
  });
})();
