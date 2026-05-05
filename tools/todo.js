const TODO_KEY = 'ownFocusTodos';

let todos = [];
let todoFilter = 'all';

function saveTodos() {
  chrome.storage.local.set({ [TODO_KEY]: todos });
}

function formatTodoStats() {
  const done = todos.filter((item) => item.done).length;
  const active = todos.length - done;
  return `${active} active • ${done} done`;
}

function getVisibleTodos() {
  if (todoFilter === 'active') return todos.filter((item) => !item.done);
  if (todoFilter === 'done') return todos.filter((item) => item.done);
  return todos;
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  const stats = document.getElementById('todo-stats');
  if (!list || !stats) return;

  stats.textContent = todos.length ? formatTodoStats() : 'No tasks yet';
  document.querySelectorAll('.todo-filter').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === todoFilter);
  });

  const visible = getVisibleTodos();
  if (!visible.length) {
    list.innerHTML = '<div class="todo-empty">Nothing here yet. Add your next task above.</div>';
    return;
  }

  list.innerHTML = '';
  visible.forEach((todo) => {
    const item = document.createElement('div');
    item.className = `todo-item${todo.done ? ' done' : ''}`;
    item.innerHTML = `
      <button class="todo-check" data-id="${todo.id}" aria-label="${todo.done ? 'Mark unfinished' : 'Mark done'}">
        <span class="todo-check-mark">✓</span>
      </button>
      <div class="todo-copy">
        <div class="todo-text">${escapeHtml(todo.text)}</div>
        <div class="todo-meta">${new Date(todo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      </div>
      <button class="todo-delete" data-delete-id="${todo.id}" aria-label="Delete task">✕</button>
    `;
    list.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input?.value.trim();
  if (!text) return;

  todos.unshift({
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: Date.now(),
  });
  input.value = '';
  saveTodos();
  renderTodos();
}

function toggleTodo(id) {
  todos = todos.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo);
  saveTodos();
  renderTodos();
}

function deleteTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  saveTodos();
  renderTodos();
}

function clearCompletedTodos() {
  todos = todos.filter((todo) => !todo.done);
  saveTodos();
  renderTodos();
}

function clearAllTodos() {
  todos = [];
  saveTodos();
  renderTodos();
}

function initTodo() {
  chrome.storage.local.get(TODO_KEY, (result) => {
    todos = result[TODO_KEY] || [];
    renderTodos();
  });

  document.getElementById('todo-add-btn')?.addEventListener('click', addTodo);
  document.getElementById('todo-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addTodo();
  });
  document.getElementById('todo-clear-all-btn')?.addEventListener('click', clearAllTodos);
  document.getElementById('todo-clear-done-btn')?.addEventListener('click', clearCompletedTodos);
  document.querySelectorAll('.todo-filter').forEach((button) => {
    button.addEventListener('click', () => {
      todoFilter = button.dataset.filter || 'all';
      renderTodos();
    });
  });
  document.getElementById('todo-list')?.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('[data-id]');
    if (toggleButton) {
      toggleTodo(toggleButton.dataset.id);
      return;
    }

    const deleteButton = event.target.closest('[data-delete-id]');
    if (deleteButton) {
      deleteTodo(deleteButton.dataset.deleteId);
    }
  });
}
