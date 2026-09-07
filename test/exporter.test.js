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

// The fixture is Mike's real Safari export and is deliberately not committed
// to this public repo (see .gitignore and SAFARI-SPEC.md section 2). Skip
// rather than fail when it's absent, so a fresh clone's test suite still
// passes.
const skipRoundTrip = fs.existsSync(SAFARI_FIXTURE_PATH)
  ? false
  : 'test/fixtures/safari-2026-09-06.html not present locally (real personal bookmarks, not committed — see SAFARI-SPEC.md section 2)';

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
