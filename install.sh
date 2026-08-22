#!/bin/bash

# ==========================================
# Field Manager - Next.js Auto Setup Script
# Linux Systems (Bun + systemd)
# ==========================================

set -e # Exit immediately if a command exits with a non-zero status

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Starting Field Manager Installation...  ${NC}"
echo -e "${BLUE}==========================================${NC}"

# Check if script is run as root for dependencies
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}[!] This script may require sudo privileges to install system packages.${NC}"
  SUDO="sudo"
else
  SUDO=""
fi

# 1. Check & Install Dependencies
echo -e "\n${GREEN}[1/4] Checking system dependencies...${NC}"
if command -v apt-get > /dev/null; then
  $SUDO apt-get update -y
  $SUDO apt-get install -y curl git unzip
elif command -v pacman > /dev/null; then
  $SUDO pacman -Sy --needed --noconfirm curl git unzip
elif command -v dnf > /dev/null; then
  $SUDO dnf install -y curl git unzip
fi

# This project uses Bun as its package manager and runtime. Node.js and npm
# are NOT required and are intentionally not installed.
if ! command -v bun > /dev/null; then
  echo -e "${YELLOW}>> Bun not found. Installing Bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
else
  echo -e "${GREEN}>> Bun is already installed: $(bun --version)${NC}"
fi

BUN_BIN=$(command -v bun)

# 2. Project Setup
echo -e "\n${GREEN}[2/4] Setting up the project...${NC}"
if [ -f "package.json" ]; then
  echo -e "${GREEN}>> Existing Next.js project found in current directory.${NC}"
  PROJECT_DIR=$(pwd)
else
  echo -e "${YELLOW}>> Project not found in current directory.${NC}"
  read -p "Enter GitHub repo URL to clone (or press Enter to abort): " REPO_URL
  if [ -n "$REPO_URL" ]; then
    git clone $REPO_URL fieldmanager
    cd fieldmanager
    PROJECT_DIR=$(pwd)
  else
    echo -e "${RED}>> Installation aborted.${NC}"
    exit 1
  fi
fi

# Ask for API Key
echo -e "\n${GREEN}>> OpenWeather API Key Setup${NC}"
read -r -p "Enter your OpenWeather API key (press Enter to skip): " WEATHER_API_KEY
if [ -n "$WEATHER_API_KEY" ]; then
  # Sanitize API key (alphanumeric and dashes only)
  CLEAN_API_KEY=$(echo "$WEATHER_API_KEY" | tr -cd 'a-zA-Z0-9_-')
  if [ -n "$CLEAN_API_KEY" ]; then
    echo "OPENWEATHER_API_KEY=$CLEAN_API_KEY" >> .env.local
    chmod 600 .env.local 2>/dev/null || true
    echo -e "${GREEN}>> API Key safely saved to .env.local with restricted permissions (600).${NC}"
  fi
fi

# 3. Install dependencies and build
echo -e "\n${GREEN}[3/4] Installing dependencies with Bun and building the application...${NC}"
bun install
bun run build

# 4. Process Management (systemd user service)
echo -e "\n${GREEN}[4/4] Setting up a systemd service for background process management...${NC}"

if command -v systemctl > /dev/null; then
  SERVICE_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SERVICE_DIR"
  cat > "$SERVICE_DIR/fieldmanager.service" <<EOF
[Unit]
Description=Field Manager (Next.js, served by Bun)
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$BUN_BIN run start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now fieldmanager.service

  # Keep the service running after logout
  $SUDO loginctl enable-linger "$USER" 2>/dev/null || true

  echo -e "${GREEN}>> Service 'fieldmanager' is enabled and running.${NC}"
  MANAGED_BY_SYSTEMD=1
else
  echo -e "${YELLOW}>> systemd not found. Starting the app in the background with nohup instead.${NC}"
  nohup bun run start > "$PROJECT_DIR/fieldmanager.log" 2>&1 &
  echo -e "${GREEN}>> App started. Logs: $PROJECT_DIR/fieldmanager.log${NC}"
  MANAGED_BY_SYSTEMD=0
fi

echo -e "\n${BLUE}==========================================${NC}"
echo -e "${GREEN}  Installation Complete! 🚀 ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Your Next.js app 'Field Manager' is now running in the background.${NC}"
if [ "$MANAGED_BY_SYSTEMD" = "1" ]; then
  echo -e "Check the status with: ${YELLOW}systemctl --user status fieldmanager${NC}"
  echo -e "View logs with:        ${YELLOW}journalctl --user -u fieldmanager -f${NC}"
  echo -e "Restart with:          ${YELLOW}systemctl --user restart fieldmanager${NC}"
fi
echo -e "The app is running on port:    ${YELLOW}3000${NC} (default)"
echo -e "\n${YELLOW}Note: If you have a firewall enabled, don't forget to allow the port:${NC}"
echo -e "sudo ufw allow 3000/tcp\n"
