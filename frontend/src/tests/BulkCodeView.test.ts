// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import BulkCodeView from '../components/BulkCodeView.vue'
import { initLocale } from '../i18n'

const mocks = vi.hoisted(() => ({
  token: vi.fn(), messages: vi.fn(), message: vi.fn(), copyText: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, ...mocks } }
})
vi.mock('../clipboard', () => ({ copyText: mocks.copyText }))
vi.mock('../toast', () => ({ useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }) }))

const messages = (id = 'one') => ({ 'hydra:member': id ? [{ id }] : [] })
const detail = { id: 'one', subject: 'Your code is 123456', text: '', html: [] }

enableAutoUnmount(afterEach)

describe('BulkCodeView', () => {
  beforeEach(() => {
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

    expect(wrapper.findAll('td[aria-live="polite"]')).toHaveLength(2)
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

  it('reissues only an expired cached row token', async () => {
    const wrapper = mount(BulkCodeView, { props: { fetchSeconds: 20 } })
    await wrapper.get('#bulk-code-addresses').setValue('one@example.com two@example.com')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()
    mocks.messages.mockRejectedValueOnce(new ApiError(401, 'Expired')).mockResolvedValue(messages())

    await wrapper.get('[data-action="refresh"]').trigger('click')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(3)
  })
})
