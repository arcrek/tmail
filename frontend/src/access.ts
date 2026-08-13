const ACCESS_TOKEN_KEY = 'tmail.accessToken'

function writeStorage(value?: string): void {
  try {
    if (value === undefined) localStorage.removeItem(ACCESS_TOKEN_KEY)
    else localStorage.setItem(ACCESS_TOKEN_KEY, value)
  } catch {
    // Browser storage is an optional convenience; unlocked access still works for this page.
  }
}

export function loadAccessToken(): string {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveAccessToken(token: string): void { writeStorage(token) }

export function clearAccessToken(): void { writeStorage() }
