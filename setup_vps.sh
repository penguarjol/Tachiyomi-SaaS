#!/bin/bash

# Tachiyomi SaaS - VPS Setup Script
# Run this on your fresh Ubuntu 22.04/24.04 VPS (DigitalOcean Droplet)

set -e

echo ">>> Updating System..."
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y -o Dpkg::Options::="--force-confold"

echo ">>> Installing Docker & Docker Compose..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt-get install -y docker-compose-plugin

echo ">>> Cloning Repository..."
# Check if we are already inside the repo (e.g. manually cloned)
if [ -f "docker-compose.yml" ]; then
    echo ">>> Already inside repository. Using current directory."
    PROJECT_DIR=$(pwd)
else
    # Default location
    PROJECT_DIR="/opt/tachiyomi"
    if [ -d "$PROJECT_DIR" ]; then
        echo ">>> Updating existing repository at $PROJECT_DIR..."
        cd "$PROJECT_DIR"
        git pull
    else
        echo ">>> Cloning to $PROJECT_DIR..."
        git clone --recursive https://github.com/penguarjol/Tachiyomi-SaaS.git "$PROJECT_DIR"
    fi
fi

cd "$PROJECT_DIR"

echo ">>> Setting up Environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "!!! IMPORTANT !!!"
    echo "Please edit /opt/tachiyomi/.env with your Supabase keys before starting!"
    echo "Nano editor opening in 5 seconds..."
    sleep 5
    nano .env
fi

echo ">>> Building and Starting Stack..."
docker compose up -d --build

echo ">>> Deployment Complete!"
echo "Server running at: http://$(curl -s ifconfig.me):8080"
