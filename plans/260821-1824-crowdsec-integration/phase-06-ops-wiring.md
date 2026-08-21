# Phase 6 — Ops wiring: deploy docs, hub auto-update, rollback

## Context Links
- `deploy/install.sh`, `deploy/deploy.sh`, `deploy/release.sh` (existing checkout/release
  conventions this phase must match)
- `deploy/tmail-janitor.timer` (existing systemd-timer pattern to mirror for hub auto-update)
- All prior phases (this phase consolidates their install steps into one coherent runbook)

## Overview
- Priority: P2
- Status: Pending
- Tie Phases 1-4 (and optionally 5) together into one documented, idempotent install path
  consistent with this repo's existing `deploy/install.sh` conventions, add a hub-auto-update
  timer (CrowdSec collections don't self-update), and write an explicit rollback procedure.

## Key Insights
- Every prior phase already specifies its own `deploy/install.sh` addition individually — this
  phase's job is to make sure those additions compose cleanly (correct order: Phase 1's agent
  install must run before Phase 3's parser/scenario copy, which must run before Phase 4's
  bouncer install) and are all idempotent (safe to re-run, matching `install.sh`'s existing
  style).
- Hub updates (`cscli hub update && cscli hub upgrade`) are **not automatic** by default
  (Researcher 1 §5) — this repo already has exactly this shape of problem solved once for
  `email_janitor` (`deploy/tmail-janitor.timer`); reuse that pattern rather than inventing a new
  one.
- Rollback must be genuinely safe: CrowdSec bans are IP-based and can lock out legitimate
  traffic (including the admin). A rollback procedure that's just "uninstall the package" isn't
  enough — need a documented fast-path to *disable enforcement without uninstalling* (stop the
  bouncer services, leave the agent in monitor-only mode) as the first response to a bad ban,
  before considering a full uninstall.

## Requirements
- Functional: a fresh `sudo bash deploy/install.sh` run on a clean host installs and configures
  all of Phases 1-4 (5 if in scope) in the correct order, ending in monitor-only mode (bouncers
  installed but the operator must explicitly flip them to enforcing per each phase's soak
  step — this phase does NOT auto-enable enforcement).
- Non-functional: every step is idempotent (re-running `install.sh` doesn't break an
  already-configured host); rollback doesn't require an SSH session if one is already
  locked out (i.e. the emergency disable path must be executable via the cloud provider's
  console/rescue mode, not require CrowdSec-blocked SSH to still work — document this
  explicitly).

## Architecture
```
deploy/install.sh
   │
   ├─ Phase 1: crowdsec agent + Postfix/sshd collections (monitor-only)
   ├─ Phase 3: tmail custom parser/scenario + acquis (monitor-only)
   ├─ Phase 1: firewall-bouncer install (NOT enabled — soak step is manual, per Phase 1)
   ├─ Phase 4: cloudflare-bouncer install (NOT enabled — soak step is manual, per Phase 4)
   ├─ (optional) Phase 5: snapshot timer install
   └─ new: crowdsec-hub-update.timer (mirrors tmail-janitor.timer)

Emergency disable path (documented, not scripted — deliberately manual):
   systemctl stop crowdsec-firewall-bouncer crowdsec-cloudflare-bouncer
   (agent keeps running in monitor-only; no new bans enforced; existing OS firewall
    rules from a stopped bouncer are cleared on its own stop hook)

   <!-- Red Team Session 1: Finding applied --> STOPPING THE DAEMON IS NOT ENOUGH FOR A
   CLOUDFLARE-SIDE BAN: entries the cloudflare-bouncer already pushed to the Cloudflare IP List
   persist at the edge indefinitely — the daemon that would retract them is now stopped. If the
   incident involves a Cloudflare-side block (an admin or legitimate visitor locked out via the
   web app, not SSH/Postfix), the emergency-disable procedure MUST also remove the specific IP
   from the `crowdsec_<prefix>` IP List via the Cloudflare dashboard/API as an explicit next
   step — not deferred to the heavier "Rollback/uninstall" section.
```

## Related Code Files
- Modify: `deploy/install.sh` — sequence and idempotency-guard all additions from Phases 1, 3,
  4 (and 5 if kept in scope); add the CrowdSec section clearly delimited (comment header) so
  it's easy to locate/remove later if this integration is ever reverted.
- `<!-- Red Team Session 1: Finding applied — resolved from a speculative Risk Assessment note
  into a required action -->` Modify: `deploy/deploy.sh` — add every new CrowdSec-related unit
  file this plan creates (`tmail-crowdsec-snapshot.service`/`.timer` from Phase 5 if kept,
  `tmail-crowdsec-hub-update.service`/`.timer` from this phase) to its existing hardcoded `scp`
  file list — verified
  that list currently only includes `tmail-policy.service tmail-api.service
  tmail-janitor.service tmail-janitor.timer deploy/release.sh`. Without this, none of this
  plan's new units are reachable through the normal redeploy path; only a full `install.sh`
  re-run would ever pick up a later change to them.
- Modify: `deploy/release.sh` — add the same new unit names to its `UNITS` array so they're
  included in the install/backup/stop/restore rollback loop every redeploy already performs for
  the existing four units.
- Create: `deploy/tmail-crowdsec-hub-update.service` + `.timer` — `cscli hub update && cscli hub
  upgrade`, daily, systemctl reload crowdsec on success. Mirror `tmail-janitor.timer`'s
  `OnCalendar`/`Persistent=true` shape.
- Modify: `README.md` — add a top-level "CrowdSec" section (or a new `docs/crowdsec.md` if the
  README section would get too long — prefer a separate doc, linking from README, given how much
  operational detail this needs: install order, soak procedure, emergency disable, credential
  locations).
- Create: `docs/crowdsec.md` — the consolidated runbook: install order, where each credential/
  config file lives, soak checklist (from Phases 1/3/4), emergency disable procedure (including
  the Cloudflare IP List retraction step), rollback/uninstall procedure, the hub-update timer's
  behavior, the CAPI/Console enrollment decision (see Implementation Steps), and a periodic-
  review reminder for the whitelist files (admin IPs change; Phase 1/3's whitelists are static).

## Implementation Steps
1. Once Phases 1, 3, 4 (and 5 if kept) are implemented, sequence their `deploy/install.sh`
   additions in dependency order, wrapped in one clearly-commented "CrowdSec integration"
   section.
2. Add idempotency guards to each step (`dpkg -s crowdsec &>/dev/null ||`, check-before-copy for
   config files, `cscli collections list | grep -q ... ||` before install) consistent with
   `install.sh`'s existing guard style.
3. Add `tmail-crowdsec-hub-update.service`/`.timer`, wire into `install.sh`.
4. Add every new unit this plan creates to `deploy/deploy.sh`'s scp list and
   `deploy/release.sh`'s `UNITS` array (see Related Code Files) — do this before writing
   `docs/crowdsec.md` so the doc can accurately describe the real redeploy path.
5. Write `docs/crowdsec.md`:
   - Install order and what each phase's soak step requires before flipping to enforcing.
   - Credential/config file locations table (LAPI keys, Cloudflare token, whitelist files) —
     never the values themselves.
   - **Emergency disable** procedure, prominently placed, tested to work without requiring
     CrowdSec-blocked SSH (i.e. runnable from a cloud console session) — including the
     Cloudflare IP List retraction step for a web-layer ban (see Architecture).
   - Rollback/uninstall procedure (stop + disable all CrowdSec units, `apt remove
     crowdsec crowdsec-firewall-bouncer-nftables cs-cloudflare-bouncer`, remove the Cloudflare
     IP List + WAF rule manually via dashboard, remove `deploy/crowdsec/*` install-time copies).
   - **CAPI/Console enrollment decision (validated, Session 1): enrolled.** Document that this
     deployment runs `cscli console enroll <enroll-key>`, consuming the community blocklist and
     sharing anonymized attack signals back to CrowdSec's network. Include the enrollment
     command and where the resulting dashboard is accessible, so this isn't just a policy
     statement with no operational instructions.
   - **Whitelist maintenance**: a periodic-review reminder that Phase 1's SSH/relay whitelist
     and Phase 3's admin-web-access whitelist are static files with no drift detection — if the
     admin's IP or a relay's IP changes, the whitelist needs a manual update, or a routine SSH
     login / mistyped password risks a real lockout.
   - **Origin firewall lockdown (external prerequisite, out of scope for this plan)**: document
     clearly, as a handoff item, that Phase 4's Cloudflare-edge enforcement has no real security
     guarantee until the origin's :80/:443 is firewalled to Cloudflare's published IP ranges —
     a separate, validated-out-of-scope infrastructure change (see plan.md Validation Log). This
     doc should name it explicitly so it isn't lost between teams/sessions.
6. Link `docs/crowdsec.md` from `README.md`'s Production installation section.
7. Full dry run on a throwaway VM/container: fresh `deploy/install.sh` run end-to-end, confirm
   idempotent re-run produces no errors, confirm the emergency-disable command actually stops
   enforcement without touching the agent, and confirm a change to a CrowdSec-related file
   actually propagates through `deploy/deploy.sh` on a second (non-fresh-install) run — proving
   Step 4's fix, not just that it was written.

## Todo List
- [ ] Sequence + guard all CrowdSec `install.sh` additions
- [ ] Add `tmail-crowdsec-hub-update.service`/`.timer`
- [ ] Add all new CrowdSec units to `deploy/deploy.sh`'s scp list and `deploy/release.sh`'s
      `UNITS` array
- [ ] Write `docs/crowdsec.md` (install order, credentials table, emergency disable +
      Cloudflare retraction step, rollback, CAPI/Console decision, whitelist-maintenance note)
- [ ] Link from README
- [ ] Fresh-VM dry run: install, idempotent re-run, emergency-disable test, verify
      `deploy/deploy.sh` actually redeploys a changed CrowdSec file

## Success Criteria
- `sudo bash deploy/install.sh` on a clean host completes without error, ends in monitor-only
  mode for both bouncers.
- Re-running `install.sh` on an already-configured host is a no-op (no duplicate units, no
  errors).
- The emergency-disable command from `docs/crowdsec.md` stops both bouncers within seconds,
  verified on the dry-run VM.
- `cscli hub upgrade` runs automatically per the new timer's schedule (verify via
  `systemctl list-timers`).
- `deploy/deploy.sh`/`deploy/release.sh` include every new CrowdSec-related unit — verified by
  actually redeploying a changed file through the normal path, not by reading the script.
- `docs/crowdsec.md` explicitly documents the CAPI/Console enrollment decision (enrolled) with
  the actual `cscli console enroll` step, and names the origin-firewall lockdown as an external
  handoff item, not left implicit.

## Risk Assessment
- **Risk**: install order wrong (e.g. Phase 4's bouncer install runs before Phase 1's agent
  exists), whole install fails partway leaving an inconsistent host state. **Mitigation**: Step
  6's fresh-VM dry run is the actual proof, not just reading the script.
- **Risk**: emergency-disable documented but never actually tested, fails exactly when needed
  (a real incident). **Mitigation**: Step 6 explicitly tests it, not just writes it.
- `<!-- Red Team Session 1: Finding applied — confirmed as a real gap, not just a maybe -->`
  **Risk**: `deploy/deploy.sh`/`deploy/release.sh` (used for *later* deployments, distinct from
  first-time `install.sh`) only scp/manage a hardcoded file/unit list that does not include any
  of this plan's new systemd units. **Confirmed, not hypothetical**: without Step 4's fix, a
  later change to any CrowdSec-related file this plan creates has no route into production
  except a full `install.sh` re-run — `deploy/release.sh`'s rollback loop also wouldn't touch
  these units on a failed release, leaving them running against a rolled-back release directory.
  **Mitigation**: Step 4 adds them to both scripts; Step 7's dry run proves it actually works
  end-to-end, not just that the lines were added. (Separately, `/etc/crowdsec/*` itself is
  OS-package-managed, not part of this repo's release directory, and correctly stays out of
  `release.sh`'s config-preservation logic — that part of the original concern was a
  non-issue; the real gap was the *unit files this plan adds under `deploy/`*, not
  `/etc/crowdsec/*`.)

## Security Considerations
- `docs/crowdsec.md`'s credential-location table must list *paths*, never values — same
  discipline as this repo's existing README already applies to `config.json` secrets.
- The CrowdSec integration section in `install.sh` should be trivially removable (one
  contiguous, clearly-delimited block) in case this integration is ever reverted — avoid
  interleaving CrowdSec steps with unrelated existing `install.sh` logic.

## Next Steps
- None — this is the final phase. After this phase, re-run `superpowers:requesting-code-review`
  or this project's `/code-review` before considering the whole plan done.
