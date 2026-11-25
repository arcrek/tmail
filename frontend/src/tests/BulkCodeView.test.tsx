// @vitest-environment jsdom

import { StrictMode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { BulkCodeView } from '../components/BulkCodeView'
import { initLocale } from '../i18n'
import { createTMailTheme } from '../muiTheme'
import { renderWithTheme } from './renderWithTheme'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  adminSession: vi.fn(),
  adminMailboxToken: vi.fn(),
  logout: vi.fn(),
  token: vi.fn(),
  messages: vi.fn(),
  message: vi.fn(),
  copyText: vi.fn(),
  downloadCsv: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    api: {
      ...actual.api,
      me: mocks.me,
      logout: mocks.logout,
      token: mocks.token,
      messages: mocks.messages,
      message: mocks.message,
      admin: {
        ...actual.api.admin,
        session: mocks.adminSession,
        mailboxToken: mocks.adminMailboxToken,
      },
    },
  }
})
vi.mock('../clipboard', () => ({ copyText: mocks.copyText }))
vi.mock('../csv', () => ({ downloadCsv: mocks.downloadCsv }))
vi.mock('../toast', () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
}))

const messages = (id = 'one') => ({ 'hydra:member': id ? [{ id }] : [] })
const detail = { id: 'one', subject: 'Your code is 123456', text: '', html: [] }

async function flushPromises() {
  await act(async () => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
    }
  })
}

function getDataRows(container: HTMLElement) {
  return container.querySelectorAll('.MuiDataGrid-row')
}

function getLoginLink(container: HTMLElement) {
  return container.querySelector('a[data-action="open-mailbox-login"]')
}

describe('BulkCodeView', () => {
  beforeEach(() => {
    mocks.adminSession.mockReset().mockRejectedValue(new ApiError(401, 'No administrator session'))
    mocks.adminMailboxToken.mockReset()
    mocks.logout.mockReset().mockResolvedValue(undefined)
    mocks.me.mockReset().mockResolvedValue({ address: 'box@example.com', accessKind: 'public', protected: false })
    localStorage.clear()
    initLocale()
    mocks.token.mockReset().mockResolvedValue({ token: 'signed' })
    mocks.messages.mockReset().mockResolvedValue(messages())
    mocks.message.mockReset().mockResolvedValue(detail)
    mocks.copyText.mockReset().mockResolvedValue(undefined)
    mocks.downloadCsv.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('parses, deduplicates, caps at ten, and exposes the accessible DataGrid controls', async () => {
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    const textarea = container.querySelector('#bulk-code-addresses') as HTMLTextAreaElement

    fireEvent.change(textarea, {
      target: {
        value: [
          ' ONE@example.com ',
          'one@example.com',
          ...Array.from({ length: 10 }, (_, index) => `box${index}@example.com`),
        ].join(', '),
      },
    })

    expect(container.querySelector('#bulk-code-title')?.textContent).toBe('Read verification codes')
    expect(container.querySelector('label[for="bulk-code-addresses"]')?.textContent).toBe('Email addresses')
    expect(container.textContent).toContain('Only the first 10 unique addresses will be read.')

    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(10)
    expect(getDataRows(container)).toHaveLength(10)
    expect(container.querySelectorAll('.MuiDataGrid-columnHeader')).toHaveLength(3)
  })

  it('resolves rows independently, announces a row error, and supports single-row retry', async () => {
    mocks.token.mockImplementation((address: string) =>
      address === 'bad@example.com'
        ? Promise.reject(new ApiError(422, 'Domain not accepted'))
        : Promise.resolve({ token: `signed-${address}` }),
    )
    const { container } = renderWithTheme(<BulkCodeView accessToken="access-token" fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com, bad@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('one@example.com', 'access-token')
    expect(container.textContent).toContain('123 456')
    expect(screen.getByRole('alert').textContent).toContain('Domain not accepted')

    mocks.token.mockResolvedValueOnce({ token: 'signed-bad@example.com' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await flushPromises()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('exports code rows as CSV', async () => {
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    const exportBtn = container.querySelector('.bulk-export-csv') as HTMLButtonElement
    expect(exportBtn).not.toBeNull()
    expect(exportBtn.textContent).toContain('Export CSV')
    fireEvent.click(exportBtn)
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'tmail-codes.csv',
      'address,subject,code,status,error\n"one@example.com","Your code is 123456","123456","ready",""\n',
    )
  })

  it('shows no-message placeholders instead of an error', async () => {
    mocks.messages.mockResolvedValue(messages(''))
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'empty@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    expect(container.textContent).toContain('(No subject)')
    expect(container.textContent).toContain('(No code)')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('announces loading rows politely', async () => {
    let resolveToken!: (value: { token: string }) => void
    mocks.token.mockImplementationOnce(() => new Promise((resolve) => { resolveToken = resolve }))
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'slow@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    expect(container.querySelectorAll('[data-loading-cell="true"][aria-live="polite"]')).toHaveLength(1)
    expect(container.textContent).toContain('Loading latest message')

    resolveToken({ token: 'signed' })
    await flushPromises()
    expect(container.querySelectorAll('[data-loading-cell="true"]')).toHaveLength(0)
  })

  it('removes the ten-address cap when full access is unlocked', async () => {
    const { container } = renderWithTheme(<BulkCodeView accessToken="access-token" fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: {
        value: [
          ' ONE@example.com ',
          'one@example.com',
          ...Array.from({ length: 14 }, (_, index) => `box${index}@example.com`),
        ].join(', '),
      },
    })

    expect(container.querySelector('.page-header .lede')?.textContent).toBe(
      'Paste addresses to read their latest verification codes.',
    )
    expect(container.querySelector('.bulk-partial')).toBeNull()

    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(15)
    expect(getDataRows(container)).toHaveLength(15)
  })

  it('copies all extracted codes separated by newlines and disables copy all when none exist', async () => {
    mocks.token.mockImplementation((address: string) =>
      address === 'bad@example.com'
        ? Promise.reject(new ApiError(422, 'Domain not accepted'))
        : Promise.resolve({ token: `signed-${address}` }),
    )
    mocks.messages.mockImplementation((token: string) =>
      Promise.resolve(token === 'signed-empty@example.com' ? messages('') : messages(token)),
    )
    mocks.message.mockImplementation((token: string) =>
      Promise.resolve({
        id: token,
        subject:
          token === 'signed-one@example.com'
            ? 'Your code is 111111'
            : token === 'signed-two@example.com'
              ? 'Your code is 222222'
              : 'Welcome aboard',
        text: '',
        html: [],
      }),
    )

    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'empty@example.com, nocode@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    const disabledCopyAll = container.querySelector('.bulk-copy-all') as HTMLButtonElement
    expect(disabledCopyAll.disabled).toBe(true)

    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com, empty@example.com, bad@example.com, two@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    const copyAllBtn = container.querySelector('.bulk-copy-all') as HTMLButtonElement
    expect(copyAllBtn.disabled).toBe(false)
    fireEvent.click(copyAllBtn)
    await flushPromises()

    expect(mocks.copyText).toHaveBeenCalledWith('111111\n222222')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('All verification codes copied.')

    mocks.copyText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
    fireEvent.click(copyAllBtn)
    await flushPromises()
    expect(mocks.toastError).toHaveBeenCalledWith('Copy failed. Select the address and copy it manually.')
  })

  it('clears cached rows and stops polling when accessToken changes', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { container, rerender, unmount } = renderWithTheme(
      <BulkCodeView accessToken="access-token" fetchSeconds={1} />,
    )
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()
    expect(getDataRows(container)).toHaveLength(1)

    rerender(
      <ThemeProvider theme={createTMailTheme('light')}>
        <CssBaseline />
        <BulkCodeView accessToken="" fetchSeconds={1} />
      </ThemeProvider>,
    )
    await flushPromises()
    expect(getDataRows(container)).toHaveLength(0)
    expect(container.querySelector('.bulk-copy-all')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('displays grouped code, renders address link, copies ungrouped code and email, and surfaces toasts', async () => {
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    const addressLink = container.querySelector('a.saved-address')
    expect(addressLink?.getAttribute('href')).toBe('/one%40example.com')
    expect(container.querySelector('.verification-code-chip')?.textContent).toBe('123 456')

    fireEvent.click(screen.getByRole('button', { name: 'Copy code for one@example.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy email one@example.com' }))
    await flushPromises()

    expect(mocks.copyText).toHaveBeenNthCalledWith(1, '123456')
    expect(mocks.copyText).toHaveBeenNthCalledWith(2, 'one@example.com')
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2)
  })

  it('polls cached rows without another token request', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const { container, unmount } = renderWithTheme(<BulkCodeView fetchSeconds={1} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    const tick = setIntervalSpy.mock.calls[0]?.[0] as () => void
    expect(tick).toEqual(expect.any(Function))
    tick()
    await flushPromises()
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(1)
    expect(mocks.messages).toHaveBeenCalledTimes(2)
    expect(mocks.message).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('refreshes manually without waiting for the interval', async () => {
    vi.useFakeTimers()
    const { container, unmount } = renderWithTheme(<BulkCodeView fetchSeconds={60} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()

    expect(mocks.messages).toHaveBeenCalledTimes(2)
    expect(mocks.token).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not retry a failed row on poll ticks, only on manual refresh', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    mocks.token.mockImplementation((address: string) =>
      address === 'bad@example.com'
        ? Promise.reject(new ApiError(422, 'Domain not accepted'))
        : Promise.resolve({ token: `signed-${address}` }),
    )
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const { container, unmount } = renderWithTheme(<BulkCodeView fetchSeconds={1} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com, bad@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledTimes(2)

    const tick = setIntervalSpy.mock.calls[0]?.[0] as () => void
    tick()
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledTimes(2)

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledTimes(3)
    unmount()
  })

  it('keeps the last-known code visible while a poll tick refetches it', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const { container, unmount } = renderWithTheme(<BulkCodeView fetchSeconds={1} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()
    expect(container.textContent).toContain('123 456')

    let resolveMessages!: (value: ReturnType<typeof messages>) => void
    mocks.messages.mockReset().mockImplementationOnce(() => new Promise((resolve) => { resolveMessages = resolve }))
    const tick = setIntervalSpy.mock.calls[0]?.[0] as () => void
    tick()
    await flushPromises()

    // Row is mid-refresh (messages() still pending) — code must stay visible, not blank to a skeleton.
    expect(container.textContent).toContain('123 456')
    expect(container.querySelectorAll('[data-loading-cell="true"]')).toHaveLength(0)

    resolveMessages(messages())
    await flushPromises()
    expect(container.textContent).toContain('123 456')
    unmount()
  })

  it('locks an expired cached row without issuing another passwordless token', async () => {
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com two@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    mocks.messages.mockRejectedValueOnce(new ApiError(401, 'Expired')).mockResolvedValue(messages())
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(2)
    expect(getLoginLink(container)?.getAttribute('href')).toBe('/one%40example.com')
    expect(getDataRows(container)[0]?.textContent).not.toContain('123 456')
  })

  it('uses saved visitor tokens and admin exchanges without passwordless issuance', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-saved' }]))
    mocks.me.mockResolvedValue({ address: 'one@example.com', accessKind: 'visitor', protected: true })
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)

    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    expect(mocks.me).toHaveBeenCalledWith('visitor-saved')
    expect(mocks.token).not.toHaveBeenCalled()

    mocks.adminSession.mockResolvedValue({ csrfToken: 'csrf' })
    mocks.adminMailboxToken.mockResolvedValue({ token: 'admin-memory', accessKind: 'admin' })
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'admin@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    expect(mocks.adminMailboxToken).toHaveBeenCalledWith('admin@example.com', 'csrf')
    expect(localStorage.getItem('tmail.addresses')).not.toContain('admin-memory')
  })

  it('does not repeatedly issue a passwordless token for locked rows', async () => {
    mocks.token.mockRejectedValue(new ApiError(401, 'Password required'))
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledOnce()
    expect(getLoginLink(container)?.getAttribute('href')).toBe('/one%40example.com')
  })

  it.each(['storage', 'refresh'])('recovers a locked row after another tab signs in via %s', async (recovery) => {
    mocks.token.mockRejectedValue(new ApiError(401, 'Password required'))
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()
    expect(getLoginLink(container)).not.toBeNull()

    let validate!: (value: { address: string; accessKind: string }) => void
    mocks.me.mockReturnValueOnce(new Promise((resolve) => { validate = resolve }))
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-new' }]))
    if (recovery === 'storage') {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    } else {
      fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    }
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledWith('visitor-new')
    expect(container.textContent).not.toContain('123 456')
    expect(mocks.messages).not.toHaveBeenCalled()

    validate({ address: 'one@example.com', accessKind: 'visitor' })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledWith('visitor-new', 1)
    expect(container.textContent).toContain('123 456')
    expect(getLoginLink(container)).toBeNull()
    expect(mocks.token).toHaveBeenCalledOnce()
  })

  it('keeps a revoked replacement locked without repeatedly requesting public access', async () => {
    mocks.token.mockRejectedValue(new ApiError(401, 'Password required'))
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    mocks.me.mockRejectedValue(new ApiError(401, 'Revoked'))
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-revoked' }]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()

    expect(mocks.me).toHaveBeenCalledWith('visitor-revoked')
    expect(getLoginLink(container)).not.toBeNull()
    expect(container.textContent).not.toContain('123 456')
    expect(mocks.messages).not.toHaveBeenCalled()

    const attempts = mocks.token.mock.calls.length
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledOnce()
    expect(mocks.token).toHaveBeenCalledTimes(attempts)
  })

  it('uses a replacement visitor token without restoring a late response from the old token', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-old' }]))
    mocks.me.mockResolvedValue({ address: 'one@example.com', accessKind: 'visitor' })
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    let finish!: (value: typeof detail) => void
    mocks.message.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()

    mocks.message.mockResolvedValue({ ...detail, subject: 'Your new code is 654321' })
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-new' }]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()

    expect(mocks.me).toHaveBeenLastCalledWith('visitor-new')
    expect(container.textContent).toContain('654 321')
    finish(detail)
    await flushPromises()
    expect(container.textContent).not.toContain('123 456')
    expect(container.textContent).toContain('654 321')
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it('clears codes on cross-tab removal and prevents a late detail response from restoring them', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-saved' }]))
    mocks.me.mockResolvedValue({ address: 'one@example.com', accessKind: 'visitor' })
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    let finish!: (value: typeof detail) => void
    mocks.message.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()

    localStorage.removeItem('tmail.addresses')
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()
    expect(container.textContent).not.toContain('123 456')

    finish(detail)
    await flushPromises()
    expect(container.textContent).not.toContain('123 456')
    expect(getLoginLink(container)).not.toBeNull()
  })

  it('finishes pending bulk rows after unrelated storage updates', async () => {
    let finish!: (value: typeof detail) => void
    mocks.message.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'other@example.com', token: 'other' }]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    finish(detail)
    await flushPromises()

    expect(container.textContent).toContain('123 456')
    expect(container.querySelector('.skeleton')).toBeNull()
    expect((container.querySelector('[data-action="refresh"]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps public rows readable when another tab replaces or removes its saved public token', async () => {
    mocks.token.mockResolvedValue({ token: 'public-one', accessKind: 'public' })
    const { container } = renderWithTheme(<BulkCodeView fetchSeconds={20} />)
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'one@example.com' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await flushPromises()

    for (const value of [JSON.stringify([{ address: 'one@example.com', token: 'public-two' }]), '[]']) {
      localStorage.setItem('tmail.addresses', value)
      window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
      await flushPromises()
      expect(container.textContent).toContain('123 456')
      expect(getLoginLink(container)).toBeNull()
    }
  })

  it('works cleanly under React StrictMode', async () => {
    const { container } = renderWithTheme(
      <StrictMode>
        <BulkCodeView fetchSeconds={20} />
      </StrictMode>,
    )
    fireEvent.change(container.querySelector('#bulk-code-addresses')!, {
      target: { value: 'protected@example.com' },
    })
    fireEvent.submit(container.querySelector('.bulk-controls')!)
    await flushPromises()

    expect(container.querySelector('a.saved-address')?.getAttribute('href')).toBe('/protected%40example.com')
    expect(container.textContent).toContain('123 456')
  })
})
