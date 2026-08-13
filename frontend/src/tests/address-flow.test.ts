// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import App from '../App.vue'
import AddressPanel from '../components/AddressPanel.vue'
import ToastStack from '../components/ToastStack.vue'
import { initLocale, setSiteLocale } from '../i18n'
import { useToast } from '../toast'

const mocks = vi.hoisted(() => ({
  domains: vi.fn(),
  token: vi.fn(),
  unlock: vi.fn(),
  lock: vi.fn(),
  site: vi.fn(),
  messages: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, ...mocks } }
})

// AppHeader renders ThemeToggle, whose useTheme() composable reads matchMedia on mount and
// unmount; jsdom has no real implementation. Assigned directly (not vi.stubGlobal) so it
// survives vi.unstubAllGlobals() in this file's afterEach and stays in place for every test's
// mount/unmount cycle, regardless of hook ordering.
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

enableAutoUnmount(afterEach)

describe('address flow', () => {
  beforeEach(() => {
    const { toasts, dismiss } = useToast()
    for (const toast of toasts.value) dismiss(toast.id)
    localStorage.clear()
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hands a direct address link into the inbox without another action', async () => {
    history.replaceState({}, '', '/Box%40Example.com')
    const wrapper = mount(App)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('box@example.com')
    expect(wrapper.find('.inbox-view').exists()).toBe(true)
    expect(wrapper.text()).toContain('box@example.com')
    expect(JSON.parse(localStorage.getItem('tmail.addresses') ?? '[]')).toEqual([
      { address: 'box@example.com', token: 'signed-token' },
    ])
  })

  it('lets visitors choose and persist Vietnamese from the header', async () => {
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.get('select').attributes('aria-label')).toBe('Language')
    expect(wrapper.get('select').findAll('option').map((option) => option.attributes('value'))).toEqual(['en', 'vi'])
    await wrapper.get('select').setValue('vi')
    expect(wrapper.text()).toContain('Tài liệu API')
    expect(document.documentElement.lang).toBe('vi')
    expect(localStorage.getItem('tmail.locale')).toBe('vi')
  })

  it('keeps configured site and ad HTML inside opaque sandbox frames', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(mocks.site).toHaveBeenCalledTimes(1)
    const frames = wrapper.findAll('iframe.site-content-frame')
    expect(frames).toHaveLength(3)
    expect(frames.every((frame) => frame.attributes('src') === '/sandbox?revision=0')).toBe(true)
    expect(frames.every((frame) => frame.attributes('srcdoc') === undefined)).toBe(true)
    expect(frames[1]?.attributes('sandbox')).toContain('allow-scripts')
    expect(frames[1]?.attributes('sandbox')).not.toContain('allow-same-origin')
    expect(wrapper.text()).not.toContain('Configured header')
  })

  it('uses the approved public shell and home layout', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('.app-header .brand').text()).toContain('Temporary Inbox')
    expect(wrapper.get('.saved-inboxes').exists()).toBe(true)
    expect(wrapper.get('.home-hero').text()).toContain('Receive mail. Keep your address.')
    expect(wrapper.get('.address-form').text()).toContain('Create an address')
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

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('.app-header .brand img').attributes('src')).toBe('data:image/png;base64,bG9nbw==')
    expect(wrapper.get('.app-header .brand').text()).toBe('Configured Mail')
    expect(wrapper.get('[role="status"][aria-label="Cookie notice"]').text()).toContain('necessary preference cookie')
    expect(root.style.getPropertyValue('--brand-primary')).toBe('#123456')
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#654321')
    expect(root.lang).toBe('en')
    expect(document.title).toBe('Configured Mail')
    expect(favicon.getAttribute('href')).toBe('data:image/png;base64,aWNvbg==')

    wrapper.unmount()
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

    const wrapper = mount(App)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('bad..local@example.com')
    expect(wrapper.text()).toContain('Invalid address')
  })

  it('opens a tokenized inbox when browser storage denies writes', async () => {
    history.replaceState({}, '', '/box@example.com')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })

    const wrapper = mount(App)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('box@example.com')
    expect(wrapper.find('.inbox-view').exists()).toBe(true)
    expect(wrapper.text()).toContain('box@example.com')
  })

  it('creates a custom address with an active domain', async () => {
    const wrapper = mount(AddressPanel)
    await flushPromises()
    await wrapper.get('#local-part').setValue('paper')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('paper@example.com', undefined)
    expect(wrapper.emitted('open')?.[0]).toEqual([
      { address: 'paper@example.com', token: 'signed-token' },
    ])
  })

  it('opens a random address through the existing token flow', async () => {
    mocks.domains.mockResolvedValue(domains(['one.example', 'two.example']))
    vi.stubGlobal('crypto', { getRandomValues: (values: Uint32Array) => {
      values.set([1, 2, 3, 4, 5, 6])
      return values
    } })
    const wrapper = mount(AddressPanel)
    await flushPromises()
    await wrapper.get('.panel-heading button').trigger('click')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('open')?.[0]?.[0]).toEqual({ address: 'cifuhe@two.example', token: 'signed-token' })
  })

  it('keeps the header unlock control collapsed until requested', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('.header-unlock').text()).toContain('Unlock full access')
    expect(wrapper.find('#header-access-credential').exists()).toBe(false)
  })

  it('unlocks from the header and uses the access token for domains and address creation', async () => {
    mocks.domains.mockResolvedValueOnce(domains([])).mockResolvedValueOnce(domains(['hidden.example']))
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.get('.header-unlock .text-button').trigger('click')
    await wrapper.get('#header-access-credential').setValue('credential')
    await wrapper.get('.header-unlock form').trigger('submit')
    await flushPromises()

    expect(mocks.unlock).toHaveBeenCalledWith('credential')
    expect(mocks.domains).toHaveBeenLastCalledWith(1, 'access-token')
    expect(wrapper.get('.header-unlock').text()).toContain('Unlocked')
    await wrapper.get('#local-part').setValue('paper')
    await wrapper.get('.address-form form').trigger('submit')
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledWith('paper@hidden.example', 'access-token')
  })

  it('shows a toast for an invalid credential without changing domains', async () => {
    mocks.unlock.mockRejectedValueOnce(new ApiError(401, 'Invalid credential'))
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.get('.header-unlock .text-button').trigger('click')
    await wrapper.get('#header-access-credential').setValue('wrong')
    await wrapper.get('.header-unlock form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('The access credential is invalid.')
    expect(mocks.domains).toHaveBeenCalledTimes(1)
    expect(wrapper.get('#domain').text()).toContain('example.com')
    expect(localStorage.getItem('tmail.accessToken')).toBeNull()
  })

  it('locks from the header, clears the token, and reloads the filtered domain list', async () => {
    localStorage.setItem('tmail.accessToken', 'access-token')
    mocks.domains.mockResolvedValueOnce(domains(['hidden.example'])).mockResolvedValueOnce(domains(['example.com']))
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.get('.header-unlock .text-button').trigger('click')
    await flushPromises()

    expect(mocks.lock).toHaveBeenCalledWith('access-token')
    expect(mocks.domains).toHaveBeenLastCalledWith(1, undefined)
    expect(wrapper.get('#domain').text()).toContain('example.com')
    expect(localStorage.getItem('tmail.accessToken')).toBeNull()
  })

  it('restores unlocked access from local storage after a page reload', async () => {
    localStorage.setItem('tmail.accessToken', 'saved-token')
    const firstMount = mount(App)
    await flushPromises()
    firstMount.unmount()

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('.header-unlock').text()).toContain('Unlocked')
    expect(mocks.domains).toHaveBeenLastCalledWith(1, 'saved-token')
  })

  it('resets copied state when the composed address changes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const wrapper = mount(AddressPanel)
    await flushPromises()
    await wrapper.get('#local-part').setValue('paper')
    await wrapper.get('.address-preview button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.address-preview button').text()).toBe('Copied')

    await wrapper.get('#local-part').setValue('changed')

    expect(wrapper.get('.address-preview button').text()).toBe('Copy')
  })

  it('shows a successful copy toast after a failed retry', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
    const wrapper = mount(AddressPanel)
    const toastStack = mount(ToastStack)
    await flushPromises()
    await wrapper.get('#local-part').setValue('paper')
    await wrapper.get('.address-preview button').trigger('click')
    await flushPromises()
    expect(toastStack.text()).toContain('Copy failed')

    await wrapper.get('.address-preview button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.address-preview button').text()).toBe('Copied')
    expect(toastStack.get('[role="status"]').text()).toContain('Address copied')
  })

  it('shows a useful empty-domain state', async () => {
    mocks.domains.mockResolvedValue(domains([]))
    const wrapper = mount(AddressPanel)
    await flushPromises()
    expect(wrapper.text()).toContain('No receiving domains are available')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows a Hydra domain-loading error separately from an empty list', async () => {
    mocks.domains.mockRejectedValue(new ApiError(502, 'Domain list unavailable'))
    const wrapper = mount(AddressPanel)
    await flushPromises()
    expect(wrapper.text()).toContain('Domain list unavailable')
    expect(wrapper.text()).toContain('Retry')
  })

  it('keeps Back and Forward history aligned with the rendered inbox', async () => {
    const pushState = vi.spyOn(history, 'pushState')
    const travel = async (move: () => void) => {
      const moved = new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true })
      })
      move()
      await moved
      await flushPromises()
    }
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.get('#local-part').setValue('alpha')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(location.pathname).toBe('/alpha%40example.com')

    await wrapper.get('[data-action="new-address"]').trigger('click')
    await flushPromises()
    await wrapper.get('#local-part').setValue('beta')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(location.pathname).toBe('/beta%40example.com')

    await travel(() => history.back())
    expect(location.pathname).toBe('/')
    expect(wrapper.text()).toContain('Receive mail. Keep your address.')

    await travel(() => history.back())
    expect(location.pathname).toBe('/alpha%40example.com')
    expect(wrapper.text()).toContain('alpha@example.com')

    await travel(() => history.forward())
    expect(location.pathname).toBe('/')

    await travel(() => history.forward())
    expect(location.pathname).toBe('/beta%40example.com')
    expect(wrapper.text()).toContain('beta@example.com')
    expect(pushState).toHaveBeenCalledTimes(3)
  })

  it('returns to the address form when the header brand is clicked', async () => {
    history.replaceState({}, '', '/box@example.com')
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.find('.inbox-view').exists()).toBe(true)

    await wrapper.get('.app-header .brand').trigger('click')
    await flushPromises()

    expect(location.pathname).toBe('/')
    expect(wrapper.find('.inbox-view').exists()).toBe(false)
    expect(wrapper.get('.home-hero').text()).toContain('Receive mail. Keep your address.')
  })

  it('leaves a modifier-clicked header brand alone (no reset, no address change)', async () => {
    history.replaceState({}, '', '/box@example.com')
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.find('.inbox-view').exists()).toBe(true)
    const pathBefore = location.pathname

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    const prevented = !wrapper.get('.app-header .brand').element.dispatchEvent(event)
    await flushPromises()

    expect(prevented).toBe(false)
    expect(location.pathname).toBe(pathBefore)
    expect(wrapper.find('.inbox-view').exists()).toBe(true)
    expect(wrapper.text()).toContain('box@example.com')
  })

  it('removes its history listener when the app unmounts', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(App)
    await flushPromises()
    const handler = add.mock.calls.find(([type]) => type === 'popstate')?.[1]

    expect(handler).toEqual(expect.any(Function))
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('popstate', handler)
  })
})
