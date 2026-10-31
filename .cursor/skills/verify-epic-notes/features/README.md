# Epic Notes verification map

This directory is the source for proving Epic Notes in a browser. Read this
index, then follow one feature file.

## Baseline preconditions

- Dependencies are installed with `bash .cursor/install.sh`.
- Launch with `.cursor/skills/verify-epic-notes/scripts/launch.sh`.
- Doctor reports the pid, the url, and `Welcome back!`.
- The fresh database contains `kody` / `kodylovesyou` and the note
  `Basic Koala Facts`.
- Drive only the instance whose `instance.json` you just launched.

## Driving conventions

- Start from the seeded database unless the feature file says otherwise.
- Prefer the accessible name. The login fields are `Username` and `Password`.
  The login button is `Log in`. The account control is `User menu`.
- Run
  `node .cursor/skills/verify-epic-notes/scripts/drive.mjs <instance.json> <feature>`.
- Keep `page.png` and `page.txt`. Cleanup removes the database and the server,
  not those files.

## Proof and skip reporting

- Capture the action and the resulting page.
- Record the feature id in the evidence path.
- If a precondition is missing, report the command and the reason. Do not drive
  a different feature and call it this one.

## Features

- [Log in](./log-in.md) opens an authenticated session as Kody and shows Kody's
  notes.
- [Read a note](./read-note.md) opens `Basic Koala Facts` from Kody's note list.
- [Create a note](./create-note.md) saves a new note and shows it again.
- [Search users](./search-users.md) finds the Kody profile from the users page.
