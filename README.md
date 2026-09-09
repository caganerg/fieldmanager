# Field Manager
**Version: 0.3.0**
Field Manager is a modern web application for managing fields, crops, and agricultural lands.

## 📦 Requirements

[Bun](https://bun.sh) v1.2 or newer. Node.js and npm are **not** required — Bun
is the package manager, script runner and runtime for this project.

```bash
curl -fsSL https://bun.sh/install | bash
```

A Rust toolchain, for the API service that part of the backend has moved to:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## 🛠️ Development Setup

```bash
git clone https://github.com/caganerg/fieldmanager.git
cd fieldmanager
bun install
```

Create `.env.local` with your OpenWeather API key (get a free one at
[openweathermap.org](https://openweathermap.org/api)). This is the only place
the key is configured — it is read on the server and never exposed to the
browser, and the app has no in-app field for it. Weather is served by the API
service described below, which reads the same file:

```bash
cp .env.example .env.local
chmod 600 .env.local        # the file holds a secret
$EDITOR .env.local
```

The assistant — the "Ask AI" tool and the buttons in the fertilization, soil and
crop protection modules — is configured in the same file and is optional. Set
`FIELDMANAGER_AI_PROVIDER` (`anthropic`, `openai` or `gemini`),
`FIELDMANAGER_AI_API_KEY` and `FIELDMANAGER_AI_MODEL` to switch it on; leave
them unset and the app says the assistant is not set up on this server. Like the
weather key, all three are read on the server and there is no in-app field for
them.

### The API service

Part of the backend is being rewritten in Rust and runs as a second process
(see `RUST-BACKEND-PLAN.md` for what has moved and what has not). It needs a
Rust toolchain — [rustup](https://rustup.rs) — and it is built with Cargo:

```bash
cd backend
cargo build --release
```

It listens on `127.0.0.1:8080` by default; `FIELDMANAGER_BIND` changes that.
Next.js reaches it through the `rewrites` in `next.config.ts`, so the browser
still talks to a single origin and the port you open is Next's, not this one.
`FIELDMANAGER_API_ORIGIN` points Next somewhere else if you move it.

It serves `/api/health` and the weather proxy; every other route is still
handled by Next. Start it from the project directory — it reads `.env.local`
from there for the OpenWeather key, the same file Next reads — before the dev
server:

```bash
./backend/target/release/fieldmanager-api
```

Anything already set in the real environment wins over `.env.local`, which is
what lets a systemd unit hold the key in production.

### Both together

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser, and
`http://localhost:3000/api/health` should answer `{"status":"ok",...}` — that
is the request going through Next to the Rust service and back.

Other commands:

```bash
bun run build   # production build
bun run start   # serve the production build
bun run lint    # eslint
```

## 💾 Where Your Data Lives

Fields, groups, soil analyses, irrigation, fertilization and crop protection
records and the activity log are stored **on the server you install the app on**,
in a single JSON file, and are only served to a browser that has signed in. The people are
kept beside it in a second file — see [Accounts and Signing In](#-accounts-and-signing-in). The app writes it as you work — there is nothing to save,
export or import by hand.

By default the file is `./data/fieldmanager.json`, created on first save. Set
`FIELDMANAGER_DATA_DIR` in `.env.local` to keep it somewhere else:

```bash
FIELDMANAGER_DATA_DIR=/var/lib/fieldmanager
```

Point it outside the project directory if you deploy by replacing the checkout,
so the data is not wiped along with the old build:

```bash
sudo mkdir -p /var/lib/fieldmanager
sudo chown "$USER" /var/lib/fieldmanager
```

The directory must be writable by the user the app runs as (the `User=` in the
systemd unit below). The file is written with `0600` permissions, and each save
goes to a temporary file that is renamed over the target, so an interrupted
write cannot leave a half-written file behind.

The people — their profile, role, field assignment and sign-in — are kept beside
it in `fieldmanager-auth.json`, written the same way. Passwords are `scrypt`
hashes rather than the passwords themselves, but the file is still the keys to
the installation: it is created `0600` and there is no reason for anything but
the app to read it.

**Backups** are a file copy — put this in a cron job or a systemd timer:

```bash
cp /var/lib/fieldmanager/fieldmanager.json ~/backups/fieldmanager-$(date +%F).json
cp /var/lib/fieldmanager/fieldmanager-auth.json ~/backups/fieldmanager-auth-$(date +%F).json
```

Restoring is the same copy in reverse, with the app stopped.

Theme, the tools pinned to the header, the welcome dialog and which team member
the session is acting as stay in the browser, since they describe that browser
rather than the workspace.

## 🔑 Accounts and Signing In

Everything the server stores is behind a login. A browser that has not signed in
is a **guest**: it sees a sign-in screen and nothing else, and the API answers it
with `401` — no field, no group and no record ever leaves the server for it.

### The first sign-in

A fresh installation creates one administrator the first time the app is opened:

| Username | Password |
| --- | --- |
| `admin` | `admin` |

**Change it immediately.** The app knows this password was not chosen by anybody
and asks for a new one every time that account signs in, until it is replaced —
the prompt can be dismissed, so it is on you to actually do it.

To avoid the default existing at all, set a password before the first start.
It is used only when the account file is created, and an account made this way is
not nagged:

```bash
FIELDMANAGER_ADMIN_PASSWORD='choose-something-long' bun run start
```

Once accounts exist the variable is ignored, so it is safe to leave in a systemd
unit — it will not reset a password you have changed. (To recover a lost
administrator password, stop the app, delete `fieldmanager-auth.json` from the
data directory and start it again: the seeding runs once more. That file holds
only accounts and sessions, so the fields and records are untouched.)

### The people on the farm

There is **one list of people**, in two views: the team panel behind the avatar
in the header, and the full **Users** page at `/users`. Each person is a single
record — name, contact details, role, the fields they are responsible for, and
the sign-in they use.

Signing in is optional. Somebody who should appear in the team but has no reason
to open the app is added without a username, and an administrator can hand them
a login later from the same form; clearing the username takes it away again.

| Role | Can do |
| --- | --- |
| System Administrator | Everything, and is the only role that can add people or change roles, field access and sign-ins |
| Agronomist | Read and edit the whole workspace |
| Field & Equipment Operator | Read and edit the whole workspace |
| Field Observer | Read only — the server rejects its writes |

Everyone signed in can see the team and keep their own profile up to date —
name, contact details, whether they are out in a field today. Roles, field
assignments and sign-in details are an administrator's to change.

A password you set for somebody else is temporary by design: they are asked to
replace it after signing in, and resetting a password signs out every browser
they left open.

If a workspace was created before the app had accounts, the team list it kept in
the field data is moved into the people file the first time the new version
starts, and those entries arrive without a sign-in.

### What this is and is not

Sessions are a random token in an `httpOnly`, `SameSite=Lax` cookie, valid for 30
days; passwords are stored as `scrypt` hashes with a per-password salt, and
sign-in attempts are rate-limited per address. That is enough to keep a farm's
data away from whoever else is on the network — it is not a reason to publish
the port to the internet.

Serve it over https if it leaves the machine: without TLS, a password crosses the
network in the clear no matter how it is stored. The session cookie is marked
`Secure` automatically when the request arrives over https (directly or through a
proxy that sets `X-Forwarded-Proto`).

**A note on the rate limits.** Sign-in attempts, writes and assistant questions
are throttled per client address, read from `X-Forwarded-For` or `X-Real-IP`.
Nothing on this machine sets those headers: Next.js forwards them to the API
service if they arrive, but does not add them. So on a plain install with no
proxy in front, every caller counts as one — the throttles still work, but they
apply to the installation as a whole rather than per client, and a caller that
sends the header itself chooses its own bucket. That is a trusted-network
posture, not a defence; if the app is reached over https or from outside the
machine, put a reverse proxy in front, have it set `X-Forwarded-For` and
`X-Forwarded-Proto`, and point `/api/*` at the API service directly.

Binding to the loopback interface and reaching it over an SSH tunnel or a VPN
remains the simplest safe setup. Pass the host to `next start`; it listens on
every interface otherwise, and the `HOSTNAME` environment variable is ignored:

```bash
bun run start -H 127.0.0.1
```

## 🚀 Running in Production

Build the app and serve it:

```bash
bun install --frozen-lockfile   # install exactly what bun.lock pins
bun run build
bun run start                   # listens on $PORT, default 3000
```

To keep it running in the background across reboots, create a systemd service.
Replace `USER` with your username and `/path/to/fieldmanager` with the project
directory, and check `which bun` for the Bun path:

```ini
# /etc/systemd/system/fieldmanager.service
[Unit]
Description=Field Manager (Next.js, served by Bun)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=USER
WorkingDirectory=/path/to/fieldmanager
ExecStart=/home/USER/.bun/bin/bun run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=FIELDMANAGER_DATA_DIR=/var/lib/fieldmanager

[Install]
WantedBy=multi-user.target
```

Create the data directory first and give it to the same user, or the app will
have nowhere to write:

```bash
sudo mkdir -p /var/lib/fieldmanager
sudo chown USER /var/lib/fieldmanager
sudo chmod 700 /var/lib/fieldmanager
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fieldmanager
sudo systemctl status fieldmanager       # check it came up
sudo journalctl -u fieldmanager -f       # follow the logs
```

If a firewall is enabled, allow the port:

```bash
sudo ufw allow 3000/tcp
```

### The API service under systemd

The Rust service gets its own unit. It listens on loopback and is reached only
through Next's rewrites, so it needs no firewall rule of its own — the port you
opened above is still the only one exposed.

```ini
# /etc/systemd/system/fieldmanager-api.service
[Unit]
Description=Field Manager API (Rust/Axum)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=USER
ExecStart=/path/to/fieldmanager/backend/target/release/fieldmanager-api
Restart=on-failure
RestartSec=5
Environment=FIELDMANAGER_BIND=127.0.0.1:8080
Environment=FIELDMANAGER_DATA_DIR=/var/lib/fieldmanager
# The OpenWeather key lives here now, not in .env.local: weather is served by
# this service. Keep the file 0600 and owned by root.
EnvironmentFile=/etc/fieldmanager/api.env
# Hardening: the service needs its data directory and nothing else.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/fieldmanager

[Install]
WantedBy=multi-user.target
```

Then tie the web unit to it, so Next never starts before the API it proxies to.
In `fieldmanager.service`, add to the `[Unit]` section:

```ini
After=network-online.target fieldmanager-api.service
Wants=network-online.target fieldmanager-api.service
```

```bash
sudo install -d -m 700 /etc/fieldmanager
sudo tee /etc/fieldmanager/api.env >/dev/null <<'ENV'
OPENWEATHER_API_KEY=your_openweather_api_key_here
ENV
sudo chmod 600 /etc/fieldmanager/api.env

sudo systemctl daemon-reload
sudo systemctl enable --now fieldmanager-api
sudo systemctl restart fieldmanager
curl -s localhost:3000/api/health      # {"status":"ok","version":"..."}
```

`ProtectSystem=strict` above makes the whole filesystem read-only for this
service apart from `ReadWritePaths`, so it can read that file but nothing can
be written outside the data directory.

## Development Philosophy
This project is a product of **Vibe Coding**.

## License

This project is licensed under the **MIT License**.

You are free to:
* **Use** — Use the code for private, commercial, or institutional purposes.
* **Modify** — Make changes, adapt, and build upon the software.
* **Distribute** — Copy, share, and redistribute the original or modified version.
* **Sublicense** — Include the code in proprietary or closed-source applications.

Under the following condition:
* **Attribution** — You must include the original copyright notice and license text in all copies or substantial portions of the Software.

For more details, please see the [LICENSE](LICENSE) file included in this repository.
