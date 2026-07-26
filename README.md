# Field Manager
**Version: 0.2.1**
Field Manager is a web application that can be easily deployed to Debian-based systems.

## 🚀 Quick Installation (Debian / Ubuntu)

You can easily install and run Field Manager as a background service on any Debian-based system (requires Systemd). The installation script will automatically install Node.js, configure the environment, and set up the systemd service.

```bash
curl -sSL https://raw.githubusercontent.com/caganerg/fieldmanager/main/install.sh | bash
```

**Note:** The script will ask for your OpenWeather API key during installation if you want to set it up.

## 🛠️ Manual Development Setup

If you want to run the project locally for development:

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

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
