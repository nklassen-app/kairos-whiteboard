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

function boot({ seed = null, store = {}, fetch = null } = {}) {
  let copied = null;
  const calls = [];
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
      for (const [k, v] of Object.entries(store)) window.localStorage.setItem(k, JSON.stringify(v));
      // No test ever reaches the network: every call is recorded, and
      // answered by the test's own stub (or refused, as if offline).
      window.fetch = (url, opts = {}) => { calls.push({ url, opts }); return fetch ? fetch(url, opts) : Promise.reject(new Error('offline')); };
    },
  });
  const w = dom.window, d = w.document;
  return {
    w,
    $: s => d.querySelector(s),
    $$: s => [...d.querySelectorAll(s)],
    stored: () => JSON.parse(w.localStorage.getItem(KEY)),
    copied: () => copied,
    calls,
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

test('nothing stays on Now past five days: at the sixth it goes back to the top of the backlog, unstamped, and says so', () => {
  const h = boot({ seed: { active: [
    { id: 'a', text: 'Five days, stays', since: NOW - 5 * DAY },
    { id: 'b', text: 'Six days, goes back', since: NOW - 6 * DAY, program: 'p' },
    { id: 'c', text: 'Today, stays', since: NOW },
  ], backlog: [{ id: 'x', text: 'Already waiting' }], programs: [{ id: 'p', name: 'Garden' }] } });
  const s = h.stored();
  assert.deepEqual(s.active.map(t => t.id), ['a', 'c']);
  assert.deepEqual(s.backlog.map(t => t.id), ['b', 'x']);
  assert.equal(s.backlog[0].since, undefined, 'the Now stamp is cleared');
  assert.equal(s.backlog[0].program, 'p', 'the task keeps its program');
  assert.deepEqual(h.$$('#active .age').map(e => e.textContent), ['5 days', 'today']);
  assert.match(h.$('#status').textContent, /1 task back from Now after 5 days/);
  assert.ok(!h.$('[data-push="b"]').disabled, 'it can be pushed up again');
});

test('the send-back also runs when the app comes back to the front', () => {
  const h = boot({ seed: { active: [{ id: 'a', text: 'Left open overnight', since: NOW - 5 * DAY }], backlog: [] } });
  assert.equal(h.stored().active.length, 1);
  h.w.eval("state.active[0].since -= 86400000");   // a midnight passes while the app is in the background
  h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));
  assert.deepEqual(h.stored().active, []);
  assert.deepEqual(h.stored().backlog.map(t => t.id), ['a']);
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

test('a board that never had a program list starts with an empty one, saved; a started list is left alone', () => {
  const fresh = boot();
  assert.deepEqual(fresh.stored().programs, []);
  assert.equal(fresh.$('#programs-head').textContent, 'Programs · 0');
  const older = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'B' }] } });
  assert.deepEqual(older.stored().programs, [], 'an older board without the key gets an empty list');
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

function pasteTasks(h, text) {
  const e = new h.w.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } });
  h.$('#field').dispatchEvent(e);
  return e;
}

test('a list pasted into the task field adds one backlog task per line; a one-line paste is an ordinary paste', () => {
  const h = boot({ seed: { active: [{ id: 'a', text: 'Prune the roses', since: NOW }], backlog: [{ id: 'b', text: 'Sort the toolbox' }], programs: [] } });
  const e = pasteTasks(h, 'Tasks:\n- Read the garden plan and pick a bed — 10 min\n\n2. sort the toolbox\nPrune the roses\n  Oil the hinges  ');
  assert.ok(e.defaultPrevented, 'the list never lands in the field as one line');
  // The heading and the empty line are skipped, bullets stripped; a task already on Now or the backlog (any case) is not added twice.
  assert.deepEqual(h.stored().backlog.map(t => t.text), ['Sort the toolbox', 'Read the garden plan and pick a bed — 10 min', 'Oil the hinges']);
  assert.equal(h.stored().active.length, 1);
  assert.equal(h.$('#status').textContent, '2 tasks added from the list.');
  const one = pasteTasks(h, 'Water the ferns');
  assert.equal(one.defaultPrevented, false);
  assert.equal(h.stored().backlog.length, 3);
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
  programs: PROGRAMS.map(p => ({ ...p })).concat({ id: 'zz', name: 'Added later' }),
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
  const loaded = h.stored();   // the board as load() leaves it (old tasks stamped `added`)
  h.click('#export');
  const shown = h.$('#export-doc').textContent;
  h.click('#export-copy');
  await h.tick();
  assert.equal(h.copied(), shown);
  assert.equal(h.$('#export-copy').textContent, 'Copied');
  h.click('#export-close');
  assert.ok(h.$('#export-box').hidden);
  assert.deepEqual(h.stored(), loaded, 'the export changes nothing stored');
});

test('the open export follows the board: a task pushed to Now moves from next to now', () => {
  const h = boot({ seed: EXPORT_BOARD() });
  h.click('#export');
  h.click('[data-push="b1"]');
  const x = JSON.parse(h.$('#export-doc').textContent);
  assert.deepEqual(x.next, []);
  assert.deepEqual(x.now.map(t => t.text), ['Fix the gate latch', 'Brief the cleaner']);
});

/* ---- Kairos (Pace 6, Charter v1.6): the dashboard issue, synced with the board ---- */

const TOKEN_KEY = 'whiteboard:kairos-token';
const SYNC_KEY = 'whiteboard:kairos';
const TICKS_KEY = 'whiteboard:kairos-ticks';
const ISSUE = 'https://api.github.com/repos/nklassen-app/kairos_v3/issues/11';
const TOKEN = { token: 'github_pat_madeup123', since: NOW - 5 * DAY };
// A made-up dashboard body in dashboard.py's shape — never the real issue.
const BODY = [
  '<!-- kairos-dashboard: written by kairos-foundation/scripts/dashboard.py -->',
  '**Refreshed 2026-09-20** · tick a box when it is done.',
  '',
  '### 1 · Kairos system',
  '<sub>last work 2026-09-20</sub>',
  '',
  '**Garden plan** — The garden, planned · <sub>2 for you</sub>',
  '- [ ] Garden plan 3 · Pick the bed for the roses in `garden.md` — 10 min <!-- k:aaaaaaaaaa -->',
  '- [x] Garden plan 4 · Order the **mulch** — 5 min <!-- k:bbbbbbbbbb -->',
  '',
  '**Toolshed** — The shed, sorted · <sub>1 for you</sub>',
  '- [ ] On trial · Decide whether the shed has been tried enough — 2 min <!-- k:cccccccccc -->',
  '',
  '### Recently done (since 2026-09-13)',
  '- [ ] Not a step — a line after the done heading <!-- k:dddddddddd -->',
].join('\n');
const ROSES = 'Pick the bed for the roses in garden.md — 10 min';
const SHED = 'Decide whether the shed has been tried enough — 2 min';
const answer = (body, status = 200) => () => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve({ body }) });
// A stand-in for the issue: GET answers its body, PATCH replaces it.
function issue(body){
  const it = { body, writes: [] };
  it.fetch = (url, opts) => {
    if (opts.method === 'PATCH'){ it.body = JSON.parse(opts.body).body; it.writes.push(it.body); }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ body: it.body }) });
  };
  return it;
}
const settle = async h => { for (let i = 0; i < 10; i++) await h.tick(); };
const texts = list => list.map(t => t.text);

test('the page may call one outside address, api.github.com; the page has one network call and the worker leaves other addresses alone', () => {
  const csp = HTML.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(csp, 'a CSP in the page');
  const hosts = csp[1].match(/https?:\/\/[^\s;]+/g);
  assert.deepEqual(hosts, ['https://api.github.com'], 'no other host anywhere in the policy');
  assert.match(csp[1], /connect-src 'self' https:\/\/api\.github\.com;/);
  assert.match(csp[1], /default-src 'self'/);
  assert.equal((HTML.match(/fetch\(/g) || []).length, 1, 'one fetch in the page');
  assert.match(HTML, /async function kairosDoor\(token, body\)\{\n  const res = await fetch\(ISSUE,/, 'and it is the door, to the one issue');
  assert.equal((HTML.match(/https:\/\/api\.github\.com\/[^'"\s]*/g) || []).filter(u => !u.endsWith('/')).length, 1, 'one API address in the code');
  assert.match(SW, /if \(new URL\(e\.request\.url\)\.origin !== self\.location\.origin\) return;/);
});

test('not connected: no call is made, the connect field is open, and says so', async () => {
  const h = boot({ fetch: answer(BODY) });
  await settle(h);
  assert.equal(h.calls.length, 0, 'no token, no call');
  assert.ok(h.$('#kairos-connect').open);
  assert.match(h.$('#kairos-note').textContent, /Not connected/);
});

test('connected: the one issue is read with the token, and N.\'s open steps land on the backlog as ordinary tasks; ticked ones and the done list do not', async () => {
  const h = boot({ seed: { active: [], backlog: [{ id: 'b', text: 'Mow the lawn' }], archive: [] }, store: { [TOKEN_KEY]: TOKEN }, fetch: answer(BODY) });
  await settle(h);
  assert.equal(h.calls.length, 1);
  const { url, opts } = h.calls[0];
  assert.equal(url, ISSUE);
  assert.equal(opts.method, 'GET');
  assert.equal(opts.body, undefined, 'a read sends nothing');
  assert.equal(opts.headers.Authorization, 'Bearer github_pat_madeup123');
  const b = h.stored().backlog;
  assert.deepEqual(texts(b), ['Mow the lawn', ROSES, SHED], 'after what was there');
  assert.deepEqual(b.slice(1).map(t => [t.kairos, t.from]), [['aaaaaaaaaa', 'Garden plan 3'], ['cccccccccc', 'Toolshed']]);
  assert.deepEqual(h.$$('#backlog .from').map(n => n.textContent), ['Kairos · Garden plan 3', 'Kairos · Toolshed']);
  assert.match(h.$('#kairos-note').textContent, /^Synced 1\d:00\. 2 new tasks on the backlog\.$/);
  assert.equal(h.$$('#backlog [data-push]').length, 3, 'each can go to Now like any task');
});

test('a sync never adds a step twice: not when it is on Now, edited, or already ticked', async () => {
  const seed = { active: [{ id: 'a', text: 'Roses, my words', kairos: 'aaaaaaaaaa', from: 'Garden plan 3', since: NOW }], backlog: [],
    archive: [{ id: 'c', text: SHED, kairos: 'cccccccccc', done: NOW - DAY }] };
  const it = issue(BODY); // the shed still open in the issue: ticked here, and the tick already sent before Claude applied it
  const h = boot({ seed, store: { [TOKEN_KEY]: TOKEN }, fetch: it.fetch });
  await settle(h);
  assert.deepEqual(texts(h.stored().active), ['Roses, my words']);
  assert.deepEqual(texts(h.stored().backlog), []);
  assert.match(h.$('#kairos-note').textContent, /^Synced 1\d:00\.$/);
});

test('ticking a Kairos task on Now ticks exactly its box in the issue, and nothing of the board is sent', async () => {
  const seed = { active: [{ id: 'a', text: 'Roses, my words', kairos: 'aaaaaaaaaa', from: 'Garden plan 3', since: NOW, program: 'p' }],
    backlog: [{ id: 'b', text: 'Private errand' }], archive: [{ id: 'z', text: 'Old private task', done: NOW }], programs: [{ id: 'p', name: 'Private program' }] };
  const it = issue(BODY);
  const h = boot({ seed, store: { [TOKEN_KEY]: TOKEN }, fetch: it.fetch });
  await settle(h);
  h.click('[data-done="a"]');
  await new Promise(r => setTimeout(r, 520));
  await settle(h);
  assert.equal(it.writes.length, 1, 'one write');
  const before = BODY.split('\n'), after = it.writes[0].split('\n');
  const changed = before.map((l, i) => l !== after[i] ? i : -1).filter(i => i >= 0);
  assert.equal(after.length, before.length);
  assert.deepEqual(changed, [7], 'one line changed');
  assert.equal(after[7], before[7].replace('- [ ] ', '- [x] '), 'its box, ticked');
  const patch = h.calls.find(c => c.opts.method === 'PATCH');
  assert.equal(patch.url, ISSUE);
  assert.deepEqual(Object.keys(JSON.parse(patch.opts.body)), ['body']);
  for (const word of ['Roses, my words', 'Private errand', 'Old private task', 'Private program']) assert.ok(!JSON.stringify(h.calls).includes(word), word);
  assert.deepEqual(h.w.localStorage.getItem(TICKS_KEY), '[]', 'nothing left to send');
  assert.deepEqual(texts(h.stored().archive), ['Roses, my words', 'Old private task'], 'the task is archived as usual');
  assert.deepEqual(texts(h.stored().backlog), ['Private errand', SHED], 'and the read after the write does not bring it back');
  assert.ok(!JSON.stringify(h.stored()).includes('github_pat_'), 'the token is not in the board document');
  h.click('#export');
  assert.ok(!h.$('#export-doc').textContent.includes('github_pat_'), 'nor in the export');
  assert.ok(!h.$('#export-doc').textContent.includes('Pick the bed'), 'and Kairos tasks, having no program, are held back');
});

test('a tick made offline waits, says so, and is sent at the next sync; a box no longer open is not written', async () => {
  const seed = { active: [{ id: 'a', text: ROSES, kairos: 'aaaaaaaaaa', since: NOW }], backlog: [], archive: [] };
  const off = boot({ seed, store: { [TOKEN_KEY]: TOKEN, [SYNC_KEY]: { at: NOW - DAY } } });
  await settle(off);
  off.click('[data-done="a"]');
  await new Promise(r => setTimeout(r, 520));
  await settle(off);
  assert.equal(off.w.localStorage.getItem(TICKS_KEY), '["aaaaaaaaaa"]');
  assert.match(off.$('#kairos-note').textContent, /Could not reach GitHub\. Last synced 19 Sept, 1\d:00\. 1 tick will be sent next time\./);
  const board = JSON.parse(off.w.localStorage.getItem(KEY));
  const it = issue(BODY);
  const on = boot({ seed: board, store: { [TOKEN_KEY]: TOKEN, [TICKS_KEY]: ['aaaaaaaaaa', 'bbbbbbbbbb'] }, fetch: it.fetch });
  await settle(on);
  assert.equal(it.writes.length, 1, 'only the open box is written; the one already ticked is not');
  assert.match(it.body, /- \[x\] Garden plan 3/);
  assert.equal(on.w.localStorage.getItem(TICKS_KEY), '[]');
  assert.deepEqual(texts(on.stored().backlog), [SHED]);
});

test('a step ticked in the issue goes to the archive; a step gone from it leaves the board; a wrong answer changes nothing', async () => {
  const seed = { active: [{ id: 'a', text: 'Mulch', kairos: 'bbbbbbbbbb', since: NOW }],
    backlog: [{ id: 'g', text: 'An old step', kairos: 'eeeeeeeeee' }, { id: 'm', text: 'Mine' }], archive: [] };
  const h = boot({ seed, store: { [TOKEN_KEY]: TOKEN }, fetch: answer(BODY) });
  await settle(h);
  assert.deepEqual(texts(h.stored().active), []);
  assert.deepEqual(texts(h.stored().archive), ['Mulch']);
  assert.deepEqual(texts(h.stored().backlog), ['Mine', ROSES, SHED]);
  assert.match(h.$('#kairos-note').textContent, /2 new tasks on the backlog; 2 tasks done or changed in Kairos, taken off\./);
  const wrong = boot({ seed, store: { [TOKEN_KEY]: TOKEN }, fetch: answer('Not Found') });
  await settle(wrong);
  const kept = wrong.stored();
  const ids = l => l.map(t => t.id);
  assert.deepEqual([ids(kept.active), ids(kept.backlog), ids(kept.archive)], [['a'], ['g', 'm'], []], 'a body without the dashboard marker empties nothing');
  assert.match(wrong.$('#kairos-note').textContent, /Could not reach GitHub/);
});

test('a refused token says so and reopens the connect field; a token that cannot write says what it needs', async () => {
  const refused = boot({ store: { [TOKEN_KEY]: TOKEN }, fetch: answer('', 401) });
  await settle(refused);
  assert.match(refused.$('#kairos-note').textContent, /refused the token/);
  assert.ok(refused.$('#kairos-connect').open);
  const readOnly = boot({ store: { [TOKEN_KEY]: TOKEN, [TICKS_KEY]: ['aaaaaaaaaa'] },
    fetch: (url, opts) => opts.method === 'PATCH' ? answer('', 403)() : answer(BODY)() });
  await settle(readOnly);
  assert.match(readOnly.$('#kairos-note').textContent, /Issues read and write.*1 tick will be sent then/);
  assert.equal(readOnly.w.localStorage.getItem(TICKS_KEY), '["aaaaaaaaaa"]', 'the tick is kept');
});

test('the token warns 30 days before its 90 run out, and says when it may have run out', async () => {
  const soon = boot({ store: { [TOKEN_KEY]: { ...TOKEN, since: NOW - 70 * DAY } }, fetch: answer(BODY) });
  await settle(soon);
  assert.match(soon.$('#kairos-note').textContent, /runs out in 20 days/);
  const fresh = boot({ store: { [TOKEN_KEY]: { ...TOKEN, since: NOW - 59 * DAY } }, fetch: answer(BODY) });
  await settle(fresh);
  assert.doesNotMatch(fresh.$('#kairos-note').textContent, /run/);
  const old = boot({ store: { [TOKEN_KEY]: { ...TOKEN, since: NOW - 91 * DAY } }, fetch: answer(BODY) });
  await settle(old);
  assert.match(old.$('#kairos-note').textContent, /may have run out/);
});

test('connecting takes only a fine-grained token, stores it apart from the board, and syncs at once', async () => {
  const h = boot({ fetch: answer(BODY) });
  await settle(h);
  h.$('#kairos-token').value = 'ghp_classic123';
  h.click('#kairos-save');
  assert.match(h.$('#kairos-note').textContent, /start with github_pat_/);
  assert.equal(h.w.localStorage.getItem(TOKEN_KEY), null);
  h.$('#kairos-token').value = '  github_pat_madeup123  ';
  h.click('#kairos-save');
  await settle(h);
  assert.deepEqual(JSON.parse(h.w.localStorage.getItem(TOKEN_KEY)), { token: 'github_pat_madeup123', since: NOW });
  assert.equal(h.$('#kairos-token').value, '', 'the field is cleared');
  assert.equal(h.calls.length, 1);
  assert.deepEqual(texts(h.stored().backlog), [ROSES, SHED]);
});

/* ---- Whiteboard flow 2: a stuck task — talk it through, blocked, let go ---- */

const STUCK_BOARD = () => ({
  programs: PROGRAMS.map(p => ({ ...p })),
  active: [{ id: 'a', text: 'Fix the gate latch', program: 'd4', since: NOW - 2 * DAY, added: NOW - 11 * DAY }],
  backlog: [
    { id: 'b', text: 'Ten days, not yet', program: 'd4', added: NOW - 10 * DAY },
    { id: 'c', text: 'PRIVATE health task', program: 'd0', added: NOW - 20 * DAY },
    { id: 'd', text: 'PRIVATE no-program task', added: NOW - 20 * DAY },
    { id: 'k', text: 'A Kairos step', kairos: 'cccccccccc', from: 'Garden plan 3', added: NOW - 12 * DAY },
  ],
  archive: [],
});

test('a task joins the board stamped; old tasks are stamped at load; the stamp stays through Now and back', () => {
  const h = boot({ seed: { active: [{ id: 'a', text: 'Old on Now', since: NOW }], backlog: [{ id: 'b', text: 'Old waiting' }] } });
  assert.deepEqual([h.stored().active[0].added, h.stored().backlog[0].added], [NOW, NOW]);
  h.type('Oil the hinges');
  assert.equal(h.stored().backlog[1].added, NOW);
  h.click('[data-push="b"]');
  assert.equal(h.stored().active[1].added, NOW, 'pushing up keeps `added`');
});

test('a task on the board more than ten days, Now or backlog, is marked stuck; ten days is not', () => {
  const h = boot({ seed: STUCK_BOARD() });
  const marked = h.$$('.stuck').map(e => e.closest('[data-row]').dataset.row);
  assert.deepEqual(marked, ['a', 'c', 'd', 'k']);
  assert.match(h.$('[data-row="a"] .stuck').textContent, /11 days on the board/);
});

test('Talk it through copies a prompt with the task, only for shared programs and Kairos steps; never a private task', async () => {
  const h = boot({ seed: STUCK_BOARD() });
  assert.deepEqual(h.$$('[data-talk]').map(b => b.dataset.talk), ['a', 'k']);
  h.click('[data-talk="a"]');
  await h.tick();
  const text = h.copied();
  assert.match(text, /^This task has sat on my Whiteboard for 11 days, now on my Now list:\n"Fix the gate latch" \(program: Creative Home\)/);
  assert.match(text, /one task\nper line/);
  for (const s of ['PRIVATE', 'Ten days'])
    assert.ok(!text.includes(s), `nothing else of the board: ${s}`);
  assert.match(h.$('[data-talk="a"]').textContent, /copied/);
  h.click('[data-talk="k"]');
  await h.tick();
  assert.match(h.copied(), /now in my backlog:\n"A Kairos step" \(Kairos · Garden plan 3\)/);
  assert.equal(h.calls.length, 0, 'talking it through sends nothing');
});

test('blocked quiets the marker and starts the ten days over', () => {
  const h = boot({ seed: STUCK_BOARD() });
  h.click('[data-blocked="c"]');
  assert.equal(h.$('[data-row="c"] .stuck'), null);
  assert.equal(h.stored().backlog.find(t => t.id === 'c').paused, NOW);
  const later = STUCK_BOARD();
  later.backlog[1].paused = NOW - 11 * DAY;
  const h2 = boot({ seed: later });
  assert.match(h2.$('[data-row="c"] .stuck').textContent, /11 days on the board/, 'after another ten days it is back');
});

test('let go moves a task to the archive marked so, never counted as done; a Kairos step offers no let go', () => {
  const h = boot({ seed: STUCK_BOARD() });
  assert.equal(h.$('[data-letgo="k"]'), null);
  h.click('[data-letgo="a"]');
  const s = h.stored();
  assert.deepEqual(s.active, []);
  assert.equal(s.archive[0].id, 'a');
  assert.equal(s.archive[0].letGo, true);
  assert.equal(s.archive[0].since, undefined);
  assert.match(h.$('#archive .row').textContent, /let go · /);
  assert.match(h.$('#status').textContent, /Let go: Fix the gate latch/);
  h.click('#export');
  assert.equal(JSON.parse(h.$('#export-doc').textContent).done_this_week, 0, 'a let-go task is not done');
});

test('the export carries no board stamps: not added, not paused', () => {
  const b = STUCK_BOARD(); b.backlog[0].paused = NOW;
  const h = boot({ seed: b });
  h.click('#export');
  const doc = h.$('#export-doc').textContent;
  for (const s of ['added', 'paused', 'letGo']) assert.ok(!doc.includes(s), s);
});
