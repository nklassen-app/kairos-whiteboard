// DOM-level tests for the Whiteboard. index.html is booted in jsdom under a
// fixed clock; each test gets a fresh window and a fresh localStorage.
//
//   cd tests && npm install && npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const KEY = 'whiteboard:v1';
const NOW = new Date('2026-09-20T10:00:00.000Z').getTime();
const DAY = 86400000;

function boot({ seed = null } = {}) {
  let copied = null;
  const dom = new JSDOM(HTML, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      const Real = window.Date;
      class Fixed extends Real {
        constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
        static now() { return NOW; }
      }
      window.Date = Fixed;
      Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: t => { copied = t; return Promise.resolve(); } }, configurable: true });
      if (seed) window.localStorage.setItem(KEY, JSON.stringify(seed));
    },
  });
  const w = dom.window, d = w.document;
  return {
    w,
    $: s => d.querySelector(s),
    $$: s => [...d.querySelectorAll(s)],
    stored: () => JSON.parse(w.localStorage.getItem(KEY)),
    copied: () => copied,
    type(text) { const f = d.getElementById('field'); f.value = text; f.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); },
    click: s => d.querySelector(s).click(),
    tick: () => new Promise(r => setTimeout(r, 0)),
  };
}

test('a fresh board is empty and the version marker matches the worker cache name', () => {
  const h = boot();
  assert.match(h.$('#active').textContent, /Nothing here/);
  assert.equal(h.$('#count').textContent, '0 / 7');
  assert.equal(h.$('.ver').textContent, SW.match(/const CACHE = '([^']+)'/)[1]);
});

test('pushing a task to Now stamps when, and the row says "today"', () => {
  const h = boot();
  h.type('Call the dentist');
  assert.equal(h.$('#backlog .age'), null, 'backlog rows carry no age');
  h.click('[data-push]');
  const t = h.stored().active[0];
  assert.equal(t.since, NOW);
  assert.equal(h.$('#active .age').textContent, 'today');
});

test('the age counts whole days since the push', () => {
  const h = boot({ seed: { active: [
    { id: 'a', text: 'A', since: NOW - 26 * 3600 * 1000 },
    { id: 'b', text: 'B', since: NOW - 5 * DAY - 1000 },
    { id: 'c', text: 'C', since: NOW - 3600 * 1000 },
  ], backlog: [] } });
  assert.deepEqual(h.$$('#active .age').map(e => e.textContent), ['1 day', '5 days', 'today']);
});

test('the day turns over at midnight, not 24 rolling hours after the push', () => {
  // NOW is 2026-09-20T10:00:00Z. A task pushed up late the previous
  // calendar day (2026-09-19T23:00:00Z) is only 11 hours old, but it was
  // pushed up on a different date, so it already reads "1 day" — this is
  // the case that a plain (Date.now() - since) / DAY got wrong.
  const h = boot({ seed: { active: [
    { id: 'a', text: 'A', since: NOW - 11 * 3600 * 1000 },
  ], backlog: [] } });
  assert.equal(h.$('#active .age').textContent, '1 day');
});

test('tasks on Now from before there was a stamp are stamped at load and saved', () => {
  const h = boot({ seed: { active: [{ id: 'old', text: 'Old one' }], backlog: [{ id: 'b', text: 'Waiting' }] } });
  assert.equal(h.stored().active[0].since, NOW);
  assert.equal(h.stored().backlog[0].since, undefined);
  assert.equal(h.$('#active .age').textContent, 'today');
});

test('copy puts the text on the clipboard; a Now task adds how long it has sat there; the button says so briefly', async () => {
  const h = boot({ seed: { active: [{ id: 'a', text: 'Fix the gate latch', since: NOW - 3 * DAY }], backlog: [{ id: 'b', text: 'Buy stamps' }] } });
  h.click('#backlog [data-copy="b"]');
  await h.tick();
  assert.equal(h.copied(), 'Buy stamps');
  h.click('#active [data-copy="a"]');
  await h.tick();
  assert.equal(h.copied(), "Fix the gate latch\nOn the Whiteboard's Now list for 3 days.");
  assert.equal(h.$('#active [data-copy="a"]').textContent, 'copied');
  await new Promise(r => setTimeout(r, 1300));
  assert.equal(h.$('#active [data-copy="a"]').textContent, 'copy');
});

test('the rest is as it was: edit in place, the cap of seven, the tick deletes', async () => {
  const h = boot({ seed: { active: [1, 2, 3, 4, 5, 6, 7].map(i => ({ id: 'a' + i, text: 'T' + i, since: NOW })), backlog: [{ id: 'b', text: 'Eighth' }] } });
  assert.equal(h.$('[data-push]').disabled, true);
  h.click('[data-done="a1"]');
  await new Promise(r => setTimeout(r, 600));
  assert.equal(h.stored().active.length, 6);
  assert.equal(h.$('[data-push]').disabled, false);
  h.click('[data-edit="b"]');
  const input = h.$('input.edit'); input.value = 'Eighth, edited';
  input.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(h.stored().backlog[0].text, 'Eighth, edited');
});
