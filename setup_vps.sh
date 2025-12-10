#!/bin/bash

# Tachiyomi SaaS - VPS Setup Script
# Run this on your fresh Ubuntu 22.04/24.04 VPS (DigitalOcean Droplet)

set -e

echo ">>> Updating System..."
apt-get update && apt-get upgrade -y

echo ">>> Installing Docker & Docker Compose..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt-get install -y docker-compose-plugin

echo ">>> Cloning Repository..."
# Using HTTPs commit approach or public repo (since we made it public?)
# If private, user needs a PAT. Assuming Public for now based on 'gh setup' flow.
git clone --recursive https://github.com/penguarjol/Tachiyomi-SaaS.git /opt/tachiyomi

cd /opt/tachiyomi

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
