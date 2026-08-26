# Field Manager — notes for AI agents

## This project uses Bun, not npm

Bun is the package manager, script runner and runtime for this repository, and
the machine it is developed on has **no Node.js installed at all**. Any command
starting with `npm`, `npx`, `yarn` or `pnpm` will fail.

```bash
bun install          # install dependencies (instead of: npm install)
bun add <pkg>        # add a dependency  (instead of: npm install <pkg>)
bun add -d <pkg>     # add a dev dependency
bun remove <pkg>     # remove a dependency
bun run dev          # start the dev server
bun run build        # production build
bun run start        # serve the production build
bun run lint         # eslint
bunx <tool>          # run a one-off CLI (instead of: npx <tool>)
```

The lockfile is `bun.lock` and it is committed. Never generate a
`package-lock.json`; if one shows up, delete it and re-run `bun install`.

`bunfig.toml` sets `[run] bun = true` so that binaries in `node_modules/.bin`
— whose shebang is `#!/usr/bin/env node` — are executed by the Bun runtime
instead of searching for a Node binary that does not exist. Do not remove it.
Next.js 16 (dev, build, start) and ESLint have all been verified to run under
Bun with no Node present.

### Expected warning

`bun install` reports `Blocked 1 postinstall` for `unrs-resolver` (a transitive
dependency of `eslint-config-next`). This is expected and harmless: its
postinstall would run `node postinstall.js`, and the package already ships the
`resolver-binding-linux-x64-*` binaries it would otherwise select. Do not run
`bun pm trust` for it and do not install Node to satisfy it — `bun run lint`
passes as is.

Do not add a `packageManager` field to `package.json` either; that field is a
Corepack convention and Corepack has no Bun shim, so it only breaks CI. The
`engines.bun` field is what documents the requirement here.

Anything you write that documents or automates setup — README, Dockerfiles, CI
workflows — must assume Bun as well. This project deliberately has no install
script: setup and deployment steps live in `README.md` so they can be read
before they are run. Do not add one back.

## Project shape

Next.js 16 App Router with Turbopack, React 19, Tailwind CSS v4 and Leaflet
(`react-leaflet` + `react-leaflet-draw`) for the map. Source lives in `src/`,
the weather proxy route is `src/app/api/weather/route.ts` and needs
`OPENWEATHER_API_KEY` in `.env.local`.

The key is read from the server environment only. The route deliberately does
not accept a key from the request, and there is no settings field for one —
that path used to put a secret in `localStorage` and in request URLs. Do not
add it back.

## Field data lives on the server

Fields, groups, soil analyses and the irrigation/fertilization records are kept
in one JSON file on the host, written through `src/app/api/data/route.ts` and
`src/lib/server/data-store.ts`. `FIELDMANAGER_DATA_DIR` selects the directory
and defaults to `./data`, which is gitignored.

`src/components/FieldDataProvider.tsx` is the single client-side owner of that
document: it loads once, hands the slices out through `useFieldData()`, and
writes the whole thing back debounced. Components must not persist field data to
`localStorage` — browser storage is only for things that describe the browser
(theme, pinned tools, the welcome flag).

There is no manual export or import, and no file-download or file-upload path.
That was removed deliberately when the server store landed; the backup story is
copying the JSON file, which is documented in `README.md`. Do not add it back.

Writes are guarded by a `revision` counter: a `PUT` carrying a stale revision is
rejected with `409` and the current document, which the provider then adopts.
Keep that check if you touch the route — it is what stops a second tab from
silently overwriting the first.

`src/lib/field-data.ts` holds the shared shape and the sanitisers, and is
deliberately isomorphic: no `node:fs`, no Leaflet, so the route, the store and
the browser all validate against one definition. Anything reaching the store
goes through `sanitizeData`.
