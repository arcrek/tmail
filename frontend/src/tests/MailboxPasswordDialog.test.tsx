// @vitest-environment jsdom

import { act, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, api } from '../api'
import MailboxPasswordDialog from '../components/MailboxPasswordDialog'
import { initLocale, setLocale } from '../i18n'
import { renderWithTheme } from './renderWithTheme'

beforeEach(() => {
  localStorage.clear()
  initLocale()
  setLocale('en')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const visitor = {
  address: 'box@example.com',
  token: 'old',
  accessKind: 'visitor' as const,
  protected: true,
  protectedUntil: '2027-01-08T20:00:00Z',
}
const replacement = { id: 'id', token: 'new', accessKind: 'visitor' as const, protected: true }

it('sets protection with exact spaces and astral characters, clears inputs, and shows the warning', async () => {
  const set = vi.spyOn(api, 'setPassword').mockResolvedValue(replacement)
  const onUpdated = vi.fn()
  const { container } = renderWithTheme(
    <MailboxPasswordDialog
      session={{ address: visitor.address, token: 'public', accessKind: 'public' }}
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onInvalid={vi.fn()}
      onReplacing={vi.fn()}
    />,
  )
  const password = ' ' + '😀'.repeat(126) + ' '
  const newInput = container.querySelector('#mailbox-new-password') as HTMLInputElement
  const confirmInput = container.querySelector('#mailbox-confirm-password') as HTMLInputElement
  fireEvent.change(newInput, { target: { value: password } })
  fireEvent.change(confirmInput, { target: { value: password } })
  expect(newInput.getAttribute('maxlength')).toBeNull()
  expect(container.textContent).toContain(
    'Reading mail while already signed in does not extend this period.',
  )
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  expect(set).toHaveBeenCalledWith('public', password, undefined)
  expect(onUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'new', accessKind: 'visitor' }),
  )
  expect(newInput.value).toBe('')
})

it('requires current password for changes and reports wrong passwords without discarding the session', async () => {
  const set = vi
    .spyOn(api, 'setPassword')
    .mockRejectedValue(new ApiError(401, 'Invalid mailbox credentials'))
  const onInvalid = vi.fn()
  const { container } = renderWithTheme(
    <MailboxPasswordDialog
      session={visitor}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onInvalid={onInvalid}
      onReplacing={vi.fn()}
    />,
  )
  const currentInput = container.querySelector('#mailbox-current-password') as HTMLInputElement
  const newInput = container.querySelector('#mailbox-new-password') as HTMLInputElement
  const confirmInput = container.querySelector('#mailbox-confirm-password') as HTMLInputElement
  fireEvent.change(newInput, { target: { value: 'replacement-pass' } })
  fireEvent.change(confirmInput, { target: { value: 'replacement-pass' } })
  fireEvent.submit(container.querySelector('form')!)
  expect(set).not.toHaveBeenCalled()

  fireEvent.change(currentInput, { target: { value: 'wrong-password' } })
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  expect(set).toHaveBeenCalledWith('old', 'replacement-pass', 'wrong-password')
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('incorrect')
  expect(onInvalid).not.toHaveBeenCalled()
  expect(currentInput.value).toBe('')
})

it('removes protection with the current password and returns the fresh public bearer', async () => {
  const remove = vi
    .spyOn(api, 'removePassword')
    .mockResolvedValue({ id: 'id', token: 'public-new', accessKind: 'public', protected: false })
  const onUpdated = vi.fn()
  const { container } = renderWithTheme(
    <MailboxPasswordDialog
      session={visitor}
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onInvalid={vi.fn()}
      onReplacing={vi.fn()}
    />,
  )
  fireEvent.click(container.querySelector('.secondary-button')!)
  expect(container.textContent).toContain('Anyone with its address can read its mail.')
  fireEvent.change(container.querySelector('#mailbox-current-password')!, {
    target: { value: 'current-password' },
  })
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  expect(remove).toHaveBeenCalledWith('old', 'current-password')
  expect(onUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'public-new', protected: false }),
  )
})

it.each([false, true])('admin mutation re-exchanges a memory-only token (remove=%s)', async (remove) => {
  const set = vi.spyOn(api.admin, 'setMailboxPassword').mockResolvedValue({ protected: true })
  const unset = vi.spyOn(api.admin, 'removeMailboxPassword').mockResolvedValue({ protected: false })
  const exchange = vi
    .spyOn(api.admin, 'mailboxToken')
    .mockResolvedValue({ id: 'id', token: 'admin-new', accessKind: 'admin', protected: !remove })
  const onReplacing = vi.fn()
  const onUpdated = vi.fn()
  const { container } = renderWithTheme(
    <MailboxPasswordDialog
      session={{ ...visitor, accessKind: 'admin', csrf: 'csrf' }}
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onInvalid={vi.fn()}
      onReplacing={onReplacing}
    />,
  )
  expect(container.querySelector('#mailbox-current-password')).toBeNull()
  if (remove) {
    fireEvent.click(container.querySelector('.secondary-button')!)
  } else {
    fireEvent.change(container.querySelector('#mailbox-new-password')!, {
      target: { value: 'replacement-pass' },
    })
    fireEvent.change(container.querySelector('#mailbox-confirm-password')!, {
      target: { value: 'replacement-pass' },
    })
  }
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  if (remove) expect(unset).toHaveBeenCalledWith(visitor.address, 'csrf')
  else expect(set).toHaveBeenCalledWith(visitor.address, 'replacement-pass', 'csrf')
  expect(exchange).toHaveBeenCalledWith(visitor.address, 'csrf')
  expect(onReplacing).toHaveBeenCalledTimes(1)
  expect(onUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'admin-new', accessKind: 'admin', csrf: 'csrf' }),
  )
  expect(localStorage.length).toBe(0)
})

it('validates code point length and confirmation before any request', () => {
  const set = vi.spyOn(api, 'setPassword')
  const { container } = renderWithTheme(
    <MailboxPasswordDialog
      session={{ address: visitor.address, token: 'public' }}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onInvalid={vi.fn()}
      onReplacing={vi.fn()}
    />,
  )
  for (const password of ['😀'.repeat(11), '😀'.repeat(129)]) {
    fireEvent.change(container.querySelector('#mailbox-new-password')!, {
      target: { value: password },
    })
    fireEvent.change(container.querySelector('#mailbox-confirm-password')!, {
      target: { value: password },
    })
    fireEvent.submit(container.querySelector('form')!)
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('12–128')
  }
  fireEvent.change(container.querySelector('#mailbox-new-password')!, {
    target: { value: 'correct-password' },
  })
  fireEvent.change(container.querySelector('#mailbox-confirm-password')!, {
    target: { value: 'different-password' },
  })
  fireEvent.submit(container.querySelector('form')!)
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('do not match')
  expect(set).not.toHaveBeenCalled()
})

it('uses the native modal, Escape dismissal, focus restoration, and Vietnamese deadline text', () => {
  setLocale('vi')
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const show = vi.fn()
  const close = vi.fn()
  const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: show,
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: close,
  })
  const onClose = vi.fn()
  try {
    const { container, unmount } = renderWithTheme(
      <MailboxPasswordDialog
        session={visitor}
        onClose={onClose}
        onUpdated={vi.fn()}
        onInvalid={vi.fn()}
        onReplacing={vi.fn()}
      />,
    )
    expect(show).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('Hết hạn bảo vệ:')
    expect(container.textContent).toContain('Đọc thư khi đã đăng nhập không gia hạn')

    fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(close).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  } finally {
    if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow)
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose)
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close
    trigger.remove()
  }
})

it('invalidates a revoked visitor bearer instead of treating it as a wrong password', async () => {
  vi.spyOn(api, 'setPassword').mockRejectedValue(
    new ApiError(401, 'Invalid bearer token', {
      '@context': '/contexts/Error',
      '@type': 'hydra:Error',
      'hydra:title': 'Authentication required',
      'hydra:description': 'Invalid bearer token',
      code: 'invalid_token',
    }),
  )
  const onInvalid = vi.fn()
  const { container } = renderWithTheme(
    <MailboxPasswordDialog
      session={visitor}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onInvalid={onInvalid}
      onReplacing={vi.fn()}
    />,
  )
  fireEvent.change(container.querySelector('#mailbox-current-password')!, {
    target: { value: 'current-password' },
  })
  fireEvent.change(container.querySelector('#mailbox-new-password')!, {
    target: { value: 'replacement-pass' },
  })
  fireEvent.change(container.querySelector('#mailbox-confirm-password')!, {
    target: { value: 'replacement-pass' },
  })
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  expect(onInvalid).toHaveBeenCalledTimes(1)
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('Sign in again')
})
