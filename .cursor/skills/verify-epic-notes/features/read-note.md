# Read a note

Read a note lets a person open one note from a user's list and see its title.

## Sub-features

- `read-list` shows the note titles for a user.
- `read-open` shows the selected note's title and body.

## How to get to it (user POV)

- Open `/users/kody/notes`.
- Choose the link `Basic Koala Facts`.

## Driving it with epic-notes

Preconditions:

- Doctor succeeded for this `instance.json`.
- `Basic Koala Facts` is still in Kody's list.

- **Open the list.** The drive signs in as `kody` and opens `/users/kody/notes`.
- **Open the note.** Run
  `node .cursor/skills/verify-epic-notes/scripts/drive.mjs <instance.json> read-note`.
  The script chooses the link `Basic Koala Facts`.
- **See the note.** The heading reads `Basic Koala Facts`.
- **Proof.** `<evidence>/read-note/page.png` shows that heading.

## Gotchas

- The list and the open note both contain the title. The proof is the heading on
  the note page, after the link click.
- Anonymous visitors can open a public note list. This recipe still signs in so
  the run matches a logged-in reader.
