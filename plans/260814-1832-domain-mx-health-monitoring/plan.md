---
title: "Domain MX health monitoring"
description: "Record MX-check failures the policy daemon already sees, and surface them plus the already-computed (but currently unrendered) domain provisioning stats on the admin Dashboard."
status: pending
priority: P1
effort: 3h
issue: null
branch: main
tags: [feature, backend, frontend, admin]
blockedBy: []
blocks: []
created: 2026-08-14
---

# Domain MX health monitoring

## Overview

`policy_daemon.py` already runs an MX check on every recipient domain (`mx_matches`) and already
logs successes via `_state.record_event("domain_provisioned", domain)`. It silently drops MX
mismatches and DNS lookup errors — the two failure paths that matter most to an admin trying to
understand why a domain isn't accepting mail. Separately, `StateStore.activity_summary()` already
computes `domainsToday`/`domainsSevenDays`/`recentDomains` and `admin_api.py`'s `/dashboard`
already returns them — but `DashboardTab.vue` only renders the `messages` block, not `domains`.
This plan closes both gaps using the existing `activity` table/event-log pattern; no new table.

## Scope challenge

- Existing code to reuse: `StateStore.record_event()` (generic, already used for 4 event kinds),
  `activity_summary()` (already queries `activity` by `kind` + time window), the `try/except`
  around `record_event` in `policy_daemon.py` (metric-write failures must never break the Postfix
  policy response — mirror the existing pattern exactly), `DashboardResource` type + `/dashboard`
  endpoint (already returns `domains.*` — frontend just isn't reading it).
- Minimum change: 2 new event kinds (`mx_mismatch`, `mx_lookup_error`) written from the 2 existing
  failure branches in `policy_daemon.py`; extend `activity_summary()` to also return recent
  failures; add the missing dashboard markup. No new DB table, no new endpoint.
- Complexity: 3 files (`policy_daemon.py`, `api_state.py`, `DashboardTab.vue`) + tests. 2 phases.

## Decisions

- **Reuse the `activity` table**, don't add a `domain_health` table. It's already a generic
  `(kind, domain, detail, created_at)` event log with exactly the columns this needs — a new table
  would duplicate it for no benefit (DRY).
- **Log per-check-failure events, not a materialized "current health" row per domain.** A domain
  that fails once and later fixes its MX record should show its failure history, not just a
  binary current-state flag — the existing event-log shape already supports "recent failures"
  and "how often has X failed" queries without extra modeling.
- **`mx_lookup_error` (DNS transient) and `mx_mismatch` (DNS resolved, wrong host) stay separate
  kinds** — an admin needs to tell "our DNS resolver is having trouble" apart from "this domain's
  MX genuinely doesn't point here," since the fix differs (nothing to do vs. tell the domain owner).
- **Dashboard shows recent failures, not a poll-based live health board.** This plan makes the
  *already-happening* real-time policy-check outcomes visible after the fact; it does not add a
  proactive scheduled health-check job that re-verifies domains nobody is currently emailing.
  Building a cron-style prober for domains with no incoming traffic is speculative — do it later
  if an admin actually asks "is domain X still broken" for a domain that isn't getting mail.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Backend: record and expose MX failures](./phase-01-backend-mx-failure-logging.md) | Pending |
| 2 | [Frontend: render domain stats + MX failures on Dashboard](./phase-02-dashboard-domain-health.md) | Pending |

## Validation

- `pytest tests/test_policy_daemon.py tests/test_admin_api.py tests/test_api_state.py -q`.
- `npm test -- --run` for whichever test file covers `DashboardTab.vue` (confirm exact filename in
  `frontend/src/tests/` during Phase 2 — no dedicated `DashboardTab.test.ts` was found during
  planning, so this phase likely creates one).
- Manual: send mail to a domain with no matching MX record through the policy daemon path (or
  call `mx_matches`-backed handler directly in a test harness), confirm it shows up in the
  Dashboard's new "recent MX failures" list.
