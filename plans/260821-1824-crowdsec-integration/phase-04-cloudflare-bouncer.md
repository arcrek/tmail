# Phase 4 — Cloudflare bouncer for web-layer enforcement

## Context Links
- `research/researcher-02-app-layer-cloudflare.md` §2-5
- `phase-03-custom-parser-scenario.md` (produces the decisions this phase enforces)
- plan.md Overview / Validation Log Session 1 (origin-firewall lockdown to Cloudflare's IP
  ranges — **validated as out of scope for this plan**, tracked as a separate infrastructure
  change; see Key Insights for the residual-risk this leaves open)
- `README.md` "Running behind Cloudflare Tunnel" (topology corrected mid-plan — actual
  production setup is Cloudflare's DNS proxy, not a Tunnel; see plan.md Overview)

## Overview
- Priority: P2
- Status: Pending
- Install and configure `cs-cloudflare-bouncer` so CrowdSec decisions get enforced at
  Cloudflare's edge — the only enforcement point that actually works for traffic arriving
  through Cloudflare's DNS proxy, since the origin's OS-level TCP peer for that traffic is
  always a Cloudflare edge IP, never the real visitor.

## Key Insights
- This is the phase that makes CrowdSec's web-layer detection actually *do* something. Without
  it, Phase 3 only produces alerts nobody acts on automatically.
- Enforcement point is Cloudflare's edge (IP List + one WAF custom rule) — confirmed no
  Tunnel-specific mechanics apply here since this deployment uses Cloudflare's DNS proxy, not a
  Tunnel (Researcher 2 §3 discusses Tunnel; the "enforcement happens at the edge regardless of
  how traffic subsequently reaches the origin" reasoning holds for DNS-proxy mode too).
- `<!-- Red Team Session 1: Finding applied; Validation Session 1: prerequisite scoped out -->`
  **This phase only provides a real security guarantee once the origin's :80/:443 is firewalled
  to Cloudflare's published IP ranges** — and that lockdown was **validated as out of scope for
  this plan** (tracked separately, own maintenance window; see plan.md Validation Log). Unlike a
  Tunnel (structurally no listening public port), this deployment's origin has one — until that
  separate change lands, an attacker can bypass Cloudflare (and therefore this entire phase) by
  connecting to the origin directly, while also freely spoofing the `CF-Connecting-IP` header
  this phase's ban decisions are keyed on. **This phase can be implemented and enabled on its
  own schedule**, but flag this residual risk explicitly to whoever owns the separate firewall
  change — this phase's protection is incomplete without it.
- **Only enforce Phase 3's app-layer decisions here, not Phase 1's Postfix/sshd decisions** —
  configure the bouncer's decision-scope/origin filter (same mechanism as Phase 1 Step 6, mirror
  image) so SSH/mail-abuse bans don't also block unrelated web visitors sharing that IP/CGNAT
  range. Verify the exact filter syntax against current docs, don't assume symmetry with Phase
  1's config is automatic.
- Requires an external, manual, one-time step: creating a Cloudflare API Token with Account
  "Account Filter Lists: Edit" + Zone "Firewall Services: Edit" scopes. **This plan does not
  automate token creation and the token must never be committed to the repo** — same secrets
  posture as `config.json`'s `jmap_token`/`admin_password` (mode `0600`, host-local only).
- `<!-- Validation Session 1 -->` **Confirmed: single Cloudflare zone.** The public web app
  (inbox UI + admin console) is served under one domain/zone — this phase's config uses a
  single `zone_id`, no multi-zone/multi-account looping needed.
- Uses Cloudflare's bulk IP Lists + a single WAF custom rule (`ip.src in $crowdsec_<prefix>`),
  not one rule per IP — required to stay within per-zone WAF custom-rule count limits
  (Researcher 2 §3, §5).

## Requirements
- Functional: an IP banned by CrowdSec's app-layer scenarios (Phase 3) gets blocked/challenged
  at Cloudflare's edge within roughly `update_frequency` (target: 30s) of the ban.
- Functional: Postfix/sshd-origin decisions (Phase 1) are excluded from this bouncer's scope —
  only Phase 3's app-layer decisions reach the Cloudflare IP List.
- Non-functional: doesn't conflict with or duplicate any existing hand-written Cloudflare WAF/
  rate-limiting rules — verify current zone rule set before adding this one (deconflict
  priority ordering per Researcher 2 §3).
- Non-functional: a decision-volume spike (coordinated attack across both Phase 1 and Phase 3
  scenarios simultaneously) doesn't silently exceed Cloudflare's API rate limit or the IP List's
  per-plan item cap — see Risk Assessment.

## Architecture
```
crowdsec agent (local LAPI, 127.0.0.1:8080)
        │  GET /v1/decisions/stream (poll every update_frequency)
        ▼
cs-cloudflare-bouncer daemon (crowdsec-cloudflare-bouncer.service)
        │  Cloudflare API (Account Filter Lists: Edit, Zone Firewall Services: Edit)
        ▼
Cloudflare account-level IP List ($crowdsec_<prefix>)
        │  referenced by
        ▼
Cloudflare zone WAF custom rule: ip.src in $crowdsec_<prefix> → action: block
        │
        ▼
Inbound request blocked/challenged at Cloudflare edge, before it ever reaches
the origin / the app.

(Residual risk, not shown above, and OUT OF SCOPE for this plan: without a separately-tracked
 origin-firewall lockdown to Cloudflare's IP ranges, an attacker can skip this entire pipeline
 by hitting the origin's IP directly. See plan.md Validation Log.)
```

## Related Code Files
- Create: `deploy/crowdsec/crowdsec-cloudflare-bouncer.yaml.example` — config template with
  placeholders for `crowdsec_lapi_key`, `cf-account-id`, `cf-api-token`, `cf-zone-id`; the real
  filled-in file stays host-local, never committed (mirrors `config.example.json` →
  `config.json` pattern already used in this repo).
- Modify: `deploy/install.sh` — install `cs-cloudflare-bouncer` binary/package, copy the example
  config to `/etc/crowdsec/bouncers/crowdsec-cloudflare-bouncer.yaml` if absent (never overwrite
  an existing filled-in file), print a loud reminder to fill in the Cloudflare credentials
  before enabling the service (same pattern as this repo's existing `install.sh` prompts for
  `config.json` secrets).
- Modify: `README.md` — extend the "Running behind Cloudflare Tunnel" section with the manual
  Cloudflare API Token creation steps (Account/Zone scopes) and a link to this phase.
- No application code changes.

## Implementation Steps
1. Manually (outside this repo, in the Cloudflare dashboard): create an API Token scoped to
   Account "Account Filter Lists: Edit" + Zone "Firewall Services: Edit" for the relevant
   account/zone. Document this as an explicit manual runbook step, not something `install.sh`
   attempts to script (no credential should ever be typed into a script that might log it).
2. Install `cs-cloudflare-bouncer` (verify current install method — APT package vs standalone
   binary release — against `docs.crowdsec.net/docs/bouncers/cloudflare/` at implementation
   time; Researcher 2 flagged this page's exact mechanics weren't independently re-verified by
   live fetch).
3. Note (doesn't block progress, but must be communicated): the origin-firewall lockdown to
   Cloudflare's IP ranges is tracked as a separate initiative outside this plan. This phase can
   proceed on its own schedule, but its protection is incomplete until that separate change
   lands — flag this to whoever owns that work.
4. `cscli bouncers add cloudflare-bouncer` to get a LAPI key; write
   `crowdsec-cloudflare-bouncer.yaml.example` per the skeleton in Researcher 2 §2, with
   placeholders for the LAPI key, Cloudflare account ID, API token, zone ID, `ip_list_prefix:
   crowdsec`, `default_action: challenge` (start with challenge, not block — see Risk
   Assessment). Configure the bouncer's decision-scope filter to include only Phase 3's
   app-layer scenario/origin, excluding Phase 1's Postfix/sshd decisions (verify exact filter
   syntax against current docs at implementation time).
5. Wire the copy-if-absent step into `deploy/install.sh`; add the loud reminder about filling
   in real credentials.
6. On the real host: fill in the real config, `systemctl enable --now
   crowdsec-cloudflare-bouncer`.
7. Verify: trigger a synthetic ban (from Phase 3's scenarios only, using a throwaway IP/VPN —
   never the admin's real IP) and confirm the IP appears in the Cloudflare IP List (via
   Cloudflare dashboard or API) within the configured `update_frequency`. Also trigger a
   synthetic Phase 1 (SSH) ban and confirm it does *not* appear in the Cloudflare IP List —
   proof the scope filter (Step 4) actually works, not just that it was configured.
8. Check the target zone's existing WAF custom rules and Rate Limiting rules for overlap;
   adjust rule priority if the new CrowdSec rule and an existing rule would otherwise both fire
   redundantly on the same traffic pattern.
9. Load-test the decision pipeline with a burst well beyond normal volume (e.g. simulate 50+
   concurrent decisions) and confirm the bouncer batches through the bulk IP List API rather
   than issuing one call per IP — this is what keeps it inside Cloudflare's ~1200 req/5min
   token-level API rate limit and the IP List's per-plan item cap. Document the observed
   behavior (batches cleanly vs falls behind vs errors) in this phase's notes.

## Todo List
- [ ] Manually create scoped Cloudflare API Token (Account + Zone permissions)
- [ ] Confirm current install method for `cs-cloudflare-bouncer` against live docs
- [ ] Note the out-of-scope origin-firewall-lockdown residual risk to whoever owns that work
- [ ] `cscli bouncers add cloudflare-bouncer`, write config example/template with a
      decision-scope filter limited to Phase 3's app-layer origin
- [ ] Wire into `deploy/install.sh` (copy-if-absent + loud credential reminder)
- [ ] Fill in real config on host, enable service
- [ ] Verify synthetic Phase 3 ban propagates to Cloudflare IP List within `update_frequency`
- [ ] Verify synthetic Phase 1 (SSH) ban does NOT propagate (scope filter works)
- [ ] Review existing zone WAF/rate-limit rules for overlap, adjust priority if needed
- [ ] Decision-volume burst test; confirm bulk-API batching behavior, document result
- [ ] Update README

## Success Criteria
- `crowdsec-cloudflare-bouncer.service` `active (running)`, connected to LAPI
  (`cscli bouncers list` shows it).
- Synthetic ban test: throwaway-IP ban from Phase 3 → IP appears in Cloudflare's
  `crowdsec_<prefix>` list → a request from that IP against the live site is
  blocked/challenged. A synthetic Phase 1 (SSH) ban does NOT appear in the list.
- No accidental self-lockout: verify the admin's own working IP is never in the banned list
  before/after each test.
- Decision-volume burst test (Step 9) shows batched Cloudflare API calls, not one-per-IP.

## Risk Assessment
- **Risk**: `default_action: block` too aggressive on day one, blocks legitimate visitors caught
  by an over-eager Phase 3 scenario. **Mitigation**: start with `default_action: challenge`
  (JS challenge, not a hard block) for the first soak period. `<!-- Red Team Session 1: Finding
  applied -->` **Only promote to `block` once a concrete, measurable gate is met** — not a
  subjective "looks fine" call. Minimum gate: zero false-positive decisions confirmed over at
  least 7 consecutive days of production soak, cross-checked against the admin's and any other
  known-legitimate IPs. Document who signs off on this promotion in Phase 6's runbook.
- **Risk**: without the decision-scope filter (Overview, Step 4), Phase 1's SSH/Postfix bans
  also get pushed to the Cloudflare IP List, blocking unrelated web visitors sharing that
  IP/CGNAT range. **Mitigation**: Step 7's explicit negative test (SSH ban does NOT propagate)
  is mandatory before calling this phase done.
- **Risk**: Cloudflare API token leaked (committed accidentally, logged). **Mitigation**: same
  `.example` template + host-local real file pattern as `config.json`; add the real bouncer
  config path to this repo's `.gitignore` if it could ever land inside the checkout (it
  shouldn't — `/etc/crowdsec/...` is outside the repo tree, but double-check `deploy/install.sh`
  never echoes the token to a log).
- **Risk**: conflicting with existing Cloudflare WAF/rate-limit rules causes double-blocking or
  confusing logs. **Mitigation**: Step 8's explicit review before calling this phase done.
- **Risk**: a decision-volume spike (simultaneous SSH-scan + web-abuse wave) saturates
  Cloudflare's API rate limit, causing bans to lag or the bouncer to start erroring on 429s from
  Cloudflare's own API, with no defined fallback behavior. **Mitigation**: Step 9's load test
  surfaces this before it happens for real; if it batches poorly, this is a blocking issue for
  this phase, not a "nice to know."
- **Risk**: emergency-disable (Phase 6) stops this daemon but does not retract Cloudflare IP List
  entries it already pushed — a wrongly-banned admin/visitor stays banned even after the
  daemon is stopped. **Mitigation**: this is fixed in Phase 6's emergency-disable procedure, not
  here — cross-referenced so implementers don't assume "stop the service" alone undoes a bad
  ban.
- **Risk (accepted, out of scope): this entire phase is bypassable by connecting to the origin
  directly**, since the origin firewall isn't restricted to Cloudflare's IP ranges. Closing this
  requires a separate infrastructure change the user explicitly chose to track outside this plan
  (Validation Session 1). **Mitigation**: none within this plan. This phase can still be
  implemented and provides real value once that separate change lands — implement it, but don't
  represent it as a complete security boundary until then.

## Security Considerations
- Cloudflare API token is a high-value credential (can edit firewall rules for the zone/account)
  — scope it as narrowly as Cloudflare's permission model allows (the two specific permissions
  in Key Insights, not a broader "Edit zone" token).
- `crowdsec_lapi_key` for this bouncer is separate from Phase 1's firewall-bouncer key —
  `cscli bouncers list` should show both registered independently, so either can be revoked
  without affecting the other.

## Next Steps
- Phase 5 (stretch) can surface this bouncer's activity (ban counts) on the admin dashboard.
- Phase 6 folds the credential-reminder runbook into the consolidated ops doc.
