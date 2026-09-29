/**
 * config.js
 * Global constants, configuration, and shared utility objects.
 * Must be loaded first — all other modules depend on CONFIG, Storage, Toast, safeFetch, escapeHtml.
 */

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const CONFIG = {
  // Google OAuth2 (implicit flow). Redirect URI must be registered in Google Cloud Console.
  CLIENT_ID: '525270045169-ro6l87v50nn2ed2cufgdqub2qhodclfj.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.readonly'
  ].join(' '),

  // Groq (OpenAI-compatible) — powers the AI calendar assistant.
  // NOTE: key is client-side by design for this personal dashboard; rotate if it leaks.
  AI: {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    API_KEY: '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',
    MODEL:   'llama-3.3-70b-versatile',
    MAX_TOKENS: 1024,
    MAX_TOOL_ITERATIONS: 8
  },

  // Google API endpoints
  API: {
    CALENDAR_EVENTS: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    TASKS_LISTS:     'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    TASKS_TASKS:     'https://tasks.googleapis.com/tasks/v1/lists/',
    DRIVE_FILES:     'https://www.googleapis.com/drive/v3/files'
  },

  // Calendar rendering
  PX_PER_HOUR: 64,
  DAYS_LONG:  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  DAYS_SHORT: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  MONTHS: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],
  MONTHS_SH: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  EV_COLORS: [
    '#2563a8', '#2e7d52', '#c2692a', '#7c3abf',
    '#b06820', '#c0392b', '#1e8a99', '#5a7a2e'
  ],
  EV_COLORS_DARK: [
    '#5a9de8', '#3db870', '#e8854a', '#a06de0',
    '#e0a040', '#e05555', '#3abccc', '#8ab840'
  ],

  // Deadlines
  CLASS_NAMES: [
    'ecriture et lit', 'ecologie et evo', 'chimie solution', 'mecanique',
    'bad. - base', 'calcul integral', 'cult. & litter.', 'bad.-base', 'ecologie', 'chimie'
  ],
  DEADLINE_KEYWORDS: [
    'exam', 'test', 'quiz', 'midterm', 'final', 'due', 'assignment',
    'submit', 'submission', 'deadline', 'essay', 'report', 'project',
    'homework', 'hw', 'examen', 'devoir', 'travail', 'remise', 'evaluation'
  ],

  // Pomodoro
  POMODORO_DEFAULTS: { focus: 25, short: 5, long: 15, sessionsUntilLong: 4 },

  STORAGE_KEYS: {
    TASKS:         'tasks',
    DEADLINES:     'deadlines',
    EXCLUDE_WORDS: 'excludeWords',
    GCAL_TOKEN:    'gcal_token',
    GCAL_EXPIRY:   'gcal_expiry',
    THEME_MODE:    'themeMode',
    DARK_VARIANT:  'darkVariant',
    DRIVE_FILTERS: 'driveTypeFilters',
    POMODORO:      'pomodoro',
    POMODORO_CFG:  'pomodoro_cfg'
  }
};

// ============================================================
// STORAGE — thin localStorage wrapper
// ============================================================

const Storage = {
  save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  },
  load(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch(e) { return def; }
  }
};

// ============================================================
// TOAST — ephemeral in-UI notifications (styles live in base.css)
// ============================================================

const Toast = {
  show(msg, type) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  },
  error:   (m) => Toast.show(m, 'error'),
  success: (m) => Toast.show(m, 'success')
};

// ============================================================
// HELPERS
// ============================================================

/** Await a promise, returning { data, error } and toasting on failure. */
const safeFetch = async (promise, fallback) => {
  try {
    return { data: await promise, error: null };
  } catch (err) {
    console.error(err);
    Toast.error(err.message || 'Operation failed');
    return { data: fallback || null, error: err };
  }
};

/** Escape a string for safe interpolation into innerHTML. */
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[m]));
}

/** Format a Date as YYYY-MM-DD in LOCAL timezone (avoids UTC offset shift). */
function localDateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
