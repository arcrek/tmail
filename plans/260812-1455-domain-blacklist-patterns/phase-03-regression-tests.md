# Phase 3 — Cover precedence and removal

## Overview

**Priority:** P2  
**Status:** Blocked — frontend production build  
**Estimate:** 1h

Lock the minimal rule grammar and ensure admin actions keep public authorization correct.

## Related code files

- Modify: `/home/arcrek/workspace/tmail_add_domain/tests/test_api_auth.py` — unit tests for normalization/matching.
- Modify: `/home/arcrek/workspace/tmail_add_domain/tests/test_admin_api.py` — expression persistence and invalid input.
- Modify: `/home/arcrek/workspace/tmail_add_domain/tests/test_public_api.py` — discovery, account/token, and old-token denial/exception cases.
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/AdminApp.test.ts` — per-row removal payload and disabled state.

## Implementation steps

1. Test canonicalization of case/IDNA wildcard suffixes and rejection of unsupported forms (`*`, `a.*.example.com`, malformed suffixes).
2. Test exact and wildcard boundary behavior, including base-domain inclusion and no false positive for suffix lookalikes.
3. Test wildcard blacklist denial across `/domains`, `/accounts`, `/token`, and bearer routes, plus a manual whitelist exception for one matching subdomain.
4. Test both UI removal paths: manual entry removal updates `manualDomains`; synced entry removal adds an exact `blacklistedDomains` rule. Assert controls respect existing busy state.
5. Run the listed backend tests, focused Vue test, and production frontend build.

## Success criteria

- Tests fail if matcher semantics or precedence change.
- Existing exact blacklist behavior still passes.
- No regression permits a previously issued token after its non-exempt domain becomes blocked.

## Todo

- [x] Add backend policy and API coverage.
- [x] Add admin UI action coverage.
- [ ] Run focused tests and frontend build — focused backend/frontend tests pass; production build is blocked because `@fontsource-variable/inter` is absent from installed dependencies. The full backend suite also has an existing admin test setup hang.
