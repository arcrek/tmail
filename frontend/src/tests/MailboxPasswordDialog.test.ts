// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, api } from '../api'
import MailboxPasswordDialog from '../components/MailboxPasswordDialog.vue'
import { initLocale, setLocale } from '../i18n'

enableAutoUnmount(afterEach)
beforeEach(() => { localStorage.clear(); initLocale(); setLocale('en') })
afterEach(() => vi.restoreAllMocks())
const visitor = { address: 'box@example.com', token: 'old', accessKind: 'visitor' as const, protected: true, protectedUntil: '2027-01-08T20:00:00Z' }
const replacement = { id: 'id', token: 'new', accessKind: 'visitor' as const, protected: true }

it('sets protection with exact spaces and astral characters, clears inputs, and shows the warning', async () => {
  const set = vi.spyOn(api, 'setPassword').mockResolvedValue(replacement)
  const wrapper = mount(MailboxPasswordDialog, { props: { session: { address: visitor.address, token: 'public', accessKind: 'public' } } })
  const password = ' ' + '😀'.repeat(126) + ' '
  await wrapper.get('#mailbox-new-password').setValue(password)
  await wrapper.get('#mailbox-confirm-password').setValue(password)
  expect(wrapper.get('#mailbox-new-password').attributes('maxlength')).toBeUndefined()
  expect(wrapper.text()).toContain('Reading mail while already signed in does not extend this period.')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(set).toHaveBeenCalledWith('public', password, undefined)
  expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ token: 'new', accessKind: 'visitor' })
  expect((wrapper.get('#mailbox-new-password').element as HTMLInputElement).value).toBe('')
})

it('requires current password for changes and reports wrong passwords without discarding the session', async () => {
  const set = vi.spyOn(api, 'setPassword').mockRejectedValue(new ApiError(401, 'Invalid mailbox credentials'))
  const wrapper = mount(MailboxPasswordDialog, { props: { session: visitor } })
  await wrapper.get('#mailbox-new-password').setValue('replacement-pass')
  await wrapper.get('#mailbox-confirm-password').setValue('replacement-pass')
  await wrapper.get('form').trigger('submit')
  expect(set).not.toHaveBeenCalled()
  await wrapper.get('#mailbox-current-password').setValue('wrong-password')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(set).toHaveBeenCalledWith('old', 'replacement-pass', 'wrong-password')
  expect(wrapper.get('[role="alert"]').text()).toContain('incorrect')
  expect(wrapper.emitted('invalid')).toBeUndefined()
  expect((wrapper.get('#mailbox-current-password').element as HTMLInputElement).value).toBe('')
})

it('removes protection with the current password and returns the fresh public bearer', async () => {
  const remove = vi.spyOn(api, 'removePassword').mockResolvedValue({ id: 'id', token: 'public-new', accessKind: 'public', protected: false })
  const wrapper = mount(MailboxPasswordDialog, { props: { session: visitor } })
  await wrapper.get('.secondary-button').trigger('click')
  expect(wrapper.text()).toContain('Anyone with its address can read its mail.')
  await wrapper.get('#mailbox-current-password').setValue('current-password')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(remove).toHaveBeenCalledWith('old', 'current-password')
  expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ token: 'public-new', protected: false })
})

it.each([false, true])('admin mutation re-exchanges a memory-only token (remove=%s)', async (remove) => {
  const set = vi.spyOn(api.admin, 'setMailboxPassword').mockResolvedValue({ protected: true })
  const unset = vi.spyOn(api.admin, 'removeMailboxPassword').mockResolvedValue({ protected: false })
  const exchange = vi.spyOn(api.admin, 'mailboxToken').mockResolvedValue({ id: 'id', token: 'admin-new', accessKind: 'admin', protected: !remove })
  const wrapper = mount(MailboxPasswordDialog, { props: { session: { ...visitor, accessKind: 'admin', csrf: 'csrf' } } })
  expect(wrapper.find('#mailbox-current-password').exists()).toBe(false)
  if (remove) await wrapper.get('.secondary-button').trigger('click')
  else {
    await wrapper.get('#mailbox-new-password').setValue('replacement-pass')
    await wrapper.get('#mailbox-confirm-password').setValue('replacement-pass')
  }
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  if (remove) expect(unset).toHaveBeenCalledWith(visitor.address, 'csrf')
  else expect(set).toHaveBeenCalledWith(visitor.address, 'replacement-pass', 'csrf')
  expect(exchange).toHaveBeenCalledWith(visitor.address, 'csrf')
  expect(wrapper.emitted('replacing')).toHaveLength(1)
  expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ token: 'admin-new', accessKind: 'admin', csrf: 'csrf' })
  expect(localStorage.length).toBe(0)
})

it('validates code point length and confirmation before any request', async () => {
  const set = vi.spyOn(api, 'setPassword')
  const wrapper = mount(MailboxPasswordDialog, { props: { session: { address: visitor.address, token: 'public' } } })
  for (const password of ['😀'.repeat(11), '😀'.repeat(129)]) {
    await wrapper.get('#mailbox-new-password').setValue(password)
    await wrapper.get('#mailbox-confirm-password').setValue(password)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('12–128')
  }
  await wrapper.get('#mailbox-new-password').setValue('correct-password')
  await wrapper.get('#mailbox-confirm-password').setValue('different-password')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.get('[role="alert"]').text()).toContain('do not match')
  expect(set).not.toHaveBeenCalled()
})

it('uses the native modal, Escape dismissal, focus restoration, and Vietnamese deadline text', async () => {
  setLocale('vi')
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const show = vi.fn()
  const close = vi.fn()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: show })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close })
  const wrapper = mount(MailboxPasswordDialog, { props: { session: visitor }, attachTo: document.body })
  expect(show).toHaveBeenCalledOnce()
  expect(wrapper.text()).toContain('Hết hạn bảo vệ:')
  expect(wrapper.text()).toContain('Đọc thư khi đã đăng nhập không gia hạn')
  await wrapper.get('dialog').trigger('cancel')
  expect(wrapper.emitted('close')).toHaveLength(1)
  wrapper.unmount()
  expect(close).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
})

it('invalidates a revoked visitor bearer instead of treating it as a wrong password', async () => {
  vi.spyOn(api, 'setPassword').mockRejectedValue(new ApiError(401, 'Invalid bearer token', { '@context': '/contexts/Error', '@type': 'hydra:Error', 'hydra:title': 'Authentication required', 'hydra:description': 'Invalid bearer token', code: 'invalid_token' }))
  const wrapper = mount(MailboxPasswordDialog, { props: { session: visitor } })
  await wrapper.get('#mailbox-current-password').setValue('current-password')
  await wrapper.get('#mailbox-new-password').setValue('replacement-pass')
  await wrapper.get('#mailbox-confirm-password').setValue('replacement-pass')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('invalid')).toHaveLength(1)
  expect(wrapper.get('[role="alert"]').text()).toContain('Sign in again')
})
