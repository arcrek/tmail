---
title: "Trust CF-Connecting-IP and isolate elevated /token rate limit"
description: "Read Cloudflare's CF-Connecting-IP header for the rate limiter's client-IP key, and give elevated (unlocked) /token requests their own quota bucket separate from the shared per-IP budget."
status: pending
priority: P2
effort: 2h
issue: null
branch: main
tags: [backend, security, api]
blockedBy: []
blocks: []
created: 2026-08-18
---

# Trust CF-Connecting-IP and isolate elevated /token rate limit

## Overview

Two known-limitations flagged by Codex review during `plans/260818-0423-bulk-address-generator` (PR #13, merged):

1. `src/api_server.py`'s rate limiter keys every bucket by `request.client.host` — the raw TCP peer.
   Deployed behind a Cloudflare Tunnel, that peer is always `cloudflared` (effectively `127.0.0.1`),
   so **every visitor collapses into one shared rate-limit bucket per path**. One visitor's bulk-generate
   session can 429 every other visitor for the rest of that 60s window.
2. Even direct-IP, a visitor who unlocked elevated access (`accessToken`) shares their `/token` budget
   with anonymous traffic from the same IP — their own prior activity (or another visitor behind the
   same NAT/IP) can eat into the 10 req/60s they need to open a bulk-generated batch.

This plan closes both gaps: (1) trust Cloudflare's `CF-Connecting-IP` header for the rate limiter's
client-IP key, and (2) give `/token` requests carrying a valid elevated-access bearer token their own
rate-limit bucket, keyed by the token hash instead of IP.

## Design decisions (resolved via scope challenge)

- **Scope:** HOLD — exactly these two changes, nothing broader (no generic trusted-proxy framework,
  no other paths' bucketing changed).
- **CF-Connecting-IP trust:** unconditional — no config flag gating it. Trade-off accepted explicitly:
  if this app is ever reachable by any path other than through Cloudflare, a client can spoof
  `CF-Connecting-IP` with an arbitrary/random value per request and bypass the rate limiter entirely
  on **all five** limited paths (`/accounts`, `/token`, `/unlock`, `/admin/login`, `/admin/api/login`),
  not just `/token`. This is safe only when the deployment guarantees the app has no other ingress
  (Cloudflare Tunnel's `cloudflared` makes an outbound-only connection; the origin needs no listening
  public port). Documented loudly in code, README, and a startup log line — see Phase 1's Security
  Considerations. **A future config-gated or trusted-proxy-IP-allowlist version is an explicit
  non-goal here** — revisit only if this app is ever deployed with a public-facing port alongside
  the tunnel.
- **`/token` limiter fix:** split into a separate bucket for elevated requests, not a blanket
  numeric increase. Anonymous `/token` traffic keeps the existing 10 req/60s per-IP budget
  unchanged; a request carrying a valid elevated-access bearer token gets its own 10 req/60s budget
  keyed by the token's hash, independent of IP and of anonymous traffic on that path.
- **Not in scope:** `/accounts`, `/unlock`, `/admin/login`, `/admin/api/login` keep plain per-IP
  keying — only `/token` gets the elevation-aware split (that's the path the bulk-generate feature
  actually hammers).

## Cross-Plan Dependencies

None. Scanned `plans/` — only `260813-0827-toast-notifications` is non-terminal (`pending`), and it's
an unrelated frontend toast-layer refactor with no file overlap. `260814-1811-account-creation-rate-limit`
(the plan that built `_FixedWindowLimiter`) is `done`; this plan extends its output but isn't blocked
by it.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Trust CF-Connecting-IP for rate-limit keys](./phase-01-cf-connecting-ip.md) | Pending |
| 2 | [Elevated-access bucket for /token](./phase-02-elevated-token-bucket.md) | Pending |

## Dependencies

- Existing `_FixedWindowLimiter` and `security` middleware (`src/api_server.py:207-226,775-787`) —
  extended, not replaced.
- Existing `elevated_access` dependency (`src/api_server.py:294-301`) — refactored to share its
  token-hash-lookup logic with the middleware, behavior-preserving for routes that already use it.
- `StateStore.get_access_session` (`src/api_state.py:157-165`) — read-only, called from middleware
  now in addition to the route dependency; no schema/behavior change.
