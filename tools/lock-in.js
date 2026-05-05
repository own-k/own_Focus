const LOCK_STATE_KEY = 'lockInState';
const LOCK_HISTORY_KEY = 'ownFocusLockHistory';
const FOCUS_ALARM_NAME = 'focus-session-end';

const EMPTY_LOCK_STATE = {
  active: false,
  mode: null,
  lockedTabId: null,
  lockedWindowId: null,
  startTime: null,
  endTime: null,
  durationMins: 0,
  whitelist: [],
  allowAI: false,
  allowYouTube: false,
};

let lockState = { ...EMPTY_LOCK_STATE };
let lockHistory = [];
let lockTimerTick = null;
let selectedMode = 'guided';

function saveLockState() {
  chrome.storage.local.set({ [LOCK_STATE_KEY]: lockState });
}

function loadLockData(cb) {
  chrome.storage.local.get([LOCK_STATE_KEY, LOCK_HISTORY_KEY], (result) => {
    if (result[LOCK_STATE_KEY]) lockState = { ...EMPTY_LOCK_STATE, ...result[LOCK_STATE_KEY] };
    if (result[LOCK_HISTORY_KEY]) lockHistory = result[LOCK_HISTORY_KEY];
    cb();
  });
}

function getRemainingSecs() {
  if (!lockState.endTime) return 0;
  return Math.max(0, Math.ceil((lockState.endTime - Date.now()) / 1000));
}

function fmtClock(totalSecs) {
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseWhitelist() {
  const lines = document.getElementById('lock-whitelist').value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  const normalized = new Set([
    chrome.runtime.getURL(''),
    'chrome://',
    'edge://',
    'about:',
  ]);

  lines.forEach((line) => {
    normalized.add(line);
    try {
      const url = new URL(line);
      normalized.add(url.origin);
      normalized.add(`${url.origin}/`);
    } catch (error) {
      // Keep raw value for prefix matching.
    }
  });

  return Array.from(normalized);
}

async function startLockIn() {
  const durationMins = Number.parseInt(document.getElementById('lock-duration-mins').value, 10);
  if (!selectedMode) {
    alert('Select a focus mode first.');
    return;
  }
  if (!Number.isFinite(durationMins) || durationMins < 5) {
    alert('Choose a focus time of at least 5 minutes.');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    alert('Open the study tab you want to keep, then start focus mode.');
    return;
  }

  const whitelist = parseWhitelist();
  whitelist.push(tab.url || '');
  const allowAI = document.getElementById('lock-allow-ai').checked;
  const allowYouTube = document.getElementById('lock-allow-youtube').checked;

  const now = Date.now();
  lockState = {
    active: true,
    mode: selectedMode,
    lockedTabId: tab.id,
    lockedWindowId: tab.windowId,
    startTime: now,
    endTime: now + durationMins * 60 * 1000,
    durationMins,
    whitelist: Array.from(new Set(whitelist.filter(Boolean))),
    allowAI,
    allowYouTube,
  };

  await chrome.alarms.clear(FOCUS_ALARM_NAME);
  chrome.alarms.create(FOCUS_ALARM_NAME, { when: lockState.endTime });
  saveLockState();
  showLockActiveView();
  startTimer();
}

function persistHistory(durationSecs, sourceState = lockState) {
  lockHistory.unshift({
    mode: sourceState.mode,
    duration: durationSecs,
    plannedDuration: sourceState.durationMins,
    startTime: sourceState.startTime,
    date: new Date(sourceState.startTime || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  });
  if (lockHistory.length > 30) lockHistory = lockHistory.slice(0, 30);
  chrome.storage.local.set({ [LOCK_HISTORY_KEY]: lockHistory });
}

async function endLockIn(manual = true) {
  const elapsed = lockState.startTime ? Math.floor((Date.now() - lockState.startTime) / 1000) : 0;
  if (manual && elapsed > 15) {
    const ok = confirm('End focus mode early? Distracting websites will be unblocked.');
    if (!ok) return;
  }

  await chrome.alarms.clear(FOCUS_ALARM_NAME);
  if (lockState.active && elapsed > 0) persistHistory(elapsed, lockState);
  lockState = { ...EMPTY_LOCK_STATE };
  saveLockState();
  stopTimer();
  showLockSelectorView();
  renderLockHistory();
}

function startTimer() {
  stopTimer();
  updateTimer();
  lockTimerTick = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (lockTimerTick) clearInterval(lockTimerTick);
  lockTimerTick = null;
}

function updateTimer() {
  const remaining = getRemainingSecs();
  document.getElementById('lock-timer').textContent = fmtClock(remaining);
  if (remaining <= 0 && lockState.active) {
    endLockIn(false);
  }
}

function showLockActiveView() {
  document.getElementById('lock-mode-selector').classList.add('hidden');
  const activeView = document.getElementById('lock-active-view');
  activeView.classList.remove('hidden');

  const isTotal = lockState.mode === 'total';
  document.getElementById('lock-mode-label').textContent = isTotal ? 'Total Block Running' : 'Guided Focus Running';
  document.getElementById('lock-active-icon').textContent = isTotal ? '⛔' : '⏳';
  document.getElementById('lock-tip').textContent = isTotal
    ? 'Distracting websites stay blocked until your timer ends.'
    : 'Stay on the study tab. If you open blocked pages, you are sent straight back.';
  updateTimer();
}

function showLockSelectorView() {
  document.getElementById('lock-mode-selector').classList.remove('hidden');
  document.getElementById('lock-active-view').classList.add('hidden');
}

function renderLockHistory() {
  const element = document.getElementById('lock-history-list');
  if (!lockHistory.length) {
    element.innerHTML = '<p style="color:#8c8c95;font-size:12px">No focus sessions yet.</p>';
    return;
  }

  element.innerHTML = '';
  lockHistory.slice(0, 10).forEach((session) => {
    const mins = Math.floor(session.duration / 60);
    const secs = session.duration % 60;
    const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const item = document.createElement('div');
    item.className = 'lock-history-item';
    item.innerHTML = `
      <span class="lh-mode">${session.mode === 'total' ? 'Total Block' : 'Guided'}</span>
      <span class="lh-duration">${duration}</span>
      <span class="lh-date">${session.date}</span>
    `;
    element.appendChild(item);
  });
}

function clearLockHistory() {
  lockHistory = [];
  chrome.storage.local.set({ [LOCK_HISTORY_KEY]: [] });
  renderLockHistory();
}

window.handleLockInReturn = function() {
  if (lockState.lockedTabId) chrome.tabs.update(lockState.lockedTabId, { active: true });
};

function selectMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('.lock-mode-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.mode === mode);
  });
}

function initLockIn() {
  loadLockData(() => {
    renderLockHistory();
    document.getElementById('lock-duration-mins').value = lockState.durationMins || 50;
    document.getElementById('lock-allow-ai').checked = Boolean(lockState.allowAI);
    document.getElementById('lock-allow-youtube').checked = Boolean(lockState.allowYouTube);

    if (lockState.active) {
      selectedMode = lockState.mode || 'guided';
      showLockActiveView();
      startTimer();
    } else {
      showLockSelectorView();
    }

    document.querySelectorAll('.lock-mode-card').forEach((card) => {
      card.addEventListener('click', () => selectMode(card.dataset.mode));
    });
    selectMode(selectedMode);

    document.getElementById('lock-start-btn').addEventListener('click', startLockIn);
    document.getElementById('lock-end-btn').addEventListener('click', () => endLockIn(true));
    document.getElementById('lock-history-clear-btn')?.addEventListener('click', clearLockHistory);

    chrome.storage.onChanged.addListener((changes) => {
      if (changes[LOCK_STATE_KEY]) {
        const newState = { ...EMPTY_LOCK_STATE, ...(changes[LOCK_STATE_KEY].newValue || {}) };
        lockState = newState;

        if (!lockState.active) {
          stopTimer();
          showLockSelectorView();
          renderLockHistory();
          return;
        }

        showLockActiveView();
        startTimer();
      }

      if (changes.focusModeCompletedAt) {
        const oldState = changes[LOCK_STATE_KEY]?.oldValue;
        if (oldState?.active && oldState.startTime) {
          const elapsed = Math.max(0, Math.floor(((oldState.endTime || Date.now()) - oldState.startTime) / 1000));
          if (elapsed > 0) persistHistory(elapsed, oldState);
        }
        stopTimer();
        showLockSelectorView();
        renderLockHistory();
      }
    });
  });
}
