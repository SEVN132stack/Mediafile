<template>
  <div class="row-section">
    <div class="row-header"><span class="row-title">{{ title }}</span></div>
    <div class="media-row" ref="rowEl">
      <MediaCard v-for="item in items" :key="item.id" :item="item" :type="type||item.media_type" :status-map="statusMap" @open="(t,id)=>$emit('open',t,id)" />
      <div class="row-load-more-wrap">
        <button class="row-load-more-btn" :disabled="loading" @click="loadMore">{{ loading ? '…' : 'Meer →' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import axios from 'axios'
import MediaCard from './MediaCard.vue'

const props = defineProps({ title: String, items: Array, type: String, endpoint: String, statusMap: Object })
defineEmits(['open'])

const localItems = ref([...props.items])
const loading    = ref(false)
let page = 1

async function loadMore() {
  if (loading.value) return
  loading.value = true
  page++
  try {
    const { data } = await axios.get(`${props.endpoint}?page=${page}`)
    localItems.value.push(...(data.results || []).slice(0, 15))
  } catch {}
  loading.value = false
}
</script>

<style scoped>
.row-section { margin-top: 32px }
.row-section:first-child { margin-top: 0 }
.row-header { margin-bottom: 14px }
.row-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 20px }
.media-row { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scrollbar-width: thin; scrollbar-color: var(--border) transparent }
.media-row :deep(.card) { min-width: 170px; max-width: 170px; flex-shrink: 0 }
.row-load-more-wrap { display: flex; align-items: center; padding: 0 4px; flex-shrink: 0 }
.row-load-more-btn { padding: 10px 16px; border-radius: 10px; font: 600 13px/1 'DM Sans',sans-serif; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; white-space: nowrap }
.row-load-more-btn:hover { border-color: var(--accent); color: var(--accent) }
.row-load-more-btn:disabled { opacity: .5 }
</style>
