# Whiteboard

A two-list task board with a hard cap on what you are allowed to be working
on. Mundane life-enablement tasks only; nothing here is part of a quest — a
task may name one of my Horizons programs, but it never becomes a quest.

Local-first single page, no build step, no dependencies, no account. Hosted on
GitHub Pages and wrapped in a Capacitor shell for the phone, the same way as
The Floor (`kairos-floor`).

## The rules

1. A task enters only through the Add field, into the **Backlog**, at the
   top (N., 2026-10-30; a pasted list or new Kairos steps land on top in
   their own order).
2. It moves Backlog → **Now** via the "Now" button, only while Now holds
   fewer than 7 tasks. The cap is hard-coded; a group (14) is one task,
   whatever its steps. Nothing stays on Now longer
   than five days (N., 2026-10-30): a task can show "5 days" at most; at the
   midnight that would make it six, it goes back to the top of the Backlog
   by itself, its Now count cleared, and the note under the Backlog says
   so; a group goes back steps and all. A ticked step (14) starts the five
   days over. Checked each time the app opens or comes back to the front.
3. It leaves the board by the tick on the Now board, which moves it to the
   **Archive**, stamped with the day it was ticked, or by **let go** on a
   stuck task (13), archived marked *let go*, or by ticking a group's last
   open step (14); a group is archived with its steps. No undo. The Archive
   (collapsed at the bottom) lists finished tasks newest first, with the day
   and the program; nothing there can be edited or brought back.
4. Text can be edited in place anywhere (tap it). Saving empty text keeps the
   original, so editing can never delete.
5. No delete (let go archives, 13), no reorder, no priority, and no demote
   by hand: the only way back from Now is the five-day rule (2). The same
   holds for a group's steps (14).
6. State is one JSON document in `localStorage` under `whiteboard:v1`, on one
   device: `{ active: [{id, text, since, added, paused?, program?}], backlog: [{id,
   text, added, paused?, program?}], archive: [{id, text, done, letGo?,
   program?}], programs: [{id, name}] }` (`since`/`added`/`paused`/`done`
   epoch ms; Kairos tasks add `kairos` and `from`; a group adds `steps:
   [{id, text, done?}]` on Now, the Backlog and the Archive alike). No backup, no sync.
7. A task on Now shows, at the right of its row, how long it has been there
   (today · 1 day · N days), counted in calendar days from the day it was
   pushed up — it turns over at midnight, not 24 hours after the exact
   moment. Tasks that were on Now before this existed count from their
   first load after the update.
8. Every row has a **copy** button: it puts the task's text on the clipboard
   to paste elsewhere — into Claude, to plan or resolve it. A task on Now
   copies with a second line saying how long it has been there.
9. **Programs** (collapsed at the bottom) is a short list on the phone — the
   programs I do Whiteboard tasks for, a selection from the one program list
   (`kairos-system/programs.md`, private), matched by name only: no code
   reads that file and nothing here copies it (N., 2026-10-24; the seed list
   that used to ship in `index.html` is gone). A new board starts empty; a
   list already on the device is never overwritten. Add one, or paste several at once, one per line (bullets are
   stripped, a heading line ending in `:` and repeats are skipped). Tap a
   name to rename it; there is no removing one. Every task on Now and the
   Backlog has a picker under its text while the list has a program, and
   so has "Add a task": a new task takes its program as it is typed; the
   picker goes back to "no program" after each task (Whiteboard flow 6,
   2026-11-08, `whiteboard-v15`).
10. **Export for agent** (Agent design 5), at the bottom, shows *This is
   what leaves the phone* — one JSON document — and **Copy**. It is the
   one door for what an agent gets: `agentExport()` sends the text and program name of the
   tasks on Now (with days there) and on the Backlog, a group's steps
   (text, and whether ticked) with it, the count ticked off
   this week, and how many were held back. Only tasks under a program in
   `SHARED` cross, by id so a rename keeps the class; everything else is
   held back and only counted — the health, family and school defaults,
   any program added later, and tasks with no program (N., 2026-10-20); a
   held-back group's steps are held back with it, and it counts as one.
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
   the top of the Backlog (never twice: not when it is on Now, edited, or
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
   sent. Kairos tasks land under the program **Kairos OS** (matched by
   name, any case; added to the list the first time it is missing), and
   Kairos tasks already on the board or in the Archive with no program get
   it at the next open; a program picked by hand is kept (Whiteboard flow
   6, 2026-11-08). Kairos OS is not in `SHARED`, so the export still holds
   them back. The
   note under "Kairos" says when it last synced and what changed, when it is
   not connected, when GitHub refuses the token or a write, when it is
   offline (with ticks still to send), and from 30 days before the token's
   90 run out.
13. **A stuck task** (Whiteboard flow 2, N., 2026-10-30): a task on the
   board, Now or Backlog, for more than ten days — counted in calendar days
   from `added`, stamped when it joins (tasks from before then: at their
   first load after the update) — shows "N days on the board" and three
   buttons. **Talk it through** copies a prompt with the task into the
   clipboard, to paste into Claude: why isn't it moving (blocked, too big,
   unclear, not mine, not wanted), then one move (steps, delegate, reword,
   let go), ending in plain lines that paste back as tasks (11). Only for
   tasks the export would share (10) and Kairos steps; any other stuck task
   gets the marker but no button, and no copy of its text is made. The
   prompt carries the task's text, its program's name or Kairos story, its
   steps if it is a group (14), and its days, counted from the group's
   `added` (a ticked step doesn't restart the ten); nothing else of the board, and no network call. **blocked**
   quiets the marker and starts the ten days over (`paused`). **let go**
   moves it to the Archive marked *let go*, not counted as done in the
   export; not offered on a Kairos step, which is let go in the backlog.
14. **A group** (Whiteboard flow 3, N., 2026-11-08, `whiteboard-v16`): a
   big task keeps its steps. **steps** under a task on Now or the Backlog
   takes one step per line (cleaned like a pasted list, 11); the task
   becomes a group, its steps under its text, and **+ steps** adds more at
   the end later. It stays one unit: one slot on Now (2). On Now each open
   step has its own tick: a ticked step stays in the group, struck
   through, and restarts the five days (2), so a group that keeps moving
   stays on Now and a stalled one goes back, steps and all. Ticking the
   last open step, or the group itself, archives the group as done, with
   its steps. Steps are ticked on Now only, as tasks are; they edit in
   place (4) and are never deleted or reordered (5); a step has no steps
   of its own. Not on a Kairos task: it mirrors the dashboard. Copy (8)
   carries the steps too. Lock codes, keys and the like never go into a
   step's text: paper only.

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
