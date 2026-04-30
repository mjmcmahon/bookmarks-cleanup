// In-memory state for the loaded session.
//
// All mutations go through this module so the subscriber (main.js) can
// re-render once per change. UI-free — toasts and DOM rendering live in their
// own modules.

import { emptyFilters } from './filters.js';

const UNDO_CAP = 20;

let bookmarks = [];
let originalCount = 0;
let filters = emptyFilters();
/** @type {Set<number>} */
let selected = new Set();
/** @type {Array<Array<Object>>} each entry is one batch of removed bookmarks */
let undoStack = [];

const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn();
}

/**
 * @param {() => void} fn called after every state change
 * @returns {() => void} unsubscribe
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getBookmarks() {
  return bookmarks;
}
export function getOriginalCount() {
  return originalCount;
}
export function getFilters() {
  return filters;
}
export function getSelected() {
  return selected;
}
export function canUndo() {
  return undoStack.length > 0;
}
export function lastUndoSize() {
  return undoStack.length === 0 ? 0 : undoStack[undoStack.length - 1].length;
}

/**
 * Replace the entire bookmark set (file load). Resets selection and undo.
 */
export function loadBookmarks(list) {
  bookmarks = list;
  originalCount = list.length;
  filters = emptyFilters();
  selected = new Set();
  undoStack = [];
  notify();
}

export function setFilters(next) {
  filters = { ...filters, ...next };
  notify();
}

export function toggleSelected(id, checked) {
  if (checked) selected.add(id);
  else selected.delete(id);
  notify();
}

export function selectIds(ids) {
  for (const id of ids) selected.add(id);
  notify();
}

export function deselectIds(ids) {
  for (const id of ids) selected.delete(id);
  notify();
}

export function deselectAll() {
  if (selected.size === 0) return;
  selected = new Set();
  notify();
}

/**
 * Remove bookmarks by _id and push the removed batch to the undo stack.
 * Returns the count actually removed.
 */
export function deleteByIds(ids) {
  const idSet = new Set(ids);
  const removed = [];
  const kept = [];
  for (const b of bookmarks) {
    if (idSet.has(b._id)) removed.push(b);
    else kept.push(b);
  }
  if (removed.length === 0) return 0;
  bookmarks = kept;
  for (const b of removed) selected.delete(b._id);
  undoStack.push(removed);
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  notify();
  return removed.length;
}

/**
 * Restore the most recent deletion batch. Returns the count restored.
 */
export function undoDelete() {
  if (undoStack.length === 0) return 0;
  const restored = undoStack.pop();
  bookmarks = bookmarks.concat(restored);
  // Stable-ish ordering: preserve the original _id sequence.
  bookmarks.sort((a, b) => a._id - b._id);
  notify();
  return restored.length;
}

/**
 * Apply a link-check status to every bookmark with a matching URL. Mutates
 * in place WITHOUT calling notify — link-check results stream in fast and
 * full re-renders would be O(N²). The caller updates affected rows surgically
 * and calls notifyAll() once when the run is complete.
 *
 * @returns {Array<number>} the bookmark _ids that were updated.
 */
export function applyStatus(url, status, reason) {
  const ids = [];
  for (const b of bookmarks) {
    if (b.url === url) {
      b._status = status;
      b._statusReason = reason || null;
      ids.push(b._id);
    }
  }
  return ids;
}

/**
 * Reset every bookmark's status to 'unchecked' (e.g. before a re-check).
 */
export function resetStatuses() {
  for (const b of bookmarks) {
    b._status = 'unchecked';
    b._statusReason = null;
  }
  notify();
}

export function notifyAll() {
  notify();
}

export function getDeadIds() {
  const ids = [];
  for (const b of bookmarks) if (b._status === 'dead') ids.push(b._id);
  return ids;
}

export function countByStatus(status) {
  let n = 0;
  for (const b of bookmarks) if (b._status === status) n++;
  return n;
}
