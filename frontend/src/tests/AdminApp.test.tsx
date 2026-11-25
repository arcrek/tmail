// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminApp from '../admin/AdminApp'
import ContentTab from '../admin/ContentTab'
import DashboardTab from '../admin/DashboardTab'
import DomainsTab from '../admin/DomainsTab'
import GeneralTab from '../admin/GeneralTab'
import MailServerTab from '../admin/MailServerTab'
import { createTMailTheme } from '../muiTheme'
import { getToasts, toastActions, useToast } from '../toast'
import { renderWithTheme } from './renderWithTheme'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  session: vi.fn(),
  logout: vi.fn(),
  settings: vi.fn(),
  updateSettings: vi.fn(),
  syncDomains: vi.fn(),
  testMail: vi.fn(),
  dashboard: vi.fn(),
  accessList: vi.fn(),
  accessCreate: vi.fn(),
  accessRemove: vi.fn(),
  deletedList: vi.fn(),
  deletedGet: vi.fn(),
  deletedSource: vi.fn(),
  deletedRemove: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    api: {
      ...actual.api,
      admin: {
        ...actual.api.admin,
        ...mocks,
        accessCredentials: {
          ...actual.api.admin.accessCredentials,
          list: mocks.accessList,
          create: mocks.accessCreate,
          remove: mocks.accessRemove,
        },
        deletedMessages: {
          ...actual.api.admin.deletedMessages,
          list: mocks.deletedList,
          get: mocks.deletedGet,
          source: mocks.deletedSource,
          remove: mocks.deletedRemove,
        },
      },
    },
  }
})

function clearToasts(): void {
  for (const entry of [...getToasts()]) toastActions.dismiss(entry.id)
}

function TestToastBridge() {
  const { toasts } = useToast()
  return (
    <div data-testid="toast-bridge">
      {toasts.map((entry) => (
        <div key={entry.id} role={entry.kind === 'error' ? 'alert' : 'status'}>
          {entry.message}
        </div>
      ))}
    </div>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function mockMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const site = {
  appName: 'tmail',
  logoDataUrl: '',
  faviconDataUrl: '',
  primaryColor: '#45478f',
  accentColor: '#34366f',
  language: 'en',
  cookieEnabled: false,
  cookieText: '',
  fetchSeconds: 20,
  messageLimit: 50,
  headerHtml: '<header>Header</header>',
  footerHtml: '<footer>Footer</footer>',
  contentCss: 'body { color: navy; }',
  adSlots: { sidebar: '<script>window.ad = true</script>' },
  autoSyncDomains: true,
  localPartMin: 3,
  localPartMax: 32,
  forbiddenIds: ['admin'],
  blockedSenderDomains: ['blocked.example'],
  blacklistedDomains: ['private.example'],
  manualDomains: ['manual.example'],
}

const mailServer = {
  jmapUrl: 'https://mail.example/jmap',
  jmapToken: '********',
  catchallAddress: 'admin@example.com',
  mailAccountId: '',
  retentionDays: 30,
}

const settings = {
  site,
  mailServer,
  domains: ['example.com', 'mail.example'],
  lastSync: { success: true, detail: '2 domains', created_at: '2026-07-22T08:00:00Z' },
  lastSuccessfulSync: { success: true, detail: '2 domains', created_at: '2026-07-22T08:00:00Z' },
  lastSyncError: { success: false, detail: 'TimeoutError', created_at: '2026-07-21T08:00:00Z' },
}

const dashboard = {
  messages: { stored: 41, today: 6, sevenDays: 29 },
  domains: {
    active: 2,
    domainsToday: 3,
    domainsSevenDays: 9,
    recentDomains: [],
    recentMxFailures: [],
    mxFailures24h: 0,
  },
  autoSyncDomains: true,
  lastSync: { success: false, detail: 'ValueError', created_at: '2026-07-22T09:00:00Z' },
  lastSuccessfulSync: { success: true, detail: '2 domains', created_at: '2026-07-22T08:00:00Z' },
  lastSyncError: { success: false, detail: 'ValueError', created_at: '2026-07-22T09:00:00Z' },
}

const failedSettings = {
  ...settings,
  lastSync: { success: false, detail: 'ValueError', created_at: '2026-07-22T09:00:00Z' },
  lastSyncError: { success: false, detail: 'ValueError', created_at: '2026-07-22T09:00:00Z' },
}

const syncedSettings = {
  ...settings,
  domains: ['new.example'],
  lastSync: { success: true, detail: '1 domain', created_at: '2026-07-22T10:00:00Z' },
  lastSuccessfulSync: { success: true, detail: '1 domain', created_at: '2026-07-22T10:00:00Z' },
}

async function signInAdmin(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('#admin-password')!
  fireEvent.change(input, { target: { value: 'correct horse' } })
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => {
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(7)
  })
}

function getTab(container: HTMLElement, name: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (item) => item.textContent?.trim() === name,
  )
  if (!match) throw new Error(`Tab not found: ${name}`)
  return match
}

describe('administration frontend', () => {
  beforeEach(() => {
    mockMatchMedia()
    clearToasts()
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.login.mockResolvedValue({ csrfToken: 'csrf-value' })
    mocks.session.mockRejectedValue(new Error('No active session'))
    mocks.logout.mockResolvedValue(undefined)
    mocks.settings.mockResolvedValue(settings)
    mocks.updateSettings.mockResolvedValue(settings)
    mocks.syncDomains.mockResolvedValue({
      domains: ['new.example'],
      lastSync: { success: true, detail: '1 domain', created_at: '2026-07-22T09:00:00Z' },
    })
    mocks.testMail.mockResolvedValue({ ok: true, domainCount: 2, messages: dashboard.messages })
    mocks.dashboard.mockResolvedValue(dashboard)
    mocks.accessList.mockResolvedValue({ credentials: [] })
    mocks.accessCreate.mockResolvedValue({
      id: 'credential-id',
      kind: 'password',
      label: 'Main password',
      createdAt: '2026-08-13T00:00:00Z',
    })
    mocks.accessRemove.mockResolvedValue(undefined)
    mocks.deletedList.mockResolvedValue({ totalItems: 0, page: 1, limit: 20, member: [] })
    mocks.deletedGet.mockResolvedValue(null)
    mocks.deletedSource.mockResolvedValue(new Blob(['raw eml'], { type: 'message/rfc822' }))
    mocks.deletedRemove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    clearToasts()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses M3 light and dark theme tokens and preserves reduced-motion base rules', () => {
    const light = createTMailTheme('light')
    const dark = createTMailTheme('dark')

    expect(light.palette.m3.surface).toBe('#F9F9FF')
    expect(dark.palette.m3.surface).toBe('#111318')
    expect(light.palette.m3.errorContainer).toBe('#FFDAD6')
    expect(dark.palette.m3.errorContainer).toBe('#93000A')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).not.toContain('#fffdf7')
    expect(styles).not.toContain('#55534d')
  })

  it('logs in without persisting the password and exposes tabs in the required order', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const { container } = renderWithTheme(<AdminApp />)

    expect(container.querySelector('input[type="password"]')).not.toBeNull()
    expect(container.querySelector('.admin-note')?.textContent).toContain('Your session is kept for 12 hours on this device.')
    expect(container.querySelector('.admin-note')?.textContent).not.toContain('Sign in again after a reload.')
    expect(mocks.settings).not.toHaveBeenCalled()

    await signInAdmin(container)

    expect(mocks.login).toHaveBeenCalledWith('correct horse')
    expect(mocks.settings).toHaveBeenCalledTimes(1)
    expect(storage).not.toHaveBeenCalled()

    const tabElements = Array.from(container.querySelectorAll('[role="tab"]'))
    expect(tabElements.map((tab) => tab.textContent?.trim())).toEqual([
      'Dashboard',
      'Domains & Inbox',
      'Deleted Mail',
      'General',
      'Mail Server',
      'Access',
      'HTML & Ads',
    ])
    expect(tabElements.map((tab) => tab.id)).toEqual([
      'admin-tab-0',
      'admin-tab-1',
      'admin-tab-2',
      'admin-tab-3',
      'admin-tab-4',
      'admin-tab-5',
      'admin-tab-6',
    ])
    expect(Array.from(container.querySelectorAll('.admin-nav-label')).map((label) => label.textContent)).toEqual([
      'Operations',
      'Configuration',
    ])
    expect(container.querySelector('.admin-sidebar .admin-account-controls')?.textContent).not.toContain('Healthy')
    expect(container.querySelector('.admin-public-link')?.getAttribute('href')).toBe('/')
    expect(container.querySelector('.admin-shell')?.children).toHaveLength(3)
    expect(container.querySelector('.admin-sidebar')?.textContent).toContain('Dashboard')
    expect(container.querySelector('.admin-content [role="tabpanel"]')).not.toBeNull()
    expect(container.textContent).not.toMatch(/Sent|Contacts|Addresses/)
    expect(container.querySelector('main')).toBeNull()
  })

  it('resumes an existing admin session on reload', async () => {
    mocks.session.mockResolvedValueOnce({ csrfToken: 'resumed-csrf' })
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    const { container } = renderWithTheme(<AdminApp />)

    await waitFor(() => {
      expect(container.querySelectorAll('[role="tab"]')).toHaveLength(7)
    })

    expect(mocks.settings).toHaveBeenCalledTimes(1)
    fireEvent.click(container.querySelector('.rail-signout')!)

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledWith('resumed-csrf')
    })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'tmail-admin-logout' }))
  })

  it('invalidates a new session when settings hydration fails', async () => {
    mocks.settings.mockRejectedValueOnce(new Error('Settings unavailable'))
    const { container } = renderWithTheme(<AdminApp />)

    fireEvent.change(container.querySelector('#admin-password')!, { target: { value: 'correct horse' } })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Settings unavailable')
    })

    expect(mocks.logout).toHaveBeenCalledWith('csrf-value')
    expect(container.querySelector('input[type="password"]')).not.toBeNull()
  })

  it('retains failed hydration cleanup state until retry succeeds', async () => {
    mocks.settings.mockRejectedValueOnce(new Error('Settings unavailable'))
    mocks.logout.mockRejectedValueOnce(new Error('Cleanup unavailable')).mockResolvedValueOnce(undefined)
    const { container } = renderWithTheme(<AdminApp />)

    fireEvent.change(container.querySelector('#admin-password')!, { target: { value: 'correct horse' } })
    fireEvent.submit(container.querySelector('form')!)

    const findRetry = () =>
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Retry session cleanup')

    await waitFor(() => {
      expect(findRetry()).toBeDefined()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Cleanup unavailable')
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)

    fireEvent.click(findRetry()!)

    await waitFor(() => {
      expect(findRetry()).toBeUndefined()
    })
    expect(mocks.logout).toHaveBeenCalledTimes(2)
    expect(mocks.logout).toHaveBeenLastCalledWith('csrf-value')
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
  })

  it('retains the authenticated session until logout succeeds', async () => {
    const logoutDeferred = deferred<void>()
    mocks.logout.mockReturnValueOnce(logoutDeferred.promise)
    const { container } = renderWithTheme(<AdminApp />)

    await signInAdmin(container)

    fireEvent.click(container.querySelector('.rail-signout')!)
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(7)

    logoutDeferred.reject(new Error('Logout unavailable'))
    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Logout unavailable')
    })
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(7)

    fireEvent.click(container.querySelector('.rail-signout')!)
    await waitFor(() => {
      expect(container.querySelector('input[type="password"]')).not.toBeNull()
    })
  })

  it('moves between admin tabs with arrow keys', async () => {
    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' })

    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
    expect(container.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tabs[1]?.id)
  })

  it('moves across drawer groups with arrow keys', async () => {
    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    fireEvent.click(tabs[2]!)
    fireEvent.keyDown(tabs[2]!, { key: 'ArrowDown' })

    expect(tabs[3]?.textContent?.trim()).toBe('General')
    expect(tabs[3]?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[3])
  })

  it('manages access credentials from the Access tab with DataGrid', async () => {
    const password = { id: 'password-id', kind: 'password' as const, label: 'Main password', createdAt: '2026-08-13T00:00:00Z' }
    const token = { id: 'token-id', kind: 'token' as const, label: 'CI token', createdAt: '2026-08-13T00:00:00Z' }
    mocks.accessList
      .mockResolvedValueOnce({ credentials: [] })
      .mockResolvedValueOnce({ credentials: [password] })
      .mockResolvedValueOnce({ credentials: [password, token] })
      .mockResolvedValueOnce({ credentials: [password, token] })
      .mockResolvedValueOnce({ credentials: [password] })
    mocks.accessCreate.mockResolvedValueOnce(password).mockResolvedValueOnce({ ...token, secret: 'one-time-secret' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    fireEvent.click(getTab(container, 'Access'))
    await waitFor(() => {
      expect(container.textContent).toContain('No access credentials have been created.')
    })
    expect(container.querySelector('.MuiDataGrid-root')).not.toBeNull()

    fireEvent.change(container.querySelector('#access-password-label')!, { target: { value: 'Main password' } })
    fireEvent.change(container.querySelector('#access-password')!, { target: { value: 'correct horse' } })
    fireEvent.change(container.querySelector('#access-password-confirm')!, { target: { value: 'correct horse' } })
    fireEvent.submit(container.querySelectorAll('.settings-form')[0]!)

    await waitFor(() => {
      expect(container.textContent).toContain('Main password')
    })
    expect(mocks.accessCreate).toHaveBeenCalledWith(
      { kind: 'password', label: 'Main password', password: 'correct horse' },
      'csrf-value',
    )

    fireEvent.change(container.querySelector('#access-token-label')!, { target: { value: 'CI token' } })
    fireEvent.submit(container.querySelectorAll('.settings-form')[1]!)

    await waitFor(() => {
      expect(container.textContent).toContain('one-time-secret')
    })

    fireEvent.click(getTab(container, 'General'))
    fireEvent.click(getTab(container, 'Access'))
    await waitFor(() => {
      expect(container.querySelectorAll('button.danger-text')).toHaveLength(2)
    })
    expect(container.textContent).not.toContain('one-time-secret')

    fireEvent.click(container.querySelectorAll('button.danger-text')[1]!)
    await waitFor(() => {
      expect(mocks.accessRemove).toHaveBeenCalledWith('token-id', 'csrf-value')
      expect(container.textContent).not.toContain('CI token')
    })
    expect(container.textContent).not.toContain('one-time-secret')
  })

  it('disables tab switching while an Access-tab mutation is pending', async () => {
    const response = deferred<{ id: string; kind: 'password'; label: string; createdAt: string }>()
    mocks.accessCreate.mockReturnValueOnce(response.promise)
    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    fireEvent.click(getTab(container, 'Access'))
    await waitFor(() => {
      expect(container.querySelector('#access-password-label')).not.toBeNull()
    })

    fireEvent.change(container.querySelector('#access-password-label')!, { target: { value: 'Main password' } })
    fireEvent.change(container.querySelector('#access-password')!, { target: { value: 'correct horse' } })
    fireEvent.change(container.querySelector('#access-password-confirm')!, { target: { value: 'correct horse' } })
    fireEvent.submit(container.querySelectorAll('.settings-form')[0]!)

    expect(getTab(container, 'General').disabled).toBe(true)
    fireEvent.click(getTab(container, 'General'))
    expect(container.querySelector('#access-password-label')).not.toBeNull()

    response.resolve({ id: 'password-id', kind: 'password', label: 'Main password', createdAt: '2026-08-13T00:00:00Z' })
    await waitFor(() => {
      expect(getTab(container, 'General').disabled).toBe(false)
    })
  })

  it('renders mail activity without host metrics or charts', async () => {
    const { container } = renderWithTheme(<DashboardTab />)

    await waitFor(() => {
      expect(container.querySelector('[aria-labelledby="kpi-mail-title"]')).not.toBeNull()
    })

    const mail = container.querySelector('[aria-labelledby="kpi-mail-title"]')!
    expect(mail.querySelector('h2')?.textContent).toBe('Mail')
    expect(Array.from(mail.querySelectorAll('dt')).map((term) => term.textContent)).toEqual(['Stored', 'Today', '7 days'])
    expect(mail.textContent).toContain('41')
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.textContent).not.toMatch(/CPU|memory|host uptime|provision|auto-sync/i)
  })

  it('saves general settings with the in-memory CSRF token', async () => {
    const { container } = renderWithTheme(
      <>
        <GeneralTab site={site} csrf="csrf-value" />
        <TestToastBridge />
      </>,
    )

    fireEvent.change(container.querySelector('input[name="appName"]')!, { target: { value: 'Mail Desk' } })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(container.querySelector('[role="status"]')?.textContent).toContain('saved')
    })

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      {
        site: {
          appName: 'Mail Desk',
          logoDataUrl: '',
          faviconDataUrl: '',
          primaryColor: '#45478f',
          accentColor: '#34366f',
          language: 'en',
          cookieEnabled: false,
          cookieText: '',
        },
      },
      'csrf-value',
    )
  })

  it('rejects non-image and oversized branding files before save', async () => {
    const { container } = renderWithTheme(
      <>
        <GeneralTab site={site} csrf="csrf-value" />
        <TestToastBridge />
      </>,
    )
    const input = container.querySelector<HTMLInputElement>('input[name="logo"]')!

    const oversized = new File([new Uint8Array(1024 * 1024 + 1)], 'logo.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [oversized] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="toast-bridge"]')?.textContent).toContain('no larger than 1 MiB')
    })
    expect(mocks.updateSettings).not.toHaveBeenCalled()

    const text = new File(['not an image'], 'logo.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [text] } })
    await waitFor(() => {
      expect(container.querySelector('[data-testid="toast-bridge"]')?.textContent).toContain('Choose an image file')
    })
  })

  it('keeps save disabled for overlapping file reads and uses only the latest selection', async () => {
    class DeferredReader {
      static instances: DeferredReader[] = []
      result: string | ArrayBuffer | null = null
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null
      constructor() {
        DeferredReader.instances.push(this)
      }
      readAsDataURL() {}
    }
    vi.stubGlobal('FileReader', DeferredReader)
    const { container } = renderWithTheme(<GeneralTab site={site} csrf="csrf-value" />)
    const input = container.querySelector<HTMLInputElement>('input[name="logo"]')!

    for (const name of ['old.png', 'new.png']) {
      fireEvent.change(input, { target: { files: [new File([name], name, { type: 'image/png' })] } })
    }

    DeferredReader.instances[1]!.result = 'data:image/png;base64,bmV3'
    DeferredReader.instances[1]!.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>)
    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    })

    DeferredReader.instances[0]!.onabort?.(new ProgressEvent('abort') as ProgressEvent<FileReader>)
    await waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
    })

    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        { site: expect.objectContaining({ logoDataUrl: 'data:image/png;base64,bmV3' }) },
        'csrf-value',
      )
    })
    expect(container.textContent).not.toContain('Could not read image')
  })

  it('reports an aborted current image read and unlocks save', async () => {
    class AbortedReader {
      result = null
      onload = null
      onerror = null
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null
      readAsDataURL() {
        queueMicrotask(() => this.onabort?.(new ProgressEvent('abort') as ProgressEvent<FileReader>))
      }
    }
    vi.stubGlobal('FileReader', AbortedReader)
    const { container } = renderWithTheme(
      <>
        <GeneralTab site={site} csrf="csrf-value" />
        <TestToastBridge />
      </>,
    )
    const input = container.querySelector<HTMLInputElement>('input[name="logo"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="toast-bridge"]')?.textContent).toContain('Could not read image')
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
    })
  })

  it('preserves an unchanged masked token and tests mail with CSRF', async () => {
    const { container } = renderWithTheme(<MailServerTab mailServer={mailServer} csrf="csrf-value" />)
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        { mailServer: expect.not.objectContaining({ jmapToken: expect.anything() }) },
        'csrf-value',
      )
    })

    fireEvent.click(container.querySelector('button[type="button"]')!)
    await waitFor(() => {
      expect(mocks.testMail).toHaveBeenCalledWith('csrf-value')
    })
  })

  it('locks every settings form and preserves its draft while a save is pending', async () => {
    const response = deferred<typeof settings>()
    mocks.updateSettings.mockReturnValue(response.promise)

    const general = renderWithTheme(<GeneralTab site={site} csrf="csrf-value" />)
    const mail = renderWithTheme(<MailServerTab mailServer={mailServer} csrf="csrf-value" />)
    const domains = renderWithTheme(
      <DomainsTab
        site={site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
      />,
    )
    const content = renderWithTheme(<ContentTab site={site} csrf="csrf-value" />)

    fireEvent.change(general.container.querySelector('input[name="appName"]')!, { target: { value: 'Draft app' } })
    fireEvent.change(mail.container.querySelector('input[name="jmapUrl"]')!, { target: { value: 'https://draft.example/jmap' } })
    fireEvent.change(domains.container.querySelector('input[name="fetchSeconds"]')!, { target: { value: '45' } })
    fireEvent.change(content.container.querySelector('textarea[name="headerHtml"]')!, { target: { value: 'Draft header' } })

    fireEvent.submit(general.container.querySelector('form')!)
    fireEvent.submit(mail.container.querySelector('form')!)
    fireEvent.submit(content.container.querySelector('form')!)
    fireEvent.submit(domains.container.querySelectorAll('form')[1]!)

    const theme = createTMailTheme('light')
    general.rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GeneralTab site={{ ...site, appName: 'Remote app' }} csrf="csrf-value" />
      </ThemeProvider>,
    )
    mail.rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MailServerTab mailServer={{ ...mailServer, jmapUrl: 'https://remote.example/jmap' }} csrf="csrf-value" />
      </ThemeProvider>,
    )
    domains.rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <DomainsTab
          site={{ ...site, fetchSeconds: 90 }}
          domains={settings.domains}
          lastSync={settings.lastSync}
          lastSuccessfulSync={settings.lastSuccessfulSync}
          lastSyncError={settings.lastSyncError}
          csrf="csrf-value"
        />
      </ThemeProvider>,
    )
    content.rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ContentTab site={{ ...site, headerHtml: 'Remote header' }} csrf="csrf-value" />
      </ThemeProvider>,
    )

    for (const view of [general, mail, domains, content]) {
      expect(view.container.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true)
    }
    expect(general.container.querySelector<HTMLInputElement>('input[name="appName"]')?.value).toBe('Draft app')
    expect(mail.container.querySelector<HTMLInputElement>('input[name="jmapUrl"]')?.value).toBe('https://draft.example/jmap')
    expect(domains.container.querySelector<HTMLInputElement>('input[name="fetchSeconds"]')?.value).toBe('45')
    expect(content.container.querySelector<HTMLTextAreaElement>('textarea[name="headerHtml"]')?.value).toBe('Draft header')

    response.resolve(settings)
    await waitFor(() => {
      expect(general.container.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(false)
    })
  }, 15_000)

  it('saves blacklisted web domains through the domain settings form', async () => {
    const { container } = renderWithTheme(
      <DomainsTab
        site={site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
      />,
    )

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[name="blacklistedDomains"]')!
    expect(textarea.value).toBe('private.example')
    fireEvent.change(textarea, { target: { value: 'private.example, hidden.example\nblocked.example' } })
    fireEvent.submit(container.querySelectorAll('form')[1]!)

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        {
          site: expect.objectContaining({
            blacklistedDomains: ['private.example', 'hidden.example', 'blocked.example'],
          }),
        },
        'csrf-value',
      )
    })
    expect(container.textContent).toContain('*.example.com')
    expect(container.textContent).toContain('Manual whitelist entries win')
  })

  it('removes manual domains and excludes synced domains from public web access', async () => {
    const manual = { ...settings, site: { ...site, manualDomains: ['example.com'] } }
    const response = deferred<typeof manual>()
    mocks.updateSettings.mockReturnValueOnce(response.promise).mockResolvedValueOnce(manual)

    const manualView = renderWithTheme(
      <DomainsTab
        site={manual.site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
      />,
    )
    expect(manualView.container.querySelector('.MuiDataGrid-root')).not.toBeNull()
    const remove = manualView.container.querySelector<HTMLButtonElement>('button[aria-label="Remove example.com"]')!
    fireEvent.click(remove)
    expect(remove.disabled).toBe(true)

    response.resolve(manual)
    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({ site: { manualDomains: [] } }, 'csrf-value')
    })

    const synced = { ...settings, site: { ...site, manualDomains: [] } }
    const syncedView = renderWithTheme(
      <DomainsTab
        site={synced.site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
      />,
    )
    fireEvent.click(syncedView.container.querySelector('button[aria-label="Remove example.com"]')!)
    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenLastCalledWith(
        { site: { blacklistedDomains: ['private.example', 'example.com'] } },
        'csrf-value',
      )
    })
  })

  it('blocks tab navigation until a deferred child save updates parent settings', async () => {
    const response = deferred<typeof settings>()
    mocks.updateSettings.mockReturnValueOnce(response.promise)
    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    fireEvent.click(getTab(container, 'General'))
    fireEvent.change(container.querySelector('input[name="appName"]')!, { target: { value: 'Saved app' } })
    fireEvent.submit(container.querySelector('form')!)

    expect(getTab(container, 'Mail Server').disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('.rail-signout')?.disabled).toBe(true)
    fireEvent.click(getTab(container, 'Mail Server'))
    expect(container.querySelector('input[name="appName"]')).not.toBeNull()

    response.resolve({ ...settings, site: { ...site, appName: 'Saved app' } })
    await waitFor(() => {
      expect(getTab(container, 'Mail Server').disabled).toBe(false)
    })

    fireEvent.click(getTab(container, 'Mail Server'))
    fireEvent.click(getTab(container, 'General'))
    expect(container.querySelector<HTMLInputElement>('input[name="appName"]')?.value).toBe('Saved app')
  })

  it('warns that disabling auto-sync freezes the current whitelist', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = renderWithTheme(
      <DomainsTab
        site={site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
      />,
    )
    const checkbox = container.querySelector<HTMLInputElement>('input[name="autoSyncDomains"]')!
    fireEvent.click(checkbox)

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/current whitelist.*freeze/i))
    expect(checkbox.checked).toBe(true)
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  it('persists auto-sync immediately and keeps it in the later full save', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const updated = {
      ...settings,
      site: { ...site, autoSyncDomains: false },
      domains: ['updated.example'],
    }
    mocks.updateSettings.mockResolvedValueOnce(updated).mockResolvedValueOnce(updated)
    const onUpdated = vi.fn()
    const { container } = renderWithTheme(
      <DomainsTab
        site={site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
        onUpdated={onUpdated}
      />,
    )

    fireEvent.click(container.querySelector('input[name="autoSyncDomains"]')!)

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenNthCalledWith(1, { site: { autoSyncDomains: false } }, 'csrf-value')
      expect(container.textContent).toContain('updated.example')
    })
    expect(onUpdated).toHaveBeenCalledWith(updated)

    fireEvent.submit(container.querySelectorAll('form')[1]!)
    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenNthCalledWith(
        2,
        { site: expect.objectContaining({ autoSyncDomains: false }) },
        'csrf-value',
      )
    })
  })

  it('rolls back auto-sync when the immediate update fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.updateSettings.mockRejectedValueOnce(new Error('save offline'))
    const { container } = renderWithTheme(
      <>
        <DomainsTab
          site={site}
          domains={settings.domains}
          lastSync={settings.lastSync}
          lastSuccessfulSync={settings.lastSuccessfulSync}
          lastSyncError={settings.lastSyncError}
          csrf="csrf-value"
        />
        <TestToastBridge />
      </>,
    )

    fireEvent.click(container.querySelector('input[name="autoSyncDomains"]')!)

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('save offline')
    })
    expect(container.querySelector<HTMLInputElement>('input[name="autoSyncDomains"]')?.checked).toBe(true)
  })

  it('adds a receiving domain only after the settings response succeeds', async () => {
    const added = {
      ...settings,
      site: { ...site, manualDomains: ['manual.example', 'added.example'] },
      domains: [...settings.domains, 'added.example'],
    }
    mocks.updateSettings.mockResolvedValueOnce(added).mockRejectedValueOnce(new Error('save offline'))
    const { container } = renderWithTheme(
      <>
        <DomainsTab
          site={site}
          domains={settings.domains}
          lastSync={settings.lastSync}
          lastSuccessfulSync={settings.lastSuccessfulSync}
          lastSyncError={settings.lastSyncError}
          csrf="csrf-value"
        />
        <TestToastBridge />
      </>,
    )

    const input = container.querySelector<HTMLInputElement>('input[name="manualDomain"]')!
    fireEvent.change(input, { target: { value: ' Added.Example ' } })
    fireEvent.submit(container.querySelectorAll('form')[0]!)

    await waitFor(() => {
      expect(container.querySelector('.domain-list')?.textContent).toContain('added.example')
    })
    expect(mocks.updateSettings).toHaveBeenNthCalledWith(
      1,
      { site: { manualDomains: ['manual.example', 'Added.Example'] } },
      'csrf-value',
    )
    expect(input.value).toBe('')

    fireEvent.change(input, { target: { value: 'retry.example' } })
    fireEvent.submit(container.querySelectorAll('form')[0]!)

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('save offline')
    })
    expect(input.value).toBe('retry.example')
    expect(container.querySelector('.domain-list')?.textContent).toContain('added.example')
  })

  it('replaces the displayed whitelist only after a successful manual sync', async () => {
    mocks.syncDomains.mockRejectedValueOnce(new Error('offline'))
    mocks.settings.mockResolvedValueOnce(failedSettings).mockResolvedValueOnce(syncedSettings)
    const onUpdated = vi.fn()
    const { container } = renderWithTheme(
      <DomainsTab
        site={site}
        domains={settings.domains}
        lastSync={settings.lastSync}
        lastSuccessfulSync={settings.lastSuccessfulSync}
        lastSyncError={settings.lastSyncError}
        csrf="csrf-value"
        onUpdated={onUpdated}
      />,
    )

    const syncButton = container.querySelector('.admin-section-heading button')!
    fireEvent.click(syncButton)

    await waitFor(() => {
      expect(container.textContent).toContain('ValueError')
    })
    expect(container.textContent).toContain('example.com')
    expect(container.textContent).not.toContain('new.example')
    expect(onUpdated).toHaveBeenNthCalledWith(1, failedSettings)

    fireEvent.click(syncButton)
    await waitFor(() => {
      expect(container.textContent).toContain('new.example')
    })
    expect(container.textContent).not.toContain('mail.example')
    expect(onUpdated).toHaveBeenNthCalledWith(2, syncedSettings)
    expect(mocks.settings).toHaveBeenCalledTimes(2)
  })

  it('keeps the successful POST whitelist when the settings refresh fails', async () => {
    mocks.syncDomains.mockResolvedValueOnce({
      domains: ['post.example'],
      lastSync: { success: true, detail: '1 domain', created_at: '2026-07-22T11:00:00Z' },
    })
    mocks.settings.mockRejectedValue(new Error('refresh offline'))
    const onSynced = vi.fn()
    const { container } = renderWithTheme(
      <>
        <DomainsTab
          site={site}
          domains={settings.domains}
          lastSync={settings.lastSync}
          lastSuccessfulSync={settings.lastSuccessfulSync}
          lastSyncError={settings.lastSyncError}
          csrf="csrf-value"
          onSynced={onSynced}
        />
        <TestToastBridge />
      </>,
    )

    fireEvent.click(container.querySelector('.admin-section-heading button')!)

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('synced, but settings refresh failed')
    })
    expect(container.textContent).toContain('post.example')
    expect(container.textContent).not.toContain('mail.example')
    const lastSuccessfulSync = Array.from(container.querySelectorAll('.sync-summary dl > div')).find(
      (row) => row.querySelector('dt')?.textContent === 'Last successful sync',
    )
    expect(lastSuccessfulSync?.querySelector('dd')?.textContent).toContain('1 domain')
    expect(lastSuccessfulSync?.querySelector('dd')?.textContent).not.toContain('2 domains')
    expect(mocks.settings).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledWith(
      ['post.example'],
      { success: true, detail: '1 domain', created_at: '2026-07-22T11:00:00Z' },
    )
  })

  it('keeps an authoritative synced whitelist after the domains tab remounts', async () => {
    mocks.settings.mockResolvedValueOnce(settings).mockResolvedValueOnce(syncedSettings)
    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    fireEvent.click(getTab(container, 'Domains & Inbox'))
    fireEvent.click(container.querySelector('.admin-section-heading button')!)
    await waitFor(() => {
      expect(container.textContent).toContain('new.example')
    })

    fireEvent.click(getTab(container, 'General'))
    fireEvent.click(getTab(container, 'Domains & Inbox'))

    expect(container.textContent).toContain('new.example')
    expect(container.textContent).not.toContain('mail.example')
  })

  it('previews HTML and ads only in opaque content sandbox frames', () => {
    const { container } = renderWithTheme(<ContentTab site={site} csrf="csrf-value" />)
    const frames = Array.from(container.querySelectorAll('iframe'))

    expect(frames.length).toBeGreaterThanOrEqual(3)
    for (const frame of frames) {
      expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
      expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    }
    expect(container.textContent).toContain('cannot access inbox storage')
    expect(container.querySelector('[contenteditable]')).toBeNull()
  })

  it('rejects duplicate normalized ad names and oversized content before submit', async () => {
    const { container } = renderWithTheme(
      <>
        <ContentTab site={site} csrf="csrf-value" />
        <TestToastBridge />
      </>,
    )

    fireEvent.click(container.querySelector('.subsection-heading button')!)
    const names = container.querySelectorAll<HTMLInputElement>('.ad-editor input')
    fireEvent.change(names[1]!, { target: { value: ' sidebar ' } })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('unique')
    })
    expect(mocks.updateSettings).not.toHaveBeenCalled()

    fireEvent.change(names[1]!, { target: { value: 'banner' } })
    fireEvent.change(container.querySelector('textarea[name="headerHtml"]')!, {
      target: { value: 'x'.repeat(100_001) },
    })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="toast-bridge"]')?.textContent).toContain('100,000')
    })
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  it('searches, inspects in a sandboxed iframe, downloads .eml, and permanently deletes archived messages', async () => {
    const summary = {
      id: 'del-1',
      accountId: 'mail-account',
      msgid: '<del-1@example.com>',
      mailboxAddress: 'alice@example.com',
      from: { name: 'Bank Security', address: 'security@bank.example' },
      to: [{ name: 'Alice', address: 'alice@example.com' }],
      subject: 'Your verification code 987654',
      intro: 'Code 987654',
      hasAttachments: true,
      size: 2048,
      hasSource: true,
      downloadUrl: '/admin/api/deleted-messages/del-1/source',
      receivedAt: '2026-10-19T12:00:00Z',
      deletedAt: '2026-10-20T05:00:00Z',
      expiresAt: '2027-10-20T05:00:00Z',
    }
    const detail = {
      ...summary,
      cc: [],
      bcc: [],
      text: 'Your verification code is 987654',
      html: ['<p>Your verification code is <strong>987654</strong></p>'],
      attachments: [
        {
          id: 'att-1',
          filename: 'statement.pdf',
          contentType: 'application/pdf',
          disposition: 'attachment',
          size: 1024,
        },
      ],
    }
    mocks.deletedList
      .mockResolvedValueOnce({ totalItems: 1, page: 1, limit: 20, member: [summary] })
      .mockResolvedValueOnce({ totalItems: 1, page: 1, limit: 20, member: [summary] })
      .mockResolvedValueOnce({ totalItems: 0, page: 1, limit: 20, member: [] })
    mocks.deletedGet.mockResolvedValueOnce(detail)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = renderWithTheme(<AdminApp />)
    await signInAdmin(container)

    fireEvent.click(getTab(container, 'Deleted Mail'))
    await waitFor(() => {
      expect(container.textContent).toContain('alice@example.com')
    })

    expect(mocks.deletedList).toHaveBeenCalledWith(1, '', 20)
    expect(container.querySelector('.MuiDataGrid-root')).not.toBeNull()
    expect(container.textContent).toContain('Your verification code 987654')

    fireEvent.change(container.querySelector('#deleted-mail-search')!, { target: { value: 'alice' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => {
      expect(mocks.deletedList).toHaveBeenCalledWith(1, 'alice', 20)
    })

    fireEvent.click(container.querySelector('[data-deleted-id="del-1"]')!)
    await waitFor(() => {
      expect(container.textContent).toContain('statement.pdf')
    })

    expect(mocks.deletedGet).toHaveBeenCalledWith('del-1')
    expect(container.textContent).toContain('987654')
    const iframe = container.querySelector('iframe')!
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')

    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:del-1'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(container.querySelector('[data-download-deleted-source]')!)
    await waitFor(() => {
      expect(mocks.deletedSource).toHaveBeenCalledWith('del-1')
      expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    })
    anchorClickSpy.mockRestore()

    fireEvent.click(container.querySelector('[data-action="delete-permanent"]')!)
    await waitFor(() => {
      expect(mocks.deletedRemove).toHaveBeenCalledWith('del-1', 'csrf-value')
      expect(container.textContent).toContain('No deleted messages match your search.')
    })
  })
})
