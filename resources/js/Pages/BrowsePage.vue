<template>
  <div>
    <div class="section-title">{{ type === 'movie' ? '🎬 Films' : '📺 Series' }}</div>
    <div class="sub-nav">
      <button v-for="col in cols" :key="col.id" :class="{active: activeCol===col.id && !activeGenre}" @click="selectCol(col.id)">{{ col.label }}</button>
    </div>
    <div class="genre-bar">
      <span class="genre-chip" :class="{active: !activeGenre && !activeCol}" @click="selectGenre(null)">Alle genres</span>
      <span v-for="g in genres" :key="g.id" class="genre-chip" :class="{active: activeGenre===g.id}" @click="selectGenre(g.id)">{{ g.name }}</span>
    </div>
    <div v-if="loading" class="spinner"></div>
    <div v-else class="media-grid">
      <MediaCard v-for="item in items" :key="item.id" :item="item" :type="type" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
    </div>
    <div v-if="items.length >= 20" class="load-more-wrap">
      <button class="btn-load-more" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? '…' : 'Meer laden' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'
import MediaCard from '../Components/MediaCard.vue'

const props = defineProps(['type','statusMap'])
defineEmits(['open'])

const genres     = ref([])
const items      = ref([])
const loading    = ref(true)
const loadingMore = ref(false)
const activeGenre = ref(null)
const activeCol   = ref(null)
let page = 1

const movieCols = [{id:null,label:'Alles'},{id:'popular',label:'Populair'},{id:'top_rated',label:'Best Beoordeeld'},{id:'now_playing',label:'In Bioscoop'},{id:'upcoming',label:'Binnenkort'}]
const tvCols    = [{id:null,label:'Alles'},{id:'popular',label:'Populair'},{id:'top_rated',label:'Best Beoordeeld'},{id:'airing_today',label:'Vandaag'},{id:'on_the_air',label:'Nu Uitgezonden'}]
const cols = props.type === 'movie' ? movieCols : tvCols

onMounted(async () => {
  try { const { data } = await axios.get(`/genres/${props.type}`); genres.value = data.genres || [] } catch {}
  await fetch()
})

async function fetch() {
  loading.value = true; page = 1
  const ep = activeCol.value ? `/collection/${props.type}/${activeCol.value}` : `/discover/${props.type}${activeGenre.value ? '?genre='+activeGenre.value : ''}`
  try { const { data } = await axios.get(ep); items.value = data.results || [] } catch {}
  loading.value = false
}

async function loadMore() {
  loadingMore.value = true; page++
  const ep = activeCol.value ? `/collection/${props.type}/${activeCol.value}?page=${page}` : `/discover/${props.type}?page=${page}${activeGenre.value?'&genre='+activeGenre.value:''}`
  try { const { data } = await axios.get(ep); items.value.push(...(data.results||[])) } catch {}
  loadingMore.value = false
}

function selectGenre(id) { activeGenre.value = id; activeCol.value = null; fetch() }
function selectCol(id) { activeCol.value = id; activeGenre.value = null; fetch() }
</script>

<style scoped>
.section-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 24px; margin-bottom: 20px }
.sub-nav { display: flex; gap: 6px; margin-bottom: 24px; flex-wrap: wrap }
.sub-nav button { background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font: 500 13px/1 'DM Sans',sans-serif; padding: 8px 18px; border-radius: 20px; cursor: pointer }
.sub-nav button.active { background: var(--accent); border-color: var(--accent); color: #fff }
.genre-bar { display: flex; gap: 8px; margin-bottom: 24px; overflow-x: auto; padding-bottom: 8px }
.genre-chip { background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font: 500 12px/1 'DM Sans',sans-serif; padding: 7px 14px; border-radius: 16px; cursor: pointer; white-space: nowrap; flex-shrink: 0 }
.genre-chip.active { background: var(--accent-glow); border-color: var(--accent); color: var(--accent) }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 20px }
.load-more-wrap { text-align: center; margin-top: 28px }
.btn-load-more { padding: 10px 32px; border-radius: 10px; font: 600 14px/1 'DM Sans',sans-serif; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer }
.btn-load-more:hover { border-color: var(--accent); color: var(--accent) }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; margin: 40px auto }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
