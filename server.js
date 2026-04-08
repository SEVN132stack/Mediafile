const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5055;
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, "config");

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Database ──
const Database = require("better-sqlite3");
const db = new Database(path.join(CONFIG_DIR, "mediaseerr.db"));

// ── MIGRATIE: forceer nieuw schema ──
// Als de requests tabel geen 'status_message' kolom heeft, is het het oude schema → verwijderen
try {
  const cols = db.pragma("table_info(requests)").map(c => c.name);
  if (cols.length > 0 && !cols.includes("status_message")) {
    console.log("[migrate] Oud schema gedetecteerd — requests tabel wordt verwijderd en opnieuw aangemaakt");
    db.exec("DROP TABLE IF EXISTS requests");
  }
} catch {
  // Tabel bestaat niet, prima
}

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT NOT NULL,
    poster_path TEXT,
    overview TEXT,
    status TEXT DEFAULT 'sending',
    status_message TEXT DEFAULT '',
    radarr_id INTEGER,
    sonarr_id INTEGER,
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
  "radarr_url", "radarr_api_key", "radarr_quality_profile", "radarr_root_folder",
  "sonarr_url", "sonarr_api_key", "sonarr_quality_profile", "sonarr_root_folder",
];

const ENV_MAP = {
  tmdb_api_key: "TMDB_API_KEY", jellyfin_url: "JELLYFIN_URL", jellyfin_api_key: "JELLYFIN_API_KEY",
  plex_url: "PLEX_URL", plex_token: "PLEX_TOKEN",
  radarr_url: "RADARR_URL", radarr_api_key: "RADARR_API_KEY",
  radarr_quality_profile: "RADARR_QUALITY_PROFILE", radarr_root_folder: "RADARR_ROOT_FOLDER",
  sonarr_url: "SONARR_URL", sonarr_api_key: "SONARR_API_KEY",
  sonarr_quality_profile: "SONARR_QUALITY_PROFILE", sonarr_root_folder: "SONARR_ROOT_FOLDER",
};

db.transaction(() => {
  for (const key of SETTING_KEYS) {
    const exists = db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key);
    if (!exists) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, process.env[ENV_MAP[key]] || "");
  }
})();

function getSetting(key) { const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key); return r ? r.value : ""; }
function getAllSettings() { const rows = db.prepare("SELECT key, value FROM settings").all(); const o = {}; for (const r of rows) o[r.key] = r.value; return o; }

// ── TMDB ──
const TMDB_BASE = "https://api.themoviedb.org/3";
async function tmdbFetch(endpoint, params = {}) {
  const apiKey = getSetting("tmdb_api_key");
  if (!apiKey) throw new Error("TMDB API key niet ingesteld.");
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", apiKey); url.searchParams.set("language", "nl-NL");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// ── Radarr / Sonarr helpers ──
async function radarrApi(method, endpoint, body = null) {
  const url = getSetting("radarr_url"), key = getSetting("radarr_api_key");
  if (!url || !key) throw new Error("Radarr niet geconfigureerd");
  const opts = { method, headers: { "X-Api-Key": key, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${url}/api/v3${endpoint}`, opts);
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`Radarr ${res.status}: ${t.slice(0, 200)}`); }
  return res.json();
}

async function sonarrApi(method, endpoint, body = null) {
  const url = getSetting("sonarr_url"), key = getSetting("sonarr_api_key");
  if (!url || !key) throw new Error("Sonarr niet geconfigureerd");
  const opts = { method, headers: { "X-Api-Key": key, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${url}/api/v3${endpoint}`, opts);
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`Sonarr ${res.status}: ${t.slice(0, 200)}`); }
  return res.json();
}

async function sendToRadarr(tmdbId, title) {
  // Check of film al in Radarr zit
  try {
    const existing = await radarrApi("GET", `/movie?tmdbId=${tmdbId}`);
    if (existing && existing.length > 0) {
      const movie = existing[0];
      if (movie.hasFile) return { status: "available", message: "Film is al beschikbaar in Radarr", radarr_id: movie.id };
      return { status: "downloading", message: "Film staat al in Radarr, wordt gedownload", radarr_id: movie.id };
    }
  } catch {}

  let profileId = parseInt(getSetting("radarr_quality_profile")) || null;
  let rootFolder = getSetting("radarr_root_folder") || null;
  if (!profileId) { const p = await radarrApi("GET", "/qualityprofile"); if (p.length) profileId = p[0].id; }
  if (!rootFolder) { const f = await radarrApi("GET", "/rootfolder"); if (f.length) rootFolder = f[0].path; }

  const movie = await radarrApi("POST", "/movie", {
    tmdbId, title, qualityProfileId: profileId, rootFolderPath: rootFolder,
    monitored: true, addOptions: { searchForMovie: true },
  });
  return { status: "sent", message: "Film toegevoegd aan Radarr — download gestart", radarr_id: movie.id };
}

async function sendToSonarr(tmdbId, title) {
  let tvdbId;
  try { const ext = await tmdbFetch(`/tv/${tmdbId}/external_ids`); tvdbId = ext.tvdb_id; } catch {}
  if (!tvdbId) { try { const l = await sonarrApi("GET", `/series/lookup?term=${encodeURIComponent(title)}`); if (l.length) tvdbId = l[0].tvdbId; } catch {} }
  if (!tvdbId) throw new Error("Kan TVDB ID niet vinden voor deze serie");

  try {
    const all = await sonarrApi("GET", "/series");
    const ex = all.find(s => s.tvdbId === tvdbId);
    if (ex) {
      const done = ex.statistics && ex.statistics.percentOfEpisodes === 100;
      if (done) return { status: "available", message: "Serie is volledig beschikbaar", sonarr_id: ex.id };
      return { status: "downloading", message: "Serie wordt gedownload", sonarr_id: ex.id };
    }
  } catch {}

  let profileId = parseInt(getSetting("sonarr_quality_profile")) || null;
  let rootFolder = getSetting("sonarr_root_folder") || null;
  if (!profileId) { const p = await sonarrApi("GET", "/qualityprofile"); if (p.length) profileId = p[0].id; }
  if (!rootFolder) { const f = await sonarrApi("GET", "/rootfolder"); if (f.length) rootFolder = f[0].path; }

  const lookup = await sonarrApi("GET", `/series/lookup?term=tvdb:${tvdbId}`);
  if (!lookup.length) throw new Error("Serie niet gevonden in Sonarr");

  const series = await sonarrApi("POST", "/series", {
    ...lookup[0], qualityProfileId: profileId, rootFolderPath: rootFolder,
    monitored: true, seasonFolder: true,
    addOptions: { monitor: "all", searchForMissingEpisodes: true, searchForCutoffUnmetEpisodes: false },
  });
  return { status: "sent", message: "Serie toegevoegd aan Sonarr — download gestart", sonarr_id: series.id };
}

// ══════════════════════════
//  ROUTES
// ══════════════════════════

app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "1.1.0" }));

// Settings
app.get("/api/settings", (_req, res) => res.json(getAllSettings()));
app.put("/api/settings", (req, res) => {
  try {
    const stmt = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
    db.transaction(() => { for (const [k, v] of Object.entries(req.body)) { if (SETTING_KEYS.includes(k)) stmt.run(k, String(v)); } })();
    res.json({ success: true, settings: getAllSettings() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/settings/test", async (req, res) => {
  const { service } = req.body;
  try {
    if (service === "tmdb") { const k = getSetting("tmdb_api_key"); if (!k) return res.json({ ok: false, error: "Geen key" }); const r = await fetch(`${TMDB_BASE}/configuration?api_key=${k}`); return res.json({ ok: r.ok }); }
    if (service === "radarr") { await radarrApi("GET", "/system/status"); return res.json({ ok: true }); }
    if (service === "sonarr") { await sonarrApi("GET", "/system/status"); return res.json({ ok: true }); }
    if (service === "jellyfin") { const u = getSetting("jellyfin_url"), k = getSetting("jellyfin_api_key"); if (!u||!k) return res.json({ ok: false, error: "Ontbreekt" }); const r = await fetch(`${u}/System/Info`, { headers: { "X-Emby-Token": k } }); return res.json({ ok: r.ok }); }
    if (service === "plex") { const u = getSetting("plex_url"), t = getSetting("plex_token"); if (!u||!t) return res.json({ ok: false, error: "Ontbreekt" }); const r = await fetch(`${u}/identity`, { headers: { "X-Plex-Token": t, Accept: "application/json" } }); return res.json({ ok: r.ok }); }
    res.json({ ok: false });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/settings/radarr-profiles", async (_req, res) => {
  try { const [profiles, folders] = await Promise.all([radarrApi("GET", "/qualityprofile"), radarrApi("GET", "/rootfolder")]); res.json({ profiles, folders }); }
  catch (err) { res.json({ error: err.message }); }
});
app.get("/api/settings/sonarr-profiles", async (_req, res) => {
  try { const [profiles, folders] = await Promise.all([sonarrApi("GET", "/qualityprofile"), sonarrApi("GET", "/rootfolder")]); res.json({ profiles, folders }); }
  catch (err) { res.json({ error: err.message }); }
});

// Media
app.get("/api/search", async (req, res) => {
  try { const { query, page = 1 } = req.query; if (!query) return res.status(400).json({ error: "Query verplicht" });
    const d = await tmdbFetch("/search/multi", { query, page }); d.results = (d.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv"); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/trending/:type", async (req, res) => {
  try { res.json(await tmdbFetch(`/trending/${req.params.type === "tv" ? "tv" : "movie"}/week`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/genres/:type", async (req, res) => {
  try { res.json(await tmdbFetch(`/genre/${req.params.type === "tv" ? "tv" : "movie"}/list`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/discover/:type", async (req, res) => {
  try { const type = req.params.type === "tv" ? "tv" : "movie"; const { genre, page = 1, sort = "popularity.desc" } = req.query;
    const p = { page, sort_by: sort }; if (genre) p.with_genres = genre; res.json(await tmdbFetch(`/discover/${type}`, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/collection/:type/:collection", async (req, res) => {
  try { const type = req.params.type === "tv" ? "tv" : "movie"; const col = req.params.collection;
    const map = { popular: `/${type}/popular`, top_rated: `/${type}/top_rated`, upcoming: "/movie/upcoming", now_playing: "/movie/now_playing", airing_today: "/tv/airing_today", on_the_air: "/tv/on_the_air" };
    if (!map[col]) return res.status(400).json({ error: "Ongeldig" }); res.json(await tmdbFetch(map[col], { page: req.query.page || 1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/details/:type/:id", async (req, res) => {
  try { const { type, id } = req.params; const d = await tmdbFetch(`/${type}/${id}`, { append_to_response: "credits,recommendations" });
    d._request = db.prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?").get(id, type) || null; res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Requests: direct naar Radarr/Sonarr ──
app.post("/api/requests", async (req, res) => {
  try {
    const { tmdb_id, media_type, title, poster_path, overview } = req.body;
    if (!tmdb_id || !media_type || !title) return res.status(400).json({ error: "Velden ontbreken" });

    const existing = db.prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?").get(tmdb_id, media_type);
    if (existing) return res.status(409).json({ error: "Al aangevraagd", request: existing });

    const result = db.prepare("INSERT INTO requests (tmdb_id, media_type, title, poster_path, overview, status, status_message) VALUES (?, ?, ?, ?, ?, 'sending', 'Wordt verstuurd…')").run(tmdb_id, media_type, title, poster_path, overview);
    const requestId = result.lastInsertRowid;

    try {
      let sr;
      if (media_type === "movie") {
        if (!getSetting("radarr_url") || !getSetting("radarr_api_key")) {
          db.prepare("UPDATE requests SET status='not_configured', status_message='Radarr niet geconfigureerd — ga naar Instellingen', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId);
          return res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId));
        }
        sr = await sendToRadarr(tmdb_id, title);
        db.prepare("UPDATE requests SET status=?, status_message=?, radarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.radarr_id || null, requestId);
      } else {
        if (!getSetting("sonarr_url") || !getSetting("sonarr_api_key")) {
          db.prepare("UPDATE requests SET status='not_configured', status_message='Sonarr niet geconfigureerd — ga naar Instellingen', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId);
          return res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId));
        }
        sr = await sendToSonarr(tmdb_id, title);
        db.prepare("UPDATE requests SET status=?, status_message=?, sonarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.sonarr_id || null, requestId);
      }
    } catch (err) {
      db.prepare("UPDATE requests SET status='failed', status_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.message.slice(0, 500), requestId);
    }

    res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/requests/:id/retry", async (req, res) => {
  try {
    const r = db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);
    if (!r) return res.status(404).json({ error: "Niet gevonden" });
    db.prepare("UPDATE requests SET status='sending', status_message='Opnieuw proberen…', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(r.id);
    try {
      let sr;
      if (r.media_type === "movie") { sr = await sendToRadarr(r.tmdb_id, r.title); db.prepare("UPDATE requests SET status=?, status_message=?, radarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.radarr_id || null, r.id); }
      else { sr = await sendToSonarr(r.tmdb_id, r.title); db.prepare("UPDATE requests SET status=?, status_message=?, sonarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.sonarr_id || null, r.id); }
    } catch (err) { db.prepare("UPDATE requests SET status='failed', status_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.message.slice(0, 500), r.id); }
    res.json(db.prepare("SELECT * FROM requests WHERE id=?").get(r.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/requests/:id", (req, res) => {
  try { db.prepare("DELETE FROM requests WHERE id=?").run(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/requests", (_req, res) => {
  try { res.json(db.prepare("SELECT * FROM requests ORDER BY requested_at DESC").all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ╔══════════════════════════════════════════╗\n  ║       MediaSeerr v1.1.0 gestart         ║\n  ║       http://localhost:${PORT}              ║\n  ╚══════════════════════════════════════════╝\n`);
});
