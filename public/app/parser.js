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
// Output: a flat array of
//   { _id, title, url, add_date, last_modified, last_visit, icon,
//     description, folder_path, _status }
// Extra Firefox-only fields are kept on the bookmark so a later export can
// round-trip them.

let _idCounter = 0;
function nextId() {
  return ++_idCounter;
}

/**
 * Parse a browser bookmarks export (Netscape Bookmark format) into a flat list.
 * @param {string} html
 * @returns {Array<Object>}
 */
export function parseBookmarks(html) {
  if (!html || typeof html !== 'string') {
    throw new Error('parseBookmarks: expected an HTML string');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // The top-level <DL> sits inside <body>. There may be a leading <H1> heading.
  const topDl = doc.querySelector('body > dl') || doc.querySelector('dl');
  if (!topDl) {
    throw new Error(
      "Couldn't find a bookmarks list in this file. Is this really a browser bookmarks export?"
    );
  }

  _idCounter = 0;
  const out = [];
  walkDl(topDl, [], out);
  return out;
}

/**
 * Walk one <DL>'s children sequentially. A folder is a <DT> containing an <H3>;
 * the folder's children live in the <DL> that follows — which the browser may
 * place either *inside* that <DT> or as its *next sibling*, depending on how
 * forgiving its parser was. A bookmark <DT><A> may be followed by a sibling
 * <DD> carrying a Firefox-style description. We handle both.
 */
function walkDl(dl, folderPath, out) {
  const children = Array.from(dl.children);

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
          walkDl(subDl, name ? [...folderPath, name] : folderPath, out);
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
      walkDl(node, folderPath, out);
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
