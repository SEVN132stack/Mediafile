# MediaSeerr

Een zelf-gehoste media request app vergelijkbaar met Overseerr en Jellyseerr. Gebruikers kunnen films en series zoeken via TMDB en aanvragen indienen die doorgestuurd kunnen worden naar Radarr/Sonarr.

## Features

- 🔍 Zoeken via TMDB (The Movie Database)
- 📈 Trending films en series
- 📋 Verzoeken beheren met statusupdates
- 🎬 Integratie met Radarr (films) en Sonarr (series)
- 📺 Ondersteuning voor Jellyfin en Plex
- 🐳 Docker-ready met health checks
- 🔒 Non-root container voor veiligheid

## Snel starten

### 1. TMDB API key ophalen

Ga naar [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) en maak een gratis API key aan.

### 2. Configuratie

```bash
cp .env.example .env
# Vul je TMDB_API_KEY en eventuele andere variabelen in
nano .env
```

### 3. Starten met Docker Compose

```bash
docker compose up -d
```

De app draait nu op **http://localhost:5055**.

### Alternatief: Docker run

```bash
docker build -t mediaseerr .

docker run -d \
  --name mediaseerr \
  -p 5055:5055 \
  -v $(pwd)/config:/app/config \
  -e TMDB_API_KEY=je_api_key \
  mediaseerr
```

## Omgevingsvariabelen

| Variabele          | Verplicht | Beschrijving                  |
|--------------------|-----------|-------------------------------|
| `TMDB_API_KEY`     | ✅        | TMDB API key                  |
| `PORT`             |           | Poort (standaard: 5055)       |
| `JELLYFIN_URL`     |           | Jellyfin server URL           |
| `JELLYFIN_API_KEY` |           | Jellyfin API key              |
| `PLEX_URL`         |           | Plex server URL               |
| `PLEX_TOKEN`       |           | Plex auth token               |
| `RADARR_URL`       |           | Radarr URL                    |
| `RADARR_API_KEY`   |           | Radarr API key                |
| `SONARR_URL`       |           | Sonarr URL                    |
| `SONARR_API_KEY`   |           | Sonarr API key                |

## Architectuur

```
mediaseerr/
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Orchestratie
├── server.js            # Express API server
├── package.json
├── public/
│   └── index.html       # SPA frontend
└── config/              # Persistent volume
    └── mediaseerr.db    # SQLite database
```

## API Endpoints

| Methode | Pad                        | Beschrijving               |
|---------|----------------------------|----------------------------|
| GET     | `/api/health`              | Health check               |
| GET     | `/api/search?query=...`    | Zoek films/series          |
| GET     | `/api/trending/:type`      | Trending (movie/tv)        |
| GET     | `/api/details/:type/:id`   | TMDB details               |
| POST    | `/api/requests`            | Nieuw verzoek              |
| GET     | `/api/requests`            | Alle verzoeken             |
| PATCH   | `/api/requests/:id`        | Status updaten             |
| GET     | `/api/settings`            | Serverconfiguratie status  |
