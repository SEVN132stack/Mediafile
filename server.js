const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5055;
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, "config");

// Zorg dat config directory bestaat
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
`);

// ── Helpers ──
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "nl-NL");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// ── API Routes ──

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    tmdb_configured: !!TMDB_API_KEY,
    uptime: process.uptime(),
  });
});

// Zoek films en series
app.get("/api/search", async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    if (!query) return res.status(400).json({ error: "Query is verplicht" });
    const data = await tmdbFetch("/search/multi", { query, page });
    // Filter op alleen films en series
    data.results = (data.results || []).filter(
      (r) => r.media_type === "movie" || r.media_type === "tv"
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trending
app.get("/api/trending/:type", async (req, res) => {
  try {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const data = await tmdbFetch(`/trending/${type}/week`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detail pagina
app.get("/api/details/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await tmdbFetch(`/${type}/${id}`, {
      append_to_response: "credits,recommendations",
    });
    // Voeg request status toe als die bestaat
    const row = db
      .prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?")
      .get(id, type);
    data._request = row || null;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request aanmaken
app.post("/api/requests", (req, res) => {
  try {
    const { tmdb_id, media_type, title, poster_path, overview } = req.body;
    if (!tmdb_id || !media_type || !title) {
      return res.status(400).json({ error: "Verplichte velden ontbreken" });
    }
    // Check of request al bestaat
    const existing = db
      .prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?")
      .get(tmdb_id, media_type);
    if (existing) {
      return res.status(409).json({ error: "Al aangevraagd", request: existing });
    }

    const stmt = db.prepare(`
      INSERT INTO requests (tmdb_id, media_type, title, poster_path, overview)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(tmdb_id, media_type, title, poster_path, overview);
    const created = db.prepare("SELECT * FROM requests WHERE id = ?").get(result.lastInsertRowid);

    // TODO: Stuur naar Radarr/Sonarr als die geconfigureerd zijn
    // forwardToDownloadClient(created);

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alle requests ophalen
app.get("/api/requests", (_req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM requests ORDER BY requested_at DESC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request status updaten
app.patch("/api/requests/:id", (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "available", "declined"].includes(status)) {
      return res.status(400).json({ error: "Ongeldige status" });
    }
    db.prepare("UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      status,
      req.params.id
    );
    const updated = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server status / settings
app.get("/api/settings", (_req, res) => {
  res.json({
    tmdb_configured: !!TMDB_API_KEY,
    jellyfin_configured: !!process.env.JELLYFIN_URL,
    plex_configured: !!process.env.PLEX_URL,
    radarr_configured: !!process.env.RADARR_URL,
    sonarr_configured: !!process.env.SONARR_URL,
  });
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ──
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       MediaSeerr v1.0.0 gestart         ║
  ║       http://localhost:${PORT}              ║
  ╚══════════════════════════════════════════╝
  `);
});
