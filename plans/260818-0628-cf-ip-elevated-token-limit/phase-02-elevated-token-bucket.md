# Phase 2: Elevated-access bucket for /token

## Context Links

- Plan: [plan.md](./plan.md)
- Prior phase: [Trust CF-Connecting-IP for rate-limit keys](./phase-01-cf-connecting-ip.md)
- `elevated_access` dependency: `src/api_server.py:294-301`
- `/token` route: `src/api_server.py:563-577` (`Depends(elevated_access)`)
- `security` middleware: `src/api_server.py:775-787`
- `StateStore.get_access_session`: `src/api_state.py:157-165`
- Elevated-access tests: `tests/test_public_api.py:495-536`

## Overview

- **Priority:** P2
- **Status:** Pending
- Give `/token` requests that carry a valid elevated-access bearer token their own rate-limit
  bucket, so an unlocked visitor's bulk-generate opens don't compete with anonymous `/token` traffic
  from the same (now Cloudflare-real, post-Phase-1) IP.

## Key Insights

- `elevated_access` (`src/api_server.py:294-301`) already does exactly the check needed — read the
  `Authorization: Bearer <token>` header, hash it, look it up in `state_store.get_access_session`.
  It's a FastAPI dependency (`Depends`), which only resolves *after* routing — the rate-limit
  middleware runs *before* routing, so it can't call this dependency directly. The fix is to extract
  the hash-lookup core into a plain function both the dependency and the middleware can call, so
  there's exactly one implementation of "is this bearer token elevated" (DRY — don't let the
  middleware grow a second, divergent copy of this check).
- `state_store.get_access_session` is a read-only SQLite lookup (confirmed: only mutates on the
  expired-session cleanup path, which is idempotent). Calling it twice per elevated `/token` request
  (once in middleware for bucketing, once in the route's `elevated_access` dependency) is a minor,
  acceptable duplication — not worth a request-scoped cache for this.
- `HTTPBearer`'s header parsing (scheme + credentials split, case-insensitive `bearer`) is already
  implemented by `fastapi.security.utils.get_authorization_scheme_param` — reuse it in the
  middleware instead of hand-rolling `"Bearer ".strip()` parsing, so parsing stays identical to what
  the `HTTPBearer` dependency does at the route level.
- Only `/token` changes bucketing logic. `/accounts`, `/unlock`, `/admin/login`, `/admin/api/login`
  keep plain `(path, client_ip)` keys — no elevation concept applies to them today (none of them
  accept a bearer token as their auth mechanism the way `/token` optionally does).

## Requirements

### Functional
- A `/token` request with a valid elevated-access bearer token is keyed by
  `(path, f"elevated:{token_hash}")` instead of `(path, client_ip)` — its own independent 10 req/60s
  budget, unaffected by anonymous `/token` traffic on the same IP and vice versa.
- A `/token` request with no bearer token, or an invalid/expired one, falls back to the existing
  `(path, client_ip)` keying — unchanged from today.
- `elevated_access()`'s return value and all route-level behavior it gates (`/token`'s domain
  whitelist bypass, etc.) must be byte-for-byte unchanged — this phase only changes *which rate-limit
  bucket* a request lands in, never authorization outcomes.

### Non-functional
- No new config, no new persistence — reuses `StateStore.get_access_session` as-is.
- No change to `/accounts`, `/unlock`, `/admin/login`, `/admin/api/login` bucketing or limits.

## Architecture

### `src/api_server.py`

Extract the shared check (near `elevated_access`, `src/api_server.py:294`):

```python
def _elevated_token_hash(request: Request, token: str | None) -> str | None:
    """Hash of `token` if it's a currently-valid elevated-access bearer token, else None."""
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if request.app.state.state_store.get_access_session(token_hash, datetime.now(timezone.utc)):
        return token_hash
    return None


def elevated_access(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_BEARER),
) -> bool:
    if credentials is None:
        return False
    return _elevated_token_hash(request, credentials.credentials) is not None
```

Add the import (top of file, alongside other `fastapi.security` imports):
```python
from fastapi.security.utils import get_authorization_scheme_param
```

In the `security` middleware (`src/api_server.py:775-787`), replace the flat key construction with:

```python
if request.url.path in {"/accounts", "/token", "/unlock", "/admin/login", "/admin/api/login"}:
    client_ip = _client_ip(request)
    key = (request.url.path, client_ip)
    if request.url.path == "/token":
        scheme, raw_token = get_authorization_scheme_param(request.headers.get("Authorization"))
        if scheme.lower() == "bearer":
            token_hash = _elevated_token_hash(request, raw_token)
            if token_hash:
                key = (request.url.path, f"elevated:{token_hash}")
    if not limiter.allow(key):
        response = _error(429, "Too many requests", "Try again later")
        _set_security_headers(request, response)
        return response
```

(Keep the rest of the middleware function body — `response = await call_next(request)` etc. —
unchanged.)

## Related Code Files

**Modify:**
- `src/api_server.py` (`_elevated_token_hash` extraction, `elevated_access` refactor, middleware
  bucketing for `/token`, new import)

**Test (modify):**
- `tests/test_public_api.py`

## Implementation Steps

1. Add `_elevated_token_hash(request, token)` near `elevated_access` in `src/api_server.py`.
2. Refactor `elevated_access()` to call it — run
   `.venv/bin/pytest tests/test_public_api.py -k elevated -q` to confirm existing elevated-access
   tests (`test_elevated_access_bypasses_blacklist_only_for_access_token`,
   `test_elevated_session_outlives_deleted_credential`) still pass unchanged before touching the
   middleware.
3. Add the `get_authorization_scheme_param` import.
4. Update the `security` middleware's key construction for `/token` per the Architecture snippet.
5. Add tests to `tests/test_public_api.py`:
   - Elevated `/token` request (valid `Authorization: Bearer <access-token>` from a prior
     `/unlock`) gets a rate-limit budget independent of anonymous `/token` traffic from the same
     client: exhaust the anonymous budget (10 plain `/token` calls), confirm the 11th plain call
     429s, then confirm an elevated call with a fresh valid access token still succeeds.
   - Exhaust the elevated budget (10 elevated `/token` calls with the same access token), confirm
     the 11th 429s, then confirm a plain anonymous `/token` call still succeeds (buckets don't leak
     into each other in either direction).
   - Invalid/expired bearer token on `/token` falls back to the plain `(path, client_ip)` bucket
     (shares budget with anonymous traffic) — not its own bucket keyed by a bogus hash.
6. Run `.venv/bin/pytest -q` (full suite) to confirm no regressions elsewhere.

## Todo List

- [ ] `_elevated_token_hash` extracted, `elevated_access` refactored and behavior-unchanged
- [ ] Middleware buckets elevated `/token` requests separately from anonymous ones
- [ ] New tests: independent budgets in both directions, invalid-token fallback
- [ ] All pre-existing elevated-access and rate-limit tests pass unmodified
- [ ] Full `.venv/bin/pytest -q` green

## Success Criteria

- An unlocked visitor can open a full 10-address bulk-generate batch via `/token` even if the
  anonymous per-IP `/token` budget on that same (Phase-1-corrected) IP is already exhausted by other
  traffic, and vice versa.
- `elevated_access()`'s observable behavior (what it returns, what routes do with that) is identical
  to before this phase — confirmed by existing tests passing unmodified.

## Risk Assessment

- **Double DB lookup per elevated `/token` request** (middleware + route dependency) — accepted,
  documented in Key Insights; revisit only if `state_store` lookups become a measured bottleneck.
- **Divergent parsing** if the middleware ever hand-rolls its own bearer-header parsing instead of
  reusing `get_authorization_scheme_param` — mitigated by explicitly requiring that import/reuse in
  the Architecture section above, not a bespoke parser.
- **Scope creep to other paths** — `/accounts`, `/unlock`, `/admin/login`, `/admin/api/login` must
  stay untouched; if a future need arises to elevate-bucket one of those too, that's a new plan, not
  a silent addition here.

## Security Considerations

- No new authorization surface: `elevated_access()`'s security-relevant behavior (what counts as
  elevated) is unchanged, only relocated into a shared helper.
- An elevated bucket keyed by token hash is exactly as sensitive as the token itself — same trust
  level as the existing `Authorization` header handling elsewhere in this file. No new secret
  material is logged, stored, or exposed (the hash is already what `get_access_session` compares
  against; nothing new added to persistence).

## Next Steps

None — final phase of this plan.
