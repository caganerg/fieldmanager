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

[Install]
WantedBy=multi-user.target
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
