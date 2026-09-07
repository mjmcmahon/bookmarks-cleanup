// Netscape Bookmark format parser.
//
// Most browsers (Chrome, Firefox, Edge, Brave, Opera, Vivaldi, Arc, DuckDuckGo)
// export bookmarks as a malformed-but-conventional HTML document. Folders are
// <DT><H3>name</H3> followed by a sibling <DL> of children; bookmarks are
// <DT><A HREF="...">title</A>, optionally followed by a sibling <DD> with a
// description (Firefox emits these). DT, DD and P tags are not closed.
// Browsers' DOMParser tolerates this — we hand it the HTML and walk the DOM
// rather than tokenising raw text.
//
// Root discovery has two cases. Most browsers wrap the whole tree in one
// top-level `body > dl`. Safari does not — its top-level folders are bare
// `<DT>`/`<DL>` siblings directly in `<body>`, with no wrapper. Grabbing the
// first `<dl>` on the page (the naive fallback) would silently walk into the
// first folder's own children instead of failing over to those siblings, so
// `rootNodes()` handles the two cases explicitly before falling back further.
//
// Output: { bookmarks, source } where bookmarks is a flat array of
//   { _id, title, url, add_date, last_modified, last_visit, icon,
//     description, folder_path, _status }
// and source is 'safari' or 'netscape'. Extra Firefox-only fields are kept
// on the bookmark so a later export can round-trip them.

let _idCounter = 0;
function nextId() {
  return ++_idCounter;
}

/**
 * Parse a browser bookmarks export (Netscape Bookmark format) into a flat list.
 * @param {string} html
 * @returns {{ bookmarks: Array<Object>, source: 'safari' | 'netscape' }}
 */
export function parseBookmarks(html) {
  if (!html || typeof html !== 'string') {
    throw new Error('parseBookmarks: expected an HTML string');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  const hasBodyDl = !!doc.querySelector('body > dl');
  const roots = rootNodes(doc);
  if (!roots || roots.length === 0) {
    throw new Error(
      "Couldn't find a bookmarks list in this file. Is this really a browser bookmarks export?"
    );
  }

  _idCounter = 0;
  const out = [];
  walkNodes(roots, [], out);

  const hasAnyDate = out.some((b) => b.add_date);
  const source = !hasBodyDl && !hasAnyDate ? 'safari' : 'netscape';

  return { bookmarks: out, source };
}

/**
 * Find the sibling nodes to start the walk from.
 *
 * Most browsers wrap everything in one `body > dl` — its children are the
 * roots. Safari has no such wrapper; its top-level folders (and any
 * top-level bookmarks) are bare `<DT>`/`<DL>`/`<DD>` siblings directly in
 * `<body>`, so we hoist those instead of grabbing the first `<dl>` on the
 * page (which would wrongly be some folder's own child list). Last resort:
 * any `<dl>` at all.
 */
function rootNodes(doc) {
  const bodyDl = doc.querySelector('body > dl');
  if (bodyDl) return Array.from(bodyDl.children); // Chrome, Firefox, Edge, Brave, Opera, Vivaldi, Arc, DuckDuckGo

  const hoisted = Array.from(doc.body.children).filter((e) =>
    ['DT', 'DL', 'DD'].includes(e.tagName)
  );
  if (hoisted.length) return hoisted; // Safari: no wrapping DL

  const any = doc.querySelector('dl');
  return any ? Array.from(any.children) : null; // last resort
}

/**
 * Walk a list of sibling nodes sequentially (the children of a <DL>, or —
 * for Safari's wrapper-less exports — the bare top-level siblings of
 * <body>). A folder is a <DT> containing an <H3>; the folder's children
 * live in the <DL> that follows — which the browser may place either
 * *inside* that <DT> or as its *next sibling*, depending on how forgiving
 * its parser was. A bookmark <DT><A> may be followed by a sibling <DD>
 * carrying a Firefox-style description. We handle both.
 */
function walkNodes(children, folderPath, out) {
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const tag = node.tagName;

    if (tag === 'DT') {
      const h3 = directChild(node, 'H3');
      const a = directChild(node, 'A');

      if (h3) {
        // Folder
        const name = (h3.textContent || '').trim();
        // Look for the children DL — first try inside this DT, then next sibling.
        let subDl = directChild(node, 'DL');
        if (!subDl) {
          const next = children[i + 1];
          if (next && next.tagName === 'DL') {
            subDl = next;
            i++; // consume it
          }
        }
        if (subDl) {
          walkNodes(
            Array.from(subDl.children),
            name ? [...folderPath, name] : folderPath,
            out
          );
        }
      } else if (a) {
        // Bookmark
        const url = a.getAttribute('href') || '';
        if (!url) continue;

        // Firefox sometimes places a <DD> with the description either inside
        // this DT or as the next sibling. Consume whichever we find.
        let description = directChildText(node, 'DD');
        if (description === null) {
          const next = children[i + 1];
          if (next && next.tagName === 'DD') {
            description = (next.textContent || '').trim() || null;
            i++; // consume the DD
          }
        }

        out.push({
          _id: nextId(),
          title: (a.textContent || '').trim(),
          url,
          add_date: a.getAttribute('add_date') || null,
          last_modified: a.getAttribute('last_modified') || null,
          last_visit: a.getAttribute('last_visit') || null,
          icon: a.getAttribute('icon') || null,
          description,
          folder_path: folderPath.slice(),
          _status: 'unchecked',
        });
      }
    } else if (tag === 'DD') {
      // Stray <DD> between bookmarks — already consumed by the previous DT's
      // lookahead above. Anything that lands here has no preceding bookmark
      // (rare); skip.
    } else if (tag === 'DL') {
      // Defensive: stray top-level DL — recurse with same path.
      walkNodes(Array.from(node.children), folderPath, out);
    }
    // Anything else (P, HR, comment text) is skipped.
  }
}

function directChild(el, tagName) {
  const want = tagName.toUpperCase();
  for (const child of el.children) {
    if (child.tagName === want) return child;
  }
  return null;
}

function directChildText(el, tagName) {
  const child = directChild(el, tagName);
  if (!child) return null;
  const text = (child.textContent || '').trim();
  return text || null;
}
