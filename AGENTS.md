# Epic Notes agent notes

Epic Notes is the web app in this repository. Use these commands to install it,
run it, and test it.

## Install

Node.js 22.18 or newer is required. From the repository root:

```sh
bash .cursor/install.sh
npx prisma db seed
```

`bash .cursor/install.sh` copies `.env.example` to `.env` when `.env` is
missing. It then runs `npm ci`, `npx prisma generate --sql`,
`npx prisma migrate deploy`, and `npx playwright install chromium`. Run it again
after a lockfile change. A second run completes without changing a database that
is already migrated.

`npx prisma db seed` creates the user `kody` with password `kodylovesyou`. The
seed is not safe to run twice on the same database. Run it once on an empty
database. Cloud agents that only need dependencies can stop after
`bash .cursor/install.sh`.

## Run

```sh
npm run dev
```

The server is ready when the log prints `We have liftoff!`. It listens on port
3000 unless `PORT` is set. Open `http://localhost:3000/login`.

## Test

`npm test` starts Vitest in watch mode. For one run:

```sh
npm test -- --run
```

## Prove a page

Follow `.cursor/skills/verify-epic-notes/SKILL.md`. The feature map is in
`.cursor/skills/verify-epic-notes/features/`.

## Check note deletion

```sh
npx tsx .cursor/skills/verify-note-delete-permission/check-note-delete.ts
```

Exit 1 means the note delete action does not match the notes page. Read
`.cursor/skills/verify-note-delete-permission/SKILL.md` before treating that
exit as a broken script.

## pstack

pstack 0.15.36 is in `.cursor/plugins/pstack`. The pin is
`.cursor/pstack-pin.json`, git commit
`1ba91fc25c0977741dd0e267849e6234b037ed0a`. `.cursor/settings.json` enables that
plugin for the project.
