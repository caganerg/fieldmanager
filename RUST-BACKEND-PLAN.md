# Rust Backend Migration Plan

Moving Field Manager's server side from TypeScript/Next.js route handlers to
Rust (Axum). This document is a **plan**; no code has changed yet.

**Two decisions already taken:**

1. **Topology** — Rust runs as a separate service on `127.0.0.1:8080`, Next.js
   stays on `:3000` and forwards `/api/*` to Rust through `rewrites` in
   `next.config.ts`. The browser still sees a single origin; not one of the
   existing `fetch("/api/data")` calls changes, the cookie stays on the same
   origin, and no CORS is involved.
2. **Storage** — the JSON files give way to **SQLite** (WAL). The `revision`
   guard becomes a single `BEGIN IMMEDIATE` transaction.

```
Browser
   │
   └─► Next.js :3000  (pages, RSC, static assets, CSP headers)
         │  rewrites: /api/:path*  ──►  http://127.0.0.1:8080/api/:path*
         ▼
       Rust / Axum :8080
         ├─► data/fieldmanager.db        (fields, records, activity)
         ├─► data/fieldmanager-auth.db   (accounts, sessions)
         └─► outbound: OpenWeather, Anthropic / OpenAI / Gemini
```

---

## 1. The surface being moved — inventory

The backend today is 8 routes and 6 server modules; roughly 1,500 lines.

### Route handlers (`src/app/api/`)

| File | Lines | What it does |
| --- | --- | --- |
| `data/route.ts` | 84 | Reads and writes the whole document, `revision` conflict check |
| `accounts/route.ts` | 91 | Lists people, adds a person |
| `accounts/[id]/route.ts` | 144 | Edits and deletes a person, the permission rules |
| `auth/login/route.ts` | 57 | Authentication, session cookie |
| `auth/password/route.ts` | 65 | Changing your own password |
| `auth/session/route.ts` | 55 | Who this browser is, signing out |
| `weather/route.ts` | 125 | OpenWeather proxy plus the daily summary |
| `ai/route.ts` | 131 | The assistant: session, limits, prompt, vendor call |

### Server modules (`src/lib/server/`)

| File | Lines | What it does |
| --- | --- | --- |
| `auth-store.ts` | 659 | Account and session store, scrypt, seeding, legacy team import |
| `ai-context.ts` | 275 | Builds the system prompt from the document, narrowed by topic |
| `ai-providers.ts` | 195 | Anthropic / OpenAI / Gemini adapters |
| `session.ts` | 153 | Request → account; `requireAccount/Editor/Admin`; the cookie |
| `data-store.ts` | 150 | JSON file store, mtime cache, atomic write, write queue |
| `rate-limit.ts` | 112 | The shared per-client limiter, body size check |

### Isomorphic libraries (`src/lib/`) — server *and* client

These are the **most critical part** of the migration. Every piece the server
uses needs a Rust counterpart, while the client goes on using the same logic.

| File | What the server uses | What must stay on the client |
| --- | --- | --- |
| `field-data.ts` | `sanitizeData`, `sanitizeDocument`, every limit | Types, `emptyData()` |
| `auth.ts` | `normalizeUsername`, `validateUsername`, `validatePassword`, `roleCanEdit`, `toSessionUser` | Types, role titles/colours, `initialsFor` |
| `soil.ts` | `sanitizeAnalyses`, `SOIL_PARAMETERS`, `rateMeasurement`, `byNewestSample` | The whole presentation layer (badges, drafts) |
| `irrigation.ts` | `sanitizeIrrigationLogs`, `methodLabel`, `byNewestIrrigation` | Date/area/water formatting, plan arithmetic |
| `protection.ts` | `sanitizeProtectionLogs`, `methodLabel`, `splitByStatus`, `treatmentsForField` | Labels, badges, drafts |
| `team.ts` | `USER_ROLES`, `ACTIVITY_TYPES`, `ACTIVITY_LIMIT` | The same |
| `ai.ts` | `sanitizeMessages`, `isSendable`, topics, limits | The request type, the topics |
| `geo.ts` | `getPolygonArea` (decares in the AI prompt) | Both, for the map |

---

## 2. The isomorphic boundary — the riskiest part of the plan

Today `sanitizeData` is one definition, and both the route and the browser
validate against it. Once the backend is in Rust that definition **becomes
two**. The two copies drifting apart silently is the largest piece of technical
debt this migration creates.

There are three distinct classes here, and each needs different treatment:

**a) Validation and sanitisation → Rust becomes the authority.**
Every `sanitize*` function moves to Rust. The TypeScript copies are deleted;
the client trusts the document the server returns. The only validation the
client still needs is `validateUsername` / `validatePassword` for immediate
form feedback — those are deliberately kept in both places and tied together
by shared fixture tests (below).

**b) Types → generated from Rust.**
`StoredDocument`, `PublicAccount`, `SessionUser`, `SoilAnalysis`,
`IrrigationLog`, `ProtectionLog` and `ActivityItem` are generated from the Rust
structs with [`ts-rs`](https://docs.rs/ts-rs) into `src/lib/generated/`. The
hand-written TS type declarations re-export from there, so a renamed field is
caught at compile time. Serde's `rename_all = "camelCase"` keeps the existing
JSON field names exactly as they are.

**c) `SOIL_PARAMETERS` → a shared data file.**
This 150-line band table is the single source both the server (rendering
"Organic Matter 1.4 % (Low)" into the AI prompt) and the screen read from.
AGENTS.md's rule that "the answer and the screen cannot disagree about what
counts as low" rests directly on it. Copying the table into two places breaks
that rule.

The fix: move the table to `shared/soil-parameters.json`. Rust embeds it at
build time with `include_str!`, TypeScript imports it directly. The
`rateMeasurement` logic itself (about ten lines) is written on each side, but
the data stays in one place.

**Insurance against drift:** `shared/fixtures/` holds input → expected-output
JSON pairs. The same fixtures run in the Rust tests (`cargo test`) and on the
TS side. When a new edge case turns up a fixture is added, and both sides fail.

---

## 3. The API contract — to be preserved exactly

Not changing a line of the frontend depends on the table below holding to the
letter: status codes, body shapes and `Cache-Control` headers included.

| Path | Method | Auth | Status codes | Response body |
| --- | --- | --- | --- | --- |
| `/api/auth/session` | GET | — | 200, 500 | `{user}` or `{user:null}` |
| `/api/auth/session` | DELETE | — | 200 | `{user:null}` + cookie cleared |
| `/api/auth/login` | POST | limit 10/5 min | 200, 400, 401, 429, 500 | `{user}` + `Set-Cookie` |
| `/api/auth/password` | POST | session | 200, 400, 401, 403, 404, 500 | `{user}` |
| `/api/accounts` | GET | session | 200, 401, 500 | `{accounts:[...]}` |
| `/api/accounts` | POST | admin | 201, 400, 401, 403, 409, 500 | `{account}` |
| `/api/accounts/{id}` | PATCH | self / admin | 200, 400, 401, 403, 404, 409, 500 | `{account}` |
| `/api/accounts/{id}` | DELETE | admin | 200, 401, 403, 404, 409, 500 | `{ok:true}` |
| `/api/data` | GET | session | 200, 401, 500 | `StoredDocument` |
| `/api/data` | PUT | editor, limit 60/min, 8 MB | 200, 400, 401, 403, **409**, 413, 429, 500 | `StoredDocument` |
| `/api/weather` | GET | limit 20/min | 200, 400, 429, 500, 502, 503 | `{current, forecast}` |
| `/api/ai` | POST | session, limit 20/min, 128 KB | 200, 400, 401, 413, 422, 429, 500, 502, 503 | `{reply, provider, model}` |

Details that are easy to lose:

- **The 409 body is a document.** On a conflict `PUT /api/data` returns the
  current `StoredDocument`, not an error — the client adopts it through
  `applyDocument`.
- **Empty optionals are absent from the JSON.** `optionalText` turns an empty
  string into `undefined`, so a field like `cropType: ""` is never written at
  all. In Rust `#[serde(skip_serializing_if = "Option::is_none")]` is required.
- **`PublicAccount` has two faces.** `lastLoginAt` and `mustChangePassword` are
  for administrators only (`toPublicAccount(account, full)`). They must be
  `Option` and omitted, never written as `null`.
- **The error body is `{ "error": "..." }` everywhere.**
- **`{unconfigured: true}`** — this flag on the AI 503 is what makes the dialog
  say the assistant is not set up; drop it and the interface looks broken.
- **`{configured: false}`** — the equivalent on the weather 503.
- **`Cache-Control: no-store`** on every authenticated response.
- **The weather ten-minute cache.** Today `next: { revalidate: 600 }` gives
  this to Next's fetch cache. There is no equivalent in Rust: an in-memory
  cache keyed by rounded lat/lon with a ten-minute TTL has to be written by
  hand. Without it the OpenWeather quota drains silently faster.

---

## 4. The SQLite schema

Two separate database files, in place of today's two JSON files. The reason for
keeping them apart is the one AGENTS.md gives, in a different form: password
hashes do not belong in the same place as the field document, and both backups
and the documented "delete the auth file to recover the administrator password"
step must keep working without touching the field data.

```sql
-- fieldmanager.db
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE document (               -- one row; owns the revision
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  version    INTEGER NOT NULL,
  revision   INTEGER NOT NULL,
  updated_at TEXT    NOT NULL
);

-- Every slice carries `position`: the document's arrays are ordered and the
-- client renders them in array order (see "Array order is data" below).
CREATE TABLE groups (
  id   TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE fields (
  id           TEXT PRIMARY KEY,
  position     INTEGER NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  coordinates  TEXT NOT NULL,          -- JSON: [[lat,lng], ...]
  crop_type    TEXT, plant_date TEXT, harvest_date TEXT,
  group_id     TEXT, color TEXT
);

CREATE TABLE soil_analyses (
  id TEXT PRIMARY KEY, position INTEGER NOT NULL,
  field_id TEXT NOT NULL DEFAULT '', field_name TEXT NOT NULL DEFAULT '',
  sample_date TEXT, depth TEXT, lab TEXT, texture TEXT, notes TEXT,
  ph TEXT, ec TEXT, lime TEXT, organic_matter TEXT,
  phosphorus TEXT, potassium TEXT, nitrogen TEXT,
  iron TEXT, zinc TEXT, manganese TEXT, copper TEXT
);
CREATE INDEX soil_analyses_field ON soil_analyses(field_id, sample_date DESC);

CREATE TABLE irrigation_logs   (id TEXT PRIMARY KEY, position INTEGER NOT NULL, field_id TEXT, ...);
CREATE INDEX irrigation_field  ON irrigation_logs(field_id, date DESC);

CREATE TABLE fertilizer_logs   (id TEXT PRIMARY KEY, position INTEGER NOT NULL, field_name TEXT, ...);
CREATE INDEX fertilizer_field  ON fertilizer_logs(field_name);

CREATE TABLE protection_logs   (id TEXT PRIMARY KEY, position INTEGER NOT NULL, field_id TEXT, status TEXT, ...);
CREATE INDEX protection_field  ON protection_logs(field_id, status, date DESC);

CREATE TABLE activities (
  id TEXT PRIMARY KEY, position INTEGER NOT NULL,
  user TEXT, action TEXT,
  timestamp INTEGER NOT NULL, type TEXT
);
```

**Array order is data.** The document's arrays are not sets. `page.tsx` writes
the activity log with `setActivities(prev => [newAct, ...prev])` — the log is
newest-first *by position*, and nothing sorts it on the way to the screen. The
same is true of the fields and the groups: the client renders them in array
order. So reassembling a slice with a bare `SELECT` would quietly reorder the
document, and sorting activities by `timestamp` is not the same thing (two
entries can share a millisecond, and the position is what the client actually
meant). Every slice therefore carries an explicit `position`, written from the
array index on the way in and used as `ORDER BY position` on the way out. The
round-trip test in step 4a must compare arrays **in order**, not as sets.

```sql
-- fieldmanager-auth.db
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  assigned_field_ids TEXT NOT NULL,      -- JSON array; "all" stands alone
  password_hash TEXT NOT NULL DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, last_login_at TEXT
);
-- An empty username means a directory entry that cannot sign in; there may be
-- many of those, so the uniqueness constraint is partial.
CREATE UNIQUE INDEX accounts_username ON accounts(username) WHERE username <> '';

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,           -- SHA-256, hex
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

**Why wide columns for the soil analysis?** The set of measurements is fixed
and matches `SOIL_PARAMETERS` one for one; a key/value table would complicate
both the queries and the prompt building for nothing. Adding a measurement
costs a migration — the accepted price.

**The `revision` guard:**

```
BEGIN IMMEDIATE;                       -- take the write lock up front
  SELECT revision FROM document WHERE id = 1;
  -- if it does not match base_revision: ROLLBACK, 409 + the current document
  DELETE FROM fields; INSERT ...;      -- per slice, position = array index
  UPDATE document SET revision = revision + 1, updated_at = ?;
COMMIT;
```

This replaces the `writeQueue` chain in `data-store.ts` and its twin in
`auth-store.ts` entirely — serialising writes is the database's job now.

**Note:** the client PUTs the whole document today, and SQLite does not force
that to change. The contract stays as it is, with a per-slice "delete and
reinsert" inside the transaction. Partial or per-resource endpoints (a
`POST /api/fields`, say) are **out of scope** here and are a later piece of
work.

---

## 5. The Rust project layout

```
backend/
├── Cargo.toml                  # workspace
├── migrations/                 # sqlx migrate; separate folders for data and auth
│   ├── data/0001_init.sql
│   └── auth/0001_init.sql
├── crates/
│   ├── domain/                 # the Rust half of what is isomorphic today
│   │   ├── field_data.rs       # types + sanitise + limits
│   │   ├── soil.rs             # SOIL_PARAMETERS (embedded JSON) + rate_measurement
│   │   ├── irrigation.rs
│   │   ├── protection.rs
│   │   ├── team.rs
│   │   ├── auth.rs             # roles, username and password rules
│   │   ├── ai.rs               # message sanitisation, topics, limits
│   │   └── geo.rs              # polygon area (spherical excess)
│   ├── store/                  # SQLite: data_store, auth_store, migrations
│   ├── ai/                     # ai_context (prompt) + providers (three adapters)
│   └── server/                 # Axum: router, extractors, rate limiting, main
└── tools/
    └── import-json/            # one-off JSON → SQLite import
```

### Dependencies

| Crate | For | Note |
| --- | --- | --- |
| `axum` + `tokio` + `tower-http` | HTTP server, layers | **`DefaultBodyLimit` is 2 MB** — must be raised to 8 MB on `/api/data` |
| `serde`, `serde_json` | JSON | `rename_all = "camelCase"` is mandatory |
| `sqlx` (sqlite, runtime-tokio) | Database | Compile-time checked queries |
| `scrypt` (RustCrypto) | Passwords | **Must match Node's parameters** — see below |
| `sha2` | Session token hashing | Hex output |
| `subtle` | Constant-time comparison | The `timingSafeEqual` equivalent |
| `rand` | Token generation | 32 bytes |
| `base64` | Salt/hash and token encoding | STANDARD and URL_SAFE_NO_PAD are different |
| `uuid` (v4) | Account ids | The `randomUUID` equivalent |
| `axum-extra` (cookie) | Reading and writing the cookie | |
| `reqwest` (rustls) | OpenWeather plus the three AI vendors | |
| `chrono` | ISO 8601 timestamps | Mind the `Date.parse` semantics |
| `tracing` + `tracing-subscriber` | Logging | The `console.error` equivalent |
| `dashmap` or `parking_lot::Mutex<HashMap>` | Rate limiter | The existing ~40 lines port directly |

### scrypt compatibility — critical

The stored hash format is `scrypt$<salt base64>$<hash base64>`. Node's
`crypto.scrypt` defaults are **N=16384, r=8, p=1**, with a 16-byte salt and a
64-byte output. On the Rust side:

```rust
scrypt::Params::new(14, 8, 1, 64)   // log2(16384) = 14
```

Get this right and **every existing password keeps working** — nobody has to
reset anything. Acceptance criterion for slice 2: Rust verifies a real hash
produced by the TypeScript implementation, and vice versa.

**Every scrypt call must go through `tokio::task::spawn_blocking`.** Node hands
this work to the libuv thread pool, so `crypto.scrypt` is async and the request
loop never stalls. The Rust `scrypt` crate is plain synchronous CPU work:
N=16384 with r=8 means roughly 16 MiB and tens of milliseconds *per attempt*,
and `authenticate` deliberately hashes even for an unknown username (invariant
7). Called directly from a handler that is one stalled Tokio worker per sign-in
attempt — the throttle is per address, so many addresses are not throttled at
all. The same applies to `hashPassword` on account creation and password
changes.

### The Anthropic SDK — a deliberate departure

AGENTS.md justifies the Claude call going through the official
`@anthropic-ai/sdk` while the other two go over plain HTTP: hand-rolling
retries and typed errors when a maintained SDK exists is not free. **There is
no official Anthropic SDK for Rust.** So all three vendors go over plain HTTP
via `reqwest`. This is not breaking the rationale so much as the rationale
losing its premise — and `ai-providers` ends up more symmetric for it. Retries
and the timeout are set up on `reqwest` by hand (60 s timeout, 1 retry).
AGENTS.md should be updated as part of this migration.

---

## 6. Sequencing — vertical slices, not horizontal layers

The order matters more than the breakdown. A layer-first plan (all the types,
then all the storage, then all the routes, then one cutover day) means weeks of
Rust that nothing exercises, followed by a single high-risk moment where
everything changes at once. Its failure mode is discovering on cutover day that
the rewrite drops `x-forwarded-for`.

So the work is cut into **vertical slices**: each one an endpoint that actually
serves production traffic, carrying only the shared code that endpoint needs.
Rust in the repository grows a little at a time, and every step is independently
deployable and independently reversible.

The endpoints sort themselves by how much state they touch, and that ordering is
what makes gradual adoption possible:

| Endpoint | Reads the field doc | Reads accounts | **Writes** |
| --- | --- | --- | --- |
| `/api/weather` | — | — | — |
| `/api/ai` | yes | yes (token check) | — |
| `/api/auth/session` GET | — | yes | yes (`ensureReady` seeds) |
| `/api/auth/login`, `/api/auth/password` | — | yes | yes |
| `/api/accounts*` | — | yes | yes |
| `/api/data` | yes | yes | yes |

The first two rows write nothing, so they can move to Rust **while the
TypeScript backend still owns both files**. Only the writers have to move
together, and that is the one atomic moment in the whole plan.

---

### Slice 0 — A skeleton, in production

The `backend/` workspace, an Axum server, environment-based configuration,
`GET /api/health`, `tracing` logging, graceful shutdown on `SIGTERM`. A systemd
unit, and a `rewrites` entry in `next.config.ts` for **that one path only**.

This replaces the paper spike the plan used to open with. The two questions the
whole topology rests on get answered by measurement rather than by reading
Next's documentation, and answered in the real deployment:

1. **What reaches Rust through the rewrite?** `clientKey()` reads the client
   address from `x-forwarded-for` / `x-real-ip`, and the cookie's `Secure` flag
   looks at `x-forwarded-proto`. If Next substitutes its own address, the rate
   limiter counts every user against one key and stops meaning anything. If it
   does, either Rust takes the *first* entry of the `x-forwarded-for` chain, or
   a reverse proxy (nginx/Caddy) routes `/api/*` straight to Rust.
2. **Does the proxy carry a session and a large body?** `/api/data` takes an
   8 MB `PUT`, `/api/accounts/{id}` a `PATCH` and a `DELETE`, and login returns
   a `Set-Cookie`. A temporary `/api/_echo` that reflects the headers it
   received and sets a test cookie answers all of it; it is removed at the end
   of this slice. Note whether `content-length` survives or the proxy re-chunks
   — the cheap pre-read 413 in `readJsonBody` depends on that header.

Also worth settling here, now that there is a build to try them in: `ts-rs` or
`typeshare`; `sqlx` or `rusqlite`.

**Note:** `/api/:path*` publishes *everything* the Rust service serves. Either
keep the health check off the `/api` prefix, or accept that it is public and
give it nothing but a status.

**Acceptance:** both services run under systemd, `/api/health` answers through
the rewrite, and the header questions have written answers in this document.
**Blast radius:** none — no existing endpoint is touched.

#### Status

Built. `backend/` is a Cargo workspace with one crate, `fieldmanager-api`,
serving `/api/health` and — only with `FIELDMANAGER_ECHO=1` — `/api/_echo`.
`next.config.ts` rewrites those two paths and nothing else. The version comes
from `package.json` through `build.rs`, so the number still lives in one place.

Verified against the service directly:

| | Result |
| --- | --- |
| `/api/health` | `{"status":"ok","version":"0.3.0"}`, `cache-control: no-store` |
| `PUT` with an 8 MB body | arrives intact, `actualBytes` 8388608 |
| body over the limit | `413` |
| `PATCH`, `DELETE` | served |
| repeated `x-forwarded-for` | joined, not overwritten |
| `Set-Cookie` | emitted |
| `SIGTERM` | logs and exits cleanly |
| malformed `FIELDMANAGER_BIND` | names the variable and the expected form, exits 1 |

#### The measurement, answered

Measured on 2026-09-09 against Next 16.2.11 (`bun run dev`) proxying to the
release build.

**Question 2 — methods, bodies and cookies: all fine.**

| | Through the rewrite |
| --- | --- |
| `POST` / `PUT` / `PATCH` / `DELETE` | all proxied, 200 |
| 8 MB `PUT` | arrives whole: `actualBytes` 8388608 |
| `content-length` | preserved exactly (8388608), no re-chunking |
| `transfer-encoding` | absent — so the cheap pre-read 413 in `readJsonBody` keeps working |
| `Set-Cookie` | comes back to the client unchanged |
| `Cookie` | forwarded unchanged |

**Question 1 — the client address: it does not arrive.** This is the answer the
plan was worried about.

A plain request through the rewrite reaches the Rust service carrying only:

```
host: 127.0.0.1:8080
x-forwarded-host: 127.0.0.1:3000
```

Next adds **`x-forwarded-host` and nothing else**. There is no
`x-forwarded-for`, no `x-real-ip` and no `x-forwarded-proto`. And when the
*client* sends those headers itself, Next passes them through **verbatim**,
neither appending to them nor overwriting them.

Two consequences, and they pull in the same direction:

1. **`clientKey()` would return `"unknown"` for every caller.** On the
   documented setup — Next reached directly over plain http on a LAN — every
   client lands in one bucket, so the login throttle becomes a global one: ten
   attempts across the whole installation per five minutes. That is
   over-limiting rather than under-limiting, so it fails safe, but it is not
   what the code says it does.
2. **The header is caller-controlled.** Because Next forwards whatever arrived,
   anyone can send `x-forwarded-for: <anything>` and get a fresh bucket per
   request, which defeats the throttle in the other direction.

Neither is a regression: the TypeScript routes read the same header from the
same request today and behave identically when nothing sets it — `rate-limit.ts`
even says "or spoofed ones" in its own comment, and AGENTS.md calls these limits
"damage control, not access control". The rewrite does not make it worse. What
it does is make it permanent: the Rust service's peer is always Next on
loopback, so unlike a directly-exposed server it can never recover the real
address on its own.

**Decision.** Two deployments, stated rather than assumed:

- *Development, and a LAN install with no proxy.* Keep today's semantics —
  first entry of `x-forwarded-for`, then `x-real-ip`, then `"unknown"`. The
  limiter is coarse and spoofable, exactly as it is today. Slice 1 ports it
  as-is and this is written into README rather than left to be discovered.
- *Any install that is reached over https or from outside the machine.* Put a
  real reverse proxy in front (nginx/Caddy), have it set `x-forwarded-for` and
  `x-forwarded-proto`, and route `/api/*` straight to the Rust service rather
  than through Next. This is the fallback section 6 anticipated; it is now the
  recommended production topology rather than a contingency. Rust trusts the
  forwarding headers only when the peer address is that proxy, and falls back
  to the peer address otherwise — which is the part today's code cannot do,
  because it has no peer address to fall back to.

The `Secure` cookie flag rides on the same header and lands correctly either
way: absent on a plain-http install (right), and set by the front proxy on an
https one (right). It is only the no-proxy-but-https case that would be wrong,
and Next does not serve https directly in the documented setup.

**`/api/_echo` has now done its job** and is deleted in slice 1, along with
`FIELDMANAGER_ECHO`.

---

### Slice 1 — `/api/weather`: the first Rust in the application

**This is where the first Rust code should land.** It is the only endpoint with
no session and no store: 125 lines of TypeScript, one environment variable, two
upstream calls. Small enough to finish in a sitting, and complete enough to
exercise almost all of the plumbing every later slice needs — the router,
environment configuration, the ported rate limiter, `reqwest`, serde shaping,
and the rewrite path itself.

It is also the safest possible first move. If it breaks, the weather card does
not load; no record is at risk, nothing is written, and the rollback is deleting
one line from `rewrites`. And because the rate limiter is the first thing that
needs a real client address, this slice is what proves slice 0's answer to
question 1 under real traffic rather than in an echo endpoint.

Contents: coordinate validation, the API key format check, the two upstream
calls in parallel, the daily summary selection (one pass, preferring midday),
and the **ten-minute in-memory cache** that replaces `next: { revalidate: 600 }`.

**Acceptance:** the weather card renders identically; a second request for the
same coordinates does not reach upstream; the limiter counts distinct client
addresses rather than one.
**Blast radius:** the weather card.

#### Status

Done. `src/app/api/weather/route.ts` is deleted, `/api/weather` is in
`rustApiPaths`, and `rate-limit.ts` now says three routes rather than four.
`/api/_echo` and `FIELDMANAGER_ECHO` are gone, having answered slice 0's
questions.

Verified end to end through Next on :3000, with the TypeScript handler removed
— so a reply at all is proof the rewrite is serving it:

| | |
| --- | --- |
| no key set | `503 {"configured":false,...}` |
| `lat`/`lon` missing | `400 Latitude and longitude are required.` |
| out of range, or not a number | `400 Invalid coordinate values provided.` |
| 21st request in a minute | `429` with `Retry-After: 60` |
| key set, upstream rejects it | `502 {"error":"Invalid API Key."}` — a real TLS call to OpenWeather |
| `.env.local` | read by the API service, real environment wins |

12 unit tests cover the limiter's window and address rules, the forecast
grouping, the cache, and the key format check. A 200 body is the one path not
exercised here: it needs a real OpenWeather key, which this machine has none of.

**One rewrite ordering fact worth keeping.** A `rewrites()` that returns a plain
array is checked *after* filesystem routes, so a path only reaches Rust once its
`route.ts` is gone. Adding a path to `rustApiPaths` and leaving the handler in
place changes nothing, silently. `next.config.ts` says so where the list is.

Four deliberate departures from the TypeScript, none of them widening what is
accepted:

- **Coordinates are parsed strictly.** `parseFloat("41.5abc")` is 41.5; this
  refuses it. The only caller sends a plain number.
- **The cache is keyed on the exact coordinates**, not rounded ones as this
  document first suggested. Next's fetch cache was keyed on the upstream URL,
  and two parcels a few metres apart are still two parcels — sharing a reading
  between them would be a change in behaviour rather than a saving.
- **A 15-second upstream timeout**, where the TypeScript inherited whatever
  Next's fetch did.
- **`.env.local` is read by the service** (`dotenvy`, never overriding the real
  environment). Next reads that file by itself; without this the operator would
  set the key exactly where README says and be told weather is not configured.

And one thing the logging had to learn: `tower_http`'s classifier calls every
5xx a failure, so the documented "no key set" 503 wrote an `ERROR` line every
time somebody opened the panel. It is off by default now — the routes log what
is worth acting on, the way the TypeScript service's `console.error` lines do —
and `RUST_LOG=tower_http=debug` brings request tracing back.

---

### Slice 2 — The domain crate

The one step with no production surface, so it is worth being strict about what
"done" means: not that it compiles, but that it agrees with the TypeScript it is
replacing.

Every type and sanitiser under `domain/`. `shared/soil-parameters.json`
extracted and read by both sides. The parity fixtures under `shared/fixtures/`.
The scrypt compatibility test — needed only in slice 4, but cheap to write now
and expensive to discover late.

**Acceptance:**
- A real `data/fieldmanager.json` parsed and re-serialised by Rust produces JSON
  **identical field for field** to what TypeScript produces — including the
  omission of empty optionals and **array order**.
- Rust verifies a scrypt hash produced by TypeScript, and vice versa.
- Every fixture passes on both sides.

**Blast radius:** none; nothing imports it yet.

---

### Slice 3 — `/api/ai`: the read-only half of the backend

The largest move in the plan, and it still writes nothing.

`requireAccount` → `accountForToken` → `readSnapshot` is purely a read, and
unlike `/api/auth/session` it never calls `ensureReady`, so it never seeds and
never takes the write queue. `buildSystemPrompt` reads the field document and
nothing else. So Rust can serve this endpoint **while the TypeScript backend
still owns both JSON files**: Rust reads them, Node writes them, and the
temp-file-and-rename `data-store.ts` already does means a reader never sees a
half-written file. The mtime+size cache invalidation ports across unchanged and
covers the case where the other process has just written.

What this slice brings in: the JSON reader over both files, read-only session
verification (SHA-256 token hashing — no scrypt yet), `ai-context` in full (the
decare calculation, the measurement bands, the carried-out/planned split), the
three HTTP vendor adapters, and the `AiProviderError` → status mapping.

That is `ai-context.ts` and `ai-providers.ts` — 470 lines, the two densest
server modules — moved with no write path anywhere near them.

**Acceptance:** for the same document and topic, the system prompt is identical
character for character to the one the TypeScript version produces (a golden
file test, possible only while both exist). The assistant answers from all four
entry points.
**Blast radius:** the assistant dialog. Rollback is one line in `rewrites`.

---

### Slice 4 — Storage and the writers: the one atomic step

By now the deployment, the rate limiter, the domain crate, the JSON reader and
session verification are all proven in production. What is left is the part that
cannot be split: `/api/data`, `/api/accounts*` and `/api/auth/*` share one store,
and the TypeScript backend on JSON cannot coexist with the Rust one on SQLite.

Internally it still stages:

**4a — Schema and import.** The migrations, the repository layer, the
`BEGIN IMMEDIATE` revision transaction, and `tools/import-json` with a
`--dry-run` mode and a `--export` reverse direction. The `importLegacyTeam`
logic moves into that tool and is never looked for again at runtime.

**The tool must seed the administrator before it imports anybody.** Today
`ensureReady` runs `ensureSeeded` first and `importLegacyTeam` second, and
seeding decides it has nothing to do by asking whether there are *any* accounts.
Split those across a tool and the runtime and the order inverts: the tool writes
five imported team members, none with a password, the service starts, sees a
non-empty account list and skips seeding — and the installation has **no
administrator and no way to make one** short of editing the database by hand.
So the import tool performs the same seeding step first, in the same order.

File permissions: the database files and their WAL/SHM companions at `0600`, the
directory at `0700`. That is what README promises.

*Acceptance:* a real `fieldmanager.json` imported and read back yields an
identical document, arrays **in order**. Of two concurrent writes, one gets a
409.

**4b — Identity and sessions.** Account CRUD, scrypt behind `spawn_blocking`,
session issue and verification, seeding the first administrator.
`RequireAccount` / `RequireEditor` / `RequireAdmin` as Axum extractors, setting
and clearing the cookie, deriving `Secure` from the scheme. Every invariant in
section 8 gets a test here.

**4c — The routes.** `/api/auth/*`, `/api/accounts`, `/api/accounts/{id}`,
`/api/data`. The body size check, and `DefaultBodyLimit` raised to 8 MB on the
data route. Section 3's table is the reference; each endpoint gets a
request/response test against the TypeScript version.

**4d — Cutover.** Run the import against a copy first and diff the result. Then,
in one commit: the remaining `rewrites`, `src/app/api/` deleted,
`src/lib/server/` deleted, the server-side sanitisers removed from the
isomorphic files, `@anthropic-ai/sdk` removed (`bun remove`), README and
AGENTS.md updated — setup, two services, two systemd units, and backups being
`sqlite3 .backup` rather than `cp`.

**The version stays in one place.** `next.config.ts` inlines `package.json`'s
version into `NEXT_PUBLIC_APP_VERSION` for the about dialog, and the two most
recent commits on this branch exist precisely to keep that number from being
written twice. A second service with its own `Cargo.toml` version is a second
place for it to drift, so the build reads the version from `package.json` (a
build script, or a generated `version.rs`) rather than declaring its own.

**Rollback:** copy the JSON files before the cutover; removing `rewrites` and
restoring `src/app/api/` from the previous commit puts the old system back, and
`--export` brings anything written to SQLite in the meantime back to JSON.
**Blast radius:** everything — which is why it is last, and why it is the only
step that needs a maintenance window.

---

### Slice 5 — Hardening

Periodic cleanup of expired sessions (today they are only filtered out while the
file is read; a background task is cleaner with SQLite). CI: `cargo test`,
`cargo clippy -- -D warnings`, `cargo fmt --check`, `bun run lint`. Backup
documentation based on `sqlite3 .backup`.

---

## 7. Deployment

Two services, two systemd units. Rust listens on loopback only; the single port
exposed outward is Next's.

```ini
# /etc/systemd/system/fieldmanager-api.service
[Unit]
Description=Field Manager API (Rust/Axum)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=USER
ExecStart=/opt/fieldmanager/bin/fieldmanager-api
Restart=on-failure
RestartSec=5
Environment=FIELDMANAGER_BIND=127.0.0.1:8080
Environment=FIELDMANAGER_DATA_DIR=/var/lib/fieldmanager
EnvironmentFile=/etc/fieldmanager/api.env    # the secrets; 0600
# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/fieldmanager

[Install]
WantedBy=multi-user.target
```

The Next unit stays as it is today, tied to `fieldmanager-api.service` with
`After=` and `Wants=`.

### Environment variables

| Variable | Where it moves |
| --- | --- |
| `OPENWEATHER_API_KEY` | Rust |
| `FIELDMANAGER_AI_PROVIDER` / `_API_KEY` / `_MODEL` | Rust |
| `FIELDMANAGER_DATA_DIR` | Rust |
| `FIELDMANAGER_ADMIN_PASSWORD` | Rust |
| `PORT` | Stays with Next |
| `FIELDMANAGER_BIND` | **new** — the address Rust listens on |

After the cutover Next needs no secret at all; the keys in `.env.local` move to
the API service's `EnvironmentFile`. That sharpens today's "the key is read
from the server environment only" rule: the keys are no longer even in the
frontend process's environment.

**CSP:** the security headers in `next.config.ts` stay with Next and do not
change — `connect-src 'self'` is still right, because the browser still sees a
single origin.

---

## 8. Invariants to preserve

Each of these is written down in AGENTS.md with its reasoning, and each is easy
to lose in this migration. Every one needs a test in step 4b or 4c.

**Access**
1. `/api/data` answers a request with no session with `401`, and a `viewer`
   role's `PUT` with `403`.
2. `GET /api/accounts` is *not* admin-only — any session may read it; what
   differs is `toPublicAccount(account, full)`.
3. A person may edit their own profile (name, email, phone); role, field
   assignment, username and password are administrator-only — the rule lives in
   **the route**, not the form.
4. An administrator cannot change their own role, reset their own password from
   here, or delete themselves.
5. The store refuses to demote or delete the last administrator.

**Sessions and passwords**
6. The cookie carries a random token and nothing else; the session is stored
   server-side as a SHA-256 hash, so the file alone cannot be replayed.
7. A failed sign-in gives one message — it never confirms that a username
   exists. An unknown username still costs a hash (timing).
8. Taking a username away clears the hash and ends that account's sessions.
9. Resetting a password ends that account's other sessions; the browser
   changing its own password **stays signed in**.
10. An account whose `passwordHash` is empty has no valid session.
11. `mustChangePassword` is a prompt, **not** a forced redirect.

**Data**
12. Everything reaching the store goes through `sanitizeData`.
13. A `revision` conflict returns `409` plus the current document.
14. No response ever carries `passwordHash` — the only way out is
    `toPublicAccount`.
15. There is **no** export/import endpoint and no file download or upload path.
16. An account has **no** presence or availability field, and none is derived
    from `lastLoginAt`.

**Secrets and the assistant**
17. The key, the provider and the model come from the server environment only,
    and are **never** accepted from a request body (weather and AI alike).
18. The request carries a `fieldId`, not field data — the server builds the
    context.
19. The topic narrows the context; measurements are rendered with the band they
    fall in.
20. Crop protection records go in as two lists: carried out, and planned.
21. The `thinking` parameter is not sent.
22. The vendor's error body is logged, not returned — it can quote the request,
    and the request holds the farm's records.

---

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| scrypt parameters do not match | Every password stops working | Cross-verify against a real hash in slice 2; if it cannot be made to match, add a version prefix to the hash format and migrate gradually |
| ~~`x-forwarded-for` lost behind the rewrite~~ **confirmed** | On a no-proxy install every caller shares one rate-limit bucket | Measured in slice 0: Next adds only `x-forwarded-host`. Accepted as-is for LAN/dev (no regression); a front proxy routing `/api/*` straight to Rust is the answer for anything exposed — see slice 0's measurement |
| The two sanitiser copies drift | What the server accepts and what the screen shows diverge | Rust is the authority; the TS copies are deleted; shared fixture tests |
| `SOIL_PARAMETERS` copied into two places | The AI answer and the screen disagree about "low" | One shared JSON file, read by both sides |
| Silent drift in JSON field names | The frontend quietly sees empty fields | `rename_all = "camelCase"` + `ts-rs`-generated types + golden file tests |
| The weather cache forgotten | The OpenWeather quota drains fast | A slice 1 acceptance criterion |
| The cutover cannot be undone | Risk of data loss in production | A JSON copy before the cutover, the `--export` direction, and a single-commit rollback |
| Start-up order of the two services | 502s on the first requests | systemd `After=`/`Wants=` plus a health check on the rewrite target |
| Slice order lost in the round trip | The activity log stops being newest-first, fields reorder | Explicit `position` column, `ORDER BY position`, order-sensitive round-trip test in step 4a |
| Seeding skipped after the legacy import | An installation with no administrator | The import tool seeds first, mirroring today's order |
| scrypt called on a Tokio worker | Sign-in attempts stall the whole runtime | `spawn_blocking` around every hash and verify |
| Axum's 2 MB default body limit | `PUT /api/data` returns 413 on a real farm | Raise `DefaultBodyLimit` to 8 MB on that route; slice 0 confirmed the proxy carries an 8 MB body with `content-length` intact |

---

## 10. Out of scope

Work deliberately **not** in this plan, left for later:

- Partial or per-resource endpoints (a `POST /api/fields`). The client's
  "PUT the whole document" model is preserved as is.
- Live synchronisation over WebSocket or SSE. Today's 409-and-adopt flow stays.
- Moving the frontend to Rust. Next.js, React and Leaflet stay exactly as they
  are.
- Changing the authentication model (OIDC, TOTP and so on).
- Making `mustChangePassword` mandatory — AGENTS.md rules that out explicitly.

---

## 11. Sequence at a glance

```
Slice 0  Skeleton in production: /api/health, systemd, one rewrite line
         └─ answers the header / cookie / body questions by measurement
Slice 1  /api/weather          ← the first Rust the application actually uses
         └─ config, rate limiter, reqwest, the 10-minute cache
Slice 2  domain crate + parity fixtures + scrypt compatibility
         └─ the only step with no production surface
Slice 3  /api/ai               ← read-only: reads the JSON files Node still owns
         └─ ai-context, three vendor adapters, token verification
Slice 4  SQLite + /api/data + /api/accounts + /api/auth   (ATOMIC)
         └─ 4a schema & import · 4b identity · 4c routes · 4d cutover
Slice 5  Hardening, session cleanup, CI
```

Slices 0 → 1 → 2 → 3 each land in production on their own, and each rolls back
by deleting a line from `rewrites`. Slice 4 is the only one that needs a
maintenance window, and by the time it arrives the deployment, the rate limiter,
the domain crate, the reader and session verification have all been running in
production for a while.

Slice 2 can proceed in parallel with slice 1; it blocks slice 3. Nothing else
can be reordered.
