# Nicolas Dashboard

Personal productivity dashboard — Google Calendar, Tasks, and Drive in one tab.

---

## File structure

```
dashboard/
├── index.html          ← entry point (updated — references split files)
├── manifest.json       ← PWA manifest
│
├── css/
│   ├── tokens.css      ← CSS custom properties (light / dark / midnight)
│   ├── base.css        ← reset, layout, cards, buttons, fields, header
│   ├── calendar.css    ← all four calendar views + event blocks
│   ├── deadlines.css   ← deadline list + exclude-words panel
│   ├── tasks.css       ← task list, badges, urgent section, filter tabs
│   ├── drive.css       ← file grid, breadcrumb, filter dropdown
│   ├── modals.css      ← deadline modal, event modal, PDF viewer
│   └── midnight.css    ← midnight dark-variant overrides (loaded last)
│
└── js/
    ├── config.js       ← CONFIG constants, Storage, Toast, helpers
    ├── state.js        ← AppState reactive store
    ├── theme.js        ← light/dark/midnight mode management
    ├── google-api.js   ← OAuth2 auth + authenticated fetch wrapper
    ├── calendar.js     ← Calendar module (day/week/month/year views)
    ├── deadlines.js    ← Deadlines + ExcludeTags modules
    ├── tasks.js        ← Tasks module + Google Tasks sync
    ├── drive.js        ← Drive module (browse, filter, PDF preview)
    ├── modals.js       ← Event detail modal
    └── init.js         ← boot sequence (load last)
```

### Load order

CSS: `tokens → base → calendar → deadlines → tasks → drive → modals → midnight`

JS: `config → state → theme → google-api → calendar → deadlines → tasks → drive → modals → init`

---

## Suggested GitHub branch layout

| Branch | Contains | Purpose |
|--------|----------|---------|
| `main` | Everything | Stable, working build |
| `feature/calendar` | `js/calendar.js`, `css/calendar.css` | Calendar view work |
| `feature/tasks` | `js/tasks.js`, `css/tasks.css` | Task / Google Tasks work |
| `feature/deadlines` | `js/deadlines.js`, `css/deadlines.css` | Deadline detection work |
| `feature/drive` | `js/drive.js`, `css/drive.css` | Drive browser work |
| `feature/theme` | `js/theme.js`, `css/tokens.css`, `css/midnight.css` | Theme / dark mode work |
| `feature/core` | `js/config.js`, `js/state.js`, `js/google-api.js`, `js/init.js` | Shared infrastructure |

> Each feature branch only needs to touch its own files + `index.html` when adding a new `<script>` or `<link>`.

---

## Getting started

No build step required — open `index.html` directly in a browser, or serve with any static server:

```bash
npx serve .
# or
python3 -m http.server
```

The Google OAuth2 popup requires the page to be served from the exact redirect URI registered in the Google Cloud Console (`CLIENT_ID` in `config.js`).
