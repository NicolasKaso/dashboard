/**
 * pomodoro.js
 * Pomodoro timer with focus / short-break / long-break modes,
 * session tracking, and configurable durations.
 * Depends on: config.js, state.js
 */

// ============================================================
// POMODORO MODULE
// ============================================================

const Pomodoro = {
  // ---- State ----
  _timer:      null,
  _running:    false,
  _mode:       'focus',   // 'focus' | 'short' | 'long'
  _remaining:  25 * 60,
  _total:      25 * 60,
  _sessions:   0,         // completed focus sessions today
  _totalFocus: 0,         // total focus minutes today
  _settingsOpen: false,

  // Durations in minutes (user-configurable)
  _cfg: {
    focus: 25,
    short: 5,
    long:  15,
    sessionsUntilLong: 4
  },

  // ---- Init ----
  init() {
    // Load persisted stats (reset daily)
    const saved = Storage.load('pomodoro', null);
    const today = new Date().toDateString();
    if (saved && saved.date === today) {
      this._sessions   = saved.sessions   || 0;
      this._totalFocus = saved.totalFocus || 0;
    }
    const cfgSaved = Storage.load('pomodoro_cfg', null);
    if (cfgSaved) this._cfg = { ...this._cfg, ...cfgSaved };

    this._setMode('focus');
    this.render();
  },

  // ---- Mode switching ----
  _setMode(mode) {
    this._mode      = mode;
    this._running   = false;
    clearInterval(this._timer);
    const mins      = this._cfg[mode === 'short' ? 'short' : mode === 'long' ? 'long' : 'focus'];
    this._remaining = mins * 60;
    this._total     = this._remaining;
    this._updateRing();
    this._updatePlayBtn();
    this._updateLabel();
    this._updateTabs();
  },

  setMode(mode) {
    this._setMode(mode);
    this._renderTime();
  },

  // ---- Play / Pause ----
  toggle() {
    if (this._running) {
      clearInterval(this._timer);
      this._running = false;
      this._updatePlayBtn();
    } else {
      this._running = true;
      this._updatePlayBtn();
      this._timer = setInterval(() => this._tick(), 1000);
    }
  },

  _tick() {
    if (this._remaining <= 0) {
      this._finish();
      return;
    }
    this._remaining--;
    this._updateRing();
    this._renderTime();
    // Update page title
    document.title = this._fmtTime(this._remaining) + ' — ' +
      (this._mode === 'focus' ? 'Focus' : this._mode === 'short' ? 'Break' : 'Long Break');
  },

  _finish() {
    clearInterval(this._timer);
    this._running = false;

    if (this._mode === 'focus') {
      this._sessions++;
      this._totalFocus += this._cfg.focus;
      this._saveStats();
      this._renderSessions();
      this._renderStats();

      // Auto-suggest next mode
      const nextMode = (this._sessions % this._cfg.sessionsUntilLong === 0) ? 'long' : 'short';
      this._notify('Focus complete! Time for a ' + (nextMode === 'long' ? 'long break' : 'short break') + '.');
      this._pulseBtn();
      this._setMode(nextMode);
    } else {
      this._notify('Break over. Back to focus!');
      this._pulseBtn();
      this._setMode('focus');
    }

    this._renderTime();
    document.title = 'Nicolas Dashboard';
  },

  // ---- Reset ----
  reset() {
    clearInterval(this._timer);
    this._running = false;
    const mins    = this._cfg[this._mode === 'short' ? 'short' : this._mode === 'long' ? 'long' : 'focus'];
    this._remaining = mins * 60;
    this._total     = this._remaining;
    this._updateRing();
    this._updatePlayBtn();
    this._renderTime();
    document.title = 'Nicolas Dashboard';
  },

  // ---- Render helpers ----
  render() {
    this._renderTime();
    this._updateRing();
    this._updatePlayBtn();
    this._updateLabel();
    this._updateTabs();
    this._renderSessions();
    this._renderStats();
    this._renderSettingsValues();
  },

  _renderTime() {
    const el = document.getElementById('pomo-time');
    if (el) el.textContent = this._fmtTime(this._remaining);
  },

  _fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  },

  _updateRing() {
    const circle = document.getElementById('pomo-ring');
    if (!circle) return;
    const r   = 68;
    const circ = 2 * Math.PI * r;
    const pct  = this._total > 0 ? this._remaining / this._total : 1;
    circle.style.strokeDasharray  = circ;
    circle.style.strokeDashoffset = circ * (1 - pct);
    circle.className = 'pomo-progress' +
      (this._mode === 'short' ? ' break' : this._mode === 'long' ? ' long' : '');
  },

  _updatePlayBtn() {
    const btn = document.getElementById('pomo-play-btn');
    if (!btn) return;
    btn.textContent = this._running ? '⏸' : '▶';
    btn.className   = 'pomo-btn-main' +
      (this._mode === 'short' ? ' break' : this._mode === 'long' ? ' long' : '');
  },

  _updateLabel() {
    const el = document.getElementById('pomo-mode-label');
    if (el) el.textContent =
      this._mode === 'focus' ? 'Focus' :
      this._mode === 'short' ? 'Short Break' : 'Long Break';
  },

  _updateTabs() {
    document.querySelectorAll('.pomo-mode-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === this._mode);
    });
  },

  _renderSessions() {
    const wrap = document.getElementById('pomo-dots');
    if (!wrap) return;
    const total = this._cfg.sessionsUntilLong;
    const done  = this._sessions % total;
    wrap.innerHTML = Array.from({ length: total }, (_, i) =>
      '<div class="pomo-dot' + (i < done ? ' done' : '') + '"></div>'
    ).join('');
  },

  _renderStats() {
    const s = document.getElementById('pomo-stat-sessions');
    const f = document.getElementById('pomo-stat-focus');
    if (s) s.textContent = this._sessions;
    if (f) f.textContent = this._totalFocus + 'm';
  },

  _renderSettingsValues() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('pomo-cfg-focus', this._cfg.focus);
    set('pomo-cfg-short', this._cfg.short);
    set('pomo-cfg-long',  this._cfg.long);
    set('pomo-cfg-until', this._cfg.sessionsUntilLong);
  },

  // ---- Settings ----
  toggleSettings() {
    this._settingsOpen = !this._settingsOpen;
    document.getElementById('pomo-settings')?.classList.toggle('open', this._settingsOpen);
  },

  applySettings() {
    const getInt = (id, def) => parseInt(document.getElementById(id)?.value) || def;
    this._cfg.focus             = Math.max(1, Math.min(120, getInt('pomo-cfg-focus', 25)));
    this._cfg.short             = Math.max(1, Math.min(60,  getInt('pomo-cfg-short', 5)));
    this._cfg.long              = Math.max(1, Math.min(60,  getInt('pomo-cfg-long',  15)));
    this._cfg.sessionsUntilLong = Math.max(1, Math.min(10,  getInt('pomo-cfg-until', 4)));
    Storage.save('pomodoro_cfg', this._cfg);
    this._setMode(this._mode);
    this._renderTime();
    this._renderSessions();
    this._renderSettingsValues();
    this.toggleSettings();
  },

  // ---- Persistence ----
  _saveStats() {
    Storage.save('pomodoro', {
      date:       new Date().toDateString(),
      sessions:   this._sessions,
      totalFocus: this._totalFocus
    });
  },

  // ---- Notification / pulse ----
  _notify(msg) {
    Toast.show(msg, 'info');
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pomodoro', { body: msg, icon: '' });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification('Pomodoro', { body: msg });
      });
    }
  },

  _pulseBtn() {
    const btn = document.getElementById('pomo-play-btn');
    if (!btn) return;
    btn.classList.add('pulse');
    btn.addEventListener('animationend', () => btn.classList.remove('pulse'), { once: true });
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.pomoToggle         = () => Pomodoro.toggle();
window.pomoReset          = () => Pomodoro.reset();
window.pomoSetMode        = (m) => Pomodoro.setMode(m);
window.pomoToggleSettings = () => Pomodoro.toggleSettings();
window.pomoApplySettings  = () => Pomodoro.applySettings();
