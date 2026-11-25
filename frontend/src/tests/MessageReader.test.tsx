// @vitest-environment jsdom

import { type ReactElement } from 'react'
import { act, cleanup, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import MessageReader from '../components/MessageReader'
import { createTMailTheme } from '../muiTheme'
import { getToasts, toastActions } from '../toast'
import { renderWithTheme } from './renderWithTheme'

function renderReader(ui: ReactElement) {
  const theme = createTMailTheme('light')
  const result = renderWithTheme(ui)
  return {
    ...result,
    rerender: (next: ReactElement) =>
      result.rerender(
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {next}
        </ThemeProvider>,
      ),
  }
}

const mocks = vi.hoisted(() => ({
  message: vi.fn(),
  setSeen: vi.fn(),
  attachment: vi.fn(),
  source: vi.fn(),
  deleteMessage: vi.fn(),
  copyText: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, ...mocks } }
})

vi.mock('../clipboard', () => ({
  copyText: mocks.copyText,
}))

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const detail = {
  '@context': '/contexts/Message',
  '@id': '/messages/one',
  '@type': 'Message',
  id: 'one',
  accountId: 'account',
  msgid: 'one',
  from: { name: 'Sender', address: 'sender@example.com' },
  to: [{ name: '', address: 'box@example.com' }],
  cc: [],
  bcc: [],
  subject: 'A useful subject',
  intro: 'Preview',
  seen: false,
  isDeleted: false,
  hasAttachments: true,
  flagged: false,
  verifications: [],
  retention: false,
  retentionDate: null,
  size: 12,
  downloadUrl: '/sources/one',
  createdAt: '2026-07-22T00:00:00Z',
  updatedAt: '2026-07-22T00:00:00Z',
  text: 'Plain body',
  html: ['<p>HTML body</p>'],
  attachments: [
    {
      '@context': '/contexts/Attachment',
      '@id': '/messages/one/attachments/blob-one',
      '@type': 'Attachment',
      id: 'blob-one',
      filename: 'notes.txt',
      contentType: 'text/plain',
      disposition: 'attachment',
      transferEncoding: 'base64',
      related: false,
      size: 4,
      downloadUrl: '/messages/one/attachments/blob-one',
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    },
  ],
}

const message = (id: string, filename = 'notes.txt') => ({
  ...detail,
  '@id': `/messages/${id}`,
  id,
  msgid: id,
  subject: `Message ${id}`,
  attachments: detail.attachments.map((attachment) => ({ ...attachment, filename })),
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('MessageReader', () => {
  let downloadNames: string[]

  beforeEach(() => {
    downloadNames = []
    mocks.message.mockReset().mockResolvedValue(message('one'))
    mocks.setSeen.mockReset().mockResolvedValue({ seen: true })
    mocks.attachment.mockReset().mockResolvedValue(new Blob(['note']))
    mocks.source.mockReset().mockResolvedValue(new Blob(['source']))
    mocks.deleteMessage.mockReset().mockResolvedValue(undefined)
    mocks.copyText.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadNames.push(this.download)
    })
  })

  afterEach(() => {
    cleanup()
    for (const entry of getToasts()) toastActions.dismiss(entry.id)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads on selection, marks unread mail seen, and isolates HTML', async () => {
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()

    expect(mocks.message).toHaveBeenCalledWith('signed', 'one')
    expect(mocks.setSeen).toHaveBeenCalledWith('signed', 'one', true)
    const frame = container.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('src')).toBe('/message-sandbox?revision=0')
    expect(frame.getAttribute('srcdoc')).toBeNull()
  })

  it('shows the first standalone verification code, preferring the subject', async () => {
    mocks.message.mockResolvedValueOnce({
      ...message('one'),
      subject: 'Code 123456',
      text: 'Use 654321',
      html: ['<p>987654</p>'],
    })
    const { container, rerender } = renderReader(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    expect(container.querySelector('.verification-code')!.textContent).toContain('123456')

    mocks.message.mockResolvedValueOnce({
      ...message('two'),
      subject: 'No code',
      text: 'Long 123456789 only',
      html: [],
    })
    rerender(<MessageReader token="signed" messageId="two" address="box@example.com" />)
    await flushPromises()
    expect(container.querySelector('.verification-code')).toBeNull()
  })

  it('matches a hyphenated code in the subject over an unrelated number in the body', async () => {
    mocks.message.mockResolvedValueOnce({
      ...message('one'),
      subject: 'SpaceXAI confirmation code: 859-133',
      text: 'plain text body',
      html: ['<p>Verification code</p><p>333333</p>'],
    })
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    expect(container.querySelector('.verification-code')!.textContent).toContain('859-133')
  })

  it('does not treat short hyphenated reference numbers as a code', async () => {
    mocks.message.mockResolvedValueOnce({
      ...message('one'),
      subject: 'Table 12-34 rows',
      text: 'no code here',
      html: [],
    })
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    expect(container.querySelector('.verification-code')).toBeNull()
  })

  it('matches an asymmetric 3-4 digit hyphenated code as a single candidate', async () => {
    mocks.message.mockResolvedValueOnce({
      ...message('one'),
      subject: 'Order 401-8842 confirmed',
      text: '',
      html: [],
    })
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    expect(container.querySelector('.verification-code')!.textContent).toContain('401-8842')
  })

  it('downloads attachments and source through the authenticated API', async () => {
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-download-attachment]')!)
    })
    await act(async () => {
      fireEvent.click(container.querySelector('[data-download-source]')!)
    })
    await flushPromises()

    expect(mocks.attachment).toHaveBeenCalledWith('signed', 'one', 'blob-one')
    expect(mocks.source).toHaveBeenCalledWith('signed', 'one')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2)
    expect(downloadNames).toEqual(['notes.txt', 'one.eml'])
  })

  it('deletes only after confirmation and clears the parent selection', async () => {
    const onDeleted = vi.fn()
    const { container } = renderWithTheme(
      <MessageReader
        token="signed"
        messageId="one"
        address="box@example.com"
        onDeleted={onDeleted}
      />,
    )
    await flushPromises()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-action="delete"]')!)
    })
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('Delete this message permanently?')
    expect(mocks.deleteMessage).toHaveBeenCalledWith('signed', 'one')
    expect(onDeleted).toHaveBeenCalledWith('one')
  })

  it('does not let a completed delete for A clear selected message B', async () => {
    const pending = deferred<void>()
    mocks.deleteMessage.mockReturnValueOnce(pending.promise)
    const onDeleted = vi.fn()
    const { container, rerender } = renderReader(
      <MessageReader
        token="signed-a"
        messageId="one"
        address="box@example.com"
        onDeleted={onDeleted}
      />,
    )
    await flushPromises()
    fireEvent.click(container.querySelector('[data-action="delete"]')!)

    mocks.message.mockResolvedValueOnce(message('two'))
    rerender(
      <MessageReader
        token="signed-b"
        messageId="two"
        address="box@example.com"
        onDeleted={onDeleted}
      />,
    )
    await flushPromises()
    pending.resolve()
    await flushPromises()

    expect(mocks.deleteMessage).toHaveBeenCalledWith('signed-a', 'one')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Message two')
  })

  it('does not save source A with message B state after selection changes', async () => {
    const pending = deferred<Blob>()
    mocks.source.mockReturnValueOnce(pending.promise)
    const { container, rerender } = renderReader(
      <MessageReader token="signed-a" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    fireEvent.click(container.querySelector('[data-download-source]')!)

    mocks.message.mockResolvedValueOnce(message('two'))
    rerender(<MessageReader token="signed-b" messageId="two" address="box@example.com" />)
    await flushPromises()
    pending.resolve(new Blob(['source-a']))
    await flushPromises()

    expect(mocks.source).toHaveBeenCalledWith('signed-a', 'one')
    expect(downloadNames).toEqual([])
  })

  it('ignores an action completion after unmount', async () => {
    const pending = deferred<Blob>()
    mocks.source.mockReturnValueOnce(pending.promise)
    const { container, unmount } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    fireEvent.click(container.querySelector('[data-download-source]')!)
    unmount()

    pending.resolve(new Blob(['source']))
    await flushPromises()
    expect(downloadNames).toEqual([])
  })

  it('normalizes a bounded safe attachment basename and preserves its extension', async () => {
    const unsafe = `../folder\\\u202ereport\u0000${'a'.repeat(140)}.txt`
    mocks.message.mockResolvedValueOnce(message('one', unsafe))
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-download-attachment]')!)
    })
    await flushPromises()

    expect(downloadNames[0]).toHaveLength(120)
    expect(downloadNames[0]).toMatch(/\.txt$/)
    expect(downloadNames[0]).not.toMatch(
      /[\\/\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/,
    )
    expect(container.querySelector('.attachments strong')!.textContent).toBe(downloadNames[0])
    expect(
      container.querySelector('[data-download-attachment]')!.getAttribute('aria-label'),
    ).toBe(`Download ${downloadNames[0]}`)
    expect(container.querySelector('.attachments')!.textContent).not.toMatch(
      /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/,
    )
  })

  it('uses a safe fallback for an empty attachment basename', async () => {
    mocks.message.mockResolvedValueOnce(message('one', '../\u202e\u0000'))
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-download-attachment]')!)
    })
    await flushPromises()

    expect(downloadNames).toEqual(['attachment'])
  })

  it('normalizes the source download basename from an untrusted message ID', async () => {
    mocks.message.mockResolvedValueOnce(message('../\u202ereport'))
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="../\u202ereport" address="box@example.com" />,
    )
    await flushPromises()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-download-source]')!)
    })
    await flushPromises()

    expect(downloadNames).toEqual(['report.eml'])
  })

  it('uses a message fallback before appending the source extension', async () => {
    mocks.message.mockResolvedValueOnce(message('../\\\u202e\u0000'))
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="../\\\u202e\u0000" address="box@example.com" />,
    )
    await flushPromises()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-download-source]')!)
    })
    await flushPromises()

    expect(downloadNames).toEqual(['message.eml'])
  })

  it('returns from the reader to the message list', async () => {
    const onBack = vi.fn()
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" onBack={onBack} />,
    )
    await flushPromises()

    fireEvent.click(container.querySelector('[data-action="close"]')!)

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('focuses the back button on mount so opening the reader does not drop focus to <body>', async () => {
    const { container, unmount } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()

    expect(document.activeElement).toBe(container.querySelector('[data-action="close"]'))
    unmount()
  })

  it('renders the verification code banner above reader body and copies the code', async () => {
    mocks.message.mockResolvedValueOnce({
      ...message('one'),
      subject: 'Verification Code: 994821',
      text: 'Here is your verification code: 994821',
      html: [],
    })
    const { container } = renderWithTheme(
      <MessageReader token="signed" messageId="one" address="box@example.com" />,
    )
    await flushPromises()

    const codeAside = container.querySelector('.verification-code')!
    const readerBody = container.querySelector('.reader-body')!
    const grid = container.querySelector('.reader-content-grid')!
    const children = Array.from(grid.children)

    expect(children.indexOf(codeAside)).toBeLessThan(children.indexOf(readerBody))
    expect(codeAside.textContent).toContain('994821')

    const copyBtn = codeAside.querySelector('button')!
    expect(copyBtn.getAttribute('aria-label')).toBe('Copy code')
    await act(async () => {
      fireEvent.click(copyBtn)
    })
    expect(mocks.copyText).toHaveBeenCalledWith('994821')
    expect(getToasts().map((item) => item.message)).toContain('Verification code copied.')
  })

  it.each(['setSeen', 'source', 'attachment', 'deleteMessage'] as const)(
    'clears message content on %s authorization failure',
    async (action) => {
      mocks.message.mockResolvedValueOnce({ ...detail, seen: action !== 'setSeen' })
      mocks[action].mockRejectedValueOnce(new ApiError(401, 'Revoked'))
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const onUnauthorized = vi.fn()
      const { container } = renderWithTheme(
        <MessageReader
          token="visitor"
          messageId="one"
          address="box@example.com"
          onUnauthorized={onUnauthorized}
        />,
      )
      await flushPromises()
      if (action === 'source') fireEvent.click(container.querySelector('[data-download-source]')!)
      if (action === 'attachment') fireEvent.click(container.querySelector('.attachments button')!)
      if (action === 'deleteMessage') fireEvent.click(container.querySelector('[data-action="delete"]')!)
      await flushPromises()
      expect(onUnauthorized).toHaveBeenCalledTimes(1)
      expect(container.querySelector('.reader-body')).toBeNull()
      expect(container.querySelector('.verification-code')).toBeNull()
      expect(container.querySelector('iframe')).toBeNull()
    },
  )

  describe.each(['message', 'setSeen', 'source', 'attachment', 'deleteMessage'] as const)(
    '%s revocation races',
    (action) => {
      it.each([
        [401, false, false],
        [403, false, false],
        [401, false, true],
        [403, false, true],
        [401, true, false],
        [403, true, false],
      ])(
        'handles %s after selection changes (new bearer: %s, already loaded: %s)',
        async (status, newBearer, alreadyLoaded) => {
          const old = deferred<unknown>()
          mocks[action].mockReturnValueOnce(old.promise)
          const onUnauthorized = vi.fn()
          const onDeleted = vi.fn()
          const { container, rerender } = renderReader(
            <MessageReader
              token="visitor"
              messageId="one"
              address="box@example.com"
              onUnauthorized={onUnauthorized}
              onDeleted={onDeleted}
            />,
          )
          await flushPromises()
          if (action === 'source') fireEvent.click(container.querySelector('[data-download-source]')!)
          if (action === 'attachment') fireEvent.click(container.querySelector('.attachments button')!)
          if (action === 'deleteMessage') fireEvent.click(container.querySelector('[data-action="delete"]')!)

          const next = deferred<ReturnType<typeof message>>()
          mocks.message.mockReturnValueOnce(next.promise)
          rerender(
            <MessageReader
              token={newBearer ? 'new-visitor' : 'visitor'}
              messageId="two"
              address="box@example.com"
              onUnauthorized={onUnauthorized}
              onDeleted={onDeleted}
            />,
          )
          if (alreadyLoaded) {
            next.resolve(message('two'))
            await flushPromises()
            expect(container.textContent).toContain('Message two')
          }
          old.reject(new ApiError(status, 'Revoked'))
          await flushPromises()
          expect.soft(onUnauthorized).toHaveBeenCalledTimes(newBearer ? 0 : 1)
          next.resolve(message('two'))
          await flushPromises()
          expect.soft(container.textContent?.includes('Message two')).toBe(newBearer)
          expect(onDeleted).not.toHaveBeenCalled()
          expect(downloadNames).toEqual([])
          if (!newBearer) {
            fireEvent.click(container.querySelector('.reader-state button')!)
            await flushPromises()
            expect(container.textContent).not.toContain('Message two')
            expect(mocks.message).toHaveBeenCalledTimes(2)
            mocks.message.mockResolvedValueOnce(message('three'))
            rerender(
              <MessageReader
                token="replacement-visitor"
                messageId="three"
                address="box@example.com"
                onUnauthorized={onUnauthorized}
                onDeleted={onDeleted}
              />,
            )
            await flushPromises()
            expect(container.textContent).toContain('Message three')
          }
        },
      )

      it('ignores authorization failure after unmount', async () => {
        const old = deferred<unknown>()
        mocks[action].mockReturnValueOnce(old.promise)
        const onUnauthorized = vi.fn()
        const { container, unmount } = renderWithTheme(
          <MessageReader
            token="visitor"
            messageId="one"
            address="box@example.com"
            onUnauthorized={onUnauthorized}
          />,
        )
        await flushPromises()
        if (action === 'source') fireEvent.click(container.querySelector('[data-download-source]')!)
        if (action === 'attachment') fireEvent.click(container.querySelector('.attachments button')!)
        if (action === 'deleteMessage') fireEvent.click(container.querySelector('[data-action="delete"]')!)
        unmount()
        old.reject(new ApiError(401, 'Revoked'))
        await flushPromises()
        expect(onUnauthorized).not.toHaveBeenCalled()
      })
    },
  )
})
