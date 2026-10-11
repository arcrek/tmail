import { ApiError, api } from './api'
import { loadSessions, removeSession } from './session'
import type { AddressSession, TokenResponse } from './types'

export const authorizationFailed = (cause: unknown): cause is ApiError =>
  cause instanceof ApiError && (cause.status === 401 || cause.status === 403)

export const validPassword = (password: string): boolean => {
  const length = [...password].length
  return length >= 12 && length <= 128
}

export function mailboxSession(address: string, response: TokenResponse): AddressSession {
  const { token, protected: protectedMailbox, protectedUntil, accessKind, sessionExpiresAt } = response
  return { address, token, protected: protectedMailbox, protectedUntil, accessKind, sessionExpiresAt }
}

export async function openMailbox(address: string, accessToken?: string, password?: string): Promise<AddressSession> {
  try {
    const { csrfToken } = await api.admin.session()
    const response = await api.admin.mailboxToken(address, csrfToken)
    return { ...mailboxSession(address, response), accessKind: 'admin', csrf: csrfToken }
  } catch (cause) {
    if (!authorizationFailed(cause)) throw cause
  }
  if (password === undefined) {
    const saved = loadSessions().find((session) => session.address === address)
    if (saved) {
      try {
        const account = await api.me(saved.token)
        if (account.address !== address || account.accessKind === 'admin') throw new ApiError(401, 'Invalid mailbox session')
        return { ...saved, protected: account.protected, protectedUntil: account.protectedUntil,
          accessKind: account.accessKind, sessionExpiresAt: account.sessionExpiresAt }
      } catch (cause) {
        if (!authorizationFailed(cause)) throw cause
        if (loadSessions().find((session) => session.address === address)?.token === saved.token) removeSession(address)
      }
    }
  }
  const response = password === undefined
    ? await api.token(address, accessToken)
    : await api.token(address, accessToken, password)
  return mailboxSession(address, response)
}
