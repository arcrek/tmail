// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initTheme, useTheme } from '../theme'

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

class LegacyMediaQueryList {
  matches: boolean
  private listeners: Array<(event: { matches: boolean }) => void> = []

  constructor(matches: boolean) {
    this.matches = matches
  }

  addListener(listener: (event: { matches: boolean }) => void): void {
    this.listeners.push(listener)
  }

  removeListener(listener: (event: { matches: boolean }) => void): void {
    this.listeners = this.listeners.filter((value) => value !== listener)
  }

  get listenerCount(): number {
    return this.listeners.length
  }

  set(matches: boolean): void {
    this.matches = matches
    for (const listener of this.listeners) listener({ matches })
  }
}

function stubLegacyMatchMedia(initiallyDark: boolean): LegacyMediaQueryList {
  const mediaQuery = new LegacyMediaQueryList(initiallyDark)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery))
  return mediaQuery
}

function addThemeColorMetas(): void {
  for (const mode of ['light', 'dark'] as const) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.dataset.themeColor = mode
    meta.content = mode === 'light' ? '#f6f8fc' : '#131314'
    meta.media = `(prefers-color-scheme: ${mode})`
    document.head.append(meta)
  }
}

function metaFor(mode: 'light' | 'dark'): HTMLMetaElement {
  const meta = document.querySelector<HTMLMetaElement>(`meta[data-theme-color="${mode}"]`)
  if (!meta) throw new Error(`missing ${mode} theme-color meta`)
  return meta
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

    it('does not throw on a legacy MediaQueryList lacking addEventListener and still listens', () => {
      const mediaQuery = stubLegacyMatchMedia(true)
      expect(() => initTheme()).not.toThrow()
      expect(mediaQuery.listenerCount).toBe(1)
    })
  })

  describe('useTheme', () => {
    it('resolves to the OS preference when nothing is stored', () => {
      stubMatchMedia(true)
      const { result, unmount } = renderHook(() => useTheme())
      expect(result.current.resolved).toBe('dark')
      unmount()
    })

    it('resolves to the stored preference over the OS default', () => {
      localStorage.setItem('tmail.theme', 'light')
      stubMatchMedia(true)
      const { result, unmount } = renderHook(() => useTheme())
      expect(result.current.resolved).toBe('light')
      unmount()
    })

    it('follows a live OS preference change while in system mode', () => {
      const mediaQuery = stubMatchMedia(false)
      const { result, unmount } = renderHook(() => useTheme())
      expect(result.current.resolved).toBe('light')

      act(() => { mediaQuery.set(true) })
      expect(result.current.resolved).toBe('dark')
      unmount()
    })

    it('ignores OS preference changes once the user has an explicit choice', () => {
      localStorage.setItem('tmail.theme', 'light')
      const mediaQuery = stubMatchMedia(false)
      const { result, unmount } = renderHook(() => useTheme())
      expect(result.current.resolved).toBe('light')

      act(() => { mediaQuery.set(true) })
      expect(result.current.resolved).toBe('light')
      unmount()
    })

    it('toggle() persists the explicit opposite and updates the DOM immediately', () => {
      stubMatchMedia(false)
      const { result, unmount } = renderHook(() => useTheme())
      expect(result.current.resolved).toBe('light')

      act(() => { result.current.toggle() })

      expect(result.current.resolved).toBe('dark')
      expect(localStorage.getItem('tmail.theme')).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
      unmount()
    })

    it('toggle() sticks across a simulated reload even against the OS default', () => {
      stubMatchMedia(true)
      const { result, unmount } = renderHook(() => useTheme())
      expect(result.current.resolved).toBe('dark')

      act(() => { result.current.toggle() })
      expect(result.current.resolved).toBe('light')
      unmount()

      initTheme()
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('falls back to legacy addListener/removeListener without throwing when mounted/unmounted', () => {
      const mediaQuery = stubLegacyMatchMedia(false)
      const { unmount } = renderHook(() => useTheme())
      expect(mediaQuery.listenerCount).toBe(1)

      unmount()
      expect(mediaQuery.listenerCount).toBe(0)
    })

    it('stops listening for OS preference changes once unmounted', () => {
      const mediaQuery = stubMatchMedia(false)
      const { result, unmount } = renderHook(() => useTheme())
      expect(mediaQuery.listenerCount).toBe(1)

      unmount()
      mediaQuery.set(true)
      expect(result.current.resolved).toBe('light')
      expect(mediaQuery.listenerCount).toBe(0)
    })
  })
})
