<template>
  <div>
    <div v-if="loading" class="spinner"></div>
    <template v-else-if="person">
      <div class="person-header">
        <img class="person-portrait" :src="person.profile_path ? `https://image.tmdb.org/t/p/w342${person.profile_path}` : ''" alt="" @error="e=>e.target.style.display='none'" />
        <div class="person-bio">
          <h1>{{ person.name }}</h1>
          <div class="meta">{{ person.known_for_department }}{{ born ? ' · ' + born : '' }}{{ person.place_of_birth ? ' · ' + person.place_of_birth : '' }}</div>
          <div v-if="person.biography" class="bio-text">{{ person.biography.slice(0,600) }}{{ person.biography.length>600?'…':'' }}</div>
        </div>
      </div>
      <div class="section-title">Filmografie <span class="badge">{{ credits.length }}</span></div>
      <div class="media-grid">
        <MediaCard v-for="item in credits.slice(0, showAll ? credits.length : 40)" :key="item.id" :item="item" :type="item.media_type" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
      </div>
      <div v-if="credits.length > 40 && !showAll" class="load-more-wrap">
        <button class="btn-load-more" @click="showAll=true">Toon alles ({{ credits.length }})</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import axios from 'axios'
import MediaCard from '../Components/MediaCard.vue'

const props = defineProps(['id','statusMap'])
defineEmits(['open'])

const loading = ref(true); const person = ref(null); const credits = ref([]); const showAll = ref(false)
const born = ref('')

watch(() => props.id, load, { immediate: true })

async function load() {
  loading.value = true; showAll.value = false
  try {
    const { data } = await axios.get(`/person/${props.id}`)
    person.value = data
    born.value = data.birthday ? new Date(data.birthday).toLocaleDateString('nl-NL',{year:'numeric',month:'long',day:'numeric'}) : ''
    const all = [...(data.combined_credits?.cast||[]), ...(data.combined_credits?.crew||[]).filter(c=>c.job==='Director')]
    const seen = new Set()
    credits.value = all.filter(c => {
      if (seen.has(c.id) || !['movie','tv'].includes(c.media_type)) return false
      seen.add(c.id); return true
    }).sort((a,b)=>(b.vote_count||0)-(a.vote_count||0))
  } catch {}
  loading.value = false
}
</script>

<style scoped>
.person-header { display: flex; gap: 24px; margin-bottom: 28px }
.person-portrait { width: 180px; height: 270px; border-radius: var(--radius); object-fit: cover; flex-shrink: 0; background: var(--surface) }
.person-bio h1 { font-family: 'Outfit',sans-serif; font-weight: 900; font-size: 28px; margin-bottom: 4px }
.meta { color: var(--text-dim); font-size: 14px; margin-bottom: 12px }
.bio-text { font-size: 14px; line-height: 1.7; color: var(--text-dim); max-height: 200px; overflow-y: auto }
.section-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 24px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px }
.badge { font-size: 12px; background: var(--accent-glow); color: var(--accent); padding: 4px 10px; border-radius: 20px }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 20px }
.load-more-wrap { text-align: center; margin-top: 28px }
.btn-load-more { padding: 10px 32px; border-radius: 10px; font: 600 14px/1 'DM Sans',sans-serif; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; margin: 40px auto }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
