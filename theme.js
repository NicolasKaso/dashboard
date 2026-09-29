/**
 * theme.js
 * Light / dark mode management, including the "midnight" dark variant.
 * Depends on: config.js (Storage, CONFIG)
 */

// ============================================================
// THEME MODULE
// ============================================================

const Theme = {
  init() {
    this.apply(
      Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light'),
      Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic')
    );
  },

  apply(mode, variant) {
    const m = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', m);

    if (m === 'dark') {
      document.documentElement.setAttribute('data-dark-variant', variant || 'classic');
    } else {
      document.documentElement.removeAttribute('data-dark-variant');
    }

    Storage.save(CONFIG.STORAGE_KEYS.THEME_MODE, m);
    Storage.save(CONFIG.STORAGE_KEYS.DARK_VARIANT, variant);
    this.updateUI();
  },

  setMode(m) {
    this.apply(m, Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic'));
  },

  cycleVariant() {
    const variants = ['classic', 'midnight'];
    const current  = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic');
    const next     = variants[(Math.max(0, variants.indexOf(current)) + 1) % variants.length];
    this.apply(Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light'), next);
  },

  updateUI() {
    const m  = Storage.load(CONFIG.STORAGE_KEYS.THEME_MODE, 'light');
    const lb = document.getElementById('theme-light-btn');
    const db = document.getElementById('theme-dark-btn');
    if (lb) lb.classList.toggle('active', m !== 'dark');
    if (db) db.classList.toggle('active', m === 'dark');

    const vb = document.getElementById('dark-variant-btn');
    if (vb) {
      const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
      const variant = Storage.load(CONFIG.STORAGE_KEYS.DARK_VARIANT, 'classic');
      vb.style.display = isDark ? 'inline-flex' : 'none';
      vb.textContent   = variant === 'midnight' ? 'Midnight' : 'Classic';
    }
  },

  isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  },

  /** Return the appropriate event colour for the current theme. */
  evColor(idx) {
    const palette = this.isDark() ? CONFIG.EV_COLORS_DARK : CONFIG.EV_COLORS;
    return palette[idx % palette.length];
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.setThemeMode    = (m) => Theme.setMode(m);
window.cycleDarkVariant = () => Theme.cycleVariant();
