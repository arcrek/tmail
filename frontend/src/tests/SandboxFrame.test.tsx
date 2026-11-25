// @vitest-environment jsdom

import { act, cleanup, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SandboxFrame from '../components/SandboxFrame'
import { createTMailTheme } from '../muiTheme'
import { renderWithTheme } from './renderWithTheme'

describe('SandboxFrame', () => {
  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.theme
    vi.restoreAllMocks()
  })

  it('posts message HTML once to the nonce-protected opaque renderer', () => {
    const postMessage = vi.fn()
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ postMessage } as unknown as Window)
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html='<p style="color:red">Hello</p>' mode="message" title="Message" />,
    )
    const frame = container.querySelector('iframe')!
    fireEvent.load(frame)

    expect(frame.getAttribute('sandbox')).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    )
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('src')).toBe('/message-sandbox?revision=0')
    expect(frame.getAttribute('srcdoc')).toBeNull()
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'tmail:sandbox-content',
        html: '<p style="color:red">Hello</p>',
        css: '',
        mode: 'message',
      },
      '*',
    )
    fireEvent.load(frame)
    expect(postMessage).toHaveBeenCalledTimes(1)
    unmount()
    contentWindow.mockRestore()
  })

  it('posts script and CSS content to the dedicated opaque sandbox document', () => {
    const postMessage = vi.fn()
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ postMessage } as unknown as Window)
    const { container, unmount } = renderWithTheme(
      <SandboxFrame
        html="<script>void 0</script>"
        css="body { color: red }"
        mode="content"
        title="Site content"
      />,
    )
    const frame = container.querySelector('iframe')!
    fireEvent.load(frame)

    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('src')).toBe('/sandbox?revision=0')
    expect(frame.getAttribute('srcdoc')).toBeNull()
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'tmail:sandbox-content',
        html: '<script>void 0</script>',
        css: 'body { color: red }',
        mode: 'content',
        colorScheme: 'light',
      },
      '*',
    )
    unmount()
    contentWindow.mockRestore()
  })

  it('passes the page dark theme to site content frames and reloads them when it changes', async () => {
    const postMessage = vi.fn()
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ postMessage } as unknown as Window)
    document.documentElement.dataset.theme = 'dark'
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html="<p>Ad</p>" mode="content" title="Ad" />,
    )
    fireEvent.load(container.querySelector('iframe')!)
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ colorScheme: 'dark' }),
      '*',
    )

    await act(async () => {
      document.documentElement.dataset.theme = 'light'
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe('/sandbox?revision=1')
    fireEvent.load(container.querySelector('iframe')!)
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ colorScheme: 'light' }),
      '*',
    )

    unmount()
    delete document.documentElement.dataset.theme
    contentWindow.mockRestore()
  })

  it('stops following the theme after unmount', async () => {
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html="<p>Ad</p>" mode="content" title="Ad" />,
    )
    const frame = container.querySelector('iframe')!
    unmount()
    document.documentElement.dataset.theme = 'dark'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(frame.getAttribute('src')).toBe('/sandbox?revision=0')
  })

  it('keeps message frames free of the page color scheme', () => {
    const postMessage = vi.fn()
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ postMessage } as unknown as Window)
    document.documentElement.dataset.theme = 'dark'
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html="<p>Mail</p>" mode="message" title="Mail" />,
    )
    fireEvent.load(container.querySelector('iframe')!)
    expect(postMessage.mock.calls[0]?.[0]).not.toHaveProperty('colorScheme')
    unmount()
    delete document.documentElement.dataset.theme
    contentWindow.mockRestore()
  })

  it('replaces the iframe document when content changes and unmounts cleanly', () => {
    const theme = createTMailTheme('light')
    const { container, rerender, unmount } = renderWithTheme(
      <SandboxFrame html="<p>First</p>" mode="content" title="Content" />,
    )
    const first = container.querySelector('iframe')!
    rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SandboxFrame html="<p>Second</p>" mode="content" title="Content" />
      </ThemeProvider>,
    )
    const second = container.querySelector('iframe')!
    expect(second.getAttribute('src')).toBe('/sandbox?revision=1')
    expect(second).not.toBe(first)

    expect(() => unmount()).not.toThrow()
  })

  it('responds to tmail:sandbox-ready from its own iframe contentWindow', () => {
    const postMessage = vi.fn()
    const mockWindow = { postMessage } as unknown as Window
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(mockWindow)
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html="<p>Ready handshake test</p>" mode="message" title="Ready" />,
    )

    // Ignore messages from unknown sources or with other types
    window.dispatchEvent(
      new MessageEvent('message', {
        source: {} as Window,
        data: { type: 'tmail:sandbox-ready' },
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        source: mockWindow,
        data: { type: 'extension:noise' },
      }),
    )
    expect(postMessage).not.toHaveBeenCalled()

    // Dispatch authentic ready event from frame contentWindow
    window.dispatchEvent(
      new MessageEvent('message', {
        source: mockWindow,
        data: { type: 'tmail:sandbox-ready' },
      }),
    )

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'tmail:sandbox-content',
        html: '<p>Ready handshake test</p>',
        css: '',
        mode: 'message',
      },
      '*',
    )

    // Subsequent load event should not duplicate send
    fireEvent.load(container.querySelector('iframe')!)
    expect(postMessage).toHaveBeenCalledTimes(1)

    unmount()
    contentWindow.mockRestore()
  })

  it('re-sends on sandbox-ready even if load event fired prematurely', () => {
    const postMessage = vi.fn()
    const mockWindow = { postMessage } as unknown as Window
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(mockWindow)
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html="<p>Premature load test</p>" mode="message" title="Premature" />,
    )
    const frame = container.querySelector('iframe')!

    // Initial load event fires (e.g. on about:blank)
    fireEvent.load(frame)
    expect(postMessage).toHaveBeenCalledTimes(1)

    // Then the real sandbox document signals it is ready
    window.dispatchEvent(
      new MessageEvent('message', {
        source: mockWindow,
        data: { type: 'tmail:sandbox-ready' },
      }),
    )
    expect(postMessage).toHaveBeenCalledTimes(2)

    unmount()
    contentWindow.mockRestore()
  })

  it('collapses empty public site-content frames and expands them when positive height arrives', () => {
    const mockWindow = { postMessage: vi.fn() } as unknown as Window
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(mockWindow)
    const { container, unmount } = renderWithTheme(
      <SandboxFrame
        className="site-content-frame ad-frame"
        html="<script async src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'></script>"
        mode="content"
        title="Ad slot"
      />,
    )
    const frame = container.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toContain('allow-top-navigation-by-user-activation')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('data-empty')).toBe('true')

    // Explicitly reporting height 0 keeps the frame collapsed (no empty band).
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: mockWindow,
          data: { type: 'tmail:sandbox-height', height: 0 },
        }),
      )
    })
    expect(frame.getAttribute('data-empty')).toBe('true')

    // Reporting rendered content height expands the frame cleanly.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: mockWindow,
          data: { type: 'tmail:sandbox-height', height: 96 },
        }),
      )
    })
    expect(frame.getAttribute('data-empty')).toBe('false')

    // Reverting to 0 collapses it again.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: mockWindow,
          data: { type: 'tmail:sandbox-height', height: 0 },
        }),
      )
    })
    expect(frame.getAttribute('data-empty')).toBe('true')

    unmount()
    contentWindow.mockRestore()
  })

  it('keeps message sandbox permissions untouched without top-navigation', () => {
    const { container, unmount } = renderWithTheme(
      <SandboxFrame html="<p>Email</p>" mode="message" title="Message" />,
    )
    const frame = container.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-popups-to-escape-sandbox')
    unmount()
  })

  it('ignores invalid, foreign, null-source, and message-mode height events and clamps oversized values', () => {
    const mockWindow = { postMessage: vi.fn() } as unknown as Window
    const contentWindow = vi
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(mockWindow)
    const { container, unmount } = renderWithTheme(
      <SandboxFrame
        className="site-content-frame ad-frame"
        html="<div>Banner</div>"
        mode="content"
        title="Ad slot"
      />,
    )
    const frame = container.querySelector('iframe')!

    for (const badEvent of [
      new MessageEvent('message', { source: null, data: { type: 'tmail:sandbox-height', height: 120 } }),
      new MessageEvent('message', { source: {} as Window, data: { type: 'tmail:sandbox-height', height: 120 } }),
      new MessageEvent('message', { source: mockWindow, data: { type: 'tmail:sandbox-height', height: -10 } }),
      new MessageEvent('message', { source: mockWindow, data: { type: 'tmail:sandbox-height', height: Number.NaN } }),
      new MessageEvent('message', { source: mockWindow, data: { type: 'tmail:sandbox-height', height: Number.POSITIVE_INFINITY } }),
    ]) {
      act(() => {
        window.dispatchEvent(badEvent)
      })
    }
    expect(frame.getAttribute('data-empty')).toBe('true')

    // Oversized height is clamped safely to MAX_SANDBOX_HEIGHT (4096px).
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: mockWindow,
          data: { type: 'tmail:sandbox-height', height: 999999 },
        }),
      )
    })
    expect(frame.getAttribute('data-empty')).toBe('false')
    expect(getComputedStyle(frame).height).toBe('4096px')

    unmount()
    contentWindow.mockRestore()
  })
})
