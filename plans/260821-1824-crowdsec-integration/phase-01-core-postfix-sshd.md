# Phase 1 — CrowdSec core + Postfix/SSH protection

## Context Links
- `research/researcher-01-postfix-sshd-systemd.md`
- `deploy/postfix_main_snippet.cf`, `deploy/install.sh` (existing systemd/checkout conventions)

## Overview
- Priority: P1 (foundation for every later phase — LAPI must exist before any bouncer or
  custom scenario can register against it)
- Status: Pending
- Install the CrowdSec agent + local API on the mail server host, wire up the
  `crowdsecurity/postfix` and `crowdsecurity/sshd` collections, and enable the nftables
  firewall bouncer — in monitor-only mode first, then enforcing.
- `<!-- Validation Session 1: scoped out -->` **Out of scope, external prerequisite:** the
  actual production topology is Cloudflare's DNS proxy ("orange cloud"), not a Tunnel — the
  origin genuinely has a public listening port, unlike a Tunnel's outbound-only `cloudflared`.
  That port is not currently firewalled to Cloudflare's IP ranges. This plan does **not**
  implement that lockdown (validated decision — tracked as a separate infrastructure change
  with its own maintenance window), but Phase 4's Cloudflare-edge enforcement has no real
  security guarantee until it lands. See plan.md Overview and Design decisions.

## Key Insights
- This host is not Docker in production — install via the native APT repo, matching
  `deploy/install.sh`'s checkout+systemd model.
- **Must confirm on the real host** whether Postfix logs via rsyslog to `/var/log/mail.log`
  or is journald-only, before writing final `acquis.yaml` — the two need different `source:`
  stanzas (see Researcher 1 §2). Do not assume the syslog file path exists.
- `policy_daemon` (127.0.0.1:10030) is not internet-facing — out of scope for bouncer
  coverage.
- False positives here are expensive: a wrong SSH ban can lock out the admin; a wrong Postfix
  ban can block legitimate backup-MX/relay traffic. Soak before enforce.

## Requirements
- Functional: CrowdSec detects and (once enforcing) blocks brute-force SSH and abusive Postfix
  connections at the OS firewall.
- Non-functional: no measurable added latency to legitimate SMTP/SSH traffic; agent survives
  reboot (systemd-enabled); doesn't interfere with existing Postfix→policy_daemon flow on
  127.0.0.1:10030.

## Architecture
```
Internet ──(:25)──> Postfix ──(check_recipient_access)──> policy_daemon (127.0.0.1:10030)
Internet ──(:22)──> sshd
             │                          │
             ▼                          ▼
   /var/log/mail.log or        /var/log/auth.log or
   journalctl _SYSTEMD_UNIT=   journalctl _SYSTEMD_UNIT=
   postfix@-.service           ssh.service
             │                          │
             └──────────┬───────────────┘
                         ▼
                crowdsec.service (agent + local API, 127.0.0.1:8080)
                    parsers: postfix-logs, postscreen-logs, sshd-logs
                    scenarios: postfix-spam, postfix-relay-denied,
                               postfix-helo-rejected, postfix-non-smtp-command,
                               ssh-bf (+ slow-bruteforce)
                         │
                         ▼ (decisions)
              crowdsec-firewall-bouncer.service (nftables)
                         │
                         ▼
                 OS firewall DROP rule for banned IP

(Out of scope, external prerequisite — NOT implemented by this phase: the web app's :80/:443
 should eventually be firewalled to accept only Cloudflare's published IP ranges. Tracked as a
 separate infrastructure change; see Overview.)
```

## Related Code Files
- Create: `deploy/crowdsec/acquis-postfix-sshd.yaml` (source of truth checked into repo,
  copied to `/etc/crowdsec/acquis.d/` at install time — mirrors how `deploy/postfix_main_snippet.cf`
  is a checked-in template applied by `deploy/install.sh`).
- Create: `deploy/crowdsec/whitelists.local.yaml.example` — template for admin/relay IP
  whitelist; the real filled-in version stays host-local (like `config.json`'s secrets), never
  committed.
- Modify: `deploy/install.sh` — add a guarded section that installs the CrowdSec APT repo +
  packages if not already present, copies `acquis-postfix-sshd.yaml` into
  `/etc/crowdsec/acquis.d/`, and runs `cscli collections install crowdsecurity/postfix
  crowdsecurity/sshd`. Keep this idempotent (check `dpkg -s crowdsec` first) like the rest of
  `install.sh`'s existing guards.
- Modify: `README.md` — new "CrowdSec" section under Production installation, cross-referencing
  this plan's ops doc (Phase 6). Also correct the existing "Running behind Cloudflare Tunnel"
  section's premise — actual topology is Cloudflare's DNS proxy, not a Tunnel — and note that
  locking the origin firewall to Cloudflare's IP ranges is a required, separately-tracked
  follow-up, not something this repo's install scripts do.
- No changes to `src/policy_daemon.py` or any application code in this phase.

## Implementation Steps
<!-- Red Team Session 1: Finding 2 (curl|sh unpinned) applied to step 3 -->
1. On the real target host, determine Postfix's actual log destination
   (`systemctl status rsyslog`, check for `/var/log/mail.log`) — record the answer in this
   phase file's Todo List before writing `acquis-postfix-sshd.yaml`.
2. **Before installing anything**: populate `whitelists.local.yaml.example` with placeholders
   for the admin's SSH source IP and any known secondary-MX/relay IPs, and fill in the real
   `/etc/crowdsec/parsers/s02-enrich/whitelists.local.yaml` on the host. Do this *before* Step 4
   installs the firewall-bouncer package — verify at implementation time whether
   `apt install crowdsec-firewall-bouncer-nftables` leaves the service disabled/stopped by
   default; if it auto-registers/auto-starts, whitelisting after install (the previous ordering
   in this plan) risks a same-day admin lockout before the soak period even begins.
3. Write `deploy/crowdsec/acquis-postfix-sshd.yaml` with the correct `source:` stanza (file or
   journalctl) for both Postfix and sshd, per Researcher 1 §2.
4. Add the CrowdSec install block to `deploy/install.sh`. Pin to a specific CrowdSec APT repo
   release (not a bare `curl -s https://install.crowdsec.net | sudo sh` with no version pin or
   integrity check — that pipes a live third-party script into a root shell on a host that also
   holds `config.json` secrets) and verify the repo's GPG key fingerprint out-of-band before
   first trust. Then: `apt install -y crowdsec crowdsec-firewall-bouncer-nftables` → copy acquis
   file → `cscli collections install crowdsecurity/postfix crowdsecurity/sshd` →
   `systemctl enable --now crowdsec`.
5. **Soak, monitor-only**: do NOT enable the firewall bouncer yet. Run for at least 48h,
   periodically checking `cscli alerts list` and `cscli decisions list` for false positives
   against real traffic (legitimate MTA retries, admin SSH sessions).
6. Before enabling the bouncer, configure its decision-scope filtering so it only enforces
   decisions originating from Phase 1's own Postfix/sshd scenarios — **not** Phase 3's app-layer
   scenarios (added later against the same local LAPI). Verify the current CrowdSec
   mechanism for this (bouncer-side `scenarios`/origin filter, or scenario `labels` + a matching
   bouncer config key — confirm exact syntax against `docs.crowdsec.net` at implementation
   time, don't guess) before Step 7. Without this, once Phase 3 lands, this bouncer will start
   enforcing app-layer bans too — collateral-blocking shared-IP/CGNAT SSH access for an
   unrelated web-abuse signal, and defeating Phase 3's own "monitor-only until Phase 4 exists"
   assumption.
7. Once false-positive rate looks acceptable: `cscli bouncers add firewall-bouncer`, fill the
   printed key into `/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml`, `systemctl
   enable --now crowdsec-firewall-bouncer`.
8. Verify: `cscli bouncers list` shows the bouncer connected; `cscli metrics` shows non-zero
   parsed events for both `postfix-logs` and `sshd-logs`.

## Out of scope (external prerequisite)
Locking the web app's origin port (80/443) to Cloudflare's published IP ranges — validated as
out of scope for this plan (Validation Session 1). Confirmed the origin isn't currently
firewalled this way; tracked as a separate infrastructure change with its own maintenance
window. Until that lands, Phase 4's Cloudflare-edge enforcement (and the `CF-Connecting-IP`
trust it depends on) is bypassable by connecting to the origin directly — see plan.md Overview
and Phase 4's Key Insights for the residual-risk note.

## Todo List
- [ ] Confirm Postfix log destination on real host (rsyslog file vs journald-only)
- [ ] Write `whitelists.local.yaml.example`, fill in real whitelist file, verify package
      install doesn't auto-enable the bouncer before this
- [ ] Write `deploy/crowdsec/acquis-postfix-sshd.yaml`
- [ ] Add CrowdSec install block to `deploy/install.sh` (idempotent, pinned repo version,
      GPG fingerprint verified)
- [ ] Soak 48h+ monitor-only, review `cscli alerts list`
- [ ] Configure bouncer decision-scope filter (Postfix/sshd scenarios only, exclude Phase 3's
      app-layer decisions)
- [ ] Enable firewall bouncer, verify `cscli bouncers list` / `cscli metrics`
- [ ] Update README with new CrowdSec section + correct Tunnel→DNS-proxy topology + note the
      origin-firewall lockdown as a separately-tracked required follow-up

## Success Criteria
- `crowdsec.service` and `crowdsec-firewall-bouncer.service` both `active (running)` and
  `enabled` after a reboot.
- `cscli metrics` shows Postfix and sshd parsers processing real log lines.
- A synthetic SSH brute-force test (from a throwaway IP/VM, NOT the admin's own IP) results in
  a `cscli decisions list` ban and a subsequent connection drop.
- No false-positive ban on the admin's own IP or any known relay IP during the soak period.

## Risk Assessment
- **Risk**: wrong `acquis.yaml` source type (file vs journald) silently means zero events
  parsed, giving false confidence. **Mitigation**: Step 8's `cscli metrics` check is mandatory
  before calling this phase done — a "some events parsed" count is the actual proof, not
  service-active status alone.
- **Risk**: admin lockout via SSH ban. **Mitigation**: soak-first (Step 5), whitelist admin IP
  *before* the package is even installed (Step 2, reordered ahead of Step 4 — see Red Team
  Session 1 Finding 8), keep an out-of-band access path (cloud provider console) available
  during first enforcement window.
<!-- Red Team Session 1: Finding 4 applied -->
- **Risk**: without decision-scope filtering (Step 6), this bouncer enforces every LAPI
  decision, including Phase 3's later app-layer bans — collateral-blocking a shared-IP/CGNAT
  SSH client for an unrelated web-abuse signal, and enforcing Phase 3's unproven scenarios
  before Phase 3's own soak period is meant to have completed. **Mitigation**: Step 6's scope
  filter is a hard prerequisite for Step 7, not optional polish.
- **Risk (accepted, out of scope)**: without the origin-firewall lockdown (validated as a
  separate initiative, not part of this phase), Phase 4's Cloudflare-edge enforcement remains
  bypassable by connecting to the origin directly. **Mitigation**: none within this plan —
  tracked as a required external follow-up; documented loudly in plan.md, this phase, and
  Phase 4 so it isn't forgotten.

## Security Considerations
- `crowdsec-firewall-bouncer.yaml`'s `api_key` is a bearer credential for the local LAPI — keep
  file mode `0600`, owned by root, same posture as this repo's `config.json` convention.
- Local LAPI listens on `127.0.0.1:8080` only — do not expose it externally.

## Next Steps
- Phase 3 depends on this phase's `crowdsec.service`/LAPI existing (custom scenarios register
  against the same local agent).
- **Phase 4's real security guarantee depends on the out-of-scope origin-firewall lockdown**
  (see above) landing as its own separately-tracked change — not something this phase or Phase 4
  implements, but a prerequisite worth flagging again at handoff.
- Phase 6 folds this phase's install steps into the documented ops runbook.
