<template>
  <div class="card" @click="$emit('open', type, item.id)">
    <div v-if="status" class="card-status" :class="`card-status-${status}`" :title="statusLabel">{{ statusIcon }}</div>
    <img class="card-poster" :src="posterUrl" :alt="title" loading="lazy" @error="e => e.target.style.display='none'" />
    <div class="card-body">
      <div class="card-title">{{ title }}</div>
      <div class="card-meta">
        <span class="type-badge" :class="type">{{ type === 'movie' ? 'Film' : 'Serie' }}</span>
        {{ year }}
        <span v-if="item.vote_average"> · ⭐{{ item.vote_average.toFixed(1) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ item: Object, type: String, statusMap: Object })
defineEmits(['open'])

const TMDB_IMG = 'https://image.tmdb.org/t/p'
const ST_ICONS = { available:'✅', sent:'📤', sending:'⏳', downloading:'⬇️', failed:'❌', not_configured:'⚠️' }
const ST_LABELS = { available:'Beschikbaar', sent:'Verstuurd', sending:'Wordt verstuurd', downloading:'Downloaden', failed:'Mislukt', not_configured:'Niet geconfigureerd' }

const title     = computed(() => props.item.title || props.item.name || '?')
const year      = computed(() => (props.item.release_date || props.item.first_air_date || '').slice(0,4))
const posterUrl = computed(() => props.item.poster_path ? `${TMDB_IMG}/w342${props.item.poster_path}` : '')
const status    = computed(() => props.statusMap?.[`${props.type}-${props.item.id}`])
const statusIcon  = computed(() => ST_ICONS[status.value] || '?')
const statusLabel = computed(() => ST_LABELS[status.value] || status.value)
</script>

<style scoped>
.card { background: var(--surface); border-radius: var(--radius); overflow: hidden; cursor: pointer; border: 1px solid transparent; transition: transform .25s,border-color .25s,box-shadow .25s; position: relative }
.card:hover { transform: translateY(-4px); border-color: var(--accent); box-shadow: 0 12px 32px rgba(0,0,0,.4) }
.card-poster { aspect-ratio: 2/3; width: 100%; object-fit: cover; display: block; background: var(--surface-hover) }
.card-body { padding: 12px }
.card-title { font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.card-meta { font-size: 12px; color: var(--text-dim); margin-top: 4px; display: flex; align-items: center; gap: 6px }
.type-badge { font-size: 10px; text-transform: uppercase; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--accent-glow); color: var(--accent) }
.type-badge.tv { background: var(--green-glow); color: var(--green) }
.card-status { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; z-index: 2; backdrop-filter: blur(4px); box-shadow: 0 2px 8px rgba(0,0,0,.4) }
.card-status-available { background: rgba(34,197,94,.9) }
.card-status-sent, .card-status-downloading { background: rgba(245,158,11,.9) }
.card-status-sending { background: rgba(59,130,246,.9) }
.card-status-failed, .card-status-not_configured { background: rgba(239,68,68,.9) }
</style>
