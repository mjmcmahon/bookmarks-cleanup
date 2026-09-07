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
//
// Cross-browser export: downloadExport takes an explicit `format` ('auto' |
// 'safari' | 'netscape') so a file loaded from one browser can be exported
// for another. When the chosen target profile differs from the detected
// source profile, buildExportHtml renames the toolbar root's top-level
// folder-path segment to match the target's toolbar name before the tree is
// built (SAFARI-SPEC.md section 5.2 addendum). 'auto' always uses the
// source profile as the target too, so no rename ever triggers and output
// is byte-identical to before this feature existed.

export const PROFILES = {
  netscape: { toolbar: 'Bookmarks Bar',
              order: ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks'] },
  safari:   { toolbar: 'Favorites',
              order: ['Favorites', 'Bookmarks Menu'] },
};

/**
 * Build the export HTML string from a bookmark list.
 * @param {Array<Object>} bookmarks
 * @param {{toolbar: string, order: string[]}} [profile] - target export
 *   profile (see PROFILES); defaults to the netscape profile.
 * @param {{toolbar: string, order: string[]}} [sourceProfile] - the profile
 *   the bookmarks were loaded from; defaults to `profile` itself, which
 *   means no toolbar-root renaming ever happens (byte-identical output to
 *   before this parameter existed — this is what every 2-arg caller and
 *   Auto rely on).
 * @returns {string}
 */
export function buildExportHtml(bookmarks, profile = PROFILES.netscape, sourceProfile = profile) {
  const root = makeNode('__root__');

  for (const b of bookmarks) {
    const fp = b.folder_path || [];
    // Cross-browser export: rename the toolbar root to match the target
    // profile's name (Safari matches its toolbar folder by name alone — see
    // SAFARI-SPEC.md section 4). Only the top-level segment is remapped;
    // everything else in the tree passes through unchanged. When
    // sourceProfile === profile (the default, and what Auto always uses),
    // this is always false, so behavior is unchanged.
    const remapRoot =
      fp.length > 0 &&
      fp[0] === sourceProfile.toolbar &&
      sourceProfile.toolbar !== profile.toolbar;
    const effectiveFp = remapRoot ? [profile.toolbar, ...fp.slice(1)] : fp;

    let node = root;
    for (const part of effectiveFp) {
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
 * Reconstruct + download. Source profile is resolved from the detected
 * source ('safari' gets the Safari profile; anything else, including
 * undefined, gets the netscape profile). Target (output) profile is
 * resolved from `format`: 'safari' or 'netscape' picks that profile
 * explicitly; 'auto' (or anything unrecognised, including the omitted
 * default) falls back to the detected source's profile — i.e. today's
 * same-browser round-trip behavior, unchanged.
 *
 * When source and target profiles differ, the toolbar root is renamed to
 * match the target (see buildExportHtml) — this is the cross-browser export
 * case (SAFARI-SPEC.md section 5.2 addendum).
 *
 * Filename reflects the CHOSEN target profile, not the detected source:
 * bookmarks-cleaned-YYYY-MM-DD.html, or
 * bookmarks-cleaned-safari-YYYY-MM-DD.html for the Safari profile, so the
 * two don't collide in Downloads.
 * @param {Array<Object>} bookmarks
 * @param {string} [source] - 'safari' or 'netscape'
 * @param {string} [format] - 'auto' | 'safari' | 'netscape'; defaults to 'auto'
 */
export function downloadExport(bookmarks, source, format = 'auto') {
  const sourceKey = source === 'safari' ? 'safari' : 'netscape';
  const targetKey = format === 'safari' || format === 'netscape' ? format : sourceKey;
  const sourceProfile = PROFILES[sourceKey];
  const targetProfile = PROFILES[targetKey];

  const html = buildExportHtml(bookmarks, targetProfile, sourceProfile);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  const tag = targetKey === 'safari' ? 'safari-' : '';
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
