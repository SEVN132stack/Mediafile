<template>
  <div class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-logo">MediaSeerr</div>
      <div class="auth-subtitle">{{ isSetup ? 'Maak een admin account aan' : 'Log in om verder te gaan' }}</div>
      <div v-if="error" class="auth-error">{{ error }}</div>
      <div v-if="isSetup" class="auth-field">
        <label>Naam</label>
        <input v-model="form.display_name" placeholder="Jouw naam" />
      </div>
      <div class="auth-field">
        <label>Gebruikersnaam</label>
        <input v-model="form.username" placeholder="Gebruikersnaam" @keydown.enter="submit" />
      </div>
      <div class="auth-field">
        <label>Wachtwoord</label>
        <input v-model="form.password" type="password" placeholder="Wachtwoord" @keydown.enter="submit" />
      </div>
      <button class="auth-btn" :disabled="loading" @click="submit">
        {{ loading ? '…' : (isSetup ? 'Account aanmaken' : 'Inloggen') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const emit    = defineEmits(['login'])
const isSetup = ref(false)
const loading = ref(false)
const error   = ref('')
const form    = ref({ username: '', password: '', display_name: '' })

onMounted(async () => {
  const { data } = await axios.get('/auth/status')
  isSetup.value = !data.has_users
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const endpoint = isSetup.value ? '/auth/setup' : '/auth/login'
    const { data } = await axios.post(endpoint, form.value)
    localStorage.setItem('ms_token', data.token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
    emit('login', data.user)
  } catch (e) {
    error.value = e.response?.data?.message || e.response?.data?.error || 'Fout opgetreden'
  }
  loading.value = false
}
</script>

<style scoped>
.auth-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px }
.auth-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 40px; width: 100%; max-width: 400px; box-shadow: 0 24px 48px rgba(0,0,0,.3) }
.auth-logo { font-family: 'Outfit',sans-serif; font-weight: 900; font-size: 28px; text-align: center; margin-bottom: 8px; background: linear-gradient(135deg,var(--accent),#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent }
.auth-subtitle { text-align: center; color: var(--text-dim); font-size: 14px; margin-bottom: 28px }
.auth-error { background: var(--red-glow); color: var(--red); padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px }
.auth-field { margin-bottom: 16px }
.auth-field label { display: block; font-size: 13px; font-weight: 500; color: var(--text-dim); margin-bottom: 6px }
.auth-field input { width: 100%; padding: 12px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 15px; outline: none }
.auth-field input:focus { border-color: var(--accent) }
.auth-btn { width: 100%; padding: 14px; border-radius: 10px; font: 700 15px/1 'DM Sans',sans-serif; border: none; cursor: pointer; background: var(--accent); color: #fff; margin-top: 8px }
.auth-btn:hover { filter: brightness(1.15) }
.auth-btn:disabled { opacity: .5 }
</style>
