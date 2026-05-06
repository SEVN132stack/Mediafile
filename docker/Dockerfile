FROM php:8.3-fpm-alpine

# PHP extensies - geen Redis compilatie nodig
RUN apk add --no-cache \
    git curl zip unzip nodejs npm \
    libpng-dev libzip-dev oniguruma-dev sqlite-dev \
    && docker-php-ext-install pdo pdo_sqlite mbstring zip bcmath pcntl

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Kopieer ALLE bestanden eerst
COPY . .

# Installeer PHP dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts

# Draai package discovery
RUN php artisan package:discover --ansi || true

# Build frontend
RUN npm install && npm run build

# Maak SQLite database aan
RUN touch database/database.sqlite

# Rechten
RUN chown -R www-data:www-data storage bootstrap/cache database \
    && chmod -R 775 storage bootstrap/cache database

# Start script
RUN sed -i 's/\r//' /var/www/html/docker/start.sh \
    && chmod +x /var/www/html/docker/start.sh

CMD ["/var/www/html/docker/start.sh"]
