# Search users

Search users lets a person find an account from the users page.

## Sub-features

- `search-open` shows the search box.
- `search-match` lists accounts whose name or username matches the query.
- `search-empty` shows `No users found` when nothing matches.

## How to get to it (user POV)

- Open `/users`.
- Type in the box named `Search`.

## Driving it with epic-notes

Preconditions:

- Doctor succeeded for this `instance.json`.
- The seeded user `kody` exists.

- **Open search.** Run
  `node .cursor/skills/verify-epic-notes/scripts/drive.mjs <instance.json> search`.
  The script opens `/users` and fills the search box with `kody`.
- **See the match.** A link named `Kody profile` is visible, and the text
  includes `kody`.
- **Proof.** `<evidence>/search/page.png` shows that profile link.

## Gotchas

- The box submits on its own after a short pause. Wait for `Kody profile`
  instead of pressing Enter.
- An empty query redirects to `/users` and lists users. That is not a search for
  Kody.
- This recipe does not cover the empty state. A missing `kody` user is a failed
  precondition, not an empty-state pass.
