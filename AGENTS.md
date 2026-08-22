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
