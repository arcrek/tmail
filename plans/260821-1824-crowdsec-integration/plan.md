---
title: "Integrate CrowdSec across mail server and web app"
description: "Add CrowdSec intrusion detection for Postfix/SSH via a local firewall bouncer, plus a custom app-layer scenario and Cloudflare-edge bouncer for the FastAPI app (single Cloudflare zone, CAPI/Console enrolled for the community blocklist)."
status: pending
priority: P2
effort: 18h
issue: null
branch: feature/crowdsec-integration
tags: [infra, security, backend]
blockedBy: []
blocks: []
created: 2026-08-21
---

# Integrate CrowdSec across mail server and web app

## Overview

Add CrowdSec (crowdsecurity/crowdsec) as a second security layer alongside the existing
in-app rate limiter (`_FixedWindowLimiter` in `src/api_server.py`). Two enforcement points,
because this host has two different exposure shapes:

1. **Postfix (port 25) + SSH** are directly internet-facing on the mail server. CrowdSec's
   local agent + `crowdsec-firewall-bouncer` (nftables) block bad IPs at the OS firewall —
   the classic, well-supported CrowdSec use case.
2. **The web app (`api_server`/`admin_api`) sits behind Cloudflare's DNS proxy ("orange
   cloud")** — NOT a Cloudflare Tunnel. `<!-- Red Team Session 1 follow-up: corrected mid-plan,
   the app previously assumed Tunnel -->` README's "Running behind Cloudflare Tunnel" section
   describes a different topology than what's actually deployed. This matters:
   - The two topologies share one property that still drives this plan's Phase 4 design: for
     traffic that *does* go through Cloudflare, the origin's OS-level TCP peer is always a
     Cloudflare edge IP, never the real visitor's IP — so a local firewall bouncer banning "the
     real client IP" is still a no-op for that traffic either way. Enforcement of app-layer
     CrowdSec decisions still has to happen at Cloudflare's edge (Phase 4).
   - But unlike a Tunnel (`cloudflared` makes an outbound-only connection — structurally no
     listening public port at all), DNS-proxy mode means **the origin genuinely has a public
     listening port**. Unless that port is firewalled to accept connections only from
     Cloudflare's published IP ranges, an attacker who discovers the origin's real IP (DNS
     history, certificate-transparency logs, a misconfigured non-proxied record, etc.) can
     connect to it directly — bypassing Cloudflare's WAF, rate-limiting, and this plan's entire
     Phase 4 Cloudflare-bouncer pipeline, *and* freely spoofing the `CF-Connecting-IP` header
     that `_client_ip()` in `src/api_server.py` trusts unconditionally (its own docstring already
     documents this exact failure mode). **Confirmed with the user: the origin is not currently
     locked down this way.**
   - `<!-- Validation Session 1: scoped out of this plan -->` **This origin-firewall lockdown is
     explicitly OUT OF SCOPE for this plan** — the user chose to track it as a separate
     infrastructure change with its own maintenance window, not bundled into this CrowdSec
     rollout (it touches live network reachability for the production origin, independent of
     CrowdSec). It remains a **required external prerequisite**: Phase 4's Cloudflare-edge
     enforcement (and the existing `CF-Connecting-IP` trust it relies on) provides no real
     security guarantee until that separate lockdown lands. See Phase 1 and Phase 4's "Context
     Links"/"Key Insights" for the explicit cross-reference and residual-risk note.

Scope selected via scope challenge: **EXPANSION** — full stack (mail server + web app), plus
two stretch items: a read-only CrowdSec panel on the existing admin dashboard, and an
explicit (documented, opt-in) decision on CrowdSec Console/CAPI enrollment for the community
blocklist.

`<!-- Red Team Session 1: Finding applied -->` **Effort note**: `18h` in the frontmatter is
*active implementation work*, not elapsed calendar time. This plan's own core safety mechanism
is soak-before-enforce (Phase 1's 48h+ soak, Phase 3's follow-on soak, Phase 4's minimum 7-day
false-positive-free window before promoting to `block`) — those are calendar-time waits with
near-zero active effort during them, and they run sequentially (Phase 3 depends on Phase 1's
LAPI; Phase 4 depends on Phase 3's decisions). Real elapsed time from start to a fully-enforcing
rollout is measured in weeks, not the 18h figure. Do not compress the soak windows to fit a
schedule built around the active-hours number — that's the exact corner-cutting this plan's own
soak discipline exists to prevent.

## Design decisions (resolved via scope challenge + research)

- **Full stack, not mail-server-only.** The web app already has an in-app rate limiter, but
  it's per-path and per-window — it can't correlate "many distinct abusive requests across
  paths/patterns from one IP over time" the way a CrowdSec scenario can. CrowdSec is additive,
  not a replacement for `_FixedWindowLimiter`.
- **Cloudflare bouncer over cron-based IP-list push.** Researched both: a long-lived
  `cs-cloudflare-bouncer` daemon (polls local LAPI's decision stream, near-real-time) vs a
  systemd-timer cron pushing `cscli decisions list` diffs to Cloudflare's bulk IP List API
  (matches this repo's existing `email_janitor` timer pattern, but adds ban-propagation lag and
  requires hand-rolling decision-expiry cleanup). Chose the daemon: EXPANSION scope, and
  real-time ban propagation matters more here than avoiding one extra systemd service. The cron
  alternative is documented in Phase 4 as a fallback if the daemon proves troublesome.
- **Native `.deb` install, not Docker.** Production is checkout + systemd (`deploy/install.sh`),
  not Docker Compose. CrowdSec's official APT repo installs `crowdsec.service` and
  `crowdsec-firewall-bouncer.service` directly — matches how the rest of the stack runs.
  Docker Compose (`compose.yaml`/`compose.local.yml`, dev-only) is out of scope for this plan.
- **Cloudflare bouncer uses IP Lists + one WAF custom rule, not one rule per IP.** Cloudflare
  per-zone WAF custom-rule counts are small; the bouncer's own design (account-level bulk IP
  List referenced by a single `ip.src in $crowdsec_<prefix>` rule) is what keeps this within
  both the rule-count and API rate-limit envelope. Don't build anything that creates one
  Access Rule per banned IP.
- **Soak before enforce, both layers.** Install collections and watch `cscli alerts list` /
  `cscli decisions list` in monitor-only mode (bouncers not yet enabled) before turning on
  the firewall bouncer or Cloudflare bouncer. False positives on a mail server (legitimate
  relay retries, backup MX) or on the web app (shared NAT IPs) are cheap to fix pre-enforcement,
  expensive post-enforcement (locked-out admin, blocked legitimate mail).
- **Not in scope:** `policy_daemon` (127.0.0.1:10030) needs no bouncer coverage — it's not
  internet-facing. No changes to the existing `_FixedWindowLimiter` logic. No Stalwart-side
  CrowdSec integration (Stalwart has its own auth/abuse tooling; out of scope here).
- **Origin firewall lockdown to Cloudflare's IP ranges is OUT OF SCOPE (validated decision).**
  Confirmed with the user that the origin isn't currently firewalled this way, and confirmed
  this plan should not implement it — the user wants it tracked as a separate infrastructure
  change with its own maintenance window/change-management, since it touches live production
  network reachability independent of CrowdSec. This plan documents it as a required external
  prerequisite (Phase 1/Phase 4 cross-reference the residual risk) but does not create the
  nftables rules, refresh timer, or install-script wiring for it.
- **CrowdSec Console/CAPI enrollment: enrolled (validated decision).** The deployment enrolls
  in CrowdSec's Console/CAPI, consuming the community blocklist and sharing anonymized attack
  signals back. Documented as a concrete answer in Phase 6's `docs/crowdsec.md`, not left as an
  open stretch question.
- **Single Cloudflare zone (validated assumption).** The public web app (inbox UI + admin
  console) is served under one domain/Cloudflare zone. Phase 4's `cs-cloudflare-bouncer` config
  uses a single `zone_id`; no multi-zone config needed. (The many mail-receiving domains this
  service provisions via Postfix/Stalwart are a separate concern from the web app's own zone —
  they don't each need their own Cloudflare zone entry in Phase 4's bouncer config.)

## Cross-Plan Dependencies

None blocking. Scanned `plans/` — all 22 existing plans are `completed`/`done`. No file or scope
overlap; the app-layer logging change (Phase 2) touches `src/api_server.py` and `src/admin_api.py`
but doesn't conflict with any prior plan's changes to those files (all merged already).

Worth noting for continuity: `plans/260818-0628-cf-ip-elevated-token-limit/plan.md` (merged,
`done`) documented trusting `CF-Connecting-IP` unconditionally as safe "only if this app has no
ingress other than the tunnel." This plan's mid-plan topology correction (Cloudflare DNS proxy,
not Tunnel — see Overview) means that assumption's premise was already stale before this plan
started. **The fix for that (an origin firewall lockdown to Cloudflare's IP ranges) is explicitly
out of scope for this plan** (validated decision — tracked as a separate infrastructure change).
Until that separate change lands, this plan's Phase 4 Cloudflare-edge enforcement — and the
`CF-Connecting-IP` trust it depends on — remains bypassable by anyone connecting to the origin
directly. Not a blocking dependency in the plan-scheduling sense (that plan is done, this plan
doesn't need it to start), but a real residual risk this plan cannot close on its own.

## Red Team Review

### Session 1 — 2026-08-21
4 hostile reviewers (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope &
Complexity Critic — 6 phases scaled to 4 reviewers per the review framework) read all phase
files and produced 31 raw findings. Deduplicated to 15 adjudicated findings; user selected
"apply all accepted."

**Findings:** 15 (15 accepted, 0 rejected among the deduplicated set — 6 additional raw findings
were rejected before dedup, see below)
**Severity breakdown:** 5 Critical, 5 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2's 429 log line placed only after `call_next` — the rate limiter returns before `call_next` for every real 429, so it can never fire | Critical | Accept | Phase 2 |
| 2 | `curl \| sh` unpinned root install with no integrity verification | Critical | Accept | Phase 1 |
| 3 | `CF-Connecting-IP` spoofing becomes an enforcement trust anchor once Cloudflare-edge banning exists — can be used to get an arbitrary third-party IP banned | Critical | Accept | Phase 3, Phase 4 (documented as a residual risk; the fix — origin firewall lockdown — was later validated as out of scope for this plan, see Validation Log) |
| 4 | No decision-scope/origin filtering between the two bouncers — breaks the plan's own soak-before-enforce isolation and causes cross-bouncer contamination (SSH bans → Cloudflare list, web bans → firewall bouncer) | Critical | Accept | Phase 1, Phase 3, Phase 4 |
| 5 | New CrowdSec systemd units never wired into `deploy/deploy.sh`'s scp list or `deploy/release.sh`'s `UNITS` array — invisible to the real redeploy/rollback path | Critical | Accept | Phase 6 |
| 6 | No CrowdSec whitelist for the admin's own web-console IP (only SSH/relay covered) — an ordinary mistyped password can lock the admin out with no SSH-level fallback | High | Accept | Phase 3, Phase 6 (maintenance cadence) |
| 7 | journald's default per-unit rate limit can silently drop exactly the log burst a real attack produces, defeating detection under load | High | Accept | Phase 2 |
| 8 | Firewall-bouncer package may auto-enable before the whitelist step, risking a same-day admin lockout | High | Accept | Phase 1 |
| 9 | Emergency-disable procedure stops the bouncer daemon but doesn't retract already-pushed Cloudflare IP List entries — a banned admin stays banned | High | Accept | Phase 6 |
| 10 | 18h effort estimate reads as active-hours only; doesn't account for mandatory multi-day soak windows, inviting corner-cutting on the plan's own safety mechanism | High | Accept | plan.md Overview |
| 11 | Parser never explicitly required to map `client_ip` → `evt.Meta.source_ip` — could look installed and alert-producing while emitting decisions with no usable ban target | Medium | Accept | Phase 3 |
| 12 | No concrete, measurable gate for promoting Cloudflare enforcement from `challenge` to `block` — left to a subjective "looks fine" call | Medium | Accept | Phase 4 |
| 13 | Phase 5's snapshot script needs root-adjacent `cscli`/LAPI access while the dashboard reads as an unprivileged user — privilege handoff/file ownership left unspecified | Medium | Accept | Phase 5 |
| 14 | No backpressure/quota analysis for the Cloudflare bouncer under a decision-volume spike (combined attack across scenarios) | Medium | Accept | Phase 4 |
| 15 | plan.md's own scope statement promises a CAPI/Console enrollment decision as a stretch item; no phase actually delivers it | Medium | Accept | Phase 6 |

**Rejected (6, not applied — argued against scope already fixed by Step 0's scope challenge, or already adequately covered):**
- *Re-litigating the EXPANSION/full-stack scope choice* (3 findings: "build a bespoke CrowdSec detection DSL to re-solve what the in-app limiter could extend," "ship detection-only first, defer all enforcement daemons," "Cloudflare bouncer built for an unproven/hypothetical threat") — rejected because Step 0's scope challenge already asked this exact question and the user explicitly chose full-stack + a real-time Cloudflare bouncer over the lighter alternatives. Per the red-team review framework: raise scope concerns once in Step 0, don't re-argue a chosen scope during red team.
- *"Phase 5 dashboard panel is scope creep"* — rejected: Phase 5 is already explicitly labeled a stretch item, droppable without affecting any other phase, in both plan.md and Phase 5's own Overview. Not a new defect to flag.
- *"Cross-path-probe scenario syntax undefined"* — rejected: Phase 3's own Risk Assessment already names this exact risk with a stated mitigation (verify against current docs at implementation time, prove via soak that it actually fires). No plan-level gap beyond what's already written.
- *"Hub auto-update timer is an unattended-upgrade risk to the enforcement pipeline"* — rejected (lower priority than the 15 above, cap reached): a reasonable operational point, but CrowdSec's own default cadence for hub upgrades is the standard operational model, and Phase 6's existing rollback/emergency-disable procedure already provides a recovery path if an upstream collection update misbehaves.

## Validation Log

### Session 1 — 2026-08-21
**Trigger:** Post-red-team validation interview (hard-mode workflow), plus a mid-plan topology
correction the user raised (Cloudflare DNS proxy, not Tunnel) that opened new open questions.
**Questions asked:** 4

#### Questions & Answers

1. **[Scope]** Docs/crowdsec.md có thể commit tới CrowdSec Console/CAPI enrollment (community
   blocklist + signal sharing) hay chỉ local-only?
   - Options: Local-only, không enroll (Recommended) | Enroll Console/CAPI | Chưa quyết, để
     blank trong doc
   - **Answer:** Enroll Console/CAPI
   - **Rationale:** Phase 6's `docs/crowdsec.md` promised this decision as a concrete written
     answer (Red Team Finding 15); needed a real choice, not a placeholder.

2. **[Architecture]** Web app (inbox UI/admin) chạy dưới 1 zone Cloudflare hay nhiều zone/domain
   khác nhau?
   - Options: 1 zone duy nhất (Recommended) | Nhiều zone/domain
   - **Answer:** 1 zone duy nhất
   - **Rationale:** Confirms Phase 4's single-`zone_id` bouncer config is correct as written —
     no multi-zone config needed.

3. **[Risk]** Khóa firewall origin chỉ nhận Cloudflare IP (Phase 1 mới thêm) — làm luôn trong
   plan này hay tách riêng thành đợt thay đổi/maintenance window riêng vì đụng vào network thật?
   - Options: Làm trong plan này (Recommended) | Tách riêng, ngoài plan này
   - **Answer:** Tách riêng, ngoài plan này
   - **Rationale:** This is a live production network change (origin firewall) independent of
     CrowdSec itself; the user wants its own change-management process, not bundled into a
     CrowdSec rollout. Removed from Phase 1's implementation steps; kept as a documented
     external prerequisite/residual-risk cross-reference in Phase 1, Phase 3, Phase 4, and
     plan.md.

4. **[Scope]** Phase 5 (dashboard CrowdSec panel) — giữ trong plan này (build cùng lúc) hay tách
   thành plan follow-up sau khi Phase 1-4/6 chạy ổn (vài tuần)?
   - Options: Giữ trong plan này như stretch (Recommended) | Tách thành plan riêng sau
   - **Answer:** Giữ trong plan này như stretch
   - **Rationale:** No change from the original design — stays P3/stretch/droppable, tracked in
     the same plan for continuity.

#### Confirmed Decisions
- CAPI/Console enrollment: **enrolled** — Phase 6 documents this as a concrete answer.
- Cloudflare zone topology: **single zone** — Phase 4's config stays single-`zone_id`.
- Origin firewall lockdown to Cloudflare IP ranges: **out of scope for this plan** — removed
  from Phase 1's implementation; tracked as an external prerequisite/residual risk.
- Phase 5: **stays in this plan**, unchanged, as a stretch item.

#### Action Items
- [x] Remove Phase 1's Cloudflare-IP-range firewall implementation steps (Steps 9-13 and their
      Related Code Files/Todo/Success Criteria/Risk Assessment entries); replace with an
      external-prerequisite note.
- [x] Update Phase 3 and Phase 4's cross-references to point at an external prerequisite rather
      than "Phase 1 Steps 9-13."
- [x] Update Phase 6's CAPI/Console section to state the concrete "enrolled" decision.
- [x] Add a single-zone confirmation note to Phase 4.

#### Impact on Phases
- Phase 1: Overview, Requirements, Related Code Files, Implementation Steps, Todo List, Success
  Criteria, Risk Assessment, Next Steps — all trimmed back to Postfix/SSH scope only; the
  firewall-lockdown material becomes a short "External prerequisite (out of scope)" note.
- Phase 3: Security Considerations note rephrased — the prerequisite is external, not "Phase 1
  Steps 9-13."
- Phase 4: Context Links, Key Insights, Architecture, Implementation Steps, Todo List, Success
  Criteria rephrased to reference an external prerequisite instead of in-plan phase steps; add a
  single-zone confirmation.
- Phase 6: `docs/crowdsec.md`'s CAPI/Console section states "enrolled," not an open question.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [CrowdSec core + Postfix/SSH protection](./phase-01-core-postfix-sshd.md) | Pending |
| 2 | [App-layer security event logging](./phase-02-app-security-logging.md) | Pending |
| 3 | [Custom parser/scenario for tmail app abuse](./phase-03-custom-parser-scenario.md) | Pending |
| 4 | [Cloudflare bouncer for web-layer enforcement](./phase-04-cloudflare-bouncer.md) | Pending |
| 5 | [Admin dashboard CrowdSec panel (stretch)](./phase-05-admin-dashboard-panel.md) | Pending |
| 6 | [Ops wiring: deploy docs, hub auto-update, rollback](./phase-06-ops-wiring.md) | Pending |

## Research

- `research/researcher-01-postfix-sshd-systemd.md` — install method, Postfix/sshd collections,
  firewall bouncer, CAPI/community blocklist, resource footprint, mail-server gotchas.
- `research/researcher-02-app-layer-cloudflare.md` — custom parser/scenario authoring,
  `cs-cloudflare-bouncer` config, tunnel-compatibility confirmation, cron-based alternative,
  LAPI decision export and Cloudflare-side rate limits.

## Dependencies

- CrowdSec APT repo + `crowdsec`, `crowdsec-firewall-bouncer-nftables` packages (external, host-level).
- `cs-cloudflare-bouncer` binary/package (external).
- A Cloudflare API Token scoped to: Account "Account Filter Lists: Edit" + Zone "Firewall Services: Edit"
  (manual step in the Cloudflare dashboard — not something this plan automates or should ever commit
  to the repo).
- Confirm on the actual target host whether Postfix logs via rsyslog to `/var/log/mail.log` or is
  journald-only — changes Phase 1's `acquis.yaml` source type. Must be checked at implementation
  time against the real production host, not assumed.
- **External prerequisite (out of scope, tracked separately): origin firewall lockdown to
  Cloudflare's IP ranges.** Confirmed the origin is not currently restricted to them, and
  confirmed (validated decision) this plan does not implement that lockdown — it's a separate
  infrastructure change with its own maintenance window. This plan's Phase 4 web-layer
  enforcement has no real security guarantee until that separate change lands.
