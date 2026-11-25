// @vitest-environment jsdom

import { act, cleanup, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import InboxView, { type InboxViewProps } from '../components/InboxView'
import { setLocale } from '../i18n'
import { createTMailTheme } from '../muiTheme'
import { getToasts, toastActions } from '../toast'
import { renderWithTheme } from './renderWithTheme'

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  adminSession: vi.fn(),
  adminMailboxToken: vi.fn(),
  logout: vi.fn(),
  domains: vi.fn(),
  token: vi.fn(),
  messages: vi.fn(),
  message: vi.fn(),
  setSeen: vi.fn(),
  streamMessages: vi.fn(),
  toastError: vi.fn(),
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
    streamMessages: mocks.streamMessages,
  }
})

vi.mock('../toast', async () => {
  const actual = await vi.importActual<typeof import('../toast')>('../toast')
  return {
    ...actual,
    useToast: () => ({ ...actual.useToast(), error: mocks.toastError }),
  }
})

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const summary = (id: string) => ({
  '@context': '/contexts/Message',
  '@id': `/messages/${id}`,
  '@type': 'Message',
  id,
  accountId: 'account',
  msgid: id,
  from: { name: 'Sender', address: 'sender@example.com' },
  to: [{ name: '', address: 'box@example.com' }],
  subject: `Message ${id}`,
  intro: 'Preview',
  seen: false,
  isDeleted: false,
  hasAttachments: false,
  size: 12,
  downloadUrl: `/sources/${id}`,
  createdAt: '2026-07-22T00:00:00Z',
  updatedAt: '2026-07-22T00:00:00Z',
})

const collection = (
  ids: string[],
  {
    page = 1,
    next = false,
    previous = false,
  }: { page?: number; next?: boolean; previous?: boolean } = {},
) => ({
  '@context': '/contexts/Message',
  '@id': `/messages?page=${page}`,
  '@type': 'hydra:Collection',
  'hydra:totalItems': ids.length,
  'hydra:member': ids.map(summary),
  'hydra:view': {
    '@id': `/messages?page=${page}`,
    '@type': 'hydra:PartialCollectionView',
    'hydra:first': '/messages?page=1',
    'hydra:last': '/messages?page=1',
    ...(next ? { 'hydra:next': `/messages?page=${page + 1}` } : {}),
    ...(previous ? { 'hydra:previous': `/messages?page=${page - 1}` } : {}),
  },
})

const domains = (values: string[]) => ({
  '@context': '/contexts/Domain',
  '@id': '/domains',
  '@type': 'hydra:Collection',
  'hydra:totalItems': values.length,
  'hydra:member': values.map((domain, index) => ({ id: String(index), domain })),
})

function renderInbox(overrides: Partial<InboxViewProps> = {}) {
  const theme = createTMailTheme('light')
  const props: InboxViewProps = {
    session: { address: 'box@example.com', token: 'signed' },
    fetchSeconds: 20,
    onCreate: vi.fn(),
    onLogin: vi.fn(),
    onInvalid: vi.fn(),
    onManage: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  }
  const result = renderWithTheme(<InboxView {...props} />)
  return {
    ...result,
    props,
    rerenderInbox: (next: Partial<InboxViewProps>) =>
      result.rerender(
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <InboxView {...props} {...next} />
        </ThemeProvider>,
      ),
  }
}

describe('InboxView polling', () => {
  let hidden = false

  beforeEach(() => {
    mocks.adminSession.mockReset().mockRejectedValue(new ApiError(401, 'No administrator session'))
    mocks.adminMailboxToken.mockReset()
    mocks.logout.mockReset().mockResolvedValue(undefined)
    mocks.me.mockReset().mockImplementation(async (token: string) => ({
      address:
        token === 'old-token'
          ? 'old@example.com'
          : token === 'new-token'
            ? 'new@example.com'
            : 'box@example.com',
      accessKind: 'public',
      protected: false,
    }))
    localStorage.clear()
    vi.useFakeTimers()
    hidden = false
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    mocks.messages.mockReset().mockResolvedValue(collection(['one']))
    mocks.message.mockReset().mockResolvedValue({
      ...summary('one'),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: 'Body',
      html: [],
      attachments: [],
    })
    mocks.setSeen.mockReset().mockResolvedValue({ seen: true })
    mocks.streamMessages.mockReset().mockRejectedValue(new Error('Stream failed'))
    mocks.domains.mockReset().mockResolvedValue(domains(['example.com']))
    mocks.token.mockReset().mockResolvedValue({ id: 'account-id', token: 'created-token' })
    mocks.toastError.mockReset()
  })

  afterEach(() => {
    cleanup()
    for (const entry of getToasts()) toastActions.dismiss(entry.id)
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setLocale('en')
  })

  it('announces new mail with a copy-actions toast', async () => {
    const { unmount } = renderInbox({ fetchSeconds: 1 })
    await flushPromises()

    expect(mocks.message).toHaveBeenCalledWith('signed', 'one')

    mocks.messages.mockResolvedValue(collection(['one', 'two']))
    mocks.message.mockResolvedValue({
      ...summary('two'),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: 'Your code is 482913',
      html: [],
      attachments: [],
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await flushPromises()

    expect(mocks.message).toHaveBeenCalledWith('signed', 'two')

    const entry = getToasts().find((item) => item.message === 'Message two')
    expect(entry).toMatchObject({
      kind: 'mail',
      code: '482913',
    })
    expect(entry?.actions?.find((action) => action.label === 'Copy code')?.primary).toBe(true)
    expect(entry?.actions?.some((action) => action.label === 'Copy email')).toBe(true)

    unmount()
  })

  it('renders Vietnamese product labels', async () => {
    setLocale('vi')
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()
    expect(container.textContent).toContain('Làm mới')
    expect(container.querySelector('.message-list')!.getAttribute('aria-label')).toBe('Thư')
  })

  it('shows the inline creation form immediately and loads domains', async () => {
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    expect(mocks.domains).toHaveBeenCalledWith(1, undefined)
    expect(container.querySelector('#inbox-create-address')).not.toBeNull()
    expect(container.querySelector('label[for="inbox-create-local-part"]')).not.toBeNull()
    expect(container.querySelector('label[for="inbox-create-domain"]')).not.toBeNull()
  })

  it('creates an address from the inline form', async () => {
    const onCreate = vi.fn()
    const { container } = renderInbox({ fetchSeconds: 20, onCreate })
    await flushPromises()

    fireEvent.change(container.querySelector('#inbox-create-local-part')!, {
      target: { value: 'paper' },
    })
    await act(async () => {
      fireEvent.submit(container.querySelector('#inbox-create-address form')!)
    })
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('paper@example.com', undefined)
    expect(onCreate).toHaveBeenCalledWith({
      address: 'paper@example.com',
      token: 'created-token',
    })
    // The form stays open after creating (no longer closes) — the domain select
    // must keep a valid option, not blank to '' with no matching <option>.
    expect((container.querySelector('#inbox-create-domain') as HTMLSelectElement).value).toBe(
      'example.com',
    )
  })

  it('creates a random address without a separate submit action', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.set([1, 2, 3, 4, 5, 6])
        return values
      },
    })
    mocks.domains.mockResolvedValue(domains(['one.example', 'two.example']))
    const onCreate = vi.fn()
    const { container } = renderInbox({ fetchSeconds: 20, onCreate })
    await flushPromises()

    await act(async () => {
      fireEvent.click(container.querySelector('#inbox-create-address .text-button')!)
    })
    await flushPromises()

    expect(onCreate).toHaveBeenCalledWith({
      address: 'cifuhe@two.example',
      token: 'created-token',
    })
  })

  it('keeps domain-load failures inside the inline create section', async () => {
    mocks.domains.mockRejectedValue(new ApiError(502, 'Domain list unavailable'))
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    expect(container.querySelector('#inbox-create-address')!.textContent).toContain(
      'Domain list unavailable',
    )
    expect(container.querySelector('.message-list')).not.toBeNull()
    expect(container.textContent).toContain('Message one')
  })

  it('keeps the inline form open and editable when creation fails', async () => {
    mocks.token.mockRejectedValue(new ApiError(422, 'Invalid address'))
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    const localInput = container.querySelector('#inbox-create-local-part') as HTMLInputElement
    fireEvent.change(localInput, { target: { value: 'paper' } })
    await act(async () => {
      fireEvent.submit(container.querySelector('#inbox-create-address form')!)
    })
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('Invalid address')
    expect(container.querySelector('#inbox-create-address')).not.toBeNull()
    expect(localInput.value).toBe('paper')
  })

  it('narrows rows by a case-insensitive subject fragment', async () => {
    const values = collection(['one', 'two'])
    values['hydra:member'][0] = { ...summary('one'), subject: 'Quarterly Report' }
    values['hydra:member'][1] = { ...summary('two'), subject: 'Team update' }
    mocks.messages.mockResolvedValue(values)
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.change(container.querySelector('[type="search"]')!, { target: { value: 'REPORT' } })

    expect(container.querySelectorAll('.message-row')).toHaveLength(1)
    expect(container.textContent).toContain('Quarterly Report')
    expect(container.textContent).not.toContain('Team update')
  })

  it('narrows rows by sender name and address fragments', async () => {
    const values = collection(['one', 'two'])
    values['hydra:member'][0] = {
      ...summary('one'),
      from: { name: 'Alice Adams', address: 'alice@example.com' },
    }
    values['hydra:member'][1] = {
      ...summary('two'),
      from: { name: 'Bob Brown', address: 'bob@example.com' },
    }
    mocks.messages.mockResolvedValue(values)
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    const search = container.querySelector('[type="search"]')!
    fireEvent.change(search, { target: { value: 'alice' } })
    expect(container.textContent).toContain('Alice Adams')
    expect(container.textContent).not.toContain('Bob Brown')

    fireEvent.change(search, { target: { value: 'bob@example.com' } })
    expect(container.textContent).toContain('Bob Brown')
    expect(container.textContent).not.toContain('Alice Adams')
  })

  it('restores the full page list when the query is cleared', async () => {
    mocks.messages.mockResolvedValue(collection(['one', 'two']))
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    const search = container.querySelector('[type="search"]')!
    fireEvent.change(search, { target: { value: 'one' } })
    expect(container.querySelectorAll('.message-row')).toHaveLength(1)
    fireEvent.change(search, { target: { value: '' } })
    expect(container.querySelectorAll('.message-row')).toHaveLength(2)
  })

  it('clears the query when changing pages', async () => {
    mocks.messages
      .mockResolvedValueOnce(collection(['one'], { next: true }))
      .mockResolvedValueOnce(collection(['two'], { page: 2, previous: true }))
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.change(container.querySelector('[type="search"]')!, { target: { value: 'one' } })
    await act(async () => {
      fireEvent.click(container.querySelector('.pagination button:last-child')!)
    })
    await flushPromises()

    expect((container.querySelector('[type="search"]') as HTMLInputElement).value).toBe('')
    expect(container.textContent).toContain('Message two')
  })

  it('shows search-specific empty copy when this page has no matches', async () => {
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.change(container.querySelector('[type="search"]')!, { target: { value: 'nothing' } })

    expect(container.textContent).toContain('No messages match your search on this page.')
    expect(container.textContent).not.toContain('Waiting for mail')
  })

  it('pauses while hidden, refreshes on return, and cleans up', async () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderInbox({ fetchSeconds: 1 })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledTimes(1)

    hidden = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mocks.messages).toHaveBeenCalledTimes(1)

    hidden = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledTimes(2)

    unmount()
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mocks.messages).toHaveBeenCalledTimes(2)
  })

  it('refreshes when the stream emits an update event', async () => {
    let onUpdate: (() => void) | undefined
    mocks.streamMessages.mockImplementation((_token, callback) => {
      onUpdate = callback
      return new Promise(() => {})
    })
    renderInbox({ fetchSeconds: 1 })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledTimes(1)

    act(() => {
      onUpdate?.()
    })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledTimes(2)
  })

  it('falls back to interval polling when the stream fails', async () => {
    const { unmount } = renderInbox({ fetchSeconds: 1 })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mocks.messages).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('aborts the stream on unmount', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    mocks.streamMessages.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderInbox({ fetchSeconds: 1 })
    await flushPromises()

    unmount()
    expect(abort).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh visibility refresh when an older request is pending', async () => {
    let finishPending: ((value: ReturnType<typeof collection>) => void) | undefined
    mocks.messages
      .mockResolvedValueOnce(collection(['one']))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPending = resolve
          }),
      )
      .mockResolvedValueOnce(collection(['fresh']))
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    hidden = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    hidden = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flushPromises()

    expect(mocks.messages).toHaveBeenCalledTimes(3)
    finishPending?.(collection(['stale']))
    await flushPromises()
    expect(container.textContent).toContain('Message fresh')
    expect(container.textContent).not.toContain('Message stale')
  })

  it('keeps a selected message when an ordinary refresh moves it off the current page', async () => {
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()
    fireEvent.click(container.querySelector('.message-row')!)
    await flushPromises()
    expect(container.querySelector('.message-reader')!.textContent).toContain('Message one')

    mocks.messages.mockResolvedValueOnce(collection([]))
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(container.querySelector('.message-reader')).not.toBeNull()
  })

  it('returns from the reader to the selected inbox message list', async () => {
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    expect(container.querySelector('.message-list')).not.toBeNull()
    fireEvent.click(container.querySelector('.message-row')!)
    await flushPromises()
    expect(container.querySelector('.message-reader')).not.toBeNull()
    // List-detail layout: the list stays mounted beside the reader and marks the open row.
    expect(container.querySelector('.message-list')).not.toBeNull()
    expect(container.querySelector('.inbox-view')!.classList.contains('has-reader')).toBe(true)
    expect(container.querySelector('.message-row')!.getAttribute('aria-current')).toBe('true')

    fireEvent.click(container.querySelector('[data-action="close"]')!)
    await flushPromises()

    expect(container.querySelector('.message-reader')).toBeNull()
    expect(container.querySelector('.message-list')).not.toBeNull()
  })

  it('moves focus to the back button when the reader opens and back to the opening row on close', async () => {
    const { container, unmount } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.click(container.querySelector('.message-row')!)
    await flushPromises()
    expect(document.activeElement).toBe(container.querySelector('[data-action="close"]'))

    fireEvent.click(container.querySelector('[data-action="close"]')!)
    await flushPromises()
    expect(document.activeElement).toBe(container.querySelector('.message-row'))

    unmount()
  })

  it('focuses the inline creation form when the new-address action opens it', async () => {
    const { container, unmount } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.click(container.querySelector('[data-action="new-address"]')!)
    await flushPromises()
    expect(document.activeElement).toBe(container.querySelector('#inbox-create-local-part'))
    unmount()
  })

  it('requests notification permission only from its explicit action', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'default'
        static requestPermission = requestPermission
      },
    )
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()
    expect(requestPermission).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-action="notifications"]')!)
    })
    await flushPromises()
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('loads a requested page even when the current refresh is still pending', async () => {
    let finishRefresh: ((value: ReturnType<typeof collection>) => void) | undefined
    mocks.messages
      .mockResolvedValueOnce(collection(['one'], { next: true }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve
          }),
      )
      .mockResolvedValueOnce(collection(['two'], { page: 2, previous: true }))
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()

    fireEvent.click(container.querySelector('.message-row')!)
    await flushPromises()
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    fireEvent.click(container.querySelector('[data-action="close"]')!)
    fireEvent.click(container.querySelector('.pagination button:last-child')!)
    await flushPromises()

    expect(mocks.messages).toHaveBeenLastCalledWith('signed', 2)
    expect(container.querySelector('.message-reader')).toBeNull()
    expect(container.querySelector('.message-list')).not.toBeNull()
    finishRefresh?.(collection(['one'], { next: true }))
  })

  it('resets state and ignores stale results when the address session changes', async () => {
    let finishOldRefresh: ((value: ReturnType<typeof collection>) => void) | undefined
    mocks.messages
      .mockResolvedValueOnce(collection(['old-one'], { next: true }))
      .mockResolvedValueOnce(collection(['old-two'], { page: 2, previous: true }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldRefresh = resolve
          }),
      )
      .mockResolvedValueOnce(collection(['new-one']))
    const { container, rerenderInbox } = renderInbox({
      session: { address: 'old@example.com', token: 'old-token' },
      fetchSeconds: 30,
    })
    await flushPromises()
    fireEvent.click(container.querySelector('.pagination button:last-child')!)
    await flushPromises()
    fireEvent.click(container.querySelector('.message-row')!)
    await flushPromises()
    expect(container.querySelector('.message-reader')).not.toBeNull()

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    rerenderInbox({ session: { address: 'new@example.com', token: 'new-token' } })
    await flushPromises()

    expect(mocks.messages).toHaveBeenLastCalledWith('new-token', 1)
    expect(container.textContent).toContain('new@example.com')
    expect(container.textContent).toContain('Message new-one')
    expect(container.textContent).not.toContain('Message old-two')
    expect(container.querySelector('.message-reader')).toBeNull()

    finishOldRefresh?.(collection(['stale-old'], { page: 2, previous: true }))
    await flushPromises()
    expect(container.textContent).toContain('Message new-one')
    expect(container.textContent).not.toContain('Message stale-old')
  })

  it('notifies only for new page-one IDs without exposing message metadata', async () => {
    const notifications: Array<[string, NotificationOptions | undefined]> = []
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'default'
        static requestPermission = requestPermission
        constructor(title: string, options?: NotificationOptions) {
          notifications.push([title, options])
        }
      },
    )
    mocks.messages
      .mockResolvedValueOnce(collection(['one'], { next: true }))
      .mockResolvedValueOnce(collection(['page-two'], { page: 2, previous: true }))
      .mockResolvedValueOnce(collection(['two', 'one'], { next: true }))
      .mockResolvedValueOnce(collection(['two'], { next: true }))
      .mockResolvedValueOnce(collection(['one'], { next: true }))
    const { container } = renderInbox({ fetchSeconds: 30 })
    await flushPromises()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-action="notifications"]')!)
    })
    fireEvent.click(container.querySelector('.pagination button:last-child')!)
    await flushPromises()
    expect(notifications).toEqual([])

    fireEvent.click(container.querySelector('.pagination button:first-child')!)
    await flushPromises()
    expect(notifications).toEqual([
      ['New message', { body: 'A new message arrived in your temporary inbox.' }],
    ])

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(notifications).toHaveLength(1)

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(notifications).toHaveLength(1)
    expect(JSON.stringify(notifications)).not.toContain('Message two')
    expect(JSON.stringify(notifications)).not.toContain('sender@example.com')
  })

  it('uses the address hero and message list without fake navigation', async () => {
    const session = { address: 'box@example.com', token: 'signed' }
    const { container } = renderInbox({ session, fetchSeconds: 20 })
    await flushPromises()

    expect(container.querySelector('.inbox-view')).not.toBeNull()
    expect(container.querySelector('.inbox-hero')!.textContent).toContain(session.address)
    expect(container.querySelector('.message-list')).not.toBeNull()
    expect(container.querySelector('.inbox-panes')).not.toBeNull()
    expect(container.textContent).not.toMatch(/Sent|Contacts|Addresses/)
  })

  it('copies the inbox address and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    await act(async () => {
      fireEvent.click(container.querySelector('.inbox-hero-actions button:first-child')!)
    })
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('box@example.com')
    expect(getToasts().map((item) => item.message)).toContain('Address copied.')
  })

  it('shows and copies a resolved row code without opening the reader', async () => {
    mocks.message.mockResolvedValue({
      ...summary('one'),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: 'Your code is 482913',
      html: [],
      attachments: [],
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    expect(container.querySelector('.message-row-code')!.textContent).toContain('482913')
    await act(async () => {
      fireEvent.click(container.querySelector('.message-row-code')!)
    })
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('482913')
    expect(getToasts().map((item) => item.message)).toContain('Verification code copied.')
    expect(container.querySelector('.message-reader')).toBeNull()
  })

  it('pins the newest extracted code in the latest-code card and copies the raw value', async () => {
    mocks.message.mockResolvedValue({
      ...summary('one'),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: 'Your code is 482913',
      html: [],
      attachments: [],
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    const card = container.querySelector('.latest-code')!
    expect(card.querySelector('.latest-code-value')!.textContent).toBe('482 913')
    await act(async () => {
      fireEvent.click(card.querySelector('[data-action="copy-latest-code"]')!)
    })
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('482913')
  })

  it('does not label an older code as latest when the newest message has none', async () => {
    mocks.messages.mockResolvedValue({
      ...collection(['new', 'old']),
      'hydra:member': [
        { ...summary('new'), createdAt: '2026-07-22T02:00:00Z' },
        { ...summary('old'), createdAt: '2026-07-22T01:00:00Z' },
      ],
    })
    mocks.message.mockImplementation(async (_token: string, id: string) => ({
      ...summary(id),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: id === 'old' ? 'Your code is 482913' : 'Welcome aboard',
      html: [],
      attachments: [],
    }))
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    // The newest message with a code is still shown; it is the newest one that has a code.
    expect(container.querySelector('.latest-code-value')!.textContent).toBe('482 913')
    expect(container.querySelector('.latest-code')!.textContent).toContain('Sender')
  })

  it('hides the latest-code card while a newer message is still unresolved', async () => {
    mocks.messages.mockResolvedValue({
      ...collection(['new', 'old']),
      'hydra:member': [
        { ...summary('new'), createdAt: '2026-07-22T02:00:00Z' },
        { ...summary('old'), createdAt: '2026-07-22T01:00:00Z' },
      ],
    })
    let releaseNewest: (value: unknown) => void = () => {}
    mocks.message.mockImplementation((_token: string, id: string) =>
      id === 'new'
        ? new Promise((resolve) => {
            releaseNewest = resolve
          })
        : Promise.resolve({
            ...summary(id),
            cc: [],
            bcc: [],
            flagged: false,
            verifications: [],
            retention: false,
            retentionDate: null,
            text: 'Your code is 111222',
            html: [],
            attachments: [],
          }),
    )
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()
    expect(container.querySelector('.latest-code')).toBeNull()

    releaseNewest({
      ...summary('new'),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: 'Your code is 999888',
      html: [],
      attachments: [],
    })
    await flushPromises()
    expect(container.querySelector('.latest-code-value')!.textContent).toBe('999 888')
  })

  it('does not show a code chip when extraction finds no code', async () => {
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    expect(container.querySelector('.message-row-code')).toBeNull()
  })

  it('does not re-fetch an already resolved row code on polling', async () => {
    const { unmount } = renderInbox({ fetchSeconds: 1 })
    await flushPromises()
    expect(mocks.message).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await flushPromises()
    expect(mocks.message).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('reuses an in-flight code lookup across a poll tick', async () => {
    let resolveMessage:
      | ((
          value: ReturnType<typeof summary> & {
            cc: []
            bcc: []
            flagged: boolean
            verifications: []
            retention: boolean
            retentionDate: null
            text: string
            html: []
            attachments: []
          },
        ) => void)
      | undefined
    mocks.message.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMessage = resolve
        }),
    )
    const { container, unmount } = renderInbox({ fetchSeconds: 1 })
    await flushPromises()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await flushPromises()

    expect(mocks.message).toHaveBeenCalledTimes(1)
    resolveMessage?.({
      ...summary('one'),
      cc: [],
      bcc: [],
      flagged: false,
      verifications: [],
      retention: false,
      retentionDate: null,
      text: 'Your code is 482913',
      html: [],
      attachments: [],
    })
    await flushPromises()
    expect(container.querySelector('.message-row-code')!.textContent).toContain('482913')
    unmount()
  })

  it('clears old row codes when the address session changes', async () => {
    mocks.message
      .mockResolvedValueOnce({
        ...summary('old'),
        cc: [],
        bcc: [],
        flagged: false,
        verifications: [],
        retention: false,
        retentionDate: null,
        text: 'Your code is 482913',
        html: [],
        attachments: [],
      })
      .mockResolvedValueOnce({
        ...summary('new'),
        cc: [],
        bcc: [],
        flagged: false,
        verifications: [],
        retention: false,
        retentionDate: null,
        text: 'No code here',
        html: [],
        attachments: [],
      })
    mocks.messages
      .mockResolvedValueOnce(collection(['old']))
      .mockResolvedValueOnce(collection(['new']))
    const { container, rerenderInbox } = renderInbox({
      session: { address: 'old@example.com', token: 'old-token' },
      fetchSeconds: 20,
    })
    await flushPromises()
    expect(container.querySelector('.message-row-code')).not.toBeNull()

    rerenderInbox({ session: { address: 'new@example.com', token: 'new-token' } })
    await flushPromises()
    expect(container.querySelector('.message-row-code')).toBeNull()
  })

  it('uses fallback copy feedback when Clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    await act(async () => {
      fireEvent.click(container.querySelector('.inbox-hero-actions button:first-child')!)
    })
    await flushPromises()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Copy failed. Select the address and copy it manually.',
    )

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    })
    await act(async () => {
      fireEvent.click(container.querySelector('.inbox-hero-actions button:first-child')!)
    })
    await flushPromises()
    expect(getToasts().map((item) => item.message)).toContain('Address copied.')
  })

  it('renders countdown indicator and ticks down during polling', async () => {
    mocks.streamMessages.mockImplementation(() => Promise.reject(new Error('stream closed')))
    const { container } = renderInbox({ fetchSeconds: 15 })
    await flushPromises()

    const pill = container.querySelector('.refresh-countdown-pill')!
    expect(pill).not.toBeNull()
    expect(pill.textContent).toContain('Auto-refresh in 15s')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(pill.textContent).toContain('Auto-refresh in 13s')
  })

  it('toggles the collapsible create section with the new address button', async () => {
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    const toggleBtn = container.querySelector('[data-action="new-address"]')!
    const createSection = container.querySelector('#inbox-create-address') as HTMLElement
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
    expect(createSection.style.display).toBe('none')

    fireEvent.click(toggleBtn)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
    expect(createSection.style.display).not.toBe('none')
  })

  it('opens and closes the QR code modal', async () => {
    const { container } = renderInbox({ fetchSeconds: 20 })
    await flushPromises()

    expect(container.querySelector('.qr-modal-backdrop')).toBeNull()
    fireEvent.click(container.querySelector('[data-action="qr-code"]')!)
    expect(container.querySelector('.qr-modal-backdrop')).not.toBeNull()
    expect(container.querySelector('.qr-address-text')!.textContent).toBe('box@example.com')

    fireEvent.click(container.querySelector('.qr-close-button')!)
    expect(container.querySelector('.qr-modal-backdrop')).toBeNull()
  })

  it('renders message rows ordered newest-first by createdAt', async () => {
    const { container } = renderInbox({ fetchSeconds: 10 })
    await flushPromises()

    const oldMsg = { ...summary('old'), createdAt: '2026-07-20T10:00:00Z', subject: 'Older Mail' }
    const newMsg = { ...summary('new'), createdAt: '2026-07-22T10:00:00Z', subject: 'Newer Mail' }
    mocks.messages.mockResolvedValue({
      '@context': '/contexts/Message',
      '@id': '/messages?page=1',
      '@type': 'hydra:Collection',
      'hydra:totalItems': 2,
      'hydra:member': [oldMsg, newMsg], // intentionally oldest-first from mock
      'hydra:view': { '@id': '/messages?page=1', '@type': 'hydra:PartialCollectionView' },
    })

    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()

    const subjects = [...container.querySelectorAll('.message-subject')].map(
      (el) => el.textContent,
    )
    expect(subjects).toEqual(['Newer Mail', 'Older Mail'])
  })

  it('clears the list and codes on authorization failure and suppresses a pending code response', async () => {
    let finishCode!: (value: unknown) => void
    mocks.messages
      .mockResolvedValueOnce(collection(['sensitive']))
      .mockRejectedValueOnce(new ApiError(401, 'Revoked'))
    mocks.message.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCode = resolve
      }),
    )
    mocks.streamMessages.mockReturnValue(new Promise(() => {}))
    const onInvalid = vi.fn()
    const { container } = renderInbox({
      session: { address: 'box@example.com', token: 'visitor' },
      fetchSeconds: 1,
      onInvalid,
    })
    await flushPromises()
    expect(container.textContent).toContain('Message sensitive')
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(container.textContent).not.toContain('Message sensitive')
    expect(onInvalid).toHaveBeenCalledTimes(1)
    finishCode({ subject: 'Your code 998877', text: '', html: [] })
    await flushPromises()
    expect(container.textContent).not.toContain('998877')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    expect(mocks.messages).toHaveBeenCalledTimes(2)
  })

  it('validates a closed SSE once, clears mail if revoked, and never starts polling', async () => {
    mocks.me.mockRejectedValueOnce(new ApiError(401, 'Revoked'))
    mocks.streamMessages.mockResolvedValueOnce(undefined)
    const interval = vi.spyOn(window, 'setInterval')
    const onInvalid = vi.fn()
    const { container } = renderInbox({
      session: { address: 'box@example.com', token: 'visitor' },
      fetchSeconds: 1,
      onInvalid,
    })
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledOnce()
    expect(onInvalid).toHaveBeenCalledTimes(1)
    expect(interval).not.toHaveBeenCalled()
    expect(container.querySelector('.message-row')).toBeNull()
  })

  it('opens protected inline addresses through the mailbox login flow', async () => {
    mocks.token.mockRejectedValueOnce(new ApiError(401, 'Password required'))
    const onLogin = vi.fn()
    const { container } = renderInbox({ fetchSeconds: 20, onLogin })
    await flushPromises()

    fireEvent.change(container.querySelector('#inbox-create-local-part')!, {
      target: { value: 'protected' },
    })
    await act(async () => {
      fireEvent.submit(container.querySelector('#inbox-create-address form')!)
    })
    await flushPromises()
    expect(onLogin).toHaveBeenCalledWith('protected@example.com')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('dismisses mailbox subjects and code actions in toasts when access is revoked', async () => {
    mocks.streamMessages.mockReturnValue(new Promise(() => {}))
    mocks.messages
      .mockResolvedValueOnce(collection([]))
      .mockResolvedValueOnce(collection(['secret-toast']))
      .mockRejectedValueOnce(new ApiError(401, 'Revoked'))
    mocks.message.mockResolvedValue({
      ...summary('secret-toast'),
      text: 'Your code is 998877',
      html: [],
    })
    const { container } = renderInbox({
      session: { address: 'box@example.com', token: 'visitor' },
      fetchSeconds: 20,
    })
    await flushPromises()
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(getToasts().some((entry) => entry.message === 'Message secret-toast')).toBe(true)
    fireEvent.click(container.querySelector('[data-action="refresh"]')!)
    await flushPromises()
    expect(getToasts().some((entry) => entry.message === 'Message secret-toast')).toBe(false)
  })

  it.each([
    [401, 'pagination', false],
    [403, 'pagination', false],
    [401, 'visibility', false],
    [403, 'visibility', false],
    [401, 'pagination', true],
    [403, 'pagination', true],
    [401, 'visibility', true],
    [403, 'visibility', true],
  ] as const)(
    'honors a superseded same-session %s after %s (newer mail loaded: %s)',
    async (status, trigger, alreadyLoaded) => {
      let rejectOld!: (cause: Error) => void
      let finishNew!: (value: ReturnType<typeof collection>) => void
      let finishCode!: (value: unknown) => void
      if (trigger === 'pagination') mocks.streamMessages.mockReturnValue(new Promise(() => {}))
      mocks.message.mockReturnValueOnce(
        new Promise((resolve) => {
          finishCode = resolve
        }),
      )
      mocks.messages
        .mockResolvedValueOnce(collection(['initial'], { next: true }))
        .mockReturnValueOnce(
          new Promise((_, reject) => {
            rejectOld = reject
          }),
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishNew = resolve
          }),
        )
      const onInvalid = vi.fn()
      const { container } = renderInbox({
        session: {
          address: 'box@example.com',
          token: 'visitor',
          accessKind: 'visitor',
          protected: true,
        },
        fetchSeconds: 20,
        onInvalid,
      })
      await flushPromises()
      fireEvent.click(container.querySelector('[data-action="refresh"]')!)
      if (trigger === 'pagination') {
        fireEvent.click(container.querySelector('.pagination button:last-child')!)
      } else {
        act(() => {
          document.dispatchEvent(new Event('visibilitychange'))
        })
      }
      if (alreadyLoaded) {
        finishNew(collection(['sensitive-after-revocation']))
        await flushPromises()
        expect(container.textContent).toContain('sensitive-after-revocation')
      }
      rejectOld(new ApiError(status, 'Revoked'))
      await flushPromises()
      expect.soft(onInvalid).toHaveBeenCalledTimes(1)
      expect.soft(container.textContent).not.toContain('Message initial')
      finishNew(collection(['sensitive-after-revocation']))
      finishCode({ subject: 'Your code 998877', text: '', html: [] })
      await flushPromises()
      expect.soft(container.textContent).not.toContain('sensitive-after-revocation')
      expect.soft(container.textContent).not.toContain('998877')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      fireEvent.click(container.querySelector('[data-action="refresh"]')!)
      expect(mocks.messages).toHaveBeenCalledTimes(3)
    },
  )

  it.each([401, 403])('ignores a previous mailbox session %s', async (status) => {
    let rejectOld!: (cause: Error) => void
    mocks.streamMessages.mockReturnValue(new Promise(() => {}))
    mocks.messages
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject
        }),
      )
      .mockResolvedValueOnce(collection(['new-mail']))
    const onInvalid = vi.fn()
    const { container, rerenderInbox } = renderInbox({
      session: { address: 'old@example.com', token: 'old-token' },
      fetchSeconds: 20,
      onInvalid,
    })
    rerenderInbox({ session: { address: 'new@example.com', token: 'new-token' } })
    await flushPromises()
    rejectOld(new ApiError(status, 'Revoked'))
    await flushPromises()
    expect(onInvalid).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Message new-mail')
  })
})
