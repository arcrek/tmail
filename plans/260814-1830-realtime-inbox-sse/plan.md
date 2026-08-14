---
title: "Realtime inbox via SSE"
description: "Replace setInterval polling in InboxView with a server-push signal channel so new mail shows up immediately, including while the tab is backgrounded."
status: done
priority: P1
effort: 5h
issue: null
branch: main
tags: [feature, backend, frontend, api]
blockedBy: []
blocks: []
created: 2026-08-14
---

# Realtime inbox via SSE

## Overview

`InboxView.vue` polls `GET /messages` on a `setInterval(props.fetchSeconds)` and — critically —
**stops polling entirely while the tab is hidden** (`stopPolling()` on `visibilitychange`). The
desktop `Notification` code in the same file already fires on new mail, but only ever runs while
the tab is foregrounded, because polling is what feeds it. Users who switch tabs get nothing until
they come back and the interval restarts. This plan adds a push signal so new mail is detected
immediately, in the foreground or background.

## Scope challenge

- Existing code to reuse: `GET /messages` (full serialization, pagination, ownership/blocked-domain
  filtering already correct), `bearer_address`/`bearer_elevated` deps, `mail_runtime`/
  `mail_account_id` helpers, `jmap.list_messages`, `notifyNew()`/`refresh()` in `InboxView.vue`,
  `settings.fetch_seconds` (already admin-configurable, reused as the server poll cadence — no new
  setting).
- Minimum change: one new signal-only SSE endpoint (`GET /messages/stream`) that does **not**
  re-implement message serialization — it just tells the client "something changed," and the
  client calls the existing `refresh()` → `api.messages()` path. This avoids duplicating the
  ownership/blocked-domain/pagination logic in `/messages`.
- Complexity: 2 files touched on the backend (`src/api_server.py`, new test), 1 file on the
  frontend (`InboxView.vue`) + 1 test. No new dependency — `StreamingResponse` and `EventSource`-
  equivalent are both already available (native `fetch` + `ReadableStream`, since `EventSource`
  cannot set the `Authorization` header this app requires).

## Decisions

- **Signal channel, not a data channel.** `/messages/stream` emits `event: update` with no
  payload when the newest message for that address changes; it never serializes messages itself.
  Keeps `/messages` as the single source of truth for message shape, matching existing DRY
  practice in this codebase (e.g. `_summary()` is called from exactly one place).
- **Native `EventSource` is not usable** — it cannot send the `Authorization: Bearer <token>`
  header this API requires on every route, and the app already avoids cookies for address
  sessions. The client reads the stream with `fetch()` + a `ReadableStreamDefaultReader`, parsing
  bare `event:`/`data:` SSE framing by hand (~15 lines, no library).
- **Server poll cadence reuses `settings.fetch_seconds`** (default 20s) rather than adding a new
  admin setting — one poll knob, not two, per YAGNI. The endpoint checks only the newest message's
  `id` via `jmap.list_messages(account_id, address, limit=1, position=0)` each tick — cheap, no
  full-page fetch.
- **Sync JMAP client stays sync** — `jmap_client.py` is `httpx`-sync throughout; the streaming
  generator calls it via `starlette.concurrency.run_in_threadpool` each tick so the event loop
  isn't blocked. No async rewrite of `JmapClient`.
- **Polling stays as an automatic fallback**, not deleted. `InboxView.vue` opens the stream on
  mount; if it errors or a proxy buffers/kills it, `startPolling()` (existing code, unchanged)
  takes over. This also covers `EventSource`-hostile networks without a feature-detect branch.
- **Heartbeat comment (`: keep-alive\n\n`) every 15s** so intermediary proxies/load balancers don't
  time out the idle connection; matches common SSE practice, adds no new dependency.
- **No new concurrency cap.** Every open inbox tab holds one server-side poll loop. Given this
  service's expected scale (single small mail server, not a multi-tenant SaaS), this is an
  accepted tradeoff, not solved here — flag as a followup if a later admin report shows JMAP load
  from many idle streams.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Backend: /messages/stream signal endpoint](./phase-01-backend-sse-endpoint.md) | Done |
| 2 | [Frontend: consume the stream, keep polling as fallback](./phase-02-frontend-stream-client.md) | Done |

## Validation

- Backend: new pytest covering — emits `update` on a new message arriving; stays silent when
  nothing changes; closes cleanly on `request.is_disconnected()`; rejects without a valid bearer
  token same as `/messages`.
- Frontend: new vitest covering — `refresh()` is called on `update` event; falls back to
  `startPolling()` if the stream fetch rejects or the response is not `ok`; stream is closed on
  unmount (no leaked reader/interval).
- Manual: open two browser tabs on the same address, background one, send a test mail via
  `/admin/api/test-mail` — backgrounded tab's desktop notification still fires (this is the bug
  this plan fixes; today it does not).
