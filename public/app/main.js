// Boot + glue.
//
// State lives in store.js; this file wires DOM events to store mutations and
// re-renders on every change via store.subscribe.

import { parseBookmarks } from './parser.js';
import { applyFilters, addDateMs } from './filters.js';
import * as store from './store.js';
import { setupConfirmButton } from './confirm.js';
import { renderTable } from './ui/table.js';
import {
  initToolbar,
  populateFolderOptions,
  syncResetVisibility,
} from './ui/toolbar.js';
import { renderStats } from './ui/stats.js';
import { showToast } from './ui/toast.js';
import { downloadExport } from './exporter.js';
import { checkLinks } from './linkcheck-client.js';
import { updateRowStatus } from './ui/table.js';

const els = {
  dropState: () => document.getElementById('drop-state'),
  tableState: () => document.getElementById('table-state'),
  dropZone: () => document.getElementById('drop-zone'),
  fileInput: () => document.getElementById('file-input'),
  parseError: () => document.getElementById('parse-error'),
  actions: () => document.getElementById('actions-row'),
  headerCheck: () => document.getElementById('header-check'),
  selectAllShown: () => document.getElementById('select-all-shown'),
  deselectAll: () => document.getElementById('deselect-all'),
  deleteSelected: () => document.getElementById('delete-selected'),
  deleteFiltered: () => document.getElementById('delete-filtered'),
  undo: () => document.getElementById('undo'),
  exportBtn: () => document.getElementById('export'),
  cutoffGroup: () => document.getElementById('cutoff-group'),
  cutoffYear: () => document.getElementById('cutoff-year'),
  deletePreYear: () => document.getElementById('delete-pre-year'),
  checkLinksBtn: () => document.getElementById('check-links'),
  cancelCheckBtn: () => document.getElementById('cancel-check'),
  checkProgress: () => document.getElementById('check-progress'),
  checkProgressText: () => document.getElementById('check-progress-text'),
  checkProgressFill: () => document.getElementById('check-progress-fill'),
  dropDeadBtn: () => document.getElementById('drop-dead'),
};

let activeCheck = null; // AbortController while a check is in flight

let toolbarReady = false;
let actionsReady = false;

function init() {
  const dz = els.dropZone();
  const input = els.fileInput();

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.add('drop-zone--dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('drop-zone--dragover');
    })
  );
  dz.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      showError('Drop one HTML file at a time.');
      return;
    }
    loadFile(files[0]);
  });

  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    input.value = '';
  });

  // Re-render on every state change.
  store.subscribe(render);
}

async function loadFile(file) {
  hideError();
  if (!file.name.match(/\.html?$/i) && file.type !== 'text/html') {
    showError(
      `That doesn't look like an HTML file (got "${file.name}"). Export bookmarks from your browser and try again.`
    );
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch (err) {
    showError(`Couldn't read the file: ${err?.message || err}`);
    return;
  }

  let parsed;
  try {
    parsed = parseBookmarks(text);
  } catch (err) {
    showError(err?.message || String(err));
    return;
  }

  if (parsed.length === 0) {
    showError(
      "Parsed the file, but found 0 bookmarks. Is this really a browser bookmarks export?"
    );
    return;
  }

  store.loadBookmarks(parsed);
  showTable();
  showToast(`Loaded ${parsed.length.toLocaleString()} bookmarks`);
}

function showTable() {
  els.dropState().hidden = true;
  els.tableState().hidden = false;
  els.actions().hidden = false;

  if (!toolbarReady) {
    initToolbar({
      getFilters: () => store.getFilters(),
      setFilters: (next) => store.setFilters(next),
      getBookmarks: () => store.getBookmarks(),
    });
    toolbarReady = true;
  }

  if (!actionsReady) {
    wireActions();
    actionsReady = true;
  }
}

/**
 * Wire the action row buttons. Bulk-delete buttons use the inline confirm;
 * other buttons are direct.
 */
function wireActions() {
  els.selectAllShown().addEventListener('click', () => {
    const visible = visibleBookmarks();
    if (visible.length === 0) return;
    store.selectIds(visible.map((b) => b._id));
  });

  els.deselectAll().addEventListener('click', () => {
    store.deselectAll();
  });

  setupConfirmButton(
    els.deleteSelected(),
    'Delete selected',
    'Are you sure? Click again',
    () => {
      const sel = store.getSelected();
      if (sel.size === 0) {
        showToast('Nothing selected');
        return;
      }
      const removed = store.deleteByIds(Array.from(sel));
      if (removed > 0) showToast(deletedToast(removed));
    }
  );

  setupConfirmButton(
    els.deleteFiltered(),
    'Delete all filtered',
    'Delete all visible? Click again',
    () => {
      const visible = visibleBookmarks();
      if (visible.length === 0) {
        showToast('Nothing to delete');
        return;
      }
      const removed = store.deleteByIds(visible.map((b) => b._id));
      if (removed > 0) showToast(deletedToast(removed));
    }
  );

  els.undo().addEventListener('click', () => {
    if (!store.canUndo()) return;
    const restored = store.undoDelete();
    if (restored > 0) {
      showToast(`Restored ${restored} bookmark${restored === 1 ? '' : 's'}`);
    }
  });

  els.headerCheck().addEventListener('change', (e) => {
    const ids = visibleBookmarks().map((b) => b._id);
    if (ids.length === 0) return;
    if (e.target.checked) store.selectIds(ids);
    else store.deselectIds(ids);
  });

  // Year-cutoff bulk drop. setupConfirmButton is idempotent — render() rewires
  // it on every state change so the count and labels stay current.
  els.cutoffYear().addEventListener('change', () => {
    rewireCutoffButton();
  });

  els.exportBtn().addEventListener('click', () => {
    const list = store.getBookmarks();
    if (list.length === 0) {
      showToast('Nothing to export');
      return;
    }
    downloadExport(list);
    showToast(
      `Exported ${list.length.toLocaleString()} bookmarks. ` +
        `Clear existing bookmarks before re-import to avoid duplicates.`
    );
  });

  // Link check: start / cancel / drop-dead
  els.checkLinksBtn().addEventListener('click', startLinkCheck);
  els.cancelCheckBtn().addEventListener('click', () => {
    if (activeCheck) activeCheck.abort();
  });
  setupConfirmButton(
    els.dropDeadBtn(),
    'Drop all dead (0)',
    'Are you sure? Click again',
    () => {
      const ids = store.getDeadIds();
      if (ids.length === 0) {
        showToast('No dead links to drop');
        return;
      }
      const removed = store.deleteByIds(ids);
      if (removed > 0) {
        showToast(`Dropped ${removed.toLocaleString()} dead link${removed === 1 ? '' : 's'}`);
      }
    }
  );
}

async function startLinkCheck() {
  if (activeCheck) return; // already running
  const list = store.getBookmarks();
  // Only probe http(s) URLs — skip data:, javascript:, file:, etc.
  const targets = list.filter((b) => /^https?:\/\//i.test(b.url || ''));
  if (targets.length === 0) {
    showToast('No checkable URLs');
    return;
  }
  // Reset prior statuses so re-check starts from a clean slate.
  store.resetStatuses();

  activeCheck = new AbortController();
  setCheckUI('running', { done: 0, total: targets.length });

  try {
    await checkLinks({
      urls: targets.map((b) => b.url),
      signal: activeCheck.signal,
      onResult: (r) => {
        const ids = store.applyStatus(r.url, r.status, r.reason);
        for (const id of ids) updateRowStatus(id, r.status, r.reason);
      },
      onProgress: (done, total) => {
        setCheckUI('running', { done, total });
      },
    });
    showToast(
      `Checked ${targets.length.toLocaleString()} — ` +
        `${store.countByStatus('alive').toLocaleString()} alive, ` +
        `${store.countByStatus('dead').toLocaleString()} dead, ` +
        `${store.countByStatus('error').toLocaleString()} error`
    );
  } catch (err) {
    showToast(linkCheckErrorMessage(err));
  } finally {
    activeCheck = null;
    // Sync the rest of the UI (stats, drop-dead button label, etc.).
    store.notifyAll();
    setCheckUI('idle');
  }
}

/**
 * Re-probe a single bookmark by id. Lighter than the full check — no progress
 * bar, no Cancel button, no global state machine. Toast reports the result.
 */
async function recheckOne(id) {
  const b = store.getBookmarks().find((x) => x._id === id);
  if (!b) return;
  if (!/^https?:\/\//i.test(b.url || '')) {
    showToast('Not a checkable URL');
    return;
  }

  // Reset just this row's badge while in flight, so the user sees something move.
  store.applyStatus(b.url, 'unchecked', null);
  updateRowStatus(id, 'unchecked', null);

  try {
    await checkLinks({
      urls: [b.url],
      onResult: (r) => {
        const ids = store.applyStatus(r.url, r.status, r.reason);
        for (const i of ids) updateRowStatus(i, r.status, r.reason);
      },
      onProgress: () => {},
    });
    store.notifyAll();
    const after = store.getBookmarks().find((x) => x._id === id);
    if (after) {
      const reason = after._statusReason ? ` — ${after._statusReason}` : '';
      showToast(`${labelFor(after._status)}${reason}`);
    }
  } catch (err) {
    showToast(linkCheckErrorMessage(err, 'Re-check'));
  }
}

/**
 * Translate a fetch / link-check error into a short, human-friendly message.
 * Covers AbortError (cancel), TypeError (server unreachable), and the
 * structured 401 / 503 / 400 responses from the Pages Function.
 */
function linkCheckErrorMessage(err, label = 'Link check') {
  if (err?.name === 'AbortError') return `${label} cancelled`;
  if (err instanceof TypeError) {
    return "Couldn't reach the server. Is it running?";
  }
  return `${label} failed: ${err?.message || err}`;
}

function labelFor(status) {
  if (status === 'alive') return 'Alive';
  if (status === 'dead') return 'Dead';
  if (status === 'error') return 'Error';
  return 'Unchecked';
}

/**
 * Drive the Check / Cancel / progress UI. States:
 *   idle     — Check links visible; Cancel + progress hidden
 *   running  — Cancel + progress visible; Check hidden
 */
function setCheckUI(state, progress) {
  const checkBtn = els.checkLinksBtn();
  const cancelBtn = els.cancelCheckBtn();
  const wrap = els.checkProgress();
  const text = els.checkProgressText();
  const fill = els.checkProgressFill();

  if (state === 'running') {
    checkBtn.hidden = true;
    cancelBtn.hidden = false;
    wrap.hidden = false;
    if (progress) {
      const { done, total } = progress;
      text.textContent = `Checking ${done.toLocaleString()} / ${total.toLocaleString()}`;
      const pct = total > 0 ? (done / total) * 100 : 0;
      fill.style.width = `${pct}%`;
    }
  } else {
    checkBtn.hidden = false;
    cancelBtn.hidden = true;
    wrap.hidden = true;
    fill.style.width = '0%';
    // Toggle the label to "Re-check" once we have any non-unchecked status.
    const hasResults =
      store.countByStatus('alive') +
        store.countByStatus('dead') +
        store.countByStatus('error') >
      0;
    checkBtn.textContent = hasResults ? 'Re-check' : 'Check links';
  }
}

/**
 * Bookmarks with a parseable add_date older than Jan 1 of `year`. Undated
 * bookmarks are never matched by a year cutoff — use the No-date filter +
 * Delete selected if you want them gone.
 */
function bookmarksBeforeYear(year) {
  const cutoff = Date.UTC(year, 0, 1);
  const out = [];
  for (const b of store.getBookmarks()) {
    const ms = addDateMs(b.add_date);
    if (ms === null) continue;
    if (ms < cutoff) out.push(b);
  }
  return out;
}

/**
 * Refresh the year `<select>` options from the current bookmark set. Hides
 * the entire cutoff group if no bookmark has a parseable date.
 */
function populateYearSelect() {
  const sel = els.cutoffYear();
  const group = els.cutoffGroup();
  if (!sel || !group) return;

  const previous = sel.value;
  const years = new Set();
  for (const b of store.getBookmarks()) {
    const ms = addDateMs(b.add_date);
    if (ms !== null) years.add(new Date(ms).getUTCFullYear());
  }

  if (years.size === 0) {
    group.hidden = true;
    sel.innerHTML = '';
    return;
  }
  group.hidden = false;

  const sorted = Array.from(years).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const opts = [];
  for (let y = min; y <= max + 1; y++) {
    opts.push(`<option value="${y}">${y}</option>`);
  }
  sel.innerHTML = opts.join('');

  const prev = parseInt(previous, 10);
  if (Number.isFinite(prev) && prev >= min && prev <= max + 1) {
    sel.value = String(prev);
  } else {
    // Default to ~5 years before the most recent year, clamped to min.
    sel.value = String(Math.max(min, max - 5));
  }
}

/**
 * (Re)wire the cutoff button labels & callback for the currently-selected
 * year and current bookmark count. Safe to call repeatedly.
 */
function rewireCutoffButton() {
  const sel = els.cutoffYear();
  const btn = els.deletePreYear();
  if (!sel || !btn) return;

  const year = parseInt(sel.value, 10);
  if (!Number.isFinite(year)) {
    btn.disabled = true;
    btn.textContent = 'Drop pre-—';
    return;
  }

  const matching = bookmarksBeforeYear(year);
  const n = matching.length;
  btn.disabled = n === 0;

  setupConfirmButton(
    btn,
    `Drop pre-${year} (${n.toLocaleString()})`,
    `Drop ${n.toLocaleString()} before ${year}? Click again`,
    () => {
      const ids = matching.map((b) => b._id);
      const removed = store.deleteByIds(ids);
      if (removed > 0) {
        showToast(`Dropped ${removed.toLocaleString()} before ${year}`);
      }
    }
  );
}

function visibleBookmarks() {
  return applyFilters(store.getBookmarks(), store.getFilters());
}

function deletedToast(n) {
  return `Deleted ${n} bookmark${n === 1 ? '' : 's'}`;
}

/**
 * Re-render everything from current store state. Cheap for our volumes.
 */
function render() {
  const bookmarks = store.getBookmarks();
  const filters = store.getFilters();
  const selected = store.getSelected();
  const visible = applyFilters(bookmarks, filters);

  populateFolderOptions(bookmarks);
  populateYearSelect();
  rewireCutoffButton();

  renderTable({
    bookmarks: visible,
    selected,
    onToggleSelect: (id, checked) => store.toggleSelected(id, checked),
    onDelete: (id) => {
      const removed = store.deleteByIds([id]);
      if (removed > 0) showToast(deletedToast(removed));
    },
    onRecheck: (id) => recheckOne(id),
  });

  renderStats({
    visible: visible.length,
    total: bookmarks.length,
    original: store.getOriginalCount(),
    selected: selected.size,
  });

  syncResetVisibility(filters);
  syncHeaderCheckbox(visible, selected);
  syncUndoButton();
  syncDropDeadButton();
}

function syncDropDeadButton() {
  const btn = els.dropDeadBtn();
  if (!btn) return;
  const n = store.countByStatus('dead');
  if (n === 0) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  // setupConfirmButton is idempotent — safe to call on every render to keep
  // the count in the original label fresh.
  setupConfirmButton(
    btn,
    `Drop all dead (${n.toLocaleString()})`,
    `Drop ${n.toLocaleString()} dead link${n === 1 ? '' : 's'}? Click again`,
    () => {
      const ids = store.getDeadIds();
      if (ids.length === 0) return;
      const removed = store.deleteByIds(ids);
      if (removed > 0) {
        showToast(
          `Dropped ${removed.toLocaleString()} dead link${removed === 1 ? '' : 's'}`
        );
      }
    }
  );
}

function syncHeaderCheckbox(visible, selected) {
  const hc = els.headerCheck();
  if (!hc) return;
  if (visible.length === 0) {
    hc.checked = false;
    hc.indeterminate = false;
    return;
  }
  let allSel = true;
  let someSel = false;
  for (const b of visible) {
    if (selected.has(b._id)) someSel = true;
    else allSel = false;
  }
  hc.checked = allSel;
  hc.indeterminate = someSel && !allSel;
}

function syncUndoButton() {
  const btn = els.undo();
  if (!btn) return;
  const can = store.canUndo();
  btn.disabled = !can;
  btn.textContent = can
    ? `Undo last delete (${store.lastUndoSize()})`
    : 'Undo last delete';
}

function showError(msg) {
  const el = els.parseError();
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideError() {
  const el = els.parseError();
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
