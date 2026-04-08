const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5055;
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, "config");

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

// JWT secret: persistent per installatie
const SECRET_FILE = path.join(CONFIG_DIR, ".jwt_secret");
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) {
  JWT_SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim();
} else {
  JWT_SECRET = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_FILE, JWT_SECRET);
}

app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Database ──
const Database = require("better-sqlite3");
const db = new Database(path.join(CONFIG_DIR, "mediaseerr.db"));

// Migratie
try {
  const cols = db.pragma("table_info(requests)").map(c => c.name);
  if (cols.length > 0 && !cols.includes("status_message")) {
    db.exec("DROP TABLE IF EXISTS requests");
  }
} catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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

// ══════════════════════════
//  AUTH
// ══════════════════════════

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
}

// Middleware: vereist inloggen
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "Niet ingelogd" });
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Sessie verlopen, log opnieuw in" });
  }
}

// Middleware: vereist admin
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Alleen voor beheerders" });
  next();
}

// Check of er al gebruikers zijn (voor setup-scherm)
app.get("/api/auth/status", (_req, res) => {
  const count = db.prepare("SELECT COUNT(*) as n FROM users").get().n;
  res.json({ has_users: count > 0, user_count: count });
});

// Eerste gebruiker aanmaken (setup) — alleen als er nog geen users zijn
app.post("/api/auth/setup", async (req, res) => {
  try {
    const count = db.prepare("SELECT COUNT(*) as n FROM users").get().n;
    if (count > 0) return res.status(400).json({ error: "Setup is al voltooid" });

    const { username, password, display_name } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Gebruikersnaam en wachtwoord zijn verplicht" });
    if (password.length < 4) return res.status(400).json({ error: "Wachtwoord moet minimaal 4 tekens zijn" });

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')").run(username, hash, display_name || username);
    const user = db.prepare("SELECT id, username, display_name, role FROM users WHERE id = ?").get(result.lastInsertRowid);
    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Gebruikersnaam bestaat al" });
    res.status(500).json({ error: err.message });
  }
});

// Inloggen
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Vul gebruikersnaam en wachtwoord in" });

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(401).json({ error: "Ongeldige inloggegevens" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Ongeldige inloggegevens" });

    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Huidige gebruiker ophalen
app.get("/api/auth/me", auth, (req, res) => {
  const user = db.prepare("SELECT id, username, display_name, role, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });
  res.json(user);
});

// Wachtwoord wijzigen
app.put("/api/auth/password", auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: "Velden ontbreken" });
    if (new_password.length < 4) return res.status(400).json({ error: "Minimaal 4 tekens" });

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Huidig wachtwoord is onjuist" });

    const hash = await bcrypt.hash(new_password, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: gebruikers beheren ──
app.get("/api/users", auth, adminOnly, (_req, res) => {
  const users = db.prepare("SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at").all();
  res.json(users);
});

app.post("/api/users", auth, adminOnly, async (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Gebruikersnaam en wachtwoord verplicht" });
    if (password.length < 4) return res.status(400).json({ error: "Minimaal 4 tekens" });

    const hash = await bcrypt.hash(password, 10);
    const r = db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)").run(username, hash, display_name || username, role === "admin" ? "admin" : "user");
    res.status(201).json(db.prepare("SELECT id, username, display_name, role, created_at FROM users WHERE id = ?").get(r.lastInsertRowid));
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Gebruikersnaam bestaat al" });
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/users/:id", auth, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: "Je kunt jezelf niet verwijderen" });
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ══════════════════════════
//  TMDB
// ══════════════════════════
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

// ══════════════════════════
//  RADARR / SONARR
// ══════════════════════════
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
  try {
    const existing = await radarrApi("GET", `/movie?tmdbId=${tmdbId}`);
    if (existing && existing.length > 0) {
      const m = existing[0];
      if (m.hasFile) return { status: "available", message: "Film is al beschikbaar", radarr_id: m.id };
      return { status: "downloading", message: "Film wordt al gedownload", radarr_id: m.id };
    }
  } catch {}
  let profileId = parseInt(getSetting("radarr_quality_profile")) || null;
  let rootFolder = getSetting("radarr_root_folder") || null;
  if (!profileId) { const p = await radarrApi("GET", "/qualityprofile"); if (p.length) profileId = p[0].id; }
  if (!rootFolder) { const f = await radarrApi("GET", "/rootfolder"); if (f.length) rootFolder = f[0].path; }
  const movie = await radarrApi("POST", "/movie", { tmdbId, title, qualityProfileId: profileId, rootFolderPath: rootFolder, monitored: true, addOptions: { searchForMovie: true } });
  return { status: "sent", message: "Film toegevoegd aan Radarr — download gestart", radarr_id: movie.id };
}

async function sendToSonarr(tmdbId, title) {
  let tvdbId;
  try { const ext = await tmdbFetch(`/tv/${tmdbId}/external_ids`); tvdbId = ext.tvdb_id; } catch {}
  if (!tvdbId) { try { const l = await sonarrApi("GET", `/series/lookup?term=${encodeURIComponent(title)}`); if (l.length) tvdbId = l[0].tvdbId; } catch {} }
  if (!tvdbId) throw new Error("Kan TVDB ID niet vinden");
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
  const series = await sonarrApi("POST", "/series", { ...lookup[0], qualityProfileId: profileId, rootFolderPath: rootFolder, monitored: true, seasonFolder: true, addOptions: { monitor: "all", searchForMissingEpisodes: true, searchForCutoffUnmetEpisodes: false } });
  return { status: "sent", message: "Serie toegevoegd aan Sonarr — download gestart", sonarr_id: series.id };
}

// ══════════════════════════
//  API ROUTES (auth required)
// ══════════════════════════

app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "1.2.0" }));

// Settings (admin only)
app.get("/api/settings", auth, adminOnly, (_req, res) => res.json(getAllSettings()));
app.put("/api/settings", auth, adminOnly, (req, res) => {
  try {
    const stmt = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
    db.transaction(() => { for (const [k, v] of Object.entries(req.body)) { if (SETTING_KEYS.includes(k)) stmt.run(k, String(v)); } })();
    res.json({ success: true, settings: getAllSettings() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/settings/test", auth, adminOnly, async (req, res) => {
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

app.get("/api/settings/radarr-profiles", auth, adminOnly, async (_req, res) => {
  try { const [profiles, folders] = await Promise.all([radarrApi("GET", "/qualityprofile"), radarrApi("GET", "/rootfolder")]); res.json({ profiles, folders }); }
  catch (err) { res.json({ error: err.message }); }
});
app.get("/api/settings/sonarr-profiles", auth, adminOnly, async (_req, res) => {
  try { const [profiles, folders] = await Promise.all([sonarrApi("GET", "/qualityprofile"), sonarrApi("GET", "/rootfolder")]); res.json({ profiles, folders }); }
  catch (err) { res.json({ error: err.message }); }
});

// Media (ingelogd)
app.get("/api/search", auth, async (req, res) => {
  try { const { query, page = 1 } = req.query; if (!query) return res.status(400).json({ error: "Query verplicht" });
    const d = await tmdbFetch("/search/multi", { query, page }); d.results = (d.results || []).filter(r => r.media_type === "movie" || r.media_type === "tv"); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/trending/:type", auth, async (req, res) => {
  try { res.json(await tmdbFetch(`/trending/${req.params.type === "tv" ? "tv" : "movie"}/week`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/genres/:type", auth, async (req, res) => {
  try { res.json(await tmdbFetch(`/genre/${req.params.type === "tv" ? "tv" : "movie"}/list`)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/discover/:type", auth, async (req, res) => {
  try { const type = req.params.type === "tv" ? "tv" : "movie"; const { genre, page = 1, sort = "popularity.desc" } = req.query;
    const p = { page, sort_by: sort }; if (genre) p.with_genres = genre; res.json(await tmdbFetch(`/discover/${type}`, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/collection/:type/:collection", auth, async (req, res) => {
  try { const type = req.params.type === "tv" ? "tv" : "movie"; const col = req.params.collection;
    const map = { popular: `/${type}/popular`, top_rated: `/${type}/top_rated`, upcoming: "/movie/upcoming", now_playing: "/movie/now_playing", airing_today: "/tv/airing_today", on_the_air: "/tv/on_the_air" };
    if (!map[col]) return res.status(400).json({ error: "Ongeldig" }); res.json(await tmdbFetch(map[col], { page: req.query.page || 1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/details/:type/:id", auth, async (req, res) => {
  try { const { type, id } = req.params; const d = await tmdbFetch(`/${type}/${id}`, { append_to_response: "credits,recommendations" });
    d._request = db.prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?").get(id, type) || null; res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Requests (ingelogd)
app.post("/api/requests", auth, async (req, res) => {
  try {
    const { tmdb_id, media_type, title, poster_path, overview } = req.body;
    if (!tmdb_id || !media_type || !title) return res.status(400).json({ error: "Velden ontbreken" });
    const existing = db.prepare("SELECT * FROM requests WHERE tmdb_id = ? AND media_type = ?").get(tmdb_id, media_type);
    if (existing) return res.status(409).json({ error: "Al aangevraagd", request: existing });

    const result = db.prepare("INSERT INTO requests (tmdb_id, media_type, title, poster_path, overview, status, status_message, requested_by) VALUES (?, ?, ?, ?, ?, 'sending', 'Wordt verstuurd…', ?)").run(tmdb_id, media_type, title, poster_path, overview, req.user.username);
    const requestId = result.lastInsertRowid;

    try {
      let sr;
      if (media_type === "movie") {
        if (!getSetting("radarr_url") || !getSetting("radarr_api_key")) { db.prepare("UPDATE requests SET status='not_configured', status_message='Radarr niet geconfigureerd', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId); return res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId)); }
        sr = await sendToRadarr(tmdb_id, title);
        db.prepare("UPDATE requests SET status=?, status_message=?, radarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.radarr_id || null, requestId);
      } else {
        if (!getSetting("sonarr_url") || !getSetting("sonarr_api_key")) { db.prepare("UPDATE requests SET status='not_configured', status_message='Sonarr niet geconfigureerd', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId); return res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId)); }
        sr = await sendToSonarr(tmdb_id, title);
        db.prepare("UPDATE requests SET status=?, status_message=?, sonarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.sonarr_id || null, requestId);
      }
    } catch (err) { db.prepare("UPDATE requests SET status='failed', status_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.message.slice(0, 500), requestId); }
    res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/requests/:id/retry", auth, async (req, res) => {
  try {
    const r = db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);
    if (!r) return res.status(404).json({ error: "Niet gevonden" });
    db.prepare("UPDATE requests SET status='sending', status_message='Opnieuw…', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(r.id);
    try {
      let sr;
      if (r.media_type === "movie") { sr = await sendToRadarr(r.tmdb_id, r.title); db.prepare("UPDATE requests SET status=?, status_message=?, radarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.radarr_id || null, r.id); }
      else { sr = await sendToSonarr(r.tmdb_id, r.title); db.prepare("UPDATE requests SET status=?, status_message=?, sonarr_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status, sr.message, sr.sonarr_id || null, r.id); }
    } catch (err) { db.prepare("UPDATE requests SET status='failed', status_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(err.message.slice(0, 500), r.id); }
    res.json(db.prepare("SELECT * FROM requests WHERE id=?").get(r.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/requests/:id", auth, (req, res) => {
  try { db.prepare("DELETE FROM requests WHERE id=?").run(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/requests", auth, (_req, res) => {
  try { res.json(db.prepare("SELECT * FROM requests ORDER BY requested_at DESC").all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  const userCount = db.prepare("SELECT COUNT(*) as n FROM users").get().n;
  console.log(`\n  ╔══════════════════════════════════════════╗\n  ║       MediaSeerr v1.2.0 gestart         ║\n  ║       http://localhost:${PORT}              ║\n  ║       Gebruikers: ${userCount}                        ║\n  ╚══════════════════════════════════════════╝\n`);
});
