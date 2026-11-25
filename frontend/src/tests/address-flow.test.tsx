// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import App from '../App'
import AddressPanel from '../components/AddressPanel'
import ToastStack from '../components/ToastStack'
import { initLocale, setSiteLocale } from '../i18n'
import { getToasts, toastActions } from '../toast'
import { renderWithTheme } from './renderWithTheme'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  adminSession: vi.fn(),
  adminMailboxToken: vi.fn(),
  logout: vi.fn(),
  domains: vi.fn(),
  token: vi.fn(),
  unlock: vi.fn(),
  lock: vi.fn(),
  site: vi.fn(),
  messages: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    api: {
      ...actual.api,
      ...mocks,
      admin: {
        ...actual.api.admin,
        session: mocks.adminSession,
        mailboxToken: mocks.adminMailboxToken,
      },
    },
  }
})

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

const domains = (values: string[]) => ({
  '@context': '/contexts/Domain',
  '@id': '/domains',
  '@type': 'hydra:Collection',
  'hydra:totalItems': values.length,
  'hydra:member': values.map((domain, index) => ({ id: String(index), domain })),
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('address flow', () => {
  beforeEach(() => {
    mocks.adminSession.mockReset().mockRejectedValue(new ApiError(401, 'No administrator session'))
    mocks.adminMailboxToken.mockReset()
    mocks.logout.mockReset().mockResolvedValue(undefined)
    mocks.me.mockReset().mockImplementation(async () => ({
      address: decodeURIComponent(location.pathname.slice(1)).toLowerCase(),
      accessKind: 'public',
      protected: false,
    }))
    localStorage.clear()
    for (const toast of [...getToasts()]) toastActions.dismiss(toast.id)
    initLocale()
    setSiteLocale(undefined)
    history.replaceState({}, '', '/')
    mocks.domains.mockReset().mockResolvedValue(domains(['example.com']))
    mocks.token.mockReset().mockResolvedValue({ id: 'account-id', token: 'signed-token' })
    mocks.unlock.mockReset().mockResolvedValue({ accessToken: 'access-token', expiresAt: '2026-09-12T00:00:00Z' })
    mocks.lock.mockReset().mockResolvedValue(undefined)
    mocks.site.mockReset().mockResolvedValue({
      appName: 'Temporary Inbox',
      logoDataUrl: '',
      faviconDataUrl: '',
      primaryColor: '#45478f',
      accentColor: '#34366f',
      language: 'en',
      cookieEnabled: false,
      cookieText: '',
      fetchSeconds: 20,
      messageLimit: 100,
      headerHtml: '<strong>Configured header</strong>',
      footerHtml: '<small>Configured footer</small>',
      contentCss: 'body { color: navy; }',
      adSlots: { sidebar: '<script>window.adLoaded = true</script>' },
    })
    mocks.messages.mockReset().mockResolvedValue({
      '@context': '/contexts/Message',
      '@id': '/messages?page=1',
      '@type': 'hydra:Collection',
      'hydra:totalItems': 0,
      'hydra:member': [],
      'hydra:view': {
        '@id': '/messages?page=1',
        '@type': 'hydra:PartialCollectionView',
        'hydra:first': '/messages?page=1',
        'hydra:last': '/messages?page=1',
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hands a direct address link into the inbox without another action', async () => {
    history.replaceState({}, '', '/Box%40Example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    expect(mocks.token).toHaveBeenCalledWith('box@example.com', undefined)
    expect(container.textContent).toContain('box@example.com')
    expect(JSON.parse(localStorage.getItem('tmail.addresses') ?? '[]')).toEqual([
      { address: 'box@example.com', token: 'signed-token' },
    ])
  })

  it('forwards a stored access token when a fresh tab lands on an address route', async () => {
    localStorage.setItem('tmail.accessToken', 'saved-token')
    history.replaceState({}, '', '/box@example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    expect(mocks.token).toHaveBeenCalledWith('box@example.com', 'saved-token')
  })

  it('lets visitors choose and persist language preferences from the header', async () => {
    const { container } = render(<App />)
    await flush()
    const select = container.querySelector<HTMLSelectElement>('.locale-picker select')!
    expect(select.getAttribute('aria-label')).toBe('Language')
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['en', 'vi', 'ru', 'zh'])

    fireEvent.change(select, { target: { value: 'vi' } })
    expect(container.textContent).toContain('Tài liệu API')
    expect(document.documentElement.lang).toBe('vi')
    expect(localStorage.getItem('tmail.locale')).toBe('vi')

    fireEvent.change(select, { target: { value: 'ru' } })
    expect(container.textContent).toContain('API документация')
    expect(document.documentElement.lang).toBe('ru')
    expect(localStorage.getItem('tmail.locale')).toBe('ru')

    fireEvent.change(select, { target: { value: 'zh' } })
    expect(container.textContent).toContain('API 文档')
    expect(document.documentElement.lang).toBe('zh-Hans')
    expect(localStorage.getItem('tmail.locale')).toBe('zh')
  })

  it('keeps configured site and ad HTML inside opaque sandbox frames', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelectorAll('iframe.site-content-frame')).toHaveLength(3))

    expect(mocks.site).toHaveBeenCalledTimes(1)
    const frames = [...container.querySelectorAll<HTMLIFrameElement>('iframe.site-content-frame')]
    expect(frames.every((frame) => frame.getAttribute('src') === '/sandbox?revision=0')).toBe(true)
    expect(frames.every((frame) => frame.getAttribute('srcdoc') === null)).toBe(true)
    expect(frames[1]?.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frames[1]?.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(container.textContent).not.toContain('Configured header')
  })

  it('uses the approved public shell and home layout', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app-header .brand')?.textContent).toContain('Temporary Inbox'))

    expect(container.querySelector('.saved-inboxes')).toBeTruthy()
    expect(container.querySelector('.home-hero')?.textContent).toContain('Disposable email, ready now.')
    expect(container.querySelector('.address-form')?.textContent).toContain('Create an address')
  })

  it('applies and cleans up configured branding, language, favicon, and cookie notice', async () => {
    const root = document.documentElement
    const originalLanguage = root.lang
    const originalTitle = document.title
    root.style.setProperty('--brand-primary', '#111111')
    root.style.setProperty('--brand-accent', '#222222')
    const favicon = document.createElement('link')
    favicon.rel = 'icon'
    favicon.href = '/original.ico'
    document.head.append(favicon)
    mocks.site.mockResolvedValueOnce({
      appName: 'Configured Mail',
      logoDataUrl: 'data:image/png;base64,bG9nbw==',
      faviconDataUrl: 'data:image/png;base64,aWNvbg==',
      primaryColor: '#123456',
      accentColor: '#654321',
      language: 'de',
      cookieEnabled: true,
      cookieText: 'This site uses a necessary preference cookie.',
      fetchSeconds: 20,
      messageLimit: 100,
      headerHtml: '',
      footerHtml: '',
      contentCss: '',
      adSlots: {},
    })

    const { container, unmount } = render(<App />)
    await waitFor(() => expect(container.querySelector('.app-header .brand')?.textContent).toContain('Configured Mail'))

    expect(container.querySelector('.app-header .brand img')?.getAttribute('src')).toBe('data:image/png;base64,bG9nbw==')
    expect(container.querySelector('[role="status"][aria-label="Cookie notice"]')?.textContent).toContain('necessary preference cookie')
    expect(root.style.getPropertyValue('--brand-primary')).toBe('#123456')
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#654321')
    expect(root.lang).toBe('en')
    expect(document.title).toBe('Configured Mail')
    expect(favicon.getAttribute('href')).toBe('data:image/png;base64,aWNvbg==')

    unmount()
    expect(root.style.getPropertyValue('--brand-primary')).toBe('#111111')
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#222222')
    expect(root.lang).toBe(originalLanguage)
    expect(document.title).toBe(originalTitle)
    expect(favicon.getAttribute('href')).toBe('/original.ico')
    favicon.remove()
    root.style.removeProperty('--brand-primary')
    root.style.removeProperty('--brand-accent')
  })

  it('hands malformed address-shaped links to token validation for a clear error', async () => {
    history.replaceState({}, '', '/bad..local@example.com')
    mocks.token.mockRejectedValueOnce(new ApiError(422, 'Invalid address'))

    const { container } = render(<App />)
    await waitFor(() => expect(container.textContent).toContain('Invalid address'))
    expect(mocks.token).toHaveBeenCalledWith('bad..local@example.com', undefined)
  })

  it('opens a tokenized inbox when browser storage denies writes', async () => {
    history.replaceState({}, '', '/box@example.com')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })

    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
    expect(mocks.token).toHaveBeenCalledWith('box@example.com', undefined)
    expect(container.textContent).toContain('box@example.com')
  })

  it('opens a full email address without selecting a domain and preserves unlocked access', async () => {
    localStorage.setItem('tmail.accessToken', 'saved-token')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector<HTMLSelectElement>('#domain')?.value).toBe('example.com'))

    fireEvent.click(container.querySelector('[data-mode="existing"]')!)
    fireEvent.change(container.querySelector('#quick-email')!, { target: { value: '  Box@Other.Example  ' } })
    fireEvent.submit(container.querySelector('.quick-access form')!)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    expect(mocks.token).toHaveBeenCalledWith('box@other.example', 'saved-token')
    expect(location.pathname).toBe('/box%40other.example')
    expect(JSON.parse(localStorage.getItem('tmail.addresses')!)[0].address).toBe('box@other.example')
  })

  it('requires a valid full email address before native form submission', async () => {
    const onOpen = vi.fn()
    const onLogin = vi.fn()
    const { container } = renderWithTheme(<AddressPanel onOpen={onOpen} onLogin={onLogin} />)
    await flush()

    const input = container.querySelector<HTMLInputElement>('#quick-email')!
    const submitBtn = container.querySelector<HTMLButtonElement>('.quick-access button[type="submit"]')!
    expect(input.checkValidity()).toBe(false)
    expect(submitBtn.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'not-an-email' } })
    expect(input.checkValidity()).toBe(false)

    fireEvent.change(input, { target: { value: 'box@example.com' } })
    expect(input.checkValidity()).toBe(true)
    expect(submitBtn.disabled).toBe(false)
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it('keeps quick access available when the domain list cannot load', async () => {
    mocks.domains.mockRejectedValue(new ApiError(502, 'Domain list unavailable'))
    const onOpen = vi.fn()
    const { container } = renderWithTheme(<AddressPanel onOpen={onOpen} onLogin={vi.fn()} />)
    await flush()

    fireEvent.change(container.querySelector('#quick-email')!, { target: { value: 'box@example.com' } })
    fireEvent.submit(container.querySelector('.quick-access form')!)
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ address: 'box@example.com' })))
  })

  it('prevents repeated opens while quick access is pending', async () => {
    let finish!: (value: { token: string }) => void
    mocks.token.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const onOpen = vi.fn()
    const { container } = renderWithTheme(<AddressPanel onOpen={onOpen} onLogin={vi.fn()} />)
    await flush()

    fireEvent.change(container.querySelector('#quick-email')!, { target: { value: 'box@example.com' } })
    fireEvent.submit(container.querySelector('.quick-access form')!)
    await flush()

    const submitBtn = container.querySelector<HTMLButtonElement>('.quick-access button[type="submit"]')!
    expect(submitBtn.disabled).toBe(true)
    fireEvent.submit(container.querySelector('.quick-access form')!)
    expect(mocks.token).toHaveBeenCalledOnce()

    finish({ token: 'signed-token' })
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    expect(submitBtn.disabled).toBe(false)
  })

  it('uses the password prompt when quick access opens a protected mailbox', async () => {
    mocks.token.mockRejectedValueOnce(new ApiError(401, 'Password required'))
    const { container } = render(<App />)
    await flush()

    fireEvent.click(container.querySelector('[data-mode="existing"]')!)
    fireEvent.change(container.querySelector('#quick-email')!, { target: { value: 'box@example.com' } })
    fireEvent.submit(container.querySelector('.quick-access form')!)
    await waitFor(() => expect(container.querySelector('#mailbox-login-password')).toBeTruthy())

    expect(container.querySelector('.inbox-view')).toBeNull()
    expect(location.pathname).toBe('/box%40example.com')

    fireEvent.change(container.querySelector('#mailbox-login-password')!, { target: { value: 'password-12345' } })
    fireEvent.submit(container.querySelector('.mailbox-login form')!)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
    expect(mocks.token).toHaveBeenLastCalledWith('box@example.com', undefined, 'password-12345')
  })

  it('reports server validation errors from quick access and allows retry', async () => {
    mocks.token.mockRejectedValueOnce(new ApiError(422, 'Invalid address'))
    const { container } = render(<App />)
    await flush()

    fireEvent.click(container.querySelector('[data-mode="existing"]')!)
    fireEvent.change(container.querySelector('#quick-email')!, { target: { value: 'box@unsupported.example' } })
    fireEvent.submit(container.querySelector('.quick-access form')!)
    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('Invalid address'))

    expect(container.querySelector('.inbox-view')).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.quick-access button[type="submit"]')!.disabled).toBe(false)

    fireEvent.change(container.querySelector('#quick-email')!, { target: { value: 'box@example.com' } })
    fireEvent.submit(container.querySelector('.quick-access form')!)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
  })

  it('creates a custom address with an active domain', async () => {
    const onOpen = vi.fn()
    const { container } = renderWithTheme(<AddressPanel onOpen={onOpen} onLogin={vi.fn()} />)
    await waitFor(() => expect(container.querySelector<HTMLSelectElement>('#domain')?.value).toBe('example.com'))

    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'paper' } })
    fireEvent.submit(container.querySelector('.address-form form')!)
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ address: 'paper@example.com', token: 'signed-token' }))
    expect(mocks.token).toHaveBeenCalledWith('paper@example.com', undefined)
  })

  it('opens a random address through the existing token flow', async () => {
    mocks.domains.mockResolvedValue(domains(['one.example', 'two.example']))
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.set([1, 2, 3, 4, 5, 6])
        return values
      },
    })
    const onOpen = vi.fn()
    const { container } = renderWithTheme(<AddressPanel onOpen={onOpen} onLogin={vi.fn()} />)
    await waitFor(() => expect(container.querySelector<HTMLSelectElement>('#domain')?.value).toBe('one.example'))

    fireEvent.click(container.querySelector('.address-form .random-button')!)
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ address: 'cifuhe@two.example', token: 'signed-token' }))
    expect(mocks.token).toHaveBeenCalledTimes(1)
  })

  it('keeps the header unlock control collapsed until requested', async () => {
    const { container } = render(<App />)
    await flush()

    expect(container.querySelector('.header-unlock')?.textContent).toContain('Unlock full access')
    expect(container.querySelector('#header-access-credential')).toBeNull()
  })

  it('unlocks from the header and uses the access token for domains and address creation', async () => {
    mocks.domains.mockResolvedValueOnce(domains([])).mockResolvedValueOnce(domains(['hidden.example']))
    const { container } = render(<App />)
    await flush()

    fireEvent.click(container.querySelector('.header-unlock .text-button')!)
    fireEvent.change(container.querySelector('#header-access-credential')!, { target: { value: 'credential' } })
    fireEvent.submit(container.querySelector('.header-unlock form')!)
    await waitFor(() => expect(container.querySelector('.header-unlock')?.textContent).toContain('Unlocked'))

    expect(mocks.unlock).toHaveBeenCalledWith('credential')
    await waitFor(() => expect(mocks.domains).toHaveBeenLastCalledWith(1, 'access-token'))
    await waitFor(() => expect(container.querySelector('#local-part')).toBeTruthy())
    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'paper' } })
    fireEvent.submit(container.querySelector('.address-form form')!)
    await waitFor(() => expect(mocks.token).toHaveBeenCalledWith('paper@hidden.example', 'access-token'))
  })

  it('shows a toast for an invalid credential without changing domains', async () => {
    mocks.unlock.mockRejectedValueOnce(new ApiError(401, 'Invalid credential'))
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('#domain')?.textContent).toContain('example.com'))

    fireEvent.click(container.querySelector('.header-unlock .text-button')!)
    fireEvent.change(container.querySelector('#header-access-credential')!, { target: { value: 'wrong' } })
    fireEvent.submit(container.querySelector('.header-unlock form')!)
    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('The access credential is invalid.'))

    expect(mocks.domains).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('tmail.accessToken')).toBeNull()
  })

  it('locks from the header, clears the token, and reloads the filtered domain list', async () => {
    localStorage.setItem('tmail.accessToken', 'access-token')
    mocks.domains.mockResolvedValueOnce(domains(['hidden.example'])).mockResolvedValueOnce(domains(['example.com']))
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.header-unlock')?.textContent).toContain('Unlocked'))

    fireEvent.click(container.querySelector('.header-unlock .text-button')!)
    await waitFor(() => expect(mocks.domains).toHaveBeenLastCalledWith(1, undefined))

    expect(mocks.lock).toHaveBeenCalledWith('access-token')
    expect(container.querySelector('#domain')?.textContent).toContain('example.com')
    expect(localStorage.getItem('tmail.accessToken')).toBeNull()
  })

  it('restores unlocked access from local storage after a page reload', async () => {
    localStorage.setItem('tmail.accessToken', 'saved-token')
    const first = render(<App />)
    await flush()
    first.unmount()

    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.header-unlock')?.textContent).toContain('Unlocked'))
    expect(mocks.domains).toHaveBeenLastCalledWith(1, 'saved-token')
  })

  it('resets copied state when the composed address changes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { container } = renderWithTheme(<AddressPanel onOpen={vi.fn()} onLogin={vi.fn()} />)
    await waitFor(() => expect(container.querySelector<HTMLSelectElement>('#domain')?.value).toBe('example.com'))

    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'paper' } })
    fireEvent.click(container.querySelector('.address-preview button')!)
    await waitFor(() => expect(container.querySelector('.address-preview button')?.textContent).toContain('Copied'))

    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'changed' } })
    expect(container.querySelector('.address-preview button')?.textContent).toContain('Copy')
  })

  it('shows a successful copy toast after a failed retry', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
    const { container } = renderWithTheme(
      <>
        <AddressPanel onOpen={vi.fn()} onLogin={vi.fn()} />
        <ToastStack />
      </>,
    )
    await waitFor(() => expect(container.querySelector<HTMLSelectElement>('#domain')?.value).toBe('example.com'))

    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'paper' } })
    fireEvent.click(container.querySelector('.address-preview button')!)
    await waitFor(() => expect(container.textContent).toContain('Copy failed'))

    fireEvent.click(container.querySelector('.address-preview button')!)
    await waitFor(() => expect(container.querySelector('.address-preview button')?.textContent).toContain('Copied'))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Address copied')
  })

  it('switches between new and existing address modes with clicks and arrow keys', async () => {
    const { container } = renderWithTheme(<AddressPanel onOpen={vi.fn()} onLogin={vi.fn()} />)
    await flush()

    const newMode = container.querySelector<HTMLElement>('[data-mode="new"]')!
    const existingMode = container.querySelector<HTMLElement>('[data-mode="existing"]')!
    expect(newMode.getAttribute('aria-checked')).toBe('true')
    expect(newMode.getAttribute('tabindex')).toBe('0')
    expect(existingMode.getAttribute('tabindex')).toBe('-1')
    expect(container.querySelector<HTMLElement>('.quick-access')?.hidden).toBe(true)

    fireEvent.click(existingMode)
    expect(existingMode.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector<HTMLElement>('.quick-access')?.hidden).toBe(false)
    expect(container.querySelector<HTMLElement>('.composer-pane')?.hidden).toBe(true)

    fireEvent.keyDown(existingMode, { key: 'ArrowLeft' })
    await waitFor(() => expect(newMode.getAttribute('aria-checked')).toBe('true'))
    expect(document.activeElement).toBe(newMode)
  })

  it('shows the docs and admin links in the public footer but not on the admin console', async () => {
    const { container } = render(<App />)
    await flush()

    const footer = container.querySelector('.site-footer')!
    expect(footer.querySelector('a[href="/admin"]')?.textContent).toBe('Admin')
    expect(footer.querySelector('a[href="/docs"]')).toBeTruthy()
    expect(container.querySelector('.app-header .admin-link')).toBeNull()
  })

  it('shows a useful empty-domain state', async () => {
    mocks.domains.mockResolvedValue(domains([]))
    const { container } = renderWithTheme(<AddressPanel onOpen={vi.fn()} onLogin={vi.fn()} />)
    await waitFor(() => expect(container.textContent).toContain('No receiving domains are available'))
    expect(container.querySelector<HTMLButtonElement>('.empty-state button[type="submit"]')!.disabled).toBe(true)
  })

  it('shows a Hydra domain-loading error separately from an empty list', async () => {
    mocks.domains.mockRejectedValue(new ApiError(502, 'Domain list unavailable'))
    const { container } = renderWithTheme(<AddressPanel onOpen={vi.fn()} onLogin={vi.fn()} />)
    await waitFor(() => expect(container.textContent).toContain('Domain list unavailable'))
    expect(container.textContent).toContain('Retry')
  })

  it('keeps Back and Forward history aligned with the rendered inbox', async () => {
    const pushState = vi.spyOn(history, 'pushState')
    const travel = async (move: () => void) => {
      const moved = new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true })
      })
      move()
      await moved
      await flush()
    }
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector<HTMLSelectElement>('#domain')?.value).toBe('example.com'))

    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'alpha' } })
    fireEvent.submit(container.querySelector('.address-form form')!)
    await waitFor(() => expect(location.pathname).toBe('/alpha%40example.com'))

    fireEvent.click(container.querySelector('.app-header .home-link')!)
    await waitFor(() => expect(container.querySelector('#local-part')).toBeTruthy())
    fireEvent.change(container.querySelector('#local-part')!, { target: { value: 'beta' } })
    fireEvent.submit(container.querySelector('.address-form form')!)
    await waitFor(() => expect(location.pathname).toBe('/beta%40example.com'))

    await travel(() => history.back())
    expect(location.pathname).toBe('/')
    expect(container.textContent).toContain('Disposable email, ready now.')

    await travel(() => history.back())
    await waitFor(() => expect(container.textContent).toContain('alpha@example.com'))
    expect(location.pathname).toBe('/alpha%40example.com')

    await travel(() => history.forward())
    expect(location.pathname).toBe('/')

    await travel(() => history.forward())
    await waitFor(() => expect(container.textContent).toContain('beta@example.com'))
    expect(location.pathname).toBe('/beta%40example.com')
    expect(pushState).toHaveBeenCalledTimes(3)
  })

  it('returns to the address form when the header brand is clicked', async () => {
    history.replaceState({}, '', '/box@example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    fireEvent.click(container.querySelector('.app-header .brand')!)
    await waitFor(() => expect(container.querySelector('.home-hero')).toBeTruthy())
    expect(location.pathname).toBe('/')
    expect(container.querySelector('.inbox-view')).toBeNull()
  })

  it('shows bulk generation from the header and returns home from the brand link', async () => {
    const { container } = render(<App />)
    await flush()

    fireEvent.click(container.querySelector('.bulk-link')!)
    await waitFor(
      () => expect(container.querySelector('#bulk-title')?.textContent).toBe('Generate multiple addresses'),
      { timeout: 8000 },
    )
    expect(container.querySelector('.bulk-link')?.getAttribute('aria-current')).toBe('page')

    fireEvent.click(container.querySelector('.app-header .brand')!)
    await waitFor(() => expect(container.querySelector('.address-form')).toBeTruthy())
    expect(container.querySelector('#bulk-title')).toBeNull()
  })

  it('shows bulk code reading from the header and returns home from the brand link', async () => {
    const { container } = render(<App />)
    await flush()

    fireEvent.click(container.querySelector('.bulk-code-link')!)
    await waitFor(
      () => expect(container.querySelector('#bulk-code-title')?.textContent).toBe('Read verification codes'),
      { timeout: 8000 },
    )
    expect(container.querySelector('.bulk-code-link')?.getAttribute('aria-current')).toBe('page')

    fireEvent.click(container.querySelector('.app-header .brand')!)
    await waitFor(() => expect(container.querySelector('.address-form')).toBeTruthy())
    expect(container.querySelector('#bulk-code-title')).toBeNull()
  })

  it('leaves a modifier-clicked header brand alone (no reset, no address change)', async () => {
    history.replaceState({}, '', '/box@example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
    const pathBefore = location.pathname

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    const prevented = !container.querySelector('.app-header .brand')!.dispatchEvent(event)
    await flush()

    expect(prevented).toBe(false)
    expect(location.pathname).toBe(pathBefore)
    expect(container.querySelector('.inbox-view')).toBeTruthy()
  })

  it('removes its history listener when the app unmounts', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<App />)
    await flush()
    const handler = add.mock.calls.find(([type]) => type === 'popstate')?.[1]

    expect(handler).toEqual(expect.any(Function))
    unmount()
    expect(remove).toHaveBeenCalledWith('popstate', handler)
  })

  it('shows a labeled password prompt on a direct protected link, preserves exact input, and clears it after failure', async () => {
    history.replaceState({}, '', '/box@example.com')
    mocks.token.mockRejectedValueOnce(new ApiError(401, 'Password required'))
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('#mailbox-login-password')).toBeTruthy())

    expect(container.querySelector('.inbox-view')).toBeNull()
    expect(container.querySelector('label[for="mailbox-login-password"]')?.textContent).toBe('Mailbox password')

    mocks.token.mockRejectedValueOnce(new ApiError(401, 'Wrong password'))
    const password = ' ' + '😀'.repeat(12) + ' '
    fireEvent.change(container.querySelector('#mailbox-login-password')!, { target: { value: password } })
    fireEvent.submit(container.querySelector('.mailbox-login form')!)
    await waitFor(() => expect(container.querySelector('#mailbox-login-error')?.textContent).toContain('incorrect'))

    expect(mocks.token).toHaveBeenLastCalledWith('box@example.com', undefined, password)
    expect(container.querySelector<HTMLInputElement>('#mailbox-login-password')!.value).toBe('')

    mocks.token.mockResolvedValueOnce({ token: 'visitor', accessKind: 'visitor', protected: true })
    fireEvent.change(container.querySelector('#mailbox-login-password')!, { target: { value: password } })
    fireEvent.submit(container.querySelector('.mailbox-login form')!)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
    expect(JSON.parse(localStorage.getItem('tmail.addresses')!)[0]).toEqual({
      address: 'box@example.com',
      token: 'visitor',
      protected: true,
    })
    expect(localStorage.getItem('tmail.addresses')).not.toContain(password)

    // Returning home shows the saved protected inbox chip with its lock indicator.
    fireEvent.click(container.querySelector('.app-header .brand')!)
    await waitFor(() => expect(container.querySelector('.saved-inboxes')).toBeTruthy())
    const savedChip = container.querySelector('.saved-address')!
    expect(savedChip.textContent).toContain('box@example.com')
    expect(savedChip.querySelector('[data-testid="LockOutlinedIcon"]')).toBeTruthy()
  })

  it('validates remembered sessions before rendering messages and removes a stale entry', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'box@example.com', token: 'stale' }]))
    history.replaceState({}, '', '/box@example.com')
    let reject!: (cause: Error) => void
    mocks.me.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    mocks.token.mockRejectedValueOnce(new ApiError(401, 'Password required'))
    const { container } = render(<App />)
    await flush()
    expect(mocks.messages).not.toHaveBeenCalled()

    reject(new ApiError(401, 'Revoked'))
    await waitFor(() => expect(container.querySelector('#mailbox-login-password')).toBeTruthy())
    expect(localStorage.getItem('tmail.addresses')).toBe('[]')
  })

  it('prefers admin exchange without persisting the bearer or CSRF', async () => {
    history.replaceState({}, '', '/box@example.com')
    mocks.adminSession.mockResolvedValue({ csrfToken: 'admin-csrf' })
    mocks.adminMailboxToken.mockResolvedValue({ token: 'admin-secret-bearer', accessKind: 'admin', protected: true })
    mocks.me.mockResolvedValue({ address: 'box@example.com', accessKind: 'admin', protected: true })
    const { container } = render(<App />)
    await waitFor(() => expect(container.textContent).toContain('Administrator access'))

    expect(mocks.adminMailboxToken).toHaveBeenCalledWith('box@example.com', 'admin-csrf')
    expect(mocks.token).not.toHaveBeenCalled()
    expect(localStorage.getItem('tmail.addresses')).toBeNull()
    expect(localStorage.getItem('tmail.activeAddress')).toBeNull()

    act(() => { window.dispatchEvent(new Event('tmail-admin-logout')) })
    await waitFor(() => expect(container.querySelector('#mailbox-login-password')).toBeTruthy())
    expect(container.querySelector('.inbox-view')).toBeNull()
  })

  it('clears mail locally before a failed logout request and reports unconfirmed revocation', async () => {
    history.replaceState({}, '', '/box@example.com')
    mocks.token.mockResolvedValueOnce({ token: 'visitor', accessKind: 'visitor', protected: true })
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    mocks.logout.mockRejectedValue(new Error('Offline'))
    fireEvent.click(container.querySelector('[data-action="mailbox-logout"]')!)
    expect(container.querySelector('.inbox-view')).toBeNull()
    await waitFor(() => expect(container.textContent).toContain('Server revocation could not be confirmed'))
    expect(mocks.logout).toHaveBeenCalledWith('visitor')
    expect(localStorage.getItem('tmail.addresses')).toBe('[]')
  })

  it('clears active mail on cross-tab removal and validates a replacement token before reuse', async () => {
    mocks.token.mockResolvedValue({ token: 'visitor', accessKind: 'visitor', protected: true })
    mocks.me.mockResolvedValue({ address: 'box@example.com', accessKind: 'visitor', protected: true })
    history.replaceState({}, '', '/box@example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    localStorage.removeItem('tmail.addresses')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' })) })
    await waitFor(() => expect(container.querySelector('#mailbox-login-password')).toBeTruthy())

    fireEvent.click(container.querySelector('.mailbox-login .text-button')!)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'box@example.com', token: 'replacement' }]))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' })) })
    await waitFor(() => expect(mocks.messages).toHaveBeenLastCalledWith('replacement', 1))
    expect(mocks.me).toHaveBeenCalledWith('replacement')
  })

  it('ignores token results after navigation and after storage removal during saved validation', async () => {
    history.replaceState({}, '', '/box@example.com')
    let finish!: (value: { token: string }) => void
    mocks.token.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const { container, unmount } = render(<App />)
    await flush()

    fireEvent.click(container.querySelector('.app-header .brand')!)
    finish({ token: 'late' })
    await flush()
    expect(container.querySelector('.inbox-view')).toBeNull()
    expect(mocks.messages).not.toHaveBeenCalled()
    unmount()

    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'box@example.com', token: 'saved' }]))
    history.replaceState({}, '', '/box@example.com')
    let finishMe!: (value: { address: string; accessKind: string }) => void
    mocks.me.mockReturnValueOnce(new Promise((resolve) => { finishMe = resolve }))
    const restored = render(<App />)
    await flush()

    localStorage.clear()
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })) })
    finishMe({ address: 'box@example.com', accessKind: 'visitor' })
    await flush()
    expect(restored.container.querySelector('.inbox-view')).toBeNull()
    expect(localStorage.getItem('tmail.addresses')).toBeNull()
  })

  it('saves password replacement tokens and updates the expiry deadline in the inbox', async () => {
    history.replaceState({}, '', '/box@example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    const { api } = await import('../api')
    vi.spyOn(api, 'setPassword').mockResolvedValue({
      id: 'id',
      token: 'protected-new',
      accessKind: 'visitor',
      protected: true,
      protectedUntil: '2027-01-08T20:00:00Z',
    })

    fireEvent.click(container.querySelector('[data-action="password"]')!)
    await waitFor(() => expect(container.querySelector('dialog')).toBeTruthy())
    fireEvent.change(container.querySelector('#mailbox-new-password')!, { target: { value: 'new-password-123' } })
    fireEvent.change(container.querySelector('#mailbox-confirm-password')!, { target: { value: 'new-password-123' } })
    fireEvent.submit(container.querySelector('dialog form')!)
    await waitFor(() => expect(container.querySelector('dialog')).toBeNull())

    expect(container.textContent).toContain('Protection expires:')
    expect(JSON.parse(localStorage.getItem('tmail.addresses')!)[0].token).toBe('protected-new')
    expect(mocks.messages).toHaveBeenLastCalledWith('protected-new', 1)
  })

  it('revokes the parent administrator session on mailbox logout', async () => {
    history.replaceState({}, '', '/box@example.com')
    mocks.adminSession.mockResolvedValue({ csrfToken: 'csrf' })
    mocks.adminMailboxToken.mockResolvedValue({ token: 'admin-bearer', accessKind: 'admin' })
    mocks.me.mockResolvedValue({ address: 'box@example.com', accessKind: 'admin' })
    const { api } = await import('../api')
    const logout = vi.spyOn(api.admin, 'logout').mockResolvedValue(undefined)
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    fireEvent.click(container.querySelector('[data-action="mailbox-logout"]')!)
    await waitFor(() => expect(logout).toHaveBeenCalledWith('csrf'))
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(container.querySelector('.inbox-view')).toBeNull()
  })

  it('does not cancel a pending mailbox open on unrelated storage updates', async () => {
    history.replaceState({}, '', '/box@example.com')
    let finish!: (value: { token: string }) => void
    mocks.token.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const { container } = render(<App />)
    await flush()

    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'other@example.com', token: 'other' }]))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' })) })
    finish({ token: 'box' })
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
    expect(mocks.messages).toHaveBeenLastCalledWith('box', 1)
  })

  it('keeps valid public mail visible when another tab replaces or forgets a public saved token', async () => {
    history.replaceState({}, '', '/box@example.com')
    mocks.token.mockResolvedValue({ token: 'public-one', accessKind: 'public', protected: false })
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    for (const value of [JSON.stringify([{ address: 'box@example.com', token: 'public-two' }]), '[]']) {
      localStorage.setItem('tmail.addresses', value)
      act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' })) })
      await flush()
      expect(container.querySelector('.inbox-view')).toBeTruthy()
    }
    expect(mocks.token).toHaveBeenCalledOnce()
  })

  it('retains a successful password replacement when old inbox access fails before the response arrives', async () => {
    history.replaceState({}, '', '/box@example.com')
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())

    const { api } = await import('../api')
    let finish!: (value: { id: string; token: string; accessKind: 'visitor'; protected: boolean }) => void
    vi.spyOn(api, 'setPassword').mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))

    fireEvent.click(container.querySelector('[data-action="password"]')!)
    await waitFor(() => expect(container.querySelector('dialog')).toBeTruthy())
    fireEvent.change(container.querySelector('#mailbox-new-password')!, { target: { value: 'new-password-123' } })
    fireEvent.change(container.querySelector('#mailbox-confirm-password')!, { target: { value: 'new-password-123' } })
    fireEvent.submit(container.querySelector('dialog form')!)
    await flush()

    // Trigger old-bearer revocation via manual refresh rejecting with 401 while mutation is in flight.
    mocks.messages.mockRejectedValueOnce(new ApiError(401, 'Revoked'))
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeNull())
    expect(container.querySelector('dialog')).toBeTruthy()

    finish({ id: 'id', token: 'replacement', accessKind: 'visitor', protected: true })
    await waitFor(() => expect(container.querySelector('.inbox-view')).toBeTruthy())
    expect(container.querySelector('dialog')).toBeNull()
    expect(JSON.parse(localStorage.getItem('tmail.addresses')!)[0].token).toBe('replacement')
    expect(mocks.messages).toHaveBeenLastCalledWith('replacement', 1)
  })
})
