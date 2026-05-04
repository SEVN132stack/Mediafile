<template>
  <div>
    <div class="section-title">🗓 Binnenkort in de Bioscoop</div>
    <div v-if="loading" class="spinner"></div>
    <div v-else class="media-grid">
      <MediaCard v-for="item in items" :key="item.id" :item="{...item,media_type:'movie'}" type="movie" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
    </div>
    <div v-if="hasMore" class="load-more-wrap">
      <button class="btn-load-more" :disabled="loadingMore" @click="loadMore">{{ loadingMore?'…':'Meer laden' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import MediaCard from '../Components/MediaCard.vue'

defineProps(['statusMap'])
defineEmits(['open'])

const items = ref([]); const loading = ref(true); const loadingMore = ref(false); const hasMore = ref(false); let page = 1; let total = 1

onMounted(async () => {
  try { const { data } = await axios.get('/upcoming?page=1'); items.value = data.results||[]; total = data.total_pages||1; hasMore.value = total > 1 } catch {}
  loading.value = false
})

async function loadMore() {
  loadingMore.value = true; page++
  try { const { data } = await axios.get(`/upcoming?page=${page}`); items.value.push(...(data.results||[])); hasMore.value = page < total } catch {}
  loadingMore.value = false
}
</script>

<style scoped>
.section-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 24px; margin-bottom: 20px }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 20px }
.load-more-wrap { text-align: center; margin-top: 28px }
.btn-load-more { padding: 10px 32px; border-radius: 10px; font: 600 14px/1 'DM Sans',sans-serif; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer }
.btn-load-more:hover { border-color: var(--accent); color: var(--accent) }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; margin: 40px auto }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
