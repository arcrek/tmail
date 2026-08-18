import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomAddressBatch, randomDomain } from '../randomAddress'

describe('randomAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates the requested number of unique addresses', () => {
    let value = 0
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.fill(value++)
        return values
      },
    })

    const addresses = randomAddressBatch(['example.com'], 3)

    expect(addresses).toHaveLength(3)
    expect(new Set(addresses).size).toBe(3)
  })

  it('respects the requested count', () => {
    let value = 0
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.fill(value++)
        return values
      },
    })

    expect(randomAddressBatch(['example.com'], 5)).toHaveLength(5)
  })

  it('only selects domains from the provided list', () => {
    const domains = ['one.example', 'two.example']
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values.fill(1)
        return values
      },
    })

    expect(randomDomain(domains)).toBe('two.example')
  })
})
