---
title: "Bulk random address generator"
description: "Let a visitor generate N random temporary addresses at once from a header tab, and open any of them in a new browser tab."
status: completed
priority: P2
effort: 4h
issue: null
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-08-18
---

# Bulk random address generator

## Overview

Add a "Bulk generate" tab to the site header. It lets a visitor pick a count (1-50), generates that many random `local@domain` addresses client-side (same consonant/vowel scheme the existing single "Random" button uses, one random active domain per address, deduped within the batch), and lists them. Each row has **Copy** and **Open in new tab** actions; opening spawns `window.open('/{address}', '_blank')`, which the SPA's existing route-reconciliation logic (`App.vue: reconcileRoute`) already turns into a working inbox by calling the public, unauthenticated `POST /token` endpoint — no backend change needed.

This is a pure frontend feature. No new API endpoint, no new persistence, no change to the rate limiter. (Correction post-implementation: the rate limiter actually guards `/token` too, 10 req/IP/60s — see the "Count cap" design decision below for how that shaped the final max count.)

## Design decisions (resolved during scope challenge)

- **Domain per address:** random active domain per address (matches existing single-random behavior), not one shared domain for the whole batch.
- **Count cap:** originally 50 max, 1 min; lowered to **10 max** post-implementation after a Codex review pass found `POST /token` is rate-limited server-side to 10 requests per client IP per 60 seconds (`src/api_server.py`'s `_FixedWindowLimiter`) — this plan's own "Key Insights" section had incorrectly assumed the rate limiter only guarded `/accounts`. A batch above 10 could be generated but not fully opened inside the same rate-limit window.
- **UI placement:** new tab-style button in `AppHeader.vue`'s nav bar (not inline in `AddressPanel.vue`, not a modal) — switches `App.vue`'s `view` state to a new `'bulk'` view, client-side only, no URL/route change (batch is ephemeral, not meant to survive reload).
- **Token issuance stays lazy:** Generate produces address strings only, no network calls. A token is only requested when a row's "open in new tab" is clicked, by the destination tab itself (existing flow) — avoids hitting `/token` 50x on every Generate click.
- **Deferred (NOT in scope):** "open all" bulk-open (popup blockers make this unreliable without one user gesture per tab), CSV/bulk export, persisting the generated batch across reload.

## Cross-Plan Dependencies

None. Scanned `plans/` — all prior plans are `completed`/`done` except `260813-0827-toast-notifications` (`pending`), which is unrelated (global toast layer refactor, no file overlap with this plan's touched files).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Bulk generate feature](./phase-01-bulk-generate-feature.md) | Completed |
| 2 | [Tests & verification](./phase-02-tests-verification.md) | Completed |

## Dependencies

- Existing `POST /token` endpoint (`src/api_server.py`) — public, per-address, no rate limit. Unmodified.
- Existing SPA route reconciliation (`App.vue: reconcileRoute`) — unmodified, reused as-is for opening any generated address.
- Existing `external-link` icon in `AppIcon.vue` — reused for the "open in new tab" action.
