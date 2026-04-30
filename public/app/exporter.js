// Reconstruct a browser-importable Netscape Bookmark file from the in-memory
// bookmark list and trigger a download. Folder hierarchy is rebuilt from each
// bookmark's folder_path array so deletions and undo correctly remove or keep
// branches of the tree.
//
// Round-trips:
//   HREF, ADD_DATE, LAST_MODIFIED, LAST_VISIT, ICON  (as <A> attributes)
//   description                                      (as a sibling <DD>)
//
// Sets PERSONAL_TOOLBAR_FOLDER="true" on the "Bookmarks Bar" <H3> so Chrome
// (and Chromium-family browsers) merge it back into the bookmarks bar on
// re-import. Section order: Bookmarks Bar → Other Bookmarks → Mobile
// Bookmarks → anything else, alpha.

const SECTION_ORDER = {
  'Bookmarks Bar': 0,
  'Other Bookmarks': 1,
  'Mobile Bookmarks': 2,
};

/**
 * Build the export HTML string from a bookmark list.
 * @param {Array<Object>} bookmarks
 * @returns {string}
 */
export function buildExportHtml(bookmarks) {
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

  const rootNames = Object.keys(root.folders).sort(rootSort);
  for (const name of rootNames) {
    writeFolder(root.folders[name], 1, name === 'Bookmarks Bar', lines);
  }

  // Orphan links at the very root (no folder_path). Rare but possible.
  for (const b of root.links) {
    writeLink(b, '    ', lines);
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * Reconstruct + download. Filename: bookmarks-cleaned-YYYY-MM-DD.html.
 */
export function downloadExport(bookmarks) {
  const html = buildExportHtml(bookmarks);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `bookmarks-cleaned-${stamp}.html`;
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

function rootSort(a, b) {
  const oa = a in SECTION_ORDER ? SECTION_ORDER[a] : 99;
  const ob = b in SECTION_ORDER ? SECTION_ORDER[b] : 99;
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
