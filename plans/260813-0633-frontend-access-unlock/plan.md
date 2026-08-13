---
title: "Frontend access-credential unlock layer"
description: "Let visitors unlock full mailbox access (bypassing blacklisted domains) with an admin-issued password or token, managed from the admin panel."
status: pending
priority: P2
effort: 8h
issue: null
branch: main
tags: [feature, backend, frontend, api, auth]
blockedBy: []
blocks: []
created: 2026-08-13
---

# Frontend access-credential unlock layer

## Overview

Public visitors currently see only the domains that pass `blacklisted_domains` filtering (`current_domains()` in `src/api_server.py`). Add an authentication layer so a visitor holding a valid access credential (password or token, admin-issued) can unlock the full domain list — including blacklisted domains — for creating and using mailboxes. Credentials are managed from a new admin panel tab: admins can create any number of named passwords and generate any number of bearer tokens, all interchangeable, all revocable.

This is scoped strictly to bypassing the domain-blacklist gate. It does not touch `blocked_sender_domains` (incoming mail filtering), `message_limit`, retention, or any other privilege.

## Scope challenge

- **Existing code:** `current_domains()` and `_address()` in `src/api_server.py` are the single gate for public domain visibility and address creation; admin already has a session/CSRF pattern (`_session`, `_csrf` in `src/admin_api.py`) and a sqlite-backed `StateStore` (`src/api_state.py`) that this feature reuses rather than duplicating.
- **Minimum change set:** one new sqlite concept (access credentials + access sessions), one new dependency function threaded through 4 existing route handlers, two new public routes (`/unlock`, `/lock`), three new admin routes (list/create/delete credential), one new frontend module (`access.ts`), one new admin tab, plus AddressPanel wiring.
- **Complexity:** ~14 files touched (3 backend, 5 frontend modified, 2 new frontend, 4 test files). Exceeds the informal 8-file guideline for a single-purpose change; user selected **HOLD SCOPE** deliberately given the plural password/token requirement — no further reduction.
- **Selected mode:** HOLD SCOPE — implement exactly what's described, focus on edge cases (expiry, revocation, duplicate secrets, brute force) and test coverage, not extra features (no per-credential expiry/usage stats — out of scope, YAGNI).

## Design decisions

- **Credential model:** one table, `access_credentials`, holding both kinds (`password` and `token`) uniformly. Both kinds are just an opaque secret string checked by SHA-256 hash equality — the frontend "unlock" field doesn't need to know which kind it received. Admin can create arbitrarily many of both.
- **Elevated session:** `/unlock` exchanges a valid credential for a server-tracked bearer session (`access_sessions` table, 30-day TTL) — matches the existing `admin_sessions` revocability pattern rather than a stateless-forever token, so `/lock` and admin-side credential deletion can both actually cut off access going forward.
- **Transport:** the elevated session token rides the existing `Authorization: Bearer` header on `GET /domains`, `GET /domains/{id}`, `POST /accounts`, and `POST /token` — the same header shape already used for mailbox tokens (`bearer_address`), just a distinct token namespace on routes that never carry a mailbox token.
- **Bypass mechanics:** `current_domains()` gains an `elevated: bool` parameter; when `True` it skips the `blacklisted_domains` filter entirely. `_address()` passes its own `elevated` flag through to `current_domains()`, so a blacklisted domain becomes a normal member of the allowed list and every existing downstream check (`normalize_address`, the auto-sync retry branch) works unchanged.
- **Brute force:** `/unlock` is added to the existing IP+path rate limiter set (`{"/token", "/admin/login", "/admin/api/login"}` → add `"/unlock"`) alongside the other credential-guessing endpoints.
- **Revocation:** deleting a credential in the admin panel does **not** retroactively revoke already-issued `/unlock` sessions (matches the codebase's existing simplicity bar — admin password rotation doesn't revoke `admin_sessions` either). `/lock` lets a visitor end their own session; sessions also expire after 30 days regardless.

## Cross-Plan Dependencies

None. No unfinished plan overlaps this scope (`260812-1455-domain-blacklist-patterns` shares `current_domains()`/`blacklisted_domains` but that plan is blocked on an unrelated frontend production-build issue and only touches wildcard-matching semantics, which this plan's `elevated` flag composes with cleanly — the elevated bypass happens before rule matching, not by editing rule matching itself).

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Backend credential storage and elevated domain access](./phase-01-backend-elevated-access.md) | Complete |
| 2 | [Admin API for credential management](./phase-02-admin-credential-api.md) | Complete |
| 3 | [Frontend unlock experience](./phase-03-frontend-unlock.md) | Complete |
| 4 | [Admin Access tab UI](./phase-04-admin-access-tab.md) | Complete |
| 5 | [Tests and regression coverage](./phase-05-tests.md) | Pending |

## Validation

- `pytest tests/test_access_credentials.py tests/test_public_api.py tests/test_admin_api.py`
- `npm test -- --run` from `frontend/`
- `npm run build` from `frontend/`

## Open product decisions

None outstanding — scope challenge and credential-model questions were resolved with the user before writing this plan (HOLD SCOPE; multiple passwords and multiple tokens, all unlock full access; localStorage bearer token, ~30-day TTL).
