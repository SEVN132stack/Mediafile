FROM serversideup/php:8.3-fpm-alpine

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Node.js
USER root
RUN apk add --no-cache nodejs npm

WORKDIR /var/www/html

# Kopieer alle bestanden
COPY . .

# Installeer PHP dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts

# Package discovery
RUN php artisan package:discover --ansi || true

# Build frontend
RUN npm install && npm run build

# Database
RUN touch database/database.sqlite

# Rechten
RUN chown -R www-data:www-data storage bootstrap/cache database \
    && chmod -R 775 storage bootstrap/cache database

# Start script
RUN sed -i 's/\r//' /var/www/html/docker/start.sh \
    && chmod +x /var/www/html/docker/start.sh

CMD ["/var/www/html/docker/start.sh"]
