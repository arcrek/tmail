function stripHtml(raw: string): string {
  return raw
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|h[1-6]|li|table|blockquote|header|footer|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function cleanNoise(raw: string): string {
  let s = raw
  // Strip URLs so query param numbers or paths aren't matched
  s = s.replace(/https?:\/\/[^\s<>'"]+/gi, ' ')
  // Strip email addresses
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, ' ')
  // Strip phone numbers with country codes or separators (e.g. +1.888.799.9666, (888) 799-9666, +84 901 234 567)
  s = s.replace(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/gi, ' ')
  s = s.replace(/\+\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/gi, ' ')
  // Strip dates (e.g. 08/29/2026, 2026-08-29, 29.08.2026)
  s = s.replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/gi, ' ')
  // Strip times (e.g. 10:08:05 AM, 10:08 AM, 23:59:59)
  s = s.replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\b/gi, ' ')
  // Strip US / standard zip codes with state (e.g. CA 95113, NY 10001)
  s = s.replace(/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g, ' ')
  // Strip copyright years (e.g. ©2026, &copy; 2026, (c) 2026)
  s = s.replace(/(?:©|&copy;|\(c\))\s*\d{4}\b/gi, ' ')
  return s
}

const OTP_KEYWORD_FORWARD = /(?:code|passcode|pin|otp|verification|verify|security|confirmation|authentication|mã|xác minh|xác thực|código|kod|code below|enter this code)[^a-zA-Z0-9\n]{1,30}?((?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9]))/i
const OTP_KEYWORD_REVERSE = /((?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9]))[^a-zA-Z0-9\n]{1,30}?(?:is your|là mã|to sign in|to verify|to confirm|for your)/i
const OTP_CANDIDATES = /(?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9])/g

function findInCleanText(source: string): string {
  const cleaned = cleanNoise(source)

  // 1. Priority match: verification keyword nearby
  const forwardMatch = cleaned.match(OTP_KEYWORD_FORWARD)
  if (forwardMatch?.[1]) {
    const digits = forwardMatch[1].replace(/\D/g, '')
    if (digits.length >= 4 && digits.length <= 8) {
      return forwardMatch[1].trim()
    }
  }

  // 2. Reverse keyword match (e.g. "123456 is your verification code")
  const reverseMatch = cleaned.match(OTP_KEYWORD_REVERSE)
  if (reverseMatch?.[1]) {
    const digits = reverseMatch[1].replace(/\D/g, '')
    if (digits.length >= 4 && digits.length <= 8) {
      return reverseMatch[1].trim()
    }
  }

  // 3. Fallback: scan candidate numbers
  const candidates = cleaned.match(OTP_CANDIDATES)
  for (const candidate of candidates ?? []) {
    const digits = candidate.replace(/\D/g, '')
    // Discard standalone 4-digit years (19xx, 20xx) when not linked to an OTP keyword
    if (digits.length === 4 && (digits.startsWith('19') || digits.startsWith('20'))) {
      continue
    }
    if (digits.length >= 4 && digits.length <= 8) {
      return candidate.trim()
    }
  }
  return ''
}

export function extractVerificationCode(subject: string = '', text: string = '', html: string[] = []): string {
  // Check subject first
  const subjectCode = findInCleanText(subject)
  if (subjectCode) return subjectCode

  // Check HTML text
  if (html && html.length > 0) {
    const htmlText = stripHtml(html.join('\n'))
    const htmlCode = findInCleanText(htmlText)
    if (htmlCode) return htmlCode
  }

  // Check plain text body
  if (text) {
    const plainText = /<[a-z][\s\S]*>/i.test(text) ? stripHtml(text) : text
    const textCode = findInCleanText(plainText)
    if (textCode) return textCode
  }

  return ''
}
