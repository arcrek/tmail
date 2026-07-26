import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'tmail.theme'

const THEME_COLORS: Record<ThemeMode, string> = {
  light: '#f6f7fb',
  dark: '#0e1015',
}

const SYSTEM_MEDIA: Record<ThemeMode, string> = {
  light: '(prefers-color-scheme: light)',
  dark: '(prefers-color-scheme: dark)',
}

function darkMediaQuery(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function systemMode(): ThemeMode {
  return darkMediaQuery().matches ? 'dark' : 'light'
}

/** Explicit stored preference, or null when the user hasn't overridden the system default. */
function readStored(): ThemeMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function writeStored(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Theme preference is a convenience; in-memory state still applies this session.
  }
}

/**
 * Keeps the two static <meta name="theme-color"> tags (declared in index.html with
 * data-theme-color="light|dark" and a matching prefers-color-scheme media query) in sync.
 * In system mode their native media queries already do the right thing, so we restore them.
 * With an explicit override we pin one meta "on" and the other "off" so the browser chrome
 * follows the user's choice instead of the OS setting.
 */
function syncThemeColorMeta(stored: ThemeMode | null): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-theme-color]')
  metas.forEach((meta) => {
    const mode = meta.dataset.themeColor
    if (mode !== 'light' && mode !== 'dark') return
    meta.content = THEME_COLORS[mode]
    meta.media = stored === null ? SYSTEM_MEDIA[mode] : mode === stored ? 'all' : 'not all'
  })
}

function applyTheme(stored: ThemeMode | null): void {
  const root = document.documentElement
  if (stored === null) delete root.dataset.theme
  else root.dataset.theme = stored
  syncThemeColorMeta(stored)
}

/**
 * Boots the theme system before the Vue app mounts. Must stay CSS-first (no inline <script>
 * is allowed under the strict CSP), so this only ever toggles the `data-theme` attribute and
 * dual dark-mode CSS blocks already do the painting - this just keeps `data-theme` and the
 * theme-color metas correct, including following the OS setting live while unset.
 */
export function initTheme(): void {
  applyTheme(readStored())
  darkMediaQuery().addEventListener('change', () => {
    if (readStored() === null) applyTheme(null)
  })
}

/** Reactive theme state for components (e.g. ThemeToggle). */
export function useTheme(): { resolved: ComputedRef<ThemeMode>; toggle: () => void } {
  const resolved = ref<ThemeMode>(readStored() ?? systemMode())

  function handleSystemChange(): void {
    if (readStored() === null) resolved.value = systemMode()
  }

  onMounted(() => darkMediaQuery().addEventListener('change', handleSystemChange))
  onBeforeUnmount(() => darkMediaQuery().removeEventListener('change', handleSystemChange))

  function toggle(): void {
    const next: ThemeMode = resolved.value === 'dark' ? 'light' : 'dark'
    writeStored(next)
    applyTheme(next)
    resolved.value = next
  }

  return { resolved: computed(() => resolved.value), toggle }
}
