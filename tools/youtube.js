const YT_HISTORY_KEY = 'ownFocusYTHistory';
let ytHistory = [];
let activeVideo = null;
let pipTabId = null;

function getFocusState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['lockInState'], (result) => resolve(result.lockInState || null));
  });
}

function extractYtId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function buildWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function formatDuration(seconds) {
  if (!seconds) return 'Live';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function parseDuration(text = '') {
  if (!text) return 0;
  return text.split(':').reduce((total, part) => total * 60 + Number.parseInt(part, 10), 0);
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function searchYouTube(query) {
  const resultsEl = document.getElementById('youtube-results');
  resultsEl.innerHTML = '<p class="youtube-status">Searching YouTube...</p>';

  try {
    const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`, {
      credentials: 'omit',
    });
    const html = await response.text();
    const match = html.match(/var ytInitialData = (.*?);<\/script>/s) || html.match(/"ytInitialData"\s*:\s*(\{.*?\})\s*,\s*"metadata"/s);
    if (!match) throw new Error('Search data not found.');

    const data = JSON.parse(match[1]);
    const videos = collectSearchResults(data);
    renderResults(videos);
  } catch (error) {
    resultsEl.innerHTML = `
      <div class="youtube-manual">
        <p>Search is unavailable right now. Paste a YouTube link instead.</p>
        <input type="text" id="yt-manual-url" placeholder="https://youtube.com/watch?v=...">
        <button id="yt-manual-play-btn" class="btn-amber">Load video</button>
      </div>
    `;
    document.getElementById('yt-manual-play-btn')?.addEventListener('click', loadManualVideo);
  }
}

function collectSearchResults(data) {
  const results = [];
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

  sections.forEach((section) => {
    const items = section.itemSectionRenderer?.contents || [];
    items.forEach((item) => {
      const renderer = item.videoRenderer;
      if (!renderer?.videoId) return;
      results.push({
        videoId: renderer.videoId,
        title: renderer.title?.runs?.map((run) => run.text).join('') || 'Untitled video',
        author: renderer.ownerText?.runs?.[0]?.text || 'YouTube',
        lengthSeconds: parseDuration(renderer.lengthText?.simpleText || ''),
      });
    });
  });

  return results.slice(0, 15);
}

async function renderPlayerShell(videoId, title) {
  activeVideo = { id: videoId, title };
  const focusState = await getFocusState();
  const container = document.getElementById('youtube-player-container');
  container.classList.remove('hidden');

  if (focusState?.active && !focusState.allowYouTube) {
    container.innerHTML = `
      <div class="youtube-player-card">
        <div class="youtube-player-copy">
          <div class="youtube-player-title">YouTube locked during focus mode</div>
          <p>This focus session does not allow OWN-Focus YouTube. Start the next focus session with YouTube enabled if you want to watch through this tool.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="youtube-player-card">
      <img class="youtube-player-thumb" src="https://i.ytimg.com/vi/${esc(videoId)}/hqdefault.jpg" alt="">
      <div class="youtube-player-copy">
        <div class="youtube-player-title">${esc(title || 'YouTube video')}</div>
        <p>Play the video in a normal YouTube tab, or open it in Picture-in-Picture from the real YouTube page.</p>
      </div>
      <div class="youtube-player-actions">
        <button class="btn-amber" id="yt-watch-popup-btn">Watch Video</button>
        <button class="btn-secondary" id="yt-watch-pip-btn">Open PiP</button>
      </div>
    </div>
  `;
  document.getElementById('yt-watch-popup-btn')?.addEventListener('click', () => openYoutubePopup(videoId, title));
  document.getElementById('yt-watch-pip-btn')?.addEventListener('click', () => openYoutubePiP(videoId, title));
}

function renderResults(videos) {
  const element = document.getElementById('youtube-results');
  if (!videos.length) {
    element.innerHTML = '<p class="youtube-status">No results found.</p>';
    return;
  }

  element.innerHTML = '';
  videos.forEach((video) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'yt-result';
    item.innerHTML = `
      <img class="yt-thumb" src="https://i.ytimg.com/vi/${esc(video.videoId)}/hqdefault.jpg" alt="" loading="lazy">
      <div class="yt-info">
        <div class="yt-title">${esc(video.title)}</div>
        <div class="yt-meta">${esc(video.author)} • ${formatDuration(video.lengthSeconds)}</div>
      </div>
    `;
    item.addEventListener('click', () => loadVideo(video.videoId, video.title));
    element.appendChild(item);
  });
}

async function openYoutubePopup(videoId, title) {
  const focusState = await getFocusState();
  if (focusState?.active && !focusState.allowYouTube) {
    alert('YouTube is not available in this focus session.');
    return;
  }

  const watchUrl = buildWatchUrl(videoId);
  chrome.runtime.sendMessage({
    type: 'ALLOW_FOCUS_URLS',
    urls: [watchUrl, 'https://www.youtube.com/watch'],
  });

  chrome.tabs.create({
    url: `${watchUrl}${title ? `&t=0s` : ''}`,
    active: true,
  });
}

async function openYoutubePiP(videoId, title) {
  const focusState = await getFocusState();
  if (focusState?.active && !focusState.allowYouTube) {
    alert('YouTube is not available in this focus session.');
    return;
  }

  chrome.runtime.sendMessage({
    type: 'ALLOW_FOCUS_URLS',
    urls: [buildWatchUrl(videoId), 'https://www.youtube.com/watch'],
  });

  const watchUrl = `${buildWatchUrl(videoId)}&autoplay=1`;
  try {
    const previousTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const previousTabId = previousTabs[0]?.id || null;
    const tab = await chrome.tabs.create({
      url: watchUrl,
      active: true,
    });
    pipTabId = tab.id || null;

    const requestPiP = async () => {
      if (!pipTabId) return false;
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: pipTabId },
          func: async () => {
            const waitForVideo = async () => {
              const end = Date.now() + 15000;
              while (Date.now() < end) {
                const video = document.querySelector('video');
                if (video) return video;
                await new Promise((resolve) => setTimeout(resolve, 300));
              }
              return null;
            };

            const video = await waitForVideo();
            if (!video) return { ok: false, reason: 'Video element not found.' };

            try {
              await video.play().catch(() => {});
              if (document.pictureInPictureElement !== video) {
                await video.requestPictureInPicture();
              }
              return { ok: true };
            } catch (error) {
              return { ok: false, reason: error?.message || 'PiP request failed.' };
            }
          },
        });
        return Boolean(result?.ok);
      } catch (error) {
        return false;
      }
    };

    if (await requestPiP()) {
      if (previousTabId) chrome.tabs.update(previousTabId, { active: true }).catch(() => {});
      return;
    }

    const onUpdated = async (tabId, info) => {
      if (tabId !== pipTabId || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      const ok = await requestPiP();
      if (ok) {
        if (previousTabId) chrome.tabs.update(previousTabId, { active: true }).catch(() => {});
        return;
      }
      if (!ok) {
        alert('PiP needs the real YouTube page. The video tab has been opened, but Chrome may require you to press play first and use the YouTube PiP control.');
        chrome.tabs.update(tabId, { active: true }).catch(() => {});
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  } catch (error) {
    openYoutubePopup(videoId, title);
  }
}

function loadVideo(videoId, title) {
  saveToHistory(videoId, title);
  renderPlayerShell(videoId, title);
  showHistory();
}

function loadManualVideo() {
  const input = document.getElementById('yt-manual-url');
  if (!input) return;
  const videoId = extractYtId(input.value.trim());
  if (!videoId) {
    alert('Could not find a YouTube video ID in that link.');
    return;
  }
  loadVideo(videoId, 'Manual video');
}

function saveToHistory(id, title) {
  ytHistory = ytHistory.filter((video) => video.id !== id);
  ytHistory.unshift({ id, title, ts: Date.now() });
  if (ytHistory.length > 20) ytHistory = ytHistory.slice(0, 20);
  chrome.storage.local.set({ [YT_HISTORY_KEY]: ytHistory });
}

function showHistory() {
  const history = document.getElementById('youtube-history');
  if (!ytHistory.length) {
    history.innerHTML = '';
    return;
  }

  history.innerHTML = '<p class="youtube-history-label">Recent</p>';
  ytHistory.slice(0, 5).forEach((video) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'youtube-history-btn';
    button.textContent = video.title || video.id;
    button.addEventListener('click', () => loadVideo(video.id, video.title));
    history.appendChild(button);
  });
}

function clearYoutubeState() {
  activeVideo = null;
  const input = document.getElementById('youtube-search-input');
  const results = document.getElementById('youtube-results');
  const container = document.getElementById('youtube-player-container');
  const history = document.getElementById('youtube-history');

  if (input) input.value = '';
  if (results) results.innerHTML = '';
  if (container) {
    container.innerHTML = '';
    container.classList.add('hidden');
  }
  ytHistory = [];
  chrome.storage.local.set({ [YT_HISTORY_KEY]: [] });
  if (history) history.innerHTML = '';
}

function initYoutube() {
  chrome.storage.local.get(YT_HISTORY_KEY, (result) => {
    ytHistory = result[YT_HISTORY_KEY] || [];
    showHistory();
  });

  const input = document.getElementById('youtube-search-input');
  const doSearch = () => {
    const query = input.value.trim();
    if (query) searchYouTube(query);
  };

  document.getElementById('youtube-search-btn').addEventListener('click', doSearch);
  document.getElementById('youtube-clear-btn')?.addEventListener('click', clearYoutubeState);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doSearch();
  });
}
