const CONSONANTS = 'bcdfghjkmnprstvwxz'
const VOWELS = 'aeiou'

export function randomLocalPart(): string {
  const values = crypto.getRandomValues(new Uint32Array(6))
  return Array.from(values, (value, index) => {
    const alphabet = index % 2 ? VOWELS : CONSONANTS
    return alphabet[value % alphabet.length]!
  }).join('')
}

export function randomDomain(domains: string[]): string {
  const [value] = crypto.getRandomValues(new Uint32Array(6))
  return domains[value! % domains.length]!
}

/** Generates up to `count` unique `local@domain` addresses, one random domain per address. */
export function randomAddressBatch(domains: string[], count: number): string[] {
  const seen = new Set<string>()
  const maxAttempts = count * 20
  for (let attempts = 0; seen.size < count && attempts < maxAttempts; attempts += 1) {
    seen.add(`${randomLocalPart()}@${randomDomain(domains)}`)
  }
  return [...seen]
}
