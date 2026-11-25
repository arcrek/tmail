// @vitest-environment jsdom

import { act, cleanup, fireEvent } from '@testing-library/react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppHeader, { type AppHeaderProps } from '../components/AppHeader'
import { AppIcon, type IconName } from '../components/AppIcon'
import { initLocale } from '../i18n'
import { createTMailTheme } from '../muiTheme'
import { renderWithTheme } from './renderWithTheme'

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function makeProps(overrides: Partial<AppHeaderProps> = {}): AppHeaderProps {
  return {
    unlockOpen: false,
    unlockValue: '',
    onUnlockOpenChange: vi.fn(),
    onUnlockValueChange: vi.fn(),
    onHome: vi.fn(),
    onUnlock: vi.fn(),
    onLock: vi.fn(),
    onBulk: vi.fn(),
    onBulkCode: vi.fn(),
    ...overrides,
  }
}

afterEach(cleanup)

describe('AppHeader', () => {
  it('renders the bulk read tab, calls onBulkCode, and marks it current when active', () => {
    initLocale()
    const onBulkCode = vi.fn()
    const { container } = renderWithTheme(
      <AppHeader
        {...makeProps({
          showLocalePicker: false,
          showUnlock: false,
          bulkCodeActive: true,
          onBulkCode,
        })}
      />,
    )

    const link = container.querySelector('.bulk-code-link')
    expect(link?.textContent).toContain('Bulk read')
    expect(link?.getAttribute('aria-current')).toBe('page')
    fireEvent.click(link!)
    expect(onBulkCode).toHaveBeenCalledTimes(1)
  })

  it('renders the home link and calls onHome when clicked', () => {
    initLocale()
    const onHome = vi.fn()
    const props = makeProps({
      showLocalePicker: false,
      showUnlock: false,
      homeActive: true,
      onHome,
    })
    const { container, rerender } = renderWithTheme(<AppHeader {...props} />)

    const link = container.querySelector('.home-link')
    expect(link?.textContent).toContain('Home')
    expect(link?.getAttribute('aria-current')).toBe('page')
    fireEvent.click(link!)
    expect(onHome).toHaveBeenCalledTimes(1)

    rerender(
      <ThemeProvider theme={createTMailTheme('light')}>
        <CssBaseline />
        <AppHeader {...props} homeActive={false} />
      </ThemeProvider>,
    )
    expect(container.querySelector('.home-link')?.getAttribute('aria-current')).toBeNull()
    expect(container.querySelector('.admin-link')).toBeNull()
  })

  it('handles brand plain clicks and ignores modifier clicks', () => {
    initLocale()
    const onHome = vi.fn()
    const { container } = renderWithTheme(
      <AppHeader {...makeProps({ showLocalePicker: false, showUnlock: false, onHome })} />,
    )

    const brand = container.querySelector('.brand')!
    const ctrlEvent = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    const prevented = !brand.dispatchEvent(ctrlEvent)
    expect(prevented).toBe(false)
    expect(onHome).not.toHaveBeenCalled()

    const plainEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    const plainPrevented = !brand.dispatchEvent(plainEvent)
    expect(plainPrevented).toBe(true)
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('keeps the language picker outside the collapsible menu and labels the current language', () => {
    initLocale()
    const { container } = renderWithTheme(
      <AppHeader {...makeProps({ showLocalePicker: true, showUnlock: false })} />,
    )

    const picker = container.querySelector('.header-actions .locale-picker')
    expect(picker).not.toBeNull()
    expect(container.querySelector('.app-header-nav .locale-picker')).toBeNull()
    expect(picker?.querySelector('select')?.getAttribute('aria-label')).toBe('Language')
    expect(picker?.querySelector('.locale-current-long')?.textContent).toBe('English')
    expect(picker?.querySelector('.locale-current-short')?.textContent).toBe('EN')
  })

  it('toggles mobile menu and closes on escape', () => {
    initLocale()
    const { container } = renderWithTheme(
      <AppHeader {...makeProps({ showLocalePicker: true, showUnlock: true })} />,
    )

    const toggleBtn = container.querySelector('.mobile-menu-button')!
    const nav = container.querySelector('.app-header-nav')!
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
    expect(nav.classList.contains('mobile-open')).toBe(false)

    fireEvent.click(toggleBtn)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
    expect(nav.classList.contains('mobile-open')).toBe(true)
    expect(document.activeElement).toBe(container.querySelector('#app-header-nav a'))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
    expect(nav.classList.contains('mobile-open')).toBe(false)
  })

  it('renders distinct function-matched SVG icons across header navigation and AppIcon catalog', () => {
    const allNames: IconName[] = [
      'home', 'copy', 'check', 'check-circle', 'refresh-cw', 'plus', 'trash-2',
      'download', 'file-down', 'bell', 'bell-ring', 'sun', 'moon', 'arrow-left',
      'paperclip', 'external-link', 'file-text', 'book-open', 'sparkles', 'shuffle',
      'shield', 'shield-check', 'shield-cog', 'clock-shield', 'menu', 'x',
      'volume-2', 'volume-x', 'qr', 'layout-dashboard', 'sliders', 'server',
      'globe', 'globe-plus', 'key', 'lock', 'unlock', 'log-out', 'badge-check',
      'code-2', 'scan-code', 'alert-triangle', 'mail', 'brand-mail', 'mail-open',
      'mail-plus', 'mails', 'inbox', 'clock', 'calendar-range', 'trending-up', 'activity',
    ]

    for (const name of allNames) {
      const { container, unmount } = renderWithTheme(<AppIcon name={name} />)
      const svg = container.querySelector('svg.app-icon')
      expect(svg).not.toBeNull()
      expect(svg!.children.length).toBeGreaterThan(0)
      unmount()
    }

    initLocale()
    const { container } = renderWithTheme(
      <AppHeader {...makeProps({ showLocalePicker: false, showUnlock: false })} />,
    )

    const navSvgs = Array.from(container.querySelectorAll('.app-header-nav a svg.app-icon')).map(
      (svg) => svg.outerHTML,
    )
    expect(navSvgs).toHaveLength(4)
    expect(new Set(navSvgs).size).toBe(4)
  })

  it('controls unlock form visibility, submission, and locking via UnlockControl', () => {
    initLocale()
    const onUnlockOpenChange = vi.fn()
    const onUnlockValueChange = vi.fn()
    const onUnlock = vi.fn()
    const onLock = vi.fn()

    const { container, rerender } = renderWithTheme(
      <AppHeader
        {...makeProps({
          showUnlock: true,
          unlockOpen: false,
          unlockValue: '',
          onUnlockOpenChange,
          onUnlockValueChange,
          onUnlock,
          onLock,
        })}
      />,
    )

    expect(container.querySelector('.header-unlock')?.textContent).toContain('Unlock full access')
    expect(container.querySelector('#header-access-credential')).toBeNull()

    fireEvent.click(container.querySelector('.header-unlock .text-button')!)
    expect(onUnlockOpenChange).toHaveBeenCalledWith(true)

    rerender(
      <ThemeProvider theme={createTMailTheme('light')}>
        <CssBaseline />
        <AppHeader
          {...makeProps({
            showUnlock: true,
            unlockOpen: true,
            unlockValue: 'secret-pass',
            onUnlockOpenChange,
            onUnlockValueChange,
            onUnlock,
            onLock,
          })}
        />
      </ThemeProvider>,
    )

    const input = container.querySelector<HTMLInputElement>('#header-access-credential')
    expect(input).not.toBeNull()
    fireEvent.change(input!, { target: { value: 'updated-pass' } })
    expect(onUnlockValueChange).toHaveBeenCalledWith('updated-pass')

    fireEvent.submit(container.querySelector('.header-unlock form')!)
    expect(onUnlock).toHaveBeenCalledTimes(1)

    rerender(
      <ThemeProvider theme={createTMailTheme('light')}>
        <CssBaseline />
        <AppHeader
          {...makeProps({
            showUnlock: true,
            accessToken: 'active-token',
            unlockOpen: false,
            unlockValue: '',
            onUnlockOpenChange,
            onUnlockValueChange,
            onUnlock,
            onLock,
          })}
        />
      </ThemeProvider>,
    )

    expect(container.querySelector('.header-unlock')?.textContent).toContain('Unlocked')
    fireEvent.click(container.querySelector('.header-unlock .text-button')!)
    expect(onLock).toHaveBeenCalledTimes(1)
  })
})
