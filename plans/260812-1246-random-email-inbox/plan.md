---
title: "Random inbox, manual domains, and OTP detection"
description: "Open a random inbox, preserve manually managed receiving domains alongside sync results, and expose verification codes when an email opens."
status: in_progress
priority: P2
effort: 4h
branch: main
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Random inbox, manual domains, and OTP detection

## Overview

Deliver three contained improvements: open a random address through the existing token flow, let administrators maintain valid manual domains without disabling automatic sync, and show a detected 4–8 digit verification code when a message is opened.

## Scope

- Reuse `randomize()`, `api.domains()`, `submit()`, and the `open` event for random inboxes.
- Persist manual domains in the existing settings store and union them with either auto-synced cache entries or the frozen snapshot; domain validation remains server-side.
- Detect but do not automatically copy the first ASCII numeric token of 4–8 digits in an opened message. Display it with an explicit copy control.
- No new service, database, endpoint family, dependency, background job, or route.
- `docs/development-rules.md` and related codebase-doc files are absent.

## Cross-Plan Dependencies

None. The only existing plan is completed and concerns domain refresh/copy fallback; this plan extends its request-driven `GET /domains` behavior without changing it.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Generate and open the random address](./phase-01-random-address.md) | Complete |
| 2 | [Keep manual domains alongside sync](./phase-02-manual-domains.md) | Complete |
| 3 | [Detect OTPs in opened messages](./phase-03-otp-detection.md) | Complete |
| 4 | [Verify the combined feature set](./phase-04-verify-flow.md) | In progress |

## Verification

`npm test -- --run` passed (10 files, 95 tests). `pytest -q` and `npm run build` remain blocked because the environment lacks pytest and the already-declared `@fontsource-variable/inter` package in `node_modules`, respectively.
