import type { AddressSession } from './types'

const ADDRESSES_KEY = 'tmail.addresses'
const ACTIVE_KEY = 'tmail.activeAddress'

const normalize = (address: string) => address.trim().toLowerCase()

function writeStorage(key: string, value?: string): void {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Browser storage is an optional convenience; the in-memory session still works.
  }
}

export function loadSessions(): AddressSession[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ADDRESSES_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is AddressSession =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as AddressSession).address === 'string' &&
        typeof (item as AddressSession).token === 'string' &&
        (item as AddressSession).accessKind !== 'admin',
    ).map(({ address, token }) => ({ address: normalize(address), token }))
  } catch {
    return []
  }
}

export function saveSession(session: AddressSession): AddressSession[] {
  if (session.accessKind === 'admin') return loadSessions()
  const normalized = { address: normalize(session.address), token: session.token }
  const sessions = [
    normalized,
    ...loadSessions().filter((item) => normalize(item.address) !== normalized.address),
  ]
  writeStorage(ADDRESSES_KEY, JSON.stringify(sessions))
  setActiveAddress(normalized.address)
  return sessions
}

export function removeSession(address: string): AddressSession[] {
  const normalized = normalize(address)
  const sessions = loadSessions().filter((item) => normalize(item.address) !== normalized)
  writeStorage(ADDRESSES_KEY, JSON.stringify(sessions))
  if (activeAddress() === normalized) setActiveAddress(sessions[0]?.address ?? '')
  return sessions
}

export function activeAddress(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setActiveAddress(address: string): void {
  const normalized = normalize(address)
  writeStorage(ACTIVE_KEY, normalized || undefined)
}
