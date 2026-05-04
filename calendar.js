/**
 * calendar.js
 * All four calendar views (day / week / month / year), event fetching,
 * and the horizontal-scroll wheel navigation.
 * Depends on: config.js, state.js, theme.js, google-api.js
 */

// ============================================================
// HELPERS
// ============================================================

/** Format a Date as YYYY-MM-DD in LOCAL timezone (avoids UTC offset shift). */
function localDateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ============================================================
// CAL-NAV — lightweight slide helper
// ============================================================

const CalNav = {
  _savedScroll: 0,

  render(container, html) {
    container.innerHTML = html;
  },

  slide(container, html) {
    const scrollEl = container.querySelector('.tg-scroll');
    if (scrollEl) this._savedScroll = scrollEl.scrollTop;
    container.innerHTML = html;
    const newScrollEl = container.querySelector('.tg-scroll');
    if (newScrollEl) newScrollEl.scrollTop = this._savedScroll;
  }
};

// ============================================================
// CALENDAR MODULE
// ============================================================

const Calendar = {
  render() {
    const { calView, calDate } = AppState.get();
    this._setLabel(calDate, calView);
    const container = document.getElementById('cal-container');
    CalNav.render(container, this._buildView(calDate, calView));
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

    const container = document.getElementById('cal-container');
    CalNav.slide(container, this._buildView(newDate, calView), dir);
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
    let start, end;
    const y = calDate.getFullYear(), mo = calDate.getMonth(), d = calDate.getDate();

    if (calView === 'day') {
      start = new Date(y, mo, d);
      end   = new Date(y, mo, d, 23, 59, 59);
    } else if (calView === 'week') {
      start = new Date(calDate);
      start.setDate(calDate.getDate() - calDate.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
    } else if (calView === 'month') {
      start = new Date(y, mo, 1);
      end   = new Date(y, mo + 1, 1);
    } else {
      start = new Date(y, 0, 1);
      end   = new Date(y + 1, 0, 1);
    }

    const { data, error } = await safeFetch(GoogleAPI.fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
      '?timeMin=' + start.toISOString() +
      '&timeMax=' + end.toISOString() +
      '&singleEvents=true&orderBy=startTime&maxResults=500'
    ));
    if (error || !data) return;

    const newEvents  = {};
    const colorMap   = { ...AppState.get().colorMap };
    let colorCounter = AppState.get().colorCounter;

    (data.items || []).forEach(e => {
      // Use local timezone for dateTime events to avoid UTC offset shifting the day
      let ds;
      if (e.start.date) {
        ds = e.start.date; // all-day: already YYYY-MM-DD, no timezone issue
      } else if (e.start.dateTime) {
        ds = localDateKey(new Date(e.start.dateTime));
      } else {
        return;
      }

      if (!newEvents[ds]) newEvents[ds] = [];

      const name = e.summary || '(no title)';
      if (!(name in colorMap)) { colorMap[name] = colorCounter % CONFIG.EV_COLORS.length; colorCounter++; }
      const colorIdx = colorMap[name];

      if (e.start.dateTime) {
        const st = new Date(e.start.dateTime);
        const et = new Date(e.end ? e.end.dateTime : e.start.dateTime);
        const startMin = st.getHours() * 60 + st.getMinutes();
        const endMin   = et.getHours() * 60 + et.getMinutes() || startMin + 60;

        if (!newEvents[ds].some(x => x.name === name && x.startMin === startMin)) {
          newEvents[ds].push({
            id: e.id, name, startMin, endMin,
            timeStr:     this._fmt12(st) + ' \u2013 ' + this._fmt12(et),
            colorIdx,    allDay:      false,
            startISO:    e.start.dateTime,
            endISO:      e.end?.dateTime || e.start.dateTime,
            location:    e.location    || '',
            description: e.description || '',
            htmlLink:    e.htmlLink    || ''
          });
        }
      } else if (!newEvents[ds].some(x => x.name === name && !x.startMin)) {
        newEvents[ds].push({
          id: e.id, name, colorIdx, allDay: true,
          startISO:    e.start.date || ds,
          endISO:      e.end?.date  || ds,
          location:    e.location    || '',
          description: e.description || '',
          htmlLink:    e.htmlLink    || ''
        });
      }
    });

    AppState.set({ calEvents: newEvents, colorMap, colorCounter });

    // Re-render in-place while preserving scroll
    const { calView: view, calDate: date } = AppState.get();
    const container = document.getElementById('cal-container');
    if (!container) return;
    const scrollEl    = container.querySelector('.tg-scroll');
    const savedScroll = scrollEl ? scrollEl.scrollTop : 0;
    CalNav.render(container, this._buildView(date, view));
    const newScrollEl = container.querySelector('.tg-scroll');
    if (newScrollEl) newScrollEl.scrollTop = savedScroll;
  },

  // --------------------------------------------------------
  // View builder dispatcher
  // --------------------------------------------------------

  _buildView(date, view) {
    if      (view === 'day')   return this._buildTimeGrid([date]);
    else if (view === 'week')  {
      const week = [];
      const sun  = new Date(date);
      sun.setDate(date.getDate() - date.getDay());
      for (let i = 0; i < 7; i++) {
        const d = new Date(sun); d.setDate(sun.getDate() + i);
        week.push(d);
      }
      return this._buildTimeGrid(week);
    } else if (view === 'month') {
      return this._buildMonthGrid(date);
    } else {
      return this._buildYearGrid(date);
    }
  },

  // --------------------------------------------------------
  // Label for the nav bar
  // --------------------------------------------------------

  _setLabel(date, view) {
    const el = document.getElementById('cal-nav-label');
    if (!el) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (view === 'day') {
      const isToday = date.toDateString() === today.toDateString();
      el.textContent = isToday
        ? 'Today, ' + CONFIG.MONTHS_SH[date.getMonth()] + ' ' + date.getDate()
        : CONFIG.DAYS_SHORT[date.getDay()] + ', ' + CONFIG.MONTHS_SH[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
    } else if (view === 'week') {
      const sun = new Date(date);
      sun.setDate(date.getDate() - date.getDay());
      const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
      const sameMonth = sun.getMonth() === sat.getMonth();
      el.textContent = sameMonth
        ? CONFIG.MONTHS_SH[sun.getMonth()] + ' ' + sun.getDate() + ' \u2013 ' + sat.getDate() + ', ' + sat.getFullYear()
        : CONFIG.MONTHS_SH[sun.getMonth()] + ' ' + sun.getDate() + ' \u2013 ' + CONFIG.MONTHS_SH[sat.getMonth()] + ' ' + sat.getDate() + ', ' + sat.getFullYear();
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
    const state       = AppState.get();
    const y = date.getFullYear(), m = date.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const pad         = new Date(y, m, 1).getDay();
    const today       = new Date(); today.setHours(0, 0, 0, 0);

    let html = '<div class="month-wrap"><div class="month-grid">';
    CONFIG.DAYS_SHORT.forEach(d => {
      html += '<div class="month-head">' + d + '</div>';
    });

    const prevDays = new Date(y, m, 0).getDate();
    for (let i = pad - 1; i >= 0; i--) {
      html += '<div class="month-cell other-month"><div class="month-num">' + (prevDays - i) + '</div></div>';
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const d   = new Date(y, m, i);
      const ds  = localDateKey(d);
      const isToday = d.toDateString() === today.toDateString();
      const evs = (state.calEvents[ds] || []).slice(0, 3);

      html += '<div class="month-cell' + (isToday ? ' today' : '') + '">';
      html += '<div class="month-num">' + i + '</div>';
      evs.forEach((e, idx) => {
        html += '<div class="month-mini-ev"' +
          ' onclick="window.openEventModalFromAttr(this)"' +
          ' data-ev="' + encodeURIComponent(JSON.stringify(e)) + '"' +
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

      html += '<div class="mini-month" onclick="Calendar.setView(\'month\');AppState.set({calDate:new Date(' + y + ',' + mo + ',1)});Calendar.render();">';
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
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const TOTAL_PX = CONFIG.PX_PER_HOUR * 24;

    // --- Header row ---
    let h = '<div class="tg-header"><div class="tg-header-gutter"></div><div class="tg-header-days">';
    days.forEach(d => {
      const isT = d.toDateString() === today.toDateString();
      h += '<div class="tg-head-day">' +
        '<span class="tg-head-day-name">' + CONFIG.DAYS_SHORT[d.getDay()] + '</span>' +
        '<div class="tg-head-day-num' + (isT ? ' today' : '') + '">' + d.getDate() + '</div>' +
        '</div>';
    });
    h += '</div></div>';

    // --- All-day row ---
    let anyAllDay = false;
    const allDayByDate = {};
    days.forEach(d => {
      const ds  = localDateKey(d);
      const evs = (state.calEvents[ds] || []).filter(e => e.allDay);
      if (evs.length) anyAllDay = true;
      allDayByDate[ds] = evs;
    });

    let adh = '';
    if (anyAllDay) {
      adh = '<div class="tg-allday"><div class="tg-allday-gutter">All day</div><div class="tg-allday-days">';
      days.forEach(d => {
        const ds  = localDateKey(d);
        const evs = (allDayByDate[ds] || []).slice(0, 3);
        adh += '<div class="tg-allday-col">';
        evs.forEach((e, idx) => {
          adh += '<div class="tg-allday-ev"' +
            ' onclick="window.openEventModalFromAttr(this)"' +
            ' data-ev="' + encodeURIComponent(JSON.stringify(e)) + '"' +
            ' style="border-left-color:' + Theme.evColor(e.colorIdx || idx) + ';">' +
            escapeHtml(e.name) + '</div>';
        });
        adh += '</div>';
      });
      adh += '</div></div>';
    }

    // --- Hour gutter ---
    let gut = '<div class="tg-gutter">';
    for (let hr = 0; hr < 24; hr++) {
      const lbl = hr === 0 ? '' : hr < 12 ? hr + ' AM' : hr === 12 ? '12 PM' : (hr - 12) + ' PM';
      gut += '<div class="tg-hour-label" style="top:' + (hr * CONFIG.PX_PER_HOUR) + 'px">' + lbl + '</div>';
    }
    gut += '</div>';

    // --- Day columns ---
    let dc = '<div class="tg-days">';
    days.forEach(d => {
      const ds     = localDateKey(d);
      const dayEvs = (state.calEvents[ds] || []).filter(e => e.startMin !== undefined);
      const sorted = [...dayEvs].sort((a, b) => a.startMin - b.startMin);

      // Simple column-packing for overlapping events
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

      dc += '<div class="tg-day-col">';

      // Hour / half-hour lines
      for (let hr = 0; hr < 24; hr++) {
        dc += '<div class="tg-hline" style="top:' + (hr * CONFIG.PX_PER_HOUR) + 'px"></div>';
        dc += '<div class="tg-hline half" style="top:' + (hr * CONFIG.PX_PER_HOUR + CONFIG.PX_PER_HOUR / 2) + 'px"></div>';
      }

      // "Now" line for today
      if (d.toDateString() === today.toDateString()) {
        const pct = (new Date().getHours() * 60 + new Date().getMinutes()) / (24 * 60);
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
          ' data-ev="' + encodeURIComponent(JSON.stringify(ev)) + '">' +
          '<div class="ev-name">' + escapeHtml(ev.name) + '</div>' +
          (height > 30 ? '<div class="ev-time">' + escapeHtml(ev.timeStr) + '</div>' : '') +
          '</div>';
      });

      dc += '</div>';
    });
    dc += '</div>';

    return '<div class="tg-wrap">' + h + adh +
      '<div class="tg-scroll"><div class="tg-body" style="height:' + TOTAL_PX + 'px;">' + gut + dc + '</div></div>' +
      '</div>';
  },

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  _fmt12(d) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  },

  _scrollToHour(hr) {
    requestAnimationFrame(() => {
      const el = document.querySelector('#cal-container .tg-scroll');
      if (el) el.scrollTop = hr * CONFIG.PX_PER_HOUR;
    });
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.setView = (v) => Calendar.setView(v);
window.navCal  = (d) => Calendar.navigate(d);
window.goToday = ()  => Calendar.goToday();

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
