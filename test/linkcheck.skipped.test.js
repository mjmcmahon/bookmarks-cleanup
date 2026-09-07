// Simulated full-check regression test for the 'skipped' status (spec 5.5).
//
// There's no live server in this test harness (functions/api/check-links.js
// is a Cloudflare Pages Function, not invokable under plain `node --test`),
// so this test simulates what the server would return for each bookmark in
// the real Safari fixture — replicating only the scheme-check slice of
// probe()'s logic — then feeds each synthesized result through the actual
// classifyResult() reclassification exported from linkcheck-client.js, and
// applies the results to a plain local reduction over the parsed bookmarks.
//
// This proves: every one of the 138 bookmarks ends up with some non-
// 'unchecked' status after a full check, and the bookmarks with a non-
// http(s) scheme (feed://, javascript:) land in 'skipped', not 'error'.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './helpers/dom.js';
import { parseBookmarks } from '../public/app/parser.js';
import { classifyResult } from '../public/app/linkcheck-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'safari-2026-09-06.html');

const EXPECTED_TOTAL = 138;

// The fixture is Mike's real Safari export and is deliberately not committed
// to this public repo (see .gitignore and SAFARI-SPEC.md section 2). Skip
// rather than fail when it's absent, so a fresh clone's test suite still
// passes.
const skip = fs.existsSync(FIXTURE_PATH)
  ? false
  : 'test/fixtures/safari-2026-09-06.html not present locally (real personal bookmarks, not committed — see SAFARI-SPEC.md section 2)';

function loadFixtureBookmarks() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const { bookmarks } = parseBookmarks(html);
  return bookmarks;
}

/**
 * Replicate just the scheme-check slice of functions/api/check-links.js's
 * probe() — the part relevant to this test. For http(s) URLs we don't
 * actually hit the network (that's not what this test is verifying); we
 * synthesize a plausible 'alive' result, since the job here is to verify
 * the classification/reclassification pipeline, not real network behavior.
 */
function simulateProbe(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, status: 'error', code: null, reason: 'Invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url,
      status: 'error',
      code: null,
      reason: `Unsupported scheme (${parsed.protocol})`,
    };
  }
  return { url, status: 'alive', code: 200, reason: null };
}

/**
 * Run a simulated full check over every bookmark, applying the SAME
 * reclassification logic used in production (classifyResult, imported
 * above) to each synthesized server result before recording the status.
 * Mirrors store.resetStatuses() + store.applyStatus() without needing the
 * real store.js singleton (its module-level state is awkward to reset
 * between test files).
 */
function runSimulatedCheck(bookmarks) {
  const statusById = new Map();
  for (const b of bookmarks) statusById.set(b._id, 'unchecked');

  for (const b of bookmarks) {
    if (!b.url) continue;
    const raw = simulateProbe(b.url);
    classifyResult(raw); // same reclassification as linkcheck-client.checkLinks
    statusById.set(b._id, raw.status);
  }

  return statusById;
}

test('Simulated full check: 36 skipped (non-http schemes), 0 left unchecked', { skip }, () => {
  const bookmarks = loadFixtureBookmarks();
  assert.equal(bookmarks.length, EXPECTED_TOTAL);

  // Count actual non-http(s) URLs in the real fixture — verify rather than
  // hard-code, per the task's instruction to trust the real parse output.
  let expectedSkipped = 0;
  for (const b of bookmarks) {
    let scheme;
    try {
      scheme = new URL(b.url).protocol;
    } catch {
      scheme = 'invalid';
    }
    if (scheme !== 'http:' && scheme !== 'https:') expectedSkipped++;
  }
  assert.equal(expectedSkipped, 36, 'expected 36 non-http(s) URLs in the real fixture');

  const statusById = runSimulatedCheck(bookmarks);

  let skipped = 0;
  let unchecked = 0;
  let other = 0;
  for (const status of statusById.values()) {
    if (status === 'skipped') skipped++;
    else if (status === 'unchecked') unchecked++;
    else other++;
  }

  assert.equal(skipped, expectedSkipped, `expected ${expectedSkipped} skipped`);
  assert.equal(unchecked, 0, 'expected 0 bookmarks left unchecked after a full check');
  assert.equal(skipped + other, EXPECTED_TOTAL);
});

test('classifyResult: relabels "Unsupported scheme" errors to skipped, leaves other statuses untouched', () => {
  const feedResult = {
    url: 'feed://example.com/rss',
    status: 'error',
    code: null,
    reason: 'Unsupported scheme (feed:)',
  };
  classifyResult(feedResult);
  assert.equal(feedResult.status, 'skipped');

  const jsResult = {
    url: 'javascript:alert(1)',
    status: 'error',
    code: null,
    reason: 'Unsupported scheme (javascript:)',
  };
  classifyResult(jsResult);
  assert.equal(jsResult.status, 'skipped');

  const aliveResult = { url: 'https://example.com', status: 'alive', code: 200, reason: null };
  classifyResult(aliveResult);
  assert.equal(aliveResult.status, 'alive');

  const timeoutResult = { url: 'https://example.com', status: 'error', code: null, reason: 'Timeout' };
  classifyResult(timeoutResult);
  assert.equal(timeoutResult.status, 'error');

  const deadResult = { url: 'https://example.com', status: 'dead', code: 404, reason: 'HTTP 404' };
  classifyResult(deadResult);
  assert.equal(deadResult.status, 'dead');
});
