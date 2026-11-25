// @vitest-environment jsdom

import { StrictMode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { BulkGenerateView } from '../components/BulkGenerateView'
import { initLocale } from '../i18n'
import { createTMailTheme } from '../muiTheme'
import { getToasts, toastActions } from '../toast'
import { renderWithTheme } from './renderWithTheme'

const mocks = vi.hoisted(() => ({
  domains: vi.fn(),
  copyText: vi.fn(),
  downloadCsv: vi.fn(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return { ...actual, api: { ...actual.api, domains: mocks.domains } }
})

vi.mock('../clipboard', () => ({ copyText: mocks.copyText }))
vi.mock('../csv', () => ({ downloadCsv: mocks.downloadCsv }))

const domains = (values: string[]) => ({
  '@context': '/contexts/Domain',
  '@id': '/domains',
  '@type': 'hydra:Collection',
  'hydra:totalItems': values.length,
  'hydra:member': values.map((domain, index) => ({ id: String(index), domain, isActive: true })),
})

async function flushPromises() {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
    }
  })
}

function stubCryptoSequence() {
  let value = 0
  vi.stubGlobal('crypto', {
    getRandomValues: (values: Uint32Array) => {
      values.fill(value++)
      return values
    },
  })
}

describe('BulkGenerateView', () => {
  beforeEach(() => {
    for (const toast of [...getToasts()]) toastActions.dismiss(toast.id)
    initLocale()
    mocks.domains.mockReset().mockResolvedValue(domains(['example.com']))
    mocks.copyText.mockReset().mockResolvedValue(undefined)
    mocks.downloadCsv.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses the compact page header and its own panel instead of the home hero styles', async () => {
    const { container } = renderWithTheme(<BulkGenerateView />)
    await flushPromises()

    expect(container.querySelector('.home-hero')).toBeNull()
    expect(container.querySelector('.saved-inboxes')).toBeNull()
    expect(container.querySelector('#bulk-title')?.textContent).toBe('Generate multiple addresses')
    expect(container.querySelector('.bulk-panel .bulk-controls')).not.toBeNull()
  })

  it('renders loading, empty domain, and error states with retry', async () => {
    let resolveDomains!: (value: ReturnType<typeof domains>) => void
    mocks.domains.mockImplementationOnce(() => new Promise((resolve) => { resolveDomains = resolve }))

    const { container, unmount } = renderWithTheme(<BulkGenerateView />)
    expect(container.textContent).toContain('Loading receiving domains')

    resolveDomains(domains([]))
    await flushPromises()
    expect(container.textContent).toContain('No receiving domains are available')
    unmount()

    mocks.domains.mockRejectedValueOnce(new ApiError(502, 'Domain list unavailable'))
    const errorView = renderWithTheme(<BulkGenerateView />)
    await flushPromises()
    expect(errorView.getByRole('alert').textContent).toContain('Domain list unavailable')

    mocks.domains.mockResolvedValueOnce(domains(['example.com']))
    fireEvent.click(errorView.getByRole('button', { name: 'Retry' }))
    await flushPromises()
    expect(errorView.container.querySelector('#bulk-count')).not.toBeNull()
  })

  it('generates the requested rows in DataGrid and supports opening and copying an address', async () => {
    stubCryptoSequence()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = renderWithTheme(<BulkGenerateView />)
    await flushPromises()

    const countInput = container.querySelector('#bulk-count') as HTMLInputElement
    fireEvent.change(countInput, { target: { value: '3' } })
    fireEvent.submit(container.querySelector('.bulk-controls')!)

    const addressNodes = container.querySelectorAll('.saved-address')
    expect(addressNodes).toHaveLength(3)
    const firstAddress = addressNodes[0]!.textContent!

    const openButtons = screen.getAllByRole('button', { name: 'Open in new tab' })
    fireEvent.click(openButtons[0]!)
    expect(open).toHaveBeenCalledWith(`/${encodeURIComponent(firstAddress)}`, '_blank', 'noopener')

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' })
    fireEvent.click(copyButtons[0]!)
    await flushPromises()
    expect(mocks.copyText).toHaveBeenCalledWith(firstAddress)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined()
  })

  it('copies all generated addresses and exports them as CSV', async () => {
    stubCryptoSequence()
    const { container } = renderWithTheme(<BulkGenerateView />)
    await flushPromises()

    const countInput = container.querySelector('#bulk-count') as HTMLInputElement
    fireEvent.change(countInput, { target: { value: '2' } })
    fireEvent.submit(container.querySelector('.bulk-controls')!)

    const addresses = [...container.querySelectorAll('.saved-address')].map((node) => node.textContent!)
    expect(addresses).toHaveLength(2)

    const copyAllBtn = container.querySelector('.bulk-copy-all') as HTMLButtonElement
    expect(copyAllBtn).not.toBeNull()
    fireEvent.click(copyAllBtn)
    await flushPromises()
    expect(mocks.copyText).toHaveBeenCalledWith(addresses.join('\n'))

    const exportBtn = container.querySelector('.bulk-export-csv') as HTMLButtonElement
    expect(exportBtn).not.toBeNull()
    expect(exportBtn.textContent).toContain('Export CSV')
    fireEvent.click(exportBtn)
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'tmail-addresses.csv',
      `address\n"${addresses[0]}"\n"${addresses[1]}"\n`,
    )
  })

  it('shows an error toast when copying fails', async () => {
    stubCryptoSequence()
    mocks.copyText.mockRejectedValueOnce(new Error('Clipboard blocked'))
    const { container } = renderWithTheme(<BulkGenerateView />)
    await flushPromises()

    fireEvent.change(container.querySelector('#bulk-count') as HTMLInputElement, { target: { value: '1' } })
    fireEvent.submit(container.querySelector('.bulk-controls')!)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await flushPromises()
    expect(getToasts().some((item) => item.kind === 'error')).toBe(true)
  })

  it('shows a partial-count status notice when fewer unique addresses are generated', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.fill(0)
        return values
      },
    })
    const { container } = renderWithTheme(<BulkGenerateView />)
    await flushPromises()

    fireEvent.change(container.querySelector('#bulk-count') as HTMLInputElement, { target: { value: '5' } })
    fireEvent.submit(container.querySelector('.bulk-controls')!)

    expect(screen.getByRole('status').textContent).toContain('Only 1 unique addresses could be generated.')
  })

  it('clears a generated batch when the access token changes and works under StrictMode', async () => {
    stubCryptoSequence()
    const { container, rerender } = renderWithTheme(
      <StrictMode>
        <BulkGenerateView accessToken="access-token" />
      </StrictMode>,
    )
    await flushPromises()

    fireEvent.submit(container.querySelector('.bulk-controls')!)
    expect(container.querySelectorAll('.saved-address').length).toBeGreaterThan(0)

    mocks.domains.mockResolvedValueOnce(domains(['example.com']))
    rerender(
      <ThemeProvider theme={createTMailTheme('light')}>
        <CssBaseline />
        <StrictMode>
          <BulkGenerateView accessToken="" />
        </StrictMode>
      </ThemeProvider>,
    )
    await flushPromises()

    expect(mocks.domains).toHaveBeenLastCalledWith(1, undefined)
    expect(container.querySelectorAll('.saved-address')).toHaveLength(0)
    expect(container.textContent).toContain('Generate a batch to see addresses here.')
  })
})
