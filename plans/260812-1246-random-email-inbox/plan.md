---
title: "Random inbox, manual domains, and OTP detection"
description: "Open a random inbox, add receiving domains into the active whitelist, and expose verification codes when an email opens."
status: complete
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

Deliver three contained improvements: open a random address through the existing token flow, let administrators add a valid receiving domain directly into the active whitelist without disabling automatic sync, and show a detected 4–8 digit verification code when a message is opened.

## Scope

- Reuse `randomize()`, `api.domains()`, `submit()`, and the `open` event for random inboxes.
- Persist manual domains in the existing settings store and union them with either auto-synced cache entries or the frozen snapshot; domain validation remains server-side. Replace the free-form “Manual receiving domains” textarea with one domain input and an Add button that saves through the existing settings endpoint and refreshes the visible whitelist from its response.
- Detect but do not automatically copy the first ASCII numeric token of 4–8 digits in an opened message. Display it with an explicit copy control.
- No new service, database, endpoint family, dependency, background job, or route.
- `docs/development-rules.md` and related codebase-doc files are absent.

## Cross-Plan Dependencies

None. The only existing plan is completed and concerns domain refresh/copy fallback; this plan extends its request-driven `GET /domains` behavior without changing it.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Generate and open the random address](./phase-01-random-address.md) | Complete |
| 2 | [Add manual domains to the active whitelist](./phase-02-manual-domains.md) | Complete |
| 3 | [Detect OTPs in opened messages](./phase-03-otp-detection.md) | Complete |
| 4 | [Verify the combined feature set](./phase-04-verify-flow.md) | Complete |

## Verification

Complete: `npm test -- --run` passed (10 files, 96 tests). This was the only verification command rerun for this completion; `pytest -q` and `npm run build` were not rerun.
