/**
 * calendar.js
 * All four calendar views (day / week / month / year), event fetching,
 * and the horizontal-scroll wheel navigation.
 * Depends on: config.js (CONFIG, Storage, safeFetch, escapeHtml, localDateKey),
 *             state.js, theme.js, google-api.js, modals.js (openEventModalFromAttr)
 */

// ============================================================
// SMALL SHARED HELPERS (module-local)
// ============================================================

/** Midnight of today, local time. */
function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Build an onclick-free data attribute carrying the event payload for the modal. */
function evAttr(ev) {
  return ' data-ev="' + encodeURIComponent(JSON.stringify(ev)) + '"';
}

// ============================================================
// CAL-NAV — lightweight render / slide helper
// ============================================================

const CalNav = {
  render(container, html) {
    container.innerHTML = html;
  },

  /** Replace contents while preserving the time-grid's vertical scroll. */
  slide(container, html) {
    const scrollEl = container.querySelector('.tg-scroll');
    const saved    = scrollEl ? scrollEl.scrollTop : 0;
    container.innerHTML = html;
    const fresh = container.querySelector('.tg-scroll');
    if (fresh) fresh.scrollTop = saved;
  }
};

// ============================================================
// CALENDAR MODULE
// ============================================================

const Calendar = {

  // --------------------------------------------------------
  // Public API (wired to header buttons)
  // --------------------------------------------------------

  render() {
    const { calView, calDate } = AppState.get();
    this._setLabel(calDate, calView);
    CalNav.render(document.getElementById('cal-container'), this._buildView(calDate, calView));
    if (calView === 'day' || calView === 'week') this._scrollToHour(8);
  },

  setView(v) {
    AppState.set({ calView: v });
    document.querySelectorAll('.view-tab').forEach(b =>
      b.classList.toggle('active', b.id === 'tab-' + v)
    );
    this.render();
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },

  navigate(dir) {
    const { calView, calDate } = AppState.get();
    const newDate = new Date(calDate);

    if      (calView === 'day')   newDate.setDate(calDate.getDate() + dir);
    else if (calView === 'week')  newDate.setDate(calDate.getDate() + dir * 7);
    else if (calView === 'month') newDate.setMonth(calDate.getMonth() + dir);
    else                          newDate.setFullYear(calDate.getFullYear() + dir);

    AppState.set({ calDate: newDate });
    this._setLabel(newDate, calView);
    CalNav.slide(document.getElementById('cal-container'), this._buildView(newDate, calView));
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },

  goToday() {
    AppState.set({ calDate: new Date() });
    this.render();
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },

  // --------------------------------------------------------
  // Google Calendar event fetch
  // --------------------------------------------------------

  async fetchEvents() {
    const { calView, calDate } = AppState.get();
    const { start, end } = this._apiPeriod(calDate, calView);

    const { data, error } = await safeFetch(GoogleAPI.fetch(
      CONFIG.API.CALENDAR_EVENTS +
      '?timeMin=' + start.toISOString() +
      '&timeMax=' + end.toISOString() +
      '&singleEvents=true&orderBy=startTime&maxResults=500'
    ));
    if (error || !data) return;

    const { events, colorMap, colorCounter } = this._normalizeEvents(data.items || []);
    AppState.set({ calEvents: events, colorMap, colorCounter });

    // Re-render in place without jumping the scroll position
    const container = document.getElementById('cal-container');
    if (!container) return;
    const { calDate: date, calView: view } = AppState.get();
    CalNav.slide(container, this._buildView(date, view));
  },

  /** Date range to query from the API for a given view. */
  _apiPeriod(date, view) {
    const y = date.getFullYear(), mo = date.getMonth(), d = date.getDate();
    let start, end;

    if (view === 'day') {
      start = new Date(y, mo, d);
      end   = new Date(y, mo, d, 23, 59, 59);
    } else if (view === 'week') {
      start = this._weekDays(date)[0];
      end   = new Date(start);
      end.setDate(start.getDate() + 7);
    } else if (view === 'month') {
      start = new Date(y, mo, 1);
      end   = new Date(y, mo + 1, 1);
    } else { // year
      start = new Date(y, 0, 1);
      end   = new Date(y + 1, 0, 1);
    }
    return { start, end };
  },

  /** Map raw Google events into per-day normalized event objects + color assignments. */
  _normalizeEvents(items) {
    const events     = {};
    const colorMap   = { ...AppState.get().colorMap };
    let colorCounter = AppState.get().colorCounter;

    items.forEach(e => {
      // Use local timezone for dateTime events to avoid UTC offset shifting the day
      let ds;
      if (e.start.date) {
        ds = e.start.date; // all-day: already YYYY-MM-DD, no timezone issue
      } else if (e.start.dateTime) {
        ds = localDateKey(new Date(e.start.dateTime));
      } else {
        return;
      }

      if (!events[ds]) events[ds] = [];

      const name = e.summary || '(no title)';
      if (!(name in colorMap)) { colorMap[name] = colorCounter % CONFIG.EV_COLORS.length; colorCounter++; }
      const colorIdx = colorMap[name];

      if (e.start.dateTime) {
        const st = new Date(e.start.dateTime);
        const et = new Date(e.end ? e.end.dateTime : e.start.dateTime);
        const startMin = st.getHours() * 60 + st.getMinutes();
        const endMin   = et.getHours() * 60 + et.getMinutes() || startMin + 60;

        if (!events[ds].some(x => x.name === name && x.startMin === startMin)) {
          events[ds].push({
            id: e.id, name, startMin, endMin,
            timeStr:     fmt12h(st) + ' \u2013 ' + fmt12h(et),
            colorIdx,    allDay: false,
            startISO:    e.start.dateTime,
            endISO:      e.end?.dateTime || e.start.dateTime,
            location:    e.location    || '',
            description: e.description || '',
            htmlLink:    e.htmlLink    || ''
          });
        }
      } else if (!events[ds].some(x => x.name === name && !x.startMin)) {
        events[ds].push({
          id: e.id, name, colorIdx, allDay: true,
          startISO:    e.start.date || ds,
          endISO:      e.end?.date  || ds,
          location:    e.location    || '',
          description: e.description || '',
          htmlLink:    e.htmlLink    || ''
        });
      }
    });

    return { events, colorMap, colorCounter };
  },

  // --------------------------------------------------------
  // View builder dispatcher
  // --------------------------------------------------------

  _buildView(date, view) {
    if (view === 'day')   return this._buildTimeGrid([date]);
    if (view === 'week')  return this._buildTimeGrid(this._weekDays(date));
    if (view === 'month') return this._buildMonthGrid(date);
    return this._buildYearGrid(date);
  },

  /** The 7 Date objects (Sunday-first) of the week containing `date`. */
  _weekDays(date) {
    const sun = new Date(date);
    sun.setDate(date.getDate() - date.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun);
      d.setDate(sun.getDate() + i);
      return d;
    });
  },

  // --------------------------------------------------------
  // Label for the nav bar
  // --------------------------------------------------------

  _setLabel(date, view) {
    const el = document.getElementById('cal-nav-label');
    if (!el) return;
    const today = startOfToday();

    if (view === 'day') {
      const isToday = date.toDateString() === today.toDateString();
      el.textContent = isToday
        ? 'Today, ' + CONFIG.MONTHS_SH[date.getMonth()] + ' ' + date.getDate()
        : CONFIG.DAYS_SHORT[date.getDay()] + ', ' + CONFIG.MONTHS_SH[date.getMonth()] + ' ' +
          date.getDate() + ', ' + date.getFullYear();

    } else if (view === 'week') {
      const [sun, sat] = [this._weekDays(date)[0], this._weekDays(date)[6]];
      const sameMonth = sun.getMonth() === sat.getMonth();
      el.textContent = sameMonth
        ? CONFIG.MONTHS_SH[sun.getMonth()] + ' ' + sun.getDate() + ' \u2013 ' + sat.getDate() + ', ' + sat.getFullYear()
        : CONFIG.MONTHS_SH[sun.getMonth()] + ' ' + sun.getDate() + ' \u2013 ' +
          CONFIG.MONTHS_SH[sat.getMonth()] + ' ' + sat.getDate() + ', ' + sat.getFullYear();

    } else if (view === 'month') {
      el.textContent = CONFIG.MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    } else {
      el.textContent = String(date.getFullYear());
    }
  },

  // --------------------------------------------------------
  // Month grid
  // --------------------------------------------------------

  _buildMonthGrid(date) {
    const state        = AppState.get();
    const y = date.getFullYear(), m = date.getMonth();
    const daysInMonth  = new Date(y, m + 1, 0).getDate();
    const pad          = new Date(y, m, 1).getDay();
    const prevDays     = new Date(y, m, 0).getDate();
    const today        = startOfToday();

    let html = '<div class="month-wrap"><div class="month-grid">';
    CONFIG.DAYS_SHORT.forEach(d => {
      html += '<div class="month-head">' + d + '</div>';
    });

    for (let i = pad - 1; i >= 0; i--) {
      html += '<div class="month-cell other-month"><div class="month-num">' + (prevDays - i) + '</div></div>';
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const d       = new Date(y, m, i);
      const ds      = localDateKey(d);
      const isToday = d.toDateString() === today.toDateString();
      const evs     = (state.calEvents[ds] || []).slice(0, 3);

      html += '<div class="month-cell' + (isToday ? ' today' : '') + '">';
      html += '<div class="month-num">' + i + '</div>';
      evs.forEach((e, idx) => {
        html += '<div class="month-mini-ev" onclick="window.openEventModalFromAttr(this)"' +
          evAttr(e) +
          ' style="background:' + Theme.evColor(e.colorIdx || idx) + '">' +
          escapeHtml(e.name) + '</div>';
      });
      html += '</div>';
    }

    const trailing = (7 - ((pad + daysInMonth) % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      html += '<div class="month-cell other-month"><div class="month-num">' + i + '</div></div>';
    }

    return html + '</div></div>';
  },

  // --------------------------------------------------------
  // Year grid (12 mini-months)
  // --------------------------------------------------------

  _buildYearGrid(date) {
    const y      = date.getFullYear();
    const today  = new Date();
    const events = AppState.get().calEvents;
    let html     = '<div class="year-wrap">';

    for (let mo = 0; mo < 12; mo++) {
      const first = new Date(y, mo, 1);
      const days  = new Date(y, mo + 1, 0).getDate();
      const pad   = first.getDay();

      html += '<div class="mini-month" data-year="' + y + '" data-month="' + mo + '" ' +
        'onclick="window.jumpToMonth(this)">';
      html += '<div class="mini-month-title">' + CONFIG.MONTHS_SH[mo] + '</div>';
      html += '<div class="mini-month-grid">';

      for (let p = 0; p < pad; p++) html += '<div class="mini-day"></div>';

      for (let d = 1; d <= days; d++) {
        const dt      = new Date(y, mo, d);
        const ds      = localDateKey(dt);
        const isToday = dt.toDateString() === today.toDateString();
        const hasEv   = !!(events[ds] && events[ds].length);
        html += '<div class="mini-day' + (isToday ? ' today' : hasEv ? ' has-event' : '') + '">' + d + '</div>';
      }

      html += '</div></div>';
    }

    return html + '</div>';
  },

  // --------------------------------------------------------
  // Time grid (day / week)
  // --------------------------------------------------------

  _buildTimeGrid(days) {
    const state    = AppState.get();
    const today    = startOfToday();
    const TOTAL_PX = CONFIG.PX_PER_HOUR * 24;

    const header = this._buildTimeGridHeader(days, today);
    const allday = this._buildAllDayRow(days, state, today);
    const gutter = this._buildHourGutter();
    const cols   = this._buildDayColumns(days, state, today, TOTAL_PX);

    return '<div class="tg-wrap">' + header + allday +
      '<div class="tg-scroll"><div class="tg-body" style="height:' + TOTAL_PX + 'px;">' + gutter + cols + '</div></div>' +
      '</div>';
  },

  _buildTimeGridHeader(days, today) {
    let h = '<div class="tg-header"><div class="tg-header-gutter"></div><div class="tg-header-days">';
    days.forEach(d => {
      const isT = d.toDateString() === today.toDateString();
      h += '<div class="tg-head-day">' +
        '<span class="tg-head-day-name">' + CONFIG.DAYS_SHORT[d.getDay()] + '</span>' +
        '<div class="tg-head-day-num' + (isT ? ' today' : '') + '">' + d.getDate() + '</div>' +
        '</div>';
    });
    return h + '</div></div>';
  },

  _buildAllDayRow(days, state, today) {
    let anyAllDay = false;
    const allDayByDate = {};
    days.forEach(d => {
      const ds  = localDateKey(d);
      const evs = (state.calEvents[ds] || []).filter(e => e.allDay);
      if (evs.length) anyAllDay = true;
      allDayByDate[ds] = evs;
    });

    if (!anyAllDay) return '';

    let adh = '<div class="tg-allday"><div class="tg-allday-gutter">All day</div><div class="tg-allday-days">';
    days.forEach(d => {
      const ds  = localDateKey(d);
      const evs = (allDayByDate[ds] || []).slice(0, 3);
      adh += '<div class="tg-allday-col">';
      evs.forEach((e, idx) => {
        adh += '<div class="tg-allday-ev" onclick="window.openEventModalFromAttr(this)"' +
          evAttr(e) +
          ' style="border-left-color:' + Theme.evColor(e.colorIdx || idx) + '">' +
          escapeHtml(e.name) + '</div>';
      });
      adh += '</div>';
    });
    return adh + '</div></div>';
  },

  _buildHourGutter() {
    let gut = '<div class="tg-gutter">';
    for (let hr = 0; hr < 24; hr++) {
      const lbl = hr === 0 ? '' : hr < 12 ? hr + ' AM' : hr === 12 ? '12 PM' : (hr - 12) + ' PM';
      gut += '<div class="tg-hour-label" style="top:' + (hr * CONFIG.PX_PER_HOUR) + 'px">' + lbl + '</div>';
    }
    return gut + '</div>';
  },

  _buildDayColumns(days, state, today, TOTAL_PX) {
    let dc = '<div class="tg-days">';

    days.forEach(d => {
      const ds = localDateKey(d);
      const dayEvs = (state.calEvents[ds] || []).filter(e => e.startMin !== undefined);
      const placed = packOverlappingEvents(dayEvs);

      dc += '<div class="tg-day-col">';

      // Hour / half-hour lines
      for (let hr = 0; hr < 24; hr++) {
        dc += '<div class="tg-hline" style="top:' + (hr * CONFIG.PX_PER_HOUR) + 'px"></div>';
        dc += '<div class="tg-hline half" style="top:' + (hr * CONFIG.PX_PER_HOUR + CONFIG.PX_PER_HOUR / 2) + 'px"></div>';
      }

      // "Now" line for today
      if (d.toDateString() === today.toDateString()) {
        const now   = new Date();
        const pct   = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
        dc += '<div class="tg-now" style="top:' + (pct * TOTAL_PX) + 'px"></div>';
      }

      // Event blocks
      placed.forEach(ev => {
        const top    = (ev.startMin / 60) * CONFIG.PX_PER_HOUR;
        const height = Math.max(20, ((ev.endMin - ev.startMin) / 60) * CONFIG.PX_PER_HOUR - 2);
        const colW   = 100 / ev.totalCols;
        const left   = ev.col * colW;
        const c      = Theme.evColor(ev.colorIdx);
        const bg     = c + (Theme.isDark() ? '28' : '1a');

        dc += '<div class="ev-block"' +
          ' style="top:' + top + 'px;height:' + height + 'px;' +
          'left:calc(' + left + '% + 2px);width:calc(' + colW + '% - 4px);' +
          'background:' + bg + ';border-left-color:' + c + ';color:' + c + ';"' +
          ' onclick="window.openEventModalFromAttr(this)"' +
          evAttr(ev) + '>' +
          '<div class="ev-name">' + escapeHtml(ev.name) + '</div>' +
          (height > 30 ? '<div class="ev-time">' + escapeHtml(ev.timeStr) + '</div>' : '') +
          '</div>';
      });

      dc += '</div>';
    });

    return dc + '</div>';
  },

  // --------------------------------------------------------
  // Misc helpers
  // --------------------------------------------------------

  _scrollToHour(hr) {
    requestAnimationFrame(() => {
      const el = document.querySelector('#cal-container .tg-scroll');
      if (el) el.scrollTop = hr * CONFIG.PX_PER_HOUR;
    });
  }
};

// ============================================================
// EVENT-GEOMETRY HELPER — simple column packing for overlaps
// ============================================================

/** Assign col/totalCols to a copy of the events so overlaps sit side by side. */
function packOverlappingEvents(dayEvs) {
  const sorted = [...dayEvs].sort((a, b) => a.startMin - b.startMin);
  const placed = [];

  sorted.forEach(ev => {
    let col = 0;
    while (placed.some(p => p.col === col && p.endMin > ev.startMin)) col++;
    placed.push({ ...ev, col });
  });

  placed.forEach(ev => {
    ev.totalCols = placed.filter(p =>
      p !== ev && p.startMin < ev.endMin && p.endMin > ev.startMin
    ).length + 1;
  });

  return placed;
}

/** 12-hour time like "9:05 AM". */
function fmt12h(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.setView = (v) => Calendar.setView(v);
window.navCal  = (d) => Calendar.navigate(d);
window.goToday = () => Calendar.goToday();

/** Year-view mini-month click → jump to that month. */
window.jumpToMonth = (el) => {
  AppState.set({ calDate: new Date(+el.dataset.year, +el.dataset.month, 1) });
  Calendar.setView('month');
};

// ============================================================
// HORIZONTAL SCROLL WHEEL → calendar navigation
// ============================================================

(function attachWheelNav() {
  let cooldown = false;
  document.getElementById('cal-container')?.addEventListener('wheel', function(e) {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (Math.abs(e.deltaX) < 8) return;
    e.preventDefault();
    if (cooldown) return;
    cooldown = true;
    setTimeout(() => { cooldown = false; }, 350);
    Calendar.navigate(e.deltaX > 0 ? 1 : -1);
  }, { passive: false });
})();
