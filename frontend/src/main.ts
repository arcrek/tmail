import '@fontsource-variable/roboto-flex'
import '@fontsource-variable/roboto-mono'
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { initTheme } from './theme'
import { initLocale } from './i18n'

initTheme()
initLocale()
createApp(App).mount('#app')
