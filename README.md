# Field Manager
**Version: 0.2.1**
Field Manager is a modern web application for managing fields, crops, and agricultural lands.

## 🚀 Quick Installation

You can easily install and run Field Manager as a background service managed via systemd. The installation script will automatically check/install dependencies (including Bun), configure the environment, and set up a systemd background service.

```bash
curl -sSL https://raw.githubusercontent.com/caganerg/fieldmanager/main/install.sh | bash
```

**Note:** The script will ask for your OpenWeather API key during installation if you want to set it up.

## 🛠️ Manual Development Setup

If you want to run the project locally for development:

> **Requirements:** [Bun](https://bun.sh) v1.2 or newer. Node.js and npm are not
> required. If you don't have Bun yet:
> ```bash
> curl -fsSL https://bun.sh/install | bash
> ```

1. Install dependencies:
```bash
bun install
```

2. Run the development server:
```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Other useful commands:

```bash
bun run build   # production build
bun run start   # serve the production build
bun run lint    # eslint
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
