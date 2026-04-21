/**
 * Nicolas Dashboard
 * Features: Sliding calendar (all views), urgent tasks, cross-device sync, responsive
 */

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const CONFIG = {
  CLIENT_ID: '525270045169-ro6l87v50nn2ed2cufgdqub2qhodclfj.apps.googleusercontent.com',
  SCOPES: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/drive.readonly'].join(' '),
  PX_PER_HOUR: 64,
  DAYS_LONG: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  DAYS_SHORT: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  MONTHS_SH: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  EV_COLORS: ['#2563a8', '#2e7d52', '#c2692a', '#7c3abf', '#b06820', '#c0392b', '#1e8a99', '#5a7a2e'],
  EV_COLORS_DARK: ['#5a9de8', '#3db870', '#e8854a', '#a06de0', '#e0a040', '#e05555', '#3abccc', '#8ab840'],
  CLASS_NAMES: ['ecriture et lit', 'ecologie et evo', 'chimie solution', 'mecanique', 'bad. - base', 'calcul integral', 'cult. & litter.', 'bad.-base', 'ecologie', 'chimie'],
  DEADLINE_KEYWORDS: ['exam', 'test', 'quiz', 'midterm', 'final', 'due', 'assignment', 'submit', 'submission', 'deadline', 'essay', 'report', 'project', 'homework', 'hw', 'examen', 'devoir', 'travail', 'remise', 'evaluation'],
  STORAGE_KEYS: {
    TASKS: 'tasks',
    DEADLINES: 'deadlines',
    EXCLUDE_WORDS: 'excludeWords',
    GCAL_TOKEN: 'gcal_token',
    GCAL_EXPIRY: 'gcal_expiry',
    THEME_MODE: 'themeMode',
    DARK_VARIANT: 'darkVariant',
    DRIVE_FILTERS: 'driveTypeFilters'
  }
};

// ============================================================
// UTILITIES
// ============================================================

const Storage = {
  save: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} },
  load: (key, def) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(e) { return def; } }
};

const Toast = {
  show: (msg, type) => {
    const c = document.getElementById('toast-container'); if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = msg;
    t.style.cssText = 'background:var(--surface);border-left:3px solid var(--accent);padding:10px 16px;margin-bottom:8px;border-radius:8px;box-shadow:var(--shadow);font-size:13px;animation:slideIn 0.2s ease;';
    c.appendChild(t); setTimeout(() => t.remove(), 3000);
  },
  error: (m) => Toast.show(m, 'error'),
  success: (m) => Toast.show(m, 'success')
};

const safeFetch = async (promise, fallback) => {
  try { return { data: await promise, error: null }; }
  catch (err) { console.error(err); Toast.error(err.message || 'Operation failed'); return { data: fallback || null, error: err }; }
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

// ============================================================
// APP STATE
// ============================================================

const AppState = {
  data: {
    tasks: Storage.load(CONFIG.STORAGE_KEYS.TASKS, [{ id: 1, text: 'Review lecture slides', type: 'todo', done: false, urgent: false }]),
    deadlines: Storage.load(CONFIG.STORAGE_KEYS.DEADLINES, []),
    gcalDeadlines: [],
    excludeWords: Storage.load(CONFIG.STORAGE_KEYS.EXCLUDE_WORDS, [...CONFIG.CLASS_NAMES]),
    currentFilter: 'all',
    accessToken: Storage.load(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null),
    tokenExpiry: Storage.load(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0),
    calView: 'week',
    calDate: new Date(),
    calEvents: {},
    colorMap: {},
    colorCounter: 0,
    driveStack: [{ id: 'root', name: 'My Drive' }],
    driveFiles: [],
    driveTypeFilters: Storage.load(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, { folder: true, pdf: true, doc: true, image: true, sheet: true, slides: true, other: true }),
    driveMoreMenuOpen: false,
    settingsOpen: false,
    gTaskListIds: { todo: null, assignment: null }
  },
  listeners: [],
  get() { return this.data; },
  set(u) { Object.assign(this.data, u); this.notify(); },
  subscribe(l) { this.listeners.push(l); },
  notify() { this.listeners.forEach(l => l(this.data)); }
};

// ============================================================
// THEME
// ============================================================

const Theme = {
  init() {
    this.apply(Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light'), Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic'));
  },
  apply(mode, variant) {
    const m = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', m);
    if (m === 'dark') document.documentElement.setAttribute('data-dark-variant', variant || 'classic');
    else document.documentElement.removeAttribute('data-dark-variant');
    Storage.save(CONFIG.STORAGE_KEYS.THEME_MODE, m);
    Storage.save(CONFIG.STORAGE_KEYS.DARK_VARIANT, variant);
    this.updateUI();
  },
  setMode(m) { this.apply(m, Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic')); },
  cycleVariant() {
    const vs = ['classic', 'midnight'], cur = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic');
    this.apply(Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light'), vs[(Math.max(0, vs.indexOf(cur)) + 1) % vs.length]);
  },
  updateUI() {
    const m = Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light');
    const lb = document.getElementById('theme-light-btn'), db = document.getElementById('theme-dark-btn');
    if (lb) lb.classList.toggle('active', m !== 'dark');
    if (db) db.classList.toggle('active', m === 'dark');
    const vb = document.getElementById('dark-variant-btn');
    if (vb) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      vb.style.display = isDark ? 'inline-flex' : 'none';
      vb.textContent = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic') === 'midnight' ? 'Midnight' : 'Classic';
    }
  },
  isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; },
  evColor(idx) { return (this.isDark() ? CONFIG.EV_COLORS_DARK : CONFIG.EV_COLORS)[idx % CONFIG.EV_COLORS.length]; }
};

// ============================================================
// GOOGLE API
// ============================================================

const GoogleAPI = {
  isTokenValid() { const { accessToken, tokenExpiry } = AppState.get(); return !!(accessToken && Date.now() < tokenExpiry); },
  async fetch(url) {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + AppState.get().accessToken } });
    const data = await res.json();
    if (data.error) {
      if (data.error.code === 401) {
        AppState.set({ accessToken: null, tokenExpiry: 0, gTaskListIds: { todo: null, assignment: null } });
        Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null); Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0);
        this.updateButton(false); throw new Error('Session expired. Please reconnect.');
      }
      throw new Error(data.error.message);
    }
    return data;
  },
  updateButton(connected) {
    const btn = document.getElementById('gcal-btn'), lbl = document.getElementById('gcal-label');
    if (btn) btn.classList.toggle('connected', connected);
    if (lbl) lbl.textContent = connected ? 'Google Calendar connected' : 'Connect Google Calendar';
  },
  async auth() {
    if (this.isTokenValid()) {
      if (!confirm('Disconnect Google Calendar?')) return;
      AppState.set({ accessToken: null, tokenExpiry: 0, gTaskListIds: { todo: null, assignment: null } });
      Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null); Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0);
      this.updateButton(false); Calendar.render();
      const dc = document.getElementById('drive-content');
      if (dc) dc.innerHTML = '<div class="empty-state">Connect Google Calendar above to browse your Drive</div>';
      return;
    }
    const redirect = window.location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ client_id: CONFIG.CLIENT_ID, redirect_uri: redirect, response_type: 'token', scope: CONFIG.SCOPES, prompt: 'select_account' });
    const popup = window.open('https://accounts.google.com/o/oauth2/v2/auth?' + params, 'gcal_auth', 'width=500,height=620');
    const poll = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url && url.includes('access_token')) {
          clearInterval(poll); popup.close();
          const hash = new URLSearchParams(url.split('#')[1]);
          const token = hash.get('access_token'), expiry = Date.now() + parseInt(hash.get('expires_in') || '3600') * 1000;
          AppState.set({ accessToken: token, tokenExpiry: expiry });
          Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, token); Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, expiry);
          this.updateButton(true); Calendar.fetchEvents(); Deadlines.fetchFromCalendar(); Tasks.fetchFromGoogle(); Drive.loadFolder('root');
        }
      } catch(e) {}
      if (!popup || popup.closed) clearInterval(poll);
    }, 500);
  }
};

// ============================================================
// CAL SLIDER ENGINE
// All 4 views (day/week/month/year) use this same 3-panel slider.
// Three panels are always rendered; center panel is visible.
// navigate(dir) slides the track, then re-builds panels for next use.
// ============================================================

// ============================================================
// CALENDAR NAVIGATION
// ============================================================

const CalNav = {
  _animating: false,
  _savedScroll: 0,

  render(container, html) {
    container.innerHTML = html;
  },

  slide(container, html, dir) {
    // Save vertical scroll position
    const scrollEl = container.querySelector('.tg-scroll');
    if (scrollEl) this._savedScroll = scrollEl.scrollTop;

    // Swap content instantly — no animation classes that can race
    container.innerHTML = html;

    // Restore scroll
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
    document.querySelectorAll('.view-tab').forEach(b => b.classList.toggle('active', b.id === 'tab-' + v));
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
    const html = this._buildView(newDate, calView);
    CalNav.slide(container, html, dir);
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },

  goToday() { AppState.set({ calDate: new Date() }); this.render(); if (GoogleAPI.isTokenValid()) this.fetchEvents(); },

  async fetchEvents() {
    const { calView, calDate } = AppState.get();
    let start, end;
    const y = calDate.getFullYear(), mo = calDate.getMonth(), d = calDate.getDate();
    if (calView === 'day') {
      start = new Date(y, mo, d); end = new Date(y, mo, d, 23, 59, 59);
    } else if (calView === 'week') {
      start = new Date(calDate); start.setDate(calDate.getDate() - calDate.getDay()); start.setHours(0,0,0,0);
      end = new Date(start); end.setDate(start.getDate() + 7);
    } else if (calView === 'month') {
      start = new Date(y, mo, 1); end = new Date(y, mo + 1, 1);
    } else {
      start = new Date(y, 0, 1); end = new Date(y + 1, 0, 1);
    }
    const { data, error } = await safeFetch(GoogleAPI.fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + start.toISOString() +
      '&timeMax=' + end.toISOString() + '&singleEvents=true&orderBy=startTime&maxResults=500'
    ));
    if (error || !data) return;
    const newEvents = {}, colorMap = { ...AppState.get().colorMap };
    let colorCounter = AppState.get().colorCounter;
    (data.items || []).forEach(e => {
      const ds = (e.start.date || e.start.dateTime || '').split('T')[0];
      if (!ds) return;
      if (!newEvents[ds]) newEvents[ds] = [];
      const name = e.summary || '(no title)';
      if (!(name in colorMap)) { colorMap[name] = colorCounter % CONFIG.EV_COLORS.length; colorCounter++; }
      const colorIdx = colorMap[name];
      if (e.start.dateTime) {
        const st = new Date(e.start.dateTime), et = new Date(e.end ? e.end.dateTime : e.start.dateTime);
        const startMin = st.getHours() * 60 + st.getMinutes();
        const endMin = et.getHours() * 60 + et.getMinutes() || startMin + 60;
        if (!newEvents[ds].some(x => x.name === name && x.startMin === startMin))
          newEvents[ds].push({ id: e.id, name, startMin, endMin, timeStr: this._fmt12(st) + ' \u2013 ' + this._fmt12(et), colorIdx, allDay: false, startISO: e.start.dateTime, endISO: e.end?.dateTime || e.start.dateTime, location: e.location || '', description: e.description || '', htmlLink: e.htmlLink || '' });
      } else if (!newEvents[ds].some(x => x.name === name && !x.startMin)) {
        newEvents[ds].push({ id: e.id, name, colorIdx, allDay: true, startISO: e.start.date || ds, endISO: e.end?.date || ds, location: e.location || '', description: e.description || '', htmlLink: e.htmlLink || '' });
      }
    });
    AppState.set({ calEvents: newEvents, colorMap, colorCounter });
    // Re-render in-place, preserving scroll position
    const { calView: view, calDate: date } = AppState.get();
    const container = document.getElementById('cal-container');
    if (!container) return;
    const scrollEl = container.querySelector('.tg-scroll');
    const savedScroll = scrollEl ? scrollEl.scrollTop : 0;
    CalNav.render(container, this._buildView(date, view));
    const newScrollEl = container.querySelector('.tg-scroll');
    if (newScrollEl) newScrollEl.scrollTop = savedScroll;
  },

  _fmt12(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); },

  _setLabel(date, view) {
    const el = document.getElementById('cal-nav-label'); if (!el) return;
    const today = new Date(); today.setHours(0,0,0,0);
    if (view === 'day') {
      el.textContent = CONFIG.DAYS_LONG[date.getDay()] + ', ' + CONFIG.MONTHS_SH[date.getMonth()] + ' ' + date.getDate() + (date.toDateString() === today.toDateString() ? ' \u2014 Today' : '');
    } else if (view === 'week') {
      const ws = new Date(date); ws.setDate(date.getDate() - date.getDay()); ws.setHours(0,0,0,0);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      el.textContent = CONFIG.MONTHS_SH[ws.getMonth()] + ' ' + ws.getDate() + ' \u2013 ' + CONFIG.MONTHS_SH[we.getMonth()] + ' ' + we.getDate() + ', ' + we.getFullYear();
    } else if (view === 'month') {
      el.textContent = CONFIG.MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    } else {
      el.textContent = String(date.getFullYear());
    }
  },

  _buildView(date, view) {
    if (view === 'day')   return this._buildTimeGrid([new Date(date)]);
    if (view === 'week')  return this._buildWeekGrid(date);
    if (view === 'month') return this._buildMonthGrid(date);
    return this._buildYearGrid(date);
  },

  _buildWeekGrid(date) {
    const ws = new Date(date); ws.setDate(date.getDate() - date.getDay()); ws.setHours(0,0,0,0);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(ws.getDate() + i); days.push(d); }
    return this._buildTimeGrid(days);
  },

  _buildMonthGrid(date) {
    const y = date.getFullYear(), m = date.getMonth();
    const today = new Date(); today.setHours(0,0,0,0);
    const first = new Date(y, m, 1), daysInMonth = new Date(y, m+1, 0).getDate(), pad = first.getDay();
    const state = AppState.get();
    let html = '<div class="month-wrap"><div class="month-grid">';
    CONFIG.DAYS_SHORT.forEach(d => { html += '<div class="month-head">' + d + '</div>'; });
    const prevDays = new Date(y, m, 0).getDate();
    for (let i = pad - 1; i >= 0; i--) html += '<div class="month-cell other-month"><div class="month-num">' + (prevDays - i) + '</div></div>';
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(y, m, i), ds = d.toISOString().split('T')[0], isToday = d.toDateString() === today.toDateString();
      const evs = (state.calEvents[ds] || []).slice(0, 3);
      html += '<div class="month-cell' + (isToday ? ' today' : '') + '"><div class="month-num">' + i + '</div>';
      evs.forEach((e, idx) => {
        html += '<div class="month-mini-ev" onclick="window.openEventModalFromAttr(this)" data-ev="' + encodeURIComponent(JSON.stringify(e)) + '" style="background:' + Theme.evColor(e.colorIdx || idx) + '">' + escapeHtml(e.name) + '</div>';
      });
      html += '</div>';
    }
    const trailing = (7 - ((pad + daysInMonth) % 7)) % 7;
    for (let i = 1; i <= trailing; i++) html += '<div class="month-cell other-month"><div class="month-num">' + i + '</div></div>';
    return html + '</div></div>';
  },

  _buildYearGrid(date) {
    const y = date.getFullYear(), today = new Date(), events = AppState.get().calEvents;
    let html = '<div class="year-wrap">';
    for (let mo = 0; mo < 12; mo++) {
      const first = new Date(y, mo, 1), days = new Date(y, mo+1, 0).getDate(), pad = first.getDay();
      html += '<div class="mini-month" onclick="Calendar.setView(\'month\');AppState.set({calDate:new Date(' + y + ',' + mo + ',1)});Calendar.render();"><div class="mini-month-title">' + CONFIG.MONTHS_SH[mo] + '</div><div class="mini-month-grid">';
      for (let p = 0; p < pad; p++) html += '<div class="mini-day"></div>';
      for (let d = 1; d <= days; d++) {
        const dt = new Date(y, mo, d), ds = dt.toISOString().split('T')[0];
        const isToday = dt.toDateString() === today.toDateString(), hasEv = !!(events[ds] && events[ds].length);
        html += '<div class="mini-day' + (isToday ? ' today' : hasEv ? ' has-event' : '') + '">' + d + '</div>';
      }
      html += '</div></div>';
    }
    return html + '</div>';
  },

  _buildTimeGrid(days) {
    const state = AppState.get(), today = new Date(); today.setHours(0,0,0,0);
    const TOTAL_PX = CONFIG.PX_PER_HOUR * 24;

    // Header
    let h = '<div class="tg-header"><div class="tg-header-gutter"></div><div class="tg-header-days">';
    days.forEach(d => {
      const isT = d.toDateString() === today.toDateString();
      h += '<div class="tg-head-day"><span class="tg-head-day-name">' + CONFIG.DAYS_SHORT[d.getDay()] + '</span><div class="tg-head-day-num' + (isT ? ' today' : '') + '">' + d.getDate() + '</div></div>';
    });
    h += '</div></div>';

    // All-day row
    let anyAllDay = false;
    const allDayByDate = {};
    days.forEach(d => {
      const ds = d.toISOString().split('T')[0];
      const evs = (state.calEvents[ds] || []).filter(e => e.allDay);
      if (evs.length) anyAllDay = true;
      allDayByDate[ds] = evs;
    });
    let adh = '';
    if (anyAllDay) {
      adh = '<div class="tg-allday"><div class="tg-allday-gutter">All day</div><div class="tg-allday-days">';
      days.forEach(d => {
        const ds = d.toISOString().split('T')[0], evs = (allDayByDate[ds] || []).slice(0, 3);
        adh += '<div class="tg-allday-col">';
        evs.forEach((e, idx) => {
          adh += '<div class="tg-allday-ev" onclick="window.openEventModalFromAttr(this)" data-ev="' + encodeURIComponent(JSON.stringify(e)) + '" style="border-left-color:' + Theme.evColor(e.colorIdx || idx) + ';">' + escapeHtml(e.name) + '</div>';
        });
        adh += '</div>';
      });
      adh += '</div></div>';
    }

    // Gutter
    let gut = '<div class="tg-gutter">';
    for (let hr = 0; hr < 24; hr++) {
      const lbl = hr === 0 ? '' : hr < 12 ? hr + ' AM' : hr === 12 ? '12 PM' : (hr-12) + ' PM';
      gut += '<div class="tg-hour-label" style="top:' + (hr * CONFIG.PX_PER_HOUR) + 'px">' + lbl + '</div>';
    }
    gut += '</div>';

    // Days columns
    let dc = '<div class="tg-days">';
    days.forEach(d => {
      const ds = d.toISOString().split('T')[0];
      const dayEvs = (state.calEvents[ds] || []).filter(e => e.startMin !== undefined);
      const sorted = [...dayEvs].sort((a, b) => a.startMin - b.startMin);
      const placed = [];
      sorted.forEach(ev => {
        let col = 0;
        while (placed.some(p => p.col === col && p.endMin > ev.startMin)) col++;
        placed.push({ ...ev, col });
      });
      placed.forEach(ev => { ev.totalCols = placed.filter(p => p !== ev && p.startMin < ev.endMin && p.endMin > ev.startMin).length + 1; });

      dc += '<div class="tg-day-col">';
      for (let hr = 0; hr < 24; hr++) {
        dc += '<div class="tg-hline" style="top:' + (hr * CONFIG.PX_PER_HOUR) + 'px"></div>';
        dc += '<div class="tg-hline half" style="top:' + (hr * CONFIG.PX_PER_HOUR + CONFIG.PX_PER_HOUR/2) + 'px"></div>';
      }
      if (d.toDateString() === today.toDateString()) {
        const pct = (new Date().getHours() * 60 + new Date().getMinutes()) / (24 * 60);
        dc += '<div class="tg-now" style="top:' + (pct * TOTAL_PX) + 'px"></div>';
      }
      placed.forEach(ev => {
        const top = (ev.startMin / 60) * CONFIG.PX_PER_HOUR;
        const height = Math.max(20, ((ev.endMin - ev.startMin) / 60) * CONFIG.PX_PER_HOUR - 2);
        const colW = 100 / ev.totalCols, left = ev.col * colW;
        const c = Theme.evColor(ev.colorIdx), bg = c + (Theme.isDark() ? '28' : '1a');
        dc += '<div class="ev-block" style="top:' + top + 'px;height:' + height + 'px;left:calc(' + left + '% + 2px);width:calc(' + colW + '% - 4px);background:' + bg + ';border-left-color:' + c + ';color:' + c + ';" onclick="window.openEventModalFromAttr(this)" data-ev="' + encodeURIComponent(JSON.stringify(ev)) + '"><div class="ev-name">' + escapeHtml(ev.name) + '</div>' + (height > 30 ? '<div class="ev-time">' + escapeHtml(ev.timeStr) + '</div>' : '') + '</div>';
      });
      dc += '</div>';
    });
    dc += '</div>';

    return '<div class="tg-wrap">' + h + adh + '<div class="tg-scroll"><div class="tg-body" style="height:' + TOTAL_PX + 'px;">' + gut + dc + '</div></div></div>';
  },

  _scrollToHour(hr) {
    requestAnimationFrame(() => {
      const el = document.querySelector('#cal-container .tg-scroll');
      if (el) el.scrollTop = hr * CONFIG.PX_PER_HOUR;
    });
  }
};

// ============================================================
// DEADLINES MODULE
// ============================================================

const Deadlines = {
  async fetchFromCalendar() {
    if (!GoogleAPI.isTokenValid()) { AppState.set({ gcalDeadlines: [] }); this.render(); return; }
    const now = new Date(); now.setHours(0,0,0,0);
    const future = new Date(); future.setDate(future.getDate() + 90);
    const { data, error } = await safeFetch(GoogleAPI.fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + now.toISOString() +
      '&timeMax=' + future.toISOString() + '&singleEvents=true&orderBy=startTime&maxResults=500'
    ));
    if (error || !data) return;
    const excl = AppState.get().excludeWords;
    const isExcl = (t) => excl.some(w => t?.toLowerCase().includes(w.toLowerCase()));
    const isKw = (t) => CONFIG.DEADLINE_KEYWORDS.some(k => t?.toLowerCase().includes(k));
    const seen = new Set();
    const gcalDeadlines = (data.items || []).map(e => {
      const title = e.summary || '', ds = (e.start.date || e.start.dateTime || '').split('T')[0];
      if (!title || !ds || isExcl(title) || !isKw(title)) return null;
      if (seen.has(e.id)) return null; seen.add(e.id);
      return { id: 'gcal_' + e.id, name: title, course: 'Google Calendar', date: ds, fromGcal: true, gcalEventId: e.id };
    }).filter(Boolean);
    AppState.set({ gcalDeadlines }); this.render();
  },

  render() {
    const state = AppState.get(), list = document.getElementById('deadline-list');
    const now = new Date(); now.setHours(0,0,0,0);
    const combined = [...state.deadlines];
    state.gcalDeadlines.forEach(gd => { if (!state.deadlines.some(m => m.name.toLowerCase() === gd.name.toLowerCase() && m.date === gd.date)) combined.push(gd); });
    if (!combined.length) { list.innerHTML = '<div class="empty-state">No upcoming deadlines</div>'; return; }
    list.innerHTML = [...combined].sort((a, b) => new Date(a.date) - new Date(b.date)).map(d => {
      const due = new Date(d.date + 'T00:00:00'), diff = Math.round((due - now) / 86400000);
      const cls = diff <= 2 ? 'urgent' : diff <= 7 ? 'soon' : 'ok';
      const lbl = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : 'In ' + diff + ' days';
      const dStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return '<div class="deadline-item ' + cls + '"><div style="flex:1;min-width:0;"><div class="deadline-name">' + escapeHtml(d.name) + '</div><div class="deadline-course">' + escapeHtml(d.course) + '</div></div><button class="deadline-delete" onclick="window.deleteDeadline(\'' + d.id + '\')" title="Delete">\u2715</button><div style="flex-shrink:0;"><div class="deadline-date ' + cls + '">' + dStr + '</div><div class="deadline-days">' + lbl + '</div></div></div>';
    }).join('');
  },

  add() {
    const name = document.getElementById('dl-name')?.value.trim();
    const date = document.getElementById('dl-date')?.value;
    const course = document.getElementById('dl-course')?.value.trim() || 'General';
    if (!name || !date) return;
    this.closeModal();
    document.getElementById('dl-name').value = '';
    document.getElementById('dl-course').value = '';
    const id = 'manual_' + Date.now();
    const deadlines = [...AppState.get().deadlines, { id, name, course, date }];
    AppState.set({ deadlines }); Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, deadlines); this.render();
    if (GoogleAPI.isTokenValid()) {
      const end = new Date(date + 'T00:00:00'); end.setDate(end.getDate() + 1);
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST', headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: name, description: 'Deadline (' + course + ')', start: { date }, end: { date: end.toISOString().split('T')[0] }, colorId: '11' })
      }).then(r => r.json()).then(data => {
        if (data && !data.error) {
          const updated = AppState.get().deadlines.map(d => d.id === id ? { ...d, gcalEventId: data.id } : d);
          AppState.set({ deadlines: updated }); Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, updated); this.fetchFromCalendar();
        }
      }).catch(console.error);
    }
  },

  async delete(id) {
    if (!confirm('Delete this deadline?')) return;
    const state = AppState.get(), manual = state.deadlines.find(d => String(d.id) === String(id));
    if (manual) {
      const deadlines = state.deadlines.filter(d => String(d.id) !== String(id));
      AppState.set({ deadlines }); Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, deadlines);
      if (manual.gcalEventId && GoogleAPI.isTokenValid())
        await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + manual.gcalEventId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + state.accessToken } });
      this.render(); return;
    }
    const gcal = state.gcalDeadlines.find(d => String(d.id) === String(id));
    if (gcal?.gcalEventId && GoogleAPI.isTokenValid()) {
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + gcal.gcalEventId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + state.accessToken } });
      this.fetchFromCalendar();
    }
  },

  openModal() {
    document.getElementById('deadline-modal').style.display = 'flex';
    const d = new Date(); d.setDate(d.getDate() + 7);
    const di = document.getElementById('dl-date'); if (di) di.value = d.toISOString().split('T')[0];
  },
  closeModal() { document.getElementById('deadline-modal').style.display = 'none'; }
};

// ============================================================
// TASKS MODULE
// ============================================================

const Tasks = {
  render() {
    const state = AppState.get(), list = document.getElementById('tasks-list');
    let pool = state.currentFilter === 'all' ? [...state.tasks] : state.tasks.filter(t => t.type === state.currentFilter);

    // When filtering by type, exclude urgent from that filter (they live in their own section)
    // Exception: if filter is 'all', urgent items appear in urgent section only
    const urgentItems = pool.filter(t => t.urgent && !t.done);
    const normalItems = pool.filter(t => !t.urgent || t.done);

    // Sort normal items: active first, done last
    normalItems.sort((a, b) => {
      if (!a.done && b.done) return -1;
      if (a.done && !b.done) return 1;
      return 0;
    });

    if (!urgentItems.length && !normalItems.length) {
      list.innerHTML = '<div class="empty-state">Nothing here \u2014 add something above</div>';
      return;
    }

    const labels = { todo: 'To-do', assignment: 'Assignment', deadline: 'Deadline' };

    const buildItem = (t) => {
      const dCls = t.done ? ' done' : '';
      const uCls = (t.urgent && !t.done) ? ' task-urgent' : '';
      const urgentBadge = t.urgent
        ? '<span class="task-badge badge-urgent" onclick="window.toggleUrgent(\'' + t.id + '\')" title="Remove urgent" style="cursor:pointer;">Urgent</span>'
        : '<span class="task-badge badge-urgent-off" onclick="window.toggleUrgent(\'' + t.id + '\')" title="Mark urgent" style="cursor:pointer;opacity:0.35;">! Urgent</span>';
      return '<div class="task-item' + uCls + dCls + '">' +
        '<div class="task-check' + (t.done ? ' checked' : '') + '" onclick="window.toggleTask(\'' + t.id + '\')"></div>' +
        '<span class="task-text">' + escapeHtml(t.text) + '</span>' +
        urgentBadge +
        '<span class="task-badge badge-' + t.type + '">' + (labels[t.type] || 'To-do') + '</span>' +
        '<button class="task-delete" onclick="window.deleteTask(\'' + t.id + '\')" title="Delete">\u2715</button>' +
        '</div>';
    };

    let html = '';

    // Urgent section
    if (urgentItems.length) {
      html += '<div class="task-section-label task-section-urgent">Urgent</div>';
      html += urgentItems.map(buildItem).join('');
      if (normalItems.length) html += '<div class="task-section-divider"></div>';
    }

    // Normal section
    if (normalItems.length) {
      if (urgentItems.length) html += '<div class="task-section-label">Other tasks</div>';
      html += normalItems.map(buildItem).join('');
    }

    list.innerHTML = html;
  },

  async add() {
    const input = document.getElementById('task-input'), text = input?.value.trim();
    if (!text) return;
    const urgentBtn = document.getElementById('urgent-toggle-btn');
    const isUrgent = urgentBtn ? urgentBtn.classList.contains('active') : false;
    // When urgent is active, type is irrelevant — store as 'todo' for Google Tasks sync
    // but mark urgent:true so it shows in the urgent section
    const type = isUrgent ? 'todo' : (document.getElementById('task-type')?.value || 'todo');
    const id = Date.now();
    const tasks = [...AppState.get().tasks, { id, text, type, done: false, urgent: isUrgent }];
    AppState.set({ tasks }); Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    input.value = '';
    if (urgentBtn) {
      urgentBtn.classList.remove('active');
      // Re-enable the type dropdown
      const typeSelect = document.getElementById('task-type');
      if (typeSelect) { typeSelect.disabled = false; typeSelect.style.opacity = ''; typeSelect.style.pointerEvents = ''; }
    }
    this.render();
    if (GoogleAPI.isTokenValid()) await this.pushToGoogle(text, type, id);
  },

  toggleUrgent(id) {
    const tasks = AppState.get().tasks.map(t => String(t.id) === String(id) ? { ...t, urgent: !t.urgent } : t);
    AppState.set({ tasks }); Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks); this.render();
  },

  async toggle(id) {
    const tasks = AppState.get().tasks.map(t => String(t.id) === String(id) ? { ...t, done: !t.done } : t);
    AppState.set({ tasks }); Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks); this.render();
    const task = tasks.find(t => String(t.id) === String(id));
    if (task && GoogleAPI.isTokenValid()) await this.syncDone(task);
  },

  async delete(id) {
    const task = AppState.get().tasks.find(t => String(t.id) === String(id));
    const tasks = AppState.get().tasks.filter(t => String(t.id) !== String(id));
    AppState.set({ tasks }); Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks); this.render();
    if (task?.gtaskId && task?.gtaskListId && GoogleAPI.isTokenValid())
      await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + task.gtaskListId + '/tasks/' + task.gtaskId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + AppState.get().accessToken } });
  },

  filter(f) {
    AppState.set({ currentFilter: f });
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.id === 'filter-' + f));
    this.render();
  },

  async resolveTaskLists() {
    // Use cached IDs if available this session
    const cached = AppState.get().gTaskListIds;
    if (cached.todo && cached.assignment) return cached;
    const data = await GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100');
    const lists = data.items || [];
    let ids = { todo: null, assignment: null };
    for (const list of lists) {
      if (list.title === 'To-do') ids.todo = list.id;
      if (list.title === 'Assignments') ids.assignment = list.id;
    }
    const post = async (title) => {
      const r = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        method: 'POST', headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      return (await r.json()).id;
    };
    if (!ids.todo) ids.todo = await post('To-do');
    if (!ids.assignment) ids.assignment = await post('Assignments');
    AppState.set({ gTaskListIds: ids }); return ids;
  },

  async pushToGoogle(text, type, localId) {
    try {
      const ids = await this.resolveTaskLists();
      const listId = type === 'assignment' ? ids.assignment : ids.todo;
      const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + listId + '/tasks', {
        method: 'POST', headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text })
      });
      const created = await res.json();
      if (!created.error) {
        const tasks = AppState.get().tasks.map(t => String(t.id) === String(localId) ? { ...t, gtaskId: created.id, gtaskListId: listId } : t);
        AppState.set({ tasks }); Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
      }
    } catch(err) { console.error(err); }
  },

  async syncDone(task) {
    if (!task.gtaskId || !task.gtaskListId) return;
    try {
      // PATCH only updates status — no need to fetch the full task first
      await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + task.gtaskListId + '/tasks/' + task.gtaskId, {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + AppState.get().accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: task.done ? 'completed' : 'needsAction' })
      });
    } catch(err) { console.error(err); }
  },

  async fetchFromGoogle() {
    if (!GoogleAPI.isTokenValid()) return;
    try {
      const ids = await this.resolveTaskLists();

      // Fetch both lists in parallel
      const [todoData, assignData] = await Promise.all([
        ids.todo ? GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/lists/' + ids.todo + '/tasks?showCompleted=true&showHidden=true&maxResults=100') : Promise.resolve({ items: [] }),
        ids.assignment ? GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/lists/' + ids.assignment + '/tasks?showCompleted=true&showHidden=true&maxResults=100') : Promise.resolve({ items: [] })
      ]);

      // Build a map of all remote tasks keyed by gtaskId
      const remote = {};
      (todoData.items || []).forEach(t => { if (t.title) remote[t.id] = { gtaskId: t.id, gtaskListId: ids.todo, text: t.title, type: 'todo', done: t.status === 'completed' }; });
      (assignData.items || []).forEach(t => { if (t.title) remote[t.id] = { gtaskId: t.id, gtaskListId: ids.assignment, text: t.title, type: 'assignment', done: t.status === 'completed' }; });

      // Index local tasks by gtaskId to preserve local-only fields (urgent)
      const localByGtaskId = {};
      AppState.get().tasks.forEach(t => { if (t.gtaskId) localByGtaskId[t.gtaskId] = t; });

      // Remote is source of truth for what tasks exist and their done status.
      // Preserve local-only fields from matching local task.
      const synced = Object.values(remote).map(r => {
        const local = localByGtaskId[r.gtaskId];
        return local ? { ...local, text: r.text, done: r.done } : { id: 'gt_' + r.gtaskId, ...r, urgent: false };
      });

      // Keep local tasks that haven't been pushed to Google yet
      const unpushed = AppState.get().tasks.filter(t => !t.gtaskId);

      const tasks = [...synced, ...unpushed];
      AppState.set({ tasks }); Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks); this.render();
    } catch(err) { console.error('fetchFromGoogle error:', err); }
  }
};

// ============================================================
// DRIVE MODULE
// ============================================================

const Drive = {
  iconFor(mt) {
    if (mt === 'application/vnd.google-apps.folder') return '📁';
    if (mt === 'application/pdf') return '📄';
    if (mt && mt.includes('image')) return '🖼';
    if (mt && (mt.includes('word') || mt.includes('document'))) return '📝';
    if (mt && (mt.includes('sheet') || mt.includes('spreadsheet'))) return '📊';
    if (mt && (mt.includes('presentation') || mt.includes('powerpoint'))) return '📑';
    return '📎';
  },
  fileType(mt) {
    if (mt === 'application/vnd.google-apps.folder') return 'folder';
    if (mt === 'application/pdf') return 'pdf';
    if (mt && mt.includes('image')) return 'image';
    if (mt && (mt.includes('word') || mt.includes('document'))) return 'doc';
    if (mt && (mt.includes('sheet') || mt.includes('spreadsheet'))) return 'sheet';
    if (mt && (mt.includes('presentation') || mt.includes('powerpoint'))) return 'slides';
    return 'other';
  },
  async loadFolder(folderId) {
    if (!GoogleAPI.isTokenValid()) return;
    const content = document.getElementById('drive-content');
    if (content) content.innerHTML = '<div class="empty-state">Loading files...</div>';
    this.updatePath();
    const q = folderId === 'root' ? "'root' in parents and trashed=false" : "'" + folderId + "' in parents and trashed=false";
    const { data, error } = await safeFetch(GoogleAPI.fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=100'));
    if (error) return;
    AppState.set({ driveFiles: data?.files || [] });
    const bb = document.getElementById('drive-back-btn'); if (bb) bb.style.display = AppState.get().driveStack.length > 1 ? 'inline-flex' : 'none';
    if (!AppState.get().driveFiles.length && content) content.innerHTML = '<div class="empty-state">This folder is empty</div>';
    else this.render();
  },
  render() {
    const state = AppState.get(), content = document.getElementById('drive-content');
    const filtered = state.driveFiles.filter(f => !!state.driveTypeFilters[this.fileType(f.mimeType)]);
    const status = document.getElementById('drive-status');
    if (status) status.textContent = filtered.length + ' of ' + state.driveFiles.length + ' item' + (state.driveFiles.length !== 1 ? 's' : '');
    if (!filtered.length && content) { content.innerHTML = '<div class="empty-state">No files match this filter</div>'; return; }
    const tl = { folder: 'Folder', pdf: 'PDF', image: 'Image', doc: 'Document', sheet: 'Spreadsheet', slides: 'Slides', other: 'File' };
    if (content) content.innerHTML = '<div class="drive-grid">' + filtered.map(f => '<div class="drive-item" onclick="window.driveClick(\'' + f.id + '\',\'' + f.mimeType.replace(/'/g, "\\'") + '\',\'' + encodeURIComponent(f.name) + '\')"><div style="font-size:22px;">' + this.iconFor(f.mimeType) + '</div><div class="drive-item-name">' + escapeHtml(f.name) + '</div><div class="drive-item-meta">' + tl[this.fileType(f.mimeType)] + '</div></div>').join('') + '</div>';
  },
  click(id, mt, enc) {
    const name = decodeURIComponent(enc);
    if (mt === 'application/vnd.google-apps.folder') { AppState.set({ driveStack: [...AppState.get().driveStack, { id, name }] }); this.loadFolder(id); }
    else if (mt === 'application/pdf') this.openPdf(id, name);
    else window.open('https://drive.google.com/file/d/' + id + '/view', '_blank');
  },
  goBack() {
    const stack = AppState.get().driveStack; if (stack.length <= 1) return;
    const ns = stack.slice(0, -1); AppState.set({ driveStack: ns }); this.loadFolder(ns[ns.length-1].id);
  },
  updatePath() {
    const el = document.getElementById('drive-path'); if (!el) return;
    el.innerHTML = AppState.get().driveStack.map((item, i) => {
      if (i === AppState.get().driveStack.length - 1) return '<span class="drive-current">' + escapeHtml(item.name) + '</span>';
      return '<span class="drive-crumb" onclick="window.driveJumpTo(' + i + ')">' + escapeHtml(item.name) + '</span><span class="drive-sep">/</span>';
    }).join('');
  },
  jumpTo(idx) { const ns = AppState.get().driveStack.slice(0, idx+1); AppState.set({ driveStack: ns }); this.loadFolder(ns[ns.length-1].id); },
  openPdf(id, name) {
    const t = document.getElementById('pdf-modal-title'), f = document.getElementById('pdf-iframe'), l = document.getElementById('pdf-open-link');
    if (t) t.textContent = name;
    if (f) f.src = 'https://drive.google.com/file/d/' + id + '/preview';
    if (l) l.href = 'https://drive.google.com/file/d/' + id + '/view';
    document.getElementById('pdf-modal')?.classList.add('open');
  },
  closePdf() { document.getElementById('pdf-modal')?.classList.remove('open'); const f = document.getElementById('pdf-iframe'); if (f) f.src = ''; },
  toggleFilter(type) {
    const filters = { ...AppState.get().driveTypeFilters }; filters[type] = !filters[type];
    if (!Object.values(filters).some(Boolean)) filters[type] = true;
    AppState.set({ driveTypeFilters: filters }); Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters); this.syncFilterButtons(); this.render();
  },
  setAllFilters(on) {
    const f = { folder: on, pdf: on, doc: on, image: on, sheet: on, slides: on, other: on };
    AppState.set({ driveTypeFilters: f }); Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, f); this.syncFilterButtons(); this.render();
  },
  toggleHiddenType(type, on) {
    const filters = { ...AppState.get().driveTypeFilters }; filters[type] = !!on;
    if (!Object.values(filters).some(Boolean)) filters[type] = true;
    AppState.set({ driveTypeFilters: filters }); Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters); this.syncFilterButtons(); this.render();
  },
  syncFilterButtons() {
    const filters = AppState.get().driveTypeFilters, allOn = Object.values(filters).every(Boolean);
    document.querySelectorAll('.drive-filter-tab').forEach(btn => {
      const f = btn.dataset.filter;
      btn.classList.toggle('active', f === 'all' ? allOn : !!filters[f]);
    });
    const ot = document.getElementById('drive-filter-other'); if (ot) ot.checked = !!filters.other;
  },
  toggleMoreMenu() { const o = !AppState.get().driveMoreMenuOpen; AppState.set({ driveMoreMenuOpen: o }); document.getElementById('drive-filter-menu')?.classList.toggle('open', o); },
  closeMoreMenu() { AppState.set({ driveMoreMenuOpen: false }); document.getElementById('drive-filter-menu')?.classList.remove('open'); }
};

// ============================================================
// EXCLUDE TAGS
// ============================================================

const ExcludeTags = {
  render() { const tags = document.getElementById('exclude-tags'); if (tags) tags.innerHTML = AppState.get().excludeWords.map((w, i) => '<div class="tag">' + escapeHtml(w) + '<button class="tag-remove" onclick="window.removeExcludeTag(' + i + ')">\u00d7</button></div>').join(''); },
  add() {
    const input = document.getElementById('exclude-input'), v = input?.value.trim().toLowerCase();
    if (!v || AppState.get().excludeWords.includes(v)) return;
    const excludeWords = [...AppState.get().excludeWords, v];
    AppState.set({ excludeWords }); Storage.save(CONFIG.STORAGE_KEYS.EXCLUDE_WORDS, excludeWords);
    if (input) input.value = ''; this.render(); Deadlines.fetchFromCalendar();
  },
  remove(i) {
    const excludeWords = AppState.get().excludeWords.filter((_, idx) => idx !== i);
    AppState.set({ excludeWords }); Storage.save(CONFIG.STORAGE_KEYS.EXCLUDE_WORDS, excludeWords); this.render(); Deadlines.fetchFromCalendar();
  },
  toggleSettings() {
    const open = !AppState.get().settingsOpen; AppState.set({ settingsOpen: open });
    const panel = document.getElementById('settings-panel'); if (panel) panel.style.display = open ? 'block' : 'none';
    if (open) this.render();
  }
};

// ============================================================
// MODALS
// ============================================================

function openEventModalFromAttr(el) {
  try {
    const raw = el?.dataset?.ev; if (!raw) return;
    const ev = JSON.parse(decodeURIComponent(raw));
    const overlay = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title'), whenEl = document.getElementById('event-when');
    const whereEl = document.getElementById('event-where'), descEl = document.getElementById('event-desc');
    const linkEl = document.getElementById('event-open-link');
    if (!overlay || !titleEl || !whenEl || !whereEl || !descEl || !linkEl) return;
    titleEl.textContent = ev.name || '(no title)';
    let whenText = '';
    if (ev.allDay) {
      const start = (ev.startISO || '').split('T')[0];
      whenText = start ? 'All day \u00b7 ' + new Date(start + 'T00:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : 'All day';
    } else if (ev.startISO) {
      const st = new Date(ev.startISO), et = ev.endISO ? new Date(ev.endISO) : null;
      const dp = st.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
      const tp = et ? st.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) + ' \u2013 ' + et.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : st.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
      whenText = dp + ' \u00b7 ' + tp;
    } else if (ev.timeStr) whenText = ev.timeStr;
    whenEl.textContent = whenText;
    const loc = (ev.location || '').trim();
    whereEl.style.display = loc ? '' : 'none'; whereEl.textContent = loc;
    const desc = (ev.description || '').trim();
    descEl.style.display = desc ? '' : 'none'; descEl.textContent = desc;
    linkEl.href = ev.htmlLink || '#'; linkEl.style.display = ev.htmlLink ? '' : 'none';
    overlay.style.display = 'flex';
  } catch(e) { console.error(e); }
}

function closeEventModal() { const o = document.getElementById('event-modal'); if (o) o.style.display = 'none'; }

// ============================================================
// INIT
// ============================================================

function initHeader() {
  const now = new Date(), h = now.getHours();
  const g = document.getElementById('greeting-word'), d = document.getElementById('header-date');
  if (g) g.textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  if (d) d.textContent = CONFIG.DAYS_SHORT[now.getDay()] + ', ' + CONFIG.MONTHS[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
}

window.setThemeMode = (m) => Theme.setMode(m);
window.cycleDarkVariant = () => Theme.cycleVariant();
window.setView = (v) => Calendar.setView(v);
window.navCal = (d) => Calendar.navigate(d);
window.goToday = () => Calendar.goToday();
window.handleGCalAuth = () => GoogleAPI.auth();
window.openDeadlineModal = () => Deadlines.openModal();
window.closeDeadlineModal = () => Deadlines.closeModal();
window.confirmDeadline = () => Deadlines.add();
window.deleteDeadline = (id) => Deadlines.delete(id);
window.addTask = () => Tasks.add();
window.toggleTask = (id) => Tasks.toggle(id);
window.toggleUrgent = (id) => Tasks.toggleUrgent(id);
window.toggleUrgentInput = () => {
  const btn = document.getElementById('urgent-toggle-btn');
  const typeSelect = document.getElementById('task-type');
  if (!btn) return;
  const nowActive = !btn.classList.contains('active');
  btn.classList.toggle('active', nowActive);
  if (typeSelect) {
    typeSelect.disabled = nowActive;
    typeSelect.style.opacity = nowActive ? '0.35' : '';
    typeSelect.style.pointerEvents = nowActive ? 'none' : '';
  }
};
window.deleteTask = (id) => Tasks.delete(id);
window.filterTasks = (f) => Tasks.filter(f);
window.toggleSettings = () => ExcludeTags.toggleSettings();
window.addExcludeTag = () => ExcludeTags.add();
window.removeExcludeTag = (i) => ExcludeTags.remove(i);
window.driveGoBack = () => Drive.goBack();
window.driveClick = (id, mt, n) => Drive.click(id, mt, n);
window.driveJumpTo = (i) => Drive.jumpTo(i);
window.toggleDriveFilter = (t) => Drive.toggleFilter(t);
window.setAllDriveFilters = (on) => Drive.setAllFilters(on);
window.toggleHiddenDriveType = (t, on) => Drive.toggleHiddenType(t, on);
window.toggleDriveMoreMenu = () => Drive.toggleMoreMenu();
window.closeDriveMoreMenu = () => Drive.closeMoreMenu();
window.openEventModalFromAttr = (el) => openEventModalFromAttr(el);
window.closeEventModal = () => closeEventModal();
window.closePdfModal = () => Drive.closePdf();

// Boot
Theme.init();
initHeader();
AppState.set({ calDate: new Date() });
Calendar.render();
Deadlines.render();
Tasks.render();
Drive.syncFilterButtons();

if (GoogleAPI.isTokenValid()) {
  GoogleAPI.updateButton(true);
  Calendar.fetchEvents();
  Deadlines.fetchFromCalendar();
  Tasks.fetchFromGoogle();
  Drive.loadFolder('root');
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && GoogleAPI.isTokenValid()) Tasks.fetchFromGoogle(); });
setInterval(() => { if (GoogleAPI.isTokenValid()) Tasks.fetchFromGoogle(); }, 60000);

document.getElementById('deadline-modal')?.addEventListener('click', function(e) { if (e.target === this) Deadlines.closeModal(); });
document.getElementById('event-modal')?.addEventListener('click', function(e) { if (e.target === this) closeEventModal(); });
document.addEventListener('click', function(e) { const mw = document.querySelector('.drive-filter-extra'); if (mw && !mw.contains(e.target)) Drive.closeMoreMenu(); });

// ============================================================
// HORIZONTAL SCROLL WHEEL → calendar navigation
// Handles the Logitech MX Master 3S thumb wheel (deltaX)
// and any other device that fires horizontal wheel events.
// ============================================================
(function() {
  let wheelCooldown = false;

  document.getElementById('cal-container')?.addEventListener('wheel', function(e) {
    // Only act on horizontal scroll (deltaX), ignore pure vertical (deltaY)
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (Math.abs(e.deltaX) < 8) return; // ignore tiny drift
    e.preventDefault();
    if (wheelCooldown) return;
    wheelCooldown = true;
    setTimeout(() => { wheelCooldown = false; }, 350);
    Calendar.navigate(e.deltaX > 0 ? 1 : -1);
  }, { passive: false });
})();

// Toast animation injection
const _ts = document.createElement('style');
_ts.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}.toast-error{border-left-color:var(--danger)!important}.toast-success{border-left-color:var(--accent2)!important}';
document.head.appendChild(_ts);
