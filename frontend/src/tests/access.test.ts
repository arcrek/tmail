// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, loadAccessToken, saveAccessToken } from '../access'

describe('access token storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips and clears the access token', () => {
    expect(loadAccessToken()).toBe('')
    saveAccessToken('access-token')
    expect(loadAccessToken()).toBe('access-token')
    clearAccessToken()
    expect(loadAccessToken()).toBe('')
  })

  it('degrades gracefully when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Storage denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Storage denied', 'SecurityError') })

    expect(loadAccessToken()).toBe('')
    expect(() => saveAccessToken('access-token')).not.toThrow()
    expect(() => clearAccessToken()).not.toThrow()
  })
})
