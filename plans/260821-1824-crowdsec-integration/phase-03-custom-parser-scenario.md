# Phase 3 — Custom parser/scenario for tmail app abuse

## Context Links
- `research/researcher-02-app-layer-cloudflare.md` §1 (parser/scenario skeletons)
- `phase-02-app-security-logging.md` (produces the log line this phase consumes)
- `phase-01-core-postfix-sshd.md` (this phase registers against the same local LAPI)

## Overview
- Priority: P2
- Status: Pending
- Write a local (non-hub) CrowdSec parser + scenario that reads the `tmail.security` JSON log
  lines (Phase 2) via journald and produces LAPI decisions for patterns the in-app rate limiter
  can't see: sustained low-and-slow admin-login guessing, or correlated abuse across multiple
  watched paths from one IP.

## Key Insights
- The in-app `_FixedWindowLimiter` already stops fast bursts (10 req/60s per path). CrowdSec's
  value-add here is a *longer, cross-path* view — e.g. an IP that stays just under 10/60s on
  `/admin/login` but does so continuously for an hour, or one that spreads probing across
  `/admin/login` + `/admin/api/login` + `/token` to dodge the per-path bucket.
- Local parsers/scenarios need no hub install — just files + an `acquis.yaml` entry pointing at
  them by path (Researcher 2 §1).
- Decisions this scenario produces land in the **same local LAPI** as Phase 1's Postfix/sshd
  decisions — Phase 4's Cloudflare bouncer and Phase 1's firewall bouncer both just poll
  `/v1/decisions/stream`; this phase doesn't need to know or care which bouncer eventually
  acts on its output. Keep the scenario's `scope` metadata generic (IP-scoped) so it's usable
  by any bouncer.

## Requirements
- Functional: an IP producing sustained `401`s on `/admin/login`/`/admin/api/login` (5 in 5
  minutes — looser window than the app's own 60s limiter, to catch low-and-slow attempts) OR a
  correlated pattern of `429`s across 3+ distinct watched paths within 10 minutes produces a
  CrowdSec decision (ban).
- Non-functional: parser must not choke on log rotation/journald restart; scenario must not
  fire on normal traffic patterns (verify via soak, same discipline as Phase 1).

## Architecture
```
journald (tmail-api.service, tmail.security logger lines)
        │
        ▼ (acquis.yaml: journalctl_filter _SYSTEMD_UNIT=tmail-api.service)
crowdsec agent
        │
        ▼ parser: your-org/tmail-logs (JSON extraction: client_ip, path, status, timestamp)
        │
        ▼ scenario: your-org/tmail-admin-bruteforce (leaky bucket, groupby client_ip)
        ▼ scenario: your-org/tmail-cross-path-probe (leaky bucket, groupby client_ip,
                     distinct-path count via a counter filter)
        │
        ▼ LAPI decision (ban, IP-scoped)
        │
   (intended consumer: Phase 4's Cloudflare bouncer only. `<!-- Red Team Session 1: Finding 4
    corrected -->` Phase 1's firewall bouncer does NOT ignore this by default — CrowdSec
    bouncers enforce every decision in the LAPI stream unless explicitly scope-filtered. Phase 1
    now configures that filter (Phase 1 Step 6) so it only acts on its own Postfix/sshd-origin
    decisions. That filter is a hard prerequisite for this phase's soak step below to mean what
    it says — without it, Phase 1's already-enforcing bouncer would immediately act on this
    phase's brand-new, unproven decisions the moment they're produced, regardless of whether
    Phase 4 exists yet.)
```

## Related Code Files
- Create: `deploy/crowdsec/parsers/s01-parse/tmail/tmail-logs.yaml`
- Create: `deploy/crowdsec/scenarios/tmail/tmail-admin-bruteforce.yaml`
- Create: `deploy/crowdsec/scenarios/tmail/tmail-cross-path-probe.yaml`
- Create: `deploy/crowdsec/acquis-tmail-app.yaml`
- Modify: `deploy/install.sh` — copy these three files into `/etc/crowdsec/parsers/s01-parse/`,
  `/etc/crowdsec/scenarios/`, and `/etc/crowdsec/acquis.d/` respectively, then
  `systemctl reload crowdsec` (or restart) to pick them up.
- No application code changes in this phase (Phase 2 already emits the input format).

## Implementation Steps
1. Write `tmail-logs.yaml` parsing the Phase 2 JSON line shape (`client_ip`, `path`, `status`,
   `timestamp`) into `evt.Parsed.*` fields plus a derived `evt.Meta.log_type` (`auth_failure`
   for 401, `rate_limited` for 429). `<!-- Red Team Session 1: Finding applied -->` **Must also
   explicitly map `client_ip` into `evt.Meta.source_ip`** — that's the field CrowdSec's
   decision/bouncer machinery actually keys a ban target on; a parser that only sets
   `evt.Parsed.client_ip` looks correctly installed (`cscli parsers list` shows it active,
   `cscli alerts list` may even show alerts) while producing decisions with no usable IP to ban.
   Verify explicitly (Step 7 below), don't infer it from "an alert fired."
2. Write `tmail-admin-bruteforce.yaml`: leaky bucket, `capacity: 5`, `leakspeed: "5m"`,
   `groupby: evt.Meta.source_ip`, filtered to `log_type == 'auth_failure' && path in
   ['/admin/login', '/admin/api/login']`.
3. Write `tmail-cross-path-probe.yaml`: leaky bucket or `counter` scenario type keyed by
   `source_ip`, tracking distinct `path` values with `log_type == 'rate_limited'` — fires past a
   threshold of distinct watched paths hit within a rolling window. (Exact CrowdSec scenario
   syntax for "distinct value count" needs a quick check against current scenario-type docs at
   implementation time — `counter` vs a `leaky` bucket with an `uniq` expression helper; don't
   guess the syntax, verify against `docs.crowdsec.net/docs/scenarios/` before writing the final
   YAML.)
4. Write `acquis-tmail-app.yaml` with `journalctl_filter: ["_SYSTEMD_UNIT=tmail-api.service"]`.
5. Wire all four files into `deploy/install.sh`'s install block (extends Phase 1's addition).
6. **Before this soak means anything**: confirm Phase 1's bouncer decision-scope filter
   (Phase 1 Step 6) is actually in place. Without it, Phase 1's firewall bouncer — already
   enforcing by this point — will act on these decisions immediately.
7. Soak: run with these scenarios active but the Cloudflare bouncer (Phase 4) not yet enabled —
   verify via `cscli alerts list` that real traffic doesn't false-positive, and via
   `cscli decisions list` that produced decisions carry a valid, correctly-populated IP
   (Step 1's `source_ip` mapping) before Phase 4 wires up enforcement.
8. Also add a whitelist entry for the admin's own known web-access IP(s) — Phase 1's whitelist
   only covers SSH/relay IPs; this scenario's admin-bruteforce detection needs its own exclusion
   for the admin, or an ordinary mistyped-password moment (well within the "5 in 5 minutes"
   threshold this scenario deliberately targets) can ban the admin from `/admin/login` with no
   SSH-level way around it (the web app has no direct port to fall back to). Document the
   maintenance point in Phase 6: update this whitelist if the admin's access IP changes.

## Todo List
- [ ] Write `tmail-logs.yaml` parser, explicitly mapping `client_ip` → `evt.Meta.source_ip`
- [ ] Write `tmail-admin-bruteforce.yaml` scenario
- [ ] Verify correct scenario-type syntax for cross-path detection against current docs
- [ ] Write `tmail-cross-path-probe.yaml` scenario
- [ ] Write `acquis-tmail-app.yaml`
- [ ] Wire into `deploy/install.sh`
- [ ] Confirm Phase 1's bouncer scope filter is in place before soaking
- [ ] Add admin's own web-access IP to a whitelist (separate from Phase 1's SSH/relay whitelist)
- [ ] Soak, review `cscli alerts list` for false positives and `cscli decisions list` for
      correctly-populated source IPs

## Success Criteria
- `cscli parsers list` and `cscli scenarios list` show the three local files installed and
  active.
- A synthetic test (repeated wrong `/admin/login` password from a throwaway IP, spaced beyond
  the app's own 60s rate-limit window) produces a `cscli decisions list` entry **with a valid,
  correctly-populated source IP** — not just an alert count.
- No false-positive decision against real admin/legitimate traffic (including the admin's own
  whitelisted access IP) during the soak window.
- Phase 1's bouncer decision-scope filter confirmed active before this phase's soak begins.

## Risk Assessment
- **Risk**: cross-path scenario syntax guessed wrong, silently never fires. **Mitigation**: Step
  6's soak explicitly checks `cscli alerts list` shows *some* alerts under synthetic testing
  before trusting it in production — same "prove it parsed something" discipline as Phase 1.
- **Risk**: scenario too aggressive, bans a shared-NAT IP (multiple legitimate users behind one
  corporate/CGNAT IP). **Mitigation**: soak period + conservative thresholds (5 failures/5min,
  not tighter); document in Phase 6's rollback section how to `cscli decisions delete` a bad ban
  and adjust thresholds.

## Security Considerations
- Decisions from this scenario are IP-scoped bans — same blast-radius consideration as any
  IP-based block (shared IPs, corporate NAT). No different from the existing rate limiter's own
  IP-keying trade-off already documented in `_client_ip`'s docstring.
- `<!-- Red Team Session 1: Finding applied; Validation Session 1: prerequisite scoped out -->`
  `client_ip` is sourced from `_client_ip()`, which trusts the `CF-Connecting-IP` header
  unconditionally. Once this scenario's decisions feed Phase 4's Cloudflare-edge enforcement,
  this stops being merely a self-limiting-bypass risk (the existing accepted trade-off) and
  becomes a mechanism an attacker could in principle use to get an arbitrary third-party IP
  banned, by sending abusive requests with that victim's IP set as the header value — **but
  only if traffic can reach the origin without passing through Cloudflare's own edge**, since
  Cloudflare's edge is what actually sets/overwrites this header for real requests. Closing that
  gap requires an origin firewall lockdown to Cloudflare's IP ranges, which was **validated as
  out of scope for this plan** (tracked as a separate infrastructure change) — so this residual
  risk stays open until that separate change lands. Documented here so it isn't rediscovered as
  a surprise later.

## Next Steps
- Phase 4 consumes this phase's decisions via the local LAPI's decision stream.
