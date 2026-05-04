FROM php:8.3-fpm-alpine

# Build tools + PHP extensies
RUN apk add --no-cache \
    git curl zip unzip nodejs npm \
    libpng-dev libzip-dev oniguruma-dev sqlite-dev \
    autoconf g++ make \
    && docker-php-ext-install pdo pdo_sqlite mbstring zip bcmath pcntl \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del autoconf g++ make

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# 1. Installeer Laravel framework via composer
COPY composer.json ./
RUN composer install --no-dev --optimize-autoloader --no-interaction

# 2. Kopieer applicatie bestanden
COPY . .

# 3. Build frontend
RUN npm install && npm run build

# 4. Maak SQLite database aan
RUN touch database/database.sqlite

# 5. Rechten
RUN chown -R www-data:www-data storage bootstrap/cache database \
    && chmod -R 775 storage bootstrap/cache database

# Start script
RUN chmod +x /var/www/html/docker/start.sh

CMD ["/var/www/html/docker/start.sh"]
