# Whiteboard

A passive menu of my tasks, opened briefly on the phone: it remembers them
and lets me pick (v18, N. 2026-11-15, after six weeks of use). Mundane
life-enablement tasks only; a task may name one of my programs, but it never
becomes a quest.

Local-first single page, no build step, no dependencies, no account, no
network call: the Content-Security-Policy allows the page's own address only.
Hosted on GitHub Pages and wrapped in a Capacitor shell for the phone, the
same way as The Floor (`kairos-floor`).

## The rules (v18)

1. **Add a task:** text, a program if I pick one, Add. It goes on top of
   **Ready**. A list pasted into the field adds one task per line.
2. **Ready** is the only list shown by default, with no limit. Each task
   shows its text, its steps if it has any (done ones marked), a small
   program label, a tick to complete it, and **Icebox** to move it there.
   Tapping the text edits it in place.
3. **Icebox · N** is collapsed and shows only its count. Opened, each task
   has one control, **Ready**, which moves it to the top of Ready.
4. The tick moves a task to the **Archive**, stamped with when, newest
   first; there is no undo. **Archive · N** and **Programs · N** are
   collapsed below, as before (a program is renamed by tapping it).
5. **Everything stays on the phone**, under `whiteboard:v1`:
   `{ready, icebox, archive, programs, offBoard, active, backlog, v}`.

## The move from v17 (once, at v18's first load)

- The v17 board is copied unchanged to `whiteboard:v17-backup` on the phone
  before anything moves. A later build can restore from it.
- Every open task I had added (Now and the backlog, blocked ones included)
  went to the Icebox; Ready started empty.
- Open tasks brought in from the Kairos dashboard went to `offBoard`, kept
  but never shown; done ones stay in the Archive, as do tasks let go.
- Every stored field stays on its task, unread: `since`, `size`, `paused`,
  `letGo`, `kairos`, `from`, a step's `size` and `done`.
- The old GitHub token (`whiteboard:kairos-token`) is deleted. The Kairos
  sync (Charter v1.6's one door, to the dashboard issue) is gone from the
  code; the dashboard issue itself is untouched.

**Removed from the screen in v18** (in git history, `whiteboard-v17`): Now,
its cap and counter, the 15 min / 1 h / more chips, sizes, the days-on-the-board
label, copy, Talk it through, blocked, let go, Export for agent, the Kairos
section, the steps editor and step ticks, the program picker on a task row.

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
