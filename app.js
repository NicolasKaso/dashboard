/**
 * Nicolas Dashboard - Refactored Production Version
 * Features: Clean architecture, error handling, toast notifications, PWA ready
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
  CLASS_NAMES: ['écriture et lit', 'écologie et évo', 'chimie solution', 'mécanique', 'bad. - base', 'calcul intégral', 'cult. & littér.', 'bad.-base', 'ecriture et lit', 'ecologie et evo', 'ecologie', 'chimie', 'mecanique'],
  DEADLINE_KEYWORDS: ['exam', 'test', 'quiz', 'midterm', 'final', 'due', 'assignment', 'submit', 'submission', 'deadline', 'essay', 'report', 'project', 'homework', 'hw', 'examen', 'devoir', 'travail', 'remise', 'évaluation', 'evaluation'],
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
  save: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {} },
  load: (key, defaultValue) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : defaultValue; } catch(e) { return defaultValue; } }
};

const Toast = {
  show: (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = 'background:var(--surface);border-left:3px solid var(--accent);padding:10px 16px;margin-bottom:8px;border-radius:8px;box-shadow:var(--shadow);font-size:13px;animation:slideIn 0.2s ease;';
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
  },
  error: (msg) => Toast.show(msg, 'error'),
  success: (msg) => Toast.show(msg, 'success')
};

const safeFetch = async (promise, fallback = null) => {
  try {
    const result = await promise;
    return { data: result, error: null };
  } catch (err) {
    console.error(err);
    Toast.error(err.message || 'Operation failed');
    return { data: fallback, error: err };
  }
};

// ============================================================
// APP STATE (Centralized)
// ============================================================

const AppState = {
  data: {
    tasks: Storage.load(CONFIG.STORAGE_KEYS.TASKS, [{ id: 1, text: 'Review lecture slides', type: 'todo', done: false }]),
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
  
  set(updates) { 
    Object.assign(this.data, updates); 
    this.notify();
  },
  
  subscribe(listener) { this.listeners.push(listener); },
  
  notify() { this.listeners.forEach(l => l(this.data)); }
};

// ============================================================
// THEME MANAGEMENT
// ============================================================

const Theme = {
  init() {
    const savedMode = Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light');
    const savedVariant = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic');
    this.apply(savedMode, savedVariant);
    this.updateUI();
  },
  
  apply(mode, variant) {
    const html = document.documentElement;
    const nextMode = mode === 'dark' ? 'dark' : 'light';
    html.setAttribute('data-theme', nextMode);
    if (nextMode === 'dark') html.setAttribute('data-dark-variant', variant || 'classic');
    else html.removeAttribute('data-dark-variant');
    Storage.save(CONFIG.STORAGE_KEYS.THEME_MODE, nextMode);
    Storage.save(CONFIG.STORAGE_KEYS.DARK_VARIANT, variant);
    this.updateUI();
  },
  
  setMode(mode) { this.apply(mode, Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic')); },
  
  cycleVariant() {
    const variants = ['classic', 'midnight'];
    const cur = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic');
    const idx = Math.max(0, variants.indexOf(cur));
    const next = variants[(idx + 1) % variants.length];
    this.apply(Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light'), next);
  },
  
  updateUI() {
    const mode = Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light');
    const lightBtn = document.getElementById('theme-light-btn');
    const darkBtn = document.getElementById('theme-dark-btn');
    if (lightBtn) lightBtn.classList.toggle('active', mode !== 'dark');
    if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
    
    const variantBtn = document.getElementById('dark-variant-btn');
    if (variantBtn) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      variantBtn.style.display = isDark ? 'inline-flex' : 'none';
      const v = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic');
      variantBtn.textContent = v === 'midnight' ? 'Midnight' : 'Classic';
    }
  },
  
  isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; },
  
  evColor(idx) {
    const palette = this.isDark() ? CONFIG.EV_COLORS_DARK : CONFIG.EV_COLORS;
    return palette[idx % palette.length];
  }
};

// ============================================================
// API SERVICES
// ============================================================

const GoogleAPI = {
  isTokenValid() {
    const { accessToken, tokenExpiry } = AppState.get();
    return !!(accessToken && Date.now() < tokenExpiry);
  },
  
  async fetch(url) {
    const { accessToken } = AppState.get();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.error) {
      if (data.error.code === 401) {
        AppState.set({ accessToken: null, tokenExpiry: 0 });
        Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null);
        Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0);
        this.updateButton(false);
        throw new Error('Session expired. Please reconnect.');
      }
      throw new Error(data.error.message);
    }
    return data;
  },
  
  updateButton(connected) {
    const btn = document.getElementById('gcal-btn');
    const lbl = document.getElementById('gcal-label');
    if (btn) btn.classList.toggle('connected', connected);
    if (lbl) lbl.textContent = connected ? 'Google Calendar connected' : 'Connect Google Calendar';
  },
  
  async auth() {
    if (this.isTokenValid()) {
      if (confirm('Disconnect Google Calendar?')) {
        AppState.set({ accessToken: null, tokenExpiry: 0 });
        Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null);
        Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0);
        this.updateButton(false);
        Calendar.render();
        document.getElementById('drive-content').innerHTML = '<div class="empty-state">Connect Google Calendar above to browse your Drive</div>';
      }
      return;
    }
    
    const redirect = window.location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({
      client_id: CONFIG.CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'token',
      scope: CONFIG.SCOPES,
      prompt: 'select_account',
    });
    
    const popup = window.open('https://accounts.google.com/o/oauth2/v2/auth?' + params, 'gcal_auth', 'width=500,height=620');
    const poll = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url && url.includes('access_token')) {
          clearInterval(poll);
          popup.close();
          const hash = new URLSearchParams(url.split('#')[1]);
          const token = hash.get('access_token');
          const expiry = Date.now() + parseInt(hash.get('expires_in') || '3600') * 1000;
          AppState.set({ accessToken: token, tokenExpiry: expiry });
          Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, token);
          Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, expiry);
          this.updateButton(true);
          Calendar.fetchEvents();
          Deadlines.fetchFromCalendar();
          Tasks.fetchFromGoogle();
          Drive.loadFolder('root');
        }
      } catch(e) {}
      if (!popup || popup.closed) clearInterval(poll);
    }, 500);
  }
};

// ============================================================
// CALENDAR MODULE
// ============================================================

const Calendar = {
  render() {
    const view = AppState.get().calView;
    if (view === 'day') this.renderDay();
    else if (view === 'week') this.renderWeek();
    else if (view === 'month') this.renderMonth();
    else this.renderYear();
  },
  
  setView(view) {
    AppState.set({ calView: view });
    document.querySelectorAll('.view-tab').forEach(btn => 
      btn.classList.toggle('active', btn.id === `tab-${view}`));
    this.render();
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },
  
  navigate(dir) {
    const state = AppState.get();
    const newDate = new Date(state.calDate);
    if (state.calView === 'day') newDate.setDate(newDate.getDate() + dir);
    else if (state.calView === 'week') newDate.setDate(newDate.getDate() + dir * 7);
    else if (state.calView === 'month') newDate.setMonth(newDate.getMonth() + dir);
    else newDate.setFullYear(newDate.getFullYear() + dir);
    AppState.set({ calDate: newDate });
    this.render();
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },
  
  goToday() {
    AppState.set({ calDate: new Date() });
    this.render();
    if (GoogleAPI.isTokenValid()) this.fetchEvents();
  },
  
  async fetchEvents() {
    const state = AppState.get();
    let start, end;
    const year = state.calDate.getFullYear();
    const month = state.calDate.getMonth();
    const date = state.calDate.getDate();
    
    if (state.calView === 'day') {
      start = new Date(year, month, date);
      end = new Date(year, month, date, 23, 59, 59);
    } else if (state.calView === 'week') {
      start = new Date(state.calDate);
      start.setDate(state.calDate.getDate() - state.calDate.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
    } else if (state.calView === 'month') {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 1);
    } else {
      start = new Date(year, 0, 1);
      end = new Date(year + 1, 0, 1);
    }
    
    const { data, error } = await safeFetch(GoogleAPI.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}` +
      `&singleEvents=true&orderBy=startTime&maxResults=500`
    ));
    
    if (error || !data) return;
    
    const newEvents = {};
    const colorMap = { ...AppState.get().colorMap };
    let colorCounter = AppState.get().colorCounter;
    
    (data.items || []).forEach(e => {
      const ds = (e.start.date || e.start.dateTime || '').split('T')[0];
      if (!ds) return;
      if (!newEvents[ds]) newEvents[ds] = [];
      
      const name = e.summary || '(no title)';
      if (!(name in colorMap)) { colorMap[name] = colorCounter % CONFIG.EV_COLORS.length; colorCounter++; }
      const colorIdx = colorMap[name];
      
      if (e.start.dateTime) {
        const st = new Date(e.start.dateTime);
        const et = new Date(e.end ? e.end.dateTime : e.start.dateTime);
        const startMin = st.getHours() * 60 + st.getMinutes();
        const endMin = et.getHours() * 60 + et.getMinutes() || startMin + 60;
        if (!newEvents[ds].some(x => x.name === name && x.startMin === startMin)) {
          newEvents[ds].push({
            id: e.id, name, startMin, endMin,
            timeStr: `${this._fmt12(st)} – ${this._fmt12(et)}`,
            colorIdx, allDay: false,
            startISO: e.start.dateTime, endISO: e.end?.dateTime || e.start.dateTime,
            location: e.location || '', description: e.description || '', htmlLink: e.htmlLink || ''
          });
        }
      } else if (!newEvents[ds].some(x => x.name === name && x.startMin === undefined)) {
        newEvents[ds].push({
          id: e.id, name, colorIdx, allDay: true,
          startISO: e.start.date || ds, endISO: e.end?.date || ds,
          location: e.location || '', description: e.description || '', htmlLink: e.htmlLink || ''
        });
      }
    });
    
    AppState.set({ calEvents: newEvents, colorMap, colorCounter });
    this.render();
  },
  
  _fmt12(date) { return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); },
  
  renderDay() {
    const state = AppState.get();
    const label = document.getElementById('cal-nav-label');
    const today = new Date(); today.setHours(0,0,0,0);
    const isToday = state.calDate.toDateString() === today.toDateString();
    label.textContent = `${CONFIG.DAYS_LONG[state.calDate.getDay()]}, ${CONFIG.MONTHS_SH[state.calDate.getMonth()]} ${state.calDate.getDate()}${isToday ? ' — Today' : ''}`;
    document.getElementById('cal-container').innerHTML = this._buildTimeGrid([new Date(state.calDate)]);
    this._scrollToHour(8);
  },
  
  renderWeek() {
    const state = AppState.get();
    const weekStart = new Date(state.calDate);
    weekStart.setDate(state.calDate.getDate() - state.calDate.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    document.getElementById('cal-nav-label').textContent = `${CONFIG.MONTHS_SH[weekStart.getMonth()]} ${weekStart.getDate()} – ${CONFIG.MONTHS_SH[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    document.getElementById('cal-container').innerHTML = this._buildTimeGrid(days);
    this._scrollToHour(8);
  },
  
  renderMonth() {
    const state = AppState.get();
    const y = state.calDate.getFullYear(), m = state.calDate.getMonth();
    document.getElementById('cal-nav-label').textContent = `${CONFIG.MONTHS[m]} ${y}`;
    const today = new Date(); today.setHours(0,0,0,0);
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const pad = first.getDay();
    
    let html = '<div class="month-wrap"><div class="month-grid">';
    CONFIG.DAYS_SHORT.forEach(d => html += `<div class="month-head">${d}</div>`);
    
    const prevDays = new Date(y, m, 0).getDate();
    for (let i = pad - 1; i >= 0; i--) html += `<div class="month-cell other-month"><div class="month-num">${prevDays - i}</div></div>`;
    
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(y, m, i);
      const ds = d.toISOString().split('T')[0];
      const isToday = d.toDateString() === today.toDateString();
      const evs = (state.calEvents[ds] || []).slice(0, 3);
      html += `<div class="month-cell${isToday ? ' today' : ''}"><div class="month-num">${i}</div>`;
      evs.forEach((e, idx) => {
        const evJson = encodeURIComponent(JSON.stringify(e));
        html += `<div class="month-mini-ev" onclick="window.openEventModalFromAttr(this)" data-ev="${evJson}" style="background:${Theme.evColor(e.colorIdx || idx)}">${e.name}</div>`;
      });
      html += `</div>`;
    }
    
    const cells = pad + daysInMonth;
    const trailing = (7 - (cells % 7)) % 7;
    for (let i = 1; i <= trailing; i++) html += `<div class="month-cell other-month"><div class="month-num">${i}</div></div>`;
    html += '</div></div>';
    document.getElementById('cal-container').innerHTML = html;
  },
  
  renderYear() {
    const y = AppState.get().calDate.getFullYear();
    document.getElementById('cal-nav-label').textContent = `${y}`;
    const today = new Date();
    const events = AppState.get().calEvents;
    
    let html = '<div class="year-wrap">';
    for (let mo = 0; mo < 12; mo++) {
      const first = new Date(y, mo, 1);
      const days = new Date(y, mo + 1, 0).getDate();
      const pad = first.getDay();
      html += `<div class="mini-month" onclick="Calendar.setView('month'); AppState.set({ calDate: new Date(${y},${mo},1) }); Calendar.render();">
        <div class="mini-month-title">${CONFIG.MONTHS_SH[mo]}</div>
        <div class="mini-month-grid">`;
      for (let p = 0; p < pad; p++) html += '<div class="mini-day"></div>';
      for (let d = 1; d <= days; d++) {
        const dt = new Date(y, mo, d);
        const ds = dt.toISOString().split('T')[0];
        const isToday = dt.toDateString() === today.toDateString();
        const hasEv = !!(events[ds] && events[ds].length);
        html += `<div class="mini-day${isToday ? ' today' : hasEv ? ' has-event' : ''}">${d}</div>`;
      }
      html += '</div></div>';
    }
    html += '</div>';
    document.getElementById('cal-container').innerHTML = html;
  },
  
  _buildTimeGrid(days) {
    const state = AppState.get();
    const today = new Date(); today.setHours(0,0,0,0);
    const TOTAL_PX = CONFIG.PX_PER_HOUR * 24;
    
    let headerHTML = '<div class="tg-header"><div class="tg-header-gutter"></div><div class="tg-header-days">';
    days.forEach(d => {
      const isToday = d.toDateString() === today.toDateString();
      headerHTML += `<div class="tg-head-day"><span class="tg-head-day-name">${CONFIG.DAYS_SHORT[d.getDay()]}</span>
        <div class="tg-head-day-num${isToday ? ' today' : ''}">${d.getDate()}</div></div>`;
    });
    headerHTML += '</div></div>';
    
    let anyAllDay = false;
    const allDayByDate = {};
    days.forEach(d => {
      const ds = d.toISOString().split('T')[0];
      const evs = (state.calEvents[ds] || []).filter(e => e.allDay);
      if (evs.length) anyAllDay = true;
      allDayByDate[ds] = evs;
    });
    
    const allDayHTML = anyAllDay ? `<div class="tg-allday"><div class="tg-allday-gutter">All day</div><div class="tg-allday-days">${days.map(d => {
      const ds = d.toISOString().split('T')[0];
      const evs = (allDayByDate[ds] || []).slice(0, 3);
      return `<div class="tg-allday-col">${evs.map((e, idx) => {
        const evJson = encodeURIComponent(JSON.stringify(e));
        return `<div class="tg-allday-ev" onclick="window.openEventModalFromAttr(this)" data-ev="${evJson}" style="border-left-color:${Theme.evColor(e.colorIdx || idx)};">${e.name}</div>`;
      }).join('')}</div>`;
    }).join('')}</div></div>` : '';
    
    let gutterHTML = '<div class="tg-gutter">';
    for (let h = 0; h < 24; h++) {
      const top = h * CONFIG.PX_PER_HOUR;
      const label = h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      gutterHTML += `<div class="tg-hour-label" style="top:${top}px">${label}</div>`;
    }
    gutterHTML += '</div>';
    
    let daysHTML = '<div class="tg-days">';
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
      placed.forEach(ev => {
        const concurrent = placed.filter(p => p !== ev && p.startMin < ev.endMin && p.endMin > ev.startMin);
        ev.totalCols = concurrent.length + 1;
      });
      
      daysHTML += '<div class="tg-day-col">';
      for (let h = 0; h < 24; h++) {
        daysHTML += `<div class="tg-hline" style="top:${h * CONFIG.PX_PER_HOUR}px"></div>`;
        daysHTML += `<div class="tg-hline half" style="top:${h * CONFIG.PX_PER_HOUR + CONFIG.PX_PER_HOUR / 2}px"></div>`;
      }
      if (d.toDateString() === today.toDateString()) {
        const pct = (new Date().getHours() * 60 + new Date().getMinutes()) / (24 * 60);
        daysHTML += `<div class="tg-now" style="top:${pct * TOTAL_PX}px"></div>`;
      }
      placed.forEach(ev => {
        const top = (ev.startMin / 60) * CONFIG.PX_PER_HOUR;
        const height = Math.max(20, ((ev.endMin - ev.startMin) / 60) * CONFIG.PX_PER_HOUR - 2);
        const colW = 100 / ev.totalCols;
        const left = ev.col * colW;
        const c = Theme.evColor(ev.colorIdx);
        const bg = c + (Theme.isDark() ? '28' : '1a');
        const evJson = encodeURIComponent(JSON.stringify(ev));
        daysHTML += `<div class="ev-block" style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${colW}% - 4px);background:${bg};border-left-color:${c};color:${c};" onclick="window.openEventModalFromAttr(this)" data-ev="${evJson}"><div class="ev-name">${ev.name}</div>${height > 30 ? `<div class="ev-time">${ev.timeStr}</div>` : ''}</div>`;
      });
      daysHTML += '</div>';
    });
    daysHTML += '</div>';
    
    return `<div class="tg-wrap">${headerHTML}${allDayHTML}<div class="tg-scroll" id="tg-scroll"><div class="tg-body" style="height:${TOTAL_PX}px;">${gutterHTML}${daysHTML}</div></div></div>`;
  },
  
  _scrollToHour(h) {
    requestAnimationFrame(() => {
      const el = document.getElementById('tg-scroll');
      if (el) el.scrollTop = h * CONFIG.PX_PER_HOUR;
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
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${now.toISOString()}&timeMax=${future.toISOString()}` +
      `&singleEvents=true&orderBy=startTime&maxResults=500`
    ));
    if (error || !data) return;
    
    const excludeWords = AppState.get().excludeWords;
    const isExcluded = (title) => excludeWords.some(w => title?.toLowerCase().includes(w.toLowerCase()));
    const isDeadlineKw = (title) => CONFIG.DEADLINE_KEYWORDS.some(k => title?.toLowerCase().includes(k));
    
    const gcalDeadlines = (data.items || [])
      .map(e => {
        const title = e.summary || '';
        const dateStr = (e.start.date || e.start.dateTime || '').split('T')[0];
        if (!title || !dateStr || isExcluded(title) || !isDeadlineKw(title)) return null;
        return { id: 'gcal_' + e.id, name: title, course: 'Google Calendar', date: dateStr, fromGcal: true, gcalEventId: e.id };
      })
      .filter(Boolean);
    
    const seen = new Set();
    AppState.set({ gcalDeadlines: gcalDeadlines.filter(d => { if (seen.has(d.gcalEventId)) return false; seen.add(d.gcalEventId); return true; }) });
    this.render();
  },
  
  render() {
    const state = AppState.get();
    const list = document.getElementById('deadline-list');
    const now = new Date(); now.setHours(0,0,0,0);
    
    const combined = [...state.deadlines];
    state.gcalDeadlines.forEach(gd => {
      if (!state.deadlines.some(m => m.name.toLowerCase() === gd.name.toLowerCase() && m.date === gd.date))
        combined.push(gd);
    });
    
    if (!combined.length) { list.innerHTML = '<div class="empty-state">No upcoming deadlines</div>'; return; }
    
    const sorted = [...combined].sort((a, b) => new Date(a.date) - new Date(b.date));
    list.innerHTML = sorted.map(d => {
      const due = new Date(d.date + 'T00:00:00');
      const diff = Math.round((due - now) / 86400000);
      const cls = diff <= 2 ? 'urgent' : diff <= 7 ? 'soon' : 'ok';
      const lbl = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
      const dStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="deadline-item ${cls}"><div style="flex:1;min-width:0;"><div class="deadline-name">${escapeHtml(d.name)}</div><div class="deadline-course">${escapeHtml(d.course)}</div></div><button class="deadline-delete" onclick="window.deleteDeadline('${d.id}')" title="Delete">✕</button><div style="flex-shrink:0;"><div class="deadline-date ${cls}">${dStr}</div><div class="deadline-days">${lbl}</div></div></div>`;
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
    AppState.set({ deadlines });
    Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, deadlines);
    this.render();
    
    if (GoogleAPI.isTokenValid()) {
      const end = new Date(date + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      const event = { summary: name, description: `Deadline from dashboard (${course})`, start: { date }, end: { date: end.toISOString().split('T')[0] }, colorId: '11' };
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST', headers: { Authorization: `Bearer ${AppState.get().accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }).then(res => res.json()).then(data => {
        if (data && !data.error) {
          const updatedDeadlines = AppState.get().deadlines.map(d => d.id === id ? { ...d, gcalEventId: data.id } : d);
          AppState.set({ deadlines: updatedDeadlines });
          Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, updatedDeadlines);
          this.fetchFromCalendar();
        }
      }).catch(err => console.error(err));
    }
  },
  
  async delete(id) {
    if (!confirm('Delete this deadline?')) return;
    const state = AppState.get();
    const manual = state.deadlines.find(d => String(d.id) === String(id));
    if (manual) {
      const deadlines = state.deadlines.filter(d => String(d.id) !== String(id));
      AppState.set({ deadlines });
      Storage.save(CONFIG.STORAGE_KEYS.DEADLINES, deadlines);
      if (manual.gcalEventId && GoogleAPI.isTokenValid()) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${manual.gcalEventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${state.accessToken}` } });
      }
      this.render();
      return;
    }
    const gcal = state.gcalDeadlines.find(d => String(d.id) === String(id));
    if (gcal?.gcalEventId && GoogleAPI.isTokenValid()) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcal.gcalEventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${state.accessToken}` } });
      this.fetchFromCalendar();
    }
  },
  
  openModal() { document.getElementById('deadline-modal').style.display = 'flex'; const d = new Date(); d.setDate(d.getDate() + 7); const dateInput = document.getElementById('dl-date'); if (dateInput) dateInput.value = d.toISOString().split('T')[0]; },
  closeModal() { document.getElementById('deadline-modal').style.display = 'none'; }
};

// ============================================================
// TASKS MODULE
// ============================================================

const Tasks = {
  render() {
    const state = AppState.get();
    const list = document.getElementById('tasks-list');
    const filtered = state.currentFilter === 'all' ? state.tasks : state.tasks.filter(t => t.type === state.currentFilter);
    if (!filtered.length) { list.innerHTML = '<div class="empty-state">Nothing here — add something above</div>'; return; }
    const labels = { todo: 'To-do', assignment: 'Assignment', deadline: 'Deadline' };
    list.innerHTML = filtered.map(t => `<div class="task-item${t.done ? ' done' : ''}"><div class="task-check${t.done ? ' checked' : ''}" onclick="window.toggleTask('${t.id}')"></div><span class="task-text">${escapeHtml(t.text)}</span><span class="task-badge badge-${t.type}">${labels[t.type] || 'To-do'}</span><button class="task-delete" onclick="window.deleteTask('${t.id}')">✕</button></div>`).join('');
  },
  
  async add() {
    const input = document.getElementById('task-input');
    const text = input?.value.trim();
    if (!text) return;
    const type = document.getElementById('task-type')?.value || 'todo';
    const id = Date.now();
    const tasks = [...AppState.get().tasks, { id, text, type, done: false }];
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    input.value = '';
    this.render();
    if (GoogleAPI.isTokenValid()) await this.pushToGoogle(text, type, id);
  },
  
  async toggle(id) {
    const tasks = AppState.get().tasks.map(t => String(t.id) === String(id) ? { ...t, done: !t.done } : t);
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    this.render();
    const task = tasks.find(t => String(t.id) === String(id));
    if (task && GoogleAPI.isTokenValid()) await this.syncDone(task);
  },
  
  async delete(id) {
    const task = AppState.get().tasks.find(t => String(t.id) === String(id));
    const tasks = AppState.get().tasks.filter(t => String(t.id) !== String(id));
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    this.render();
    if (task?.gtaskId && task?.gtaskListId && GoogleAPI.isTokenValid()) {
      await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${task.gtaskListId}/tasks/${task.gtaskId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${AppState.get().accessToken}` } });
    }
  },
  
  filter(filter) {
    AppState.set({ currentFilter: filter });
    document.querySelectorAll('.filter-tab').forEach(btn => btn.classList.toggle('active', btn.id === `filter-${filter}`));
    this.render();
  },
  
  async resolveTaskLists() {
    const data = await GoogleAPI.fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20');
    const lists = data.items || [];
    let ids = { todo: null, assignment: null };
    for (const list of lists) {
      if (list.title === 'To-do') ids.todo = list.id;
      if (list.title === 'Assignments') ids.assignment = list.id;
    }
    if (!ids.todo) {
      const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        method: 'POST', headers: { Authorization: `Bearer ${AppState.get().accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To-do' })
      });
      const created = await res.json();
      ids.todo = created.id;
    }
    if (!ids.assignment) {
      const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        method: 'POST', headers: { Authorization: `Bearer ${AppState.get().accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Assignments' })
      });
      const created = await res.json();
      ids.assignment = created.id;
    }
    AppState.set({ gTaskListIds: ids });
    return ids;
  },
  
  async pushToGoogle(text, type, localId) {
    try {
      const ids = await this.resolveTaskLists();
      const listId = type === 'assignment' ? ids.assignment : ids.todo;
      const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
        method: 'POST', headers: { Authorization: `Bearer ${AppState.get().accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text })
      });
      const created = await res.json();
      if (!created.error) {
        const tasks = AppState.get().tasks.map(t => String(t.id) === String(localId) ? { ...t, gtaskId: created.id, gtaskListId: listId } : t);
        AppState.set({ tasks });
        Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
      }
    } catch (err) { console.error(err); }
  },
  
  async syncDone(task) {
    if (!task.gtaskId || !task.gtaskListId) return;
    const existing = await GoogleAPI.fetch(`https://tasks.googleapis.com/tasks/v1/lists/${task.gtaskListId}/tasks/${task.gtaskId}`);
    const updated = { ...existing, status: task.done ? 'completed' : 'needsAction' };
    if (!task.done) updated.completed = null;
    await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${task.gtaskListId}/tasks/${task.gtaskId}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${AppState.get().accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  },
  
  async fetchFromGoogle() {
    if (!GoogleAPI.isTokenValid()) return;
    const ids = await this.resolveTaskLists();
    const localByGtaskId = {};
    AppState.get().tasks.forEach(t => { if (t.gtaskId) localByGtaskId[t.gtaskId] = t; });
    
    const incoming = [];
    for (const [type, listId] of [['todo', ids.todo], ['assignment', ids.assignment]]) {
      if (!listId) continue;
      const data = await GoogleAPI.fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=true&showHidden=true&maxResults=100`);
      (data.items || []).forEach(t => {
        if (t.title) incoming.push({ gtaskId: t.id, gtaskListId: listId, text: t.title, type, done: t.status === 'completed' });
      });
    }
    
    const incomingIds = new Set(incoming.map(t => t.gtaskId));
    let tasks = AppState.get().tasks.filter(t => !t.gtaskId || incomingIds.has(t.gtaskId));
    incoming.forEach(gt => {
      const local = localByGtaskId[gt.gtaskId];
      if (local) tasks = tasks.map(t => t.gtaskId === gt.gtaskId ? { ...t, done: gt.done } : t);
      else tasks.push({ id: 'gt_' + gt.gtaskId, gtaskId: gt.gtaskId, gtaskListId: gt.gtaskListId, text: gt.text, type: gt.type, done: gt.done, source: 'gtasks' });
    });
    AppState.set({ tasks });
    Storage.save(CONFIG.STORAGE_KEYS.TASKS, tasks);
    this.render();
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
    const q = folderId === 'root' ? `'root' in parents and trashed=false` : `'${folderId}' in parents and trashed=false`;
    const { data, error } = await safeFetch(GoogleAPI.fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=100`
    ));
    if (error) return;
    AppState.set({ driveFiles: data?.files || [] });
    const backBtn = document.getElementById('drive-back-btn');
    if (backBtn) backBtn.style.display = AppState.get().driveStack.length > 1 ? 'inline-flex' : 'none';
    if (!AppState.get().driveFiles.length && content) content.innerHTML = '<div class="empty-state">This folder is empty</div>';
    else this.render();
  },
  
  render() {
    const state = AppState.get();
    const content = document.getElementById('drive-content');
    const filtered = state.driveFiles.filter(f => !!state.driveTypeFilters[this.fileType(f.mimeType)]);
    const status = document.getElementById('drive-status');
    if (status) status.textContent = `${filtered.length} of ${state.driveFiles.length} item${state.driveFiles.length !== 1 ? 's' : ''}`;
    if (!filtered.length && content) { content.innerHTML = '<div class="empty-state">No files match this filter</div>'; return; }
    const typeLabels = { folder: 'Folder', pdf: 'PDF', image: 'Image', doc: 'Document', sheet: 'Spreadsheet', slides: 'Slides', other: 'File' };
    if (content) content.innerHTML = `<div class="drive-grid">${filtered.map(f => `<div class="drive-item" onclick="window.driveClick('${f.id}','${f.mimeType.replace(/'/g, "\\'")}','${encodeURIComponent(f.name)}')"><div style="font-size:22px;">${this.iconFor(f.mimeType)}</div><div class="drive-item-name">${escapeHtml(f.name)}</div><div class="drive-item-meta">${typeLabels[this.fileType(f.mimeType)]}</div></div>`).join('')}</div>`;
  },
  
  click(id, mt, encodedName) {
    const name = decodeURIComponent(encodedName);
    if (mt === 'application/vnd.google-apps.folder') {
      const stack = [...AppState.get().driveStack, { id, name }];
      AppState.set({ driveStack: stack });
      this.loadFolder(id);
    } else if (mt === 'application/pdf') this.openPdf(id, name);
    else window.open(`https://drive.google.com/file/d/${id}/view`, '_blank');
  },
  
  goBack() {
    const stack = AppState.get().driveStack;
    if (stack.length <= 1) return;
    const newStack = stack.slice(0, -1);
    AppState.set({ driveStack: newStack });
    this.loadFolder(newStack[newStack.length - 1].id);
  },
  
  updatePath() {
    const pathEl = document.getElementById('drive-path');
    if (!pathEl) return;
    pathEl.innerHTML = AppState.get().driveStack.map((item, i) => {
      if (i === AppState.get().driveStack.length - 1) return `<span class="drive-current">${escapeHtml(item.name)}</span>`;
      return `<span class="drive-crumb" onclick="window.driveJumpTo(${i})">${escapeHtml(item.name)}</span><span class="drive-sep">/</span>`;
    }).join('');
  },
  
  jumpTo(idx) {
    const newStack = AppState.get().driveStack.slice(0, idx + 1);
    AppState.set({ driveStack: newStack });
    this.loadFolder(newStack[newStack.length - 1].id);
  },
  
  openPdf(id, name) {
    const titleEl = document.getElementById('pdf-modal-title');
    const iframe = document.getElementById('pdf-iframe');
    const link = document.getElementById('pdf-open-link');
    if (titleEl) titleEl.textContent = name;
    if (iframe) iframe.src = `https://drive.google.com/file/d/${id}/preview`;
    if (link) link.href = `https://drive.google.com/file/d/${id}/view`;
    document.getElementById('pdf-modal')?.classList.add('open');
  },
  
  closePdf() {
    document.getElementById('pdf-modal')?.classList.remove('open');
    const iframe = document.getElementById('pdf-iframe');
    if (iframe) iframe.src = '';
  },
  
  toggleFilter(type) {
    const filters = { ...AppState.get().driveTypeFilters };
    filters[type] = !filters[type];
    if (!Object.values(filters).some(Boolean)) filters[type] = true;
    AppState.set({ driveTypeFilters: filters });
    Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters);
    this.syncFilterButtons();
    this.render();
  },
  
  setAllFilters(isOn) {
    const filters = { folder: isOn, pdf: isOn, doc: isOn, image: isOn, sheet: isOn, slides: isOn, other: isOn };
    AppState.set({ driveTypeFilters: filters });
    Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters);
    this.syncFilterButtons();
    this.render();
  },
  
  toggleHiddenType(type, isOn) {
    const filters = { ...AppState.get().driveTypeFilters };
    filters[type] = !!isOn;
    if (!Object.values(filters).some(Boolean)) filters[type] = true;
    AppState.set({ driveTypeFilters: filters });
    Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters);
    this.syncFilterButtons();
    this.render();
  },
  
  syncFilterButtons() {
    const filters = AppState.get().driveTypeFilters;
    const allOn = Object.values(filters).every(Boolean);
    document.querySelectorAll('.drive-filter-tab').forEach(btn => {
      const filter = btn.dataset.filter;
      if (filter === 'all') btn.classList.toggle('active', allOn);
      else btn.classList.toggle('active', !!filters[filter]);
    });
    const otherToggle = document.getElementById('drive-filter-other');
    if (otherToggle) otherToggle.checked = !!filters.other;
  },
  
  toggleMoreMenu() {
    const open = !AppState.get().driveMoreMenuOpen;
    AppState.set({ driveMoreMenuOpen: open });
    const menu = document.getElementById('drive-filter-menu');
    if (menu) menu.classList.toggle('open', open);
  },
  
  closeMoreMenu() {
    AppState.set({ driveMoreMenuOpen: false });
    const menu = document.getElementById('drive-filter-menu');
    if (menu) menu.classList.remove('open');
  }
};

// ============================================================
// EXCLUDE TAGS (Settings)
// ============================================================

const ExcludeTags = {
  render() {
    const tags = document.getElementById('exclude-tags');
    if (tags) tags.innerHTML = AppState.get().excludeWords.map((w, i) => `<div class="tag">${escapeHtml(w)}<button class="tag-remove" onclick="window.removeExcludeTag(${i})">×</button></div>`).join('');
  },
  
  add() {
    const input = document.getElementById('exclude-input');
    const v = input?.value.trim().toLowerCase();
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
    const open = !AppState.get().settingsOpen;
    AppState.set({ settingsOpen: open });
    const panel = document.getElementById('settings-panel');
    if (panel) panel.style.display = open ? 'block' : 'none';
    if (open) this.render();
  }
};

// ============================================================
// MODALS
// ============================================================

function openEventModalFromAttr(el) {
  try {
    const raw = el?.dataset?.ev;
    if (!raw) return;
    const ev = JSON.parse(decodeURIComponent(raw));
    const overlay = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const whenEl = document.getElementById('event-when');
    const whereEl = document.getElementById('event-where');
    const descEl = document.getElementById('event-desc');
    const linkEl = document.getElementById('event-open-link');
    if (!overlay || !titleEl || !whenEl || !whereEl || !descEl || !linkEl) return;
    
    titleEl.textContent = ev.name || '(no title)';
    let whenText = '';
    if (ev.allDay) {
      const start = (ev.startISO || '').split('T')[0];
      whenText = start ? `All day · ${new Date(start + 'T00:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' })}` : 'All day';
    } else if (ev.startISO) {
      const st = new Date(ev.startISO);
      const et = ev.endISO ? new Date(ev.endISO) : null;
      const datePart = st.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
      const timePart = et ? `${st.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })} – ${et.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}` : st.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
      whenText = `${datePart} · ${timePart}`;
    } else if (ev.timeStr) whenText = ev.timeStr;
    whenEl.textContent = whenText;
    
    const loc = (ev.location || '').trim();
    if (loc) { whereEl.style.display = ''; whereEl.textContent = loc; }
    else { whereEl.style.display = 'none'; whereEl.textContent = ''; }
    
    const desc = (ev.description || '').trim();
    if (desc) { descEl.style.display = ''; descEl.textContent = desc; }
    else { descEl.style.display = 'none'; descEl.textContent = ''; }
    
    linkEl.href = ev.htmlLink || '#';
    linkEl.style.display = ev.htmlLink ? '' : 'none';
    overlay.style.display = 'flex';
  } catch(e) { console.error(e); }
}

function closeEventModal() {
  const overlay = document.getElementById('event-modal');
  if (overlay) overlay.style.display = 'none';
}

function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ============================================================
// INITIALIZATION
// ============================================================

function initHeader() {
  const now = new Date();
  const h = now.getHours();
  const greeting = document.getElementById('greeting-word');
  const dateEl = document.getElementById('header-date');
  if (greeting) greeting.textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  if (dateEl) dateEl.textContent = `${CONFIG.DAYS_SHORT[now.getDay()]}, ${CONFIG.MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

// Expose to window for inline onclick handlers
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
window.deleteTask = (id) => Tasks.delete(id);
window.filterTasks = (f) => Tasks.filter(f);
window.toggleSettings = () => ExcludeTags.toggleSettings();
window.addExcludeTag = () => ExcludeTags.add();
window.removeExcludeTag = (i) => ExcludeTags.remove(i);
window.driveGoBack = () => Drive.goBack();
window.driveClick = (id, mt, name) => Drive.click(id, mt, name);
window.driveJumpTo = (i) => Drive.jumpTo(i);
window.toggleDriveFilter = (t) => Drive.toggleFilter(t);
window.setAllDriveFilters = (on) => Drive.setAllFilters(on);
window.toggleHiddenDriveType = (t, on) => Drive.toggleHiddenType(t, on);
window.toggleDriveMoreMenu = () => Drive.toggleMoreMenu();
window.closeDriveMoreMenu = () => Drive.closeMoreMenu();
window.openEventModalFromAttr = (el) => openEventModalFromAttr(el);
window.closeEventModal = () => closeEventModal();
window.closePdfModal = () => Drive.closePdf();

// Initialize
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

// Close modals on outside click
document.getElementById('deadline-modal')?.addEventListener('click', function(e) { if (e.target === this) Deadlines.closeModal(); });
document.getElementById('event-modal')?.addEventListener('click', function(e) { if (e.target === this) closeEventModal(); });
document.addEventListener('click', function(e) {
  const menuWrap = document.querySelector('.drive-filter-extra');
  if (menuWrap && !menuWrap.contains(e.target)) Drive.closeMoreMenu();
});

// Add toast animation style
const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } .toast-error { border-left-color: var(--danger) !important; } .toast-success { border-left-color: var(--accent2) !important; }`;
document.head.appendChild(style);