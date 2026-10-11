// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import BulkCodeView from '../components/BulkCodeView.vue'
import { initLocale } from '../i18n'

const mocks = vi.hoisted(() => ({
  me: vi.fn(), adminSession: vi.fn(), adminMailboxToken: vi.fn(), logout: vi.fn(),
  token: vi.fn(), messages: vi.fn(), message: vi.fn(), copyText: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, ...mocks, admin: { ...actual.api.admin, session: mocks.adminSession, mailboxToken: mocks.adminMailboxToken } } }
})
vi.mock('../clipboard', () => ({ copyText: mocks.copyText }))
vi.mock('../toast', () => ({ useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }) }))

const messages = (id = 'one') => ({ 'hydra:member': id ? [{ id }] : [] })
const detail = { id: 'one', subject: 'Your code is 123456', text: '', html: [] }

enableAutoUnmount(afterEach)

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
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('parses, deduplicates, caps at ten, and exposes the accessible table controls', async () => {
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue([
      ' ONE@example.com ', 'one@example.com', ...Array.from({ length: 10 }, (_, index) => `box${index}@example.com`),
    ].join(', '))

    expect(wrapper.get('label[for="bulk-code-addresses"]').text()).toBe('Email addresses')
    expect(wrapper.text()).toContain('Only the first 10 unique addresses will be read.')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(10)
    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    expect(wrapper.findAll('thead th')).toHaveLength(4)
  })

  it('resolves rows independently and announces a row error', async () => {
    mocks.token.mockImplementation((address: string) => address === 'bad@example.com'
      ? Promise.reject(new ApiError(422, 'Domain not accepted'))
      : Promise.resolve({ token: `signed-${address}` }))
    const wrapper = mount(BulkCodeView, { props: { accessToken: 'access-token', fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com, bad@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledWith('one@example.com', 'access-token')
    expect(wrapper.text()).toContain('123456')
    expect(wrapper.get('[role="alert"]').text()).toContain('Domain not accepted')
  })
  it('exports code rows as CSV', async () => {
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    const exportBtn = wrapper.find('.bulk-export-csv')
    expect(exportBtn.exists()).toBe(true)
    expect(exportBtn.text()).toContain('Export CSV')
  })


  it('shows no-message placeholders instead of an error', async () => {
    mocks.messages.mockResolvedValue(messages(''))
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('empty@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('(No subject)')
    expect(wrapper.text()).toContain('(No code)')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('announces loading rows politely', async () => {
    let resolveToken!: (value: { token: string }) => void
    mocks.token.mockImplementationOnce(() => new Promise((resolve) => { resolveToken = resolve }))
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('slow@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')

    expect(wrapper.findAll('td[aria-live="polite"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Loading latest message')
    resolveToken({ token: 'signed' })
    await flushPromises()
  })

  it('copies code and email and surfaces success toasts', async () => {
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    await wrapper.get('[aria-label="Copy code for one@example.com"]').trigger('click')
    await wrapper.get('[aria-label="Copy email one@example.com"]').trigger('click')

    expect(mocks.copyText).toHaveBeenNthCalledWith(1, '123456')
    expect(mocks.copyText).toHaveBeenNthCalledWith(2, 'one@example.com')
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2)
  })

  it('polls cached rows without another token request', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const setInterval = vi.spyOn(window, 'setInterval')
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 1 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    const tick = setInterval.mock.calls[0]?.[0] as () => void
    expect(tick).toEqual(expect.any(Function))
    tick()
    await flushPromises()
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(1)
    expect(mocks.messages).toHaveBeenCalledTimes(2)
    expect(mocks.message).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('refreshes manually without waiting for the interval', async () => {
    vi.useFakeTimers()
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 60 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()

    expect(mocks.messages).toHaveBeenCalledTimes(2)
    expect(mocks.token).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not retry a failed row on poll ticks, only on manual refresh', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    mocks.token.mockImplementation((address: string) => address === 'bad@example.com'
      ? Promise.reject(new ApiError(422, 'Domain not accepted'))
      : Promise.resolve({ token: `signed-${address}` }))
    const setInterval = vi.spyOn(window, 'setInterval')
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 1 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com, bad@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledTimes(2)

    const tick = setInterval.mock.calls[0]?.[0] as () => void
    tick()
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledTimes(2)

    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('keeps the last-known code visible while a poll tick refetches it', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const setInterval = vi.spyOn(window, 'setInterval')
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 1 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('123456')

    let resolveMessages!: (value: ReturnType<typeof messages>) => void
    mocks.messages.mockReset().mockImplementationOnce(() => new Promise((resolve) => { resolveMessages = resolve }))
    const tick = setInterval.mock.calls[0]?.[0] as () => void
    tick()
    await flushPromises()
    // Row is mid-refresh (messages() still pending) — code must stay visible, not blank to a skeleton.
    expect(wrapper.text()).toContain('123456')
    expect(wrapper.findAll('td[aria-live="polite"]')).toHaveLength(0)

    resolveMessages(messages())
    await flushPromises()
    expect(wrapper.text()).toContain('123456')
    wrapper.unmount()
  })

  it('locks an expired cached row without issuing another passwordless token', async () => {
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com two@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()
    mocks.messages.mockRejectedValueOnce(new ApiError(401, 'Expired')).mockResolvedValue(messages())

    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(2)
    expect(wrapper.find('a').attributes('href')).toBe('/one%40example.com')
    expect(wrapper.findAll('tbody tr')[0]?.text()).not.toContain('123456')
  })

  it('uses saved visitor tokens and admin exchanges without passwordless issuance', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-saved' }]))
    mocks.me.mockResolvedValue({ address: 'one@example.com', accessKind: 'visitor', protected: true })
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledWith('visitor-saved')
    expect(mocks.token).not.toHaveBeenCalled()
    mocks.adminSession.mockResolvedValue({ csrfToken: 'csrf' })
    mocks.adminMailboxToken.mockResolvedValue({ token: 'admin-memory', accessKind: 'admin' })
    await wrapper.get('#bulk-code-addresses').setValue('admin@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.adminMailboxToken).toHaveBeenCalledWith('admin@example.com', 'csrf')
    expect(localStorage.getItem('tmail.addresses')).not.toContain('admin-memory')
  })

  it('does not repeatedly issue a passwordless token for locked rows', async () => {
    mocks.token.mockRejectedValue(new ApiError(401, 'Password required'))
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()
    expect(mocks.token).toHaveBeenCalledOnce()
    expect(wrapper.get('a').attributes('href')).toBe('/one%40example.com')
  })

  it.each(['storage', 'refresh'])('recovers a locked row after another tab signs in via %s', async (recovery) => {
    mocks.token.mockRejectedValue(new ApiError(401, 'Password required'))
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('a').exists()).toBe(true)

    let validate!: (value: { address: string; accessKind: string }) => void
    mocks.me.mockReturnValueOnce(new Promise((resolve) => { validate = resolve }))
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-new' }]))
    if (recovery === 'storage') window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    else await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledWith('visitor-new')
    expect(wrapper.text()).not.toContain('123456')
    expect(mocks.messages).not.toHaveBeenCalled()

    validate({ address: 'one@example.com', accessKind: 'visitor' })
    await flushPromises()
    expect(mocks.messages).toHaveBeenCalledWith('visitor-new', 1)
    expect(wrapper.text()).toContain('123456')
    expect(wrapper.find('a').exists()).toBe(false)
    expect(mocks.token).toHaveBeenCalledOnce()
  })

  it('keeps a revoked replacement locked without repeatedly requesting public access', async () => {
    mocks.token.mockRejectedValue(new ApiError(401, 'Password required'))
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    mocks.me.mockRejectedValue(new ApiError(401, 'Revoked'))
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-revoked' }]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledWith('visitor-revoked')
    expect(wrapper.find('a').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('123456')
    expect(mocks.messages).not.toHaveBeenCalled()
    const attempts = mocks.token.mock.calls.length
    await wrapper.get('[data-action="refresh"]').trigger('click')
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()
    expect(mocks.me).toHaveBeenCalledOnce()
    expect(mocks.token).toHaveBeenCalledTimes(attempts)
  })

  it('uses a replacement visitor token without restoring a late response from the old token', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-old' }]))
    mocks.me.mockResolvedValue({ address: 'one@example.com', accessKind: 'visitor' })
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    let finish!: (value: typeof detail) => void
    mocks.message.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()

    mocks.message.mockResolvedValue({ ...detail, subject: 'Your new code is 654321' })
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-new' }]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()
    expect(mocks.me).toHaveBeenLastCalledWith('visitor-new')
    expect(wrapper.text()).toContain('654321')
    finish(detail)
    await flushPromises()
    expect(wrapper.text()).not.toContain('123456')
    expect(wrapper.text()).toContain('654321')
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it('clears codes on cross-tab removal and prevents a late detail response from restoring them', async () => {
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'one@example.com', token: 'visitor-saved' }]))
    mocks.me.mockResolvedValue({ address: 'one@example.com', accessKind: 'visitor' })
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    let finish!: (value: typeof detail) => void
    mocks.message.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()
    localStorage.removeItem('tmail.addresses')
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('123456')
    finish(detail)
    await flushPromises()
    expect(wrapper.text()).not.toContain('123456')
    expect(wrapper.find('a').exists()).toBe(true)
  })

  it('finishes pending bulk rows after unrelated storage updates', async () => {
    let finish!: (value: typeof detail) => void
    mocks.message.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    localStorage.setItem('tmail.addresses', JSON.stringify([{ address: 'other@example.com', token: 'other' }]))
    window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
    finish(detail)
    await flushPromises()
    expect(wrapper.text()).toContain('123456')
    expect(wrapper.find('.skeleton').exists()).toBe(false)
    expect(wrapper.get('[data-action="refresh"]').attributes('disabled')).toBeUndefined()
  })

  it('keeps public rows readable when another tab replaces or removes its saved public token', async () => {
    mocks.token.mockResolvedValue({ token: 'public-one', accessKind: 'public' })
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    for (const value of [JSON.stringify([{ address: 'one@example.com', token: 'public-two' }]), '[]']) {
      localStorage.setItem('tmail.addresses', value)
      window.dispatchEvent(new StorageEvent('storage', { key: 'tmail.addresses' }))
      await flushPromises()
      expect(wrapper.text()).toContain('123456')
      expect(wrapper.find('a').exists()).toBe(false)
    }
  })
})
