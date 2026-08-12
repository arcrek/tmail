# Phase 1 — Enforce web-domain blacklist

## Overview

**Priority:** P2  
**Status:** Completed  
**Estimate:** 2h

Persist and validate a blacklist, then derive the public web-domain set without changing the receiving-domain source used by mail infrastructure.

## Related code files

- Modify: `/home/arcrek/workspace/tmail_add_domain/src/api_state.py` — add an empty `blacklisted_domains` default.
- Modify: `/home/arcrek/workspace/tmail_add_domain/src/admin_api.py` — allow, normalize, validate, persist, and return the setting.
- Modify: `/home/arcrek/workspace/tmail_add_domain/src/api_server.py` — filter public domains and avoid unnecessary auto-sync for a known but blacklisted domain.
- Modify: `/home/arcrek/workspace/tmail_add_domain/tests/test_admin_api.py` — settings validation/round-trip coverage.
- Modify: `/home/arcrek/workspace/tmail_add_domain/tests/test_public_api.py` — public discovery, creation, and old-token rejection coverage.

## Implementation steps

1. Add `blacklisted_domains: []` to `DEFAULT_SETTINGS`; old state DBs obtain it through the existing `INSERT OR IGNORE` initialization.
2. Add the key to `SITE_KEYS` and validate it through existing `_list(..., _domain)`, giving trim, IDNA normalization, deduplication, and invalid-input rejection for free.
3. Keep `active_domains()` unchanged. In `api_server.py`, make `current_domains()` return active receiving domains minus normalized `blacklisted_domains`.
4. In `_address()`, distinguish an actually unknown domain from a known-but-blacklisted domain before trying auto-sync. Then call `normalize_address` with `current_domains()` so `/accounts`, `/token`, bearer auth, and message ownership all share the denial.
5. Verify `/domains` omits blacklisted entries; `/accounts` and `/token` reject their addresses with 422; a token issued before blacklisting receives 401 from `/me` and `/messages` through `bearer_address`.

## Success criteria

- A blacklisted MX domain remains in admin `domains` data but never appears in the public domain collection.
- New account/token creation fails for it.
- Existing browser tokens cannot read, alter, download, or delete its messages.
- Invalid blacklist entries return 422 and do not update persisted settings.

## Risks and security

- Do not filter `active_domains()` globally: it is the receiving-domain abstraction and could be reused outside the browser API.
- Revalidation must remain in `bearer_address`; hiding the option in Vue alone is not access control.

## Todo

- [x] Add the persisted, validated blacklist setting.
- [x] Filter only public web domains and avoid blacklisted-domain sync work.
- [x] Add API regression tests.
