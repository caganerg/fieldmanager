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

Fields, groups, soil analyses, the irrigation, fertilization and crop protection
records and the activity log are kept in one JSON file on the host, written
through `src/app/api/data/route.ts` and `src/lib/server/data-store.ts`.
`FIELDMANAGER_DATA_DIR` selects the directory and defaults to `./data`, which is
gitignored.

`src/components/FieldDataProvider.tsx` is the single client-side owner of that
document: it loads once, hands the slices out through `useFieldData()`, and
writes the whole thing back debounced. Components must not persist workspace
data to `localStorage` — browser storage is only for things that describe the
browser (theme, pinned tools, the welcome flag, which member the session acts
as).

The provider also keeps the undo stack, and it is a stack of whole documents
rather than one per list: deleting a field also writes the activity saying so,
and a step that put the field back but left the log entry would be describing
something that is on screen again. Because React batches the state updates one
action makes, an action is recorded once however many slices it touched.
Undoing is an ordinary edit as far as the save effect is concerned, so it
reaches the server the same way. Adopting a document from the server — the
first load and the 409 path — clears the stack; undoing across the adoption
would push the version this tab never saw back out, which is the overwrite
adopting it avoided. `HistoryControls` in the header and Ctrl+Z are two ways
into the same stack, and the shortcut deliberately stands aside inside a text
box, which has an undo of its own.

`src/lib/team.ts` holds the roles and the `ActivityItem` type. The people
themselves are **not** in this document — see below.

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

`readDocument` hands back a **shared, read-only document**. Parsing and
sanitising a farm on every request was most of the work in answering one, so the
result is cached against the file's own mtime and size; a write here drops the
entry, and an operator editing the JSON by hand is caught by the stat. Sort or
filter a copy — `[...document.irrigationLogs].sort(...)` — because the array you
were handed is the one the next request gets too. `saveData` is safe by
construction: it builds a new document rather than editing the one it read.

The same split exists in `auth-store`: `readSnapshot` is the cached reader
behind `accountForToken`, `listAccounts` and `authenticate`, while everything
that writes keeps using `readDocument` and goes to disk, because it edits the
document it was handed. `ensureReady` is likewise a promise kept for the life of
the process — seeding and the legacy-team import cannot come true again, and
running them per request meant two extra reads and a turn through the write
queue before every session check.

## Accounts and sessions

The app has a login. `/api/data` answers a request without a session with `401`
and a `viewer` account's `PUT` with `403`, so a visitor who has not signed in —
the guest state the app opens in — never receives workspace data. Keep those
checks if you touch the route; the rate limits next to them are damage control,
not access control.

Accounts live in their own file, `fieldmanager-auth.json`, in the same
`FIELDMANAGER_DATA_DIR`, written by `src/lib/server/auth-store.ts`. They are
deliberately **not** a slice of the field document: that document is fetched and
rewritten wholesale by every signed-in browser, and password hashes must never
make that trip. Nothing from the store reaches a client except through
`toPublicAccount`.

- `src/lib/auth.ts` is the isomorphic half — roles, the public account shape, the
  username and password rules — mirroring what `field-data.ts` does for fields.
  No `node:crypto` in it.
- `src/lib/server/session.ts` turns a request into an account:
  `requireAccount`, `requireEditor`, `requireAdmin`. Route handlers should use
  those rather than reading the cookie themselves.
- Passwords are `scrypt` with a per-password salt. Sessions are a random token
  in an `httpOnly` cookie, stored server-side as a SHA-256 hash so the file
  cannot be replayed.
- The first start seeds one `admin` account, with `FIELDMANAGER_ADMIN_PASSWORD`
  if the operator set one and the documented default `admin` otherwise. Landing
  on the default sets `mustChangePassword`, which is what makes the app ask for
  a new password after signing in. That prompt is a suggestion, not a wall — an
  installation that cannot be opened is worse than one with a weak password on
  a trusted network. Do not turn it into a forced redirect.
- The store refuses to demote or delete the last administrator, and the route
  refuses to let an administrator change their own role or reset their own
  password. Keep those guards: they are what stops an installation from ending
  up with nobody who can manage accounts.

There is one list of people, not two. The team directory used to live in the
field document as `UserMember` while credentials lived here; adding somebody to
the farm meant adding them twice, and the two lists drifted. They are one record
now: profile (name, email, phone, assigned fields) and sign-in (username,
hash) on the same account. A person with no `passwordHash` is a
directory entry who cannot sign in yet, which is what the old team entries
became — `importLegacyTeam` moves them across once, reading the field file
directly because `sanitizeData` no longer knows the `users` key. Do not
reintroduce a second list.

An account has no presence or availability field. There used to be a `status`
— online / in field / on leave / offline — set by hand in the account form and
drawn as a coloured dot on every avatar; nothing updated it, so it only ever
said what somebody last typed. Do not add it back, and do not derive one from
`lastLoginAt` either.

`src/lib/use-accounts.ts` is the only client-side reader: one SWR cache behind
`/api/accounts`, shared by the header panel (`UsersMenu`) and the `/users` page,
with `AccountDialog` as the single add/edit form. Two components keeping their
own copy of the list is exactly the split this replaced.

Reading the list needs any session — a directory nobody can see is not a
directory — so `GET /api/accounts` is not admin-only; `toPublicAccount(account,
full)` is what keeps `lastLoginAt` and `mustChangePassword` for administrators.
A person may edit their own profile fields; role, field assignment, username and
password are administrator-only, enforced in the route rather than in the form.

`src/components/AuthProvider.tsx` owns the session on the client and is mounted
in `layout.tsx`, above `FieldDataProvider`. `src/app/page.tsx` is the gate: the
dashboard and the data provider are only mounted for a signed-in browser, so
`useFieldData` never runs for a guest.

## The assistant

There is one assistant, reachable from four places: the "Ask AI" tool in the
header, and a button in each of the fertilization, soil and crop protection
dialogs. They share
one conversation, owned by `src/components/AssistantProvider.tsx` and drawn by
`AssistantDialog`. Three chat surfaces with three histories is exactly the split
this avoids — the entry points differ only in the *context* they attach to the
next question (`topic` plus `fieldId`).

`src/lib/ai.ts` is the isomorphic half, in the same sense as `field-data.ts` and
`auth.ts`: no `node:fs`, no vendor SDK. It holds the message shape, the topics,
the limits and `sanitizeMessages`. Nothing in it is vendor-specific — it is the
common denominator of the OpenAI, Gemini and Anthropic APIs, and the comment at
the top of the file records which differences it is absorbing (system prompt
travelling beside the turns, `assistant` vs Gemini's `model`, the first turn
having to be the user's). Adding the third adapter should not require touching
it.

`src/app/api/ai/route.ts` reads `FIELDMANAGER_AI_PROVIDER`,
`FIELDMANAGER_AI_API_KEY` and `FIELDMANAGER_AI_MODEL` from the server
environment and answers `503` with `unconfigured: true` when they are unset,
which is what makes the dialog say the assistant is not set up rather than look
broken. It handles the session, the limits and the error mapping; the two halves
below it are what actually answer.

`src/lib/server/ai-context.ts` builds the system prompt by reading the stored
document, and the topic is what narrows it. A `fertilizer` question gets that
field's applications together with its latest analysis and its recent watering —
the analysis says what the soil holds and the log says what has been added, and
neither answers a dosage question alone. A `soil` question gets the reports and
not the applications. A `protection` one gets that field's treatments, each
named by its method, because whether a beneficial was released or a product was
sprayed is what the answer turns on, and it arrives as two lists — carried out
and planned — because a plan has not happened and advising on the strength of a
spray that was only pencilled in is the failure worth designing against. A
`general` one gets a register of the fields and the record counts, and none of
the detail. Measurements are rendered with the band
they fall in ("Organic Matter 1.4 % (Low)") using the same `rateMeasurement`
the dialogs display, so the answer and the screen cannot disagree about what
counts as low. The caps at the top of the file are a token budget, not a
formality: every line is billed on every turn of the conversation.

`src/lib/server/ai-providers.ts` holds one adapter per vendor behind one
signature. Claude goes through the official `@anthropic-ai/sdk`; OpenAI and
Gemini go over plain HTTP. That asymmetry is deliberate — hand-rolling the
Anthropic call would mean reimplementing its retries and typed errors, while two
more SDKs to send one POST each would cost more than they return. Provider
errors become an `AiProviderError` carrying a status; the vendor's own response
body is logged rather than returned, because it can quote the request, and the
request holds the farm's records. `thinking` is deliberately not sent: the model
is operator configuration, so the code cannot know which family it is talking
to, and the parameter is rejected by some models and required in an older shape
by others.

Two rules to keep:

- The key, the provider and the model come from the server environment only.
  There is no settings field for them and the route must not accept them from
  the request — the same rule the weather route follows, and for the same
  reason: that path puts a secret in `localStorage` and lets a client bill
  somebody else's account.
- The request carries a `fieldId`, not field data. The server already holds the
  document and reads the analyses and records itself. A client that assembled
  its own context could put anything in front of the model and call it a
  measurement, and it would cost more to ship.

The model is named in the environment rather than defaulted in the source
because model names are the fastest-moving part of all three APIs; a constant
compiled in here would go stale silently.
