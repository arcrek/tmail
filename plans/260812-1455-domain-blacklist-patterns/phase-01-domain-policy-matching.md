# Phase 1 — Apply normalized domain-policy matching

## Overview

**Priority:** P2  
**Status:** Complete  
**Estimate:** 1.5h

Create the one policy path used by public-domain discovery, account creation, token issuance, and bearer-token revalidation.

## Related code files

- Modify: `/home/arcrek/workspace/tmail_add_domain/src/api_auth.py` — validate/normalize permitted blacklist expressions and match them.
- Modify: `/home/arcrek/workspace/tmail_add_domain/src/admin_api.py` — validate `blacklisted_domains` with the expression-aware validator.
- Modify: `/home/arcrek/workspace/tmail_add_domain/src/api_server.py` — derive public domains using blacklist matching plus whitelist precedence.

## Implementation steps

1. Add a small pure helper beside `_domain()` that accepts either `domain` or `*.domain`, normalizes the suffix through `_domain()`, and returns the canonical rule. Keep `_domain()` strict for actual hostnames.
2. Add a pure matcher: exact rule matches only itself; wildcard rule matches its base suffix and strings ending in `.{suffix}`. Never use general `fnmatch`—the accepted grammar is deliberately narrower.
3. Update admin settings validation so `blacklisted_domains` uses this helper, keeping existing trim, dedupe, IDNA, and 422 behavior.
4. In `current_domains()`, calculate the public set from `active_domains()`: retain a domain if it is explicitly present in normalized `manual_domains`; otherwise remove it when any normalized blacklist rule matches.
5. Keep `_address()` and `bearer_address()` routed through `current_domains()` so existing tokens lose web access when a newly matching blacklist rule is saved.

## Success criteria

- `*.thesunk.edu.vn` blocks the base domain and nested subdomains only.
- `example.thesunk.edu.vn` in `manual_domains` remains public despite the wildcard.
- Invalid wildcard syntax is rejected before persistence.
- Mail receiving sources (`active_domains`) are unchanged.

## Risks and security

- Normalize both rules and tested domains before comparison; raw Unicode/case input must not bypass a rule.
- Do not move enforcement into Vue. Public routes and bearer-token routes must use the same backend decision.

## Todo

- [x] Implement the restricted wildcard grammar and matcher.
- [x] Apply it during settings validation and public-domain derivation.
- [x] Preserve token revalidation through the shared path.
