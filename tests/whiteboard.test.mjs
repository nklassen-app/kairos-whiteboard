// DOM-level tests for the Whiteboard, v18 (Ready + Icebox, N. 2026-11-15).
// index.html is booted in jsdom under a fixed clock; each test gets a fresh
// window and a fresh localStorage.
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
const BACKUP = 'whiteboard:v17-backup';
const TOKEN = 'whiteboard:kairos-token';
const NOW = new Date('2026-11-15T10:00:00.000Z').getTime();
const DAY = 86400000;

function boot({ seed = null, store = {}, raw = {} } = {}) {
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
      if (seed) window.localStorage.setItem(KEY, JSON.stringify(seed));
      for (const [k, v] of Object.entries(store)) window.localStorage.setItem(k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) window.localStorage.setItem(k, v);
      // No call may reach the network: every one is recorded and refused.
      window.fetch = (url, opts = {}) => { calls.push({ url, opts }); return Promise.reject(new Error('offline')); };
    },
  });
  const w = dom.window, d = w.document;
  return {
    w, d, calls,
    $: s => d.querySelector(s),
    $$: s => [...d.querySelectorAll(s)],
    stored: () => JSON.parse(w.localStorage.getItem(KEY)),
    item: k => w.localStorage.getItem(k),
    type(text) { const f = d.getElementById('field'); f.value = text; f.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); },
    click: s => d.querySelector(s).click(),
    wait: ms => new Promise(r => setTimeout(r, ms)),
    reload() { return boot({ raw: { [KEY]: w.localStorage.getItem(KEY), ...(w.localStorage.getItem(BACKUP) ? { [BACKUP]: w.localStorage.getItem(BACKUP) } : {}) } }); },
  };
}

// A v17 board: Now, the backlog with a blocked and a let-go history, Kairos
// steps open and done, a group with steps, sizes and stamps.
const V17 = () => ({
  active: [
    { id: 'n1', text: 'Fix the gate', since: NOW - 2 * DAY, added: NOW - 9 * DAY, size: 'hour', program: 'p1' },
    { id: 'k1', text: 'Pull every day', kairos: 'aaaaaaaaaa', from: 'Moneta 8', since: NOW - DAY, added: NOW - 3 * DAY, program: 'pk' },
  ],
  backlog: [
    { id: 'b1', text: 'Paint the shed', added: NOW - 30 * DAY, paused: NOW - 4 * DAY, program: 'p1',
      steps: [{ id: 's1', text: 'Buy paint', size: 'min' }, { id: 's2', text: 'Sand', done: NOW - DAY }] },
    { id: 'b2', text: 'Call the dentist', added: NOW - 12 * DAY },
    { id: 'k2', text: 'Read the drafts', kairos: 'bbbbbbbbbb', from: 'Public footprint 1', added: NOW - 20 * DAY, program: 'pk' },
  ],
  archive: [
    { id: 'a1', text: 'Old idea', done: NOW - 5 * DAY, letGo: true },
    { id: 'k3', text: 'A Kairos step done', kairos: 'cccccccccc', done: NOW - 6 * DAY, program: 'pk' },
  ],
  programs: [{ id: 'p1', name: 'House' }, { id: 'pk', name: 'Kairos OS' }],
});

const texts = (h, sel) => h.$$(`${sel} .task`).map(e => e.textContent);

// ---- the first screen ---------------------------------------------------

test('a fresh board shows only the add box and Ready; Icebox, Archive and Programs are collapsed below', () => {
  const h = boot();
  assert.ok(h.$('#field') && h.$('#add') && h.$('#ready'));
  for (const id of ['icebox-box', 'archive-box', 'programs-box']) assert.equal(h.$('#' + id).open, false, id);
  assert.equal(h.$('#icebox-head').textContent, 'Icebox · 0');
  assert.equal(h.$('#archive-head').textContent, 'Archive · 0');
  const order = [...h.d.querySelectorAll('#field, #ready, #icebox-box, #archive-box, #programs-box')].map(e => e.id);
  assert.deepEqual(order, ['field', 'ready', 'icebox-box', 'archive-box', 'programs-box']);
});

test('the version label is whiteboard-v18 and matches the worker cache name', () => {
  const h = boot();
  assert.equal(h.$('.ver').textContent, 'whiteboard-v18');
  assert.equal(SW.match(/const CACHE = '([^']+)'/)[1], 'whiteboard-v18');
});

test('gone from the screen: Now, its cap, the time chips, sizes, ages, copy, Talk it through, blocked, let go, the export, Kairos', () => {
  const h = boot({ seed: V17() });
  h.$('#icebox-box').open = true;
  for (const sel of ['#active', '#count', '#have', '[data-have]', '[data-size]', '[data-step-size]', '.age', '[data-copy]',
                     '[data-talk]', '[data-blocked]', '[data-letgo]', '#export', '.stuck', '#kairos-connect', '#kairos-token', '[data-push]'])
    assert.equal(h.$(sel), null, sel);
  assert.doesNotMatch(h.d.body.textContent, /days on the board|I have|Export for agent|Connect to Kairos|\/ 7/);
});

// ---- add, tick, move, reload --------------------------------------------

test('a typed task goes to the top of Ready, with the program picked beside the field', () => {
  const h = boot({ seed: { ready: [], icebox: [], archive: [], programs: [{ id: 'p1', name: 'House' }], v: 18 } });
  h.type('Call the dentist');
  h.$('#field-prog').value = 'p1';
  h.type('Fix the gate');
  assert.deepEqual(texts(h, '#ready'), ['Fix the gate', 'Call the dentist']);
  const t = h.stored().ready[0];
  assert.equal(t.program, 'p1');
  assert.equal(t.added, NOW);
  assert.match(h.$('#ready .label').textContent, /House/);
  assert.equal(h.$('#field-prog').value, '', 'the picker goes back to no program');
});

test('a Ready row has a tick and one control to the Icebox; an Icebox row has one control to Ready and nothing else', () => {
  const h = boot({ seed: { ready: [{ id: 'r', text: 'R' }], icebox: [{ id: 'i', text: 'I' }], archive: [], programs: [], v: 18 } });
  const row = h.$('#ready [data-row="r"]');
  assert.equal(row.querySelectorAll('button').length, 2);
  assert.ok(row.querySelector('[data-done="r"]') && row.querySelector('[data-ice="r"]'));
  const ice = h.$('#icebox [data-row="i"]');
  assert.equal(ice.querySelectorAll('button, select, input').length, 1);
  assert.ok(ice.querySelector('[data-unice="i"]'));
});

test('a task moves to the Icebox and back to the top of Ready; the counts follow', () => {
  const h = boot({ seed: { ready: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], icebox: [], archive: [], programs: [], v: 18 } });
  h.click('[data-ice="b"]');
  assert.deepEqual(texts(h, '#ready'), ['A']);
  assert.equal(h.$('#icebox-head').textContent, 'Icebox · 1');
  h.click('[data-unice="b"]');
  assert.deepEqual(texts(h, '#ready'), ['B', 'A']);
  assert.equal(h.$('#icebox-head').textContent, 'Icebox · 0');
});

test('the tick moves a task to the archive, stamped, newest first; there is no limit on Ready', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 't' + i, text: 'T' + i }));
  const h = boot({ seed: { ready: many, icebox: [], archive: [], programs: [], v: 18 } });
  assert.equal(h.$$('#ready [data-row]').length, 12);
  h.click('[data-done="t3"]');
  await h.wait(600);
  assert.equal(h.$$('#ready [data-row]').length, 11);
  assert.equal(h.stored().archive[0].id, 't3');
  assert.equal(h.stored().archive[0].done, NOW);
  assert.equal(h.$('#archive-head').textContent, 'Archive · 1');
});

test('the state survives a reload: added, ticked, iced and un-iced', async () => {
  const h = boot({ seed: { ready: [], icebox: [], archive: [], programs: [], v: 18 } });
  h.type('One'); h.type('Two'); h.type('Three');
  h.click('[data-ice="' + h.stored().ready[0].id + '"]');            // Three to the Icebox
  h.click('[data-done="' + h.stored().ready[0].id + '"]');            // Two ticked
  await h.wait(600);
  const r = h.reload();
  assert.deepEqual(texts(r, '#ready'), ['One']);
  assert.deepEqual(r.stored().icebox.map(t => t.text), ['Three']);
  assert.deepEqual(r.stored().archive.map(t => t.text), ['Two']);
});

test('a task\'s steps show under it on Ready, the done ones marked; a step can\'t be ticked or sized there', () => {
  const h = boot({ seed: { ready: [{ id: 'g', text: 'Paint', steps: [{ id: 's1', text: 'Buy paint' }, { id: 's2', text: 'Sand', done: NOW }] }],
                           icebox: [], archive: [], programs: [], v: 18 } });
  assert.deepEqual(h.$$('#ready .step .task').map(e => e.textContent), ['Buy paint', 'Sand']);
  assert.ok(h.$('#ready .step.ticked'));
  assert.equal(h.$('[data-step-done]'), null);
});

test('a task\'s text still edits in place on Ready', () => {
  const h = boot({ seed: { ready: [{ id: 'a', text: 'Call dentist' }], icebox: [], archive: [], programs: [], v: 18 } });
  h.click('#ready [data-edit="a"]');
  const input = h.$('#ready input.edit');
  input.value = 'Call the dentist';
  input.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(h.stored().ready[0].text, 'Call the dentist');
});

test('a pasted list adds one Ready task per line', () => {
  const h = boot({ seed: { ready: [], icebox: [], archive: [], programs: [], v: 18 } });
  const e = new h.w.Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = { getData: () => '- One\n- Two\n' };
  h.$('#field').dispatchEvent(e);
  assert.deepEqual(texts(h, '#ready'), ['One', 'Two']);
});

test('programs are added and renamed as before, and the archive shows let go and the year', () => {
  const h = boot({ seed: { ready: [], icebox: [], archive: [{ id: 'a', text: 'Old', done: new Date('2025-03-01').getTime(), letGo: true }],
                           programs: [], v: 18 } });
  h.$('#prog-field').value = 'House\nGarden';
  h.click('#prog-add');
  assert.equal(h.$('#programs-head').textContent, 'Programs · 2');
  assert.match(h.$('#archive .meta').textContent, /let go · 1 Mar 2025/);
});

// ---- the migration from v17 ---------------------------------------------

test('first load of v18: the v17 board is backed up unchanged on the phone before anything moves', () => {
  const before = JSON.stringify(V17());
  const h = boot({ raw: { [KEY]: before } });
  assert.equal(h.item(BACKUP), before);
});

test('every open task I added goes to the Icebox, blocked ones too; Ready starts empty', () => {
  const h = boot({ seed: V17() });
  const s = h.stored();
  assert.deepEqual(s.ready, []);
  assert.deepEqual(s.icebox.map(t => t.id), ['n1', 'b1', 'b2']);
  assert.deepEqual(s.active, []);
  assert.deepEqual(s.backlog, []);
  assert.equal(s.v, 18);
});

test('every stored field is kept: steps, programs, creation dates, size, Now stamp, blocked stamp', () => {
  const h = boot({ seed: V17() });
  const [n1, b1] = h.stored().icebox;
  assert.deepEqual([n1.program, n1.added, n1.size, n1.since], ['p1', NOW - 9 * DAY, 'hour', NOW - 2 * DAY]);
  assert.equal(b1.paused, NOW - 4 * DAY);
  assert.deepEqual(b1.steps, V17().backlog[0].steps);
});

test('open imported tasks leave the board, kept out of sight; done ones stay in the archive; let go stays', () => {
  const h = boot({ seed: V17() });
  const s = h.stored();
  assert.deepEqual(s.offBoard.map(t => t.id), ['k1', 'k2']);
  assert.deepEqual(s.archive.map(t => t.id), ['a1', 'k3']);
  assert.equal(s.archive[0].letGo, true);
  h.$('#icebox-box').open = true;
  assert.doesNotMatch(h.d.body.textContent, /Pull every day|Read the drafts/);
  assert.match(h.$('#status').textContent, /3 tasks to the Icebox.*2 Kairos tasks taken off the board/);
});

test('the migration runs once: a second load changes nothing and keeps the first backup', () => {
  const h = boot({ seed: V17() });
  const after = h.item(KEY), backup = h.item(BACKUP);
  const r = h.reload();
  assert.equal(r.item(KEY), after);
  assert.equal(r.item(BACKUP), backup);
  assert.equal(r.$('#status').textContent, '');
});

// ---- no GitHub, no network ----------------------------------------------

test('the stored GitHub token is deleted at load; nothing else of the old sync is touched', () => {
  const h = boot({ seed: V17(), store: { [TOKEN]: { token: 'github_pat_madeup', since: NOW }, 'whiteboard:kairos': { at: NOW } } });
  assert.equal(h.item(TOKEN), null);
  assert.notEqual(h.item('whiteboard:kairos'), null);
  assert.doesNotMatch(h.item(BACKUP), /github_pat/);
});

test('no call reaches the network, at load, on a return to the app, or on a tick', async () => {
  const h = boot({ seed: V17(), store: { [TOKEN]: { token: 'github_pat_madeup', since: NOW } } });
  h.$('#icebox-box').open = true;
  h.click('[data-unice="n1"]');
  h.click('[data-done="n1"]');
  await h.wait(600);
  h.d.dispatchEvent(new h.w.Event('visibilitychange'));
  await h.wait(10);
  assert.deepEqual(h.calls, []);
});

test('the page may reach its own address only: no api.github.com, no fetch in the page', () => {
  const csp = HTML.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self';/);
  assert.doesNotMatch(HTML, /api\.github\.com|fetch\(/);
});
