# Log in

Log in lets a person open Epic Notes as an existing user and see that user's
notes.

## Sub-features

- `login-open` shows the login form to an anonymous visitor.
- `login-submit` accepts the seeded username and password.
- `login-notes` shows that user's note list after login.

## How to get to it (user POV)

- Open `/login`.
- Submit `Username` and `Password`, then choose `Log in`.

## Driving it with epic-notes

Preconditions:

- Doctor succeeded for this `instance.json`.
- The database still has `kody` / `kodylovesyou` and `Basic Koala Facts`.

- **Open the form.** Visit `/login`. The heading reads `Welcome back!`.
- **Sign in.** Run
  `node .cursor/skills/verify-epic-notes/scripts/drive.mjs <instance.json> login`.
  The script fills `Username` with `kody`, fills `Password` with `kodylovesyou`,
  and chooses the button named `Log in`.
- **See the account.** The page reaches `/users/kody/notes`. The heading reads
  `Kody's Notes` and a link reads `Basic Koala Facts`.
- **Proof.** The script writes `<evidence>/login/page.png` and
  `<evidence>/login/page.txt`. The png shows the heading and the note link.

## Gotchas

- The GitHub button is named `Login with GitHub`. Choose `Log in`, not that
  button.
- Leave the honeypot field empty. Filling it rejects the post.
- The username field lowercases its value. Use `kody`.
- A screenshot of the login form alone does not prove the session. The notes
  list does.
