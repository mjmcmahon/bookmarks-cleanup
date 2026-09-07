// Reconstruct a browser-importable Netscape Bookmark file from the in-memory
// bookmark list and trigger a download. Folder hierarchy is rebuilt from each
// bookmark's folder_path array so deletions and undo correctly remove or keep
// branches of the tree.
//
// Round-trips:
//   HREF, ADD_DATE, LAST_MODIFIED, LAST_VISIT, ICON  (as <A> attributes)
//   description                                      (as a sibling <DD>)
//
// Sets PERSONAL_TOOLBAR_FOLDER="true" on the profile's toolbar folder (see
// PROFILES below) so Chrome (and Chromium-family browsers) merge it back
// into the bookmarks bar on re-import. Safari ignores that attribute and
// instead matches its toolbar folder by name alone (verified against real
// Safari, SAFARI-SPEC.md section 4) — emitting the attribute anyway is free
// Chromium compatibility and costs nothing.
//
// Export profile per detected source: which folder is the toolbar, and the
// root-folder sort order (named roots first in listed order, everything
// else alphabetical after).

export const PROFILES = {
  netscape: { toolbar: 'Bookmarks Bar',
              order: ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'] },
  safari:   { toolbar: 'Favorites',
              order: ['Favorites', 'Bookmarks Menu'] },
};

/**
 * Build the export HTML string from a bookmark list.
 * @param {Array<Object>} bookmarks
 * @param {{toolbar: string, order: string[]}} [profile] - export profile
 *   (see PROFILES); defaults to the netscape profile.
 * @returns {string}
 */
export function buildExportHtml(bookmarks, profile = PROFILES.netscape) {
  const root = makeNode('__root__');

  for (const b of bookmarks) {
    const fp = b.folder_path || [];
    let node = root;
    for (const part of fp) {
      if (!node.folders[part]) node.folders[part] = makeNode(part);
      node = node.folders[part];
    }
    node.links.push(b);
  }

  const lines = [];
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
  lines.push('<!-- This is an automatically generated file.');
  lines.push('     It will be read and overwritten.');
  lines.push('     DO NOT EDIT! -->');
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push('<TITLE>Bookmarks</TITLE>');
  lines.push('<H1>Bookmarks</H1>');
  lines.push('<DL><p>');

  const rootNames = Object.keys(root.folders).sort((a, b) => rootSort(a, b, profile));
  for (const name of rootNames) {
    writeFolder(root.folders[name], 1, name === profile.toolbar, lines);
  }

  // Orphan links at the very root (no folder_path). Rare but possible.
  for (const b of root.links) {
    writeLink(b, '    ', lines);
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * Reconstruct + download. Profile is resolved from the detected source
 * ('safari' gets the Safari profile; anything else, including undefined,
 * gets the netscape profile so existing callers/behavior are unaffected).
 * Filename: bookmarks-cleaned-YYYY-MM-DD.html, or
 * bookmarks-cleaned-safari-YYYY-MM-DD.html for the Safari profile so the two
 * don't collide in Downloads.
 * @param {Array<Object>} bookmarks
 * @param {string} [source] - 'safari' or 'netscape'
 */
export function downloadExport(bookmarks, source) {
  const profile = source === 'safari' ? PROFILES.safari : PROFILES.netscape;
  const html = buildExportHtml(bookmarks, profile);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  const tag = profile === PROFILES.safari ? 'safari-' : '';
  a.download = `bookmarks-cleaned-${tag}${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeNode(name) {
  return { name, folders: Object.create(null), links: [] };
}

function writeFolder(node, indent, isToolbar, lines) {
  const pad = '    '.repeat(indent);
  const toolbarAttr = isToolbar ? ' PERSONAL_TOOLBAR_FOLDER="true"' : '';
  lines.push(`${pad}<DT><H3${toolbarAttr}>${escapeText(node.name)}</H3>`);
  lines.push(`${pad}<DL><p>`);

  // Sub-folders alphabetically (stable, predictable diffs).
  const subNames = Object.keys(node.folders).sort((a, b) => a.localeCompare(b));
  for (const name of subNames) {
    writeFolder(node.folders[name], indent + 1, false, lines);
  }

  for (const b of node.links) {
    writeLink(b, `${pad}    `, lines);
  }

  lines.push(`${pad}</DL><p>`);
}

function writeLink(b, pad, lines) {
  let attrs = `HREF="${escapeAttr(b.url || '')}"`;
  if (b.add_date) attrs += ` ADD_DATE="${escapeAttr(b.add_date)}"`;
  if (b.last_modified) attrs += ` LAST_MODIFIED="${escapeAttr(b.last_modified)}"`;
  if (b.last_visit) attrs += ` LAST_VISIT="${escapeAttr(b.last_visit)}"`;
  if (b.icon) attrs += ` ICON="${escapeAttr(b.icon)}"`;
  lines.push(`${pad}<DT><A ${attrs}>${escapeText(b.title || '')}</A>`);
  if (b.description) {
    lines.push(`${pad}<DD>${escapeText(b.description)}`);
  }
}

function rootSort(a, b, profile) {
  const ia = profile.order.indexOf(a);
  const ib = profile.order.indexOf(b);
  const oa = ia === -1 ? 99 : ia;
  const ob = ib === -1 ? 99 : ib;
  if (oa !== ob) return oa - ob;
  return a.localeCompare(b);
}

function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}
