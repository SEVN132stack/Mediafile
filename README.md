# MediaSeerr — Laravel Stack

Media request manager gebouwd met **Laravel 11 + Vue 3 + SQLite**.

## Stack
- **Backend**: Laravel 11 (PHP 8.3) + Sanctum auth
- **Frontend**: Vue 3 (SPA via Vite)
- **Database**: SQLite
- **Cache/Queue**: Redis
- **Webserver**: Nginx
- **Updates**: Watchtower

## Installatie

```bash
# 1. Eerste keer instellen
chmod +x setup.sh && ./setup.sh

# 2. Starten
docker compose up -d --build
```

## Updates

Updates worden automatisch uitgevoerd door Watchtower elke nacht om 04:00.

Handmatig updaten:
```bash
docker compose pull
docker compose up -d --build
```

## Configuratie

Na het opstarten ga je naar de app en maak je een admin account aan.
Vul daarna in de instellingen in:
- TMDB API Key (verplicht)
- Radarr URL + API Key
- Sonarr URL + API Key
- Optioneel: Jellyfin of Plex

## Projectstructuur

```
├── app/
│   ├── Http/Controllers/   # AuthController, MediaController, RequestController, SettingController
│   ├── Models/             # User, MediaRequest, Setting
│   └── Services/           # TmdbService, RadarrService, SonarrService
├── database/migrations/    # Database schema
├── resources/js/
│   ├── Pages/              # Vue pagina's
│   ├── Components/         # Herbruikbare Vue componenten
│   └── App.vue             # Root component
├── routes/
│   ├── api.php             # REST API routes
│   └── web.php             # SPA catch-all
└── docker/                 # Dockerfile, Nginx config, start script
```
