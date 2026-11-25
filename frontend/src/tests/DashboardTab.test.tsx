// @vitest-environment jsdom

import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardTab from '../admin/DashboardTab'
import { renderWithTheme } from './renderWithTheme'
import type { DashboardResource } from '../types'

const dashboard = vi.hoisted(() => vi.fn())

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, admin: { ...actual.api.admin, dashboard } } }
})

const response = (recentMxFailures: DashboardResource['domains']['recentMxFailures'] = []): DashboardResource => ({
  messages: { stored: 41, today: 6, sevenDays: 29 },
  domains: { active: 2, domainsToday: 3, domainsSevenDays: 9, recentDomains: [], recentMxFailures, mxFailures24h: 0 },
  autoSyncDomains: true,
  lastSync: {},
  lastSuccessfulSync: {},
  lastSyncError: {},
})

describe('DashboardTab', () => {
  beforeEach(() => {
    dashboard.mockReset().mockResolvedValue(response())
  })

  afterEach(() => {
    cleanup()
  })

  it('renders domain metrics from the dashboard response', async () => {
    const { container } = renderWithTheme(<DashboardTab />)

    await waitFor(() => {
      expect(container.querySelector('[aria-labelledby="kpi-domain-title"]')).not.toBeNull()
    })

    const domains = container.querySelector('[aria-labelledby="kpi-domain-title"]')!
    expect(Array.from(domains.querySelectorAll('dt')).map((term) => term.textContent)).toEqual([
      'Active',
      'New today',
      'New in 7 days',
    ])
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('3')
    expect(container.textContent).toContain('9')
  })

  it('renders MX failures with translated kinds in DataGrid', async () => {
    dashboard.mockResolvedValue(
      response([
        { domain: 'mismatch.example', kind: 'mx_mismatch', detail: null, created_at: '2026-08-14T10:00:00Z' },
        { domain: 'lookup.example', kind: 'mx_lookup_error', detail: 'DNS timed out', created_at: '2026-08-14T09:00:00Z' },
      ]),
    )
    const { container } = renderWithTheme(<DashboardTab />)

    await waitFor(() => {
      expect(container.textContent).toContain('mismatch.example')
    })

    expect(container.querySelector('.MuiDataGrid-root')).not.toBeNull()
    expect(container.textContent).toContain('MX record mismatch')
    expect(container.textContent).toContain('lookup.example')
    expect(container.textContent).toContain('MX lookup error')
    expect(container.textContent).not.toContain('mx_mismatch')
    expect(container.textContent).not.toContain('mx_lookup_error')
  })

  it('renders the MX failure empty state', async () => {
    const { container } = renderWithTheme(<DashboardTab />)

    await waitFor(() => {
      expect(container.textContent).toContain('No recent MX failures.')
    })
  })

  it('keeps loading and error states working', async () => {
    let reject!: (cause: Error) => void
    dashboard.mockImplementationOnce(() => new Promise((_, onReject) => { reject = onReject }))
    const { container } = renderWithTheme(<DashboardTab />)

    await waitFor(() => {
      expect(container.querySelectorAll('.metric-skeleton')).toHaveLength(3)
    })

    reject(new Error('Dashboard unavailable'))

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toBe('Dashboard unavailable')
    })
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
    const onAttention = vi.fn()
    const { container } = renderWithTheme(<DashboardTab onAttention={onAttention} />)

    await waitFor(() => {
      expect(container.querySelectorAll('.status-chip')).toHaveLength(3)
    })

    const chips = Array.from(container.querySelectorAll('.status-chip')).map((chip) => chip.textContent?.trim())
    expect(chips[0]).toBe('Mail server connected')
    expect(chips[1]).toBe('Domain sync · 7 minutes ago')
    expect(chips[2]).toBe('MX errors in 24 hours: 14')
    expect(container.querySelectorAll('.status-chip-error')).toHaveLength(1)
    expect(onAttention).toHaveBeenCalledWith(14)
    expect(container.querySelectorAll('.MuiDataGrid-row')).toHaveLength(2)
  })

  it('stops claiming a connected mail server when a refresh fails', async () => {
    const { container } = renderWithTheme(<DashboardTab />)

    await waitFor(() => {
      expect(container.querySelectorAll('.status-chip')[0]?.textContent?.trim()).toBe('Mail server connected')
    })

    dashboard.mockRejectedValueOnce(new Error('JMAP unavailable'))
    const refreshButton = container.querySelector('.admin-section-heading button')!
    fireEvent.click(refreshButton)

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toBe('JMAP unavailable')
    })

    const first = container.querySelectorAll('.status-chip')[0]!
    expect(first.textContent?.trim()).toBe('Mail server unreachable')
    expect(first.classList.contains('status-chip-error')).toBe(true)
  })

  it('shows a failed domain sync and a clean MX state', async () => {
    dashboard.mockResolvedValue({ ...response(), lastSync: { success: false, created_at: new Date().toISOString() } })
    const onAttention = vi.fn()
    const { container } = renderWithTheme(<DashboardTab onAttention={onAttention} />)

    await waitFor(() => {
      expect(container.querySelectorAll('.status-chip')).toHaveLength(3)
    })

    const chips = Array.from(container.querySelectorAll('.status-chip'))
    expect(chips[1]?.textContent?.trim()).toBe('Domain sync failed')
    expect(chips[1]?.classList.contains('status-chip-error')).toBe(true)
    expect(chips[2]?.textContent?.trim()).toBe('No MX errors in 24 hours')
    expect(onAttention).toHaveBeenCalledWith(0)
  })

  it('asks the shell to open the domains section', async () => {
    const onOpenDomains = vi.fn()
    const { container } = renderWithTheme(<DashboardTab onOpenDomains={onOpenDomains} />)

    await waitFor(() => {
      expect(container.querySelector('.mx-failures-header button')).not.toBeNull()
    })

    fireEvent.click(container.querySelector('.mx-failures-header button')!)
    expect(onOpenDomains).toHaveBeenCalledTimes(1)
  })
})
