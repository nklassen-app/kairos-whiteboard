# Whiteboard

A two-list task board with a hard cap on what you are allowed to be working
on. Mundane life-enablement tasks only; nothing here is part of a quest — a
task may name one of my Horizons programs, but it never becomes a quest.

Local-first single page, no build step, no dependencies, no account. Hosted on
GitHub Pages and wrapped in a Capacitor shell for the phone, the same way as
The Floor (`kairos-floor`).

## The rules

1. A task enters only through the Add field, into the **Backlog**.
2. Its only move is Backlog → **Now**, via the "Now" button, and only while Now
   holds fewer than 7 tasks. The cap is hard-coded.
3. Its only exit is the tick on the Now board, which moves it to the
   **Archive**, stamped with the day it was ticked. No undo. The Archive
   (collapsed at the bottom) lists finished tasks newest first, with the day
   and the program; nothing there can be edited or brought back.
4. Text can be edited in place anywhere (tap it). Saving empty text keeps the
   original, so editing can never delete.
5. No delete, no demote, no reorder, no priority.
6. State is one JSON document in `localStorage` under `whiteboard:v1`, on one
   device: `{ active: [{id, text, since, program?}], backlog: [{id, text,
   program?}], archive: [{id, text, done, program?}], programs: [{id, name}]
   }` (`since`/`done` epoch ms). No backup, no sync.
7. A task on Now shows, at the right of its row, how long it has been there
   (today · 1 day · N days), counted in calendar days from the day it was
   pushed up — it turns over at midnight, not 24 hours after the exact
   moment. Tasks that were on Now before this existed count from their
   first load after the update.
8. Every row has a **copy** button: it puts the task's text on the clipboard
   to paste elsewhere — into Claude, to plan or resolve it. A task on Now
   copies with a second line saying how long it has been there.
9. **Programs** (collapsed at the bottom) is a short list on the phone — the
   programs I do Whiteboard tasks for. A board that has never had a list
   starts with the default one in `index.html` (`DEFAULT_PROGRAMS`: generic
   topics every household deals with — not sensitive, N. 2026-10-03, so it
   lives in this repo); a list already started on the device is never
   overwritten. Add one, or paste several at once, one per line (bullets are
   stripped, a heading line ending in `:` and repeats are skipped). Tap a
   name to rename it; there is no removing one. Every task on Now and the
   Backlog has a picker under its text while the list has a program.
10. **Export for agent** (Agent design 5), at the bottom, shows *This is
   what leaves the phone* — one JSON document — and **Copy**. It is the
   one door for what an agent gets: `agentExport()` sends the text and program name of the
   tasks on Now (with days there) and on the Backlog, the count ticked off
   this week, and how many were held back. Only tasks under a program in
   `SHARED` cross, by id so a rename keeps the class; everything else is
   held back and only counted — the health, family and school defaults,
   any program added later, and tasks with no program (N., 2026-10-20).
   The archive's text, ids and timestamps never go. No network call; N.
   pastes it by hand. The tests pin the allow-list.
11. **A pasted list** (Pace 5, 2026-10-23): pasting several lines into "Add
   a task" adds one Backlog task per line, cleaned like the program list
   (bullets stripped, a heading line ending in `:` skipped); a task already
   on Now or the Backlog (any case) is not added twice. This is how N.'s
   ready Kairos steps arrive (`dashboard.py --tasks`). A one-line paste is
   an ordinary paste.
12. **Kairos** (Pace 6, 2026-10-24; Charter v1.6): N.'s ready steps from
   the dashboard issue (`nklassen-app/kairos_v3#11`) land on the Backlog as
   ordinary tasks, marked "Kairos · story" (`whiteboard-v10`). The sync runs
   each time the app opens or comes back to the front: first the ticks
   waiting to be sent, then a read. A step not yet on the board is added at
   the end of the Backlog (never twice: not when it is on Now, edited, or
   archived); a step ticked in the issue goes to the Archive; a step gone
   from the issue (Claude applied the tick, or reworded it) leaves Now and
   the Backlog. Ticking a Kairos task on Now ticks its box in the issue;
   offline, the tick waits and is sent at the next open. **The app's one
   outbound door:** `kairosDoor()` reads that one issue and writes back only
   its own body with one box ticked, with a fine-grained token (only
   `kairos_v3`, Issues read and write, 90 days), typed into "Connect to
   Kairos" on the phone and kept under its own key
   (`whiteboard:kairos-token`), never in the board's document, the export or
   a copy. A Content-Security-Policy in the page allows no other host; the
   service worker leaves other addresses alone. Nothing of the board is
   sent. Kairos tasks carry no program, so the export holds them back. The
   note under "Kairos" says when it last synced and what changed, when it is
   not connected, when GitHub refuses the token or a write, when it is
   offline (with ticks still to send), and from 30 days before the token's
   90 run out.

## Run locally

Serve the folder over HTTP (service workers don't register from `file://`):

```sh
python3 -m http.server 8080
```

## Deploy

Content ships by pushing to `main`: GitHub Pages serves the repo root at
<https://nklassen-app.github.io/kairos-whiteboard/> and the phone app picks the
change up on next open. Bump `CACHE` in `sw.js` (`whiteboard-vN`) **and** the `.ver` marker in
`index.html` with every content change or the app keeps serving the stale
page.

## Test

```sh
cd tests && npm install && npm test  # DOM-level: index.html booted in jsdom under node's test runner
```

The Android shell lives in `native/`; see `native/README.md`. It only needs
rebuilding for shell changes (icon, app name, config).
