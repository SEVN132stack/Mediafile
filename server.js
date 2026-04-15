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

const SECRET_FILE = path.join(CONFIG_DIR, ".jwt_secret");
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) JWT_SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim();
else { JWT_SECRET = crypto.randomBytes(48).toString("hex"); fs.writeFileSync(SECRET_FILE, JWT_SECRET); }

app.use(cors()); app.use(morgan("combined")); app.use(express.json()); app.use(express.static(path.join(__dirname, "public")));

const Database = require("better-sqlite3");
const db = new Database(path.join(CONFIG_DIR, "mediaseerr.db"));

// Migratie: als requests tabel oud schema heeft OF geen seasons kolom
try {
  const cols = db.pragma("table_info(requests)").map(c => c.name);
  if (cols.length > 0 && (!cols.includes("status_message") || !cols.includes("seasons"))) {
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
    genre_ids TEXT DEFAULT '',
    seasons TEXT DEFAULT '',
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
const SETTING_KEYS = ["tmdb_api_key","jellyfin_url","jellyfin_api_key","plex_url","plex_token","radarr_url","radarr_api_key","radarr_quality_profile","radarr_root_folder","sonarr_url","sonarr_api_key","sonarr_quality_profile","sonarr_root_folder"];
const ENV_MAP = {tmdb_api_key:"TMDB_API_KEY",jellyfin_url:"JELLYFIN_URL",jellyfin_api_key:"JELLYFIN_API_KEY",plex_url:"PLEX_URL",plex_token:"PLEX_TOKEN",radarr_url:"RADARR_URL",radarr_api_key:"RADARR_API_KEY",radarr_quality_profile:"RADARR_QUALITY_PROFILE",radarr_root_folder:"RADARR_ROOT_FOLDER",sonarr_url:"SONARR_URL",sonarr_api_key:"SONARR_API_KEY",sonarr_quality_profile:"SONARR_QUALITY_PROFILE",sonarr_root_folder:"SONARR_ROOT_FOLDER"};
db.transaction(() => { for (const key of SETTING_KEYS) { if (!db.prepare("SELECT 1 FROM settings WHERE key=?").get(key)) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(key, process.env[ENV_MAP[key]]||""); } })();
function getSetting(k) { const r = db.prepare("SELECT value FROM settings WHERE key=?").get(k); return r ? r.value : ""; }
function getAllSettings() { const rows = db.prepare("SELECT key,value FROM settings").all(); const o = {}; for (const r of rows) o[r.key]=r.value; return o; }

// ── Auth ──
function genToken(u) { return jwt.sign({id:u.id,username:u.username,role:u.role}, JWT_SECRET, {expiresIn:"30d"}); }
function auth(req,res,next) { const h=req.headers.authorization; if(!h||!h.startsWith("Bearer ")) return res.status(401).json({error:"Niet ingelogd"}); try{req.user=jwt.verify(h.slice(7),JWT_SECRET);next()}catch{res.status(401).json({error:"Sessie verlopen"})} }
function adminOnly(req,res,next) { if(req.user.role!=="admin") return res.status(403).json({error:"Alleen beheerders"}); next(); }

app.get("/api/auth/status", (_req,res) => { const n=db.prepare("SELECT COUNT(*) as n FROM users").get().n; res.json({has_users:n>0,user_count:n}); });

app.post("/api/auth/setup", async (req,res) => {
  try { if(db.prepare("SELECT COUNT(*) as n FROM users").get().n>0) return res.status(400).json({error:"Setup voltooid"});
    const{username,password,display_name}=req.body; if(!username||!password) return res.status(400).json({error:"Verplichte velden"}); if(password.length<4) return res.status(400).json({error:"Min 4 tekens"});
    const hash=await bcrypt.hash(password,10); const r=db.prepare("INSERT INTO users (username,password_hash,display_name,role) VALUES (?  ,?,?,'admin')").run(username,hash,display_name||username);
    const user=db.prepare("SELECT id,username,display_name,role FROM users WHERE id=?").get(r.lastInsertRowid); res.status(201).json({token:genToken(user),user});
  } catch(e) { if(e.message.includes("UNIQUE")) return res.status(409).json({error:"Bestaat al"}); res.status(500).json({error:e.message}); }
});

app.post("/api/auth/login", async (req,res) => {
  try { const{username,password}=req.body; if(!username||!password) return res.status(400).json({error:"Vul alles in"});
    const u=db.prepare("SELECT * FROM users WHERE username=?").get(username); if(!u) return res.status(401).json({error:"Ongeldige gegevens"});
    if(!await bcrypt.compare(password,u.password_hash)) return res.status(401).json({error:"Ongeldige gegevens"});
    res.json({token:genToken(u),user:{id:u.id,username:u.username,display_name:u.display_name,role:u.role}});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/auth/me", auth, (req,res) => { const u=db.prepare("SELECT id,username,display_name,role FROM users WHERE id=?").get(req.user.id); if(!u) return res.status(401).json({error:"Niet gevonden"}); res.json(u); });
app.put("/api/auth/password", auth, async (req,res) => {
  try { const{current_password,new_password}=req.body; if(!current_password||!new_password) return res.status(400).json({error:"Velden ontbreken"});
    const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id); if(!await bcrypt.compare(current_password,u.password_hash)) return res.status(401).json({error:"Onjuist wachtwoord"});
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(await bcrypt.hash(new_password,10),req.user.id); res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/users", auth, adminOnly, (_req,res) => res.json(db.prepare("SELECT id,username,display_name,role,created_at FROM users ORDER BY created_at").all()));
app.post("/api/users", auth, adminOnly, async (req,res) => {
  try { const{username,password,display_name,role}=req.body; if(!username||!password) return res.status(400).json({error:"Verplicht"});
    const hash=await bcrypt.hash(password,10); const r=db.prepare("INSERT INTO users (username,password_hash,display_name,role) VALUES (?,?,?,?)").run(username,hash,display_name||username,role==="admin"?"admin":"user");
    res.status(201).json(db.prepare("SELECT id,username,display_name,role FROM users WHERE id=?").get(r.lastInsertRowid));
  } catch(e) { if(e.message.includes("UNIQUE")) return res.status(409).json({error:"Bestaat al"}); res.status(500).json({error:e.message}); }
});
app.delete("/api/users/:id", auth, adminOnly, (req,res) => { if(parseInt(req.params.id)===req.user.id) return res.status(400).json({error:"Kan jezelf niet verwijderen"}); db.prepare("DELETE FROM users WHERE id=?").run(req.params.id); res.json({success:true}); });

// ── TMDB ──
const TMDB_BASE = "https://api.themoviedb.org/3";
async function tmdbFetch(ep, params={}) {
  const k=getSetting("tmdb_api_key"); if(!k) throw new Error("TMDB key niet ingesteld");
  const url=new URL(`${TMDB_BASE}${ep}`); url.searchParams.set("api_key",k); url.searchParams.set("language","nl-NL");
  for(const[a,b] of Object.entries(params)) url.searchParams.set(a,b);
  const r=await fetch(url.toString()); if(!r.ok) throw new Error(`TMDB ${r.status}`); return r.json();
}

// ── Radarr / Sonarr ──
async function radarrApi(m,ep,body=null) {
  const url=getSetting("radarr_url"),k=getSetting("radarr_api_key"); if(!url||!k) throw new Error("Radarr niet geconfigureerd");
  const o={method:m,headers:{"X-Api-Key":k,"Content-Type":"application/json"}}; if(body) o.body=JSON.stringify(body);
  const r=await fetch(`${url}/api/v3${ep}`,o); if(!r.ok){const t=await r.text().catch(()=>"");throw new Error(`Radarr ${r.status}: ${t.slice(0,200)}`);}return r.json();
}
async function sonarrApi(m,ep,body=null) {
  const url=getSetting("sonarr_url"),k=getSetting("sonarr_api_key"); if(!url||!k) throw new Error("Sonarr niet geconfigureerd");
  const o={method:m,headers:{"X-Api-Key":k,"Content-Type":"application/json"}}; if(body) o.body=JSON.stringify(body);
  const r=await fetch(`${url}/api/v3${ep}`,o); if(!r.ok){const t=await r.text().catch(()=>"");throw new Error(`Sonarr ${r.status}: ${t.slice(0,200)}`);}return r.json();
}

async function sendToRadarr(tmdbId, title) {
  try { const ex=await radarrApi("GET",`/movie?tmdbId=${tmdbId}`); if(ex&&ex.length>0){const m=ex[0]; if(m.hasFile) return{status:"available",message:"Film al beschikbaar",radarr_id:m.id}; return{status:"downloading",message:"Film wordt gedownload",radarr_id:m.id};} } catch{}
  let pId=parseInt(getSetting("radarr_quality_profile"))||null, rf=getSetting("radarr_root_folder")||null;
  if(!pId){const p=await radarrApi("GET","/qualityprofile");if(p.length)pId=p[0].id}
  if(!rf){const f=await radarrApi("GET","/rootfolder");if(f.length)rf=f[0].path}
  const mv=await radarrApi("POST","/movie",{tmdbId,title,qualityProfileId:pId,rootFolderPath:rf,monitored:true,addOptions:{searchForMovie:true}});
  return{status:"sent",message:"Film naar Radarr gestuurd — download gestart",radarr_id:mv.id};
}

// seasons = array van seizoensnummers, bijv [1,2,3] of [] voor alles
async function sendToSonarr(tmdbId, title, seasons=[]) {
  let tvdbId;
  try{const ext=await tmdbFetch(`/tv/${tmdbId}/external_ids`);tvdbId=ext.tvdb_id}catch{}
  if(!tvdbId){try{const l=await sonarrApi("GET",`/series/lookup?term=${encodeURIComponent(title)}`);if(l.length)tvdbId=l[0].tvdbId}catch{}}
  if(!tvdbId) throw new Error("Kan TVDB ID niet vinden");

  // Check of al in Sonarr
  try{
    const all=await sonarrApi("GET","/series");
    const ex=all.find(s=>s.tvdbId===tvdbId);
    if(ex) {
      // Als specifieke seizoenen gevraagd, monitor die seizoenen en zoek
      if(seasons.length>0) {
        const updatedSeasons = ex.seasons.map(s => ({...s, monitored: seasons.includes(s.seasonNumber)}));
        await sonarrApi("PUT",`/series/${ex.id}`,{...ex, seasons: updatedSeasons, monitored: true});
        // Trigger search voor de gevraagde seizoenen
        for(const sn of seasons) {
          try { await sonarrApi("POST","/command",{name:"SeasonSearch",seriesId:ex.id,seasonNumber:sn}); } catch{}
        }
        return{status:"sent",message:`Seizoen${seasons.length>1?'en':''} ${seasons.join(', ')} worden gedownload`,sonarr_id:ex.id};
      }
      const done=ex.statistics&&ex.statistics.percentOfEpisodes===100;
      if(done) return{status:"available",message:"Serie volledig beschikbaar",sonarr_id:ex.id};
      return{status:"downloading",message:"Serie wordt gedownload",sonarr_id:ex.id};
    }
  }catch{}

  let pId=parseInt(getSetting("sonarr_quality_profile"))||null, rf=getSetting("sonarr_root_folder")||null;
  if(!pId){const p=await sonarrApi("GET","/qualityprofile");if(p.length)pId=p[0].id}
  if(!rf){const f=await sonarrApi("GET","/rootfolder");if(f.length)rf=f[0].path}

  const lookup=await sonarrApi("GET",`/series/lookup?term=tvdb:${tvdbId}`);
  if(!lookup.length) throw new Error("Serie niet gevonden in Sonarr");

  const seriesData = lookup[0];

  // Seizoenselectie: als specifieke seizoenen, monitor alleen die
  let monitorOption = "all";
  if(seasons.length > 0) {
    monitorOption = "none"; // We stellen het handmatig in
    seriesData.seasons = (seriesData.seasons||[]).map(s => ({...s, monitored: seasons.includes(s.seasonNumber)}));
  }

  const series=await sonarrApi("POST","/series",{
    ...seriesData, qualityProfileId:pId, rootFolderPath:rf, monitored:true, seasonFolder:true,
    addOptions:{ monitor: monitorOption, searchForMissingEpisodes:true, searchForCutoffUnmetEpisodes:false }
  });

  const seasonLabel = seasons.length > 0 ? `Seizoen${seasons.length>1?'en':''} ${seasons.join(', ')}` : 'Alle seizoenen';
  return{status:"sent",message:`${seasonLabel} naar Sonarr gestuurd — download gestart`,sonarr_id:series.id};
}

// ══════════════════════════
//  API ROUTES
// ══════════════════════════
app.get("/api/health", (_req,res) => res.json({status:"ok",version:"1.3.0"}));

// Settings
app.get("/api/settings", auth, adminOnly, (_req,res) => res.json(getAllSettings()));
app.put("/api/settings", auth, adminOnly, (req,res) => {
  try { const stmt=db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at");
    db.transaction(()=>{for(const[k,v] of Object.entries(req.body)){if(SETTING_KEYS.includes(k))stmt.run(k,String(v))}})(); res.json({success:true,settings:getAllSettings()});
  } catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/settings/test", auth, adminOnly, async (req,res) => {
  const{service}=req.body; try{
    if(service==="tmdb"){const k=getSetting("tmdb_api_key");if(!k)return res.json({ok:false,error:"Geen key"});const r=await fetch(`${TMDB_BASE}/configuration?api_key=${k}`);return res.json({ok:r.ok})}
    if(service==="radarr"){await radarrApi("GET","/system/status");return res.json({ok:true})}
    if(service==="sonarr"){await sonarrApi("GET","/system/status");return res.json({ok:true})}
    if(service==="jellyfin"){const u=getSetting("jellyfin_url"),k=getSetting("jellyfin_api_key");if(!u||!k)return res.json({ok:false});const r=await fetch(`${u}/System/Info`,{headers:{"X-Emby-Token":k}});return res.json({ok:r.ok})}
    if(service==="plex"){const u=getSetting("plex_url"),t=getSetting("plex_token");if(!u||!t)return res.json({ok:false});const r=await fetch(`${u}/identity`,{headers:{"X-Plex-Token":t,Accept:"application/json"}});return res.json({ok:r.ok})}
    res.json({ok:false});
  }catch(e){res.json({ok:false,error:e.message})}
});
app.get("/api/settings/radarr-profiles", auth, adminOnly, async (_req,res) => { try{const[p,f]=await Promise.all([radarrApi("GET","/qualityprofile"),radarrApi("GET","/rootfolder")]);res.json({profiles:p,folders:f})}catch(e){res.json({error:e.message})} });
app.get("/api/settings/sonarr-profiles", auth, adminOnly, async (_req,res) => { try{const[p,f]=await Promise.all([sonarrApi("GET","/qualityprofile"),sonarrApi("GET","/rootfolder")]);res.json({profiles:p,folders:f})}catch(e){res.json({error:e.message})} });

// Media
app.get("/api/search", auth, async (req,res) => { try{const{query,page=1}=req.query;if(!query)return res.status(400).json({error:"Query"});const d=await tmdbFetch("/search/multi",{query,page});d.results=(d.results||[]).filter(r=>r.media_type==="movie"||r.media_type==="tv"||r.media_type==="person");res.json(d)}catch(e){res.status(500).json({error:e.message})} });
app.get("/api/trending/:type", auth, async (req,res) => { try{res.json(await tmdbFetch(`/trending/${req.params.type==="tv"?"tv":"movie"}/week`))}catch(e){res.status(500).json({error:e.message})} });
app.get("/api/genres/:type", auth, async (req,res) => { try{res.json(await tmdbFetch(`/genre/${req.params.type==="tv"?"tv":"movie"}/list`))}catch(e){res.status(500).json({error:e.message})} });
app.get("/api/discover/:type", auth, async (req,res) => { try{const t=req.params.type==="tv"?"tv":"movie";const{genre,page=1,sort="popularity.desc"}=req.query;const p={page,sort_by:sort};if(genre)p.with_genres=genre;res.json(await tmdbFetch(`/discover/${t}`,p))}catch(e){res.status(500).json({error:e.message})} });
app.get("/api/collection/:type/:collection", auth, async (req,res) => { try{const t=req.params.type==="tv"?"tv":"movie";const c=req.params.collection;const map={popular:`/${t}/popular`,top_rated:`/${t}/top_rated`,upcoming:"/movie/upcoming",now_playing:"/movie/now_playing",airing_today:"/tv/airing_today",on_the_air:"/tv/on_the_air"};if(!map[c])return res.status(400).json({error:"Ongeldig"});res.json(await tmdbFetch(map[c],{page:req.query.page||1}))}catch(e){res.status(500).json({error:e.message})} });

app.get("/api/details/:type/:id", auth, async (req,res) => {
  try { const{type,id}=req.params; const d=await tmdbFetch(`/${type}/${id}`,{append_to_response:"credits,recommendations"});
    d._request=db.prepare("SELECT * FROM requests WHERE tmdb_id=? AND media_type=?").get(id,type)||null; res.json(d);
  } catch(e){res.status(500).json({error:e.message})}
});

// ── Persoonlijke aanbevelingen ──
app.get("/api/recommendations", auth, async (req,res) => {
  try {
    // Haal genres op van verzoeken van deze gebruiker
    const userRequests = db.prepare("SELECT genre_ids, media_type, tmdb_id FROM requests WHERE requested_by=?").all(req.user.username);
    if(userRequests.length === 0) return res.json({results:[], message:"Doe eerst wat aanvragen om aanbevelingen te krijgen"});

    // Tel genre frequenties
    const genreCounts = {};
    const requestedTmdbIds = new Set();
    for(const r of userRequests) {
      requestedTmdbIds.add(r.tmdb_id);
      if(r.genre_ids) {
        for(const gid of r.genre_ids.split(",").filter(Boolean)) {
          genreCounts[gid] = (genreCounts[gid]||0) + 1;
        }
      }
    }

    // Top 3 genres
    const topGenres = Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
    if(topGenres.length === 0) return res.json({results:[], message:"Geen genre-data beschikbaar"});

    // Haal TMDB recommendations op basis van de laatst aangevraagde items
    const recentRequests = db.prepare("SELECT tmdb_id, media_type FROM requests WHERE requested_by=? ORDER BY requested_at DESC LIMIT 5").all(req.user.username);

    let allResults = [];
    // Methode 1: TMDB recommendations van recente aanvragen
    for(const rr of recentRequests.slice(0,3)) {
      try {
        const recs = await tmdbFetch(`/${rr.media_type}/${rr.tmdb_id}/recommendations`);
        if(recs.results) allResults.push(...recs.results.map(r=>({...r, media_type: rr.media_type})));
      } catch{}
    }

    // Methode 2: Discover op basis van topgenres
    try {
      const discoverMovies = await tmdbFetch("/discover/movie", { with_genres: topGenres.join(","), sort_by: "vote_average.desc", "vote_count.gte": "100" });
      if(discoverMovies.results) allResults.push(...discoverMovies.results.map(r=>({...r, media_type:"movie"})));
    } catch{}
    try {
      const discoverTv = await tmdbFetch("/discover/tv", { with_genres: topGenres.join(","), sort_by: "vote_average.desc", "vote_count.gte": "50" });
      if(discoverTv.results) allResults.push(...discoverTv.results.map(r=>({...r, media_type:"tv"})));
    } catch{}

    // Dedup en filter al-aangevraagde items eruit
    const seen = new Set();
    const filtered = [];
    for(const r of allResults) {
      const key = `${r.media_type}-${r.id}`;
      if(!seen.has(key) && !requestedTmdbIds.has(r.id)) { seen.add(key); filtered.push(r); }
    }

    // Shuffle en neem top 20
    const shuffled = filtered.sort(()=>Math.random()-0.5).slice(0,20);
    res.json({results:shuffled, top_genres: topGenres});
  } catch(e){res.status(500).json({error:e.message})}
});

// ── Bulk request statussen (voor kaart-iconen) ──
app.get("/api/requests/statusmap", auth, (_req,res) => {
  try {
    const rows = db.prepare("SELECT tmdb_id, media_type, status FROM requests").all();
    const map = {};
    for(const r of rows) map[`${r.media_type}-${r.tmdb_id}`] = r.status;
    res.json(map);
  } catch(e){res.status(500).json({error:e.message})}
});

// ── Acteur zoeken en detail ──
app.get("/api/person/search", auth, async (req,res) => {
  try {
    const{query,page=1}=req.query; if(!query) return res.status(400).json({error:"Query"});
    const d=await tmdbFetch("/search/person",{query,page});
    res.json(d);
  } catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/person/:id", auth, async (req,res) => {
  try {
    const d=await tmdbFetch(`/person/${req.params.id}`,{append_to_response:"combined_credits"});
    res.json(d);
  } catch(e){res.status(500).json({error:e.message})}
});

// ── Aankomende films ──
app.get("/api/upcoming", auth, async (req,res) => {
  try {
    const{page=1}=req.query;
    const d=await tmdbFetch("/movie/upcoming",{page,region:"NL"});
    res.json(d);
  } catch(e){res.status(500).json({error:e.message})}
});

// ── Requests ──
app.post("/api/requests", auth, async (req,res) => {
  try {
    const{tmdb_id,media_type,title,poster_path,overview,genre_ids,seasons}=req.body;
    if(!tmdb_id||!media_type||!title) return res.status(400).json({error:"Velden ontbreken"});
    const existing=db.prepare("SELECT * FROM requests WHERE tmdb_id=? AND media_type=?").get(tmdb_id,media_type);
    if(existing) return res.status(409).json({error:"Al aangevraagd",request:existing});

    const genreStr = Array.isArray(genre_ids) ? genre_ids.join(",") : (genre_ids||"");
    const seasonStr = Array.isArray(seasons) ? seasons.join(",") : (seasons||"");

    const result=db.prepare("INSERT INTO requests (tmdb_id,media_type,title,poster_path,overview,genre_ids,seasons,status,status_message,requested_by) VALUES (?,?,?,?,?,?,?,'sending','Wordt verstuurd…',?)").run(tmdb_id,media_type,title,poster_path,overview,genreStr,seasonStr,req.user.username);
    const requestId=result.lastInsertRowid;

    try {
      let sr;
      if(media_type==="movie") {
        if(!getSetting("radarr_url")||!getSetting("radarr_api_key")){db.prepare("UPDATE requests SET status='not_configured',status_message='Radarr niet geconfigureerd',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId);return res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId))}
        sr=await sendToRadarr(tmdb_id,title);
        db.prepare("UPDATE requests SET status=?,status_message=?,radarr_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status,sr.message,sr.radarr_id||null,requestId);
      } else {
        if(!getSetting("sonarr_url")||!getSetting("sonarr_api_key")){db.prepare("UPDATE requests SET status='not_configured',status_message='Sonarr niet geconfigureerd',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(requestId);return res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId))}
        const seasonNums = seasonStr ? seasonStr.split(",").map(Number).filter(n=>n>0) : [];
        sr=await sendToSonarr(tmdb_id,title,seasonNums);
        db.prepare("UPDATE requests SET status=?,status_message=?,sonarr_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status,sr.message,sr.sonarr_id||null,requestId);
      }
    } catch(e){db.prepare("UPDATE requests SET status='failed',status_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(e.message.slice(0,500),requestId)}
    res.status(201).json(db.prepare("SELECT * FROM requests WHERE id=?").get(requestId));
  } catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/requests/:id/retry", auth, async (req,res) => {
  try{const r=db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);if(!r)return res.status(404).json({error:"Niet gevonden"});
    db.prepare("UPDATE requests SET status='sending',status_message='Opnieuw…',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(r.id);
    try{let sr;if(r.media_type==="movie"){sr=await sendToRadarr(r.tmdb_id,r.title);db.prepare("UPDATE requests SET status=?,status_message=?,radarr_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status,sr.message,sr.radarr_id||null,r.id)}
    else{const sn=r.seasons?r.seasons.split(",").map(Number).filter(n=>n>0):[];sr=await sendToSonarr(r.tmdb_id,r.title,sn);db.prepare("UPDATE requests SET status=?,status_message=?,sonarr_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sr.status,sr.message,sr.sonarr_id||null,r.id)}}
    catch(e){db.prepare("UPDATE requests SET status='failed',status_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(e.message.slice(0,500),r.id)}
    res.json(db.prepare("SELECT * FROM requests WHERE id=?").get(r.id));
  }catch(e){res.status(500).json({error:e.message})}
});

app.delete("/api/requests/:id", auth, (req,res) => { try{db.prepare("DELETE FROM requests WHERE id=?").run(req.params.id);res.json({success:true})}catch(e){res.status(500).json({error:e.message})} });
app.get("/api/requests", auth, (_req,res) => { try{res.json(db.prepare("SELECT * FROM requests ORDER BY requested_at DESC").all())}catch(e){res.status(500).json({error:e.message})} });

app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0", ()=>{ console.log(`\n  MediaSeerr v1.3.0 — http://localhost:${PORT}\n`); });
