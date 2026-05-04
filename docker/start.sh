#!/bin/sh
set -e

cd /var/www/html

# Genereer APP_KEY als die er niet is
if [ -z "$APP_KEY" ]; then
    php artisan key:generate --force
fi

# Draai migraties
php artisan migrate --force

# Cache config voor productie
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Start PHP-FPM
exec php-fpm
