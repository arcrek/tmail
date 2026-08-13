# Phase 3: Frontend unlock experience

## Context Links

- Plan: [plan.md](./plan.md)
- Depends on: [Phase 1](./phase-01-backend-elevated-access.md) (`/unlock`, `/lock`, elevated `/domains`)
- `frontend/src/session.ts` — localStorage pattern to mirror
- `frontend/src/api.ts` — `request()`, existing `token` option (`Authorization: Bearer`)
- `frontend/src/components/AddressPanel.vue` — where the unlock control surfaces
- `frontend/src/i18n.ts` — `en`/`vi` string tables

## Overview

- Priority: P1
- Status: Complete
- Let a visitor enter a password or token to unlock the full domain list and use it for address creation, persisted across visits like existing saved sessions.

## Key Insights

- `request()` in `api.ts` already turns an `options.token` into `Authorization: Bearer <token>` — the elevated access token can reuse this exact mechanism on `domains()`, `account()`, and `token()` calls; no changes to `request()` itself are needed.
- `AddressPanel.vue`'s `loadDomains()` already refetches on demand (`onMounted` + manual retry button) — unlocking should just call the same `loadDomains()` again with the new token in scope.
- `session.ts`'s `writeStorage` helper (try/catch around `localStorage`) is the right pattern to copy for `access.ts` — don't assume `localStorage` is available.

## Requirements

### Functional

- New `frontend/src/access.ts`: `loadAccessToken(): string`, `saveAccessToken(token: string): void`, `clearAccessToken(): void` using a `tmail.accessToken` localStorage key (plain string, not JSON — no metadata needed beyond the token itself).
- `api.ts` additions:
  - `api.unlock(credential: string) => request<{accessToken: string; expiresAt: string}>('/unlock', {method: 'POST', ...json({credential})})`
  - `api.lock(accessToken: string) => request<void>('/lock', {method: 'DELETE', token: accessToken})`
  - `domains(page, accessToken?)`, `account(address, accessToken?)`, `token(address, accessToken?)` gain an optional trailing `accessToken` param, passed as `options.token` when present.
- `types.ts`: add `UnlockResponse { accessToken: string; expiresAt: string }` (or inline in `api.ts` if simpler — match existing type-location conventions).
- `AddressPanel.vue`:
  - Read `loadAccessToken()` on mount into a `ref`; if present, pass it to the initial `loadDomains()` call.
  - Add a collapsed-by-default "Unlock full access" affordance (link/button) that reveals a single text input + submit; on submit, call `api.unlock(value)`, `saveAccessToken(response.accessToken)`, store in the local ref, re-run `loadDomains()`, collapse the form, show an "Unlocked" indicator with a "Lock" action.
  - "Lock" action: `api.lock(token)` (best-effort — proceed with local cleanup even if the network call fails), `clearAccessToken()`, clear the local ref, re-run `loadDomains()` (reverts to the filtered list).
  - Thread the access token ref into `submit()` and `randomize()`'s `api.token(address, accessToken)` calls so blacklisted-domain address creation succeeds while unlocked.
- `i18n.ts`: add English + Vietnamese strings for the unlock link, input label/placeholder, submit/cancel, unlocked-state badge, lock action, and error messages (invalid credential, network failure) under a new `unlock.*` key namespace in both `en` and `vi` objects.

### Non-functional

- No visual change when never unlocked — the control must be unobtrusive (matches the existing minimal `AddressPanel.vue` chrome; a text-button-style link like `address.random`, not a prominent CTA).
- Follow existing accessibility patterns in `AddressPanel.vue` (labeled inputs, `aria-live` for status/errors, matching `form-error` class for failures).

## Architecture

```
AddressPanel.vue
  onMounted → accessToken = loadAccessToken() → loadDomains(accessToken)
  unlock form submit → api.unlock(value) → saveAccessToken() → loadDomains(accessToken) [now full list]
  lock click → api.lock(accessToken) → clearAccessToken() → loadDomains() [filtered list again]
  submit()/randomize() → api.token(address, accessToken) → succeeds even for blacklisted domains
```

## Related Code Files

- Create `frontend/src/access.ts`
- Modify `frontend/src/api.ts` — add `unlock`, `lock`, extend `domains`/`account`/`token` signatures
- Modify `frontend/src/types.ts` — add unlock response type if not inlined
- Modify `frontend/src/components/AddressPanel.vue` — unlock UI + wiring
- Modify `frontend/src/i18n.ts` — `en`/`vi` `unlock.*` strings

## Implementation Steps

1. Create `frontend/src/access.ts` mirroring `session.ts`'s `writeStorage` try/catch pattern; export `loadAccessToken`, `saveAccessToken`, `clearAccessToken`.
2. In `api.ts`, add `unlock` and `lock` to the exported `api` object; update `domains`, `account` (rename param usage carefully — check call sites), `token` to accept an optional `accessToken` and pass `{ token: accessToken }` into `request()` when set.
3. In `types.ts`, add the unlock response type (or skip if `api.ts` inlines it locally — match whatever the file already does for one-off response shapes like `{ csrfToken: string }` in `admin.login`).
4. In `AddressPanel.vue`: add `accessToken = ref(loadAccessToken())`, `unlocking = ref(false)`, `unlockValue = ref('')`, `unlockOpen = ref(false)`, `unlockError = ref('')`.
5. Update `loadDomains()` to call `api.domains(1, accessToken.value || undefined)`.
6. Add `async function unlock()`: call `api.unlock(unlockValue.value)`, on success `saveAccessToken(response.accessToken)`, `accessToken.value = response.accessToken`, `unlockValue.value = ''`, `unlockOpen.value = false`, `await loadDomains()`; on failure set `unlockError.value` from the caught `ApiError`.
7. Add `async function lock()`: `try { await api.lock(accessToken.value) } catch {}`, then `clearAccessToken()`, `accessToken.value = ''`, `await loadDomains()`.
8. Pass `accessToken.value || undefined` into the `api.token(address.value, ...)` calls inside `submit()` and `randomize()`.
9. Add the unlock UI block to the template: an unlocked-state badge + "Lock" button when `accessToken` is set; otherwise a "Unlock full access" toggle link that reveals the input + submit button when `unlockOpen` is true.
10. Add all new `unlock.*` keys to both `en` and `vi` objects in `i18n.ts`, keeping the same flat-key, comma-separated-string style already used throughout the file.

## Todo List

- [ ] `access.ts` created
- [ ] `api.ts` `unlock`/`lock`/extended signatures added
- [ ] `AddressPanel.vue` unlock UI implemented and wired into `loadDomains`/`submit`/`randomize`
- [ ] `i18n.ts` `unlock.*` strings added in both locales
- [ ] `npm run build` succeeds

## Success Criteria

- A visitor who has never unlocked sees the same domain list and flow as today (no regression).
- Entering a valid credential reveals blacklisted domains in the `<select>` and allows successfully creating an address on one.
- The unlocked state survives a page reload (localStorage) and calling "Lock" reverts to the filtered list without a page reload.
- An invalid credential shows an inline error and does not change the domain list.

## Risk Assessment

- **Risk:** stale `accessToken` in localStorage (session expired server-side or credential revoked) causes silent fallback to the filtered list with no explanation. **Mitigation:** acceptable — `/domains` degrades gracefully to the safe (filtered) response when the bearer token doesn't validate; no error state needed for this case, matches "fail closed" security posture.
- **Risk:** forgetting to pass `accessToken` into `randomize()`'s `api.token()` call would let random-address generation silently ignore the unlocked state. **Mitigation:** explicit step 8 above covers both `submit()` and `randomize()`.

## Security Considerations

- The access token is a bearer credential in localStorage, same trust model as the existing mailbox session tokens already stored there (`session.ts`) — no new class of client-side secret exposure.
- `/domains` and `/token` still validate the bearer token server-side on every request; the frontend cannot self-grant elevation.

## Next Steps

- Phase 4 (admin UI) and this phase are independent and could be built in either order; Phase 5 tests both.
