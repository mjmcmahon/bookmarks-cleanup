// Table renderer.
//
// Step 6: status badge column for link-check results. Re-renders the whole
// tbody on bookmark/selection changes, but a separate `updateRowStatus`
// helper patches just the status cell during a streaming check so we don't
// pay an O(N²) cost as 5000+ results stream in.

import { setupConfirmButton } from '../confirm.js';

const tbody = () => document.getElementById('bookmarks-tbody');
const tableEl = () => document.getElementById('bookmarks-table');
const emptyEl = () => document.getElementById('empty-state');

const SECTION_ROOTS = ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'];

/** id → <tr>, rebuilt on every renderTable() */
const rowMap = new Map();

/**
 * @param {{
 *   bookmarks: Array<Object>,
 *   selected: Set<number>,
 *   onToggleSelect: (id: number, checked: boolean) => void,
 *   onDelete: (id: number) => void,
 *   onRecheck: (id: number) => void,
 * }} opts
 */
export function renderTable(opts) {
  const { bookmarks, selected, onToggleSelect, onDelete, onRecheck } = opts;
  const body = tbody();
  const table = tableEl();
  const empty = emptyEl();
  if (!body || !table || !empty) return;

  rowMap.clear();

  if (bookmarks.length === 0) {
    body.replaceChildren();
    table.hidden = true;
    empty.hidden = false;
    return;
  }
  table.hidden = false;
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  for (const b of bookmarks) {
    const tr = buildRow(b, selected.has(b._id), onToggleSelect, onDelete, onRecheck);
    rowMap.set(b._id, tr);
    frag.appendChild(tr);
  }
  body.replaceChildren(frag);
}

/**
 * Patch one row's status badge in place. Safe to call from inside a hot loop;
 * does no work if the row isn't currently rendered (e.g. filtered out).
 */
export function updateRowStatus(id, status, reason) {
  const tr = rowMap.get(id);
  if (!tr) return;
  const cell = tr.querySelector('.col-status');
  if (!cell) return;
  cell.replaceChildren(buildStatusBadge(status, reason));
}

function buildRow(b, isSelected, onToggleSelect, onDelete, onRecheck) {
  const tr = document.createElement('tr');
  tr.dataset.id = String(b._id);
  if (isSelected) tr.classList.add('selected');

  // Checkbox
  const cbCell = document.createElement('td');
  cbCell.className = 'col-checkbox';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'row-check';
  cb.checked = isSelected;
  cb.addEventListener('change', () => {
    onToggleSelect(b._id, cb.checked);
  });
  cbCell.appendChild(cb);
  tr.appendChild(cbCell);

  // Status badge — empty for unchecked / alive, populated for dead / error.
  const statusCell = document.createElement('td');
  statusCell.className = 'col-status';
  statusCell.appendChild(buildStatusBadge(b._status, b._statusReason));
  tr.appendChild(statusCell);

  // Title — clickable, opens URL in new tab
  const titleCell = document.createElement('td');
  titleCell.className = 'col-title';
  const a = document.createElement('a');
  a.href = b.url || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = b.title || '';
  a.textContent = b.title || '(untitled)';
  if (!b.title) a.style.color = 'var(--text-faint)';
  titleCell.appendChild(a);
  tr.appendChild(titleCell);

  // URL — monospace, ellipsis-clipped
  const urlCell = document.createElement('td');
  urlCell.className = 'col-url';
  urlCell.title = b.url || '';
  urlCell.textContent = b.url || '';
  tr.appendChild(urlCell);

  // Folder badge — top-level only, full path on hover
  const folderCell = document.createElement('td');
  folderCell.className = 'col-folder';
  folderCell.title = (b.folder_path || []).join(' / ');
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = topLevelFolder(b.folder_path);
  folderCell.appendChild(badge);
  tr.appendChild(folderCell);

  // Date
  const dateCell = document.createElement('td');
  dateCell.className = 'col-date';
  dateCell.textContent = formatDate(b.add_date);
  tr.appendChild(dateCell);

  // Per-row actions: re-check + Delete (with inline confirm)
  const actionsCell = document.createElement('td');
  actionsCell.className = 'col-actions';

  if (onRecheck && /^https?:\/\//i.test(b.url || '')) {
    const re = document.createElement('button');
    re.type = 'button';
    re.className = 'row-recheck';
    re.textContent = '↻';
    re.title = 'Re-check this link';
    re.setAttribute('aria-label', 'Re-check this link');
    re.addEventListener('click', () => onRecheck(b._id));
    actionsCell.appendChild(re);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'row-delete danger';
  setupConfirmButton(del, 'Delete', 'Sure?', () => {
    onDelete(b._id);
  });
  actionsCell.appendChild(del);
  tr.appendChild(actionsCell);

  return tr;
}

function buildStatusBadge(status, reason) {
  if (!status || status === 'unchecked' || status === 'alive') {
    return document.createTextNode('');
  }
  const span = document.createElement('span');
  span.className = `status-badge status-badge--${status}`;
  span.textContent = status === 'dead' ? 'Dead' : 'Error';
  if (reason) span.title = reason;
  return span;
}

function topLevelFolder(folder_path) {
  const fp = Array.isArray(folder_path) ? folder_path : [];
  if (fp.length >= 2 && SECTION_ROOTS.indexOf(fp[0]) !== -1) return fp[1];
  if (fp.length >= 1) return fp[0];
  return '(uncategorized)';
}

function formatDate(addDate) {
  if (!addDate) return '—';
  let n = Number(addDate);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n > 1e16) n = Math.floor(n / 1e6);
  else if (n > 1e12) n = Math.floor(n / 1e3);
  const d = new Date(n * 1000);
  if (isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
