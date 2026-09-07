// Safari regression test — proves the root-discovery fix (SAFARI-SPEC.md
// section 5.1) against Mike's real Safari export. Safari emits no wrapping
// top-level `body > dl`; its top-level folders are bare siblings directly
// in `<body>`. Before the fix, the naive `dl` fallback silently walked into
// the first folder's own children and dropped ~68% of the bookmarks with no
// error. This test locks in the fixed numbers from SAFARI-SPEC.md section 6,
// item 1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './helpers/dom.js';
import { parseBookmarks } from '../public/app/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'safari-2026-09-06.html');

const EXPECTED_COUNT = 138;
const EXPECTED_ROOT_COUNT = 15;

// The fixture is Mike's real Safari export and is deliberately not committed
// to this public repo (see .gitignore and SAFARI-SPEC.md section 2). Skip
// rather than fail when it's absent, so a fresh clone's test suite still
// passes.
const skip = fs.existsSync(FIXTURE_PATH)
  ? false
  : 'test/fixtures/safari-2026-09-06.html not present locally (real personal bookmarks, not committed — see SAFARI-SPEC.md section 2)';

function loadFixture() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return parseBookmarks(html);
}

test('Safari: parses exactly 138 bookmarks', { skip }, () => {
  const { bookmarks } = loadFixture();
  assert.equal(bookmarks.length, EXPECTED_COUNT);
});

test('Safari: 15 non-empty roots present, including Favorites and Bookmarks Menu', { skip }, () => {
  const { bookmarks } = loadFixture();
  const roots = new Set(bookmarks.map((b) => b.folder_path[0]));

  assert.equal(roots.size, EXPECTED_ROOT_COUNT);
  assert.ok(roots.has('Favorites'), 'expected a Favorites root');
  assert.ok(roots.has('Bookmarks Menu'), 'expected a Bookmarks Menu root');
});

test('Safari: 0 orphans (no bookmark with an empty folder_path)', { skip }, () => {
  const { bookmarks } = loadFixture();
  const orphans = bookmarks.filter((b) => b.folder_path.length === 0);
  assert.equal(
    orphans.length,
    0,
    `expected 0 orphans, found ${orphans.length}`
  );
});

test('Safari: nested path Favorites / work / SEO is present', { skip }, () => {
  const { bookmarks } = loadFixture();
  const match = bookmarks.find(
    (b) =>
      b.folder_path[0] === 'Favorites' &&
      b.folder_path[1] === 'work' &&
      b.folder_path[2] === 'SEO'
  );
  assert.ok(
    match,
    'expected at least one bookmark whose folder_path starts with [Favorites, work, SEO]'
  );
});

test('Safari: 0 bookmarks have a truthy add_date', { skip }, () => {
  const { bookmarks } = loadFixture();
  const dated = bookmarks.filter((b) => b.add_date);
  assert.equal(dated.length, 0, `expected 0 dated bookmarks, found ${dated.length}`);
});

test('Safari: detected source is safari', { skip }, () => {
  const { source } = loadFixture();
  assert.equal(source, 'safari');
});
