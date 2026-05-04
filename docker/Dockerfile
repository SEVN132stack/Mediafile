FROM php:8.3-fpm-alpine

# Installeer benodigde PHP extensies en tools
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

# Kopieer alles
COPY . .

# Installeer PHP dependencies
RUN composer install --no-dev --optimize-autoloader --no-scripts --no-interaction

# Installeer en build frontend
RUN npm install && npm run build

# Maak SQLite database bestand aan als het niet bestaat
RUN touch database/database.sqlite

# Zet rechten
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache /var/www/html/database \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache /var/www/html/database

# Start script
COPY docker/start.sh /var/www/html/start.sh
RUN chmod +x /var/www/html/start.sh

CMD ["/var/www/html/start.sh"]
