---
name: verify-note-delete-permission
description:
  Re-check that deleting a note follows delete:note:own for the owner and
  delete:note:any for everyone else. Use when a change touches
  userHasPermission, requireUserWithPermission, or the note delete action.
---

# Note delete permission

A person may delete their own note only with `delete:note:own`. A person may
delete someone else's note only with `delete:note:any`. `any` does not grant
`own`, and `own` does not grant `any`. Breaking that lets a normal member delete
another member's note by posting the delete form, or hides a delete the server
will reject.

The notes page in `app/routes/users/$username/notes/$noteId.tsx` already chooses
the permission from ownership. The action in that file does not. It calls
`requireUserWithPermission(request, 'delete:note:own')` and then deletes the
note id from the form. No test under `tests/` posts that form as a non-owner.

## When to run

Run this after any edit to these symbols.

- `userHasPermission` and `parsePermissionString` in `app/utils/user.ts`
- `requireUserWithPermission` in `app/utils/permissions.server.ts`
- the `action` export in `app/routes/users/$username/notes/$noteId.tsx`

## Run

From the repository root, after `bash .cursor/install.sh`:

```sh
npx tsx .cursor/skills/verify-note-delete-permission/check-note-delete.ts
```

The command uses `tsx` 4.21.0 from this repo. It needs Node.js 22. There is no
separate model checker to install. TypeScript has no SMT verifier in this
project, and the permission set is finite, so the script calls the real
`userHasPermission` on every subset of the 16 seeded permission triples.

Exit 0 means both checks agree. Exit 1 means at least one check failed. Read the
lines above the exit. A helper mismatch means `userHasPermission` disagrees with
the rule in the script. A note-delete mismatch means the action disagrees with
the notes page. Exit 2 means the action no longer matches the model. Update the
script from the action, then run it again. Do not change the script just to make
exit 1 go away.

## What the check covers

The helper check compares `userHasPermission` to this rule. A request
`action:entity` matches any stored access for that pair. A request
`action:entity:own` or `action:entity:any` matches only that access. A missing
user matches nothing. One role holds the subset under test. Users with several
roles are the union of those permissions, which is the same set as one role
holding the union. The script does not open the database and does not call
`requireUserWithPermission`.

The note-delete check reads the `action` function. While that function still
gates on `delete:note:own`, deletes by id, and never mentions `ownerId`, the
model allows the delete exactly when `userHasPermission` allows
`delete:note:own`. It compares that to the notes page rule for both ownership
values and every permission subset.

## Current finding

On commit `1c2c3b13117d5310db5ada8eb8f2dca3826ac603` the helper check passes and
the note-delete check fails.

The seeded `user` role, inserted in
`prisma/migrations/20250221233640_init/migration.sql`, has `delete:note:own` and
not `delete:note:any`. For a note that user does not own, the action allows the
delete and the notes page does not. The seeded `admin` role has
`delete:note:any` and not `delete:note:own`. For a note that admin does not own,
the action denies the delete and the notes page shows it. Kody is not either of
those cases, because the seed gives Kody both roles.

Leave the product code as it is unless the task asks to change deletion. Move
the sync commit below forward only after you re-read the action and the helper
and the script still describes them.

## Sync commit

`1c2c3b13117d5310db5ada8eb8f2dca3826ac603`

Covered files:

- `app/utils/user.ts`
- `app/utils/permissions.server.ts`
- `app/routes/users/$username/notes/$noteId.tsx`

## After the code moves

When a later change edits a covered file and does not rerun this script, run
`/maintain-formal-verification-skill`. That skill updates the model and says
whether a new failure is drift or a bug.
