/**
 * config.js
 * Global constants, configuration, and shared utility objects.
 * Must be loaded first — all other modules depend on CONFIG, Storage, Toast, safeFetch, escapeHtml.
 */

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const CONFIG = {
  CLIENT_ID: '525270045169-ro6l87v50nn2ed2cufgdqub2qhodclfj.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.readonly'
  ].join(' '),
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
  CLASS_NAMES: [
    'ecriture et lit', 'ecologie et evo', 'chimie solution', 'mecanique',
    'bad. - base', 'calcul integral', 'cult. & litter.', 'bad.-base', 'ecologie', 'chimie'
  ],
  DEADLINE_KEYWORDS: [
    'exam', 'test', 'quiz', 'midterm', 'final', 'due', 'assignment',
    'submit', 'submission', 'deadline', 'essay', 'report', 'project',
    'homework', 'hw', 'examen', 'devoir', 'travail', 'remise', 'evaluation'
  ],
  STORAGE_KEYS: {
    TASKS:        'tasks',
    DEADLINES:    'deadlines',
    EXCLUDE_WORDS:'excludeWords',
    GCAL_TOKEN:   'gcal_token',
    GCAL_EXPIRY:  'gcal_expiry',
    THEME_MODE:   'themeMode',
    DARK_VARIANT: 'darkVariant',
    DRIVE_FILTERS:'driveTypeFilters'
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
// TOAST — ephemeral in-UI notifications
// ============================================================

const Toast = {
  show(msg, type) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = msg;
    t.style.cssText = [
      'background:var(--surface)',
      'border-left:3px solid var(--accent)',
      'padding:10px 16px',
      'margin-bottom:8px',
      'border-radius:8px',
      'box-shadow:var(--shadow)',
      'font-size:13px',
      'animation:slideIn 0.2s ease'
    ].join(';');
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  },
  error:   (m) => Toast.show(m, 'error'),
  success: (m) => Toast.show(m, 'success')
};

// ============================================================
// HELPERS
// ============================================================

const safeFetch = async (promise, fallback) => {
  try {
    return { data: await promise, error: null };
  } catch (err) {
    console.error(err);
    Toast.error(err.message || 'Operation failed');
    return { data: fallback || null, error: err };
  }
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[m]));
}

// Inject toast animation once at load time
(function injectToastStyles() {
  const s = document.createElement('style');
  s.textContent = [
    '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}',
    '.toast-error{border-left-color:var(--danger)!important}',
    '.toast-success{border-left-color:var(--accent2)!important}'
  ].join('');
  document.head.appendChild(s);
})();
