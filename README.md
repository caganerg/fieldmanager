# Field Manager
**Version: 0.3.0**
Field Manager is a modern web application for managing fields, crops, and agricultural lands.

## 📦 Requirements

[Bun](https://bun.sh) v1.2 or newer. Node.js and npm are **not** required — Bun
is the package manager, script runner and runtime for this project.

```bash
curl -fsSL https://bun.sh/install | bash
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
browser, and the app has no in-app field for it:

```bash
cp .env.example .env.local
chmod 600 .env.local        # the file holds a secret
$EDITOR .env.local
```

Start the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Other commands:

```bash
bun run build   # production build
bun run start   # serve the production build
bun run lint    # eslint
```

## 💾 Where Your Data Lives

Fields, groups, soil analyses, irrigation and fertilization records and the
activity log are stored **on the server you install the app on**, in a single
JSON file, and are only served to a browser that has signed in. The people are
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
