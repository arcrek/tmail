# Phase 5 — Admin dashboard CrowdSec panel (stretch)

## Context Links
- `src/admin_api.py:397-406` (`/admin/api/dashboard` endpoint, existing `activity_summary()` shape)
- `frontend/src/admin/DashboardTab.vue` (existing dashboard tab to extend)
- `src/api_state.py` (`StateStore.activity_summary`)

## Overview
- Priority: P3 (EXPANSION-scope stretch item — not required for CrowdSec to function; purely
  operator visibility)
- Status: Pending
- Surface CrowdSec's current ban count / recent alerts as a read-only panel on the existing
  admin dashboard, next to the existing sync/activity summary, so an operator doesn't need SSH
  + `cscli` access just to see "is anything being blocked right now."

## Key Insights
- This is explicitly a **stretch item from EXPANSION scope** — skip or defer without blocking
  Phases 1-4 or 6. Flagging this clearly so a future re-scope (e.g. if this plan gets reduced)
  knows exactly what to cut first.
- Read-only. This panel must never let the admin console itself unban/manage IPs — that's
  `cscli`'s job on the host, not a new attack surface added to `admin_api.py`. Keeps scope tight
  (YAGNI: don't build a CrowdSec management UI, just a status view).
- Data source: `cscli decisions list -o json` and `cscli alerts list -o json` run as a
  subprocess from the API server process, OR (cleaner, no subprocess-from-webapp risk) a small
  periodic script (systemd timer, matching the `email_janitor` pattern) that snapshots
  `cscli`'s output into a small JSON file the API server reads — avoids giving the FastAPI
  process itself permission to exec `cscli` (which requires local LAPI/root-adjacent access).
  **Recommend the timer+snapshot-file approach** over in-process `subprocess.run`, for the same
  reason `email_janitor` is a separate process rather than something `api_server.py` shells out
  to.

## Requirements
- Functional: dashboard shows current active-decision count, and the 5 most recent alerts
  (timestamp + scenario name + source IP, no further detail) from CrowdSec.
- Non-functional: never blocks the dashboard endpoint's response if the snapshot file is
  missing/stale (graceful `null`/"CrowdSec data unavailable" instead of a 500).

## Architecture
```
crowdsec LAPI ──cscli decisions/alerts list -o json──> snapshot script (new systemd timer)
                                                                │
                                                                ▼
                                          /var/lib/tmail-policy/crowdsec_snapshot.json
                                                                │
                                          (read-only file access, no subprocess exec
                                           from within api_server.py)
                                                                ▼
                              admin_api.py /admin/api/dashboard reads + merges into response
                                                                │
                                                                ▼
                              DashboardTab.vue renders a new "CrowdSec" card
```

## Related Code Files
- Create: `deploy/crowdsec/crowdsec-snapshot.sh` — runs `cscli decisions list -o json` +
  `cscli alerts list -o json`, writes a small merged JSON to the configured snapshot path.
- Create: `deploy/tmail-crowdsec-snapshot.service` + `deploy/tmail-crowdsec-snapshot.timer` —
  systemd unit pair, same shape as existing `deploy/tmail-janitor.service` /
  `deploy/tmail-janitor.timer`.
- Modify: `src/admin_api.py` — extend the `/admin/api/dashboard` handler (line ~397) to read the
  snapshot file (if present) and include a `crowdsec` key in the response; missing/unreadable
  file → `crowdsec: null`, never an exception.
- Modify: `frontend/src/admin/DashboardTab.vue` — add a card rendering the `crowdsec` field
  (active decisions count + recent alerts list), matching the existing card styling; render
  "CrowdSec data unavailable" state when `null`.
- Modify: `frontend/src/tests/DashboardTab.test.ts` — cover both populated and `null` states.
- Modify: `deploy/install.sh` — install the two new systemd units, enable the timer.

## Implementation Steps
1. `<!-- Red Team Session 1: Finding applied -->` **Resolve the privilege handoff before
   writing anything**: `cscli` needs local-LAPI access, normally root-restricted
   (`/etc/crowdsec/local_api_credentials.yaml`, `0600` root:root). Decide and document how
   `crowdsec-snapshot.sh` gets that access without running as root *and* without making its
   output world-readable — e.g. run the script as root via the systemd unit's `User=root` but
   have it `chown`/write the output file as `tmail-policy:tmail-policy` with mode `0640`
   (matching `state.db`'s ownership), or register a dedicated read-only LAPI/bouncer-style
   credential the script can use as the unprivileged user. Pick one, write it down here — don't
   leave it implicit.
2. Write `crowdsec-snapshot.sh`: `cscli decisions list -o json` + `cscli alerts list -o json
   --limit 5` → merge into one small JSON object → atomic write (tempfile + rename, matching
   this repo's `ConfigStore.update()` write pattern) to the snapshot path, applying Step 1's
   ownership/permission decision as part of the same write.
3. Add `deploy/tmail-crowdsec-snapshot.service` (oneshot, runs the script, `User=`/ownership per
   Step 1) and `deploy/tmail-crowdsec-snapshot.timer` (e.g. every 60s) — mirror
   `deploy/tmail-janitor.service`/`.timer` structure exactly.
4. Add a `crowdsec_snapshot_path` field to `config.json`'s schema if the path needs to be
   configurable, or hardcode a fixed path under `/var/lib/tmail-policy/` consistent with
   `cache_file`/`state_db` conventions — prefer hardcoding unless there's a real need for it to
   vary (YAGNI).
5. Extend `/admin/api/dashboard` in `src/admin_api.py`: read the snapshot file with a try/except
   around JSON parse + file-not-found *and* permission-denied, merge a `crowdsec` key into the
   existing response dict (which already spreads `activity_summary()` — follow that same merge
   pattern). A permission error should be as unsurprising as a missing file — both fall through
   to `crowdsec: null`, and both should be distinguishable in a log line so a real permissions
   bug isn't mistaken for "no bans yet."
6. Extend `DashboardTab.vue` with a new card; extend its test file for both states.
7. Verify end-to-end: with Phase 1-4 CrowdSec already producing decisions, confirm the dashboard
   shows a non-zero count after a synthetic ban test, and confirm `tmail-api`'s own process user
   can actually read the snapshot file with the permissions Step 1 chose (don't just check the
   file exists — check it as the actual unprivileged user).

## Todo List
- [ ] Decide + document the privilege handoff (root-run script, unprivileged-readable output)
- [ ] Write `crowdsec-snapshot.sh` (atomic write pattern, correct ownership/permissions)
- [ ] Add `tmail-crowdsec-snapshot.service`/`.timer` systemd units (`User=`/ownership per Step 1)
- [ ] Decide snapshot path (hardcoded vs config field — prefer hardcoded)
- [ ] Extend `/admin/api/dashboard` response with `crowdsec` key (graceful null on missing
      *and* permission-denied, logged distinctly)
- [ ] Extend `DashboardTab.vue` + its test
- [ ] Wire units into `deploy/install.sh`
- [ ] End-to-end verify as the actual unprivileged `tmail-policy` user, against a real synthetic ban

## Success Criteria
- Dashboard renders a CrowdSec card showing a real decision count after Phase 1-4 produce at
  least one decision.
- Dashboard endpoint never 500s when the snapshot file is absent (test this explicitly —
  fresh install before the timer's first run).
- `npm run test` (DashboardTab.test.ts) and `.venv/bin/pytest` both pass.

## Risk Assessment
- **Risk**: giving `api_server.py` direct `cscli`/LAPI access would widen its privilege
  footprint unnecessarily. **Mitigation**: the snapshot-file indirection (Key Insights) — the
  web process only ever reads a plain JSON file it doesn't control the generation of.
- **Risk**: stale snapshot (timer stopped) silently shown as current. **Mitigation**: include the
  snapshot's own generation timestamp in the response; `DashboardTab.vue` can flag data older
  than e.g. 5 minutes as stale, though a hard freshness check is a nice-to-have, not required
  for this phase's Success Criteria.

## Security Considerations
- Snapshot file contains IP addresses and scenario names only — no tokens, no secrets. Still,
  keep it under the same directory permissions as `state.db`/`domains.json` (owned by the
  `tmail-policy` service user, not world-readable).
- `<!-- Red Team Session 1: Finding applied -->` Do not resolve a permission-denied error the
  expedient way (`chmod 644`/world-readable) — that exposes CrowdSec alert data (banned IPs,
  scenario names) to any local unprivileged user on the host. Fix the ownership at the source
  (Implementation Step 1), not by widening the file's permissions.
- `/admin/api/dashboard` is already session-authenticated (`_session` dependency) — this phase
  adds no new auth surface, just more data behind the existing gate.

## Next Steps
- None — this is a leaf/stretch phase. Can be dropped entirely without affecting Phases 1, 2, 3,
  4, or 6.
