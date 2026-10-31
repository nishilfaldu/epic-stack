---
name: verify-epic-notes
description:
  Drive the Epic Notes web app in a browser and prove a user-facing change. Use
  when a change touches login, notes, search, or any page a person opens in the
  running app.
---

# Verify Epic Notes

Epic Notes is the web app in this repository. A person logs in, reads and writes
notes, and searches users. Prove a change by starting an isolated server,
driving one feature from `features/`, and keeping the screenshot after the
server is gone.

Playwright is already a dependency. The scripts under `scripts/` launch the app,
check it, drive it, and stop the process they started. Two runs can proceed
together when each has its own `PORT`, `DATABASE_URL`, `DATABASE_PATH`, and
`CACHE_DATABASE_PATH`. The launch script sets those. Do not point a run at
another run's data directory, and do not drive `npm run dev` if you did not
start it.

## Launch

From the repository root, after `bash .cursor/install.sh`:

```sh
chmod +x .cursor/skills/verify-epic-notes/scripts/launch.sh
.cursor/skills/verify-epic-notes/scripts/launch.sh
```

The script copies `.env.example` to `.env` when `.env` is missing, migrates a
new SQLite file under `/tmp/epic-notes-verify-$RUN_ID`, seeds it, and starts
`node index.ts` with `NODE_ENV=development` and `MOCKS=true`. Ready means the
log contains `We have liftoff!`. The script prints the path of `instance.json`.
That file has the pid, the url, the data directory, and the evidence directory.

Set `PORT` to choose the port. The default is `4317`. In development the server
may pick the next free port. Trust the url in `instance.json`, not the port you
requested. Set `EVIDENCE_DIR` to move the proof. The default is
`/tmp/epic-notes-proof`. Set `RUN_ID` when you start two runs in one shell.

Seed creates the user `kody` with password `kodylovesyou` and the note
`Basic Koala Facts`. The seed is not idempotent. Launch always uses a fresh data
directory, so it can seed.

Stop the run with cleanup below. The pid in `instance.json` is the server.

## Doctor

Run this before driving, and again when a page does not load.

```sh
node .cursor/skills/verify-epic-notes/scripts/doctor.mjs <instance.json>
```

Doctor checks that the recorded pid is alive, that `GET /resources/healthcheck`
returns `OK`, and that `GET /login` returns the heading `Welcome back!`. A
health check can pass before the seed finishes. Launch seeds before it starts
the server, so a doctor pass after launch means the login user exists.

## Drive

```sh
node .cursor/skills/verify-epic-notes/scripts/drive.mjs <instance.json> <login|read-note|create-note|search>
```

The script opens Chromium through Playwright, does the user actions for that
feature, and writes `page.png` and `page.txt` under the evidence directory. Use
the labels in the feature file. Prefer `getByRole` and `getByLabel`. Do not
click by coordinates.

Drive the real pages. Do not call a test-only login helper. The password is the
seeded password. Leave the honeypot field empty.

## Evidence

Each drive writes:

- `<evidence>/<feature>/page.png`, a full-page screenshot taken after the
  resulting state is visible
- `<evidence>/<feature>/page.txt`, the final url and the visible text

A proof needs both the action and the resulting state. For login, the screenshot
must show `Kody's Notes` and the link `Basic Koala Facts`, not only the login
form. For a created note, the screenshot must show the saved title on the note
page, not only the editor. For search, the screenshot must show the `Kody`
profile link.

## Cleanup

```sh
node .cursor/skills/verify-epic-notes/scripts/cleanup.mjs <instance.json>
```

Cleanup sends `SIGTERM` to the pid in `instance.json` and deletes that run's
data directory. It does not delete the evidence directory. After cleanup,
`page.png` must still be at the path drive printed. Do not kill processes by
name.

## Helpers

The scripts above are the helpers. Run them from the repository root so Node
resolves Playwright and Prisma.

## Keep the map current

When routes or labels change, run `/maintain-verification-skill` and correct the
feature files from the app.
