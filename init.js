/**
 * init.js
 * Application bootstrap — must be loaded last.
 * Wires up header, event listeners, polling, and calls initial renders.
 * Depends on: all other modules.
 */

// ============================================================
// HEADER
// ============================================================

function initHeader() {
  const now = new Date();
  const h   = now.getHours();

  const g = document.getElementById('greeting-word');
  const d = document.getElementById('header-date');

  if (g) g.textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  if (d) d.textContent =
    CONFIG.DAYS_SHORT[now.getDay()] + ', ' +
    CONFIG.MONTHS[now.getMonth()] + ' ' +
    now.getDate() + ', ' +
    now.getFullYear();
}

// ============================================================
// BOOT SEQUENCE
// ============================================================

Theme.init();
initHeader();
AppState.set({ calDate: new Date() });

Calendar.render();
Deadlines.render();
Tasks.render();
Drive.syncFilterButtons();

// If a valid token is already stored, kick off data fetches immediately
if (GoogleAPI.isTokenValid()) {
  GoogleAPI.updateButton(true);
  Calendar.fetchEvents();
  Deadlines.fetchFromCalendar();
  Tasks.fetchFromGoogle();
  Drive.loadFolder('root');
}

// ============================================================
// BACKGROUND SYNC
// ============================================================

// Re-sync tasks when the tab regains focus
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && GoogleAPI.isTokenValid()) {
    Tasks.fetchFromGoogle();
  }
});

// Polling every 60 s
setInterval(() => {
  if (GoogleAPI.isTokenValid()) Tasks.fetchFromGoogle();
}, 60_000);

// ============================================================
// MODAL BACKDROP CLOSE
// ============================================================

document.getElementById('deadline-modal')?.addEventListener('click', function(e) {
  if (e.target === this) Deadlines.closeModal();
});

document.getElementById('event-modal')?.addEventListener('click', function(e) {
  if (e.target === this) closeEventModal();
});

// Close Drive "More" dropdown when clicking outside it
document.addEventListener('click', function(e) {
  const mw = document.querySelector('.drive-filter-extra');
  if (mw && !mw.contains(e.target)) Drive.closeMoreMenu();
});
