/**
 * modals.js
 * Event detail modal with inline edit (title, time, location, description)
 * and delete. Syncs to Google Calendar when a token is available.
 * Depends on: config.js, state.js, google-api.js, calendar.js
 */

// ============================================================
// STATE
// ============================================================

let _currentEv = null; // the event object currently shown in the modal

// ============================================================
// OPEN
// ============================================================

function openEventModalFromAttr(el) {
  try {
    const raw = el?.dataset?.ev;
    if (!raw) return;
    _currentEv = JSON.parse(decodeURIComponent(raw));
    _renderView();
    document.getElementById('event-modal').style.display = 'flex';
  } catch(e) { console.error(e); }
}

// ============================================================
// VIEW MODE
// ============================================================

function _renderView() {
  const ev = _currentEv;
  const overlay = document.getElementById('event-modal');
  overlay.innerHTML = `
    <div class="modal event-modal">
      <h3 id="event-title">${escapeHtml(ev.name || '(no title)')}</h3>
      <div class="event-meta" id="event-when">${_formatWhen(ev)}</div>
      ${(ev.location||'').trim() ? `<div class="event-meta" id="event-where">${escapeHtml(ev.location)}</div>` : ''}
      ${(ev.description||'').trim() ? `<div class="event-desc" id="event-desc">${escapeHtml(ev.description)}</div>` : ''}
      <div class="event-actions">
        ${ev.htmlLink ? `<a class="btn-accent" href="${escapeHtml(ev.htmlLink)}" target="_blank" style="text-decoration:none;">Open in Google Calendar</a>` : ''}
        <button class="btn-subtle" onclick="window._openEditMode()">Edit</button>
        <button class="btn-subtle ev-delete-btn" onclick="window._deleteEvent()">Delete</button>
        <button class="btn-subtle" onclick="window.closeEventModal()">Close</button>
      </div>
    </div>`;
}

// ============================================================
// EDIT MODE
// ============================================================

window._openEditMode = function() {
  const ev = _currentEv;

  // Parse ISO datetimes into local datetime-local input values
  const toLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  const startVal = ev.allDay ? (ev.startISO||'').split('T')[0] : toLocal(ev.startISO);
  const endVal   = ev.allDay ? (ev.endISO||'').split('T')[0]   : toLocal(ev.endISO);
  const timeType = ev.allDay ? 'date' : 'datetime-local';

  document.getElementById('event-modal').innerHTML = `
    <div class="modal event-modal">
      <h3>Edit event</h3>
      <label class="ev-edit-label">Title</label>
      <input class="field" id="ev-edit-title" value="${escapeHtml(ev.name||'')}" style="width:100%;margin-bottom:9px;">
      <label class="ev-edit-label">Start</label>
      <input class="field" id="ev-edit-start" type="${timeType}" value="${startVal}" style="width:100%;margin-bottom:9px;">
      <label class="ev-edit-label">End</label>
      <input class="field" id="ev-edit-end"   type="${timeType}" value="${endVal}"   style="width:100%;margin-bottom:9px;">
      <label class="ev-edit-label">Location</label>
      <input class="field" id="ev-edit-loc"   value="${escapeHtml(ev.location||'')}" placeholder="Location" style="width:100%;margin-bottom:9px;">
      <label class="ev-edit-label">Description</label>
      <textarea class="field" id="ev-edit-desc" rows="3" style="width:100%;margin-bottom:9px;resize:vertical;">${escapeHtml(ev.description||'')}</textarea>
      <div class="event-actions">
        <button class="btn-primary" onclick="window._saveEdit()">Save</button>
        <button class="btn-subtle"  onclick="window._renderView()">Cancel</button>
      </div>
    </div>`;
};

// ============================================================
// SAVE EDIT
// ============================================================

window._saveEdit = async function() {
  const ev    = _currentEv;
  const title = document.getElementById('ev-edit-title')?.value.trim();
  const start = document.getElementById('ev-edit-start')?.value;
  const end   = document.getElementById('ev-edit-end')?.value;
  const loc   = document.getElementById('ev-edit-loc')?.value.trim();
  const desc  = document.getElementById('ev-edit-desc')?.value.trim();

  if (!title) return;

  // Update local copy
  _currentEv = { ...ev, name: title, location: loc, description: desc };

  if (ev.allDay) {
    _currentEv.startISO = start;
    _currentEv.endISO   = end;
  } else {
    _currentEv.startISO = start ? new Date(start).toISOString() : ev.startISO;
    _currentEv.endISO   = end   ? new Date(end).toISOString()   : ev.endISO;
    // Rebuild timeStr
    const st = new Date(_currentEv.startISO);
    const et = new Date(_currentEv.endISO);
    _currentEv.timeStr = st.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) +
                         ' – ' + et.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  }

  // Push to Google Calendar if connected
  if (GoogleAPI.isTokenValid() && ev.id) {
    const body = {
      summary:     title,
      location:    loc,
      description: desc
    };
    if (ev.allDay) {
      body.start = { date: _currentEv.startISO };
      body.end   = { date: _currentEv.endISO   };
    } else {
      body.start = { dateTime: _currentEv.startISO };
      body.end   = { dateTime: _currentEv.endISO   };
    }
    try {
      await fetch(
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
    } catch(e) { console.error(e); }
  }

  closeEventModal();
  if (GoogleAPI.isTokenValid()) Calendar.fetchEvents();
  else Calendar.render();
};

// ============================================================
// DELETE
// ============================================================

window._deleteEvent = async function() {
  const ev = _currentEv;
  if (!confirm('Delete "' + (ev.name || 'this event') + '"?')) return;

  if (GoogleAPI.isTokenValid() && ev.id) {
    try {
      await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events/' + ev.id,
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + AppState.get().accessToken } }
      );
    } catch(e) { console.error(e); }
  }

  closeEventModal();
  if (GoogleAPI.isTokenValid()) Calendar.fetchEvents();
  else Calendar.render();
};

// ============================================================
// HELPERS
// ============================================================

function _formatWhen(ev) {
  if (ev.allDay) {
    const start = (ev.startISO || '').split('T')[0];
    return start
      ? 'All day · ' + new Date(start + 'T00:00:00').toLocaleDateString(undefined,
          { weekday:'short', month:'short', day:'numeric', year:'numeric' })
      : 'All day';
  }
  if (ev.startISO) {
    const st = new Date(ev.startISO);
    const et = ev.endISO ? new Date(ev.endISO) : null;
    const dp = st.toLocaleDateString(undefined,
      { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const tp = et
      ? st.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) +
        ' – ' + et.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})
      : st.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    return dp + ' · ' + tp;
  }
  return ev.timeStr || '';
}

// ============================================================
// CLOSE
// ============================================================

function closeEventModal() {
  const o = document.getElementById('event-modal');
  if (o) { o.style.display = 'none'; o.innerHTML = _blankModalHTML(); }
  _currentEv = null;
}

function _blankModalHTML() {
  return `<div class="modal event-modal">
    <h3 id="event-title">Event</h3>
    <div class="event-meta" id="event-when"></div>
    <div class="event-meta" id="event-where" style="display:none;"></div>
    <div class="event-desc" id="event-desc"  style="display:none;"></div>
    <div class="event-actions">
      <a class="btn-accent" id="event-open-link" href="#" target="_blank" style="text-decoration:none;">Open in Google Calendar</a>
      <button class="btn-subtle" onclick="window.closeEventModal()">Close</button>
    </div>
  </div>`;
}

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.openEventModalFromAttr = (el) => openEventModalFromAttr(el);
window.closeEventModal        = () => closeEventModal();
window._renderView            = () => _renderView();
