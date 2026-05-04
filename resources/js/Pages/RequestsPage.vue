<template>
  <div>
    <div class="section-title">Verzoeken <span class="badge">{{ requests.length }}</span></div>
    <div v-if="loading" class="spinner"></div>
    <div v-else-if="!requests.length" class="empty-state"><p>Nog geen verzoeken.</p></div>
    <div v-else class="req-list">
      <div v-for="r in requests" :key="r.id" class="req-card">
        <img class="req-thumb" :src="r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : ''" alt="" @error="e=>e.target.style.visibility='hidden'" />
        <div class="req-info">
          <div class="req-title">{{ r.title }}</div>
          <div class="req-meta">
            <span class="type-badge" :class="r.media_type">{{ r.media_type==='movie'?'Film':'Serie' }}</span>
            <span class="status" :class="`status-${r.status}`">{{ statusLabel(r.status) }}</span>
            <span class="req-user">👤 {{ r.requested_by }}</span>
            <span v-if="r.seasons" style="color:var(--accent)">S{{ r.seasons }}</span>
            <span>{{ new Date(r.created_at).toLocaleDateString('nl-NL') }}</span>
          </div>
          <div v-if="r.status_message" class="status-msg">{{ r.status_message }}</div>
        </div>
        <div class="req-actions">
          <button v-if="['failed','not_configured'].includes(r.status)" class="btn-sm btn-retry" @click="retry(r.id)">🔄</button>
          <button class="btn-sm btn-danger" @click="remove(r.id)">🗑</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const emit = defineEmits(['refresh'])
const requests = ref([]); const loading = ref(true)

onMounted(load)
async function load() {
  loading.value = true
  try { const { data } = await axios.get('/requests'); requests.value = data } catch {}
  loading.value = false
}

async function retry(id) {
  try { await axios.post(`/requests/${id}/retry`); await load(); emit('refresh') } catch {}
}
async function remove(id) {
  if (!confirm('Verwijderen?')) return
  try { await axios.delete(`/requests/${id}`); await load(); emit('refresh') } catch {}
}

function statusLabel(s) {
  return { sending:'⏳ Wordt verstuurd', sent:'📤 Verstuurd', downloading:'⬇️ Downloaden', available:'✅ Beschikbaar', failed:'❌ Mislukt', not_configured:'⚠️ Niet geconfigureerd' }[s] || s
}
</script>

<style scoped>
.section-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 24px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px }
.badge { font-size: 12px; font-weight: 500; background: var(--accent-glow); color: var(--accent); padding: 4px 10px; border-radius: 20px }
.req-list { display: flex; flex-direction: column; gap: 12px }
.req-card { display: flex; align-items: center; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px }
.req-card:hover { border-color: var(--accent) }
.req-thumb { width: 50px; height: 75px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: var(--surface-hover) }
.req-info { flex: 1; min-width: 0 }
.req-title { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.req-meta { font-size: 12px; color: var(--text-dim); margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.req-actions { display: flex; gap: 8px; flex-shrink: 0 }
.req-user { font-size: 11px; color: var(--text-dim); background: var(--surface-hover); padding: 2px 8px; border-radius: 4px }
.status-msg { font-size: 12px; color: var(--text-dim); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.type-badge { font-size: 10px; text-transform: uppercase; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--accent-glow); color: var(--accent) }
.type-badge.tv { background: var(--green-glow); color: var(--green) }
.status { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px }
.status-available { background: var(--green-glow); color: var(--green) }
.status-sent,.status-sending { background: var(--accent-glow); color: var(--accent) }
.status-downloading { background: var(--amber-glow); color: var(--amber) }
.status-failed,.status-not_configured { background: var(--red-glow); color: var(--red) }
.btn-sm { padding: 6px 14px; font-size: 12px; border-radius: 8px; cursor: pointer; border: none }
.btn-danger { background: var(--red-glow); color: var(--red); border: 1px solid rgba(239,68,68,.3) }
.btn-danger:hover { background: var(--red); color: #fff }
.btn-retry { background: var(--amber-glow); color: var(--amber); border: 1px solid rgba(245,158,11,.3) }
.empty-state { text-align: center; padding: 80px 20px; color: var(--text-dim) }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; margin: 40px auto }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
