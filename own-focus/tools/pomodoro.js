// tools/pomodoro.js
const POMO_KEY = 'ownFocusPomodoro';
const CIRC = 2 * Math.PI * 54; // 339.3

let pom = {
  running: false, phase: 'work', cycle: 0,
  endTime: null, pausedAt: null,
  settings: { workMins: 25, shortMins: 5, longMins: 15 },
  todayFocusMs: 0, todayDate: new Date().toDateString(),
  lastPhaseStartMs: null,
};
let pomTick = null;

function savePom() { chrome.storage.local.set({ [POMO_KEY]: pom }); }
function loadPom(cb) {
  chrome.storage.local.get(POMO_KEY, r => {
    if (r[POMO_KEY]) pom = r[POMO_KEY];
    if (pom.todayDate !== new Date().toDateString()) { pom.todayFocusMs = 0; pom.todayDate = new Date().toDateString(); }
    cb();
  });
}

function getPhaseDurationMs() {
  const s = pom.settings;
  if (pom.phase === 'work') return s.workMins * 60000;
  if (pom.phase === 'short') return s.shortMins * 60000;
  return s.longMins * 60000;
}
function getPhaseLabel() { return pom.phase === 'work' ? 'Focus Time' : pom.phase === 'short' ? 'Short Break' : 'Long Break'; }
function getPhaseColor() { return pom.phase === 'work' ? '#d31736' : '#f4f4f5'; }

function advancePhase() {
  if (pom.phase === 'work' && pom.lastPhaseStartMs) {
    pom.todayFocusMs += Date.now() - pom.lastPhaseStartMs;
    pom.lastPhaseStartMs = null;
  }
  if (pom.phase === 'work') {
    pom.cycle++;
    pom.phase = pom.cycle >= 4 ? 'long' : 'short';
    if (pom.cycle >= 4) pom.cycle = 4;
  } else if (pom.phase === 'short') {
    pom.phase = 'work';
  } else {
    pom.phase = 'work'; pom.cycle = 0;
  }
  pom.running = false; pom.endTime = null; pom.pausedAt = null;
  savePom();
  updatePomUI();
}

function updatePomUI() {
  const totalMs = getPhaseDurationMs();
  let rem;
  if (!pom.running && !pom.endTime) rem = totalMs;
  else if (pom.pausedAt) rem = pom.endTime - pom.pausedAt;
  else rem = Math.max(0, pom.endTime - Date.now());

  const mins = Math.floor(rem / 60000);
  const secs = Math.floor((rem % 60000) / 1000);
  document.getElementById('pomo-display').textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

  const arc = document.getElementById('pomo-ring-arc');
  arc.setAttribute('stroke-dashoffset', CIRC * (1 - rem / totalMs));
  arc.setAttribute('stroke', getPhaseColor());

  const phaseEl = document.getElementById('pomo-phase');
  phaseEl.textContent = getPhaseLabel();
  phaseEl.classList.toggle('pomo-phase-break', pom.phase !== 'work');

  document.querySelectorAll('#pomo-cycle-dots .dot').forEach((dot, i) => {
    dot.classList.remove('active','done');
    const c = pom.cycle >= 4 ? 4 : pom.cycle;
    if (i < c) dot.classList.add('done');
    else if (i === c && pom.phase === 'work') dot.classList.add('active');
  });

  document.getElementById('pomo-start').textContent = pom.running ? 'Pause' : (pom.endTime && pom.pausedAt ? 'Resume' : 'Start');
  document.getElementById('pomo-today-time').textContent = Math.floor(pom.todayFocusMs / 60000) + 'm';

  if (rem <= 0 && pom.running) { playChime(); advancePhase(); }
}

function pomStart() {
  if (pom.running) {
    pom.pausedAt = Date.now(); pom.running = false;
    chrome.alarms.clear('pomodoro-phase');
    clearInterval(pomTick); pomTick = null;
  } else {
    if (pom.pausedAt) {
      pom.endTime += Date.now() - pom.pausedAt; pom.pausedAt = null;
    } else {
      pom.endTime = Date.now() + getPhaseDurationMs();
      if (pom.phase === 'work') pom.lastPhaseStartMs = Date.now();
    }
    pom.running = true;
    const rem = Math.max(0, pom.endTime - Date.now());
    chrome.alarms.create('pomodoro-phase', { delayInMinutes: rem / 60000 });
    if (!pomTick) pomTick = setInterval(updatePomUI, 1000);
  }
  savePom(); updatePomUI();
}

function pomReset() {
  chrome.alarms.clear('pomodoro-phase');
  clearInterval(pomTick); pomTick = null;
  pom.running = false; pom.endTime = null; pom.pausedAt = null; pom.lastPhaseStartMs = null;
  savePom(); updatePomUI();
}

function pomSkip() { chrome.alarms.clear('pomodoro-phase'); clearInterval(pomTick); pomTick = null; advancePhase(); }

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
  } catch(e) {}
}

function initPomodoro() {
  loadPom(() => {
    updatePomUI();
    if (pom.running && !pom.pausedAt) pomTick = setInterval(updatePomUI, 1000);

    document.getElementById('pomo-start').addEventListener('click', pomStart);
    document.getElementById('pomo-reset').addEventListener('click', pomReset);
    document.getElementById('pomo-skip').addEventListener('click', pomSkip);

    document.getElementById('pomo-settings-btn').addEventListener('click', () => {
      document.getElementById('pomodoro-content').classList.add('hidden');
      document.getElementById('pomodoro-settings').classList.remove('hidden');
      document.getElementById('pomo-work-mins').value = pom.settings.workMins;
      document.getElementById('pomo-short-mins').value = pom.settings.shortMins;
      document.getElementById('pomo-long-mins').value = pom.settings.longMins;
    });
    document.getElementById('pomo-save-settings').addEventListener('click', () => {
      pom.settings.workMins = parseInt(document.getElementById('pomo-work-mins').value) || 25;
      pom.settings.shortMins = parseInt(document.getElementById('pomo-short-mins').value) || 5;
      pom.settings.longMins = parseInt(document.getElementById('pomo-long-mins').value) || 15;
      pomReset();
      document.getElementById('pomodoro-settings').classList.add('hidden');
      document.getElementById('pomodoro-content').classList.remove('hidden');
    });
    document.getElementById('pomo-cancel-settings').addEventListener('click', () => {
      document.getElementById('pomodoro-settings').classList.add('hidden');
      document.getElementById('pomodoro-content').classList.remove('hidden');
    });

    // Check if alarm fired while panel was closed
    chrome.storage.local.get('pomodoroAlarmFired', r => {
      if (r.pomodoroAlarmFired && r.pomodoroAlarmFired.ts > Date.now() - 10000) {
        chrome.storage.local.remove('pomodoroAlarmFired');
        playChime(); advancePhase();
      }
    });

    chrome.storage.onChanged.addListener(changes => {
      if (changes.pomodoroAlarmFired) {
        chrome.storage.local.get('pomodoroAlarmFired', r => {
          if (r.pomodoroAlarmFired && r.pomodoroAlarmFired.ts > Date.now() - 10000) {
            chrome.storage.local.remove('pomodoroAlarmFired');
            playChime(); advancePhase();
          }
        });
      }
    });
  });
}
