---
title: "Rate limit account creation"
description: "Extend the existing fixed-window rate limiter to POST /accounts so a bot cannot mass-create addresses."
status: done
priority: P1
effort: 0.5h
issue: null
branch: main
tags: [security, backend, api]
blockedBy: []
blocks: []
created: 2026-08-14
---

# Rate limit account creation

## Overview

`src/api_server.py` already rate-limits `/token`, `/unlock`, `/admin/login`, and `/admin/api/login`
via `_FixedWindowLimiter` (10 requests/60s per client IP, keyed by `(path, ip)`). `POST /accounts`
— the endpoint that creates a temp-mail address — is the only public write endpoint left
unguarded, so a bot can mass-create addresses with no cost. This closes that gap.

## Scope challenge

- Existing code: `_FixedWindowLimiter` class and the `security` middleware's path allowlist
  (`src/api_server.py:725-739`) already do exactly this job for four other paths.
- Minimum change: add `"/accounts"` to the middleware's path set. No new class, no new
  dependency, no new config.
- Complexity: 1 file changed (`src/api_server.py`), 1 test file extended
  (`tests/test_public_api.py`). Single phase.

## Decisions

- Reuse the same limiter instance and the same limit (10 req/60s per IP) rather than a separate
  budget — `/accounts` and `/token` are both cheap, unauthenticated, address-touching writes with
  the same abuse shape. A separate tighter limit would be premature tuning with no data behind it.
- Document the `429` response on `/accounts` in its route decorator (`responses=_ERROR_RESPONSES`
  already includes it — verify, don't assume) so the OpenAPI schema stays accurate, matching the
  existing `/token` pattern (`test_openapi_documents_passwordless_bearer_contract`).

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Add /accounts to the rate-limited path set](./phase-01-rate-limit-accounts.md) | Done |

## Validation

- `pytest tests/test_public_api.py -q` — new `test_accounts_path_is_rate_limited` plus the
  existing `test_fixed_window_prunes_expired_keys_and_separates_paths` and
  `test_security_headers_and_token_rate_limit` must all pass unchanged in behavior for the other
  three paths (no regression in their independent per-path budgets).
- Manual: 11 rapid `POST /accounts` from one IP → 11th returns `429` with a `hydra:Error` body,
  matching the existing `/token` and `/admin/login` shape.
