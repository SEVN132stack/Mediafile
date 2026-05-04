<template>
  <div>
    <div v-if="loading" class="spinner"></div>
    <template v-else>
      <template v-if="persons.length">
        <div class="section-title">🎭 Acteurs</div>
        <div class="media-grid">
          <div v-for="p in persons" :key="p.id" class="person-card" @click="$emit('open-person', p.id)">
            <img class="person-photo" :src="p.profile_path ? `https://image.tmdb.org/t/p/w342${p.profile_path}` : ''" :alt="p.name" loading="lazy" @error="e=>e.target.style.display='none'" />
            <div class="person-body"><div class="person-name">{{ p.name }}</div><div class="person-dept">{{ p.known_for_department }}</div></div>
          </div>
        </div>
      </template>
      <template v-if="media.length">
        <div class="section-title" :style="persons.length?'margin-top:32px':''">🎬 Films & Series <span class="badge">{{ media.length }}</span></div>
        <div class="media-grid">
          <MediaCard v-for="item in media" :key="item.id" :item="item" :type="item.media_type" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
        </div>
      </template>
      <div v-if="!persons.length && !media.length" class="empty-state"><p>Geen resultaten gevonden.</p></div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'
import MediaCard from '../Components/MediaCard.vue'

const props = defineProps(['query','statusMap'])
defineEmits(['open','open-person'])

const loading = ref(false); const media = ref([]); const persons = ref([])

watch(() => props.query, search, { immediate: true })

async function search() {
  if (!props.query) return
  loading.value = true; media.value = []; persons.value = []
  try {
    const { data } = await axios.get('/search', { params: { query: props.query } })
    media.value   = (data.results||[]).filter(r=>r.media_type==='movie'||r.media_type==='tv')
    persons.value = (data.results||[]).filter(r=>r.media_type==='person')
  } catch {}
  loading.value = false
}
</script>

<style scoped>
.section-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 24px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px }
.badge { font-size: 12px; background: var(--accent-glow); color: var(--accent); padding: 4px 10px; border-radius: 20px }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 20px }
.person-card { background: var(--surface); border-radius: var(--radius); overflow: hidden; cursor: pointer; border: 1px solid transparent; transition: transform .25s,border-color .25s }
.person-card:hover { transform: translateY(-4px); border-color: var(--amber) }
.person-photo { aspect-ratio: 2/3; width: 100%; object-fit: cover; display: block; background: var(--surface-hover) }
.person-body { padding: 12px }
.person-name { font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.person-dept { font-size: 12px; color: var(--text-dim); margin-top: 2px }
.empty-state { text-align: center; padding: 80px 20px; color: var(--text-dim) }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; margin: 40px auto }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
