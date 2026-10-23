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

test('a board that never had a program list starts with the default list, saved; a started list is left alone', () => {
  const fresh = boot();
  const names = fresh.stored().programs.map(p => p.name);
  assert.equal(names.length, 11);
  assert.equal(fresh.$('#programs-head').textContent, 'Programs · 11');
  const older = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'B' }] } });
  assert.deepEqual(older.stored().programs.map(p => p.name), names, 'an older board without the key gets it too');
  assert.equal(older.$('[data-prog="b"]').options.length, 12, 'no program + the eleven');
  const started = boot({ seed: { active: [], backlog: [], programs: [{ id: 'p1', name: 'Garden Revival' }] } });
  assert.deepEqual(started.stored().programs.map(p => p.name), ['Garden Revival']);
});

test('an empty program list means no picker; programs are added one at a time or pasted as a list', () => {
  const h = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'Sort the toolbox' }], programs: [] } });
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

/* ---- Export for agent (Agent design 5) ---- */

// NOW is Sunday 2026-09-20; the week started Monday 2026-09-14.
const PROGRAMS = ['Health', 'Family', 'Wider family', 'Adventures', 'Creative Home', 'Foundations',
  'Advisory board', 'House as lab', 'Nature retreat', 'Home support team', 'School prep'].map((name, i) => ({ id: 'd' + i, name }));
const EXPORT_BOARD = () => ({
  programs: PROGRAMS.concat({ id: 'zz', name: 'Added later' }),
  active: [
    { id: 'a1', text: 'Fix the gate latch', program: 'd4', since: NOW - 3 * DAY },
    { id: 'a2', text: 'PRIVATE health task', program: 'd0', since: NOW },
    { id: 'a3', text: 'PRIVATE no-program task', since: NOW },
  ],
  backlog: [
    { id: 'b1', text: 'Brief the cleaner', program: 'd9' },
    { id: 'b2', text: 'PRIVATE school task', program: 'd10' },
    { id: 'b3', text: 'PRIVATE family task', program: 'd5' },
    { id: 'b4', text: 'PRIVATE added-program task', program: 'zz' },
    { id: 'b5', text: 'PRIVATE wider-family task', program: 'd2' },
    { id: 'b6', text: 'PRIVATE family endeavour', program: 'd1' },
  ],
  archive: [
    { id: 'x1', text: 'ARCHIVED this week', program: 'd4', done: NOW - 2 * DAY },
    { id: 'x2', text: 'ARCHIVED private this week', program: 'd0', done: NOW - 6 * DAY + 3600 * 1000 },
    { id: 'x3', text: 'ARCHIVED last week', program: 'd4', done: NOW - 8 * DAY },
  ],
});
function exportDoc(h) {
  h.click('#export');
  return JSON.parse(h.$('#export-doc').textContent);
}

test('Export for agent shows, before anything is copied, the shared tasks on Now and the backlog, the week\'s count and the held-back count', () => {
  const h = boot({ seed: EXPORT_BOARD() });
  assert.ok(h.$('#export-box').hidden, 'nothing shown until tapped');
  const x = exportDoc(h);
  assert.ok(!h.$('#export-box').hidden);
  assert.match(h.$('.export').textContent, /This is what leaves the phone/);
  assert.deepEqual(x, {
    app: 'whiteboard', exported: '2026-09-20', about: x.about,
    now: [{ text: 'Fix the gate latch', program: 'Creative Home', days_on_now: 3 }],
    next: [{ text: 'Brief the cleaner', program: 'Home support team' }],
    done_this_week: 2,
    held_back: 7,
  });
  assert.match(h.$('#export-note').textContent, /7 held back/);
  assert.equal(h.copied(), null, 'nothing copied by opening it');
});

test('held-back tasks never appear: the private defaults, an added program, no program; nor the archive\'s text, ids or timestamps', () => {
  const h = boot({ seed: EXPORT_BOARD() });
  h.click('#export');
  const text = h.$('#export-doc').textContent;
  for (const s of ['PRIVATE', 'ARCHIVED', 'Health', 'Family', 'School', 'Added later', '"id"', 'since', '"done"', String(NOW).slice(0, 6)])
    assert.ok(!text.includes(s), `"${s}" is not in the export`);
  for (const id of ['a1', 'a2', 'b1', 'x1', 'd4', 'd9', 'zz'])
    assert.doesNotMatch(text, new RegExp(`"${id}"`), `id ${id} is not in the export`);
});

test('a held-back program stays held back after a rename; a shared one is exported under its new name', () => {
  const board = EXPORT_BOARD();
  board.programs.find(p => p.id === 'd10').name = 'Creative projects';
  board.programs.find(p => p.id === 'd4').name = 'Home studio';
  const h = boot({ seed: board });
  const x = exportDoc(h);
  assert.ok(!JSON.stringify(x).includes('PRIVATE'));
  assert.equal(x.now[0].program, 'Home studio');
  assert.equal(x.held_back, 7);
});

test('Copy puts exactly the shown document on the clipboard; Close hides it; nothing is stored', async () => {
  const seed = EXPORT_BOARD();
  const h = boot({ seed });
  h.click('#export');
  const shown = h.$('#export-doc').textContent;
  h.click('#export-copy');
  await h.tick();
  assert.equal(h.copied(), shown);
  assert.equal(h.$('#export-copy').textContent, 'Copied');
  h.click('#export-close');
  assert.ok(h.$('#export-box').hidden);
  assert.deepEqual(h.stored(), seed, 'the export changes nothing stored');
});

test('the open export follows the board: a task pushed to Now moves from next to now', () => {
  const h = boot({ seed: EXPORT_BOARD() });
  h.click('#export');
  h.click('[data-push="b1"]');
  const x = JSON.parse(h.$('#export-doc').textContent);
  assert.deepEqual(x.next, []);
  assert.deepEqual(x.now.map(t => t.text), ['Fix the gate latch', 'Brief the cleaner']);
});
