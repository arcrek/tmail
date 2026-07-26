// @vitest-environment jsdom

import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTheme, useTheme } from '../theme'

/** Minimal MediaQueryList stand-in with a controllable `matches` and a fake change event. */
class FakeMediaQueryList {
  matches: boolean
  private listeners = new Set<(event: { matches: boolean }) => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.delete(listener)
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  set(matches: boolean): void {
    this.matches = matches
    for (const listener of this.listeners) listener({ matches })
  }
}

function stubMatchMedia(initiallyDark: boolean): FakeMediaQueryList {
  const mediaQuery = new FakeMediaQueryList(initiallyDark)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery))
  return mediaQuery
}

/** index.html declares these two metas; jsdom starts with an empty <head>, so recreate them. */
function addThemeColorMetas(): void {
  for (const mode of ['light', 'dark'] as const) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.dataset.themeColor = mode
    meta.content = mode === 'light' ? '#f6f7fb' : '#0e1015'
    meta.media = `(prefers-color-scheme: ${mode})`
    document.head.append(meta)
  }
}

function metaFor(mode: 'light' | 'dark'): HTMLMetaElement {
  const meta = document.querySelector<HTMLMetaElement>(`meta[data-theme-color="${mode}"]`)
  if (!meta) throw new Error(`missing ${mode} theme-color meta`)
  return meta
}

function mountUseTheme() {
  let api!: ReturnType<typeof useTheme>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTheme()
        return () => h('div')
      },
    }),
  )
  return { wrapper, api }
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    document.head.innerHTML = ''
    addThemeColorMetas()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initTheme', () => {
    it('leaves data-theme unset and follows the OS default when nothing is stored', () => {
      stubMatchMedia(true)
      initTheme()
      expect(document.documentElement.dataset.theme).toBeUndefined()
    })

    it('applies an explicit stored theme regardless of the OS preference', () => {
      localStorage.setItem('tmail.theme', 'dark')
      stubMatchMedia(false)
      initTheme()
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    it('restores an explicit light choice across a simulated reload', () => {
      localStorage.setItem('tmail.theme', 'light')
      stubMatchMedia(true)
      initTheme()
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('ignores a corrupted storage value and falls back to system mode', () => {
      localStorage.setItem('tmail.theme', 'sepia')
      stubMatchMedia(true)
      initTheme()
      expect(document.documentElement.dataset.theme).toBeUndefined()
    })

    it('syncs theme-color metas to pin the explicit choice and free the other one', () => {
      localStorage.setItem('tmail.theme', 'dark')
      stubMatchMedia(false)
      initTheme()
      expect(metaFor('dark').media).toBe('all')
      expect(metaFor('light').media).toBe('not all')
    })

    it('leaves theme-color metas on their native media queries in system mode', () => {
      stubMatchMedia(true)
      initTheme()
      expect(metaFor('light').media).toBe('(prefers-color-scheme: light)')
      expect(metaFor('dark').media).toBe('(prefers-color-scheme: dark)')
    })
  })

  describe('useTheme', () => {
    it('resolves to the OS preference when nothing is stored', () => {
      stubMatchMedia(true)
      const { wrapper, api } = mountUseTheme()
      expect(api.resolved.value).toBe('dark')
      wrapper.unmount()
    })

    it('resolves to the stored preference over the OS default', () => {
      localStorage.setItem('tmail.theme', 'light')
      stubMatchMedia(true)
      const { wrapper, api } = mountUseTheme()
      expect(api.resolved.value).toBe('light')
      wrapper.unmount()
    })

    it('follows a live OS preference change while in system mode', () => {
      const mediaQuery = stubMatchMedia(false)
      const { wrapper, api } = mountUseTheme()
      expect(api.resolved.value).toBe('light')

      mediaQuery.set(true)
      expect(api.resolved.value).toBe('dark')
      wrapper.unmount()
    })

    it('ignores OS preference changes once the user has an explicit choice', () => {
      localStorage.setItem('tmail.theme', 'light')
      const mediaQuery = stubMatchMedia(false)
      const { wrapper, api } = mountUseTheme()
      expect(api.resolved.value).toBe('light')

      mediaQuery.set(true)
      expect(api.resolved.value).toBe('light')
      wrapper.unmount()
    })

    it('toggle() persists the explicit opposite and updates the DOM immediately', () => {
      stubMatchMedia(false)
      const { wrapper, api } = mountUseTheme()
      expect(api.resolved.value).toBe('light')

      api.toggle()

      expect(api.resolved.value).toBe('dark')
      expect(localStorage.getItem('tmail.theme')).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
      wrapper.unmount()
    })

    it('toggle() sticks across a simulated reload even against the OS default', () => {
      stubMatchMedia(true)
      const { wrapper, api } = mountUseTheme()
      expect(api.resolved.value).toBe('dark')

      api.toggle()
      expect(api.resolved.value).toBe('light')
      wrapper.unmount()

      // Simulate a fresh page load with the OS still set to dark.
      initTheme()
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('stops listening for OS preference changes once unmounted', () => {
      const mediaQuery = stubMatchMedia(false)
      const { wrapper, api } = mountUseTheme()
      expect(mediaQuery.listenerCount).toBe(1)

      wrapper.unmount()
      mediaQuery.set(true)
      expect(api.resolved.value).toBe('light')
      expect(mediaQuery.listenerCount).toBe(0)
    })
  })
})
