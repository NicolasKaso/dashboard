/**
 * tasks.js
 * Local task management + two-way sync with Google Tasks (three lists:
 * To-do, Assignments, Urgent). Handles add, toggle done, toggle urgent,
 * delete, filter, and background polling.
 * Depends on: config.js, state.js, google-api.js
 */

// ============================================================
// TASKS MODULE
// ============================================================

const Tasks = {
  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  render() {
    const state  = AppState.get();
    const list   = document.getElementById('tasks-list');
    const filter = state.currentFilter;

    let pool = filter === 'all'
      ? [...state.tasks]
      : state.tasks.filter(t => t.type === filter);

    const urgentItems = pool.filter(t => t.urgent && !t.done);
    const normalItems = pool.filter(t => !t.urgent || t.done);

    // Active items first, completed last
    normalItems.sort((a, b) => {
      if (!a.done && b.done) return -1;
      if (a.done && !b.done) return  1;
      return 0;
    });

    if (!urgentItems.length && !normalItems.length) {
      list.innerHTML = '<div class="empty-state">Nothing here \u2014 add something above</div>';
      return;
    }

    const labels = { todo: 'To-do', assignment: 'Assignment', deadline: 'Deadline' };

    const buildItem = (t) => {
      const dCls  = t.done ? ' done' : '';
      const uCls  = (t.urgent && !t.done) ? ' task-urgent' : '';
      const urgentBadge = t.urgent
        ? '<span class="task-badge badge-urgent" onclick="window.toggleUrgent(\'' + t.id + '\')" title="Remove urgent" style="cursor:pointer;">Urgent</span>'
        : '<span class="task-badge badge-urgent-off" onclick="window.toggleUrgent(\'' + t.id + '\')" title="Mark urgent" style="cursor:pointer;opacity:0.35;">! Urgent</span>';

      return (
        '<div class="task-item' + uCls + dCls + '">' +
          '<div class="task-check' + (t.done ? ' checked' : '') + '" onclick="window.toggleTask(\'' + t.id + '\')"></div>' +
          '<span class="task-text">' + escapeHtml(t.text) + '</span>' +
          urgentBadge +
          '<span class="task-badge badge-' + t.type + '">' + (labels[t.type] || 'To-do') + '</span>' +
          '<button class="task-delete" onclick="window.deleteTask(\'' + t.id + '\')" title="Delete">\u2715</button>' +
        '</div>'
      );
    };

    let html = '';

    if (urgentItems.length) {
      html += '<div class="task-section-label task-section-urgent">Urgent</div>';
      html += urgentItems.map(buildItem).join('');
      if (normalItems.length) html += '<div class="task-section-divider"></div>';
    }

    if (normalItems.length) {
      if (urgentItems.length) html += '<div class="task-section-label">Other tasks</div>';
      html += normalItems.map(buildItem).join('');
    }

    list.innerHTML = html;
  },

  // --------------------------------------------------------
  // Add
  // --------------------------------------------------------

  async add() {
    const input = document.getElementById('task-input');
    const text  = input?.value.trim();
    if (!text) return;

    const urgentBtn = document.getElementById('urgent-toggle-btn');
    const isUrgent  = urgentBtn ? urgentBtn.classList.contains('active') : false;
    // When urgent, force type to 'todo' for list routing; visual grouping is done via urgent flag
    const type = isUrgent
      ? 'todo'
      : (document.getElementById('task-type')?.value || 'todo');

    const id    = Date.now();
    const tasks = [...AppState.get().tasks, { id, text, type, done: false, urgent: isUrgent }];
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    input.value = '';

    // Reset urgent button + re-enable type select
    if (urgentBtn) {
      urgentBtn.classList.remove('active');
      const typeSelect = document.getElementById('task-type');
      if (typeSelect) {
        typeSelect.disabled       = false;
        typeSelect.style.opacity       = '';
        typeSelect.style.pointerEvents = '';
      }
    }

    this.render();
    if (GoogleAPI.isTokenValid()) await this.pushToGoogle(text, type, id, isUrgent);
  },

  // --------------------------------------------------------
  // Toggle urgent
  // --------------------------------------------------------

  async toggleUrgent(id) {
    const task = AppState.get().tasks.find(t => String(t.id) === String(id));
    if (!task) return;

    const toUrgent = !task.urgent;
    let tasks = AppState.get().tasks.map(t =>
      String(t.id) === String(id) ? { ...t, urgent: toUrgent } : t
    );
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    this.render();

    if (GoogleAPI.isTokenValid()) {
      const result = await this.moveInGoogle(task, toUrgent);
      if (result) {
        tasks = AppState.get().tasks.map(t =>
          String(t.id) === String(id)
            ? { ...t, gtaskId: result.gtaskId, gtaskListId: result.gtaskListId }
            : t
        );
        AppState.set({ tasks });
        Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
      }
    }
  },

  // --------------------------------------------------------
  // Toggle done
  // --------------------------------------------------------

  async toggle(id) {
    const tasks = AppState.get().tasks.map(t =>
      String(t.id) === String(id) ? { ...t, done: !t.done } : t
    );
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    this.render();

    const task = tasks.find(t => String(t.id) === String(id));
    if (task && GoogleAPI.isTokenValid()) await this.syncDone(task);
  },

  // --------------------------------------------------------
  // Delete
  // --------------------------------------------------------

  async delete(id) {
    const task  = AppState.get().tasks.find(t => String(t.id) === String(id));
    const tasks = AppState.get().tasks.filter(t => String(t.id) !== String(id));
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    this.render();

    if (task?.gtaskId && task?.gtaskListId && GoogleAPI.isTokenValid()) {
      await fetch(
        'https://tasks.googleapis.com/tasks/v1/lists/' + task.gtaskListId + '/tasks/' + task.gtaskId,
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + AppState.get().accessToken } }
      );
    }
  },

  // --------------------------------------------------------
  // Filter (All / Assignments / To-do)
  // --------------------------------------------------------

  filter(f) {
    AppState.set({ currentFilter: f });
    document.querySelectorAll('.filter-tab').forEach(b =>
      b.classList.toggle('active', b.id === 'filter-' + f)
    );
    this.render();
  },

  // --------------------------------------------------------
  // Google Tasks helpers
  // --------------------------------------------------------

  /** Resolve (or create) the three Google Task lists, caching their IDs. */
  async resolveTaskLists() {
    const cached = AppState.get().gTaskListIds;
    if (cached.todo && cached.assignment && cached.urgent) return cached;

    const data  = await GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100');
    const lists = data.items || [];
    const ids   = { todo: null, assignment: null, urgent: null };

    for (const list of lists) {
      if (list.title === 'To-do')       ids.todo       = list.id;
      if (list.title === 'Assignments') ids.assignment = list.id;
      if (list.title === 'Urgent')      ids.urgent     = list.id;
    }

    const post = async (title) => {
      const r = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title })
      });
      return (await r.json()).id;
    };

    if (!ids.todo)       ids.todo       = await post('To-do');
    if (!ids.assignment) ids.assignment = await post('Assignments');
    if (!ids.urgent)     ids.urgent     = await post('Urgent');

    AppState.set({ gTaskListIds: ids });
    return ids;
  },

  async pushToGoogle(text, type, localId, urgent) {
    try {
      const ids    = await this.resolveTaskLists();
      const listId = urgent ? ids.urgent : (type === 'assignment' ? ids.assignment : ids.todo);
      const res    = await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + listId + '/tasks', {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: text })
      });
      const created = await res.json();
      if (!created.error) {
        const tasks = AppState.get().tasks.map(t =>
          String(t.id) === String(localId)
            ? { ...t, gtaskId: created.id, gtaskListId: listId }
            : t
        );
        AppState.set({ tasks });
        Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
      }
    } catch(err) { console.error(err); }
  },

  async syncDone(task) {
    if (!task.gtaskId || !task.gtaskListId) return;
    try {
      await fetch(
        'https://tasks.googleapis.com/tasks/v1/lists/' + task.gtaskListId + '/tasks/' + task.gtaskId,
        {
          method:  'PATCH',
          headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: task.done ? 'completed' : 'needsAction' })
        }
      );
    } catch(err) { console.error(err); }
  },

  /** Move a task between Google Task lists (e.g. when toggling urgent on an existing task). */
  async moveInGoogle(task, toUrgent) {
    if (!GoogleAPI.isTokenValid()) return null;
    try {
      const ids      = await this.resolveTaskLists();
      const newListId = toUrgent
        ? ids.urgent
        : (task.type === 'assignment' ? ids.assignment : ids.todo);

      const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + newListId + '/tasks', {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: task.text, status: task.done ? 'completed' : 'needsAction' })
      });
      const created = await res.json();
      if (created.error) return null;

      // Remove from old list
      if (task.gtaskId && task.gtaskListId) {
        await fetch(
          'https://tasks.googleapis.com/tasks/v1/lists/' + task.gtaskListId + '/tasks/' + task.gtaskId,
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + AppState.get().accessToken } }
        );
      }

      return { gtaskId: created.id, gtaskListId: newListId };
    } catch(err) { console.error(err); return null; }
  },

  /** Full sync: fetch all three remote lists and reconcile with local state. */
  async fetchFromGoogle() {
    if (!GoogleAPI.isTokenValid()) return;
    try {
      const ids = await this.resolveTaskLists();

      const [todoData, assignData, urgentData] = await Promise.all([
        ids.todo       ? GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/lists/' + ids.todo       + '/tasks?showCompleted=true&showHidden=true&maxResults=100') : Promise.resolve({ items: [] }),
        ids.assignment ? GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/lists/' + ids.assignment + '/tasks?showCompleted=true&showHidden=true&maxResults=100') : Promise.resolve({ items: [] }),
        ids.urgent     ? GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/lists/' + ids.urgent     + '/tasks?showCompleted=true&showHidden=true&maxResults=100') : Promise.resolve({ items: [] })
      ]);

      const remote = {};
      (todoData.items   || []).forEach(t => { if (t.title) remote[t.id] = { gtaskId: t.id, gtaskListId: ids.todo,       text: t.title, type: 'todo',       urgent: false, done: t.status === 'completed' }; });
      (assignData.items || []).forEach(t => { if (t.title) remote[t.id] = { gtaskId: t.id, gtaskListId: ids.assignment, text: t.title, type: 'assignment', urgent: false, done: t.status === 'completed' }; });
      (urgentData.items || []).forEach(t => { if (t.title) remote[t.id] = { gtaskId: t.id, gtaskListId: ids.urgent,     text: t.title, type: 'todo',       urgent: true,  done: t.status === 'completed' }; });

      const localByGtaskId = {};
      AppState.get().tasks.forEach(t => { if (t.gtaskId) localByGtaskId[t.gtaskId] = t; });

      // Remote is source of truth; preserve local id for DOM continuity
      const synced = Object.values(remote).map(r => {
        const local = localByGtaskId[r.gtaskId];
        return local
          ? { ...local, text: r.text, done: r.done, urgent: r.urgent }
          : { id: 'gt_' + r.gtaskId, ...r };
      });

      const unpushed = AppState.get().tasks.filter(t => !t.gtaskId);
      const tasks    = [...synced, ...unpushed];
      AppState.set({ tasks });
      Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
      this.render();
    } catch(err) { console.error('fetchFromGoogle error:', err); }
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.addTask    = () => Tasks.add();
window.toggleTask = (id) => Tasks.toggle(id);
window.toggleUrgent = (id) => Tasks.toggleUrgent(id);
window.deleteTask = (id) => Tasks.delete(id);
window.filterTasks = (f) => Tasks.filter(f);

window.toggleUrgentInput = () => {
  const btn        = document.getElementById('urgent-toggle-btn');
  const typeSelect = document.getElementById('task-type');
  if (!btn) return;
  const nowActive = !btn.classList.contains('active');
  btn.classList.toggle('active', nowActive);
  if (typeSelect) {
    typeSelect.disabled       = nowActive;
    typeSelect.style.opacity       = nowActive ? '0.35' : '';
    typeSelect.style.pointerEvents = nowActive ? 'none' : '';
  }
};
