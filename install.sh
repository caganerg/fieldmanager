#!/bin/bash

# ==========================================
# Field Manager - Next.js Auto Setup Script
# Linux Systems (Bun + systemd)
#
# This project uses Bun as its package manager and runtime.
# Node.js and npm are NOT required and are never installed by this script.
# ==========================================

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Starting Field Manager Installation...  ${NC}"
echo -e "${BLUE}==========================================${NC}"

# This script is documented as `curl -sSL ... | bash`, which means the script
# itself arrives on stdin. Prompts must therefore read from the terminal
# directly, or `read` would swallow the rest of the script.
if [ -r /dev/tty ]; then
  INTERACTIVE=1
else
  INTERACTIVE=0
  echo -e "${YELLOW}[!] No terminal available; running non-interactively and skipping prompts.${NC}"
fi

ask() { # ask <variable-name> <prompt>
  local __var="$1" __prompt="$2" __answer=""
  if [ "$INTERACTIVE" = "1" ]; then
    read -r -p "$__prompt" __answer < /dev/tty || __answer=""
  fi
  printf -v "$__var" '%s' "$__answer"
}

if [ "$EUID" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

# Can we actually gain root? Needed for system packages and the system service.
HAVE_ROOT=0
if [ -z "$SUDO" ]; then
  HAVE_ROOT=1
elif command -v sudo > /dev/null; then
  # With a terminal, let sudo prompt for a password; without one, never block.
  if [ "$INTERACTIVE" = "1" ]; then
    sudo -v < /dev/tty && HAVE_ROOT=1 || true
  else
    sudo -n -v 2>/dev/null && HAVE_ROOT=1 || true
  fi
fi
if [ "$HAVE_ROOT" != "1" ]; then
  echo -e "${YELLOW}[!] No root privileges; skipping system package installation.${NC}"
fi

# 1. Check & Install Dependencies
echo -e "\n${GREEN}[1/4] Checking system dependencies...${NC}"
# `unzip` is required by the Bun installer to unpack its release archive.
if [ "$HAVE_ROOT" = "1" ]; then
  if command -v apt-get > /dev/null; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y curl git unzip
  elif command -v pacman > /dev/null; then
    $SUDO pacman -Sy --needed --noconfirm curl git unzip
  elif command -v dnf > /dev/null; then
    $SUDO dnf install -y curl git unzip
  fi
fi

if ! command -v bun > /dev/null; then
  echo -e "${YELLOW}>> Bun not found. Installing Bun...${NC}"
  if ! command -v unzip > /dev/null; then
    echo -e "${RED}>> 'unzip' is missing and could not be installed. Install it and re-run.${NC}"
    exit 1
  fi
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun > /dev/null; then
    echo -e "${RED}>> Bun installation failed.${NC}"
    exit 1
  fi
  # Make bun available in future fish sessions too; the Bun installer only
  # writes to bash/zsh startup files.
  if command -v fish > /dev/null; then
    mkdir -p "$HOME/.config/fish/conf.d"
    if [ ! -f "$HOME/.config/fish/conf.d/bun.fish" ]; then
      printf 'set -gx BUN_INSTALL "$HOME/.bun"\nfish_add_path -g $BUN_INSTALL/bin\n' \
        > "$HOME/.config/fish/conf.d/bun.fish"
    fi
  fi
fi
echo -e "${GREEN}>> Bun is ready: $(bun --version)${NC}"
BUN_BIN=$(command -v bun)

# 2. Project Setup
echo -e "\n${GREEN}[2/4] Setting up the project...${NC}"
if [ -f "package.json" ]; then
  echo -e "${GREEN}>> Existing Next.js project found in current directory.${NC}"
  PROJECT_DIR=$(pwd)
else
  echo -e "${YELLOW}>> Project not found in current directory.${NC}"
  ask REPO_URL "Enter GitHub repo URL to clone (or press Enter to abort): "
  if [ -n "$REPO_URL" ]; then
    git clone "$REPO_URL" fieldmanager
    cd fieldmanager
    PROJECT_DIR=$(pwd)
  else
    echo -e "${RED}>> Installation aborted.${NC}"
    exit 1
  fi
fi

# Ask for API Key
echo -e "\n${GREEN}>> OpenWeather API Key Setup${NC}"
if grep -qs '^OPENWEATHER_API_KEY=' .env.local; then
  echo -e "${GREEN}>> An OpenWeather API key is already configured in .env.local; keeping it.${NC}"
else
  ask WEATHER_API_KEY "Enter your OpenWeather API key (press Enter to skip): "
  if [ -n "$WEATHER_API_KEY" ]; then
    # Sanitize API key (alphanumeric, underscores and dashes only)
    CLEAN_API_KEY=$(echo "$WEATHER_API_KEY" | tr -cd 'a-zA-Z0-9_-')
    if [ -n "$CLEAN_API_KEY" ]; then
      touch .env.local
      chmod 600 .env.local 2>/dev/null || true
      echo "OPENWEATHER_API_KEY=$CLEAN_API_KEY" >> .env.local
      echo -e "${GREEN}>> API Key safely saved to .env.local with restricted permissions (600).${NC}"
    fi
  fi
fi

# 3. Install dependencies and build
echo -e "\n${GREEN}[3/4] Installing dependencies with Bun and building the application...${NC}"
# --frozen-lockfile keeps the deployed tree identical to the committed bun.lock.
bun install --frozen-lockfile || bun install
bun run build

# 4. Process Management (systemd)
echo -e "\n${GREEN}[4/4] Setting up a systemd service for background process management...${NC}"

APP_PORT="${PORT:-3000}"
RUN_USER=$(id -un)
SERVICE_MODE="none"

write_unit() { # write_unit <path> <extra-lines>
  cat <<EOF
[Unit]
Description=Field Manager (Next.js, served by Bun)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$BUN_BIN run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$APP_PORT
$1

[Install]
WantedBy=$2
EOF
}

if command -v systemctl > /dev/null && [ "$HAVE_ROOT" = "1" ]; then
  # A system service starts on boot without needing an active login session.
  write_unit "User=$RUN_USER" "multi-user.target" | $SUDO tee /etc/systemd/system/fieldmanager.service > /dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now fieldmanager.service
  SERVICE_MODE="system"
elif command -v systemctl > /dev/null && systemctl --user show-environment > /dev/null 2>&1; then
  # No root: fall back to a user service. Lingering is what keeps it alive
  # after logout, so enable it before starting the unit.
  loginctl enable-linger "$RUN_USER" 2>/dev/null || true
  mkdir -p "$HOME/.config/systemd/user"
  write_unit "" "default.target" > "$HOME/.config/systemd/user/fieldmanager.service"
  systemctl --user daemon-reload
  systemctl --user enable --now fieldmanager.service
  SERVICE_MODE="user"
else
  echo -e "${YELLOW}>> systemd is unavailable. Starting the app with nohup instead.${NC}"
  PORT="$APP_PORT" nohup bun run start > "$PROJECT_DIR/fieldmanager.log" 2>&1 &
  echo -e "${GREEN}>> App started. Logs: $PROJECT_DIR/fieldmanager.log${NC}"
  SERVICE_MODE="nohup"
fi

echo -e "\n${BLUE}==========================================${NC}"
echo -e "${GREEN}  Installation Complete! 🚀 ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Your Next.js app 'Field Manager' is now running in the background.${NC}"
case "$SERVICE_MODE" in
  system)
    echo -e "Check the status with: ${YELLOW}sudo systemctl status fieldmanager${NC}"
    echo -e "View logs with:        ${YELLOW}sudo journalctl -u fieldmanager -f${NC}"
    echo -e "Restart with:          ${YELLOW}sudo systemctl restart fieldmanager${NC}"
    ;;
  user)
    echo -e "Check the status with: ${YELLOW}systemctl --user status fieldmanager${NC}"
    echo -e "View logs with:        ${YELLOW}journalctl --user -u fieldmanager -f${NC}"
    echo -e "Restart with:          ${YELLOW}systemctl --user restart fieldmanager${NC}"
    ;;
esac
echo -e "The app is running on port:    ${YELLOW}$APP_PORT${NC}"
echo -e "\n${YELLOW}Note: If you have a firewall enabled, don't forget to allow the port:${NC}"
echo -e "sudo ufw allow $APP_PORT/tcp\n"
