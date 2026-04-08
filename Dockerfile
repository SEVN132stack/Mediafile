# ============================================
# MediaSeerr - Media Request Application
# Vergelijkbaar met Overseerr / Jellyseerr
# ============================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Build-tools nodig voor better-sqlite3 (native module)
RUN apk add --no-cache python3 make g++

# Kopieer package files en installeer dependencies
COPY package*.json ./
RUN npm install

# Kopieer broncode
COPY . .

# --- Stage 2: Production ---
FROM node:20-alpine AS production

# Labels
LABEL maintainer="mediaseerr"
LABEL description="Media Request & Discovery App — vergelijkbaar met Overseerr/Jellyseerr"
LABEL version="1.0.0"

# Maak een non-root user aan voor security
RUN addgroup -S mediaseerr && adduser -S mediaseerr -G mediaseerr

WORKDIR /app

# Kopieer alleen productie-bestanden uit de build stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./

# Volume voor persistente data (database, config, logs)
VOLUME ["/app/config"]

# Omgevingsvariabelen
ENV NODE_ENV=production
ENV PORT=5055
ENV CONFIG_DIR=/app/config
ENV LOG_LEVEL=info

# TMDB API key (moet bij docker run worden meegegeven)
ENV TMDB_API_KEY=""

# Mediaserver integraties
ENV JELLYFIN_URL=""
ENV JELLYFIN_API_KEY=""
ENV PLEX_URL=""
ENV PLEX_TOKEN=""

# Download clients
ENV RADARR_URL=""
ENV RADARR_API_KEY=""
ENV SONARR_URL=""
ENV SONARR_API_KEY=""

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Poort
EXPOSE ${PORT}

# Eigenaar instellen
RUN chown -R mediaseerr:mediaseerr /app
USER mediaseerr

# Start de app
CMD ["node", "server.js"]
