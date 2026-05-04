#!/bin/sh
set -e

cd /var/www/html

# Zorg dat database bestaat
touch database/database.sqlite

# Zet rechten
chown -R www-data:www-data storage bootstrap/cache database 2>/dev/null || true
chmod -R 775 storage bootstrap/cache database 2>/dev/null || true

# Genereer APP_KEY als die er niet is
if [ -z "$APP_KEY" ]; then
    php artisan key:generate --force
fi

# Draai migraties
php artisan migrate --force

# Cache voor productie
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

# Start PHP-FPM
exec php-fpm
