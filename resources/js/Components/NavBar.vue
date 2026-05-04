<template>
  <nav>
    <div class="logo">MediaSeerr</div>
    <div class="nav-links">
      <button v-for="link in links" :key="link.page" :class="{active: page===link.page}" @click="$emit('navigate', link.page)">{{ link.label }}</button>
      <button v-if="isAdmin" :class="{active: page==='settings'}" @click="$emit('navigate','settings')">⚙</button>
    </div>
    <div class="search-wrapper">
      <svg fill="none" viewBox="0 0 24 24" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input v-model="q" type="text" placeholder="Zoek films, series of acteurs…" @input="onInput" />
    </div>
    <div class="nav-user">
      <div class="avatar">{{ user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase() }}</div>
      <span class="uname">{{ user.display_name || user.username }}</span>
      <button class="btn-logout" @click="$emit('logout')">Uit</button>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed } from 'vue'
const props = defineProps(['user','page'])
const emit  = defineEmits(['navigate','logout','search'])

const q = ref('')
let timeout = null

const isAdmin = computed(() => props.user?.role === 'admin')

const links = [
  { page: 'discover', label: 'Ontdekken' },
  { page: 'movies',   label: '🎬 Films' },
  { page: 'tv',       label: '📺 Series' },
  { page: 'upcoming', label: '🗓 Binnenkort' },
  { page: 'requests', label: 'Verzoeken' },
]

function onInput() {
  clearTimeout(timeout)
  timeout = setTimeout(() => emit('search', q.value.trim()), 400)
}
</script>

<style scoped>
nav { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 16px; padding: 0 32px; height: 64px; background: rgba(11,14,23,.85); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border) }
.logo { font-family: 'Outfit',sans-serif; font-weight: 900; font-size: 22px; background: linear-gradient(135deg,var(--accent),#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -.5px; flex-shrink: 0 }
.nav-links { display: flex; gap: 4px; margin-left: 24px }
.nav-links button { background: none; border: none; color: var(--text-dim); font: 500 14px/1 'DM Sans',sans-serif; padding: 8px 16px; border-radius: 8px; cursor: pointer }
.nav-links button:hover,.nav-links button.active { color: var(--text); background: var(--surface) }
.search-wrapper { margin-left: auto; position: relative; width: 280px }
.search-wrapper input { width: 100%; padding: 10px 16px 10px 40px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 14px; outline: none }
.search-wrapper input:focus { border-color: var(--accent) }
.search-wrapper svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; stroke: var(--text-dim) }
.nav-user { display: flex; align-items: center; gap: 10px; flex-shrink: 0 }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-glow); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: var(--accent) }
.uname { font-size: 13px; color: var(--text-dim); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.btn-logout { background: none; border: 1px solid var(--border); color: var(--text-dim); font: 500 12px/1 'DM Sans',sans-serif; padding: 6px 12px; border-radius: 6px; cursor: pointer }
.btn-logout:hover { border-color: var(--red); color: var(--red) }
</style>
