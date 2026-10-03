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

test('the rest is as it was: edit in place, the cap of seven; the tick frees a slot', async () => {
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

// --- W1: the archive -------------------------------------------------------
// Made-up programs only: real program names never enter this public repo.

test('the tick moves a task to the archive, stamped with when, newest first', async () => {
  const h = boot({ seed: { active: [
    { id: 'a', text: 'Fix the gate latch', since: NOW - DAY },
    { id: 'b', text: 'Return the library books', since: NOW },
  ], backlog: [], archive: [{ id: 'old', text: 'Paint the shed', done: NOW - 3 * DAY }] } });
  h.click('[data-done="a"]');
  await new Promise(r => setTimeout(r, 600));
  const s = h.stored();
  assert.deepEqual(s.active.map(t => t.id), ['b']);
  assert.deepEqual(s.archive.map(t => t.id), ['a', 'old']);
  assert.equal(s.archive[0].done, NOW);
  assert.equal(s.archive[0].since, undefined, 'the Now stamp does not travel to the archive');
  assert.equal(h.$('#archive-head').textContent, 'Archive · 2');
  assert.deepEqual(h.$$('#archive .row').map(r => r.textContent.trim().split(/\s{2,}|\n/)[0]), ['Fix the gate latch20 Sept', 'Paint the shed17 Sept']);
});

test('an older board without an archive opens and starts one; the archive survives a reload', async () => {
  const seed = { active: [{ id: 'a', text: 'Oil the hinges', since: NOW }], backlog: [] };
  const h = boot({ seed });
  assert.equal(h.$('#archive-head').textContent, 'Archive · 0');
  assert.match(h.$('#archive').textContent, /Nothing ticked off yet/);
  h.click('[data-done="a"]');
  await new Promise(r => setTimeout(r, 600));
  const again = boot({ seed: h.stored() });
  assert.equal(again.$('#archive-head').textContent, 'Archive · 1');
  assert.match(again.$('#archive').textContent, /Oil the hinges/);
});

test('an archived task from another year shows the year', () => {
  const h = boot({ seed: { active: [], backlog: [], archive: [{ id: 'x', text: 'Old one', done: new Date('2025-12-30T12:00:00Z').getTime() }] } });
  assert.match(h.$('#archive .meta').textContent, /30 Dec 2025/);
});

// --- W2: programs -----------------------------------------------------------

function addPrograms(h, text) {
  h.$('#prog-field').value = text;
  h.click('#prog-add');
}

test('no program list, no picker; programs are added one at a time or pasted as a list', () => {
  const h = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'Sort the toolbox' }] } });
  assert.equal(h.$('[data-prog]'), null, 'no picker before there are programs');
  assert.equal(h.$('#programs-head').textContent, 'Programs · 0');
  addPrograms(h, 'Garden Revival');
  addPrograms(h, 'List:\n- Harbor Walks\n• Kitchen Lab\n\n1. garden revival\n  Book Club  ');
  // The heading line ("List:") is skipped, the duplicate (any case) too; bullets are stripped.
  assert.deepEqual(h.stored().programs.map(p => p.name), ['Garden Revival', 'Harbor Walks', 'Kitchen Lab', 'Book Club']);
  assert.equal(h.$('#programs-head').textContent, 'Programs · 4');
  assert.equal(h.$('#prog-field').value, '');
  assert.ok(h.$('[data-prog="b"]'), 'the picker appears once there are programs');
});

test('a task picks a program, the row shows it, and it stays with the task into the archive', async () => {
  const h = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'Prune the roses' }], programs: [{ id: 'p1', name: 'Garden Revival' }, { id: 'p2', name: 'Kitchen Lab' }] } });
  const sel = h.$('[data-prog="b"]');
  assert.deepEqual([...sel.options].map(o => o.textContent), ['no program', 'Garden Revival', 'Kitchen Lab']);
  sel.value = 'p1';
  sel.dispatchEvent(new h.w.Event('change', { bubbles: true }));
  assert.equal(h.stored().backlog[0].program, 'p1');
  assert.equal(h.$('[data-prog="b"]').value, 'p1');
  assert.ok(h.$('[data-prog="b"]').classList.contains('set'));
  h.click('[data-push="b"]');
  assert.equal(h.$('#active [data-prog="b"]').value, 'p1', 'the program travels to Now');
  h.click('[data-done="b"]');
  await new Promise(r => setTimeout(r, 600));
  assert.equal(h.stored().archive[0].program, 'p1');
  assert.match(h.$('#archive .meta').textContent, /20 Sept · Garden Revival/);
  // Clearing back to "no program" removes it.
  const h2 = boot({ seed: { active: [], backlog: [{ id: 'c', text: 'C', program: 'p1' }], programs: [{ id: 'p1', name: 'Garden Revival' }] } });
  const s2 = h2.$('[data-prog="c"]'); s2.value = '';
  s2.dispatchEvent(new h2.w.Event('change', { bubbles: true }));
  assert.equal(h2.stored().backlog[0].program, undefined);
});

test('a program is renamed by tapping it, and every task shows the new name', () => {
  const h = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'B', program: 'p1' }], programs: [{ id: 'p1', name: 'Garden Revivel' }] } });
  h.click('[data-prog-edit="p1"]');
  const input = h.$('input.edit'); input.value = 'Garden Revival';
  input.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(h.stored().programs[0].name, 'Garden Revival');
  assert.equal(h.$('[data-prog="b"]').selectedOptions[0].textContent, 'Garden Revival');
});
