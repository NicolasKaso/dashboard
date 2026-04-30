/**
 * modals.js
 * Event detail modal — opens when you click a calendar event block.
 * Supports viewing and editing Google Calendar events via PATCH.
 * Depends on: config.js, state.js, calendar.js
 */

// ============================================================
// STATE
// ============================================================

let _currentEventData = null;

// ============================================================
// OPEN MODAL
// ============================================================

function openEventModalFromAttr(el) {
  try {
    const raw = el?.dataset?.ev;
    if (!raw) return;
    const ev = JSON.parse(decodeURIComponent(raw));
    _currentEventData = ev;

    const overlay = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const whenEl  = document.getElementById('event-when');
    const whereEl = document.getElementById('event-where');
    const descEl  = document.getElementById('event-desc-view');
    const linkEl  = document.getElementById('event-open-link');
    const editBtn = document.getElementById('event-edit-btn');
    if (!overlay || !titleEl || !whenEl || !whereEl || !descEl || !linkEl) return;

    // Title
    titleEl.textContent = ev.name || '(no title)';

    // When
    let whenText = '';
    if (ev.allDay) {
      const start = (ev.startISO || '').split('T')[0];
      whenText = start
        ? 'All day \u00b7 ' + new Date(start + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
          })
        : 'All day';
    } else if (ev.startISO) {
      const st = new Date(ev.startISO);
      const et = ev.endISO ? new Date(ev.endISO) : null;
      const dp = st.toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
      const tp = et
        ? st.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
          ' \u2013 ' +
          et.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : st.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      whenText = dp + ' \u00b7 ' + tp;
    } else if (ev.timeStr) {
      whenText = ev.timeStr;
    }
    whenEl.textContent = whenText;

    // Where
    const loc = (ev.location || '').trim();
    whereEl.style.display = loc ? '' : 'none';
    whereEl.textContent   = loc;

    // Description
    const desc = (ev.description || '').trim();
    descEl.style.display = desc ? '' : 'none';
    descEl.textContent   = desc;

    // Link
    linkEl.href          = ev.htmlLink || '#';
    linkEl.style.display = ev.htmlLink ? '' : 'none';

    // Show Edit button only for real GCal events with a valid token
    const canEdit = !!(ev.id && AppState.get().accessToken);
    if (editBtn) editBtn.style.display = canEdit ? '' : 'none';

    // Reset edit form to closed state
    _hideEditForm();

    overlay.style.display = 'flex';
  } catch(e) { console.error(e); }
}

// ============================================================
// EDIT FORM HELPERS
// ============================================================

function _hideEditForm() {
  const form    = document.getElementById('event-edit-form');
  const saveBtn = document.getElementById('event-save-btn');
  const editBtn = document.getElementById('event-edit-btn');
  if (form)    form.style.display    = 'none';
  if (saveBtn) saveBtn.style.display = 'none';
  if (editBtn) editBtn.textContent   = 'Edit';
}

/** Convert an ISO datetime string to the value format needed by <input type="datetime-local"> */
function _toLocalInputValue(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
         'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// ============================================================
// TOGGLE EDIT FORM
// ============================================================

function toggleEventEdit() {
  const form    = document.getElementById('event-edit-form');
  const saveBtn = document.getElementById('event-save-btn');
  const editBtn = document.getElementById('event-edit-btn');
  const ev      = _currentEventData;
  if (!form || !ev) return;

  const isOpen = form.style.display !== 'none';
  if (isOpen) {
    _hideEditForm();
    return;
  }

  // Populate fields from current event data
  document.getElementById('edit-title').value    = ev.name || '';
  document.getElementById('edit-location').value = ev.location || '';
  document.getElementById('edit-desc').value     = ev.description || '';
  document.getElementById('edit-start').value    = _toLocalInputValue(ev.startISO);
  document.getElementById('edit-end').value      = _toLocalInputValue(ev.endISO);

  // Hide start/end inputs for all-day events (dates aren't editable here)
  const timeRow = document.getElementById('edit-time-row');
  if (timeRow) timeRow.style.display = ev.allDay ? 'none' : 'flex';

  form.style.display    = 'block';
  saveBtn.style.display = '';
  editBtn.textContent   = 'Cancel';
}

// ============================================================
// SAVE EDIT
// ============================================================

async function saveEventEdit() {
  const ev = _currentEventData;
  if (!ev?.id) return;

  const title    = document.getElementById('edit-title').value.trim();
  const location = document.getElementById('edit-location').value.trim();
  const desc     = document.getElementById('edit-desc').value.trim();
  const startVal = document.getElementById('edit-start').value;
  const endVal   = document.getElementById('edit-end').value;

  if (!title) { Toast.error('Title is required'); return; }

  const body = {
    summary:     title,
    location:    location,
    description: desc
  };

  if (ev.allDay) {
    // Preserve original all-day dates
    body.start = { date: (ev.startISO || '').split('T')[0] };
    body.end   = { date: (ev.endISO   || '').split('T')[0] };
  } else {
    if (!startVal || !endVal) { Toast.error('Start and end times are required'); return; }
    const startDate = new Date(startVal);
    const endDate   = new Date(endVal);
    if (endDate <= startDate) { Toast.error('End time must be after start time'); return; }
    body.start = { dateTime: startDate.toISOString() };
    body.end   = { dateTime: endDate.toISOString() };
  }

  const saveBtn = document.getElementById('event-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/' + ev.id,
      {
        method:  'PATCH',
        headers: {
          Authorization:  'Bearer ' + AppState.get().accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    Toast.success('Event updated');
    closeEventModal();
    Calendar.fetchEvents();
  } catch(err) {
    Toast.error(err.message || 'Failed to save event');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

// ============================================================
// CLOSE MODAL
// ============================================================

function closeEventModal() {
  const o = document.getElementById('event-modal');
  if (o) o.style.display = 'none';
  _currentEventData = null;
  _hideEditForm();
}

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.openEventModalFromAttr = (el) => openEventModalFromAttr(el);
window.closeEventModal        = () => closeEventModal();
window.toggleEventEdit        = () => toggleEventEdit();
window.saveEventEdit          = () => saveEventEdit();
