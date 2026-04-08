FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .

FROM node:20-alpine AS production
LABEL maintainer="mediaseerr" version="1.1.0"
RUN addgroup -S mediaseerr && adduser -S mediaseerr -G mediaseerr
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./
VOLUME ["/app/config"]
ENV NODE_ENV=production PORT=5055 CONFIG_DIR=/app/config LOG_LEVEL=info
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1
EXPOSE ${PORT}
RUN chown -R mediaseerr:mediaseerr /app
USER mediaseerr
CMD ["node", "server.js"]
