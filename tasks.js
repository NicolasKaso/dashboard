/**
 * tasks.js
 * Local task management + two-way sync with Google Tasks (three lists:
 * To-do, Assignments, Urgent). Handles add, toggle done, toggle urgent,
 * delete, filter, and background polling.
 * Depends on: config.js, state.js, google-api.js
 */

// ============================================================
// GOOGLE TASKS API CLIENT — thin wrappers over the REST calls
// ============================================================

const GTaskClient = {
  endpoint(listId) {
    return CONFIG.API.TASKS_TASKS + listId + '/tasks';
  },

  /** Create a task in a list; returns the raw created task. */
  async create(listId, body) {
    return GoogleAPI.post(this.endpoint(listId), body);
  },

  /** Patch status (done/undone) of a task. */
  async setStatus(task, done) {
    return GoogleAPI.patch(this.endpoint(task.gtaskListId) + '/' + task.gtaskId, {
      status: done ? 'completed' : 'needsAction'
    });
  },

  /** Delete a task. */
  async remove(task) {
    await fetch(this.endpoint(task.gtaskListId) + '/' + task.gtaskId, {
      method:  'DELETE',
      headers: { Authorization: 'Bearer ' + AppState.get().accessToken }
    });
  },

  /** Fetch all tasks of the three lists in parallel. */
  async fetchAll(listIds) {
    const qs = '?showCompleted=true&showHidden=true&maxResults=100';
    const [todoData, assignData, urgentData] = await Promise.all([
      listIds.todo       ? GoogleAPI.fetch(this.endpoint(listIds.todo) + qs)       : Promise.resolve({ items: [] }),
      listIds.assignment ? GoogleAPI.fetch(this.endpoint(listIds.assignment) + qs) : Promise.resolve({ items: [] }),
      listIds.urgent     ? GoogleAPI.fetch(this.endpoint(listIds.urgent) + qs)     : Promise.resolve({ items: [] })
    ]);
    return { todoData, assignData, urgentData };
  },

  /** Find-or-create the three Google Task lists, caching IDs in state. */
  async resolveLists() {
    const cached = AppState.get().gTaskListIds;
    if (cached.todo && cached.assignment && cached.urgent) return cached;

    const data  = await GoogleAPI.fetch(CONFIG.API.TASKS_LISTS + '?maxResults=100');
    const lists = data.items || [];
    const ids   = { todo: null, assignment: null, urgent: null };

    for (const list of lists) {
      if (list.title === 'To-do')       ids.todo       = list.id;
      if (list.title === 'Assignments') ids.assignment = list.id;
      if (list.title === 'Urgent')      ids.urgent     = list.id;
    }

    const post = async (title) => {
      const created = await GoogleAPI.post(CONFIG.API.TASKS_LISTS, { title });
      return created.id;
    };

    if (!ids.todo)       ids.todo       = await post('To-do');
    if (!ids.assignment) ids.assignment = await post('Assignments');
    if (!ids.urgent)     ids.urgent     = await post('Urgent');

    AppState.set({ gTaskListIds: ids });
    return ids;
  }
};

// ============================================================
// TASKS MODULE — UI + local state + sync orchestration
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

    const buildItem = (t) => {
      const dCls = t.done ? ' done' : '';
      const uCls = (t.urgent && !t.done) ? ' task-urgent' : '';
      const urgentBadge = t.urgent
        ? '<span class="task-badge badge-urgent" onclick="window.toggleUrgent(\'' + t.id + '\')" title="Remove urgent">Urgent</span>'
        : '<span class="task-badge badge-urgent-off" onclick="window.toggleUrgent(\'' + t.id + '\')" title="Mark urgent">! Urgent</span>';

      return (
        '<div class="task-item' + uCls + dCls + '">' +
          '<div class="task-check' + (t.done ? ' checked' : '') + '" onclick="window.toggleTask(\'' + t.id + '\')"></div>' +
          '<span class="task-text">' + escapeHtml(t.text) + '</span>' +
          urgentBadge +
          '<span class="task-badge badge-' + t.type + '">' + (TASK_TYPE_LABELS[t.type] || 'To-do') + '</span>' +
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
    // When urgent, force type to 'todo' for list routing; grouping is via the urgent flag
    const type = isUrgent
      ? 'todo'
      : (document.getElementById('task-type')?.value || 'todo');

    const id    = Date.now();
    const tasks = [...AppState.get().tasks, { id, text, type, done: false, urgent: isUrgent }];
    this._persist(tasks);
    input.value = '';

    // Reset urgent toggle + re-enable type select
    if (urgentBtn) {
      urgentBtn.classList.remove('active');
      this._setTypeSelectEnabled(true);
    }

    this.render();
    if (GoogleAPI.isTokenValid()) await this.pushToGoogle(text, type, id, isUrgent);
  },

  // --------------------------------------------------------
  // Toggle urgent / done / delete
  // --------------------------------------------------------

  async toggleUrgent(id) {
    const task = AppState.get().tasks.find(t => String(t.id) === String(id));
    if (!task) return;

    const toUrgent = !task.urgent;
    this._persist(AppState.get().tasks.map(t =>
      String(t.id) === String(id) ? { ...t, urgent: toUrgent } : t
    ));
    this.render();

    if (GoogleAPI.isTokenValid()) {
      const result = await this.moveInGoogle(task, toUrgent);
      if (result) {
        this._persist(AppState.get().tasks.map(t =>
          String(t.id) === String(id)
            ? { ...t, gtaskId: result.gtaskId, gtaskListId: result.gtaskListId }
            : t
        ));
      }
    }
  },

  async toggle(id) {
    const tasks = AppState.get().tasks.map(t =>
      String(t.id) === String(id) ? { ...t, done: !t.done } : t
    );
    this._persist(tasks);
    this.render();

    const task = tasks.find(t => String(t.id) === String(id));
    if (task && GoogleAPI.isTokenValid()) await this.syncDone(task);
  },

  async delete(id) {
    const task  = AppState.get().tasks.find(t => String(t.id) === String(id));
    this._persist(AppState.get().tasks.filter(t => String(t.id) !== String(id)));
    this.render();

    if (task?.gtaskId && task?.gtaskListId && GoogleAPI.isTokenValid()) {
      await GTaskClient.remove(task);
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
  // Google sync orchestration
  // --------------------------------------------------------

  async pushToGoogle(text, type, localId, urgent) {
    try {
      const ids    = await GTaskClient.resolveLists();
      const listId = urgent ? ids.urgent : (type === 'assignment' ? ids.assignment : ids.todo);
      const created = await GTaskClient.create(listId, { title: text });
      if (!created.error) {
        this._persist(AppState.get().tasks.map(t =>
          String(t.id) === String(localId)
            ? { ...t, gtaskId: created.id, gtaskListId: listId }
            : t
        ));
      }
    } catch(err) { console.error(err); }
  },

  async syncDone(task) {
    if (!task.gtaskId || !task.gtaskListId) return;
    try {
      await GTaskClient.setStatus(task, task.done);
    } catch(err) { console.error(err); }
  },

  /** Move a task between Google Task lists (e.g. toggling urgent on an existing task). */
  async moveInGoogle(task, toUrgent) {
    if (!GoogleAPI.isTokenValid()) return null;
    try {
      const ids       = await GTaskClient.resolveLists();
      const newListId = toUrgent
        ? ids.urgent
        : (task.type === 'assignment' ? ids.assignment : ids.todo);

      const created = await GTaskClient.create(newListId, {
        title:  task.text,
        status: task.done ? 'completed' : 'needsAction'
      });
      if (created.error) return null;

      if (task.gtaskId && task.gtaskListId) {
        await GTaskClient.remove(task);
      }

      return { gtaskId: created.id, gtaskListId: newListId };
    } catch(err) { console.error(err); return null; }
  },

  /** Full sync: fetch all three remote lists and reconcile with local state. */
  async fetchFromGoogle() {
    if (!GoogleAPI.isTokenValid()) return;
    try {
      const ids = await GTaskClient.resolveLists();
      const { todoData, assignData, urgentData } = await GTaskClient.fetchAll(ids);

      const remote = {};
      const collect = (data, listId, type, urgent) => (data.items || []).forEach(t => {
        if (!t.title) return;
        remote[t.id] = {
          gtaskId: t.id, gtaskListId: listId,
          text: t.title, type, urgent,
          done: t.status === 'completed'
        };
      });

      collect(todoData,   ids.todo,       'todo',       false);
      collect(assignData, ids.assignment, 'assignment', false);
      collect(urgentData, ids.urgent,     'todo',       true);

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
      this._persist([...synced, ...unpushed]);
      this.render();
    } catch(err) { console.error('fetchFromGoogle error:', err); }
  },

  // --------------------------------------------------------
  // Persistence helpers
  // --------------------------------------------------------

  _persist(tasks) {
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
  },

  _setTypeSelectEnabled(enabled) {
    const typeSelect = document.getElementById('task-type');
    if (!typeSelect) return;
    typeSelect.disabled       = !enabled;
    typeSelect.style.opacity       = enabled ? '' : '0.35';
    typeSelect.style.pointerEvents = enabled ? '' : 'none';
  }
};

// ============================================================
// CONSTANTS + GLOBAL BINDINGS
// ============================================================

const TASK_TYPE_LABELS = { todo: 'To-do', assignment: 'Assignment', deadline: 'Deadline' };

window.addTask      = () => Tasks.add();
window.toggleTask   = (id) => Tasks.toggle(id);
window.toggleUrgent = (id) => Tasks.toggleUrgent(id);
window.deleteTask   = id => Tasks.delete(id);
window.filterTasks  = (f) => Tasks.filter(f);

/** The "! Urgent" toggle in the task input row. */
window.toggleUrgentInput = () => {
  const btn = document.getElementById('urgent-toggle-btn');
  if (!btn) return;
  const nowActive = !btn.classList.contains('active');
  btn.classList.toggle('active', nowActive);
  Tasks._setTypeSelectEnabled(!nowActive);
};
