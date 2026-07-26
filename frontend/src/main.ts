import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { initTheme } from './theme'

initTheme()
createApp(App).mount('#app')
