// Export profile test — proves SAFARI-SPEC.md section 5.2. Two profiles:
// netscape (today's behavior, unchanged) and safari (round-trips into
// Safari by naming the toolbar root exactly "Favorites"). Only
// buildExportHtml is exercised here — it's pure string-building. downloadExport
// touches document/Blob/URL and is not tested in Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExportHtml, PROFILES } from '../public/app/exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFARI_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'safari-2026-09-06.html');
const CHROME_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'chrome-2026-04-30.html');

// The fixtures are Mike's real personal bookmark exports and are
// deliberately not committed to this public repo (see .gitignore and
// SAFARI-SPEC.md section 2). Skip rather than fail when they're absent, so a
// fresh clone's test suite still passes.
const skipRoundTrip = fs.existsSync(SAFARI_FIXTURE_PATH)
  ? false
  : 'test/fixtures/safari-2026-09-06.html not present locally (real personal bookmarks, not committed — see SAFARI-SPEC.md section 2)';

const skipSafariFixture = skipRoundTrip;

const skipChromeFixture = fs.existsSync(CHROME_FIXTURE_PATH)
  ? false
  : 'test/fixtures/chrome-2026-04-30.html not present locally (real personal bookmarks, not committed — see SAFARI-SPEC.md section 2)';

function bm(url, title, folder_path) {
  return { url, title, folder_path };
}

test('Netscape profile: unchanged from today — Bookmarks Bar gets the toolbar attribute, root order is Bookmarks Bar, Other Bookmarks, Mobile Bookmarks, then alphabetical', () => {
  const bookmarks = [
    bm('https://a.example', 'A', ['Bookmarks Bar']),
    bm('https://b.example', 'B', ['Other Bookmarks']),
    bm('https://c.example', 'C', ['Mobile Bookmarks']),
    bm('https://d.example', 'D', ['Zebra']),
    bm('https://e.example', 'E', ['Apple']),
  ];

  const html = buildExportHtml(bookmarks, PROFILES.netscape);

  // Bookmarks Bar carries PERSONAL_TOOLBAR_FOLDER="true".
  assert.match(html, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar<\/H3>/);
  // No other folder gets the attribute.
  const attrCount = (html.match(/PERSONAL_TOOLBAR_FOLDER="true"/g) || []).length;
  assert.equal(attrCount, 1);

  // Root order: Bookmarks Bar, Other Bookmarks, Mobile Bookmarks, then
  // alphabetical (Apple, Zebra).
  const order = ['Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks', 'Apple', 'Zebra'];
  const positions = order.map((name) => html.indexOf(`>${name}<`));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i - 1] < positions[i], `expected ${order[i - 1]} before ${order[i]}`);
  }
});

test('Netscape profile is the default when no profile argument is given', () => {
  const bookmarks = [bm('https://a.example', 'A', ['Bookmarks Bar'])];
  const html = buildExportHtml(bookmarks);
  assert.match(html, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar<\/H3>/);
});

test('Safari profile: Favorites gets the toolbar attribute, root order is Favorites, Bookmarks Menu, then alphabetical', () => {
  const bookmarks = [
    bm('https://a.example', 'A', ['Favorites']),
    bm('https://b.example', 'B', ['Bookmarks Menu']),
    bm('https://c.example', 'C', ['Zebra']),
    bm('https://d.example', 'D', ['Apple']),
  ];

  const html = buildExportHtml(bookmarks, PROFILES.safari);

  // Favorites carries PERSONAL_TOOLBAR_FOLDER="true" — harmless for Safari
  // (which matches by name only) but free Chromium compatibility.
  assert.match(html, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Favorites<\/H3>/);
  const attrCount = (html.match(/PERSONAL_TOOLBAR_FOLDER="true"/g) || []).length;
  assert.equal(attrCount, 1);

  const order = ['Favorites', 'Bookmarks Menu', 'Apple', 'Zebra'];
  const positions = order.map((name) => html.indexOf(`>${name}<`));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i - 1] < positions[i], `expected ${order[i - 1]} before ${order[i]}`);
  }
});

test('Safari round-trip: real Safari fixture parses, exports with the Safari profile, and re-parses to the same 138 bookmarks with identical folder paths', { skip: skipRoundTrip }, async () => {
  // Import parser.js only after installing the jsdom DOMParser global, same
  // pattern as test/parser.safari.test.js.
  await import('./helpers/dom.js');
  const { parseBookmarks } = await import('../public/app/parser.js');

  const originalHtml = fs.readFileSync(SAFARI_FIXTURE_PATH, 'utf8');

  const { bookmarks: original, source } = parseBookmarks(originalHtml);
  assert.equal(source, 'safari');
  assert.equal(original.length, 138);

  const exportedHtml = buildExportHtml(original, PROFILES.safari);

  // Favorites root is present with the toolbar attribute in the exported file.
  assert.match(exportedHtml, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Favorites<\/H3>/);

  const { bookmarks: reparsed } = parseBookmarks(exportedHtml);
  assert.equal(reparsed.length, 138);

  const key = (b) => `${b.folder_path.join('/')}|${b.url}|${b.title}`;
  const originalKeys = new Set(original.map(key));
  const reparsedKeys = new Set(reparsed.map(key));

  assert.equal(originalKeys.size, 138);
  assert.equal(reparsedKeys.size, 138);
  assert.deepEqual(
    [...reparsedKeys].sort(),
    [...originalKeys].sort(),
    'round-tripped bookmarks (by folder_path + url + title) should match the originals exactly'
  );
});

// ---------------------------------------------------------------------
// Cross-browser export (SAFARI-SPEC.md section 5.2 addendum): renaming the
// toolbar root, not just moving the PERSONAL_TOOLBAR_FOLDER attribute.
// ---------------------------------------------------------------------

test('synthetic Chrome-sourced list exported as Safari: toolbar root renamed to Favorites, Bookmarks Bar no longer appears as a root', () => {
  const bookmarks = [
    bm('https://a.example', 'A', ['Bookmarks Bar']),
    bm('https://b.example', 'B', ['Bookmarks Bar', 'Sub']),
    bm('https://c.example', 'C', ['Other Bookmarks']),
  ];

  const html = buildExportHtml(bookmarks, PROFILES.safari, PROFILES.netscape);

  assert.match(html, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Favorites<\/H3>/);
  // Bookmarks Bar should not survive as a root folder name.
  assert.ok(!/<H3[^>]*>Bookmarks Bar<\/H3>/.test(html), 'Bookmarks Bar should have been renamed away');
});

test('synthetic Safari-sourced list exported as Netscape: toolbar root renamed to Bookmarks Bar', () => {
  const bookmarks = [
    bm('https://a.example', 'A', ['Favorites']),
    bm('https://b.example', 'B', ['Favorites', 'Sub']),
    bm('https://c.example', 'C', ['Bookmarks Menu']),
  ];

  const html = buildExportHtml(bookmarks, PROFILES.netscape, PROFILES.safari);

  assert.match(html, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar<\/H3>/);
  assert.ok(!/<H3[^>]*>Favorites<\/H3>/.test(html), 'Favorites should have been renamed away');
});

test('Safari fixture exported as Netscape yields a "Bookmarks Bar" root with the toolbar attribute', { skip: skipSafariFixture }, async () => {
  await import('./helpers/dom.js');
  const { parseBookmarks } = await import('../public/app/parser.js');

  const html = fs.readFileSync(SAFARI_FIXTURE_PATH, 'utf8');
  const { bookmarks, source } = parseBookmarks(html);
  assert.equal(source, 'safari');
  assert.equal(bookmarks.length, 138);

  const exportedHtml = buildExportHtml(bookmarks, PROFILES.netscape, PROFILES.safari);

  assert.match(exportedHtml, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar<\/H3>/);
  // The toolbar root (Favorites) was renamed away, so it should not appear
  // as a root-level folder name. (Nested folders elsewhere in the tree that
  // happen to share names are not asserted on here.)
  assert.ok(
    !/<H3[^>]*>Favorites<\/H3>/.test(exportedHtml),
    'Favorites root should have been renamed to Bookmarks Bar'
  );
});

test('Chrome fixture exported as Safari yields a "Favorites" root', { skip: skipChromeFixture }, async () => {
  await import('./helpers/dom.js');
  const { parseBookmarks } = await import('../public/app/parser.js');

  const html = fs.readFileSync(CHROME_FIXTURE_PATH, 'utf8');
  const { bookmarks, source } = parseBookmarks(html);
  assert.equal(source, 'netscape');
  assert.equal(bookmarks.length, 519);

  const exportedHtml = buildExportHtml(bookmarks, PROFILES.safari, PROFILES.netscape);

  assert.match(exportedHtml, /<H3 PERSONAL_TOOLBAR_FOLDER="true">Favorites<\/H3>/);
});

test('Auto output unchanged for Safari fixture: 3-arg call with matching source/target profile is byte-for-byte identical to the legacy 2-arg call', { skip: skipSafariFixture }, async () => {
  await import('./helpers/dom.js');
  const { parseBookmarks } = await import('../public/app/parser.js');

  const html = fs.readFileSync(SAFARI_FIXTURE_PATH, 'utf8');
  const { bookmarks, source } = parseBookmarks(html);
  assert.equal(source, 'safari');

  const legacy = buildExportHtml(bookmarks, PROFILES.safari);
  const explicit = buildExportHtml(bookmarks, PROFILES.safari, PROFILES.safari);

  assert.equal(explicit, legacy, 'Auto (matching source/target profile) must be byte-for-byte identical to the 2-arg call');
});

test('Auto output unchanged for Chrome fixture: 3-arg call with matching source/target profile is byte-for-byte identical to the legacy 2-arg call', { skip: skipChromeFixture }, async () => {
  await import('./helpers/dom.js');
  const { parseBookmarks } = await import('../public/app/parser.js');

  const html = fs.readFileSync(CHROME_FIXTURE_PATH, 'utf8');
  const { bookmarks, source } = parseBookmarks(html);
  assert.equal(source, 'netscape');

  const legacy = buildExportHtml(bookmarks, PROFILES.netscape);
  const explicit = buildExportHtml(bookmarks, PROFILES.netscape, PROFILES.netscape);

  assert.equal(explicit, legacy, 'Auto (matching source/target profile) must be byte-for-byte identical to the 2-arg call');
});
