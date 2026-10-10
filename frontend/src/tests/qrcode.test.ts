import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { generateQrMatrix } from '../qrcode'

function decode(matrix: boolean[][]): string | undefined {
  const scale = 4
  const width = (matrix.length + 8) * scale
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      if (!matrix[Math.floor(y / scale) - 4]?.[Math.floor(x / scale) - 4]) continue
      const offset = (y * width + x) * 4
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0
    }
  }
  return jsQR(pixels, width, width)?.data
}

// A DNS domain-length encoder boundary, not a claim about SMTP mailbox length.
const longDomain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.')

describe('qrcode', () => {
  it.each([
    'test@example.com',
    `${'a'.repeat(64)}@example.com`,
    `box@${longDomain}`,
    'hộp@example.com',
    'a'.repeat(14), 'a'.repeat(15), // M-level byte-mode version 1/2 boundary.
    'a'.repeat(2331), // M-level version 40 byte capacity.
  ])('independently decodes exact payload (%#. fixture)', (payload) => {
    const matrix = generateQrMatrix(payload)
    expect(matrix.length).toBeGreaterThanOrEqual(21)
    expect(matrix.every((row) => row.length === matrix.length && row.every((cell) => typeof cell === 'boolean'))).toBe(true)
    expect(decode(matrix)).toBe(payload)
  })

  it('selects versions by UTF-8 byte capacity and rejects overflow', () => {
    expect(generateQrMatrix('a'.repeat(14))).toHaveLength(21)
    expect(generateQrMatrix('a'.repeat(15))).toHaveLength(25)
    expect(generateQrMatrix('é'.repeat(7))).toHaveLength(21)
    expect(generateQrMatrix('é'.repeat(8))).toHaveLength(25)
    expect(generateQrMatrix('a'.repeat(2331))).toHaveLength(177)
    expect(() => generateQrMatrix('a'.repeat(2332))).toThrow(/too big/)
    expect(() => generateQrMatrix('')).toThrow()
  })

  it('does not accept a deliberately corrupted symbol as the original payload', () => {
    const payload = 'test@example.com'
    const corrupted = generateQrMatrix(payload).map((row, y) => row.map((cell, x) =>
      x >= 8 && y >= 8 ? false : cell,
    ))
    expect(decode(corrupted)).not.toBe(payload)
  })

  it('keeps finder patterns, deterministic output and distinct payloads', () => {
    const matrix = generateQrMatrix('hello@domain.com')
    expect(matrix[3][3]).toBe(true)
    expect(matrix[3][matrix.length - 4]).toBe(true)
    expect(matrix[matrix.length - 4][3]).toBe(true)
    expect(generateQrMatrix('hello@domain.com')).toEqual(matrix)
    expect(generateQrMatrix('a@example.com')).not.toEqual(generateQrMatrix('b@example.com'))
  })
})
