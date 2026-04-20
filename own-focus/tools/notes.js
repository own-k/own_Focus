const NOTES_KEY = 'ownFocusNotes';
const NOTES_ACTIVE_KEY = 'ownFocusActiveNote';

let notes = {};
let activeNoteId = null;
let notesSidebarOpen = true;

function saveNotes() {
  chrome.storage.local.set({ [NOTES_KEY]: notes }, () => {
    if (chrome.runtime.lastError) {
      const bytes = JSON.stringify(notes).length;
      if (bytes > 4 * 1024 * 1024) showStorageWarning();
    }
  });
}

function showStorageWarning() {
  const warning = document.createElement('div');
  warning.className = 'note-storage-warning';
  warning.textContent = 'Storage is nearly full. Export older notes to free space.';
  document.body.appendChild(warning);
  setTimeout(() => warning.remove(), 5000);
}

function setSaveState(text) {
  const state = document.getElementById('notes-save-state');
  if (state) state.textContent = text;
}

function loadNotes(cb) {
  chrome.storage.local.get([NOTES_KEY, NOTES_ACTIVE_KEY], (result) => {
    notes = result[NOTES_KEY] || {};
    activeNoteId = result[NOTES_ACTIVE_KEY] || null;
    cb();
  });
}

function createNote() {
  const id = `note_${Date.now()}`;
  const now = Date.now();
  notes[id] = {
    id,
    title: 'Untitled note',
    content: '',
    createdAt: now,
    updatedAt: now,
  };
  saveNotes();
  chrome.storage.local.set({ [NOTES_ACTIVE_KEY]: id });
  return id;
}

function deleteNote(id) {
  if (!confirm(`Delete "${notes[id]?.title}"?`)) return;
  delete notes[id];
  saveNotes();

  const remaining = Object.keys(notes);
  activeNoteId = remaining.length ? remaining[0] : createNote();
  chrome.storage.local.set({ [NOTES_ACTIVE_KEY]: activeNoteId });
  renderNotesList(document.getElementById('notes-search').value);
  loadActiveNote();
}

function renameNote(id) {
  const title = prompt('Rename note:', notes[id]?.title);
  if (!title?.trim()) return;
  notes[id].title = title.trim();
  notes[id].updatedAt = Date.now();
  saveNotes();
  renderNotesList(document.getElementById('notes-search').value);
  loadActiveNote();
}

function duplicateNote(id) {
  const source = notes[id];
  const newId = `note_${Date.now()}`;
  notes[newId] = {
    ...source,
    id: newId,
    title: `${source.title} copy`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  activeNoteId = newId;
  saveNotes();
  chrome.storage.local.set({ [NOTES_ACTIVE_KEY]: activeNoteId });
  renderNotesList(document.getElementById('notes-search').value);
  loadActiveNote();
}

function previewText(html = '') {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.innerText.trim().replace(/\s+/g, ' ').slice(0, 70) || 'Empty note';
}

function renderNotesList(filter = '') {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';

  const filtered = Object.values(notes)
    .filter((note) => {
      const haystack = `${note.title} ${previewText(note.content)}`.toLowerCase();
      return !filter || haystack.includes(filter.toLowerCase());
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  filtered.forEach((note) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `note-list-item${note.id === activeNoteId ? ' active' : ''}`;
    item.dataset.noteId = note.id;
    item.innerHTML = `
      <div class="note-list-title">${note.title}</div>
      <div class="note-list-preview">${previewText(note.content)}</div>
    `;

    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showNoteContextMenu(note.id);
    });
    item.addEventListener('click', () => {
      saveCurrentNote();
      activeNoteId = note.id;
      chrome.storage.local.set({ [NOTES_ACTIVE_KEY]: activeNoteId });
      renderNotesList(document.getElementById('notes-search').value);
      loadActiveNote();
    });

    list.appendChild(item);
  });
}

function showNoteContextMenu(id) {
  document.querySelectorAll('.note-ctx-menu').forEach((el) => el.remove());
  const menu = document.createElement('div');
  menu.className = 'note-ctx-menu';

  [
    ['Rename', () => renameNote(id)],
    ['Duplicate', () => duplicateNote(id)],
    ['Delete', () => deleteNote(id)],
  ].forEach(([label, action]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-ctx-menu-btn';
    button.textContent = label;
    button.onclick = () => {
      action();
      menu.remove();
    };
    menu.appendChild(button);
  });

  const host = document.querySelector(`.note-list-item[data-note-id="${id}"]`);
  host?.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function loadActiveNote() {
  const note = notes[activeNoteId];
  if (!note) return;

  document.getElementById('notes-title-input').value = note.title;
  document.getElementById('notes-editor').innerHTML = note.content;
  updateMeta(note);
  setSaveState('Saved');
}

function setNotesSidebarOpen(isOpen) {
  notesSidebarOpen = isOpen;
  document.getElementById('notes-sidebar')?.classList.toggle('collapsed', !isOpen);
}

function saveCurrentNote() {
  if (!activeNoteId || !notes[activeNoteId]) return;

  const editor = document.getElementById('notes-editor');
  const titleInput = document.getElementById('notes-title-input');
  const computedTitle = titleInput.value.trim() || previewText(editor.innerHTML).slice(0, 40) || 'Untitled note';

  notes[activeNoteId].title = computedTitle;
  notes[activeNoteId].content = editor.innerHTML;
  notes[activeNoteId].updatedAt = Date.now();
  saveNotes();
  updateMeta(notes[activeNoteId]);
  setSaveState('Saved');
}

function updateMeta(note) {
  const fmt = (timestamp) => new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  document.getElementById('notes-meta').textContent = `Created ${fmt(note.createdAt)} • Last edited ${fmt(note.updatedAt)}`;
}

function setupToolbar() {
  document.getElementById('notes-toolbar').addEventListener('mousedown', (event) => {
    const commandButton = event.target.closest('[data-cmd]');
    if (commandButton) {
      event.preventDefault();
      if (commandButton.dataset.cmd === 'code') {
        document.execCommand('insertHTML', false, '<code>code</code>');
      } else {
        document.execCommand(commandButton.dataset.cmd, false, null);
      }
      document.getElementById('notes-editor').focus();
      return;
    }

    const headingButton = event.target.closest('[data-heading]');
    if (headingButton) {
      event.preventDefault();
      document.execCommand('formatBlock', false, headingButton.dataset.heading);
      document.getElementById('notes-editor').focus();
      return;
    }

    const colorButton = event.target.closest('[data-color]');
    if (colorButton) {
      event.preventDefault();
      const color = colorButton.dataset.color;
      if (color === 'transparent') {
        document.execCommand('removeFormat', false, null);
      } else {
        document.execCommand('hiliteColor', false, color);
      }
      document.getElementById('notes-editor').focus();
    }
  });
}

function htmlToMarkdown(element) {
  let markdown = '';
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      markdown += node.textContent;
      return;
    }

    const tag = node.nodeName;
    if (tag === 'H1') markdown += `# ${node.innerText || ''}\n\n`;
    else if (tag === 'H2') markdown += `## ${node.innerText || ''}\n\n`;
    else if (tag === 'H3') markdown += `### ${node.innerText || ''}\n\n`;
    else if (tag === 'STRONG' || tag === 'B') markdown += `**${node.innerText || ''}**`;
    else if (tag === 'EM' || tag === 'I') markdown += `_${node.innerText || ''}_`;
    else if (tag === 'CODE') markdown += `\`${node.innerText || ''}\``;
    else if (tag === 'UL') {
      node.querySelectorAll('li').forEach((li) => { markdown += `- ${li.innerText}\n`; });
      markdown += '\n';
    } else if (tag === 'OL') {
      node.querySelectorAll('li').forEach((li, index) => { markdown += `${index + 1}. ${li.innerText}\n`; });
      markdown += '\n';
    } else {
      markdown += `${node.innerText || ''}\n`;
    }
  });
  return markdown;
}

function exportNote(format) {
  const note = notes[activeNoteId];
  if (!note) return;

  let content;
  let filename;
  let mime;
  if (format === 'txt') {
    const temp = document.createElement('div');
    temp.innerHTML = note.content;
    content = temp.innerText;
    filename = `${note.title}.txt`;
    mime = 'text/plain';
  } else {
    const temp = document.createElement('div');
    temp.innerHTML = note.content;
    content = htmlToMarkdown(temp);
    filename = `${note.title}.md`;
    mime = 'text/markdown';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function focusNewNote() {
  saveCurrentNote();
  activeNoteId = createNote();
  chrome.storage.local.set({ [NOTES_ACTIVE_KEY]: activeNoteId });
  renderNotesList();
  loadActiveNote();
  document.getElementById('notes-title-input').focus();
}

function initNotes() {
  loadNotes(() => {
    if (Object.keys(notes).length === 0) activeNoteId = createNote();
    if (!activeNoteId || !notes[activeNoteId]) {
      activeNoteId = Object.keys(notes)[0];
      chrome.storage.local.set({ [NOTES_ACTIVE_KEY]: activeNoteId });
    }

    renderNotesList();
    loadActiveNote();
    setupToolbar();
    setNotesSidebarOpen(window.innerWidth > 420);

    const editor = document.getElementById('notes-editor');
    const titleInput = document.getElementById('notes-title-input');
    let saveTimer;

    const scheduleSave = () => {
      setSaveState('Saving...');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveCurrentNote();
        renderNotesList(document.getElementById('notes-search').value);
      }, 250);
    };

    editor.addEventListener('input', scheduleSave);
    titleInput.addEventListener('input', scheduleSave);

    document.getElementById('notes-new-btn').addEventListener('click', focusNewNote);
    document.getElementById('notes-sidebar-new-btn').addEventListener('click', focusNewNote);
    document.getElementById('notes-sidebar-toggle').addEventListener('click', () => setNotesSidebarOpen(!notesSidebarOpen));
    document.getElementById('notes-search').addEventListener('input', (event) => renderNotesList(event.target.value));
    document.getElementById('notes-export-md').addEventListener('click', () => exportNote('md'));
    document.getElementById('notes-export-txt').addEventListener('click', () => exportNote('txt'));
    window.addEventListener('resize', () => {
      if (window.innerWidth > 420 && !notesSidebarOpen) setNotesSidebarOpen(true);
    });
  });
}
