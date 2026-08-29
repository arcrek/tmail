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

  it('extracts code from HTML with embedded style and font urls without matching CSS numbers', () => {
    const html = [
      '<!DOCTYPE html><html><head><style>@font-face { src: url(https://fonts.gstatic.com/s/lato/v13/dPJ5r9gl3kK6ijoeP1IRsvY6323mHUZFJMgTvxaG2iE.woff2); unicode-range: U+0100-024F; } .code-div { color: #333333; font-size: 32px; }</style></head>' +
      '<body><div class="content">Enter this code in the next 10 minutes to sign up:</div><div class="code-div">944967</div><div class="footer">+1.888.799.9666 ©2026 Zoom 55 Almaden Blvd San Jose, CA 95113</div></body></html>'
    ]
    expect(extractVerificationCode('Code for signing in to Zoom', html[0], html)).toBe('944967')
  })

  it('extracts code when subject has code prefix and body has raw HTML', () => {
    expect(extractVerificationCode('243968 is your Zoom verification code', '<style>.code{font-size:14px;}</style><div>Hi</div>', [])).toBe('243968')
  })

  it('does not extract false positive codes from security alert emails without OTP', () => {
    const alertHtml = [
      '<!DOCTYPE html><html><head><style>.text{color:#323539;}</style></head><body>' +
      '<div>We noticed a new sign-in to your Zoom account.</div>' +
      '<div>Time: 08/29/2026 10:08 AM</div>' +
      '<div>Location: Ho Chi Minh City, Vietnam</div>' +
      '<div>Device: Android 16</div>' +
      '<div>+1.888.799.9666 ©2026 Zoom 55 Almaden Blvd San Jose, CA 95113</div>' +
      '</body></html>'
    ]
    expect(extractVerificationCode('New Zoom Sign-in Detected', alertHtml[0], alertHtml)).toBe('')
  })

  it('extracts OTP code with Vietnamese keywords', () => {
    expect(extractVerificationCode('Mã xác thực tài khoản', 'Mã xác thực của bạn là 681920. Mã có hiệu lực trong 5 phút.', [])).toBe('681920')
  })
})
