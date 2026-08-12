---
title: "Verify domain auto-sync and restore email copying"
description: "Verify the deployed request-driven domain sync path and copy addresses in browsers without the Clipboard API."
status: completed
priority: P1
effort: 2h
branch: main
tags: [bugfix, frontend]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Verify domain auto-sync and restore email copying

## Overview

The checked-in frontend already calls `GET /domains` when the address panel mounts, and that endpoint invokes the same `refresh_domains()` transaction used by the manual admin sync when auto-sync is enabled. First verify the deployed setting, network response, and recorded failure state; do not add a scheduler that changes the established request-driven contract. Replace the Clipboard-API-only copy paths with a small native fallback for non-secure contexts and unsupported browsers.

## Scope

- Existing code reused: `api.domains()`, server-side `refresh_domains()`, sync history, and Vitest.
- No scheduler, backend synchronization change, dependency, or new setting. One shared clipboard helper is justified because both address and inbox screens copy email addresses.
- Earlier `docs/superpowers/plans/2026-07-22-frontend-corrections.md` already covers request-driven backend refresh; this plan verifies that behavior in deployment and fills the copy-fallback gap.

## Cross-Plan Dependencies

None. `plans/` had no unfinished plans; the related historical plans under `docs/superpowers/plans/` need no update.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Verify request-driven domain sync](./phase-01-domain-refresh.md) | Completed |
| 2 | [Make email copy work broadly](./phase-02-copy-fallback.md) | Completed |

## Verification

Run `npm test -- --run` in `frontend/`, then build with `npm run build`.
