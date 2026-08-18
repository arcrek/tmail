// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import BulkCodeView from '../components/BulkCodeView.vue'
import { initLocale } from '../i18n'

const mocks = vi.hoisted(() => ({ token: vi.fn(), messages: vi.fn(), message: vi.fn(), copyText: vi.fn() }))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, ...mocks } }
})
vi.mock('../clipboard', () => ({ copyText: mocks.copyText }))

const messages = (id = 'one') => ({ 'hydra:member': [{ id }] })
const detail = { id: 'one', subject: 'Your code is 123456', text: '', html: [] }

enableAutoUnmount(afterEach)

describe('BulkCodeView', () => {
  beforeEach(() => {
    initLocale()
    mocks.token.mockReset().mockResolvedValue({ token: 'signed' })
    mocks.messages.mockReset().mockResolvedValue(messages())
    mocks.message.mockReset().mockResolvedValue(detail)
    mocks.copyText.mockReset().mockResolvedValue(undefined)
  })

  it('normalizes, deduplicates, and resolves each address independently', async () => {
    mocks.token.mockImplementation((address: string) => address === 'bad@example.com'
      ? Promise.reject(new ApiError(422, 'Domain not accepted'))
      : Promise.resolve({ token: `signed-${address}` }))
    const wrapper = mount(BulkCodeView, { props: { accessToken: 'access-token' } })
    await wrapper.get('#bulk-code-addresses').setValue(' ONE@example.com, bad@example.com one@example.com ')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(2)
    expect(mocks.token).toHaveBeenCalledWith('one@example.com', 'access-token')
    expect(wrapper.text()).toContain('123456')
    expect(wrapper.text()).toContain('Domain not accepted')
  })

  it('caps input at ten addresses and reuses a cached token when retrying a row', async () => {
    mocks.messages.mockRejectedValueOnce(new ApiError(401, 'Expired'))
    const wrapper = mount(BulkCodeView)
    await wrapper.get('#bulk-code-addresses').setValue(Array.from({ length: 11 }, (_, index) => `box${index}@example.com`).join('\n'))
    expect(wrapper.text()).toContain('Only the first 10 unique addresses will be read.')
    await wrapper.get('.bulk-controls').trigger('submit')
    await flushPromises()
    await wrapper.findAll('.text-button').find((button) => button.text() === 'Retry')!.trigger('click')
    await flushPromises()

    expect(mocks.token).toHaveBeenCalledTimes(10)
  })
})
