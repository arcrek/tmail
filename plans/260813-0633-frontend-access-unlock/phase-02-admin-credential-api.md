# Phase 2: Admin API for credential management

## Context Links

- Plan: [plan.md](./plan.md)
- Depends on: [Phase 1](./phase-01-backend-elevated-access.md) (needs `StateStore` credential methods)
- `src/admin_api.py` — `_session`, `_csrf` dependencies, `MASKED_SECRET` convention, existing CRUD-shaped routes (`login`, `sync_domains`)

## Overview

- Priority: P1
- Status: Complete
- Expose admin-only CRUD for `access_credentials`: list, create (password or generated token), delete.

## Key Insights

- Every admin mutation route in this file uses `Depends(_csrf)`; read-only routes use `Depends(_session)`. Follow the same split.
- `secrets.token_urlsafe(32)` is already imported (`import secrets` at top of `src/admin_api.py`) and used for session tokens — reuse it verbatim for generated access tokens.
- The file already has a convention for "generated secret, shown once": none exists yet exactly, but `MASKED_SECRET` shows the "never re-expose a stored secret" half of that convention (`jmap_token`). A created token's plaintext is returned only in the `create` response body, never again afterward.
- ID generation: no existing UUID/ID helper for admin-created rows exists in this file (`_stable_id` in `api_server.py` is deterministic hash-based, not applicable for a new random row id). Use `secrets.token_hex(12)` for `id`.

## Requirements

### Functional

- `GET /admin/api/access-credentials` (Depends `_session`): return `{"credentials": [{"id", "kind", "label", "createdAt"}, ...]}`, no secret material.
- `POST /admin/api/access-credentials` (Depends `_csrf`), body `{"kind": "password"|"token", "label": str, "password"?: str}`:
  - `kind` must be `"password"` or `"token"`; `label` must be a non-empty string, trimmed, ≤ 100 chars.
  - `kind == "password"`: `password` field required, string, ≥ 8 chars after trim; hash and store it.
  - `kind == "token"`: `password` field must be absent/empty; server generates `secrets.token_urlsafe(32)`.
  - On unique `secret_hash` collision (`sqlite3.IntegrityError`), return `422` "Credential already exists".
  - Response: `{"id", "kind", "label", "createdAt", "secret"?}` — `secret` present only for `kind == "token"` (the generated value, shown once) or when a password was just set (echo the plaintext once, same "shown once" contract, so the admin can hand it to a visitor immediately without re-typing it elsewhere).
- `DELETE /admin/api/access-credentials/{id}` (Depends `_csrf`): delete; `404` if the id doesn't exist, else `204`.
- Record an `access_credential_created` / `access_credential_revoked` activity event via `state.record_event(...)` (matches existing `record_sync` / `domain_provisioned` activity pattern) — no dashboard surfacing required this phase, just consistent audit trail.

### Non-functional

- All three routes registered on the existing `router = APIRouter(prefix="/admin/api", ...)` in this file — no new router object.
- Reuse `_string`, `_integer` style validators already in the file rather than ad hoc checks.

## Architecture

```
Admin (authenticated, CSRF) → POST /admin/api/access-credentials {kind:"token", label:"kiosk-1"}
                             → secrets.token_urlsafe(32) → sha256 → INSERT access_credentials
                             → 201 {id, kind, label, createdAt, secret}   (secret shown once)

Admin → GET /admin/api/access-credentials → list without secret material
Admin → DELETE /admin/api/access-credentials/{id} → future /unlock attempts with that secret fail
```

## Related Code Files

- Modify `src/admin_api.py`:
  - Add `_validate_access_credential(body)` helper near `_validate_site` / `_validate_mail`.
  - Add three route handlers below `test_mail` / above `dashboard`, or grouped together in a clearly-labeled block.

## Implementation Steps

1. Add a small validator: given the raw body dict, check `kind in {"password", "token"}`, `label` non-empty ≤ 100 chars (reuse `_string`), and for `kind == "password"` require `password` len ≥ 8 after `.strip()`.
2. `GET /admin/api/access-credentials`: `Depends(_session)`, call `request.app.state.state_store.list_access_credentials()`, map keys to camelCase (`_camel`) for the response, wrap under `{"credentials": [...]}`.
3. `POST /admin/api/access-credentials`: `Depends(_csrf)`, validate body, generate `id = secrets.token_hex(12)`, compute `secret_hash` (sha256) and the plaintext `secret` to echo back (either the provided password or the generated token), `created_at = datetime.now(timezone.utc).isoformat()`.
4. Call `state.create_access_credential(id, kind, label, secret_hash, created_at)` inside a `try`/`except sqlite3.IntegrityError` → `raise HTTPException(422, "Credential already exists") from None`.
5. `state.record_event("access_credential_created", detail=f"{kind}:{label}")`.
6. Return `JSONResponse(status_code=201, content={"id": id, "kind": kind, "label": label, "createdAt": created_at, "secret": secret})`.
7. `DELETE /admin/api/access-credentials/{id}`: `Depends(_csrf)`, call `state.delete_access_credential(id)`; if `False`, `raise HTTPException(404, "Credential not found")`; else `state.record_event("access_credential_revoked", detail=id)` and return `Response(status_code=204)`.
8. Import `sqlite3` at the top of `src/admin_api.py` if not already imported (check first — `src/api_state.py` imports it, `src/admin_api.py` currently does not).

## Todo List

- [ ] `_validate_access_credential` helper added
- [ ] `GET /admin/api/access-credentials` implemented
- [ ] `POST /admin/api/access-credentials` implemented (both kinds, collision handling)
- [ ] `DELETE /admin/api/access-credentials/{id}` implemented
- [ ] Activity events recorded on create/delete

## Success Criteria

- Admin can create a password-kind credential, see it listed without the password ever reappearing in `GET`.
- Admin can create a token-kind credential, receive the generated secret exactly once in the `POST` response.
- Deleting a credential removes it from `GET` and makes future `/unlock` attempts with that secret fail with `401`.
- Duplicate secret (same password text, or the astronomically unlikely token collision) returns `422`, not `500`.

## Risk Assessment

- **Risk:** admin accidentally creates a very short/guessable password with no server-side minimum. **Mitigation:** enforce ≥ 8 chars server-side (see Requirements); document in the UI (Phase 4) that this grants full mailbox access.
- **Risk:** unauthenticated access to these routes. **Mitigation:** identical `_session`/`_csrf` dependency pattern as every other admin route in this file — no new attack surface.

## Security Considerations

- Only admins (valid session + CSRF) can create/list/delete credentials — same trust boundary as all other `/admin/api/*` routes.
- Plaintext secret is echoed exactly once, only in the creation response — never persisted or re-served.

## Next Steps

- Phase 4 builds the admin UI that consumes these three endpoints.
