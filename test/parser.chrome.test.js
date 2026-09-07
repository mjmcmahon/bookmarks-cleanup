// Chrome regression test — the safety net for the Safari support fix
// (SAFARI-SPEC.md section 5.1). Chrome exports wrap the whole tree in a
// single `body > dl`, which is the case parser.js already handles
// correctly. The upcoming Safari fix (root discovery for browsers that
// don't emit that wrapper) is purely additive per the spec, so this
// fixture's output must be byte-for-byte identical before and after that
// change: same count, same folder paths, same order.
//
// This test must exist and pass BEFORE parser.js is touched for Safari
// support (see SAFARI-SPEC.md section 6, item 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './helpers/dom.js';
import { parseBookmarks } from '../public/app/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'chrome-2026-04-30.html');
const SNAPSHOT_PATH = path.join(
  __dirname,
  'fixtures',
  'chrome-2026-04-30.expected.json'
);

const EXPECTED_COUNT = 519;

// The fixture is a real personal bookmarks export and is deliberately not
// committed to this public repo (see .gitignore and SAFARI-SPEC.md section
// 2). Skip rather than fail when it's absent, so a fresh clone's test suite
// still passes.
const skip =
  fs.existsSync(FIXTURE_PATH) && fs.existsSync(SNAPSHOT_PATH)
    ? false
    : 'test/fixtures/chrome-2026-04-30.html not present locally (real personal bookmarks, not committed — see SAFARI-SPEC.md section 2)';

function loadFixture() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return parseBookmarks(html).bookmarks;
}

function loadSnapshot() {
  const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
  return JSON.parse(raw);
}

test('Chrome regression: parses exactly 519 bookmarks', { skip }, () => {
  const bookmarks = loadFixture();
  assert.equal(bookmarks.length, EXPECTED_COUNT);
});

test('Chrome regression: matches the known-good snapshot key-by-key, in order', { skip }, () => {
  const bookmarks = loadFixture();
  const snapshot = loadSnapshot();

  assert.equal(
    snapshot.length,
    EXPECTED_COUNT,
    'snapshot fixture itself should contain exactly 519 entries'
  );

  const actual = bookmarks.map((b) => ({
    folder_path: b.folder_path,
    url: b.url,
    title: b.title,
  }));

  assert.deepEqual(
    actual,
    snapshot,
    'live parse of the Chrome fixture no longer matches the pre-fix snapshot — ' +
      'the Safari fix must be purely additive for body > dl documents'
  );
});

test('Chrome regression: detected source is netscape', { skip }, () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const { source } = parseBookmarks(html);
  assert.equal(source, 'netscape');
});

test('Chrome regression: this fixture has the normal body > dl wrapper (unaffected by the Safari fix)', { skip }, () => {
  // Sanity check on the fixture itself, not the parser: this is the
  // "normal/unbroken" case the spec says the Safari root-discovery change
  // must leave untouched. If this ever stops being true, this test file is
  // no longer testing what it claims to.
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  assert.ok(
    doc.querySelector('body > dl'),
    'expected the Chrome fixture to have a body > dl wrapper'
  );
});
