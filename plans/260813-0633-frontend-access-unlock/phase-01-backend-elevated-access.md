# Phase 1: Backend credential storage and elevated domain access

## Context Links

- Plan: [plan.md](./plan.md)
- `src/api_state.py` — sqlite `StateStore`, existing `admin_sessions` table/methods to mirror
- `src/api_server.py` — `current_domains()` (line ~231), `_address()` (line ~240), `bearer_address()` (line ~260), rate-limit middleware (line ~646)

## Overview

- Priority: P1 (everything else depends on this)
- Status: Complete
- Add the sqlite schema for access credentials and access sessions, and make the public domain/address gate elevation-aware.

## Key Insights

- `current_domains(request)` is the single choke point for domain visibility; `_address(request, value)` (used by `/accounts` and `/token`) already calls `current_domains()` internally, so threading one `elevated: bool` parameter through both functions is sufficient — no changes needed to `normalize_address()` in `src/api_auth.py`.
- The admin session pattern (`_session_hash`, `create_admin_session`, `get_admin_session`, `delete_admin_session` in `src/admin_api.py` / `src/api_state.py`) is the template for the new access-session pattern — same SHA-256-hash-as-primary-key approach, same "delete on lookup if expired" semantics.
- `HTTPBearer(auto_error=False)` (`_BEARER` in `src/api_server.py`) is already imported and used for `bearer_address`; reuse the same class for a new optional dependency instead of importing anything new.

## Requirements

### Functional

- `access_credentials` table: `id` (primary key), `kind` (`password` | `token`), `label`, `secret_hash` (unique), `created_at`.
- `access_sessions` table: `token_hash` (primary key), `expires_at`.
- `StateStore` methods: `create_access_credential`, `list_access_credentials`, `delete_access_credential`, `find_access_credential_by_hash`, `create_access_session`, `get_access_session`, `delete_access_session`.
- `POST /unlock` (public, body `{"credential": str}`): hash the input, look up a matching credential; on match, create a 30-day access session and return `{"accessToken": str, "expiresAt": iso8601}`; on no match, `401`.
- `DELETE /lock` (public, `Authorization: Bearer <accessToken>` required): delete the matching access session, `204`. Missing/invalid token → `204` as well (idempotent sign-out, no information leak about session validity).
- `current_domains(request, config=None, elevated=False)`: when `elevated` is `True`, return the full domain list unfiltered by `blacklisted_domains`.
- `_address(request, value, config=None, elevated=False)`: pass `elevated` through to its internal `current_domains()` call.
- New dependency `elevated_access(request, credentials=Depends(_BEARER)) -> bool`: never raises; returns `True` only if a bearer credential is present and its SHA-256 hash matches a non-expired row in `access_sessions`.
- Wire `elevated: bool = Depends(elevated_access)` into the `domains()`, `domain()`, `accounts()`, and `token()` route handlers (in `register_public_routes`), passing it to `current_domains(...)` / `_address(...)`.
- Add `"/unlock"` to the rate-limited path set in the `security` middleware (alongside `"/token"`, `"/admin/login"`, `"/admin/api/login"`).

### Non-functional

- No new dependency library — only `secrets`, `hashlib` (already imported in `src/admin_api.py`; import as needed in `src/api_server.py` and `src/api_state.py`).
- Credential secrets are never stored or logged in plaintext — only their SHA-256 hash.
- `find_access_credential_by_hash` and `get_access_session` must not leak timing information beyond what SQL primary-key/unique-index lookup already provides (matches existing `get_admin_session` behavior — this codebase does not use `hmac.compare_digest` for hash-vs-hash comparison, only for raw-secret-vs-raw-secret comparison in `login()`; stay consistent).

## Architecture

```
Visitor → POST /unlock {credential} → hash → SELECT access_credentials WHERE secret_hash=?
                                            → match → INSERT access_sessions(token_hash, expires_at)
                                            → return {accessToken, expiresAt}

Visitor → GET /domains  [Authorization: Bearer <accessToken>]
        → elevated_access() dependency → hash token → SELECT access_sessions WHERE token_hash=? AND not expired
        → current_domains(request, elevated=True) → skip blacklist filter
```

## Related Code Files

- Modify `src/api_state.py` — add tables in `__init__`'s `executescript`, add the six new methods listed above (place near the existing `admin_sessions` methods for locality).
- Modify `src/api_server.py`:
  - `current_domains()` — add `elevated` parameter, guard the blacklist filter.
  - `_address()` — add `elevated` parameter, pass through.
  - Add `elevated_access()` dependency function near `bearer_address()`.
  - `domains()`, `domain()`, `accounts()`, `token()` route handlers — accept and thread `elevated`.
  - Add `unlock()` and `lock()` route handlers in `register_public_routes()`.
  - `security` middleware — add `"/unlock"` to the rate-limited path set.

## Implementation Steps

1. In `src/api_state.py`, add `access_credentials` and `access_sessions` table DDL to the existing `executescript` call.
2. Add `StateStore.create_access_credential(id, kind, label, secret_hash, created_at)` — plain `INSERT`; let `sqlite3.IntegrityError` (unique `secret_hash` violation) bubble up to the caller.
3. Add `StateStore.list_access_credentials() -> list[dict]` — `SELECT id, kind, label, created_at FROM access_credentials ORDER BY created_at DESC`.
4. Add `StateStore.delete_access_credential(id) -> bool` — `DELETE ... WHERE id = ?`, return whether `cursor.rowcount` was `> 0`.
5. Add `StateStore.find_access_credential_by_hash(secret_hash) -> dict | None` — `SELECT id, kind, label FROM access_credentials WHERE secret_hash = ?`.
6. Add `StateStore.create_access_session(token_hash, expires_at)` / `get_access_session(token_hash, now) -> bool` / `delete_access_session(token_hash)` mirroring `create_admin_session` / `get_admin_session` / `delete_admin_session` (session dict not needed — access sessions carry no CSRF token or other payload, so `get_access_session` can just return a bool).
7. In `src/api_server.py`, change `current_domains(request, config=None, elevated=False)`: keep computing `domains` and `manual` as today; if `elevated`, return `domains` as-is; else apply the existing blacklist-filter comprehension.
8. Change `_address(request, value, config=None, elevated=False)`: pass `elevated=elevated` into its `current_domains(request, config, elevated=elevated)` call (both occurrences — initial and post-refresh).
9. Add `def elevated_access(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_BEARER)) -> bool` near `bearer_address`: return `False` if no credentials; else hash `credentials.credentials` and return `request.app.state.state_store.get_access_session(hash, datetime.now(timezone.utc))`.
10. Update `domains()`, `domain()` handlers to accept `elevated: bool = Depends(elevated_access)` and pass it to `current_domains(request, elevated=elevated)`.
11. Update `accounts()`, `token()` handlers similarly, passing `elevated` into their `_address(request, body.address, elevated=elevated)` calls.
12. Add `@app.post("/unlock", ...)` handler: read `credential` from body (validate non-empty string, `422` otherwise), hash it, call `find_access_credential_by_hash`; on `None` raise `HTTPException(401, "Invalid credential")`; on match, generate `secrets.token_urlsafe(32)`, hash it, `create_access_session(hash, now + timedelta(days=30))`, return `{"accessToken": token, "expiresAt": expires.isoformat()}`.
13. Add `@app.delete("/lock", status_code=204)` handler: read bearer credentials via `Depends(_BEARER)` (optional), if present hash and `delete_access_session`; always return `204`.
14. Add `"/unlock"` to the rate-limited path set in the `security` middleware.
15. Run `pytest tests/test_api_state.py tests/test_public_api.py` to confirm nothing existing breaks (new tests come in Phase 5).

## Todo List

- [ ] `access_credentials` / `access_sessions` tables added to `StateStore.__init__`
- [ ] Six new `StateStore` methods implemented
- [ ] `current_domains()` and `_address()` accept and honor `elevated`
- [ ] `elevated_access()` dependency added
- [ ] `domains()`, `domain()`, `accounts()`, `token()` thread `elevated` through
- [ ] `/unlock` and `/lock` routes implemented
- [ ] `/unlock` added to the rate limiter's path set
- [ ] Existing backend test suites still pass

## Success Criteria

- With no `Authorization` header, `/domains` and `/token` behave exactly as before (regression-free).
- A valid `/unlock` credential yields a bearer token that, when sent as `Authorization: Bearer` on `/domains`, includes previously-blacklisted domains in the response.
- The same bearer token, sent on `POST /token` for a blacklisted domain, successfully issues a mailbox token instead of `422`.
- `DELETE /lock` followed by reusing the same bearer token on `/domains` reverts to the filtered (non-elevated) list.

## Risk Assessment

- **Risk:** forgetting one of the four call sites (`domains`, `domain`, `accounts`, `token`) leaves an inconsistent bypass (e.g., visible in the list but rejected on creation, or vice versa). **Mitigation:** Phase 5 tests all four explicitly.
- **Risk:** unique-constraint violation on `secret_hash` (admin creates a token that happens to collide with an existing password) surfaces as an unhandled `sqlite3.IntegrityError` → 500. **Mitigation:** Phase 2 catches `IntegrityError` at the admin-API layer and returns `422`.

## Security Considerations

- `/unlock` is rate-limited per (path, IP) like `/token` and admin login — bounds credential-guessing throughput.
- Access sessions are opaque, unguessable (`secrets.token_urlsafe(32)`), stored only as SHA-256 hashes — same posture as `admin_sessions` and mailbox tokens.
- `/lock` does not distinguish "invalid token" from "successfully revoked" in its response — avoids using it as a token-validity oracle.
- Elevation only ever affects domain-blacklist visibility, never mailbox message access (`bearer_address`, `me`, `messages`, etc. are untouched) — confirms the scope boundary from the plan's Overview.

## Next Steps

- Phase 2 builds the admin-facing CRUD for `access_credentials` on top of the `StateStore` methods added here.
