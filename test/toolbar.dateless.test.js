// Dateless-file Age dropdown test (SAFARI-SPEC.md section 5.3 / 6.5).
//
// Exercises the real, exported syncAgeAvailability() against a minimal jsdom
// document — no full app boot, no store.js, no event wiring — just the
// decision logic that toggles select.disabled based on whether the current
// bookmark set has any parseable add_date. A full page-interaction harness
// is out of scope per the task brief; this is the cheap, correct slice of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><select id="filter-age"></select>');
global.document = dom.window.document;

const { syncAgeAvailability } = await import('../public/app/ui/toolbar.js');

function ageSelect() {
  return dom.window.document.getElementById('filter-age');
}

test('syncAgeAvailability disables the Age dropdown when zero bookmarks have a parseable add_date (Safari case)', () => {
  syncAgeAvailability([{ add_date: '' }, { add_date: null }, {}]);
  assert.equal(ageSelect().disabled, true);
});

test('syncAgeAvailability enables the Age dropdown when at least one bookmark has a parseable add_date (Chrome case)', () => {
  syncAgeAvailability([{ add_date: '1700000000' }, { add_date: '' }]);
  assert.equal(ageSelect().disabled, false);
});

test('syncAgeAvailability re-disables on a later dateless load (loading Safari after Chrome)', () => {
  syncAgeAvailability([{ add_date: '1700000000' }]);
  assert.equal(ageSelect().disabled, false);
  syncAgeAvailability([{ add_date: '' }, { add_date: '' }]);
  assert.equal(ageSelect().disabled, true);
});

test('syncAgeAvailability treats an empty bookmark list as dateless', () => {
  assert.doesNotThrow(() => syncAgeAvailability([]));
  assert.equal(ageSelect().disabled, true);
});
