// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import BulkGenerateView from '../components/BulkGenerateView.vue'
import { initLocale } from '../i18n'
import { useToast } from '../toast'

const mocks = vi.hoisted(() => ({ domains: vi.fn(), copyText: vi.fn() }))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, domains: mocks.domains } }
})

vi.mock('../clipboard', () => ({ copyText: mocks.copyText }))

const domains = (values: string[]) => ({
  '@context': '/contexts/Domain',
  '@id': '/domains',
  '@type': 'hydra:Collection',
  'hydra:totalItems': values.length,
  'hydra:member': values.map((domain, index) => ({ id: String(index), domain })),
})

enableAutoUnmount(afterEach)

describe('BulkGenerateView', () => {
  beforeEach(() => {
    const { toasts, dismiss } = useToast()
    for (const toast of toasts.value) dismiss(toast.id)
    initLocale()
    mocks.domains.mockReset().mockResolvedValue(domains(['example.com']))
    mocks.copyText.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders loading, error, and empty domain states', async () => {
    let resolveDomains: (value: ReturnType<typeof domains>) => void
    mocks.domains.mockImplementationOnce(() => new Promise((resolve) => { resolveDomains = resolve }))
    const loading = mount(BulkGenerateView)
    expect(loading.text()).toContain('Loading receiving domains')
    resolveDomains!(domains([]))
    await flushPromises()
    expect(loading.text()).toContain('No receiving domains are available')

    mocks.domains.mockRejectedValueOnce(new ApiError(502, 'Domain list unavailable'))
    const error = mount(BulkGenerateView)
    await flushPromises()
    expect(error.get('[role="alert"]').text()).toContain('Domain list unavailable')
  })

  it('generates the requested rows and supports opening and copying an address', async () => {
    let value = 0
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.fill(value++)
        return values
      },
    })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mount(BulkGenerateView)
    await flushPromises()

    await wrapper.get('#bulk-count').setValue(3)
    await wrapper.get('.bulk-controls').trigger('submit')

    const rows = wrapper.findAll('.bulk-list li')
    expect(rows).toHaveLength(3)
    const address = rows[0]!.get('.saved-address').text()
    await rows[0]!.get('.bulk-open-button').trigger('click')
    expect(open).toHaveBeenCalledWith(`/${encodeURIComponent(address)}`, '_blank', 'noopener')

    await rows[0]!.get('.text-button').trigger('click')
    expect(mocks.copyText).toHaveBeenCalledWith(address)
  })

  it('clears a generated batch when the access token changes', async () => {
    let value = 0
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.fill(value++)
        return values
      },
    })
    const wrapper = mount(BulkGenerateView, { props: { accessToken: 'access-token' } })
    await flushPromises()

    await wrapper.get('.bulk-controls').trigger('submit')
    expect(wrapper.findAll('.bulk-list li').length).toBeGreaterThan(0)

    mocks.domains.mockResolvedValueOnce(domains(['example.com']))
    await wrapper.setProps({ accessToken: '' })
    await flushPromises()

    expect(mocks.domains).toHaveBeenLastCalledWith(1, undefined)
    expect(wrapper.find('.bulk-list').exists()).toBe(false)
    expect(wrapper.text()).toContain('Generate a batch to see addresses here.')
  })
})
