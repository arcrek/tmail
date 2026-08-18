// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { extractVerificationCode } from '../verificationCode'

describe('extractVerificationCode', () => {
  it('finds a code in the subject', () => {
    expect(extractVerificationCode('Your code is 123456', '', [])).toBe('123456')
  })

  it('finds a code in plain text', () => {
    expect(extractVerificationCode('Welcome', 'Use 654321 to continue.', [])).toBe('654321')
  })

  it('finds a code in HTML text', () => {
    expect(extractVerificationCode('Welcome', '', ['<p>Enter <strong>987654</strong></p>'])).toBe('987654')
  })

  it('returns an empty string when no code matches', () => {
    expect(extractVerificationCode('Reference 12-34', 'Long 123456789 only', [])).toBe('')
  })

  it('prefers the subject over text and HTML', () => {
    expect(extractVerificationCode('Code 859-133', 'Use 654321', ['<p>987654</p>'])).toBe('859-133')
  })
})
