import { createApp } from 'vue'
import App from './App.vue'
import axios from 'axios'
import './app.css'

// Axios defaults
axios.defaults.baseURL = '/api'
axios.defaults.headers.common['Accept'] = 'application/json'

// Token uit localStorage meesturen
const token = localStorage.getItem('ms_token')
if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

// Auto-redirect bij 401
axios.interceptors.response.use(
    r => r,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('ms_token')
            delete axios.defaults.headers.common['Authorization']
            window.location.reload()
        }
        return Promise.reject(err)
    }
)

createApp(App).mount('#app')
