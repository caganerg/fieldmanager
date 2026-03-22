#!/bin/bash

# ==========================================
# Field Manager - Next.js Auto Setup Script
# Debian / Ubuntu Systems
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
$SUDO apt-get update -y
$SUDO apt-get install -y curl git ufw

if ! command -v node > /dev/null; then
  echo -e "${YELLOW}>> Node.js not found. Installing Node.js 20.x...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
else
  echo -e "${GREEN}>> Node.js is already installed: $(node -v)${NC}"
fi

if ! command -v npm > /dev/null; then
  echo -e "${YELLOW}>> npm not found. Installing npm...${NC}"
  $SUDO apt-get install -y npm
else
  echo -e "${GREEN}>> npm is already installed: $(npm -v)${NC}"
fi

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
read -p "Sunucuya kurmak istiyorsanız hava durumu API anahtarınızı girin (yoksa boş bırakın): " WEATHER_API_KEY
if [ -n "$WEATHER_API_KEY" ]; then
  echo "OPENWEATHER_API_KEY=$WEATHER_API_KEY" > .env.local
  echo -e "${GREEN}>> API Key saved to .env.local${NC}"
fi

# 3. NPM Install and Build
echo -e "\n${GREEN}[3/4] Installing NPM dependencies and building the application...${NC}"
npm install
npm run build

# 4. Process Management (Systemd)
echo -e "\n${GREEN}[4/4] Setting up Systemd for background process management...${NC}"

# Stop and disable if exists
$SUDO systemctl stop fieldmanager 2>/dev/null || true
$SUDO systemctl disable fieldmanager 2>/dev/null || true

# Find npm path
NPM_PATH=$(command -v npm)

SERVICE_FILE="/etc/systemd/system/fieldmanager.service"
echo -e "${GREEN}>> Creating systemd service at $SERVICE_FILE...${NC}"

$SUDO bash -c "cat > $SERVICE_FILE" <<EOF
[Unit]
Description=Field Manager Next.js App
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$NPM_PATH run start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable fieldmanager
$SUDO systemctl start fieldmanager

echo -e "\n${BLUE}==========================================${NC}"
echo -e "${GREEN}  Installation Complete! 🚀 ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Your Next.js app 'Field Manager' is now running in the background via systemd.${NC}"
echo -e "You can check the status with: ${YELLOW}sudo systemctl status fieldmanager${NC}"
echo -e "You can view logs with:        ${YELLOW}sudo journalctl -ur fieldmanager${NC}"
echo -e "The app is running on port:    ${YELLOW}3000${NC} (default)"
echo -e "\n${YELLOW}Note: If you have a firewall enabled, don't forget to allow the port:${NC}"
echo -e "sudo ufw allow 3000/tcp\n"
