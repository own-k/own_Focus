const LAUNCHER_POSITION_KEY = 'ownFocusLauncherPosition';
const LAUNCHER_UI_STATE_KEY = 'ownFocusLauncherState';
const LAUNCHER_MARGIN = 16;
const SIDE_PANEL_WIDTH_THRESHOLD = 120;
const LAUNCHER_EDGE_THRESHOLD = 36;

function clampLauncherPosition(launcher, left, top) {
  const maxLeft = Math.max(LAUNCHER_MARGIN, window.innerWidth - launcher.offsetWidth - LAUNCHER_MARGIN);
  const maxTop = Math.max(LAUNCHER_MARGIN, window.innerHeight - launcher.offsetHeight - LAUNCHER_MARGIN);

  return {
    left: Math.min(Math.max(LAUNCHER_MARGIN, left), maxLeft),
    top: Math.min(Math.max(LAUNCHER_MARGIN, top), maxTop),
  }
}

function setLauncherPosition(launcher, left, top) {
  launcher.style.left = `${left}px`;
  launcher.style.top = `${top}px`;
  launcher.style.right = 'auto';
}

function setLauncherPanelState(launcher, isOpen) {
  launcher.dataset.panelOpen = isOpen ? 'true' : 'false';
}

function persistLauncherPosition(left, top) {
  chrome.storage.local.set({ [LAUNCHER_POSITION_KEY]: { left, top } });
}

function persistLauncherState(minimized) {
  chrome.storage.local.set({ [LAUNCHER_UI_STATE_KEY]: { minimized } });
}

function setLauncherMinimized(launcher, minimized, persist = true) {
  launcher.classList.toggle('is-minimized', minimized);
  if (persist) persistLauncherState(minimized);
}

function restoreLauncherLayout(launcher) {
  return new Promise((resolve) => {
    chrome.storage.local.get([LAUNCHER_POSITION_KEY, LAUNCHER_UI_STATE_KEY], (result) => {
      const saved = result?.[LAUNCHER_POSITION_KEY];
      const launcherState = result?.[LAUNCHER_UI_STATE_KEY];
      setLauncherMinimized(launcher, Boolean(launcherState?.minimized), false);

      const fallbackLeft = window.innerWidth - launcher.offsetWidth - LAUNCHER_MARGIN;
      const fallbackTop = LAUNCHER_MARGIN;
      const next = clampLauncherPosition(
        launcher,
        Number.isFinite(saved?.left) ? saved.left : fallbackLeft,
        Number.isFinite(saved?.top) ? saved.top : fallbackTop
      );
      setLauncherPosition(launcher, next.left, next.top);
      resolve();
    });
  });
}

function ensureOwnFocusLauncher() {
  if (document.getElementById('own-focus-launcher')) return;

  const launcher = document.createElement('div');
  launcher.id = 'own-focus-launcher';
  launcher.setAttribute('aria-label', 'OWN-Focus launcher');
  launcher.classList.add('is-pending');
  setLauncherPanelState(launcher, false);
  launcher.innerHTML = `
    <button type="button" class="own-focus-open-btn" title="Open or close OWN-Focus" aria-label="Open or close OWN-Focus">
      <img src="${chrome.runtime.getURL('icons/icons48.png')}" alt="">
      <span>OWN-Focus</span>
    </button>
    <div class="own-focus-launcher-actions">
      <button type="button" class="own-focus-launcher-btn" data-launcher-action="minimize" title="Minimize">−</button>
      <button type="button" class="own-focus-launcher-btn" data-launcher-action="close" title="Close">×</button>
    </div>
  `;

  let suppressOpenClick = false;
  let dragState = null;
  let lastViewportWidth = window.innerWidth;
  launcher.addEventListener('dragstart', (event) => event.preventDefault());
  launcher.querySelectorAll('button, img').forEach((element) => {
    element.setAttribute('draggable', 'false');
    element.addEventListener('dragstart', (event) => event.preventDefault());
  });

  launcher.querySelector('.own-focus-open-btn')?.addEventListener('click', (event) => {
    if (suppressOpenClick) {
      suppressOpenClick = false;
      event.preventDefault();
      return;
    }
    const shouldOpen = launcher.dataset.panelOpen !== 'true';
    chrome.runtime.sendMessage({ type: 'TOGGLE_SIDE_PANEL', shouldOpen }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) return;
      setLauncherPanelState(launcher, Boolean(response.isOpen));
    });
  });

  launcher.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-launcher-action]');
    if (!actionButton) return;

    if (actionButton.dataset.launcherAction === 'minimize') {
      setLauncherMinimized(launcher, true);
      return;
    }

    if (actionButton.dataset.launcherAction === 'close') {
      launcher.remove();
    }
  });

  launcher.addEventListener('dblclick', () => {
    if (!launcher.classList.contains('is-minimized')) return;
    setLauncherMinimized(launcher, false);
  });

  document.documentElement.appendChild(launcher);
  restoreLauncherLayout(launcher).finally(() => {
    launcher.classList.remove('is-pending');
  });

  launcher.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('[data-launcher-action]')) return;

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: launcher.offsetLeft,
      startTop: launcher.offsetTop,
      moved: false,
    };

    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < 4) return;

    dragState.moved = true;
    launcher.classList.add('is-dragging');

    const next = clampLauncherPosition(
      launcher,
      dragState.startLeft + dx,
      dragState.startTop + dy
    );
    setLauncherPosition(launcher, next.left, next.top);
  });

  function finishLauncherDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const didMove = dragState.moved;
    const finalPosition = didMove
      ? clampLauncherPosition(launcher, launcher.offsetLeft, launcher.offsetTop)
      : null;

    launcher.classList.remove('is-dragging');
    try {
      launcher.releasePointerCapture?.(event.pointerId);
    } catch (_) {}
    dragState = null;

    if (didMove && finalPosition) {
      setLauncherPosition(launcher, finalPosition.left, finalPosition.top);
      persistLauncherPosition(finalPosition.left, finalPosition.top);
      suppressOpenClick = true;
      window.setTimeout(() => {
        suppressOpenClick = false;
      }, 0);
    }
  }

  launcher.addEventListener('pointerup', finishLauncherDrag);
  launcher.addEventListener('pointercancel', finishLauncherDrag);

  window.addEventListener('resize', () => {
    const previousViewportWidth = lastViewportWidth;
    const previousRightGap = previousViewportWidth - launcher.offsetLeft - launcher.offsetWidth;
    const shouldStayDockedRight = previousRightGap <= LAUNCHER_EDGE_THRESHOLD;
    const nextLeft = shouldStayDockedRight
      ? window.innerWidth - launcher.offsetWidth - Math.max(LAUNCHER_MARGIN, previousRightGap)
      : launcher.offsetLeft;
    const next = clampLauncherPosition(launcher, nextLeft, launcher.offsetTop);
    setLauncherPosition(launcher, next.left, next.top);
    if (shouldStayDockedRight) {
      persistLauncherPosition(next.left, next.top);
    }

    const widthDelta = window.innerWidth - previousViewportWidth;
    if (launcher.dataset.panelOpen === 'true' && widthDelta > SIDE_PANEL_WIDTH_THRESHOLD) {
      setLauncherPanelState(launcher, false);
    } else if (launcher.dataset.panelOpen !== 'true' && widthDelta < -SIDE_PANEL_WIDTH_THRESHOLD) {
      setLauncherPanelState(launcher, true);
    }
    lastViewportWidth = window.innerWidth;
  });
}

window.__ownFocusShowSoftOverlay = function() {
  if (document.getElementById('own-focus-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'own-focus-overlay';
  overlay.innerHTML = `
    <div class="own-focus-overlay-box">
      <div class="own-focus-overlay-icon">⛔</div>
      <h2>Come back to work</h2>
      <p>This page is blocked during your focus session.</p>
      <div class="own-focus-overlay-btns">
        <button id="own-focus-return">Back to study</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('own-focus-return').onclick = () => {
    overlay.remove();
    chrome.runtime.sendMessage({ type: 'LOCK_IN_RETURN' });
  };
};

if (document.documentElement) {
  ensureOwnFocusLauncher();
}
