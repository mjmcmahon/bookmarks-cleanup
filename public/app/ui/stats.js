// Stats strip — three groups: Showing X of Y · N selected · Original Y.
// "Original" only surfaces once it diverges from the current total
// (i.e. after deletions in step 3).

const els = {
  shown: () => document.getElementById('stat-shown'),
  total: () => document.getElementById('stat-total'),
  selected: () => document.getElementById('stat-selected'),
  original: () => document.getElementById('stat-original'),
  originalWrap: () => document.getElementById('stat-original-wrap'),
};

/**
 * @param {{ visible: number, total: number, original: number, selected?: number }} counts
 */
export function renderStats({ visible, total, original, selected = 0 }) {
  const shown = els.shown();
  const totalEl = els.total();
  const sel = els.selected();
  const orig = els.original();
  const origWrap = els.originalWrap();

  if (shown) shown.textContent = visible.toLocaleString();
  if (totalEl) totalEl.textContent = total.toLocaleString();
  if (sel) sel.textContent = selected.toLocaleString();

  if (orig && origWrap) {
    if (original !== total) {
      orig.textContent = original.toLocaleString();
      origWrap.hidden = false;
    } else {
      origWrap.hidden = true;
    }
  }
}
