// Toolbar: search input, folder select, age select, reset link.
// Owns its DOM but not the filter state — calls back to main.js on change.

import {
  AGE_BUCKETS,
  STATUS_BUCKETS,
  getFolderOptions,
  isAnyFilterActive,
} from '../filters.js';

const els = {
  search: () => document.getElementById('filter-search'),
  folder: () => document.getElementById('filter-folder'),
  age: () => document.getElementById('filter-age'),
  status: () => document.getElementById('filter-status'),
  reset: () => document.getElementById('filter-reset'),
};

/**
 * @param {{
 *   getFilters: () => {search:string, folder:string, age:string},
 *   setFilters: (next: {search:string, folder:string, age:string}) => void,
 *   getBookmarks: () => Array<Object>
 * }} opts
 */
export function initToolbar(opts) {
  const { getFilters, setFilters, getBookmarks } = opts;

  // Age and Status dropdowns are static — populate once.
  const ageEl = els.age();
  ageEl.innerHTML = AGE_BUCKETS.map(
    (b) => `<option value="${escapeAttr(b.value)}">${escapeText(b.label)}</option>`
  ).join('');
  const statusEl = els.status();
  statusEl.innerHTML = STATUS_BUCKETS.map(
    (b) => `<option value="${escapeAttr(b.value)}">${escapeText(b.label)}</option>`
  ).join('');

  populateFolderOptions(getBookmarks());

  // Wire events.
  let searchTimer = 0;
  els.search().addEventListener('input', (e) => {
    const value = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setFilters({ ...getFilters(), search: value });
    }, 150);
  });

  els.folder().addEventListener('change', (e) => {
    setFilters({ ...getFilters(), folder: e.target.value });
  });

  els.age().addEventListener('change', (e) => {
    setFilters({ ...getFilters(), age: e.target.value });
  });

  els.status().addEventListener('change', (e) => {
    setFilters({ ...getFilters(), status: e.target.value });
  });

  els.reset().addEventListener('click', (e) => {
    e.preventDefault();
    els.search().value = '';
    els.folder().value = '';
    els.age().value = '';
    els.status().value = '';
    setFilters({ search: '', folder: '', age: '', status: '' });
  });

  // Initial sync of the reset link visibility.
  syncResetVisibility(getFilters());
}

/**
 * Rebuild the folder dropdown from the current bookmarks list. Call this on
 * load and after deletions (step 3) so the available options stay in sync.
 */
export function populateFolderOptions(bookmarks) {
  const sel = els.folder();
  if (!sel) return;
  const previous = sel.value;
  const groups = getFolderOptions(bookmarks);

  let html = '<option value="">All folders</option>';
  for (const g of groups) {
    html += `<optgroup label="${escapeAttr(g.section)}">`;
    for (const o of g.options) {
      html += `<option value="${escapeAttr(o.value)}">${escapeText(o.label)} (${o.count.toLocaleString()})</option>`;
    }
    html += '</optgroup>';
  }
  sel.innerHTML = html;

  // Restore previous selection if it still exists; otherwise drop to "All".
  const stillExists = Array.from(sel.options).some((o) => o.value === previous);
  sel.value = stillExists ? previous : '';
}

/**
 * Show or hide the reset link based on whether any filter is active.
 */
export function syncResetVisibility(filters) {
  const r = els.reset();
  if (!r) return;
  r.hidden = !isAnyFilterActive(filters);
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
