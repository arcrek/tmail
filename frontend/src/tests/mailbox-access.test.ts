// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, api } from '../api'
import { openMailbox } from '../mailbox-access'
import { loadSessions, saveSession } from '../session'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(api.admin, 'session').mockRejectedValue(new ApiError(401, 'No admin'))
})
afterEach(() => vi.restoreAllMocks())

it('validates a saved bearer before reuse without renewing password protection', async () => {
  saveSession({ address: 'box@example.com', token: 'visitor' })
  const me = vi.spyOn(api, 'me').mockResolvedValue({ address: 'box@example.com', accessKind: 'visitor', protected: true } as Awaited<ReturnType<typeof api.me>>)
  const token = vi.spyOn(api, 'token')
  expect(await openMailbox('box@example.com')).toMatchObject({ token: 'visitor', protected: true })
  expect(me).toHaveBeenCalledWith('visitor')
  expect(token).not.toHaveBeenCalled()
})

it('removes stale saved sessions and attempts public entry exactly once', async () => {
  saveSession({ address: 'box@example.com', token: 'stale' })
  vi.spyOn(api, 'me').mockRejectedValue(new ApiError(401, 'Revoked'))
  const token = vi.spyOn(api, 'token').mockRejectedValue(new ApiError(401, 'Password required'))
  await expect(openMailbox('box@example.com')).rejects.toMatchObject({ status: 401 })
  expect(loadSessions()).toEqual([])
  expect(token).toHaveBeenCalledOnce()
})

it('prefers the existing admin cookie and never saves the exchange bearer', async () => {
  vi.mocked(api.admin.session).mockResolvedValue({ csrfToken: 'csrf' })
  const exchange = vi.spyOn(api.admin, 'mailboxToken').mockResolvedValue({ id: 'id', token: 'admin', accessKind: 'admin', protected: true })
  const session = await openMailbox('box@example.com')
  saveSession(session)
  expect(exchange).toHaveBeenCalledWith('box@example.com', 'csrf')
  expect(session).toMatchObject({ accessKind: 'admin', csrf: 'csrf' })
  expect(loadSessions()).toEqual([])
})

it('does not erase a newer token written by another tab during stale validation', async () => {
  saveSession({ address: 'box@example.com', token: 'stale' })
  vi.spyOn(api, 'me').mockImplementation(async () => {
    saveSession({ address: 'box@example.com', token: 'newer' })
    throw new ApiError(401, 'Revoked')
  })
  vi.spyOn(api, 'token').mockRejectedValue(new ApiError(401, 'Password required'))
  await expect(openMailbox('box@example.com')).rejects.toMatchObject({ status: 401 })
  expect(loadSessions()[0]?.token).toBe('newer')
})

it('keeps a saved session on a temporary server outage', async () => {
  saveSession({ address: 'box@example.com', token: 'visitor' })
  vi.spyOn(api, 'me').mockRejectedValue(new ApiError(503, 'Unavailable'))
  const token = vi.spyOn(api, 'token')
  await expect(openMailbox('box@example.com')).rejects.toMatchObject({ status: 503 })
  expect(loadSessions()[0]?.token).toBe('visitor')
  expect(token).not.toHaveBeenCalled()
})
