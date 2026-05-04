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

# Verwijder gecachde config/routes (kunnen stale zijn)
php artisan config:clear 2>/dev/null || true
php artisan cache:clear 2>/dev/null || true
php artisan route:clear 2>/dev/null || true
php artisan view:clear 2>/dev/null || true

# Genereer APP_KEY als die leeg is
APP_KEY_VALUE=$(grep "^APP_KEY=" .env | cut -d= -f2-)
if [ -z "$APP_KEY_VALUE" ] || [ "$APP_KEY_VALUE" = "" ]; then
    php artisan key:generate --force
fi

# Migraties
php artisan migrate --force

# Geen route:cache of config:cache - dit veroorzaakt de [files] fout
# De app draait prima zonder cache in productie met sqlite

exec php-fpm
