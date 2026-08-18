# Phase 1: Trust CF-Connecting-IP for rate-limit keys

## Context Links

- Plan: [plan.md](./plan.md)
- Middleware + limiter: `src/api_server.py:207-226` (`_FixedWindowLimiter`), `src/api_server.py:773-787`
  (`security` middleware, current `client_ip = request.client.host if request.client else "unknown"`)
- Existing rate-limit tests: `tests/test_public_api.py:672-758`
- Production install docs: `README.md` "Production installation" section (`README.md:67-85`)

## Overview

- **Priority:** P2
- **Status:** Pending
- Read `CF-Connecting-IP` for the rate limiter's client-IP key so a Cloudflare Tunnel deployment
  gets real per-visitor buckets instead of one shared bucket for the whole tunnel.

## Key Insights

- `request.client.host` is the TCP peer, not the real visitor when any reverse proxy sits in front
  (Cloudflare Tunnel's `cloudflared` connects to the app over localhost). Confirmed no existing code
  anywhere in `src/` reads any proxy header (`grep -rn "X-Forwarded-For\|CF-Connecting-IP" src/`
  returns nothing before this phase).
- **Accepted risk (explicit user decision, not a bug):** trusting this header unconditionally means
  any client that can reach the app directly (bypassing Cloudflare) can set an arbitrary
  `CF-Connecting-IP` per request and get a fresh rate-limit bucket every time — a full bypass on
  `/accounts`, `/token`, `/unlock`, `/admin/login`, `/admin/api/login`. Safe only when the app has no
  ingress other than the tunnel. This phase's job is to implement the trust *and* make that
  assumption loud (code comment, README, startup log), not to gate it — a config flag or
  trusted-proxy-IP allowlist was explicitly descoped in `plan.md`.

## Requirements

### Functional
- Rate-limit bucket key uses `CF-Connecting-IP` when present, falling back to `request.client.host`
  (today's behavior) when absent — so local dev / non-Cloudflare deployments are unaffected.
- Applies to all five currently-limited paths (`/accounts`, `/token`, `/unlock`, `/admin/login`,
  `/admin/api/login`) — this is a client-IP-extraction fix, not path-specific.

### Non-functional
- No new config field, no new dependency (`CF-Connecting-IP` is a plain header read).
- One-time `logger.warning(...)` at app startup stating the trust assumption, so it shows up in
  service logs / `journalctl` for anyone who deploys this without a tunnel and wonders why rate
  limits seem easy to bypass.

## Architecture

### `src/api_server.py`

Add a small helper near `_FixedWindowLimiter` (around line 226):

```python
def _client_ip(request: Request) -> str:
    """Client IP for rate-limit bucketing.

    Trusts Cloudflare's CF-Connecting-IP header unconditionally (no allowlist/config
    gate) — see plan.md "Design decisions" for the accepted trade-off. Safe only when
    this app has no ingress other than a Cloudflare Tunnel/proxy that sets this header;
    otherwise a client can spoof a fresh value per request and bypass rate limiting
    entirely on every limited path.
    """
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()
    return request.client.host if request.client else "unknown"
```

Replace the inline extraction in the `security` middleware (`src/api_server.py:778`):

```python
client_ip = request.client.host if request.client else "unknown"
```
with:
```python
client_ip = _client_ip(request)
```

At app creation (near `create_app`'s other one-time setup, `src/api_server.py:~760-773`, right after
`limiter = _FixedWindowLimiter(limit=10, seconds=60)`), add:

```python
logging.getLogger(__name__).warning(
    "Rate limiter trusts the CF-Connecting-IP header unconditionally for client-IP "
    "bucketing; ensure this app has no ingress other than a trusted Cloudflare Tunnel/proxy."
)
```

(Use whatever module-level logger pattern already exists in `api_server.py`, if any — check for an
existing `logger = logging.getLogger(...)` before adding a second one.)

### `README.md`

Append a short subsection under "Production installation" (after the existing content, `README.md:85`
area):

```markdown
### Running behind Cloudflare Tunnel

The rate limiter trusts the `CF-Connecting-IP` header unconditionally to key its per-visitor
buckets (`src/api_server.py`'s `_client_ip`). This is correct and safe **only if the app has no
ingress other than the tunnel** — no public-facing port, no other reverse proxy in front. If this
app is ever exposed directly, that header becomes spoofable per-request and the rate limiter on
`/accounts`, `/token`, `/unlock`, `/admin/login`, and `/admin/api/login` can be bypassed entirely.
```

## Related Code Files

**Modify:**
- `src/api_server.py` (`_client_ip` helper, middleware wiring, startup log line)
- `README.md` (Cloudflare Tunnel note)

**Test (modify):**
- `tests/test_public_api.py`

## Implementation Steps

1. Add `_client_ip(request)` helper near `_FixedWindowLimiter` in `src/api_server.py`.
2. Replace the middleware's inline `client_ip = ...` line with a call to `_client_ip(request)`.
3. Add the one-time startup warning log (check for an existing logger first; reuse it).
4. Add the README subsection.
5. Extend `tests/test_public_api.py`:
   - New test: two requests to the same limited path with **different** `CF-Connecting-IP` header
     values get independent 10-req/60s budgets (simulating two visitors behind one Cloudflare Tunnel
     peer).
   - New test: request **without** `CF-Connecting-IP` falls back to `request.client.host` — existing
     `test_security_headers_and_token_rate_limit` and `test_accounts_path_is_rate_limited` must keep
     passing unmodified (they send no such header today, so behavior must be identical).
6. Run `.venv/bin/pytest tests/test_public_api.py -q`.

## Todo List

- [ ] `_client_ip` helper added, used by middleware
- [ ] Startup warning log present
- [ ] README Cloudflare Tunnel subsection added
- [ ] New CF-Connecting-IP tests pass; all pre-existing rate-limit tests pass unmodified
- [ ] `.venv/bin/pytest tests/test_public_api.py -q` green

## Success Criteria

- Two simulated visitors with different `CF-Connecting-IP` values, hitting the same limited path
  through what looks like one TCP peer, get independent rate-limit budgets.
- No `CF-Connecting-IP` header present → identical behavior to before this phase (verified by
  existing tests passing unmodified).
- Full test suite (`.venv/bin/pytest`) green, no regressions outside `test_public_api.py`.

## Risk Assessment

- **Header spoofing when not behind Cloudflare** — the accepted, documented trade-off from
  `plan.md`. Mitigated only by documentation (code comment, README, startup log), not by code. Do
  not attempt to silently add a config gate here — that re-opens a design decision the user already
  made explicitly for this plan; if it needs revisiting, that's a new plan.
- **Header format** — `CF-Connecting-IP` is a single IP value (not a comma-separated hop chain like
  `X-Forwarded-For`), so no chain-parsing/depth logic is needed. If a malformed/empty header is sent,
  fall back to `request.client.host` (handled by the `cf_ip.strip()` truthiness check).

## Security Considerations

- This phase's entire risk surface is the accepted spoofing trade-off above. No other security
  change: the limiter's algorithm, limits, and the four other paths' keying are untouched.
- The startup log is a operability aid, not a control — it doesn't prevent misconfiguration, only
  surfaces it in logs for whoever operates the deployment.

## Next Steps

- Phase 2: elevated-access bucket for `/token`, built on top of `_client_ip` from this phase (the
  fallback path for non-elevated `/token` requests still goes through it).
