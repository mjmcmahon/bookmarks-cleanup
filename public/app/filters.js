// Pure filter logic. No DOM, no I/O — easy to reason about and verify.
//
// A "filter state" is { search, folder, age, status }:
//   search: string (case-insensitive substring; matches title or URL)
//   folder: "" for all, otherwise "<section>|<firstSub>" where firstSub === ""
//           means "directly in the section root" (e.g. "Bookmarks Bar|" → bookmarks
//           with folder_path === ["Bookmarks Bar"]).
//   age:    "" | "1y" | "3y" | "5y" | "5plus" | "10plus" | "nodate"
//   status: "" | "alive" | "dead" | "error" | "unchecked"

export const AGE_BUCKETS = [
  { value: '', label: 'Any age' },
  { value: '1y', label: 'Past year' },
  { value: '3y', label: 'Past 3 years' },
  { value: '5y', label: 'Past 5 years' },
  { value: '5plus', label: '5+ years old' },
  { value: '10plus', label: '10+ years old' },
  { value: 'nodate', label: 'No date' },
];

export const STATUS_BUCKETS = [
  { value: '', label: 'Any status' },
  { value: 'alive', label: 'Alive' },
  { value: 'dead', label: 'Dead' },
  { value: 'error', label: 'Error' },
  { value: 'unchecked', label: 'Unchecked' },
];

const SECTION_ROOTS = ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'];

export function emptyFilters() {
  return { search: '', folder: '', age: '', status: '' };
}

export function isAnyFilterActive(f) {
  return (
    Boolean(f.search) ||
    Boolean(f.folder) ||
    Boolean(f.age) ||
    Boolean(f.status)
  );
}

/**
 * Apply filters to a bookmark list. Returns a new array.
 * @param {Array<Object>} bookmarks
 * @param {{search:string, folder:string, age:string}} filters
 * @param {number} [now] epoch ms — injectable for tests
 */
export function applyFilters(bookmarks, filters, now = Date.now()) {
  const { search, folder, age, status } = filters;
  const needle = (search || '').trim().toLowerCase();
  const folderMatch = parseFolderValue(folder);
  const ageCutoffs = ageCutoffMs(now);

  return bookmarks.filter((b) => {
    if (needle) {
      const t = (b.title || '').toLowerCase();
      const u = (b.url || '').toLowerCase();
      if (!t.includes(needle) && !u.includes(needle)) return false;
    }
    if (folderMatch) {
      const path = b.folder_path || [];
      if (path[0] !== folderMatch.section) return false;
      // firstSub === "" means the bookmark must sit at the section root.
      const first = path[1] || '';
      if (first !== folderMatch.firstSub) return false;
    }
    if (age) {
      if (!matchesAge(b, age, ageCutoffs)) return false;
    }
    if (status) {
      const s = b._status || 'unchecked';
      if (s !== status) return false;
    }
    return true;
  });
}

function parseFolderValue(value) {
  if (!value) return null;
  const idx = value.indexOf('|');
  if (idx === -1) return null;
  return {
    section: value.slice(0, idx),
    firstSub: value.slice(idx + 1),
  };
}

/**
 * Build the option list for the folder dropdown:
 *   [{ section, options: [{ value, label, count }] }]
 * Sections preserve canonical order; first-level subfolders are sorted by name
 * with the "(root)" option first.
 */
export function getFolderOptions(bookmarks) {
  /** @type {Map<string, Map<string, number>>} */
  const bySection = new Map();
  for (const root of SECTION_ROOTS) bySection.set(root, new Map());

  for (const b of bookmarks) {
    const path = b.folder_path || [];
    const section = path[0];
    if (!section) continue;
    if (!bySection.has(section)) bySection.set(section, new Map());
    const firstSub = path[1] || '';
    const m = bySection.get(section);
    m.set(firstSub, (m.get(firstSub) || 0) + 1);
  }

  const groups = [];
  for (const [section, subs] of bySection) {
    if (subs.size === 0) continue;
    const options = [];
    // (root) first
    if (subs.has('')) {
      options.push({
        value: `${section}|`,
        label: '(root)',
        count: subs.get(''),
      });
    }
    const named = Array.from(subs.entries())
      .filter(([k]) => k !== '')
      .sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, count] of named) {
      options.push({
        value: `${section}|${name}`,
        label: name,
        count,
      });
    }
    groups.push({ section, options });
  }
  return groups;
}

/**
 * Normalise the browser's add_date attribute to epoch milliseconds (or null).
 * Same logic as table.formatDate but centralised here for filter use.
 */
export function addDateMs(addDate) {
  if (addDate === null || addDate === undefined || addDate === '') return null;
  let n = Number(addDate);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e16) n = Math.floor(n / 1e6); // microseconds → seconds
  else if (n > 1e12) n = Math.floor(n / 1e3); // milliseconds → seconds
  return n * 1000;
}

function ageCutoffMs(now) {
  const oneYear = 365.25 * 24 * 60 * 60 * 1000;
  return {
    y1: now - 1 * oneYear,
    y3: now - 3 * oneYear,
    y5: now - 5 * oneYear,
    y10: now - 10 * oneYear,
  };
}

function matchesAge(b, age, c) {
  const ms = addDateMs(b.add_date);
  if (age === 'nodate') return ms === null;
  if (ms === null) return false;
  switch (age) {
    case '1y':
      return ms >= c.y1;
    case '3y':
      return ms >= c.y3;
    case '5y':
      return ms >= c.y5;
    case '5plus':
      return ms < c.y5;
    case '10plus':
      return ms < c.y10;
    default:
      return true;
  }
}
