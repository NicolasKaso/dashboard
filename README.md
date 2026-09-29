# Nicolas Dashboard

Personal productivity dashboard — Google Calendar, Tasks, Drive, and a Pomodoro timer in one tab, with an AI assistant for calendar management.

---

## File structure

```
dashboard/
├── index.html          ← entry point (all markup: layout, cards, modals, AI panel)
├── manifest.json       ← PWA manifest
│
├── CSS/
│   ├── tokens.css      ← CSS custom properties (light / dark / midnight)
│   ├── base.css        ← reset, layout, cards, buttons, fields, header, toasts
│   ├── pomodoro.css    ← timer card: ring, controls, stats, settings
│   ├── calendar.css    ← all four calendar views + event blocks
│   ├── tasks.css       ← task list, badges, urgent section, filter tabs
│   ├── deadlines.css   ← deadline list + exclude-words panel
│   ├── drive.css       ← file grid, breadcrumb, filter dropdown
│   ├── modals.css      ← deadline modal, event modal, PDF viewer
│   ├── ai-assistant.css← AI sidebar panel, chat bubbles, attachments
│   └── midnight.css    ← midnight dark-variant overrides (loaded last)
│
└── JavaScript/
    ├── config.js       ← CONFIG constants (incl. AI + API endpoints), Storage, Toast, helpers
    ├── state.js        ← AppState reactive store
    ├── theme.js        ← light/dark/midnight mode management
    ├── google-api.js   ← OAuth2 auth + authenticated fetch/post/patch wrapper
    ├── pomodoro.js     ← Pomodoro timer module
    ├── calendar.js     ← Calendar module (day/week/month/year views)
    ├── tasks.js        ← Tasks module + GTaskClient (Google Tasks sync)
    ├── deadlines.js    ← Deadlines + ExcludeTags modules
    ├── drive.js        ← Drive module (browse, filter, PDF preview)
    ├── modals.js       ← Event detail modal
    ├── ai-assistant.js ← Groq-powered AI calendar assistant
    └── init.js         ← boot sequence (load last)
```

### Load order

CSS: `tokens → base → pomodoro → calendar → tasks → deadlines → drive → modals → ai-assistant → midnight`

JS: `config → state → theme → google-api → pomodoro → calendar → tasks → deadlines → drive → modals → ai-assistant → init`

### Architecture notes

- **No build step, no framework** — plain ES5-compatible JS with an IIFE-free global-module pattern. Each file defines one module object (`Calendar`, `Tasks`, `Drive`, …) and binds its `window.*` handlers at the bottom of the file.
- **Shared utilities live in `config.js`**: `Storage` (localStorage wrapper), `Toast`, `safeFetch`, `escapeHtml`, `localDateKey`.
- **Google API access is centralized** in `google-api.js` (`fetch`/`post`/`patch` with automatic 401 handling). Feature modules never build auth headers themselves — except the Drive browser and AI tools, which use the token directly for streaming/preview endpoints.
- **State flows one way**: UI events → module method → `AppState.set()` → module re-render. Persistence goes through `Storage.save` right after `AppState.set`.
- **Event data reaches modals via `data-ev` attributes** (JSON in a `data-` attribute), avoiding string-escaping problems in inline `onclick` handlers.

---

## Getting started

No build step required — open `index.html` directly in a browser, or serve with any static server:

```bash
python3 -m http.server
# or
npx serve .
```

### Google OAuth2

The OAuth popup requires the page to be served from the exact redirect URI registered in the Google Cloud Console (`CLIENT_ID` in `JavaScript/config.js`). If Google rejects the redirect, the registered URI likely points to a different path or port.

### AI assistant

Uses the Groq API (OpenAI-compatible, `llama-3.3-70b-versatile`) with tools for creating, listing, and deleting calendar events, plus bulk CSV/image schedule import. The key lives in `CONFIG.AI` in `JavaScript/config.js` — it's client-side by design for this personal dashboard; rotate it if it ever leaks.
