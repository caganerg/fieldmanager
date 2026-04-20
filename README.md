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

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. 

You are free to:
* **Share** — copy and redistribute the material in any medium or format.
* **Adapt** — remix, transform, and build upon the material.

Under the following terms:
* **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
* **Network Interaction** — If you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network an opportunity to receive the Corresponding Source of your version.
* **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

For more details, please see the [LICENSE](LICENSE) file included in this repository.
