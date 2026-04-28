/**
 * drive.js
 * Google Drive browser: folder navigation, file type filtering,
 * breadcrumb trail, and in-app PDF preview.
 * Depends on: config.js, state.js, google-api.js
 */

// ============================================================
// DRIVE MODULE
// ============================================================

const Drive = {
  // Stored so click handlers can look up by id
  _fileMap: {},

  // --------------------------------------------------------
  // File type helpers
  // --------------------------------------------------------

  iconFor(mt) {
    if (mt === 'application/vnd.google-apps.folder')       return '📁';
    if (mt === 'application/pdf')                          return '📄';
    if (mt?.includes('image'))                              return '🖼';
    if (mt?.includes('word') || mt === 'application/vnd.google-apps.document')    return '📝';
    if (mt?.includes('sheet') || mt === 'application/vnd.google-apps.spreadsheet') return '📊';
    if (mt?.includes('presentation') || mt === 'application/vnd.google-apps.presentation') return '📑';
    return '📎';
  },

  fileType(mt) {
    if (mt === 'application/vnd.google-apps.folder')       return 'folder';
    if (mt === 'application/pdf')                          return 'pdf';
    if (mt?.includes('image'))                              return 'image';
    if (mt?.includes('word') || mt === 'application/vnd.google-apps.document')    return 'doc';
    if (mt?.includes('sheet') || mt === 'application/vnd.google-apps.spreadsheet') return 'sheet';
    if (mt?.includes('presentation') || mt === 'application/vnd.google-apps.presentation') return 'slides';
    return 'other';
  },

  /** Return the correct Google URL for opening a file based on its mimeType. */
  openUrl(id, mt) {
    if (mt === 'application/vnd.google-apps.document')     return 'https://docs.google.com/document/d/' + id + '/edit';
    if (mt === 'application/vnd.google-apps.spreadsheet')  return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
    if (mt === 'application/vnd.google-apps.presentation') return 'https://docs.google.com/presentation/d/' + id + '/edit';
    if (mt === 'application/vnd.google-apps.form')         return 'https://docs.google.com/forms/d/' + id + '/edit';
    return 'https://drive.google.com/file/d/' + id + '/view';
  },

  // --------------------------------------------------------
  // Folder navigation
  // --------------------------------------------------------

  async loadFolder(folderId) {
    if (!GoogleAPI.isTokenValid()) return;

    const content = document.getElementById('drive-content');
    if (content) content.innerHTML = '<div class="empty-state">Loading files...</div>';
    this.updatePath();

    const q = folderId === 'root'
      ? "'root' in parents and trashed=false"
      : "'" + folderId + "' in parents and trashed=false";

    const { data, error } = await safeFetch(GoogleAPI.fetch(
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent(q) +
      '&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=100'
    ));
    if (error) return;

    const files = data?.files || [];
    AppState.set({ driveFiles: files });

    // Build id→file map for safe click lookup
    this._fileMap = {};
    files.forEach(f => { this._fileMap[f.id] = f; });

    const bb = document.getElementById('drive-back-btn');
    if (bb) bb.style.display = AppState.get().driveStack.length > 1 ? 'inline-flex' : 'none';

    if (!files.length && content) {
      content.innerHTML = '<div class="empty-state">This folder is empty</div>';
    } else {
      this.render();
    }
  },

  // --------------------------------------------------------
  // Render file grid
  // --------------------------------------------------------

  render() {
    const state    = AppState.get();
    const content  = document.getElementById('drive-content');
    const filtered = state.driveFiles.filter(f => !!state.driveTypeFilters[this.fileType(f.mimeType)]);

    const status = document.getElementById('drive-status');
    if (status) {
      status.textContent = filtered.length + ' of ' + state.driveFiles.length +
        ' item' + (state.driveFiles.length !== 1 ? 's' : '');
    }

    if (!filtered.length && content) {
      content.innerHTML = '<div class="empty-state">No files match this filter</div>';
      return;
    }

    const typeLabel = {
      folder: 'Folder', pdf: 'PDF', image: 'Image',
      doc: 'Document', sheet: 'Spreadsheet', slides: 'Slides', other: 'File'
    };

    if (content) {
      // Use data-id attribute to avoid any mimeType/name escaping issues in onclick
      content.innerHTML = '<div class="drive-grid">' +
        filtered.map(f =>
          '<div class="drive-item" data-id="' + escapeHtml(f.id) + '" onclick="window.driveClick(this.dataset.id)">' +
          '<div style="font-size:22px;">' + this.iconFor(f.mimeType) + '</div>' +
          '<div class="drive-item-name">' + escapeHtml(f.name) + '</div>' +
          '<div class="drive-item-meta">' + typeLabel[this.fileType(f.mimeType)] + '</div>' +
          '</div>'
        ).join('') +
        '</div>';
    }
  },

  click(id) {
    const f = this._fileMap[id];
    if (!f) return;
    const { id: fid, mimeType: mt, name } = f;

    if (mt === 'application/vnd.google-apps.folder') {
      AppState.set({ driveStack: [...AppState.get().driveStack, { id: fid, name }] });
      this.loadFolder(fid);
    } else if (mt === 'application/pdf') {
      this.openPdf(fid, name);
    } else {
      window.open(this.openUrl(fid, mt), '_blank');
    }
  },

  goBack() {
    const stack = AppState.get().driveStack;
    if (stack.length <= 1) return;
    const ns = stack.slice(0, -1);
    AppState.set({ driveStack: ns });
    this.loadFolder(ns[ns.length - 1].id);
  },

  jumpTo(idx) {
    const ns = AppState.get().driveStack.slice(0, idx + 1);
    AppState.set({ driveStack: ns });
    this.loadFolder(ns[ns.length - 1].id);
  },

  // --------------------------------------------------------
  // Breadcrumb path
  // --------------------------------------------------------

  updatePath() {
    const el = document.getElementById('drive-path');
    if (!el) return;
    const stack = AppState.get().driveStack;
    el.innerHTML = stack.map((item, i) => {
      if (i === stack.length - 1) {
        return '<span class="drive-current">' + escapeHtml(item.name) + '</span>';
      }
      return '<span class="drive-crumb" onclick="window.driveJumpTo(' + i + ')">' +
        escapeHtml(item.name) + '</span><span class="drive-sep">/</span>';
    }).join('');
  },

  // --------------------------------------------------------
  // PDF preview modal
  // --------------------------------------------------------

  openPdf(id, name) {
    const t = document.getElementById('pdf-modal-title');
    const f = document.getElementById('pdf-iframe');
    const l = document.getElementById('pdf-open-link');
    if (t) t.textContent = name;
    // Use Drive preview embed — works for files shared with the authed user
    if (f) f.src = 'https://drive.google.com/file/d/' + id + '/preview';
    if (l) l.href = 'https://drive.google.com/file/d/' + id + '/view';
    document.getElementById('pdf-modal')?.classList.add('open');
  },

  closePdf() {
    document.getElementById('pdf-modal')?.classList.remove('open');
    const f = document.getElementById('pdf-iframe');
    if (f) f.src = '';
  },

  // --------------------------------------------------------
  // Filter buttons
  // --------------------------------------------------------

  toggleFilter(type) {
    const filters = { ...AppState.get().driveTypeFilters };
    filters[type] = !filters[type];
    if (!Object.values(filters).some(Boolean)) filters[type] = true;
    AppState.set({ driveTypeFilters: filters });
    Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters);
    this.syncFilterButtons();
    this.render();
  },

  setAllFilters(on) {
    const f = {
      folder: on, pdf: on, doc: on,
      image:  on, sheet: on, slides: on, other: on
    };
    AppState.set({ driveTypeFilters: f });
    Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, f);
    this.syncFilterButtons();
    this.render();
  },

  toggleHiddenType(type, on) {
    const filters = { ...AppState.get().driveTypeFilters };
    filters[type] = !!on;
    if (!Object.values(filters).some(Boolean)) filters[type] = true;
    AppState.set({ driveTypeFilters: filters });
    Storage.save(CONFIG.STORAGE_KEYS.DRIVE_FILTERS, filters);
    this.syncFilterButtons();
    this.render();
  },

  syncFilterButtons() {
    const filters = AppState.get().driveTypeFilters;
    const allOn   = Object.values(filters).every(Boolean);
    document.querySelectorAll('.drive-filter-tab').forEach(btn => {
      const f = btn.dataset.filter;
      btn.classList.toggle('active', f === 'all' ? allOn : !!filters[f]);
    });
    const ot = document.getElementById('drive-filter-other');
    if (ot) ot.checked = !!filters.other;
  },

  // --------------------------------------------------------
  // "More" dropdown
  // --------------------------------------------------------

  toggleMoreMenu() {
    const open = !AppState.get().driveMoreMenuOpen;
    AppState.set({ driveMoreMenuOpen: open });
    document.getElementById('drive-filter-menu')?.classList.toggle('open', open);
  },

  closeMoreMenu() {
    AppState.set({ driveMoreMenuOpen: false });
    document.getElementById('drive-filter-menu')?.classList.remove('open');
  }
};

// ============================================================
// GLOBAL BINDINGS
// ============================================================

window.driveGoBack           = () => Drive.goBack();
window.driveClick            = (id) => Drive.click(id);   // now takes only id
window.driveJumpTo           = (i) => Drive.jumpTo(i);
window.toggleDriveFilter     = (t) => Drive.toggleFilter(t);
window.setAllDriveFilters    = (on) => Drive.setAllFilters(on);
window.toggleHiddenDriveType = (t, on) => Drive.toggleHiddenType(t, on);
window.toggleDriveMoreMenu   = () => Drive.toggleMoreMenu();
window.closeDriveMoreMenu    = () => Drive.closeMoreMenu();
window.closePdfModal         = () => Drive.closePdf();
