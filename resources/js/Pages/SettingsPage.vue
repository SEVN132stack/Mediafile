<template>
  <div class="settings-page">
    <div class="section-title">⚙ Instellingen</div>

    <!-- Users -->
    <div class="settings-group">
      <div class="settings-group-title"><span class="icon">👥</span> Gebruikers</div>
      <div v-for="u in users" :key="u.id" class="user-row">
        <div class="avatar">{{ (u.display_name||u.username)[0].toUpperCase() }}</div>
        <div class="user-info"><strong>{{ u.display_name||u.username }}</strong><span>@{{ u.username }}</span></div>
        <span class="user-role" :class="`role-${u.role}`">{{ u.role }}</span>
        <button v-if="u.id !== user.id" class="btn-sm btn-danger" @click="deleteUser(u.id)">🗑</button>
      </div>
      <div class="add-user">
        <input v-model="newUser.username" placeholder="Gebruikersnaam" />
        <input v-model="newUser.password" type="password" placeholder="Wachtwoord" />
        <select v-model="newUser.role"><option value="user">Gebruiker</option><option value="admin">Admin</option></select>
        <button class="btn btn-primary btn-sm" @click="addUser">+</button>
      </div>
    </div>

    <!-- TMDB -->
    <div class="settings-group">
      <div class="settings-group-header">
        <div class="settings-group-title"><span class="icon">🎬</span> TMDB</div>
        <button class="btn-test" :class="tests.tmdb" @click="test('tmdb')">{{ testLabel('tmdb') }}</button>
      </div>
      <Field k="tmdb_api_key" label="API Key" :settings="settings" hint="<a href='https://www.themoviedb.org/settings/api' target='_blank'>themoviedb.org</a>" />
    </div>

    <!-- Radarr -->
    <div class="settings-group">
      <div class="settings-group-header">
        <div class="settings-group-title"><span class="icon">🟧</span> Radarr</div>
        <button class="btn-test" :class="tests.radarr" @click="test('radarr')">{{ testLabel('radarr') }}</button>
      </div>
      <Field k="radarr_url" label="URL" :settings="settings" />
      <Field k="radarr_api_key" label="API Key" :settings="settings" />
      <div class="form-row">
        <label class="form-label">Quality Profile</label>
        <select v-if="radarrProfiles.length" class="form-select" v-model="settings.radarr_quality_profile">
          <option value="">Standaard</option>
          <option v-for="p in radarrProfiles" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
        </select>
        <input v-else class="form-input" v-model="settings.radarr_quality_profile" placeholder="Quality ID" />
      </div>
      <div class="form-row">
        <label class="form-label">Root Folder</label>
        <select v-if="radarrFolders.length" class="form-select" v-model="settings.radarr_root_folder">
          <option value="">Standaard</option>
          <option v-for="f in radarrFolders" :key="f.path" :value="f.path">{{ f.path }}</option>
        </select>
        <input v-else class="form-input" v-model="settings.radarr_root_folder" placeholder="Root folder pad" />
      </div>
    </div>

    <!-- Sonarr -->
    <div class="settings-group">
      <div class="settings-group-header">
        <div class="settings-group-title"><span class="icon">🟦</span> Sonarr</div>
        <button class="btn-test" :class="tests.sonarr" @click="test('sonarr')">{{ testLabel('sonarr') }}</button>
      </div>
      <Field k="sonarr_url" label="URL" :settings="settings" />
      <Field k="sonarr_api_key" label="API Key" :settings="settings" />
      <div class="form-row">
        <label class="form-label">Quality Profile</label>
        <select v-if="sonarrProfiles.length" class="form-select" v-model="settings.sonarr_quality_profile">
          <option value="">Standaard</option>
          <option v-for="p in sonarrProfiles" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
        </select>
        <input v-else class="form-input" v-model="settings.sonarr_quality_profile" placeholder="Quality ID" />
      </div>
      <div class="form-row">
        <label class="form-label">Root Folder</label>
        <select v-if="sonarrFolders.length" class="form-select" v-model="settings.sonarr_root_folder">
          <option value="">Standaard</option>
          <option v-for="f in sonarrFolders" :key="f.path" :value="f.path">{{ f.path }}</option>
        </select>
        <input v-else class="form-input" v-model="settings.sonarr_root_folder" placeholder="Root folder pad" />
      </div>
    </div>

    <!-- Jellyfin -->
    <div class="settings-group">
      <div class="settings-group-header">
        <div class="settings-group-title"><span class="icon">🟦</span> Jellyfin</div>
        <button class="btn-test" :class="tests.jellyfin" @click="test('jellyfin')">{{ testLabel('jellyfin') }}</button>
      </div>
      <Field k="jellyfin_url" label="URL" :settings="settings" />
      <Field k="jellyfin_api_key" label="API Key" :settings="settings" />
    </div>

    <!-- Plex -->
    <div class="settings-group">
      <div class="settings-group-header">
        <div class="settings-group-title"><span class="icon">🟨</span> Plex</div>
        <button class="btn-test" :class="tests.plex" @click="test('plex')">{{ testLabel('plex') }}</button>
      </div>
      <Field k="plex_url" label="URL" :settings="settings" />
      <Field k="plex_token" label="Token" :settings="settings" />
    </div>

    <div class="settings-footer">
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '⏳ Opslaan…' : '💾 Opslaan' }}</button>
      <span v-if="saveMsg" :class="['save-status', saveOk?'ok':'err']">{{ saveMsg }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, defineComponent, h } from 'vue'
import axios from 'axios'

const props = defineProps(['user'])

// Inline Field component
const Field = defineComponent({
  props: ['k','label','settings','hint'],
  setup(p) {
    return () => h('div', { class: 'form-row' }, [
      h('label', { class: 'form-label' }, p.label),
      h('input', { class: 'form-input', type: 'text', value: p.settings[p.k]||'', onInput: e => { p.settings[p.k] = e.target.value } }),
      p.hint ? h('div', { class: 'form-hint', innerHTML: p.hint }) : null,
    ])
  }
})

const settings = ref({})
const users = ref([])
const tests = ref({})
const saving = ref(false); const saveMsg = ref(''); const saveOk = ref(true)
const radarrProfiles = ref([]); const radarrFolders = ref([])
const sonarrProfiles = ref([]); const sonarrFolders = ref([])
const newUser = ref({ username: '', password: '', role: 'user' })

onMounted(async () => {
  try { const { data } = await axios.get('/settings'); settings.value = data } catch {}
  try { const { data } = await axios.get('/users'); users.value = data } catch {}
  try { const { data } = await axios.get('/settings/radarr-profiles'); if (!data.error) { radarrProfiles.value = data.profiles||[]; radarrFolders.value = data.folders||[] } } catch {}
  try { const { data } = await axios.get('/settings/sonarr-profiles'); if (!data.error) { sonarrProfiles.value = data.profiles||[]; sonarrFolders.value = data.folders||[] } } catch {}
})

async function save() {
  saving.value = true
  try {
    await axios.put('/settings', settings.value)
    saveMsg.value = '✓ Opgeslagen'; saveOk.value = true
  } catch { saveMsg.value = '✗ Fout'; saveOk.value = false }
  saving.value = false
  setTimeout(() => saveMsg.value = '', 3000)
}

async function test(svc) {
  tests.value[svc] = 'testing'
  await axios.put('/settings', settings.value).catch(()=>{})
  try {
    const { data } = await axios.post('/settings/test', { service: svc })
    tests.value[svc] = data.ok ? 'success' : 'fail'
  } catch { tests.value[svc] = 'fail' }
  setTimeout(() => { tests.value[svc] = '' }, 4000)
}

function testLabel(svc) { return { testing:'…', success:'✓', fail:'✗' }[tests.value[svc]] || 'Test' }

async function addUser() {
  if (!newUser.value.username || !newUser.value.password) { alert('Vul in'); return }
  try { await axios.post('/users', newUser.value); const { data } = await axios.get('/users'); users.value = data; newUser.value = { username:'', password:'', role:'user' } } catch (e) { alert(e.response?.data?.message||'Fout') }
}

async function deleteUser(id) {
  if (!confirm('Verwijderen?')) return
  try { await axios.delete(`/users/${id}`); const { data } = await axios.get('/users'); users.value = data } catch {}
}
</script>

<style scoped>
.settings-page { max-width: 720px }
.section-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 24px; margin-bottom: 20px }
.settings-group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; margin-bottom: 20px }
.settings-group-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px }
.settings-group-title { font-family: 'Outfit',sans-serif; font-weight: 700; font-size: 18px; display: flex; align-items: center; gap: 10px; margin-bottom: 18px }
.icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: var(--surface-hover) }
.form-row { margin-bottom: 14px }
.form-label { display: block; font-size: 13px; font-weight: 500; color: var(--text-dim); margin-bottom: 6px }
.form-input, .form-select { width: 100%; padding: 10px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; outline: none }
.form-input:focus, .form-select:focus { border-color: var(--accent) }
.form-hint { font-size: 12px; color: var(--text-dim); margin-top: 4px }
.btn-test { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); background: var(--surface-hover); color: var(--text); cursor: pointer }
.btn-test.success { border-color: var(--green); color: var(--green); background: var(--green-glow) }
.btn-test.fail { border-color: var(--red); color: var(--red); background: var(--red-glow) }
.btn-test.testing { opacity: .5 }
.user-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border) }
.user-row:last-of-type { border-bottom: none }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--accent-glow); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--accent); font-size: 14px }
.user-info { flex: 1 }
.user-info strong { font-size: 14px }
.user-info span { font-size: 12px; color: var(--text-dim); margin-left: 8px }
.user-role { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 600 }
.role-admin { background: var(--accent-glow); color: var(--accent) }
.role-user { background: var(--surface-hover); color: var(--text-dim) }
.add-user { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap }
.add-user input, .add-user select { padding: 8px 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 13px; outline: none; flex: 1 }
.settings-footer { display: flex; gap: 12px; align-items: center; margin-top: 8px }
.save-status { font-size: 13px; font-weight: 500 }
.save-status.ok { color: var(--green) }
.save-status.err { color: var(--red) }
.btn { padding: 10px 24px; border-radius: 10px; font: 600 14px/1 'DM Sans',sans-serif; border: none; cursor: pointer }
.btn-primary { background: var(--accent); color: #fff }
.btn-primary:hover { filter: brightness(1.15) }
.btn-sm { padding: 6px 14px; font-size: 12px; border-radius: 8px; cursor: pointer; border: none }
.btn-danger { background: var(--red-glow); color: var(--red); border: 1px solid rgba(239,68,68,.3) }
</style>
