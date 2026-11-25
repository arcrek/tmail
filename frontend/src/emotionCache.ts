import createCache from '@emotion/cache'

export function getCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const raw = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content?.trim()
  if (!raw || raw === '__CSP_NONCE__') return undefined
  return raw
}

export function createMuiCache() {
  const nonce = getCspNonce()
  return createCache({
    key: 'mui',
    prepend: true,
    ...(nonce ? { nonce } : {}),
  })
}
