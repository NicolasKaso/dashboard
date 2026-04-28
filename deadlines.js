/**
 * deadlines.js
 * Manages upcoming deadlines: manual entry, Google Calendar auto-detection,
 * exclude-word filtering, and the add-deadline modal.
 * Depends on: config.js, state.js, google-api.js
 */

// ============================================================
// DEADLINES MODULE
// ============================================================

const Deadlines = {
  /**
   * Pull calendar events for the next 90 days and surface anything
   * that looks like a deadline (keyword match, not excluded).
   */
  async fetchFromCalendar() {
    if (!GoogleAPI.isTokenValid()) {
      AppState.set({ gcalDeadlines: [] });
      this.render();
      return;
    }

    const now    = new Date(); now.setHours(0, 0, 0, 0);
    const future = new Date(); future.setDate(future.getDate() + 90);

    const { data, error } = await safeFetch(GoogleAPI.fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
      '?timeMin=' + now.toISOString() +
      '&timeMax=' + future.toISOString() +
      '&singleEvents=true&orderBy=startTime&maxResults=500'
    ));
    if (error || !data) return;

    const excl   = AppState.get().excludeWords;
    const isExcl = (t) => excl.some(w => t?.toLowerCase().includes(w.toLowerCase()));
    const isKw   = (t) => CONFIG.DEADLINE_KEYWORDS.some(k => t?.toLowerCase().includes(k));
    const seen   = new Set();

    const gcalDeadlines = (data.items || []).map(e => {
      const title = e.summary || '';
      const ds    = (e.start.date || e.start.dateTime || '').split('T')[0];
      if (!title || !ds || isExcl(title) || !isKw(title)) return null;
      if (seen.has(e.id)) return null;
      seen.add(e.id);
      return {
        id: 'gcal_' + e.id,
        name: title,
        course: 'Google Calendar',
        date:   ds,
        fromGcal:     true,
        gcalEventId:  e.id
      };
    }).filter(Boolean);

    AppState.set({ gcalDeadlines });
    this.render();
  },

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  render() {
    const state   = AppState.get();
    const list    = document.getElementById('deadline-list');
    const now     = new Date(); now.setHours(0, 0, 0, 0);

    // Merge manual + GCal deadlines, deduplicating by name+date
    const combined = [...state.deadlines];
    state.gcalDeadlines.forEach(gd => {
      if (!state.deadlines.some(m =>
        m.name.toLowerCase() === gd.name.toLowerCase() && m.date === gd.date
      )) combined.push(gd);
    });

    if (!combined.length) {
      list.innerHTML = '<div class="empty-state">No upcoming deadlines</div>';
      return;
    }

    list.innerHTML = [...combined]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(d => {
        const due  = new Date(d.date + 'T00:00:00');
        const diff = Math.round((due - now) / 86400000);
        const cls  = diff <= 2 ? 'urgent' : diff <= 7 ? 'soon' : 'ok';
        const lbl  = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : 'In ' + diff + ' days';
        const dStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return (
          '<div class="deadline-item ' + cls + '">' +
            '<div style="flex:1;min-width:0;">' +
              '<div class="deadline-name">' + escapeHtml(d.name) + '</div>' +
              '<div class="deadline-course">' + escapeHtml(d.course) + '</div>' +
            '</div>' +
            '<button class="deadline-delete" onclick="window.deleteDeadline(\'' + d.id + '\')" title="Delete">\u2715</button>' +
            '<div style="flex-shrink:0;">' +
              '<div class="deadline-date ' + cls + '">' + dStr + '</div>' +
              '<div class="deadline-days">' + lbl + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
  },

  // --------------------------------------------------------
  // Add (manual entry from modal)
  // --------------------------------------------------------

  add() {
    const name   = document.getElementById('dl-name')?.value.trim();
    const date   = document.getElementById('dl-date')?.value;
    const course = document.getElementById('dl-course')?.value.trim() || 'General';
    if (!name || !date) return;

    this.closeModal();
    document.getElementById('dl-name').value   = '';
    document.getElementById('dl-course').value = '';

    const id        = 'manual_' + Date.now();
    const deadlines = [...AppState.get().deadlines, { id, name, course, date }];
    AppState.set({ deadlines });
    Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, deadlines);
    this.render();

    // Optionally mirror to Google Calendar
    if (GoogleAPI.isTokenValid()) {
      const end = new Date(date + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method:  'POST',
        headers: {
          Authorization:  'Bearer ' + AppState.get().accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary:     name,
          description: 'Deadline (' + course + ')',
          start: { date },
          end:   { date: end.toISOString().split('T')[0] },
          colorId: '11'
        })
      })
        .then(r => r.json())
        .then(data => {
          if (data && !data.error) {
            const updated = AppState.get().deadlines.map(d =>
              d.id === id ? { ...d, gcalEventId: data.id } : d
            );
            AppState.set({ deadlines: updated });
            Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, updated);
            this.fetchFromCalendar();
          }
        })
        .catch(console.error);
    }
  },

  // --------------------------------------------------------
  // Delete
  // --------------------------------------------------------

  async delete(id) {
    if (!confirm('Delete this deadline?')) return;

    const state  = AppState.get();
    const manual = state.deadlines.find(d => String(d.id) === String(id));

    if (manual) {
      const deadlines = state.deadlines.filter(d => String(d.id) !== String(id));
      AppState.set({ deadlines });
      Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, deadlines);

      if (manual.gcalEventId && GoogleAPI.isTokenValid()) {
        await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events/' + manual.gcalEventId,
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + state.accessToken } }
        );
      }
      this.render();
      return;
    }

    // GCal-sourced deadline
    const gcal = state.gcalDeadlines.find(d => String(d.id) === String(id));
    if (gcal?.gcalEventId && GoogleAPI.isTokenValid()) {
      await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events/' + gcal.gcalEventId,
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + state.accessToken } }
      );
      this.fetchFromCalendar();
    }
  },

  // --------------------------------------------------------
  // Modal helpers
  // --------------------------------------------------------

  openModal() {
    document.getElementById('deadline-modal').style.display = 'flex';
    const d  = new Date(); d.setDate(d.getDate() + 7);
    const di = document.getElementById('dl-date');
    if (di) di.value = d.toISOString().split('T')[0];
  },

  closeModal() {
    document.getElementById('deadline-modal').style.display = 'none';
  }
};

// ============================================================
// EXCLUDE-WORD TAGS (lives here because it directly affects deadline fetch)
// ============================================================

const ExcludeTags = {
  render() {
    const tags = document.getElementById('exclude-tags');
    if (!tags) return;
    tags.innerHTML = AppState.get().excludeWords.map((w, i) =>
      '<div class="tag">' + escapeHtml(w) +
      '<button class="tag-remove" onclick="window.removeExcludeTag(' + i + ')">\u00d7</button>' +
      '</div>'
    ).join('');
  },

  add() {
    const input = document.getElementById('exclude-input');
    const v     = input?.value.trim().toLowerCase();
    if (!v || AppState.get().excludeWords.includes(v)) return;
    const excludeWords = [...AppState.get().excludeWords, v];
    AppState.set({ excludeWords });
    Storage.save(CONFIG.STORAGE_KEYS.EXCLUDE_WORDS, excludeWords);
    if (input) input.value = '';
    this.render();
    Deadlines.fetchFromCalendar();
  },

  remove(i) {
    const excludeWords = AppState.get().excludeWords.filter((_, idx) => idx !== i);
    AppState.set({ excludeWords });
    Storage.save(CONFIG.STORAGE_KEYS.EXCLUDE_WORDS, excludeWords);
    this.render();
    Deadlines.fetchFromCalendar();
  },

  toggleSettings() {
    const open  = !AppState.get().settingsOpen;
    AppState.set({ settingsOpen: open });
    const panel = document.getElementById('settings-panel');
    if (panel) panel.style.display = open ? 'block' : 'none';
    if (open) this.render();
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.openDeadlineModal  = () => Deadlines.openModal();
window.closeDeadlineModal = () => Deadlines.closeModal();
window.confirmDeadline    = () => Deadlines.add();
window.deleteDeadline     = (id) => Deadlines.delete(id);
window.toggleSettings     = () => ExcludeTags.toggleSettings();
window.addExcludeTag      = () => ExcludeTags.add();
window.removeExcludeTag   = (i) => ExcludeTags.remove(i);
