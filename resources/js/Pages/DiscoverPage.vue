<template>
  <div>
    <div v-if="loading" class="spinner"></div>
    <template v-else>
      <MediaRow v-if="recs.length"    title="✨ Aanbevolen voor jou" :items="recs"    type="movie"  endpoint="/recommendations"      :status-map="statusMap" @open="$emit('open',$event[0],$event[1])" />
      <MediaRow                       title="🔥 Trending Films"      :items="trendM"  type="movie"  endpoint="/trending/movie"        :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
      <MediaRow                       title="🔥 Trending Series"     :items="trendT"  type="tv"     endpoint="/trending/tv"           :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
      <MediaRow                       title="🎬 Populair"            :items="popular" type="movie"  endpoint="/collection/movie/popular" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
      <MediaRow                       title="⭐ Best Beoordeeld"     :items="topRated" type="movie" endpoint="/collection/movie/top_rated" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import MediaRow from '../Components/MediaRow.vue'

defineProps(['statusMap'])
defineEmits(['open'])

const loading  = ref(true)
const recs     = ref([])
const trendM   = ref([])
const trendT   = ref([])
const popular  = ref([])
const topRated = ref([])

onMounted(async () => {
  try {
    const [tm, tt, pm, tr] = await Promise.all([
      axios.get('/trending/movie'),
      axios.get('/trending/tv'),
      axios.get('/collection/movie/popular'),
      axios.get('/collection/movie/top_rated'),
    ])
    trendM.value   = tm.data.results?.slice(0, 15) || []
    trendT.value   = tt.data.results?.slice(0, 15) || []
    popular.value  = pm.data.results?.slice(0, 15) || []
    topRated.value = tr.data.results?.slice(0, 15) || []

    try {
      const r = await axios.get('/recommendations')
      recs.value = r.data.results?.slice(0, 15) || []
    } catch {}
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; margin: 40px auto }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
