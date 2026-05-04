#!/bin/bash
set -e

echo "🚀 MediaSeerr Laravel Setup"
echo "=========================="

# Kopieer .env als die er niet is
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✓ .env aangemaakt"
fi

# Maak config map aan voor SQLite
mkdir -p database
touch database/database.sqlite

# Zet rechten
sudo chown -R 1000:1000 database storage bootstrap/cache 2>/dev/null || true
sudo chmod -R 775 database storage bootstrap/cache 2>/dev/null || true

# Genereer APP_KEY in .env als die leeg is
if grep -q "APP_KEY=$" .env; then
    KEY=$(openssl rand -base64 32)
    sed -i "s|APP_KEY=|APP_KEY=base64:${KEY}|" .env
    echo "✓ APP_KEY gegenereerd"
fi

# Pas APP_URL aan
read -p "Jouw domeinnaam of IP (bijv. http://192.168.1.100): " APP_URL
sed -i "s|APP_URL=http://localhost|APP_URL=${APP_URL}|" .env

echo ""
echo "✓ Klaar! Start de applicatie met:"
echo "  docker compose up -d --build"
echo ""
echo "De app is bereikbaar op: ${APP_URL}"
