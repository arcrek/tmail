---
title: "Bulk code reader"
description: "Let a visitor paste a list of email addresses and see, in one table, the latest message's subject and extracted verification code for each — with per-row copy and auto-refresh."
status: pending
priority: P2
effort: 8h
issue: null
branch: main
tags: [feature, frontend]
blockedBy: []
blocks: [260818-0723-toast-copy-actions]
created: 2026-08-18
---

# Bulk code reader

## Overview

Add a "Bulk read" tab to the site header (next to the existing "Bulk generate" tab). It lets a visitor paste/type a list of email addresses (any `local@domain`, not limited to addresses previously opened on this device — `/token` is public and stateless, same as `260818-0423-bulk-address-generator` relies on), and shows one row per address: **Email address | Subject | Extracted code**, each row with a **Copy code** button (and a copy-email affordance). Table auto-refreshes on an interval and has a manual "Refresh" button.

This is a pure frontend feature reusing existing public endpoints (`POST /token`, `GET /messages`, `GET /messages/{id}`) — no new backend endpoint, no new persistence.

## Design decisions (resolved during scope challenge)

- **Input:** any address, not just saved/remembered sessions — matches how the user described "nhập 1 list email" (paste a list), and matches the precedent set by the bulk generator (client can request a token for any address; the server enforces domain rules).
- **Count cap: 10**, matching `POST /token`'s existing rate limit (10 req/IP/60s, `src/api_server.py::_FixedWindowLimiter`). One full-batch submit issues at most 10 `/token` calls — exactly the limit, no client-side throttling/queueing needed for the initial batch.
- **Token caching is load-bearing for auto-refresh.** A token is only requested once per address per session of this view (cached in local component state). Auto-poll re-fetches `messages`/`message` only (endpoints not covered by the fixed-window limiter) — it must **not** re-call `/token` per tick, or a sustained poll would blow through the 10/60s budget within one interval window. If a cached token is rejected (401, expired), re-issue it once and retry that row.
- **Auto-poll (scope-expansion add-on):** re-run the fetch-latest-message step for every row on the same interval cadence `InboxView` already uses (`site.fetchSeconds`, default 20s), paused while the tab is hidden (mirror `InboxView`'s `visibilitychange` handling). The existing manual "Refresh" button stays alongside it — auto-poll does not replace manual refresh.
- **Code extraction reuses `MessageReader.vue`'s existing regex** (subject → text → HTML body, 4-8 digit heuristic) rather than inventing a second implementation. It moves to a new shared module `frontend/src/verificationCode.ts`; `MessageReader.vue` is refactored to import it instead of defining its own copy.
- **Per-row independence:** one address failing (bad domain, blocked domain, rate-limited) must not block the others — process rows independently (`Promise.allSettled`-style), show the row's own error inline, no page-level failure for a partial batch.
- **Deferred (NOT in scope):** CSV import/export, saving the pasted batch across reload, concurrency limiting beyond the natural 10-address cap, bulk copy-all.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|---|---|---|
| Blocks | [260818-0723-toast-copy-actions](../260818-0723-toast-copy-actions/plan.md) | pending |

`260818-0723-toast-copy-actions` wires an in-app "new mail" toast with a "Copy code" action in `InboxView.vue`, using `extractVerificationCode()` from this plan's Phase 1. It must land after this plan's Phase 1 (the extraction alone, not the whole plan, but tracked at plan granularity here since there's no sub-phase dependency field).

Scanned `plans/`: all other unfinished plans (`260812-1455-domain-blacklist-patterns`, `260814-1830-realtime-inbox-sse`, `260814-1831-inbox-search-filter`, `260814-1832-domain-mx-health-monitoring`) touch unrelated files (domain admin, SSE transport, search filter, MX health) — no overlap.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Shared code-extraction util + BulkCodeView core](./phase-01-core-view.md) | Pending |
| 2 | [Auto-poll, manual refresh, nav wiring](./phase-02-poll-and-nav.md) | Pending |
| 3 | [Tests & accessibility polish](./phase-03-tests.md) | Pending |

## Dependencies

- No new npm package.
- Reuses `api.token`, `api.messages`, `api.message`, `copyText`, `useToast`, `useI18n` — all existing.
