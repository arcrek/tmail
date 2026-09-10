import '@fontsource-variable/schibsted-grotesk'
import '@fontsource-variable/libre-franklin'
import '@fontsource-variable/jetbrains-mono'
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { initTheme } from './theme'
import { initLocale } from './i18n'

initTheme()
initLocale()
createApp(App).mount('#app')
