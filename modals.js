/**
 * modals.js
 * Event detail modal — opens when you click a calendar event block.
 * (The deadline modal and PDF modal have their open/close logic
 * in deadlines.js and drive.js respectively; this file owns the
 * Google Calendar event modal only.)
 * Depends on: config.js (escapeHtml)
 */

// ============================================================
// EVENT MODAL
// ============================================================

function openEventModalFromAttr(el) {
  try {
    const raw = el?.dataset?.ev;
    if (!raw) return;
    const ev = JSON.parse(decodeURIComponent(raw));

    const overlay = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const whenEl  = document.getElementById('event-when');
    const whereEl = document.getElementById('event-where');
    const descEl  = document.getElementById('event-desc');
    const linkEl  = document.getElementById('event-open-link');
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
    linkEl.href         = ev.htmlLink || '#';
    linkEl.style.display = ev.htmlLink ? '' : 'none';

    overlay.style.display = 'flex';
  } catch(e) { console.error(e); }
}

function closeEventModal() {
  const o = document.getElementById('event-modal');
  if (o) o.style.display = 'none';
}

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.openEventModalFromAttr = (el) => openEventModalFromAttr(el);
window.closeEventModal        = () => closeEventModal();
