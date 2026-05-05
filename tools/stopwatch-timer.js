// tools/stopwatch-timer.js
const SW_KEY = 'ownFocusStopwatch';
const CD_KEY = 'ownFocusCountdown';

let sw = { running: false, startTime: null, elapsed: 0, laps: [] };
let cd = { running: false, totalMs: 300000, endTime: null, pausedRemaining: null };
let swTick = null, cdTick = null;

function saveSwState() { chrome.storage.local.set({ [SW_KEY]: sw }); }
function saveCdState() { chrome.storage.local.set({ [CD_KEY]: cd }); }
function loadStates(cb) {
  chrome.storage.local.get([SW_KEY, CD_KEY], r => {
    if (r[SW_KEY]) sw = r[SW_KEY];
    if (r[CD_KEY]) cd = r[CD_KEY];
    cb();
  });
}

function getSwElapsed() { return sw.running ? sw.elapsed + (Date.now() - sw.startTime) : sw.elapsed; }
function formatMs(ms) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
function updateSwDisplay() { document.getElementById('sw-display').textContent = formatMs(getSwElapsed()); }

function renderLaps() {
  const c = document.getElementById('sw-laps'); c.innerHTML = '';
  [...sw.laps].reverse().forEach(lap => {
    const row = document.createElement('div'); row.className = 'lap-row';
    row.innerHTML = `<span class="lap-num">Lap ${lap.lapNum}</span><span class="lap-time">${formatMs(lap.elapsed)}</span><span class="lap-split">+${formatMs(lap.split)}</span>`;
    c.appendChild(row);
  });
}

function swStart() {
  sw.running = true; sw.startTime = Date.now(); saveSwState();
  document.getElementById('sw-start').textContent = 'Stop';
  document.getElementById('sw-start').onclick = swStop;
  document.getElementById('sw-lap').disabled = false;
  swTick = setInterval(updateSwDisplay, 50);
}
function swStop() {
  sw.elapsed += Date.now() - sw.startTime; sw.running = false; sw.startTime = null;
  clearInterval(swTick); swTick = null; saveSwState();
  document.getElementById('sw-start').textContent = 'Start';
  document.getElementById('sw-start').onclick = swStart;
  document.getElementById('sw-lap').disabled = true;
  updateSwDisplay();
}
function swLap() {
  const total = getSwElapsed();
  const prev = sw.laps.length > 0 ? sw.laps[sw.laps.length-1].elapsed : 0;
  sw.laps.push({ lapNum: sw.laps.length+1, elapsed: total, split: total - prev });
  saveSwState(); renderLaps();
}
function swReset() {
  clearInterval(swTick); swTick = null;
  sw = { running: false, startTime: null, elapsed: 0, laps: [] }; saveSwState();
  document.getElementById('sw-start').textContent = 'Start';
  document.getElementById('sw-start').onclick = swStart;
  document.getElementById('sw-lap').disabled = true;
  updateSwDisplay(); renderLaps();
}

// Countdown
function getCdRemaining() {
  if (!cd.running) return cd.pausedRemaining ?? cd.totalMs;
  return Math.max(0, cd.endTime - Date.now());
}
function formatCdMs(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function updateCdDisplay() {
  const rem = getCdRemaining();
  document.getElementById('cd-display').textContent = formatCdMs(rem);
  document.getElementById('cd-progress-fill').value = (cd.totalMs > 0 ? rem / cd.totalMs * 100 : 100);
  if (rem <= 0 && cd.running) cdComplete();
}
function cdComplete() {
  clearInterval(cdTick); cdTick = null;
  cd.running = false; cd.pausedRemaining = 0; saveCdState();
  chrome.alarms.clear('countdown-end');
  playChimeTriple();
  document.getElementById('cd-start').textContent = 'Start';
  document.getElementById('cd-display').textContent = '00:00';
  document.getElementById('cd-progress-fill').value = 0;
}
function playChimeTriple() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach(delay => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 660;
      g.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.4);
    });
  } catch(e) {}
}
function cdGetInputMs() {
  const h = parseInt(document.getElementById('cd-hours').value) || 0;
  const m = parseInt(document.getElementById('cd-mins').value) || 0;
  const s = parseInt(document.getElementById('cd-secs').value) || 0;
  return (h * 3600 + m * 60 + s) * 1000;
}
function cdStart() {
  if (cd.running) {
    cd.pausedRemaining = getCdRemaining(); cd.running = false;
    chrome.alarms.clear('countdown-end'); clearInterval(cdTick); cdTick = null;
    saveCdState(); document.getElementById('cd-start').textContent = 'Resume'; return;
  }
  const inputMs = cd.pausedRemaining !== null ? cd.pausedRemaining : cdGetInputMs();
  if (inputMs <= 0) return;
  cd.totalMs = cd.pausedRemaining !== null ? cd.totalMs : inputMs;
  cd.pausedRemaining = null; cd.endTime = Date.now() + inputMs; cd.running = true; saveCdState();
  chrome.alarms.create('countdown-end', { delayInMinutes: inputMs / 60000 });
  document.getElementById('cd-start').textContent = 'Pause';
  cdTick = setInterval(updateCdDisplay, 250);
}
function cdReset() {
  clearInterval(cdTick); cdTick = null; chrome.alarms.clear('countdown-end');
  cd.running = false; cd.pausedRemaining = null; cd.endTime = null;
  cd.totalMs = cdGetInputMs() || 300000; saveCdState();
  document.getElementById('cd-start').textContent = 'Start'; updateCdDisplay();
}

function switchSwTab(tab) {
  document.querySelectorAll('.sw-tab').forEach(t => t.classList.toggle('active', t.dataset.sw === tab));
  document.getElementById('sw-stopwatch-view').classList.toggle('hidden', tab !== 'stopwatch');
  document.getElementById('sw-countdown-view').classList.toggle('hidden', tab !== 'countdown');
}

function initStopwatch() {
  loadStates(() => {
    updateSwDisplay(); renderLaps(); updateCdDisplay();

    if (sw.running) { swTick = setInterval(updateSwDisplay, 50); document.getElementById('sw-start').textContent = 'Stop'; document.getElementById('sw-start').onclick = swStop; document.getElementById('sw-lap').disabled = false; }
    else document.getElementById('sw-start').onclick = swStart;

    if (cd.running) { cdTick = setInterval(updateCdDisplay, 250); document.getElementById('cd-start').textContent = 'Pause'; }

    document.getElementById('sw-lap').addEventListener('click', swLap);
    document.getElementById('sw-reset').addEventListener('click', swReset);
    document.getElementById('cd-start').addEventListener('click', cdStart);
    document.getElementById('cd-reset').addEventListener('click', cdReset);

    document.querySelectorAll('.sw-tab').forEach(btn => btn.addEventListener('click', () => switchSwTab(btn.dataset.sw)));
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.mins);
        document.getElementById('cd-hours').value = 0;
        document.getElementById('cd-mins').value = mins;
        document.getElementById('cd-secs').value = 0;
        cdReset();
      });
    });

    chrome.storage.onChanged.addListener(changes => {
      if (changes.countdownAlarmFired) {
        chrome.storage.local.get('countdownAlarmFired', r => {
          if (r.countdownAlarmFired > Date.now() - 10000) { chrome.storage.local.remove('countdownAlarmFired'); cdComplete(); }
        });
      }
    });
  });
}
