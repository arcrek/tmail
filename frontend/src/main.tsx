import '@fontsource-variable/roboto-flex'
import '@fontsource-variable/roboto-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CacheProvider } from '@emotion/react'
import { createMuiCache } from './emotionCache'
import App from './App'
import './styles.css'
import { initTheme } from './theme'
import { initLocale } from './i18n'

initTheme()
initLocale()

const muiCache = createMuiCache()
const rootEl = document.getElementById('app')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <CacheProvider value={muiCache}>
        <App />
      </CacheProvider>
    </StrictMode>,
  )
}
