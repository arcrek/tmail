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
  domains: { active: 2, domainsToday: 3, domainsSevenDays: 9, recentDomains: [], recentMxFailures, mxFailures24h: 0 },
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

    const domains = wrapper.get('[aria-labelledby="kpi-domain-title"]')
    expect(domains.findAll('dt').map((term) => term.text())).toEqual(['Active', 'New today', 'New in 7 days'])
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

  it('reports the backend 24-hour MX failure count as status and attention count', async () => {
    const now = Date.now()
    const base = response([
      { domain: 'fresh.example', kind: 'mx_mismatch', detail: null, created_at: new Date(now - 60_000).toISOString() },
      { domain: 'old.example', kind: 'mx_lookup_error', detail: null, created_at: new Date(now - 3 * 86_400_000).toISOString() },
    ])
    dashboard.mockResolvedValue({
      ...base,
      domains: { ...base.domains, mxFailures24h: 14 },
      lastSync: { success: true, created_at: new Date(now - 7 * 60_000).toISOString() },
    })
    const wrapper = mount(DashboardTab)
    await flushPromises()

    const chips = wrapper.findAll('.status-chip').map((chip) => chip.text())
    expect(chips[0]).toBe('Mail server connected')
    expect(chips[1]).toBe('Domain sync · 7 minutes ago')
    expect(chips[2]).toBe('MX errors in 24 hours: 14')
    expect(wrapper.findAll('.status-chip-error')).toHaveLength(1)
    expect(wrapper.emitted('attention')).toEqual([[14]])
    expect(wrapper.findAll('.mx-table tbody tr')).toHaveLength(2)
  })

  it('stops claiming a connected mail server when a refresh fails', async () => {
    const wrapper = mount(DashboardTab)
    await flushPromises()
    expect(wrapper.findAll('.status-chip')[0]?.text()).toBe('Mail server connected')

    dashboard.mockRejectedValueOnce(new Error('JMAP unavailable'))
    await wrapper.get('.admin-section-heading button').trigger('click')
    await flushPromises()

    const first = wrapper.findAll('.status-chip')[0]
    expect(first?.text()).toBe('Mail server unreachable')
    expect(first?.classes()).toContain('status-chip-error')
    expect(wrapper.get('[role="alert"]').text()).toBe('JMAP unavailable')
  })

  it('shows a failed domain sync and a clean MX state', async () => {
    dashboard.mockResolvedValue({ ...response(), lastSync: { success: false, created_at: new Date().toISOString() } })
    const wrapper = mount(DashboardTab)
    await flushPromises()

    const chips = wrapper.findAll('.status-chip')
    expect(chips[1]?.text()).toBe('Domain sync failed')
    expect(chips[1]?.classes()).toContain('status-chip-error')
    expect(chips[2]?.text()).toBe('No MX errors in 24 hours')
    expect(wrapper.emitted('attention')).toEqual([[0]])
  })

  it('asks the shell to open the domains section', async () => {
    const wrapper = mount(DashboardTab)
    await flushPromises()

    await wrapper.get('.mx-failures-header button').trigger('click')
    expect(wrapper.emitted('open-domains')).toHaveLength(1)
  })
})
