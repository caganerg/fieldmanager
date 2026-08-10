#!/bin/bash

# ==========================================
# Field Manager - Next.js Auto Setup Script
# Linux Systems (PM2 Process Manager)
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
  $SUDO apt-get install -y curl git
elif command -v pacman > /dev/null; then
  $SUDO pacman -Sy --needed --noconfirm curl git
elif command -v dnf > /dev/null; then
  $SUDO dnf install -y curl git
fi

if ! command -v node > /dev/null; then
  echo -e "${YELLOW}>> Node.js not found. Installing Node.js...${NC}"
  if command -v apt-get > /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
  elif command -v pacman > /dev/null; then
    $SUDO pacman -S --needed --noconfirm nodejs
  elif command -v dnf > /dev/null; then
    $SUDO dnf install -y nodejs
  fi
else
  echo -e "${GREEN}>> Node.js is already installed: $(node -v)${NC}"
fi

if ! command -v npm > /dev/null; then
  echo -e "${YELLOW}>> npm not found. Installing npm...${NC}"
  if command -v apt-get > /dev/null; then
    $SUDO apt-get install -y npm
  elif command -v pacman > /dev/null; then
    $SUDO pacman -S --needed --noconfirm npm
  elif command -v dnf > /dev/null; then
    $SUDO dnf install -y npm
  fi
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
  echo "OPENWEATHER_API_KEY=$WEATHER_API_KEY" >> .env.local
  echo -e "${GREEN}>> API Key saved to .env.local${NC}"
fi

# 3. NPM Install and Build
echo -e "\n${GREEN}[3/4] Installing NPM dependencies and building the application...${NC}"
npm install
npm run build

# 4. Process Management (PM2)
echo -e "\n${GREEN}[4/4] Setting up PM2 for background process management...${NC}"

if ! command -v pm2 > /dev/null; then
  echo -e "${YELLOW}>> PM2 not found. Installing PM2 globally...${NC}"
  $SUDO npm install -g pm2
else
  echo -e "${GREEN}>> PM2 is already installed: $(pm2 -v)${NC}"
fi

# Stop and delete old instance if exists
pm2 delete fieldmanager 2>/dev/null || true

# Start app with PM2
cd "$PROJECT_DIR"
pm2 start npm --name "fieldmanager" -- start

# Save PM2 process list
pm2 save

# Setup PM2 startup script on system boot
STARTUP_CMD=$(pm2 startup | grep -E "sudo env PATH=" || true)
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" || true
fi

echo -e "\n${BLUE}==========================================${NC}"
echo -e "${GREEN}  Installation Complete! 🚀 ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Your Next.js app 'Field Manager' is now running in the background via PM2.${NC}"
echo -e "You can check the status with: ${YELLOW}pm2 status${NC} or ${YELLOW}pm2 show fieldmanager${NC}"
echo -e "You can view logs with:        ${YELLOW}pm2 logs fieldmanager${NC}"
echo -e "You can restart with:          ${YELLOW}pm2 restart fieldmanager${NC}"
echo -e "The app is running on port:    ${YELLOW}3000${NC} (default)"
echo -e "\n${YELLOW}Note: If you have a firewall enabled, don't forget to allow the port:${NC}"
echo -e "sudo ufw allow 3000/tcp\n"

