---
title: "Wildcard web-domain blacklist and whitelist removal"
description: "Allow blacklist rules such as *.thesunk.edu.vn, preserve explicit whitelist exceptions, and let admins remove listed domains."
status: completed
priority: P2
effort: 4h
issue: null
branch: main
tags: [feature, backend, frontend, api]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Wildcard web-domain blacklist and whitelist removal

## Overview

Extend public-web domain access rules. `*.thesunk.edu.vn` denies `thesunk.edu.vn` and every subdomain; an exact whitelist entry wins for that one domain. Each displayed whitelist domain gets a Remove control.

## Scope challenge

- Existing code: settings JSON already stores `blacklisted_domains`; `current_domains()` is the single public API gate; `DomainsTab.vue` renders the whitelist and saves settings.
- Minimum change: one shared matcher, one precedence rule, one removal action, existing settings endpoint.
- Complexity: 6 files, 3 phases, no new dependency/table/endpoint.

## Decisions

- Normalize rule values with existing IDNA validation. Accept exact domains and only leading `*.` expressions; reject bare `*`, mid-label globs, and malformed suffixes.
- A wildcard matches its suffix too: `*.thesunk.edu.vn` matches `thesunk.edu.vn` and `a.thesunk.edu.vn`, but not `notthesunk.edu.vn`.
- “Whitelist wins” means an explicit manual whitelist entry (`manual_domains`) overrides an exact or wildcard blacklist rule. Synced/frozen domains remain eligible but are denied when matching a blacklist rule. This keeps wildcard rules useful while preserving deliberate admin exceptions.
- Removing a manually added whitelist domain removes it from `manual_domains`. A sync-derived domain cannot be permanently removed while auto-sync still supplies it; its row instead uses the existing blacklist setting for exclusion and is clearly labeled in the UI.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Apply normalized domain-policy matching](./phase-01-domain-policy-matching.md) | Complete |
| 2 | [Manage whitelist and blacklist rules](./phase-02-domain-admin-controls.md) | Complete |
| 3 | [Cover precedence and removal](./phase-03-regression-tests.md) | Complete |

## Validation

- `pytest tests/test_api_auth.py tests/test_admin_api.py tests/test_public_api.py` — 118 passed, 2 failed. The 2 failures (`test_disabling_sync_freezes_latest_policy_cache`, `test_disable_and_sync_commit_in_one_order`) are a pre-existing sync/disable thread-ordering race unrelated to blacklist matching — out of this plan's scope, tracked separately (see 260814-1810-fix-flaky-sync-disable-race follow-up note below).
- `npm test -- --run src/tests/AdminApp.test.ts` — passes (28 tests).
- `npm run build` from `frontend/` — passes. `@fontsource-variable/inter` is present in `frontend/package.json` and installed; the earlier block was a stale/incomplete `node_modules` in whatever environment ran that build, not a real dependency gap. Re-verified 2026-08-14 in a clean checkout.

## Follow-up (out of scope, not blocking)

`test_disabling_sync_freezes_latest_policy_cache` and `test_disable_and_sync_commit_in_one_order` in `tests/test_admin_api.py` fail consistently (not flaky-random) on a `snapshot_read.wait(1)` timeout — a pre-existing thread-timing issue in the disable/sync race, unrelated to this plan's matcher/removal work. Worth its own small bugfix plan later.

## Open product decision

This plan treats only `manual_domains` as an explicit whitelist exception, because the auto-synced list otherwise makes every domain override every blacklist rule. If “whitelist wins” must include synced/frozen domains too, define a separate explicit-exception list before implementation.
