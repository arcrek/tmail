# Phase 1 — Backend: /messages/stream signal endpoint

## Overview

**Priority:** P1
**Status:** Done
**Estimate:** 2.5h

## Related code files

- Modify: `src/api_server.py`
  - Add `from starlette.concurrency import run_in_threadpool` and `import asyncio` (if not
    already imported).
  - Add `@app.get("/messages/stream")`, placed near the existing `/messages` route (~line 607),
    reusing `bearer_address`/`bearer_elevated` deps and `mail_runtime`/`mail_account_id` exactly
    like `messages()` does.
  - Register `429`/`413` on this route the same way `/messages` inherits `_ERROR_RESPONSES` —
    this route is bearer-authenticated, not IP-rate-limited (it's a single long-lived connection
    per session, not a burst-able write), so no change to the `security` middleware path set.
- Add: `tests/test_public_api.py` — new tests for the stream endpoint.
- Modify: `docker/nginx.conf.template` — the `/messages/stream` path already matches the existing
  `messages(?:/|$)` proxy location, but that location has no `proxy_buffering off;`. Nginx's
  default buffering holds the response until the buffer fills or upstream closes, which defeats
  the whole point of a push stream behind the Docker Compose deploy path. This is a real,
  confirmed gap — not a maybe.

## Implementation steps

1. Implement the endpoint as an async generator:
   ```python
   @app.get("/messages/stream", responses=_ERROR_RESPONSES)
   async def messages_stream(
       request: Request, address: str = Depends(bearer_address),
       elevated: bool = Depends(bearer_elevated),
   ):
       config, jmap = mail_runtime(request)
       account_id = mail_account_id(config, jmap)
       interval = int(request.app.state.state_store.get_settings()["fetch_seconds"])

       async def events():
           last_id = None
           elapsed = 0.0
           heartbeat_every = 15
           while True:
               if await request.is_disconnected():
                   return
               try:
                   _total, values = await run_in_threadpool(
                       jmap.list_messages, account_id, address, 1, 0,
                   )
               except Exception:
                   values = []  # transient JMAP error: skip this tick, try again next
               newest = values[0]["id"] if values else None
               if newest != last_id:
                   last_id = newest
                   yield b"event: update\ndata: \n\n"
                   elapsed = 0.0
               else:
                   elapsed += interval
                   if elapsed >= heartbeat_every:
                       yield b": keep-alive\n\n"
                       elapsed = 0.0
               await asyncio.sleep(max(1, interval))

       return StreamingResponse(events(), media_type="text/event-stream", headers={
           "Cache-Control": "no-cache", "X-Accel-Buffering": "no",
       })
   ```
   `X-Accel-Buffering: no` is the app-side half of disabling nginx buffering for this response;
   it needs the matching nginx-side directive (step below) to fully take effect.
2. First tick should not always emit `update` — only skip the initial-connect signal if
   `last_id` starts `None` and there are zero messages; if the address already has mail on
   connect, do **not** treat that as "new" (the client already rendered current state via the
   normal page load / `/messages` call before opening the stream). Track this with a
   `first_tick = True` guard that primes `last_id` without yielding on tick 1.
3. Ownership/ ownership-adjacent filtering: this route only needs the newest message's raw JMAP
   `id`, not `_message_belongs_to_address` filtering — `bearer_address` already scopes `address`
   to the token's own address, and `jmap.list_messages(account_id, address, ...)` is already
   address-scoped upstream (same call `/messages` makes). No cross-address leak risk.
4. Add tests to `tests/test_public_api.py`:
   - `test_messages_stream_requires_bearer_token` — no/invalid token → 401, matching `/messages`.
   - `test_messages_stream_emits_update_on_new_message` — monkeypatch/fake JMAP client so
     `list_messages` returns a different newest id on the second call; drive the async generator
     directly (or via `TestClient` with a short-lived connection) and assert an `event: update`
     frame appears; first tick before any change must **not** emit `update`.
   - `test_messages_stream_stays_silent_when_unchanged` — same newest id every tick → no `update`
     frames within N ticks (heartbeat comment lines are fine/expected).
   - `test_messages_stream_stops_on_disconnect` — simulate `request.is_disconnected()` returning
     `True` and assert the generator returns instead of looping forever (bound the test with a
     timeout so an actual infinite loop fails fast, not hangs CI).

## Success criteria

- `/messages/stream` requires the same bearer auth as `/messages`.
- Emits `event: update` only when the newest message id actually changes, never on the initial
  tick for an address that already has mail.
- Never busy-loops: sleeps `fetch_seconds` between polls (server-configurable via existing admin
  setting, no new one).
- Generator exits promptly when the client disconnects — no orphaned polling loops accumulating
  across reconnects.

## Todo

- [x] Add `/messages/stream` endpoint with threadpool-wrapped JMAP polling.
- [x] Guard the first tick so an address with existing mail doesn't fire a spurious `update`.
- [x] Add heartbeat comment lines for idle connections.
- [x] Add `proxy_buffering off;` (and `chunked_transfer_encoding on;` if not already implied) to
      the `messages(?:/|$)` location in `docker/nginx.conf.template`, or split `/messages/stream`
      into its own `location` block with buffering off so the other proxied routes keep normal
      buffering.
- [x] Add the four tests above.
- [x] Run `pytest tests/test_public_api.py -q`.
