# Whiteboard

A two-list task board with a hard cap on what you are allowed to be working
on. Mundane life-enablement tasks only; nothing here is part of a quest.

Local-first single page, no build step, no dependencies, no account. Hosted on
GitHub Pages and wrapped in a Capacitor shell for the phone, the same way as
The Floor (`kairos-floor`).

## The rules

1. A task enters only through the Add field, into the **Backlog**.
2. Its only move is Backlog → **Now**, via the "Now" button, and only while Now
   holds fewer than 7 tasks. The cap is hard-coded.
3. Its only exit is the tick on the Now board, which deletes it permanently.
   No undo, no archive.
4. Text can be edited in place anywhere (tap it). Saving empty text keeps the
   original, so editing can never delete.
5. No delete, no demote, no reorder, no priority.
6. State is one JSON document in `localStorage` under `whiteboard:v1`, on one
   device. No backup, no sync.
7. A task on Now shows, at the right of its row, how long it has been there
   (today · 1 day · N days), counted in calendar days from the day it was
   pushed up — it turns over at midnight, not 24 hours after the exact
   moment. Tasks that were on Now before this existed count from their
   first load after the update.
8. Every row has a **copy** button: it puts the task's text on the clipboard
   to paste elsewhere — into Claude, to plan or resolve it. A task on Now
   copies with a second line saying how long it has been there.

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
