/**
 * state.js
 * Central reactive state store for the dashboard.
 * Depends on: config.js (Storage, CONFIG)
 */

// ============================================================
// APP STATE
// ============================================================

const AppState = {
  data: {
    // Persisted
    tasks: Storage.load(CONFIG.STORAGE_KEYS.TASKS, [
      { id: 1, text: 'Review lecture slides', type: 'todo', done: false, urgent: false }
    ]),
    deadlines:    Storage.load(CONFIG.STORAGE_KEYS.DEADLINES, []),
    excludeWords: Storage.load(CONFIG.STORAGE_KEYS.EXCLUDE_WORDS, [...CONFIG.CLASS_NAMES]),
    accessToken:  Storage.load(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null),
    tokenExpiry:  Storage.load(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0),
    driveTypeFilters: Storage.load(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, {
      folder: true, pdf: true, doc: true,
      image: true, sheet: true, slides: true, other: true
    }),

    // Session-only
    gcalDeadlines:  [],
    currentFilter:  'all',
    calView:        'week',
    calDate:        new Date(),
    calEvents:      {},
    colorMap:       {},
    colorCounter:   0,
    driveStack:     [{ id: 'root', name: 'My Drive' }],
    driveFiles:     [],
    driveMoreMenuOpen: false,
    settingsOpen:   false,
    gTaskListIds:   { todo: null, assignment: null, urgent: null }
  },

  listeners: [],

  get()  { return this.data; },

  set(updates) {
    Object.assign(this.data, updates);
    this.notify();
  },

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach(l => l(this.data));
  }
};
