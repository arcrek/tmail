import { describe, expect, it } from 'vitest'
import { generateQrMatrix } from '../qrcode'

describe('qrcode', () => {
  it('generates a 25x25 boolean matrix with finder patterns', () => {
    const matrix = generateQrMatrix('test@example.com')
    expect(matrix).toHaveLength(25)
    expect(matrix[0]).toHaveLength(25)

    // Top-left finder pattern center should be dark (true)
    expect(matrix[3][3]).toBe(true)
    // Top-right finder pattern center
    expect(matrix[3][21]).toBe(true)
    // Bottom-left finder pattern center
    expect(matrix[21][3]).toBe(true)
  })

  it('produces deterministic output for the same input string', () => {
    const m1 = generateQrMatrix('hello@domain.com')
    const m2 = generateQrMatrix('hello@domain.com')
    expect(m1).toEqual(m2)
  })

  it('produces distinct matrices for different input strings', () => {
    const m1 = generateQrMatrix('a@example.com')
    const m2 = generateQrMatrix('b@example.com')
    expect(m1).not.toEqual(m2)
  })
})
