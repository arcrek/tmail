import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const proxy = {
  target: 'http://127.0.0.1:8000',
}

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/domains': proxy,
      '/accounts': proxy,
      '/token': proxy,
      '/unlock': proxy,
      '/lock': proxy,
      '/me': proxy,
      '/messages': proxy,
      '/sources': proxy,
      '/site': proxy,
      '/admin/api': proxy,
      '/sandbox': proxy,
      '/message-sandbox': proxy,
    },
  },
  build: {
    outDir: 'dist',
    // Never inline assets as data: URIs: the production CSP is `default-src 'self'` with no
    // font-src override, so a data:font/... woff2 falls back to default-src and is blocked.
    // Keeping every asset a same-origin file (the default Vite behavior above 0 bytes would
    // otherwise inline small @fontsource woff2 subsets) is required, not just a size tradeoff.
    assetsInlineLimit: 0,
  },
})
