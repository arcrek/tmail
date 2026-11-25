// Guard against Node 25+ experimental webstorage globals shadowing jsdom's Storage,
// localStorage, and sessionStorage when vitest workers run without --no-experimental-webstorage.
function syncGlobal(key: 'Storage' | 'localStorage' | 'sessionStorage', target: unknown): void {
  if (!target) return
  try {
    if ((globalThis as Record<string, unknown>)[key] === target) return
  } catch {
    // Accessing a throwing Node webstorage getter; overwrite it below.
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: target,
  })
}

if (typeof window !== 'undefined') {
  syncGlobal('Storage', window.Storage)
  syncGlobal('localStorage', window.localStorage)
  syncGlobal('sessionStorage', window.sessionStorage)
}
