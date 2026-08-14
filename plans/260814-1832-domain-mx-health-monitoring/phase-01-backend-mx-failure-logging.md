# Phase 1 — Backend: record and expose MX failures

## Overview

**Priority:** P1
**Status:** Pending
**Estimate:** 1.5h

## Related code files

- Modify: `src/policy_daemon.py` — the `else` branch (MX mismatch, ~line 76) and the
  `except MxLookupError` branch (~line 82).
- Modify: `src/api_state.py` — extend `activity_summary()`.
- Modify: `tests/test_policy_daemon.py`, `tests/test_api_state.py`.

## Implementation steps

1. In `policy_daemon.py`, mirror the existing `domain_provisioned` try/except exactly (metric
   write failures must never break the Postfix response):
   ```python
   else:
       logger.debug("MX mismatch, rejecting: %s", domain)
       try:
           _state.record_event("mx_mismatch", domain)
       except Exception as exc:
           logger.warning("Metric write failed for %s: %s", domain, exc)
       self.wfile.write(b"action=REJECT\n\n")
   ...
   except MxLookupError as exc:
       logger.warning("DNS transient error for %s: %s", domain, exc)
       try:
           _state.record_event("mx_lookup_error", domain, detail=str(exc))
       except Exception as inner:
           logger.warning("Metric write failed for %s: %s", domain, inner)
       self.wfile.write(b"action=DEFER_IF_PERMIT DNS lookup failed, try again later\n\n")
   ```
2. In `api_state.py`, extend `activity_summary()` to also return recent MX failures — reuse the
   same query shape as `recent_domains`:
   ```python
   recent_mx_failures = [
       dict(row)
       for row in conn.execute(
           "SELECT kind, domain, detail, created_at FROM activity "
           "WHERE kind IN ('mx_mismatch', 'mx_lookup_error') ORDER BY id DESC LIMIT 10"
       )
   ]
   ```
   Add `"recentMxFailures": recent_mx_failures` to the returned dict. Do not add
   `mxFailuresToday`/`mxFailuresSevenDays` counters unless Phase 2's UI actually wants them —
   check the phase-02 design before adding fields nothing renders (matches existing YAGNI —
   `record_sync`/`sync_history` in this same file only expose what's actually consumed).
3. Update `tests/test_policy_daemon.py`:
   - `test_unknown_mx_mismatch_no_provision` (existing) — add assertion:
     `state.record_event.assert_called_once_with("mx_mismatch", "wrongmx.com")`.
   - Add a new test for the `MxLookupError` path recording `mx_lookup_error` with the exception
     string as `detail` (there's likely already a test exercising `MxLookupError` — extend it
     rather than duplicating the handler setup; check for one before adding a new one).
   - Add a test confirming a `record_event` exception (metric-write failure) doesn't propagate
     and the Postfix response is still written — mirrors the intent of the existing provisioned
     path's try/except, even if no such test currently exists for it (check first).
4. Update `tests/test_api_state.py` — extend the `activity_summary()` test with `mx_mismatch`/
   `mx_lookup_error` events and assert `recentMxFailures` returns them newest-first, capped at 10.

## Success criteria

- Every MX mismatch and every DNS lookup error the policy daemon sees is recorded via the
  existing `activity` event log, without changing the Postfix response behavior in any case.
- A metric-write failure (state DB unavailable) never blocks or alters the Postfix policy
  response — matches the existing `domain_provisioned` guarantee exactly.
- `activity_summary()` returns the last 10 MX failures (both kinds combined, newest first).

## Todo

- [ ] Record `mx_mismatch` in the MX-mismatch branch.
- [ ] Record `mx_lookup_error` (with `detail=str(exc)`) in the `MxLookupError` branch.
- [ ] Wrap both in try/except matching the existing `domain_provisioned` pattern.
- [ ] Extend `activity_summary()` with `recentMxFailures`.
- [ ] Extend/add the tests above.
- [ ] Run `pytest tests/test_policy_daemon.py tests/test_api_state.py -q`.
