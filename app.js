/* ============================================================
   CONSTANTS
   ============================================================ */
const CLIENT_ID = '525270045169-ro6l87v50nn2ed2cufgdqub2qhodclfj.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
].join(' ');

const DAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SH  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PX_PER_HOUR = 64; // height of one hour slot in px
const TOTAL_PX    = PX_PER_HOUR * 24;

const EV_COLORS = [
  '#2563a8','#2e7d52','#c2692a','#7c3abf',
  '#b06820','#c0392b','#1e8a99','#5a7a2e'
];
// Dark-mode variants (brighter)
const EV_COLORS_DARK = [
  '#5a9de8','#3db870','#e8854a','#a06de0',
  '#e0a040','#e05555','#3abccc','#8ab840'
];

const CLASS_NAMES = [
  'écriture et lit','écologie et évo','chimie solution',
  'mécanique','bad. - base','calcul intégral','cult. & littér.',
  'bad.-base','ecriture et lit','ecologie et evo','ecologie','chimie','mecanique'
];
const DEADLINE_KEYWORDS = [
  'exam','test','quiz','midterm','final','due','assignment','submit',
  'submission','deadline','essay','report','project','homework','hw',
  'examen','devoir','travail','remise','évaluation','evaluation'
];

/* ============================================================
   STORAGE HELPERS
   ============================================================ */
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e) { return d; } };

/* ============================================================
   STATE
   ============================================================ */
let tasks        = load('tasks', [{ id: 1, text: 'Review lecture slides', type: 'todo', done: false }]);
let deadlines    = load('deadlines', []);
let excludeWords = load('excludeWords', [...CLASS_NAMES]);
let currentFilter = 'all';
let accessToken  = load('gcal_token', null);
let tokenExpiry  = load('gcal_expiry', 0);

let calView      = 'week';
let calDate      = new Date();          // drives which period is shown
let calEvents    = {};                  // { 'YYYY-MM-DD': [{name, startMin, endMin, timeStr, colorIdx}] }
let colorMap     = {};                  // name → color index
let colorCounter = 0;

let driveStack   = [{ id: 'root', name: 'My Drive' }];
let settingsOpen = false;

/* ============================================================
   THEME
   ============================================================ */
function initTheme() {
  // Respect system preference unless user has overridden
  const saved = load('theme', 'auto');
  applyTheme(saved);
}

function applyTheme(mode) {
  const html = document.documentElement;
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', mode);
  }
  save('theme', mode);
  updateThemeIcon();
}

function toggleTheme() {
  const current = load('theme', 'auto');
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  // Cycle: auto → light → dark → auto
  const next = current === 'auto' ? (isDark ? 'light' : 'dark') : current === 'light' ? 'dark' : 'auto';
  applyTheme(next);
}

function updateThemeIcon() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const mode = load('theme', 'auto');
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  icon.textContent = mode === 'auto' ? '◐' : isDark ? '☽' : '☀';
}

function isDarkMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function evColor(idx) {
  const palette = isDarkMode() ? EV_COLORS_DARK : EV_COLORS;
  return palette[idx % palette.length];
}

// Re-render calendar on system theme change
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (load('theme', 'auto') === 'auto') applyTheme('auto');
  renderCalView();
});

/* ============================================================
   HEADER
   ============================================================ */
function initHeader() {
  const now = new Date();
  const h = now.getHours();
  document.getElementById('greeting-word').textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  document.getElementById('header-date').textContent =
    `${DAYS_SHORT[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

/* ============================================================
   GOOGLE AUTH
   ============================================================ */
function isTokenValid() { return !!(accessToken && Date.now() < tokenExpiry); }

function handleGCalAuth() {
  if (isTokenValid()) {
    if (!confirm('Disconnect Google Calendar?')) return;
    accessToken = null; tokenExpiry = 0;
    save('gcal_token', null); save('gcal_expiry', 0);
    updateGCalButton(false);
    renderCalView();
    document.getElementById('drive-content').innerHTML = '<div class="empty-state">Connect Google Calendar above to browse your Drive</div>';
    return;
  }
  const redirect = window.location.href.split('?')[0].split('#')[0];
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'token',
    scope: SCOPES,
    prompt: 'select_account',
  });
  const popup = window.open(
    'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(),
    'gcal_auth', 'width=500,height=620,left=200,top=100'
  );
  const poll = setInterval(() => {
    try {
      const url = popup.location.href;
      if (url && url.includes('access_token')) {
        clearInterval(poll);
        popup.close();
        const hash = new URLSearchParams(url.split('#')[1]);
        accessToken = hash.get('access_token');
        tokenExpiry = Date.now() + parseInt(hash.get('expires_in') || '3600') * 1000;
        save('gcal_token', accessToken);
        save('gcal_expiry', tokenExpiry);
        updateGCalButton(true);
        fetchEventsForView();
        fetchAndSyncDeadlines();
        fetchGoogleTasks();
        loadDriveFolder('root');
      }
    } catch (e) { /* cross-origin until redirect */ }
    if (!popup || popup.closed) clearInterval(poll);
  }, 500);
}

function updateGCalButton(connected) {
  const btn = document.getElementById('gcal-btn');
  const lbl = document.getElementById('gcal-label');
  btn.classList.toggle('connected', connected);
  lbl.textContent = connected ? 'Google Calendar connected' : 'Connect Google Calendar';
}

async function gFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 401) {
      accessToken = null; tokenExpiry = 0;
      save('gcal_token', null); save('gcal_expiry', 0);
      updateGCalButton(false);
    }
    throw new Error(data.error.message);
  }
  return data;
}

/* ============================================================
   CALENDAR — view switching & navigation
   ============================================================ */
function setView(v) {
  calView = v;
  document.querySelectorAll('.view-tab').forEach(b =>
    b.classList.toggle('active', b.id === 'tab-' + v)
  );
  renderCalView();
  if (isTokenValid()) fetchEventsForView();
}

function navCal(dir) {
  if (calView === 'day')   calDate.setDate(calDate.getDate() + dir);
  if (calView === 'week')  calDate.setDate(calDate.getDate() + dir * 7);
  if (calView === 'month') calDate.setMonth(calDate.getMonth() + dir);
  if (calView === 'year')  calDate.setFullYear(calDate.getFullYear() + dir);
  renderCalView();
  if (isTokenValid()) fetchEventsForView();
}

function goToday() {
  calDate = new Date();
  renderCalView();
  if (isTokenValid()) fetchEventsForView();
}

function renderCalView() {
  if      (calView === 'day')   renderDayView();
  else if (calView === 'week')  renderWeekView();
  else if (calView === 'month') renderMonthView();
  else                          renderYearView();
}

/* ============================================================
   TIME GRID — shared builder for Day and Week
   ============================================================ */
function buildTimeGrid(days) {
  // days = array of Date objects to show
  const today = new Date(); today.setHours(0,0,0,0);

  /* --- Header row --- */
  let headerHTML = '<div class="tg-header"><div class="tg-header-gutter"></div><div class="tg-header-days">';
  days.forEach(d => {
    const isToday = d.toDateString() === today.toDateString();
    headerHTML += `
      <div class="tg-head-day">
        <span class="tg-head-day-name">${DAYS_SHORT[d.getDay()]}</span>
        <div class="tg-head-day-num${isToday ? ' today' : ''}">${d.getDate()}</div>
      </div>`;
  });
  headerHTML += '</div></div>';

  /* --- Gutter (hour labels) --- */
  let gutterHTML = '<div class="tg-gutter">';
  for (let h = 0; h < 24; h++) {
    const top = h * PX_PER_HOUR;
    const label = h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    gutterHTML += `<div class="tg-hour-label" style="top:${top}px">${label}</div>`;
  }
  gutterHTML += '</div>';

  /* --- Day columns with events --- */
  let daysHTML = '<div class="tg-days">';
  days.forEach(d => {
    const ds = d.toISOString().split('T')[0];
    const dayEvs = (calEvents[ds] || []).filter(e => e.startMin !== undefined);

    // Layout: sort, assign columns to handle overlaps
    const sorted = [...dayEvs].sort((a, b) => a.startMin - b.startMin);
    const placed = [];
    sorted.forEach(ev => {
      let col = 0;
      while (placed.some(p => p.col === col && p.endMin > ev.startMin)) col++;
      const concurrent = placed.filter(p => p.endMin > ev.startMin);
      const totalCols  = Math.max(col + 1, ...concurrent.map(p => p.col + 1), 1);
      placed.push({ ...ev, col, totalCols });
    });
    // Second pass: recalc totalCols properly
    placed.forEach(ev => {
      const concurrent = placed.filter(p =>
        p !== ev && p.startMin < ev.endMin && p.endMin > ev.startMin
      );
      ev.totalCols = concurrent.length + 1;
    });

    daysHTML += '<div class="tg-day-col">';
    // Hour lines + half-hour dashes
    for (let h = 0; h < 24; h++) {
      daysHTML += `<div class="tg-hline" style="top:${h * PX_PER_HOUR}px"></div>`;
      daysHTML += `<div class="tg-hline half" style="top:${h * PX_PER_HOUR + PX_PER_HOUR / 2}px"></div>`;
    }
    // Now line
    const now = new Date();
    if (d.toDateString() === today.toDateString()) {
      const pct = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
      daysHTML += `<div class="tg-now" style="top:${pct * TOTAL_PX}px"></div>`;
    }
    // Events
    placed.forEach(ev => {
      const top    = (ev.startMin / 60) * PX_PER_HOUR;
      const height = Math.max(20, ((ev.endMin - ev.startMin) / 60) * PX_PER_HOUR - 2);
      const colW   = 100 / ev.totalCols;
      const left   = ev.col * colW;
      const c      = evColor(ev.colorIdx);
      const bg     = c + (isDarkMode() ? '28' : '1a');
      daysHTML += `
        <div class="ev-block" style="
          top:${top}px; height:${height}px;
          left:calc(${left}% + 2px); width:calc(${colW}% - 4px);
          background:${bg}; border-left-color:${c}; color:${c};">
          <div class="ev-name">${ev.name}</div>
          ${height > 30 ? `<div class="ev-time">${ev.timeStr}</div>` : ''}
        </div>`;
    });
    daysHTML += '</div>';
  });
  daysHTML += '</div>';

  const bodyHTML = `
    <div class="tg-scroll" id="tg-scroll">
      <div class="tg-body" style="height:${TOTAL_PX}px;">
        ${gutterHTML}
        ${daysHTML}
      </div>
    </div>`;

  return `<div class="tg-wrap">${headerHTML}${bodyHTML}</div>`;
}

/* ============================================================
   DAY VIEW
   ============================================================ */
function renderDayView() {
  const label = document.getElementById('cal-nav-label');
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = calDate.toDateString() === today.toDateString();
  label.textContent = `${DAYS_LONG[calDate.getDay()]}, ${MONTHS_SH[calDate.getMonth()]} ${calDate.getDate()}${isToday ? ' — Today' : ''}`;

  document.getElementById('cal-container').innerHTML = buildTimeGrid([new Date(calDate)]);
  scrollToHour(8);
}

/* ============================================================
   WEEK VIEW
   ============================================================ */
function renderWeekView() {
  const label = document.getElementById('cal-nav-label');
  // Week starts Sunday
  const weekStart = new Date(calDate);
  weekStart.setDate(calDate.getDate() - calDate.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  label.textContent = `${MONTHS_SH[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_SH[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  document.getElementById('cal-container').innerHTML = buildTimeGrid(days);
  scrollToHour(8);
}

function scrollToHour(h) {
  requestAnimationFrame(() => {
    const el = document.getElementById('tg-scroll');
    if (el) el.scrollTop = h * PX_PER_HOUR;
  });
}

/* ============================================================
   MONTH VIEW
   ============================================================ */
function renderMonthView() {
  const label = document.getElementById('cal-nav-label');
  const y = calDate.getFullYear(), m = calDate.getMonth();
  label.textContent = `${MONTHS[m]} ${y}`;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const pad = first.getDay(); // Sunday = 0

  let html = '<div class="month-wrap"><div class="month-grid">';
  DAYS_SHORT.forEach(d => html += `<div class="month-head">${d}</div>`);

  // Pad previous month
  const prevDays = new Date(y, m, 0).getDate();
  for (let i = pad - 1; i >= 0; i--) {
    html += `<div class="month-cell other-month"><div class="month-num">${prevDays - i}</div></div>`;
  }
  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(y, m, i);
    const ds = d.toISOString().split('T')[0];
    const isToday = d.toDateString() === today.toDateString();
    const evs = (calEvents[ds] || []).slice(0, 3);
    html += `<div class="month-cell${isToday ? ' today' : ''}">
      <div class="month-num">${i}</div>
      ${evs.map((e, idx) => `<div class="month-mini-ev" style="background:${evColor(e.colorIdx || idx)}">${e.name}</div>`).join('')}
    </div>`;
  }
  // Pad next month
  const cells = pad + daysInMonth;
  const trailing = (7 - (cells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    html += `<div class="month-cell other-month"><div class="month-num">${i}</div></div>`;
  }
  html += '</div></div>';
  document.getElementById('cal-container').innerHTML = html;
}

/* ============================================================
   YEAR VIEW
   ============================================================ */
function renderYearView() {
  const label = document.getElementById('cal-nav-label');
  const y = calDate.getFullYear();
  label.textContent = `${y}`;
  const today = new Date();

  let html = '<div class="year-wrap">';
  for (let mo = 0; mo < 12; mo++) {
    const first = new Date(y, mo, 1);
    const days = new Date(y, mo + 1, 0).getDate();
    const pad = first.getDay();
    html += `<div class="mini-month" onclick="calDate=new Date(${y},${mo},1);setView('month')">
      <div class="mini-month-title">${MONTHS_SH[mo]}</div>
      <div class="mini-month-grid">`;
    for (let p = 0; p < pad; p++) html += '<div class="mini-day"></div>';
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, mo, d);
      const ds = dt.toISOString().split('T')[0];
      const isToday = dt.toDateString() === today.toDateString();
      const hasEv = !!(calEvents[ds] && calEvents[ds].length);
      html += `<div class="mini-day${isToday ? ' today' : hasEv ? ' has-event' : ''}">${d}</div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  document.getElementById('cal-container').innerHTML = html;
}

/* ============================================================
   FETCH CALENDAR EVENTS
   ============================================================ */
async function fetchEventsForView() {
  let start, end;
  if (calView === 'day') {
    start = new Date(calDate); start.setHours(0, 0, 0, 0);
    end   = new Date(calDate); end.setHours(23, 59, 59, 999);
  } else if (calView === 'week') {
    start = new Date(calDate); start.setDate(calDate.getDate() - calDate.getDay()); start.setHours(0, 0, 0, 0);
    end   = new Date(start); end.setDate(start.getDate() + 7);
  } else if (calView === 'month') {
    start = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
    end   = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
  } else {
    start = new Date(calDate.getFullYear(), 0, 1);
    end   = new Date(calDate.getFullYear() + 1, 0, 1);
  }

  try {
    const data = await gFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}` +
      `&singleEvents=true&orderBy=startTime&maxResults=500`
    );

    (data.items || []).forEach(e => {
      const ds = (e.start.date || e.start.dateTime || '').split('T')[0];
      if (!ds) return;
      if (!calEvents[ds]) calEvents[ds] = [];

      const name = e.summary || '(no title)';
      if (!(name in colorMap)) { colorMap[name] = colorCounter % EV_COLORS.length; colorCounter++; }
      const colorIdx = colorMap[name];

      if (e.start.dateTime) {
        const st = new Date(e.start.dateTime);
        const et = new Date(e.end ? e.end.dateTime : e.start.dateTime);
        const startMin = st.getHours() * 60 + st.getMinutes();
        const endMin   = et.getHours() * 60 + et.getMinutes() || startMin + 60;
        const timeStr  = `${fmt12(st)} – ${fmt12(et)}`;
        // Avoid duplicates
        if (!calEvents[ds].some(x => x.name === name && x.startMin === startMin)) {
          calEvents[ds].push({ name, startMin, endMin, timeStr, colorIdx });
        }
      } else {
        // All-day
        if (!calEvents[ds].some(x => x.name === name && x.startMin === undefined)) {
          calEvents[ds].push({ name, colorIdx });
        }
      }
    });

    renderCalView();
  } catch (err) { console.error('Calendar fetch:', err); }
}

function fmt12(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* ============================================================
   DEADLINES — fetch & render
   ============================================================ */
function isExcluded(title) {
  if (!title) return true;
  const lower = title.toLowerCase();
  return excludeWords.some(w => w && lower.includes(w.toLowerCase()));
}
function isDeadlineKw(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return DEADLINE_KEYWORDS.some(k => lower.includes(k));
}

async function fetchAndSyncDeadlines() {
  const now    = new Date(); now.setHours(0, 0, 0, 0);
  const future = new Date(); future.setDate(future.getDate() + 90);
  try {
    const data = await gFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${now.toISOString()}&timeMax=${future.toISOString()}` +
      `&singleEvents=true&orderBy=startTime&maxResults=200`
    );
    const existing = new Set(deadlines.map(d => d.name.toLowerCase()));
    let added = 0;
    (data.items || []).forEach(e => {
      const title = e.summary || '';
      if (isExcluded(title) || !isDeadlineKw(title)) return;
      if (existing.has(title.toLowerCase())) return;
      const dateStr = (e.start.date || e.start.dateTime || '').split('T')[0];
      if (!dateStr) return;
      deadlines.push({ id: 'gcal_' + e.id, name: title, course: 'Google Calendar', date: dateStr, fromGcal: true });
      existing.add(title.toLowerCase());
      added++;
    });
    if (added > 0) { save('deadlines', deadlines); renderDeadlines(); }
  } catch (err) { console.error('Deadlines:', err); }
}

function renderDeadlines() {
  const list = document.getElementById('deadline-list');
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  if (!deadlines.length) { list.innerHTML = '<div class="empty-state">No upcoming deadlines</div>'; return; }
  const sorted = [...deadlines].sort((a, b) => new Date(a.date) - new Date(b.date));
  list.innerHTML = sorted.map(d => {
    const due  = new Date(d.date + 'T00:00:00');
    const diff = Math.round((due - now) / 86400000);
    const cls  = diff <= 2 ? 'urgent' : diff <= 7 ? 'soon' : 'ok';
    const lbl  = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
    const dStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div class="deadline-item ${cls}">
      <div style="flex:1;min-width:0;">
        <div class="deadline-name">${d.name}</div>
        <div class="deadline-course">${d.course}</div>
      </div>
      <div style="flex-shrink:0;">
        <div class="deadline-date ${cls}">${dStr}</div>
        <div class="deadline-days">${lbl}</div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   EXCLUDE TAGS
   ============================================================ */
function renderExcludeTags() {
  document.getElementById('exclude-tags').innerHTML = excludeWords.map((w, i) =>
    `<div class="tag">${w}<button class="tag-remove" onclick="removeExcludeTag(${i})">×</button></div>`
  ).join('');
}
function addExcludeTag() {
  const inp = document.getElementById('exclude-input');
  const v   = inp.value.trim().toLowerCase();
  if (!v || excludeWords.includes(v)) return;
  excludeWords.push(v); save('excludeWords', excludeWords); inp.value = ''; renderExcludeTags();
}
function removeExcludeTag(i) {
  excludeWords.splice(i, 1); save('excludeWords', excludeWords); renderExcludeTags();
}
function toggleSettings() {
  settingsOpen = !settingsOpen;
  document.getElementById('settings-panel').style.display = settingsOpen ? 'block' : 'none';
  if (settingsOpen) renderExcludeTags();
}

/* ============================================================
   DEADLINE MODAL
   ============================================================ */
function openDeadlineModal() {
  document.getElementById('deadline-modal').style.display = 'flex';
  const d = new Date(); d.setDate(d.getDate() + 7);
  document.getElementById('dl-date').value = d.toISOString().split('T')[0];
}
function closeDeadlineModal() { document.getElementById('deadline-modal').style.display = 'none'; }
function confirmDeadline() {
  const name = document.getElementById('dl-name').value.trim();
  const date = document.getElementById('dl-date').value;
  if (!name || !date) return;
  deadlines.push({ id: Date.now(), name, course: document.getElementById('dl-course').value.trim() || 'General', date });
  save('deadlines', deadlines); closeDeadlineModal(); renderDeadlines();
  document.getElementById('dl-name').value = '';
  document.getElementById('dl-course').value = '';
}
document.getElementById('deadline-modal').addEventListener('click', function(e) { if (e.target === this) closeDeadlineModal(); });

/* ============================================================
   GOOGLE TASKS
   ============================================================ */
async function fetchGoogleTasks() {
  try {
    const lists   = await gFetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10');
    const existing = new Set(tasks.filter(t => t.source === 'gtasks').map(t => t.gtaskId));
    let added = 0;
    for (const list of (lists.items || [])) {
      const data = await gFetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&maxResults=50`
      );
      (data.items || []).forEach(t => {
        if (existing.has(t.id)) return;
        tasks.push({ id: 'gt_' + t.id, gtaskId: t.id, text: t.title, type: 'gtasks', done: false, source: 'gtasks', listName: list.title });
        existing.add(t.id); added++;
      });
    }
    if (added > 0) { save('tasks', tasks); renderTasks(); }
  } catch (err) { console.error('Tasks:', err); }
}

/* ============================================================
   TASKS — render & actions
   ============================================================ */
function renderTasks() {
  const list     = document.getElementById('tasks-list');
  const filtered = currentFilter === 'all' ? tasks : tasks.filter(t => t.type === currentFilter);
  if (!filtered.length) { list.innerHTML = '<div class="empty-state">Nothing here — add something above</div>'; return; }
  const labels = { todo: 'To-do', assignment: 'Assignment', deadline: 'Deadline', gtasks: 'Google Tasks' };
  list.innerHTML = filtered.map(t => `
    <div class="task-item${t.done ? ' done' : ''}">
      <div class="task-check${t.done ? ' checked' : ''}" onclick="toggleTask('${t.id}')"></div>
      <span class="task-text">${t.text}</span>
      <span class="task-badge badge-${t.type}">${labels[t.type] || t.type}</span>
      ${t.source !== 'gtasks' ? `<button class="task-delete" onclick="deleteTask('${t.id}')">✕</button>` : ''}
    </div>`).join('');
}
function addTask() {
  const inp  = document.getElementById('task-input');
  const text = inp.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now(), text, type: document.getElementById('task-type').value, done: false });
  inp.value = ''; save('tasks', tasks); renderTasks();
}
function toggleTask(id) {
  tasks = tasks.map(t => String(t.id) === String(id) ? { ...t, done: !t.done } : t);
  save('tasks', tasks); renderTasks();
}
function deleteTask(id) {
  tasks = tasks.filter(t => String(t.id) !== String(id));
  save('tasks', tasks); renderTasks();
}
function filterTasks(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-tab').forEach(b =>
    b.classList.toggle('active', b.id === 'filter-' + f)
  );
  renderTasks();
}

/* ============================================================
   GOOGLE DRIVE
   ============================================================ */
function iconFor(mt) {
  if (mt === 'application/vnd.google-apps.folder')      return '📁';
  if (mt === 'application/pdf')                          return '📄';
  if (mt && mt.includes('image'))                        return '🖼';
  if (mt && (mt.includes('word') || mt.includes('document'))) return '📝';
  if (mt && (mt.includes('sheet') || mt.includes('spreadsheet'))) return '📊';
  if (mt && (mt.includes('presentation') || mt.includes('powerpoint'))) return '📑';
  return '📎';
}

async function loadDriveFolder(folderId) {
  const content = document.getElementById('drive-content');
  content.innerHTML = '<div class="empty-state" style="color:var(--accent2);">Loading files...</div>';
  updateDrivePath();
  try {
    const q    = folderId === 'root'
      ? `'root' in parents and trashed=false`
      : `'${folderId}' in parents and trashed=false`;
    const data = await gFetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
      `&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=60`
    );
    const files = data.files || [];
    document.getElementById('drive-back-btn').style.display = driveStack.length > 1 ? 'inline-flex' : 'none';
    document.getElementById('drive-status').textContent = `${files.length} item${files.length !== 1 ? 's' : ''}`;
    if (!files.length) { content.innerHTML = '<div class="empty-state">This folder is empty</div>'; return; }
    content.innerHTML = `<div class="drive-grid">${files.map(f => `
      <div class="drive-item" onclick="driveClick('${f.id}','${f.mimeType.replace(/'/g,"\\'")}','${encodeURIComponent(f.name)}')">
        <div style="font-size:22px;line-height:1;">${iconFor(f.mimeType)}</div>
        <div class="drive-item-name">${f.name}</div>
        <div class="drive-item-meta">${f.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : f.mimeType === 'application/pdf' ? 'PDF' : 'File'}</div>
      </div>`).join('')}</div>`;
  } catch (err) { content.innerHTML = '<div class="empty-state">Could not load Drive</div>'; console.error(err); }
}

function driveClick(id, mt, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (mt === 'application/vnd.google-apps.folder') { driveStack.push({ id, name }); loadDriveFolder(id); }
  else if (mt === 'application/pdf')                openPdfPreview(id, name);
  else window.open(`https://drive.google.com/file/d/${id}/view`, '_blank');
}
function driveGoBack() {
  if (driveStack.length <= 1) return;
  driveStack.pop(); loadDriveFolder(driveStack[driveStack.length - 1].id);
}
function updateDrivePath() {
  document.getElementById('drive-path').innerHTML = driveStack.map((item, i) => {
    if (i === driveStack.length - 1) return `<span class="drive-current">${item.name}</span>`;
    return `<span class="drive-crumb" onclick="driveJumpTo(${i})">${item.name}</span><span class="drive-sep">/</span>`;
  }).join('');
}
function driveJumpTo(idx) {
  driveStack = driveStack.slice(0, idx + 1); loadDriveFolder(driveStack[driveStack.length - 1].id);
}
function openPdfPreview(id, name) {
  document.getElementById('pdf-modal-title').textContent = name;
  document.getElementById('pdf-iframe').src = `https://drive.google.com/file/d/${id}/preview`;
  document.getElementById('pdf-open-link').href = `https://drive.google.com/file/d/${id}/view`;
  document.getElementById('pdf-modal').classList.add('open');
}
function closePdfModal() {
  document.getElementById('pdf-modal').classList.remove('open');
  document.getElementById('pdf-iframe').src = '';
}

/* ============================================================
   BOOT
   ============================================================ */
initTheme();
initHeader();
calDate = new Date();
renderCalView();
renderDeadlines();
renderTasks();

if (isTokenValid()) {
  updateGCalButton(true);
  fetchEventsForView();
  fetchAndSyncDeadlines();
  fetchGoogleTasks();
  loadDriveFolder('root');
}
