// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardTab from '../admin/DashboardTab.vue'
import type { DashboardResource } from '../types'

const dashboard = vi.hoisted(() => vi.fn())

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, admin: { ...actual.api.admin, dashboard } } }
})

enableAutoUnmount(afterEach)

const response = (recentMxFailures: DashboardResource['domains']['recentMxFailures'] = []): DashboardResource => ({
  messages: { stored: 41, today: 6, sevenDays: 29 },
  domains: { active: 2, domainsToday: 3, domainsSevenDays: 9, recentDomains: [], recentMxFailures },
  autoSyncDomains: true,
  lastSync: {},
  lastSuccessfulSync: {},
  lastSyncError: {},
})

describe('DashboardTab', () => {
  beforeEach(() => dashboard.mockReset().mockResolvedValue(response()))

  it('renders domain metrics from the dashboard response', async () => {
    const wrapper = mount(DashboardTab)
    await flushPromises()

    expect(wrapper.text()).toContain('Active domains')
    expect(wrapper.text()).toContain('Domains today')
    expect(wrapper.text()).toContain('Domains in seven days')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('9')
  })

  it('renders MX failures with translated kinds', async () => {
    dashboard.mockResolvedValue(response([
      { domain: 'mismatch.example', kind: 'mx_mismatch', detail: null, created_at: '2026-08-14T10:00:00Z' },
      { domain: 'lookup.example', kind: 'mx_lookup_error', detail: 'DNS timed out', created_at: '2026-08-14T09:00:00Z' },
    ]))
    const wrapper = mount(DashboardTab)
    await flushPromises()

    expect(wrapper.text()).toContain('mismatch.example')
    expect(wrapper.text()).toContain('MX record mismatch')
    expect(wrapper.text()).toContain('lookup.example')
    expect(wrapper.text()).toContain('MX lookup error')
    expect(wrapper.text()).not.toContain('mx_mismatch')
    expect(wrapper.text()).not.toContain('mx_lookup_error')
  })

  it('renders the MX failure empty state', async () => {
    const wrapper = mount(DashboardTab)
    await flushPromises()

    expect(wrapper.text()).toContain('No recent MX failures.')
  })

  it('keeps loading and error states working', async () => {
    let reject!: (cause: Error) => void
    dashboard.mockImplementationOnce(() => new Promise((_, onReject) => { reject = onReject }))
    const wrapper = mount(DashboardTab)

    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.metric-skeleton')).toHaveLength(3)
    reject(new Error('Dashboard unavailable'))
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Dashboard unavailable')
  })
})
