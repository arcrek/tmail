import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'tmail.theme'

const THEME_COLORS: Record<ThemeMode, string> = {
  light: '#f9f9ff',
  dark: '#111318',
}

const SYSTEM_MEDIA: Record<ThemeMode, string> = {
  light: '(prefers-color-scheme: light)',
  dark: '(prefers-color-scheme: dark)',
}

const themeListeners = new Set<(mode: ThemeMode) => void>()

function emitTheme(mode: ThemeMode): void {
  for (const listener of themeListeners) listener(mode)
}

function darkMediaQuery(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

/** Legacy MediaQueryList shape (Safari <=13.1 and old WebViews): only the deprecated methods. */
interface LegacyMediaQueryList {
  addListener?(listener: (event: MediaQueryListEvent) => void): void
  removeListener?(listener: (event: MediaQueryListEvent) => void): void
}

/**
 * Attaches a change listener, feature-detecting the modern EventTarget API and falling back to
 * the deprecated addListener/removeListener pair (Safari <=13.1, old WebViews). If neither is
 * available, does nothing rather than throwing - initTheme() must never crash before the app mounts.
 */
function listen(mq: MediaQueryList, handler: (event: MediaQueryListEvent) => void): () => void {
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }
  const legacy: LegacyMediaQueryList = mq
  if (typeof legacy.addListener === 'function') {
    legacy.addListener(handler)
    return () => legacy.removeListener?.(handler)
  }
  return () => {}
}

function systemMode(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
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

export function resolveCurrentTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    const explicit = document.documentElement.dataset.theme
    if (explicit === 'light' || explicit === 'dark') return explicit
  }
  return readStored() ?? systemMode()
}

/**
 * Boots the theme system before the React app mounts. Keeps `data-theme` and the
 * theme-color metas accurate and tracks OS changes while unset.
 */
export function initTheme(): void {
  applyTheme(readStored())
  listen(darkMediaQuery(), () => {
    if (readStored() === null) {
      applyTheme(null)
      emitTheme(systemMode())
    }
  })
}

/** Reactive theme hook for components (e.g. App ThemeProvider and ThemeToggle). */
export function useTheme(): { resolved: ThemeMode; toggle: () => void } {
  const [resolved, setResolved] = useState<ThemeMode>(() => readStored() ?? systemMode())

  useEffect(() => {
    const handleSystemChange = () => {
      if (readStored() === null) {
        const next = systemMode()
        setResolved(next)
      }
    }
    const stopMedia = listen(darkMediaQuery(), handleSystemChange)
    const onEmit = (mode: ThemeMode) => setResolved(mode)
    themeListeners.add(onEmit)

    // Also observe external mutations to <html data-theme="..."> (e.g. Playwright dark/light checks).
    let observer: MutationObserver | undefined
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(() => {
        const attr = document.documentElement.dataset.theme
        if (attr === 'light' || attr === 'dark') setResolved(attr)
        else setResolved(readStored() ?? systemMode())
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    }

    return () => {
      stopMedia()
      themeListeners.delete(onEmit)
      observer?.disconnect()
    }
  }, [])

  function toggle(): void {
    const next: ThemeMode = resolved === 'dark' ? 'light' : 'dark'
    writeStored(next)
    applyTheme(next)
    setResolved(next)
    emitTheme(next)
  }

  return { resolved, toggle }
}
