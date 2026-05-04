#!/bin/sh
set -e

cd /var/www/html

# Kopieer .env als die er niet is
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Zorg dat database bestaat
touch database/database.sqlite

# Rechten
chown -R www-data:www-data storage bootstrap/cache database 2>/dev/null || true
chmod -R 775 storage bootstrap/cache database 2>/dev/null || true

# Genereer APP_KEY als die leeg is
if grep -q "APP_KEY=$" .env || [ -z "$(grep APP_KEY .env | cut -d= -f2)" ]; then
    php artisan key:generate --force
fi

# Migraties
php artisan migrate --force

# Cache
php artisan config:clear
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

exec php-fpm
