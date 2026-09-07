// Smoke test for the test harness itself — proves node:test + jsdom can
// exercise public/app/parser.js. This is NOT the real parser regression
// suite (that's a separate task); keep it minimal.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './helpers/dom.js';
import { parseBookmarks } from '../public/app/parser.js';

const SAMPLE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com/" ADD_DATE="1700000000">Example</A>
</DL><p>
`;

test('harness smoke: parseBookmarks parses a trivial Netscape bookmark file', () => {
  const { bookmarks } = parseBookmarks(SAMPLE_HTML);

  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].title, 'Example');
  assert.equal(bookmarks[0].url, 'https://example.com/');
  assert.equal(bookmarks[0].add_date, '1700000000');
  assert.deepEqual(bookmarks[0].folder_path, []);
});
