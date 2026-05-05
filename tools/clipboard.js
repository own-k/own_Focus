const CLIPBOARD_KEY = 'ownFocusClipboardItems';
let clipboardItems = [];

function saveClipboardItems() {
  chrome.storage.local.set({ [CLIPBOARD_KEY]: clipboardItems });
}

function formatClipboardTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function renderClipboard() {
  const list = document.getElementById('clipboard-list');
  if (!clipboardItems.length) {
    list.innerHTML = '<p class="clipboard-empty">Nothing saved yet. Paste copied text or images here.</p>';
    return;
  }

  list.innerHTML = '';
  clipboardItems.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'clipboard-card';
    if (item.type === 'image') {
      card.innerHTML = `
        <img class="clipboard-image" src="${item.data}" alt="Clipboard image">
        <div class="clipboard-card-meta">
          <span>Image</span>
          <span>${formatClipboardTime(item.ts)}</span>
        </div>
        <div class="clipboard-card-actions">
          <button class="btn-secondary clipboard-delete-btn" data-id="${item.id}">Delete</button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="clipboard-text">${item.data}</div>
        <div class="clipboard-card-meta">
          <span>Text</span>
          <span>${formatClipboardTime(item.ts)}</span>
        </div>
        <div class="clipboard-card-actions">
          <button class="btn-secondary clipboard-copy-btn" data-id="${item.id}">Copy Text</button>
          <button class="btn-secondary clipboard-delete-btn" data-id="${item.id}">Delete</button>
        </div>
      `;
    }
    list.appendChild(card);
  });
}

function addClipboardItem(type, data) {
  clipboardItems.unshift({ id: `clip_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`, type, data, ts: Date.now() });
  clipboardItems = clipboardItems.slice(0, 30);
  saveClipboardItems();
  renderClipboard();
}

async function handleClipboardRead() {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          addClipboardItem('image', dataUrl);
          return;
        }
      }
    }

    const text = await navigator.clipboard.readText();
    if (text.trim()) addClipboardItem('text', text.trim());
  } catch (error) {
    alert('Clipboard access failed. Use Cmd/Ctrl+V inside the clipboard area instead.');
  }
}

function handleClipboardPaste(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const imageFile = Array.from(clipboard.files || []).find((file) => file.type.startsWith('image/'));
  if (imageFile) {
    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => addClipboardItem('image', reader.result);
    reader.readAsDataURL(imageFile);
    return;
  }

  const text = clipboard.getData('text/plain');
  if (text.trim()) {
    event.preventDefault();
    addClipboardItem('text', text.trim());
    document.getElementById('clipboard-input').value = '';
  }
}

function handleClipboardDrop(event) {
  event.preventDefault();
  const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith('image/'));
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => addClipboardItem('image', reader.result);
  reader.readAsDataURL(file);
}

function initClipboard() {
  chrome.storage.local.get([CLIPBOARD_KEY], (result) => {
    clipboardItems = result[CLIPBOARD_KEY] || [];
    renderClipboard();
  });

  document.getElementById('clipboard-paste-btn').addEventListener('click', handleClipboardRead);
  document.getElementById('clipboard-save-text-btn').addEventListener('click', () => {
    const input = document.getElementById('clipboard-input');
    const text = input.value.trim();
    if (!text) return;
    addClipboardItem('text', text);
    input.value = '';
  });
  document.getElementById('clipboard-clear-all').addEventListener('click', () => {
    clipboardItems = [];
    saveClipboardItems();
    renderClipboard();
  });

  const input = document.getElementById('clipboard-input');
  input.addEventListener('paste', handleClipboardPaste);

  const dropzone = document.getElementById('clipboard-dropzone');
  dropzone.addEventListener('paste', handleClipboardPaste);
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (event) => {
    dropzone.classList.remove('drag-over');
    handleClipboardDrop(event);
  });

  document.getElementById('clipboard-list').addEventListener('click', async (event) => {
    const copyBtn = event.target.closest('.clipboard-copy-btn');
    if (copyBtn) {
      const item = clipboardItems.find((entry) => entry.id === copyBtn.dataset.id);
      if (item?.type === 'text') {
        await navigator.clipboard.writeText(item.data);
      }
      return;
    }

    const deleteBtn = event.target.closest('.clipboard-delete-btn');
    if (deleteBtn) {
      clipboardItems = clipboardItems.filter((entry) => entry.id !== deleteBtn.dataset.id);
      saveClipboardItems();
      renderClipboard();
    }
  });
}
