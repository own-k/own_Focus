const ICON_48 = 'icons/icons48.png';
const FOCUS_ALARM = 'focus-session-end';
const AI_URLS = {
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
};
const DEFAULT_LOCK_STATE = {
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

let lockInState = { ...DEFAULT_LOCK_STATE };
let aiPanelWindowId = null;
const openSidePanelWindowIds = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.windowId) return;
  openSidePanel(tab.windowId).catch(() => {});
});

chrome.sidePanel.onOpened?.addListener((panel) => {
  if (panel?.windowId !== undefined) openSidePanelWindowIds.add(panel.windowId);
});

chrome.sidePanel.onClosed?.addListener((panel) => {
  if (panel?.windowId !== undefined) openSidePanelWindowIds.delete(panel.windowId);
});

chrome.storage.local.get('lockInState', (result) => {
  if (result.lockInState) lockInState = { ...DEFAULT_LOCK_STATE, ...result.lockInState };
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lockInState) {
    lockInState = { ...DEFAULT_LOCK_STATE, ...(changes.lockInState.newValue || {}) };
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'LOCK_IN_RETURN') {
    returnToFocusTab();
    sendResponse?.({ ok: true });
    return true;
  }

  if (message?.type === 'TOGGLE_SIDE_PANEL') {
    if (!sender.tab?.windowId) {
      sendResponse?.({ ok: false });
      return true;
    }
    const shouldOpen = message?.shouldOpen !== false;
    const panelAction = shouldOpen ? openSidePanel : closeSidePanel;
    panelAction(sender.tab.windowId).then((isOpen) => {
      sendResponse?.({ ok: true, isOpen });
    }).catch(() => {
      sendResponse?.({ ok: false });
    });
    return true;
  }

  if (message?.type === 'ALLOW_FOCUS_URLS') {
    const nextWhitelist = Array.from(new Set([...(lockInState.whitelist || []), ...(message.urls || [])]));
    lockInState = { ...lockInState, whitelist: nextWhitelist };
    chrome.storage.local.set({ lockInState });
    sendResponse?.({ ok: true });
    return true;
  }

  if (message?.type === 'OPEN_AI_PANEL') {
    openAiPanelWindow(message).then((windowId) => {
      sendResponse?.({ ok: true, windowId });
    }).catch(() => {
      aiPanelWindowId = null;
      sendResponse?.({ ok: false });
    });
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoro-phase') {
    chrome.notifications.create('pomo-notify', {
      type: 'basic',
      iconUrl: ICON_48,
      title: 'OWN-Focus',
      message: 'Phase complete! Time to switch.',
    });
    chrome.storage.local.set({ pomodoroAlarmFired: { ts: Date.now() } });
    return;
  }

  if (alarm.name === 'countdown-end') {
    chrome.notifications.create('cd-notify', {
      type: 'basic',
      iconUrl: ICON_48,
      title: 'OWN-Focus Timer',
      message: "Time's up!",
    });
    chrome.storage.local.set({ countdownAlarmFired: Date.now() });
    return;
  }

  if (alarm.name === FOCUS_ALARM && lockInState.active) {
    finishFocusSession();
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!lockInState.active) return;
  await enforceFocusOnTab(tabId);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!lockInState.active || !tab?.id) return;
  await enforceFocusOnTab(tab.id, tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!lockInState.active) return;
  if (changeInfo.status !== 'complete' && !changeInfo.url) return;
  await enforceFocusOnTab(tabId, tab);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!lockInState.active || windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, async (tabs) => {
    const activeTab = tabs?.[0];
    if (!activeTab?.id || isAllowedUrl(activeTab.url || '')) return;
    await handleBlockedTab(activeTab.id, activeTab);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === aiPanelWindowId) aiPanelWindowId = null;
  openSidePanelWindowIds.delete(windowId);
});

async function finishFocusSession() {
  chrome.alarms.clear(FOCUS_ALARM);
  lockInState = { ...DEFAULT_LOCK_STATE };
  chrome.storage.local.set({ lockInState, focusModeCompletedAt: Date.now() });
  chrome.notifications.create('focus-complete', {
    type: 'basic',
    iconUrl: ICON_48,
    title: 'Focus Mode Complete',
    message: 'Your session has finished.',
  });
}

async function returnToFocusTab() {
  if (!lockInState.active || !lockInState.lockedTabId) return;
  try {
    await chrome.windows.update(lockInState.lockedWindowId, { focused: true });
    await chrome.tabs.update(lockInState.lockedTabId, { active: true });
  } catch (error) {
    await finishFocusSession();
  }
}

async function openSidePanel(windowId) {
  await chrome.sidePanel.open({ windowId });
  openSidePanelWindowIds.add(windowId);
  return true;
}

async function closeSidePanel(windowId) {
  if (typeof chrome.sidePanel.close !== 'function') {
    return false;
  }

  await chrome.sidePanel.close({ windowId });
  openSidePanelWindowIds.delete(windowId);
  return false;
}

async function openAiPanelWindow({ ai, bounds = {} }) {
  const url = AI_URLS[ai];
  if (!url) throw new Error('Unknown AI panel target');

  const panelBounds = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };

  const existingWindow = await getTrackedAiPanelWindow();
  if (existingWindow?.id) {
    await chrome.windows.update(existingWindow.id, { ...panelBounds, focused: true });
    const tabId = existingWindow.tabs?.find((tab) => tab.active)?.id || existingWindow.tabs?.[0]?.id;
    if (tabId) {
      await chrome.tabs.update(tabId, { url, active: true });
    }
    return existingWindow.id;
  }

  const createdWindow = await chrome.windows.create({
    url,
    type: 'popup',
    focused: true,
    ...panelBounds,
  });
  aiPanelWindowId = createdWindow.id ?? null;
  return aiPanelWindowId;
}

async function getTrackedAiPanelWindow() {
  if (!aiPanelWindowId) return null;
  try {
    const popupWindow = await chrome.windows.get(aiPanelWindowId, { populate: true });
    aiPanelWindowId = popupWindow.id ?? null;
    return popupWindow;
  } catch (error) {
    aiPanelWindowId = null;
    return null;
  }
}

function isExtensionPage(url = '') {
  return url.startsWith('chrome-extension://');
}

function getBlockedPageUrl(url = '') {
  const base = chrome.runtime.getURL('blocked.html');
  const params = new URLSearchParams({
    mode: lockInState.mode || 'guided',
    url: url || '',
  });
  return `${base}?${params.toString()}`;
}

function isAllowedUrl(url = '') {
  if (!url) return true;
  if (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-search://') ||
    isExtensionPage(url)
  ) {
    return true;
  }

  return (lockInState.whitelist || []).some((allowed) => allowed && (url === allowed || url.startsWith(allowed)));
}

async function enforceFocusOnTab(tabId, providedTab) {
  if (!lockInState.active) return;
  if (tabId === lockInState.lockedTabId) return;

  let tab = providedTab;
  try {
    if (!tab) tab = await chrome.tabs.get(tabId);
  } catch (error) {
    return;
  }

  const url = tab?.url || '';
  if (isAllowedUrl(url)) return;
  await handleBlockedTab(tabId, tab);
}

async function handleBlockedTab(tabId, tab) {
  const url = tab?.url || '';

  if (lockInState.mode === 'total') {
    await chrome.tabs.remove(tabId).catch(() => {});
    await returnToFocusTab();
    return;
  }

  if (!isExtensionPage(url)) {
    await chrome.tabs.update(tabId, { url: getBlockedPageUrl(url) }).catch(() => {});
  }
  await returnToFocusTab();
}
