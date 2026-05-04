<template>
  <div>
    <LoginPage v-if="!user && !loading" @login="onLogin" />
    <div v-else-if="user" class="app-shell">
      <NavBar :user="user" :page="page" @navigate="navigate" @logout="logout" @search="onSearch" />
      <main class="main-content">
        <DiscoverPage   v-if="page==='discover'"  :status-map="statusMap" @open="openDetail" @load-status="loadStatusMap" />
        <BrowsePage     v-if="page==='movies'"    type="movie" :status-map="statusMap" @open="openDetail" />
        <BrowsePage     v-if="page==='tv'"        type="tv"    :status-map="statusMap" @open="openDetail" />
        <UpcomingPage   v-if="page==='upcoming'"  :status-map="statusMap" @open="openDetail" />
        <RequestsPage   v-if="page==='requests'"  @refresh="loadStatusMap" />
        <SettingsPage   v-if="page==='settings'"  :user="user" />
        <SearchPage     v-if="page==='search'"    :query="searchQuery" :status-map="statusMap" @open="openDetail" @open-person="openPerson" />
        <PersonPage     v-if="page==='person'"    :id="personId" :status-map="statusMap" @open="openDetail" />
      </main>
    </div>
    <DetailModal v-if="modal" :type="modal.type" :id="modal.id" :status-map="statusMap" @close="modal=null" @refresh="loadStatusMap" @open-person="openPerson" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import LoginPage   from './Pages/LoginPage.vue'
import NavBar      from './Components/NavBar.vue'
import DiscoverPage  from './Pages/DiscoverPage.vue'
import BrowsePage    from './Pages/BrowsePage.vue'
import UpcomingPage  from './Pages/UpcomingPage.vue'
import RequestsPage  from './Pages/RequestsPage.vue'
import SettingsPage  from './Pages/SettingsPage.vue'
import SearchPage    from './Pages/SearchPage.vue'
import PersonPage    from './Pages/PersonPage.vue'
import DetailModal   from './Components/DetailModal.vue'

const user       = ref(null)
const loading    = ref(true)
const page       = ref('discover')
const modal      = ref(null)
const statusMap  = ref({})
const searchQuery = ref('')
const personId   = ref(null)

onMounted(async () => {
  const token = localStorage.getItem('ms_token')
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    try {
      const { data } = await axios.get('/auth/me')
      user.value = data
      await loadStatusMap()
    } catch { localStorage.removeItem('ms_token') }
  }
  loading.value = false
})

async function loadStatusMap() {
  try { const { data } = await axios.get('/requests/statusmap'); statusMap.value = data } catch {}
}

function onLogin(u) { user.value = u; loadStatusMap() }

function logout() {
  axios.post('/auth/logout').catch(() => {})
  localStorage.removeItem('ms_token')
  delete axios.defaults.headers.common['Authorization']
  user.value = null
  page.value = 'discover'
}

function navigate(p) { page.value = p; modal.value = null }

function openDetail(type, id) { modal.value = { type, id } }

function openPerson(id) { personId.value = id; page.value = 'person' }

function onSearch(q) {
  searchQuery.value = q
  page.value = q ? 'search' : 'discover'
}
</script>

<style scoped>
.app-shell { display: flex; flex-direction: column; min-height: 100vh }
.main-content { max-width: 1200px; margin: 0 auto; padding: 32px 24px; width: 100% }
</style>
