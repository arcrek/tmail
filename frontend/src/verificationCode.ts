export function extractVerificationCode(subject: string, text: string, html: string[]): string {
  const find = (value: string) => {
    const candidates = value.match(/(?<![0-9])(?:[0-9]{3,4}[\s-][0-9]{3,4}|[0-9]{4,8})(?![0-9])/g)
    for (const candidate of candidates ?? []) {
      const digits = candidate.replace(/\D/g, '')
      if (digits.length >= 4 && digits.length <= 8) return candidate
    }
    return ''
  }
  return find(subject) || find(text) || find(new DOMParser().parseFromString(html.join('\n'), 'text/html').body.textContent ?? '')
}
