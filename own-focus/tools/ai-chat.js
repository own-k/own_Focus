const AI_LAST_KEY = 'ownFocusLastAI';
const AI_URLS = {
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
};
const AI_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
const AI_ALLOW_URLS = {
  chatgpt: ['https://chatgpt.com', 'https://chat.openai.com'],
  claude: ['https://claude.ai'],
  gemini: ['https://gemini.google.com'],
};
const AI_ICONS = {
  chatgpt: 'icons/ChatGPT1.png',
  claude: 'icons/claude1.png',
  gemini: 'icons/Gemini1.png',
};
const AI_INFO = {
  chatgpt: {
    title: 'ChatGPT',
    iconClass: 'chatgpt',
    description: 'Best for writing, coding, study explanations, and fast back-and-forth problem solving.',
    note: 'Use it when you want a flexible general assistant for active study sessions.',
  },
  claude: {
    title: 'Claude',
    iconClass: 'claude',
    description: 'Best for longer reading, rewriting, structured notes, and calmer detailed reasoning.',
    note: 'Use it when you want to work through larger blocks of text carefully.',
  },
  gemini: {
    title: 'Gemini',
    iconClass: 'gemini',
    description: 'Best for Google-connected workflows, quick research prompts, and broad idea exploration.',
    note: 'Use it when you want a lightweight research companion in a compact side panel window.',
  },
};
const AI_PANEL_WIDTH = 440;
const AI_PANEL_MARGIN = 12;
const AI_PANEL_MIN_HEIGHT = 680;

let activeAI = 'chatgpt';

function getFocusState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['lockInState'], (result) => resolve(result.lockInState || null));
  });
}

async function openAiPopup(id) {
  const focusState = await getFocusState();
  if (focusState?.active && !focusState.allowAI) {
    alert('AI panel is not available in this focus session.');
    return;
  }

  await chrome.runtime.sendMessage({
    type: 'ALLOW_FOCUS_URLS',
    urls: AI_ALLOW_URLS[id] || [AI_URLS[id]],
  });

  const currentWindow = await chrome.windows.getCurrent();
  const bounds = getAiPanelBounds(currentWindow);

  await chrome.runtime.sendMessage({
    type: 'OPEN_AI_PANEL',
    ai: id,
    anchorWindowId: currentWindow?.id ?? chrome.windows.WINDOW_ID_CURRENT,
    bounds,
  });
}

async function openAiTab(id) {
  const focusState = await getFocusState();
  if (focusState?.active && !focusState.allowAI) {
    alert('AI tab is not available in this focus session.');
    return;
  }

  await chrome.runtime.sendMessage({
    type: 'ALLOW_FOCUS_URLS',
    urls: AI_ALLOW_URLS[id] || [AI_URLS[id]],
  });

  chrome.tabs.create({
    url: AI_URLS[id],
    active: true,
  });
}

function resetAiView() {
  activeAI = 'chatgpt';
  chrome.storage.local.remove(AI_LAST_KEY, () => {
    renderAiView();
  });
}

async function renderAiView() {
  document.querySelectorAll('.ai-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.ai === activeAI);
  });

  const focusState = await getFocusState();
  const errEl = document.getElementById('ai-error');
  errEl.classList.remove('hidden');

  if (focusState?.active && !focusState.allowAI) {
    errEl.innerHTML = `
      <p>AI panel is not available during this focus session. Start the next focus session with AI allowed if you want to use it.</p>
      <button class="btn-secondary" id="ai-focus-locked-btn" disabled>AI Locked During Focus</button>
    `;
    return;
  }

  const info = AI_INFO[activeAI];
  const iconSrc = AI_ICONS[activeAI];
  errEl.innerHTML = `
    <div class="ai-model-card">
      <div class="ai-model-head">
        <div class="ai-model-icon ai-model-icon-${info.iconClass}"><img src="${iconSrc}" alt="${info.title}"></div>
        <div>
          <div class="ai-model-title">${info.title}</div>
          <p class="ai-model-copy">${info.description}</p>
        </div>
      </div>
      <p class="ai-model-note">${info.note}</p>
      <div class="ai-model-actions">
        <button class="btn-amber" id="ai-popup-inline-btn">Open Panel</button>
        <button class="btn-secondary" id="ai-tab-inline-btn">Open Tab</button>
      </div>
    </div>
  `;
  document.getElementById('ai-popup-inline-btn')?.addEventListener('click', () => openAiPopup(activeAI));
  document.getElementById('ai-tab-inline-btn')?.addEventListener('click', () => openAiTab(activeAI));
}

function switchAiTab(id) {
  activeAI = id;
  chrome.storage.local.set({ [AI_LAST_KEY]: id });
  renderAiView();
}

function getAiPanelBounds(currentWindow) {
  const left = currentWindow?.left ?? window.screenX ?? 0;
  const top = currentWindow?.top ?? window.screenY ?? 0;
  const width = currentWindow?.width ?? window.outerWidth ?? screen.availWidth;
  const height = currentWindow?.height ?? window.outerHeight ?? screen.availHeight;

  return {
    width: AI_PANEL_WIDTH,
    top: top + AI_PANEL_MARGIN,
    height: Math.max(AI_PANEL_MIN_HEIGHT, height - (AI_PANEL_MARGIN * 2)),
    left: left + width - (AI_PANEL_WIDTH + AI_PANEL_MARGIN),
  };
}

function initAiChat() {
  chrome.storage.local.get([AI_LAST_KEY], (result) => {
    activeAI = result[AI_LAST_KEY] || 'chatgpt';

    document.querySelectorAll('.ai-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchAiTab(tab.dataset.ai));
    });
    document.getElementById('ai-reset-btn')?.addEventListener('click', resetAiView);

    renderAiView();
  });
}
