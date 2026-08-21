# Phase 2 — App-layer security event logging

## Context Links
- `src/api_server.py:805-822` — existing `security` middleware (rate limiter enforcement point)
- `src/admin_api.py:209-214` — `/admin/login` (the endpoint whose failures matter most)
- `research/researcher-02-app-layer-cloudflare.md` §1 (parser expects a stable, greppable line
  format)

## Overview
- Priority: P1 (Phase 3's custom parser has nothing to parse without this)
- Status: Pending
- Add one structured, machine-parseable log line per security-relevant response — reusing the
  **existing** `security` middleware in `src/api_server.py` rather than adding logging calls
  scattered across route handlers. The middleware already sees every request to the 5 watched
  paths and (after `call_next`) knows the final status code — that's the single hook point
  needed.

## Key Insights
- **No new route-handler changes needed.** `admin_api.py`'s `/admin/login` returning a 401
  already flows back through `api_server.py`'s middleware `call_next` — the middleware can log
  from there without `admin_api.py` knowing CrowdSec exists at all. Keeps the security-boundary
  code (`admin_api.py`) free of infra concerns (DRY/YAGNI: don't duplicate an IP-tagging log
  call in every route).
- CrowdSec's parser stage wants a stable line format it can grok/JSON-parse — pick one and keep
  it boring. JSON-lines is simplest for the parser (Phase 3 uses a JSON extraction node instead
  of grok).
- This app currently has no structured access log at all — `logging.basicConfig` isn't even
  called in `api_server.py` for the app logger (only `policy_daemon.py` configures logging).
  Must add that too, or lines never reach journald with a queryable unit name.
- Log to journald via the process's own stdout/stderr (systemd captures it under
  `tmail-api.service`'s journal unit automatically) — no new log file, no log rotation to own,
  consistent with how `deploy/tmail-api.service` already runs under systemd.
- <!-- Red Team Session 1: Finding 7 applied --> **journald rate-limits log volume per unit by
  default** (`RateLimitIntervalSec`/`RateLimitBurst`, on for every systemd unit including
  `tmail-api.service`). A real brute-force/probe burst — precisely what Phase 3's scenarios
  exist to catch — is also precisely the kind of burst most likely to trip that default limit,
  silently dropping log lines (just a terse "Suppressed X messages" note) before CrowdSec's
  agent ever sees them. Detection would then fail silently under exactly the load it's meant to
  catch. Must disable/raise this for `tmail-api.service` and verify with a scripted burst test
  (not just Phase 2 Step 4's single manual line).
- <!-- Red Team Session 1: Finding 1 applied --> The rate limiter's 429 response is returned
  from inside `if not limiter.allow(key): ... return response`, **before** `call_next` is ever
  called (`src/api_server.py:805-822`). A log-emission point placed only after `call_next`
  structurally never sees this branch — it would only ever log 401s, never 429s, and Phase 3's
  `tmail-cross-path-probe` scenario (built entirely on 429-derived `rate_limited` events) would
  have zero input to fire on. Two separate emission points are required (see Related Code
  Files).

## Requirements
- Functional: every response with status `429` or `401` on `/accounts`, `/token`, `/unlock`,
  `/admin/login`, `/admin/api/login` produces one JSON log line containing at minimum:
  `client_ip`, `path`, `status`, `timestamp` (ISO 8601 UTC).
- Non-functional: zero added latency beyond a single `logger.info()` call; no PII beyond IP/path
  (no address, no token, no password) ever logged.

## Architecture
<!-- Red Team Session 1: Finding 1 applied — the rate limiter's 429 never reaches call_next -->
```
request ──> security middleware
                  │
                  ├─ watched path? compute client_ip unconditionally
                  │
                  ├─ limiter.allow(key) == False?
                  │     └─ log (429 case) ──────────────┐
                  │        return 429 (call_next NEVER runs for this branch —
                  │        this is why the log call must live HERE too, not only
                  │        after call_next; see Key Insights)             │
                  │                                                       │
                  └─ call_next() ──> route handler                        │
                          │                                               │
                          ▼                                               │
                   response (status known)                                │
                          │                                               │
                   status == 401 AND path in watched set?                 │
                          │ yes                                           │
                          └─ log (401 case) ─────────────────────────────>│
                                                                           ▼
                                                          journald (tmail-api.service unit)
                                                                           │
                                                     (Phase 3: journalctl_filter reads this)
```

## Related Code Files
- Modify: `src/api_server.py`
  - Add a module-level `_security_logger = logging.getLogger("tmail.security")` (separate
    logger name so it can be filtered/leveled independently of the general app logger).
  - In `create_app()`, ensure `logging.basicConfig(level=logging.INFO)` runs (or configure a
    handler) so lines actually emit — check current state first; don't double-configure if
    `policy_daemon`-style setup is already shared.
  - <!-- Red Team Session 1: Finding 1 applied — 429 never reaches call_next --> In the
    `security` middleware, add the log emission at **two** points, not one: (a) inside the
    `if not limiter.allow(key):` branch, immediately before its `return response` — this is the
    *only* place a 429 is ever produced, since that branch returns without ever calling
    `call_next` (verified against the actual middleware at `src/api_server.py:805-822`); and
    (b) after `response = await call_next(request)`, for the `401` case, gated on
    `request.url.path in _SECURITY_LOG_PATHS and response.status_code == 401`. Do not gate
    either emission point on `status_code in (401, 429)` as a single check after `call_next` —
    that was the bug: it structurally can never see a 429.
  - Validate `client_ip` is a syntactically well-formed IP address (`ipaddress.ip_address()`)
    before logging it; if invalid, log with `client_ip: "invalid"` rather than the raw
    attacker-controlled string, so a malformed `CF-Connecting-IP` value can't ride further down
    the parse→decision→bounce pipeline as if it were a real address.
- Create: `tests/test_security_logging.py` — asserts the log line shape, that a 429 from the
  rate-limiter branch actually produces a line (regression test for Finding 1), and that no PII
  beyond IP/path/status leaks in.
- Modify: `deploy/tmail-api.service` — add `LogRateLimitIntervalSec=0` under `[Service]` (see
  Key Insights: journald's default per-unit rate limit can silently drop exactly the log burst
  a real attack produces).
- No changes to `src/admin_api.py`, `src/policy_daemon.py`, or `src/api_state.py` in this phase.

## Implementation Steps
1. Add `_security_logger = logging.getLogger("tmail.security")` near the top of
   `src/api_server.py` (alongside other module-level constants).
2. Restructure the `security` middleware so `client_ip = _client_ip(request)` is computed once,
   unconditionally, for any watched path (currently only computed inside the rate-limit
   short-circuit branch) — reuse it both for the existing rate-limit key and the new logging
   call.
3. `<!-- Red Team Session 1: Finding 1 applied -->` Add a helper `_log_security_event(path,
   client_ip, status)` (validates `client_ip` via `ipaddress.ip_address()`, falling back to
   `"invalid"`, then emits the JSON line) and call it from **both**:
   - inside `if not limiter.allow(key):`, right before its `return response` — this is the only
     path a 429 ever takes;
   - after `response = await call_next(request)`, gated on
     `request.url.path in _SECURITY_LOG_PATHS and response.status_code == 401`.

   `_SECURITY_LOG_PATHS` = the same frozenset already used for the rate-limit path check —
   extract it to a module constant instead of the inline set literal, so both checks reference
   one source of truth.
4. Confirm journald actually captures these lines under `tmail-api.service` in a local run
   (`journalctl -u tmail-api -f` during a manual 401 **and** 429 test — test both, not just one,
   given Finding 1) before considering this phase done — printing to stdout isn't enough proof
   by itself.
5. `<!-- Red Team Session 1: Finding 7 applied -->` Add `LogRateLimitIntervalSec=0` to
   `deploy/tmail-api.service`'s `[Service]` section. Verify with a scripted burst (e.g. 50 rapid
   401s in a couple seconds) that all 50 lines reach `journalctl -u tmail-api`, not a suppressed
   subset — a single manual line (Step 4) doesn't prove the rate limit won't bite under real
   attack volume.
6. Write `tests/test_security_logging.py`: hit `/admin/login` with a wrong password (401 case),
   hit `/accounts` 11 times rapidly (429 case — the regression test for Finding 1), capture logs
   via `caplog`, assert one JSON line per triggering event (both the 401 and the 429) with the
   expected keys and no extra fields (guard against accidental PII leakage, e.g. a stray
   `password` key), and assert a malformed `client_ip` never reaches the log as a raw string.

## Todo List
- [ ] Extract `_SECURITY_LOG_PATHS` constant, reuse in both rate-limit and logging checks
- [ ] Compute `client_ip` unconditionally in the middleware (not just inside rate-limit branch)
- [ ] Add `_security_logger` + log emission at **both** the early-429-return point and the
      post-`call_next` 401 point (not a single check after `call_next`)
- [ ] Validate `client_ip` as a well-formed IP before logging (`ipaddress.ip_address()`)
- [ ] Confirm `logging` is configured to actually emit (basicConfig or handler)
- [ ] Add `LogRateLimitIntervalSec=0` to `deploy/tmail-api.service`
- [ ] Manual check: `journalctl -u tmail-api -f` shows a line during both a 401 test and a 429 test
- [ ] Scripted burst test proves journald doesn't suppress lines under rapid-fire load
- [ ] `tests/test_security_logging.py` — 401 + 429 shape, no-PII, malformed-IP assertions

## Success Criteria
- `pytest tests/test_security_logging.py -q` passes, including a 429-triggering test case
  (regression test for Finding 1 — the original bug this test would have caught).
- Full suite (`.venv/bin/pytest`) has no regressions — especially existing rate-limiter tests
  in `tests/test_public_api.py` (`test_fixed_window_prunes_expired_keys_and_separates_paths`,
  `test_security_headers_and_token_rate_limit`).
- Manual: a wrong-password `/admin/login` POST produces exactly one `tmail.security` JSON line
  visible via `journalctl -u tmail-api`; a rate-limit-triggering 11th `/accounts` request in a
  60s window produces one too.
- A 50-request rapid burst against `/admin/login` produces 50 corresponding log lines in
  `journalctl -u tmail-api` — none suppressed by journald's default rate limit.

## Risk Assessment
- **Risk**: logging a raw client IP is itself a (mild) PII concern under some privacy regimes.
  **Mitigation**: this is the same IP already used for rate-limiting and already present in any
  reverse-proxy/Cloudflare access log — no new category of data, just a second consumer of it.
  Document this in the phase's Security Considerations for anyone auditing later.
- **Risk**: forgetting to guard against double `logging.basicConfig()` calls if `api_server.py`
  and `policy_daemon.py` ever run in the same process during tests. **Mitigation**: check
  current logging setup in both files before adding a second `basicConfig` call; prefer
  attaching a handler to the specific `tmail.security` logger if global config already exists.

## Security Considerations
- Log payload is strictly `client_ip`/`path`/`status`/`timestamp` — never the submitted
  password, token, or address. Enforce this via the test's "no extra fields" assertion so a
  future edit can't accidentally widen the payload.
- This log is a detection input, not an authorization control — it doesn't change any existing
  auth/session logic in `admin_api.py`.

## Next Steps
- Phase 3 writes the CrowdSec parser/scenario that consumes exactly this JSON line shape via
  `journalctl_filter: _SYSTEMD_UNIT=tmail-api.service`.
