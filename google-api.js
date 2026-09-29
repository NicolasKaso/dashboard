/**
 * google-api.js
 * OAuth2 implicit-flow authentication and base Google API fetch wrapper.
 * Depends on: config.js, state.js
 * Forward-references: Calendar, Deadlines, Tasks, Drive (resolved at call time)
 */

// ============================================================
// GOOGLE API MODULE
// ============================================================

const GoogleAPI = {
  isTokenValid() {
    const { accessToken, tokenExpiry } = AppState.get();
    return !!(accessToken && Date.now() < tokenExpiry);
  },

  /** Persist token + expiry to state and localStorage. */
  saveToken(token, expiry) {
    AppState.set({ accessToken: token, tokenExpiry: expiry });
    Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, token);
    Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, expiry);
  },

  /** Clear token, task-list cache, button state, and Drive panel. */
  clearToken() {
    AppState.set({
      accessToken:  null,
      tokenExpiry:  0,
      gTaskListIds: { todo: null, assignment: null, urgent: null }
    });
    Storage.save(CONFIG.STORAGE_KEYS.GCAL_TOKEN, null);
    Storage.save(CONFIG.STORAGE_KEYS.GCAL_EXPIRY, 0);
    this.updateButton(false);
  },

  /**
   * Authenticated GET wrapper. Throws on API-level errors.
   * Automatically clears the token on 401 and updates the connect button.
   */
  async fetch(url) {
    const res  = await fetch(url, {
      headers: { Authorization: 'Bearer ' + AppState.get().accessToken }
    });
    const data = await res.json();

    if (data.error) {
      if (data.error.code === 401) {
        this.clearToken();
        throw new Error('Session expired. Please reconnect.');
      }
      throw new Error(data.error.message);
    }

    return data;
  },

  /**
   * Authenticated POST returning parsed JSON.
   */
  async post(url, body) {
    return this._request('POST', url, body);
  },

  /**
   * Authenticated PATCH returning parsed JSON.
   */
  async patch(url, body) {
    return this._request('PATCH', url, body);
  },

  async _request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + AppState.get().accessToken,
        'Content-Type': 'application/json'
      },
      body:    body ? JSON.stringify(body) : undefined
    });
    return res.json();
  },

  /** Update the Connect/Connected button in the calendar card header. */
  updateButton(connected) {
    const btn = document.getElementById('gcal-btn');
    const lbl = document.getElementById('gcal-label');
    if (btn) btn.classList.toggle('connected', connected);
    if (lbl) lbl.textContent = connected
      ? 'Google Calendar connected'
      : 'Connect Google Calendar';
  },

  /**
   * Opens the Google OAuth2 popup.
   * If already connected, offers to disconnect instead.
   */
  async auth() {
    if (this.isTokenValid()) {
      if (!confirm('Disconnect Google Calendar?')) return;

      this.clearToken();
      Calendar.render();

      const dc = document.getElementById('drive-content');
      if (dc) dc.innerHTML =
        '<div class="empty-state">Connect Google Calendar above to browse your Drive</div>';
      return;
    }

    // Open OAuth2 popup
    const redirect = window.location.href.split('?')[0].split('#')[0];
    const params   = new URLSearchParams({
      client_id:    CONFIG.CLIENT_ID,
      redirect_uri: redirect,
      response_type:'token',
      scope:        CONFIG.SCOPES,
      prompt:       'select_account'
    });

    const popup = window.open(
      'https://accounts.google.com/o/oauth2/v2/auth?' + params,
      'gcal_auth',
      'width=500,height=620'
    );

    // Poll the popup until it lands on the redirect URI with an access_token fragment
    const poll = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url && url.includes('access_token')) {
          clearInterval(poll);
          popup.close();

          const hash   = new URLSearchParams(url.split('#')[1]);
          const token  = hash.get('access_token');
          const expiry = Date.now() + parseInt(hash.get('expires_in') || '3600') * 1000;

          this.saveToken(token, expiry);
          this.updateButton(true);
          Calendar.fetchEvents();
          Deadlines.fetchFromCalendar();
          Tasks.fetchFromGoogle();
          Drive.loadFolder('root');
        }
      } catch(e) { /* cross-origin — still polling */ }

      if (!popup || popup.closed) clearInterval(poll);
    }, 500);
  }
};

// ============================================================
// GLOBAL BINDING
// ============================================================

window.handleGCalAuth = () => GoogleAPI.auth();
