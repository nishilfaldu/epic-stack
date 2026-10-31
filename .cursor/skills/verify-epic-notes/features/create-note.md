# Create a note

Create a note lets Kody save a title and body and see that note on its own page.

## Sub-features

- `create-open` opens an empty editor.
- `create-save` stores the title and body.
- `create-show` shows the saved title after submit.

## How to get to it (user POV)

- Sign in as Kody.
- Open `/users/kody/notes`.
- Choose `New Note`.
- Enter `Title` and `Content`, then choose `Submit`.

## Driving it with epic-notes

Preconditions:

- Doctor succeeded for this `instance.json`.
- Kody can open `/users/kody/notes/new`.
- No note is titled `Release checklist` yet. Launch uses a fresh database, so
  this holds.

- **Open the editor.** The drive signs in and opens `/users/kody/notes/new`.
- **Enter the note.** Run
  `node .cursor/skills/verify-epic-notes/scripts/drive.mjs <instance.json> create-note`.
  The script fills `Title` with `Release checklist` and `Content` with
  `Tag and publish`.
- **Save.** The script chooses the button named `Submit`.
- **See the saved note.** The heading reads `Release checklist`.
- **Proof.** `<evidence>/create-note/page.png` shows that heading on the note
  page, not the editor.

## Gotchas

- The empty image row is part of the form. Leave it empty. Do not attach a file.
- `Reset` discards the draft. Choose `Submit`.
- Title length is 1 to 100 characters. Content length is 1 to 10000 characters.
- A toast or a disabled button is not proof. The note page heading is the proof.
