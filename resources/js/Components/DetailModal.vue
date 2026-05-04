<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <button class="modal-close" @click="$emit('close')">✕</button>
      <div v-if="loading" class="spinner" style="margin:80px auto"></div>
      <template v-else-if="detail">
        <img v-if="detail.backdrop_path" class="modal-backdrop" :src="backdropUrl" />
        <div v-else style="height:100px"></div>

        <div class="modal-content">
          <!-- Poster + Info -->
          <div class="modal-top">
            <img v-if="detail.poster_path" class="modal-poster" :src="posterUrl" />
            <div class="modal-header-block">
              <div class="modal-title">{{ title }}</div>
              <div class="modal-subtitle">{{ year }} · {{ genres }} · ⭐ {{ rating }}<span v-if="detail.number_of_seasons"> · {{ detail.number_of_seasons }} seizoenen</span></div>
              <div v-if="releaseDate" class="release-badge">{{ isFuture ? '🗓 Verwacht' : '📅 Uitgebracht' }}: {{ releaseDateFormatted }}</div>
            </div>
          </div>

          <!-- Overview -->
          <div class="modal-overview">{{ detail.overview || 'Geen beschrijving.' }}</div>

          <!-- Cast -->
          <div v-if="cast.length" class="cast-section">
            <div class="cast-title">🎭 Cast</div>
            <div class="cast-scroll">
              <div v-for="c in cast" :key="c.id" class="cast-item" @click="$emit('open-person', c.id)">
                <img v-if="c.profile_path" class="cast-photo" :src="`https://image.tmdb.org/t/p/w185${c.profile_path}`" :alt="c.name" />
                <div v-else class="cast-photo-placeholder">👤</div>
                <div class="cast-name">{{ c.name }}</div>
                <div class="cast-char">{{ c.character }}</div>
              </div>
            </div>
          </div>

          <!-- Trailer -->
          <div v-if="videos.length" class="trailer-section">
            <button class="trailer-toggle" :class="{open: trailerOpen}" @click="toggleTrailer">
              {{ trailerOpen ? '⏹ Trailer sluiten' : `▶ Trailer bekijken (${videos.length} video${videos.length>1?'s':''})` }}
            </button>
            <div v-if="trailerOpen" class="trailer-container">
              <div v-if="videos.length>1" class="trailer-tabs">
                <button v-for="(v,i) in videos" :key="v.key" class="trailer-tab" :class="{active:activeVideo===i}" @click="activeVideo=i">{{ v.type }}{{ v.name&&v.name!==v.type?' — '+v.name.slice(0,30):'' }}</button>
              </div>
              <iframe :src="`https://www.youtube-nocookie.com/embed/${videos[activeVideo].key}?rel=0`" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>
            </div>
          </div>

          <!-- Season picker -->
          <div v-if="type==='tv' && seasons.length && !detail._request" class="season-picker">
            <div class="season-picker-title">
              <span>📺 Seizoenen</span>
              <button @click="toggleAllSeasons">Alles aan/uit</button>
            </div>
            <div class="season-grid">
              <div v-for="s in seasons" :key="s.season_number" class="season-chip" :class="{selected: selectedSeasons.has(s.season_number)}" @click="toggleSeason(s.season_number)">
                S{{ s.season_number }} <span style="font-weight:400;font-size:11px;opacity:.7">{{ s.episode_count }} afl.</span>
              </div>
            </div>
          </div>

          <!-- Collection picker -->
          <div v-if="collection && !detail._request" class="collection-section">
            <div class="collection-title">
              <span>🎬 {{ collection.name }}</span>
              <button @click="toggleAllCollection">Alles aan/uit</button>
            </div>
            <div class="collection-grid">
              <div v-for="p in collection.parts" :key="p.id"
                class="collection-chip"
                :class="{ selected: selectedCollection.has(p.id), already: statusMap[`movie-${p.id}`] }"
                @click="!statusMap[`movie-${p.id}`] && toggleCollectionPart(p.id)">
                {{ p.title }}{{ p.release_date ? ` (${p.release_date.slice(0,4)})` : '' }}
                {{ statusMap[`movie-${p.id}`] ? '✅' : '' }}
              </div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:8px" @click="requestCollection" :disabled="reqLoading">
              {{ reqLoading ? '⏳ Bezig…' : '🎬 Geselecteerde films aanvragen' }}
            </button>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <template v-if="detail._request">
              <span class="status" :class="`status-${detail._request.status}`">{{ statusLabel(detail._request.status) }}</span>
              <button v-if="['failed','not_configured'].includes(detail._request.status)" class="btn btn-retry" @click="retry">🔄</button>
            </template>
            <button v-else class="btn btn-primary" :disabled="reqLoading" @click="requestMedia">
              {{ reqLoading ? '⏳ Bezig…' : (isFuture ? '🗓 Vooruit aanvragen' : '🎬 Aanvragen') }}
            </button>
            <button class="btn btn-outline" @click="$emit('close')">Sluiten</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'

const props = defineProps(['type','id','statusMap'])
const emit  = defineEmits(['close','refresh','open-person'])

const TMDB_IMG = 'https://image.tmdb.org/t/p'

const loading    = ref(true)
const detail     = ref(null)
const trailerOpen  = ref(false)
const activeVideo  = ref(0)
const reqLoading   = ref(false)
const selectedSeasons    = ref(new Set())
const selectedCollection = ref(new Set())
const collection = ref(null)

onMounted(load)
watch(() => props.id, load)

async function load() {
  loading.value = true; detail.value = null; collection.value = null
  try {
    const { data } = await axios.get(`/details/${props.type}/${props.id}`)
    detail.value = data
    // Season defaults
    if (props.type === 'tv') {
      selectedSeasons.value = new Set(data.seasons?.filter(s=>s.season_number>0).map(s=>s.season_number) || [])
    }
    // Collection
    if (props.type === 'movie' && data.belongs_to_collection) {
      try {
        const { data: col } = await axios.get(`/tmdb-collection/${data.belongs_to_collection.id}`)
        const parts = (col.parts || []).sort((a,b) => (a.release_date||'').localeCompare(b.release_date||''))
        if (parts.length > 1) {
          collection.value = { name: col.name, parts }
          selectedCollection.value = new Set(parts.filter(p => !props.statusMap[`movie-${p.id}`]).map(p => p.id))
        }
      } catch {}
    }
  } catch {}
  loading.value = false
}

const title   = computed(() => detail.value?.title || detail.value?.name || '')
const year    = computed(() => (detail.value?.release_date || detail.value?.first_air_date || '').slice(0,4))
const genres  = computed(() => (detail.value?.genres || []).map(g=>g.name).join(', '))
const rating  = computed(() => detail.value?.vote_average?.toFixed(1) || '—')
const cast    = computed(() => (detail.value?.credits?.cast || []).slice(0,20))
const seasons = computed(() => (detail.value?.seasons || []).filter(s=>s.season_number>0))
const videos  = computed(() => {
  const all = (detail.value?.videos?.results || []).filter(v=>v.site==='YouTube'&&v.key)
  return [...all.filter(v=>v.type==='Trailer'), ...all.filter(v=>v.type==='Teaser'), ...all.filter(v=>v.type!=='Trailer'&&v.type!=='Teaser')]
})
const releaseDate = computed(() => detail.value?.release_date || detail.value?.first_air_date || '')
const isFuture    = computed(() => releaseDate.value && new Date(releaseDate.value) > new Date())
const releaseDateFormatted = computed(() => releaseDate.value ? new Date(releaseDate.value).toLocaleDateString('nl-NL',{year:'numeric',month:'long',day:'numeric'}) : '')
const backdropUrl = computed(() => `${TMDB_IMG}/w1280${detail.value?.backdrop_path}`)
const posterUrl   = computed(() => `${TMDB_IMG}/w342${detail.value?.poster_path}`)

function toggleTrailer() { trailerOpen.value = !trailerOpen.value }
function toggleSeason(n) { if (selectedSeasons.value.has(n)) selectedSeasons.value.delete(n); else selectedSeasons.value.add(n) }
function toggleAllSeasons() {
  const all = seasons.value.map(s=>s.season_number)
  const allSel = all.every(n=>selectedSeasons.value.has(n))
  selectedSeasons.value = allSel ? new Set() : new Set(all)
}
function toggleCollectionPart(id) { if (selectedCollection.value.has(id)) selectedCollection.value.delete(id); else selectedCollection.value.add(id) }
function toggleAllCollection() {
  const ids = collection.value?.parts.filter(p=>!props.statusMap[`movie-${p.id}`]).map(p=>p.id) || []
  const allSel = ids.every(id=>selectedCollection.value.has(id))
  selectedCollection.value = allSel ? new Set() : new Set(ids)
}

function statusLabel(s) {
  return { sending:'⏳ Wordt verstuurd', sent:'📤 Verstuurd', downloading:'⬇️ Downloaden', available:'✅ Beschikbaar', failed:'❌ Mislukt', not_configured:'⚠️ Niet geconfigureerd' }[s] || s
}

async function requestMedia() {
  reqLoading.value = true
  try {
    await axios.post('/requests', {
      tmdb_id: props.id, media_type: props.type, title: title.value,
      poster_path: detail.value?.poster_path || '',
      overview: detail.value?.overview || '',
      genre_ids: (detail.value?.genres||[]).map(g=>g.id),
      seasons: props.type === 'tv' ? [...selectedSeasons.value] : [],
    })
    await load()
    emit('refresh')
  } catch (e) { alert(e.response?.data?.error || 'Fout') }
  reqLoading.value = false
}

async function requestCollection() {
  reqLoading.value = true
  const parts = collection.value?.parts.filter(p => selectedCollection.value.has(p.id) && !props.statusMap[`movie-${p.id}`]) || []
  for (const film of parts) {
    try {
      await axios.post('/requests', { tmdb_id: film.id, media_type: 'movie', title: film.title, poster_path: film.poster_path||'', overview: film.overview||'', genre_ids: [], seasons: [] })
    } catch {}
  }
  emit('refresh')
  await load()
  reqLoading.value = false
}

async function retry() {
  reqLoading.value = true
  try { await axios.post(`/requests/${detail.value._request.id}/retry`); await load(); emit('refresh') } catch {}
  reqLoading.value = false
}
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center }
.modal { background: var(--surface); border-radius: 16px; width: 90%; max-width: 720px; max-height: 85vh; overflow-y: auto; position: relative; border: 1px solid var(--border); box-shadow: 0 32px 64px rgba(0,0,0,.5) }
.modal-close { position: absolute; top: 16px; right: 16px; z-index: 10; background: rgba(0,0,0,.5); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 20px; cursor: pointer }
.modal-backdrop { height: 220px; width: 100%; object-fit: cover; border-radius: 16px 16px 0 0; display: block; filter: brightness(.6) }
.modal-content { padding: 24px 28px 28px }
.modal-top { display: flex; gap: 20px; align-items: flex-end; margin-bottom: 20px; margin-top: -70px }
.modal-poster { width: 120px; height: 180px; border-radius: 10px; object-fit: cover; border: 3px solid var(--surface); flex-shrink: 0; box-shadow: 0 8px 24px rgba(0,0,0,.5); margin-top: -60px }
.modal-header-block { flex: 1; min-width: 0 }
.modal-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 26px; line-height: 1.2 }
.modal-subtitle { color: var(--text-dim); font-size: 14px; margin-top: 4px }
.release-badge { display: inline-flex; align-items: center; gap: 5px; background: var(--blue-glow); color: var(--blue); padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; margin-top: 10px }
.modal-overview { font-size: 14px; line-height: 1.7; color: var(--text-dim); margin-top: 20px }
.cast-section { margin-top: 20px }
.cast-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 16px; margin-bottom: 12px }
.cast-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px }
.cast-item { flex-shrink: 0; width: 90px; text-align: center; cursor: pointer }
.cast-item:hover { transform: translateY(-2px) }
.cast-photo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; margin: 0 auto 6px; display: block; border: 2px solid var(--border) }
.cast-photo-placeholder { width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 6px; background: var(--surface-hover); border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--text-dim) }
.cast-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cast-char { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.trailer-section { margin-top: 20px }
.trailer-toggle { display: flex; align-items: center; gap: 8px; background: none; border: 1px solid var(--border); color: var(--text); padding: 10px 18px; border-radius: 10px; font: 600 14px/1 'DM Sans',sans-serif; cursor: pointer; width: 100% }
.trailer-toggle:hover,.trailer-toggle.open { border-color: var(--red); color: var(--red) }
.trailer-container { border: 1px solid var(--border); border-top: none; border-radius: 0 0 10px 10px; overflow: hidden; background: #000 }
.trailer-container iframe { width: 100%; aspect-ratio: 16/9; display: block; border: none }
.trailer-tabs { display: flex; background: var(--bg); border-bottom: 1px solid var(--border); overflow-x: auto }
.trailer-tab { padding: 8px 16px; font: 500 12px/1 'DM Sans',sans-serif; color: var(--text-dim); background: none; border: none; cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent }
.trailer-tab.active { color: var(--red); border-bottom-color: var(--red) }
.season-picker { margin-top: 16px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px }
.season-picker-title { font-weight: 700; font-size: 14px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between }
.season-picker-title button { font-size: 12px; color: var(--accent); background: none; border: none; cursor: pointer }
.season-grid { display: flex; flex-wrap: wrap; gap: 8px }
.season-chip { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); cursor: pointer }
.season-chip.selected { background: var(--accent); border-color: var(--accent); color: #fff }
.collection-section { margin-top: 20px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px }
.collection-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between }
.collection-title button { font-size: 12px; color: var(--accent); background: none; border: none; cursor: pointer }
.collection-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px }
.collection-chip { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); cursor: pointer }
.collection-chip.selected { background: var(--accent); border-color: var(--accent); color: #fff }
.collection-chip.already { background: var(--green-glow); border-color: var(--green); color: var(--green); cursor: default }
.modal-actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center }
.btn { padding: 10px 24px; border-radius: 10px; font: 600 14px/1 'DM Sans',sans-serif; border: none; cursor: pointer }
.btn-primary { background: var(--accent); color: #fff }
.btn-primary:hover { filter: brightness(1.15) }
.btn-primary:disabled { background: var(--surface-hover); color: var(--text-dim); cursor: default }
.btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text) }
.btn-retry { background: var(--amber-glow); color: var(--amber); border: 1px solid rgba(245,158,11,.3); padding: 10px 14px; border-radius: 10px; cursor: pointer }
.status { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px }
.status-available { background: var(--green-glow); color: var(--green) }
.status-sent,.status-sending { background: var(--accent-glow); color: var(--accent) }
.status-downloading { background: var(--amber-glow); color: var(--amber) }
.status-failed,.status-not_configured { background: var(--red-glow); color: var(--red) }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
