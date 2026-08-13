import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../api'

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts an address for a passwordless token', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'account-id', token: 'signed' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    await expect(api.token('box@example.com')).resolves.toEqual({ id: 'account-id', token: 'signed' })
    expect(fetch).toHaveBeenCalledWith('/token', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ address: 'box@example.com' }),
    }))
  })

  it('sends mailbox and admin security headers', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } }),
    ))
    vi.stubGlobal('fetch', fetch)

    await api.messages('mail-token')
    await api.admin.syncDomains('csrf-token')
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer mail-token' })
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token' })
  })

  it('uses elevated access tokens for unlock, access-protected routes, and lock', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'access-token', expiresAt: '2026-09-12T00:00:00Z' }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    await api.unlock('credential')
    await api.domains(1, 'access-token')
    await api.account('box@example.com', 'access-token')
    await api.token('box@example.com', 'access-token')
    await api.lock('access-token')

    expect(fetch.mock.calls[0]?.[0]).toBe('/unlock')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ credential: 'credential' }) })
    for (const [, options] of fetch.mock.calls.slice(1)) {
      expect(options.headers).toMatchObject({ Authorization: 'Bearer access-token' })
    }
    expect(fetch.mock.calls[4]?.[0]).toBe('/lock')
    expect(fetch.mock.calls[4]?.[1]).toMatchObject({ method: 'DELETE' })
  })

  it('turns Hydra responses into useful errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        '@context': '/contexts/Error',
        '@type': 'hydra:Error',
        'hydra:title': 'Validation error',
        'hydra:description': 'Domain is not active',
      }), { status: 422, headers: { 'Content-Type': 'application/json' } }),
    ))

    await expect(api.token('box@example.com')).rejects.toEqual(
      expect.objectContaining<ApiError>({ status: 422, message: 'Domain is not active' }),
    )
  })
})
