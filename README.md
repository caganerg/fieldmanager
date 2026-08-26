# Field Manager
**Version: 0.2.1**
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

Fields, groups, soil analyses, irrigation and fertilization records, the team
list and the activity log are stored **on the server you install the app on**,
in a single JSON file. The app writes it as you work — there is nothing to save,
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

**Backups** are a file copy — put this in a cron job or a systemd timer:

```bash
cp /var/lib/fieldmanager/fieldmanager.json ~/backups/fieldmanager-$(date +%F).json
```

Restoring is the same copy in reverse, with the app stopped.

Theme, the tools pinned to the header, the welcome dialog and which team member
the session is acting as stay in the browser, since they describe that browser
rather than the workspace.

### ⚠️ There is no authentication

The app ships without any login, and the API that reads and writes the data file
is open to anyone who can reach the port. Run it on a trusted network, or put an
authenticating reverse proxy in front of it. Do not expose the port straight to
the internet.

Binding to the loopback interface and reaching it over an SSH tunnel or a VPN is
the simplest safe setup. Pass the host to `next start`; it listens on every
interface otherwise, and the `HOSTNAME` environment variable is ignored:

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
