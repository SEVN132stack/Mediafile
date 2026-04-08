const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5055;
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, "config");

if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// ── Middleware ──
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Database (SQLite) ──
const Database = require("better-sqlite3");
const db = new Database(path.join(CONFIG_DIR, "mediaseerr.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
    title TEXT NOT NULL,
    poster_path TEXT,
    overview TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'available', 'declined')),
    requested_by TEXT DEFAULT 'user',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Settings ──
const SETTING_KEYS = [
  "tmdb_api_key",
  "jellyfin_url", "jellyfin_api_key",
  "plex_url", "plex_token",
  "radarr_url", "radarr_api_key",
  "sonarr_url", "sonarr_api_key",
];

const ENV_MAP = {
  tmdb_api_key: "TMDB_API_KEY",
  jellyfin_url: "JELLYFIN_URL",
  jellyfin_api_key: "JELLYFIN_API_KEY",
  plex_url: "PLEX_URL",
  plex_token: "PLEX_TOKEN",
  radarr_url: "RADARR_URL",
  radarr_api_key: "RADARR_API_KEY",
  sonarr_url: "SONARR_URL",
  sonarr_api_key: "SONARR_API_KEY",
};

// Seed settings vanuit env vars (alleen als key nog niet bestaat)
db.transaction(() => {
  for (const key of SETTING_KEYS) {
    const exists = db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key);
    if (!exists) {
      const envVal = process.env[ENV_MAP[key]] || "";
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, envVal);
    }
  }
})();

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : "";
}

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

// ── TMDB helper ──
const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch(endpoint, params = {}) {
  const apiKey = getSetting("tmdb_api_key");
  if (!apiKey) throw new Error("TMDB API key niet ingesteld — ga naar Instellingen.");
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "nl-NL");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// ══════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════

// Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", tmdb_configured: !!getSetting("tmdb_api_key"), uptime: process.uptime() });
});

// ── Settings endpoints ──
app.get("/api/settings", (_req, res) => {
  res.json(getAllSettings());
});

app.put("/api/settings", (req, res) => {
  try {
    const updates = req.body;
    const stmt = db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (SETTING_KEYS.includes(key)) stmt.run(key, String(value));
      }
    })();
    res.json({ success: true, settings: getAllSettings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings/test", async (req, res) => {
  const { service } = req.body;
  try {
    if (service === "tmdb") {
      const key = getSetting("tmdb_api_key");
      if (!key) return res.json({ ok: false, error: "Geen API key" });
      const r = await fetch(`${TMDB_BASE}/configuration?api_key=${key}`);
      return res.json({ ok: r.ok, status: r.status });
    }
    if (service === "radarr") {
      const url = getSetting("radarr_url"), key = getSetting("radarr_api_key");
      if (!url || !key) return res.json({ ok: false, error: "URL of API key ontbreekt" });
      const r = await fetch(`${url}/api/v3/system/status`, { headers: { "X-Api-Key": key } });
      return res.json({ ok: r.ok, status: r.status });
    }
    if (service === "sonarr") {
      const url = getSetting("sonarr_url"), key = getSetting("sonarr_api_key");
      if (!url || !key) return res.json({ ok: false, error: "URL of API key ontbreekt" });
      const r = await fetch(`${url}/api/v3/system/status`, { headers: { "X-Api-Key": key } });
      return res.json({ ok: r.ok, status: r.status });
    }
    if (service === "jellyfin") {
      const url = getSetting("jellyfin_url"), key = getSetting("jellyfin_api_key");
      if (!url || !key) return res.json({ ok: false, error: "URL of API key ontbreekt" });
      const r = await fetch(`${url}/System/Info`, { headers: { "X-Emby-Token": key } });
      return res.json({ ok: r.ok, status: r.status });
    }
    if (service === "plex") {
      const url = getSetting("plex_url"), token = getSetting("plex_token");
      if (!url || !token) return res.json({ ok: false, error: "URL of token ontbreekt" });
      const r = await fetch(`${url}/identity`, { headers: { "X-Plex-Token": token, Accept: "application/json" } });
      return res.json({ ok: r.ok, status: r.status });
    }
    res.json({ ok: false, error: "Onbekende service" });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Media endpoints ──
app.get("/api/search", async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    if (!query) return res.status(400).json({ error: "Query is verplicht" });
    const data = await tmdbFetch("/search/multi", { query, page });
    data.results = (data.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv");
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/trending/:type", async (req, res) => {
  try {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const data = await tmdbFetch(`/trending/${type}/week`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Genre lijsten
app.get("/api/genres/:type", async (req, res) => {
  try {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const data = await tmdbFetch(`/genre/${type}/list`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Discover per genre
app.get("/api/discover/:type", async (req, res) => {
  try {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const { genre, page = 1, sort = "popularity.desc" } = req.query;
    const params = { page, sort_by: sort };
    if (genre) params.with_genres = genre;
    const data = await tmdbFetch(`/discover/${type}`, params);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Speciale collecties
app.get("/api/collection/:type/:collection", async (req, res) => {
  try {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const col = req.params.collection;
    let endpoint = "";
    if (col === "popular") endpoint = `/${type}/popular`;
    else if (col === "top_rated") endpoint = `/${type}/top_rated`;
    else if (col === "upcoming" && type === "movie") endpoint = "/movie/upcoming";
    else if (col === "now_playing" && type === "movie") endpoint = "/movie/now_playing";
    else if (col === "airing_today" && type === "tv") endpoint = "/tv/airing_today";
    else if (col === "on_the_air" && type === "tv") endpoint = "/tv/on_the_air";
    else return res.status(400).json({ error: "Ongeldige collectie" });
    const data = await tmdbFetch(endpoint, { page: req.query.page || 1 });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/details/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await tmdbFetch(`/${type}/${id}`, { append_to_response: "credits,recommendations" });
    const row = db.prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?").get(id, type);
    data._request = row || null;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/requests", (req, res) => {
  try {
    const { tmdb_id, media_type, title, poster_path, overview } = req.body;
    if (!tmdb_id || !media_type || !title) return res.status(400).json({ error: "Verplichte velden ontbreken" });
    const existing = db.prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?").get(tmdb_id, media_type);
    if (existing) return res.status(409).json({ error: "Al aangevraagd", request: existing });
    const result = db.prepare("INSERT INTO requests (tmdb_id, media_type, title, poster_path, overview) VALUES (?, ?, ?, ?, ?)").run(tmdb_id, media_type, title, poster_path, overview);
    const created = db.prepare("SELECT * FROM requests WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/requests", (_req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM requests ORDER BY requested_at DESC").all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/requests/:id", (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "available", "declined"].includes(status)) return res.status(400).json({ error: "Ongeldige status" });
    db.prepare("UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, req.params.id);
    res.json(db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ──
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ╔══════════════════════════════════════════╗\n  ║       MediaSeerr v1.0.0 gestart         ║\n  ║       http://localhost:${PORT}              ║\n  ╚══════════════════════════════════════════╝\n`);
});
