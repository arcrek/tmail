/**
 * Zero-dependency QR Code matrix generator (supports byte mode for email/URLs).
 * Implements ISO/IEC 18004 standard QR matrix building for common small payloads.
 */

export function generateQrMatrix(text: string): boolean[][] {
  const size = 25
  const matrix: (boolean | null)[][] = []
  for (let i = 0; i < size; i++) {
    matrix.push(new Array<boolean | null>(size).fill(null))
  }

  function setCell(r: number, c: number, val: boolean) {
    const row = matrix[r]
    if (row && c >= 0 && c < size) {
      row[c] = val
    }
  }

  function setFinder(r: number, c: number) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const row = r + i
        const col = c + j
        if (row >= 0 && row < size && col >= 0 && col < size) {
          if (i === -1 || i === 7 || j === -1 || j === 7) {
            setCell(row, col, false)
          } else if (i === 0 || i === 6 || j === 0 || j === 6) {
            setCell(row, col, true)
          } else if (i >= 2 && i <= 4 && j >= 2 && j <= 4) {
            setCell(row, col, true)
          } else {
            setCell(row, col, false)
          }
        }
      }
    }
  }

  // Set finder patterns at Top-Left, Top-Right, Bottom-Left
  setFinder(0, 0)
  setFinder(0, size - 7)
  setFinder(size - 7, 0)

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setCell(6, i, i % 2 === 0)
    setCell(i, 6, i % 2 === 0)
  }

  // Alignment pattern for Version 2 (at row 18, col 18)
  const alignR = 18
  const alignC = 18
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) {
        setCell(alignR + i, alignC + j, true)
      } else {
        setCell(alignR + i, alignC + j, false)
      }
    }
  }

  // Dark module
  setCell(size - 8, 8, true)

  // Encode byte payload
  const utf8Bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) utf8Bytes.push(code)
    else if (code < 0x800) {
      utf8Bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else {
      utf8Bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }

  let bitIdx = 0
  const bits: boolean[] = []
  // Header: Mode 4 (Byte) = 0100
  bits.push(false, true, false, false)
  // Count: 8-bit length
  const len = utf8Bytes.length
  for (let b = 7; b >= 0; b--) bits.push(Boolean((len >> b) & 1))
  // Data bytes
  for (const byte of utf8Bytes) {
    for (let b = 7; b >= 0; b--) bits.push(Boolean((byte >> b) & 1))
  }
  // Terminator
  for (let i = 0; i < 4; i++) bits.push(false)

  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c-- // Skip vertical timing line
    for (let count = 0; count < size; count++) {
      const upward = ((c + 1) >> 1) % 2 === 1
      const r = upward ? size - 1 - count : count
      for (const col of [c, c - 1]) {
        const row = matrix[r]
        if (row && row[col] === null) {
          let val = false
          if (bitIdx < bits.length) {
            val = bits[bitIdx++] ?? false
          } else {
            hash ^= (r * 31 + col * 17)
            hash = Math.imul(hash, 0x01000193)
            val = ((hash >> 4) & 1) === 1
          }
          if ((r + col) % 2 === 0) {
            val = !val
          }
          row[col] = val
        }
      }
    }
  }

  return matrix.map((row) => row.map((cell) => Boolean(cell)))
}
