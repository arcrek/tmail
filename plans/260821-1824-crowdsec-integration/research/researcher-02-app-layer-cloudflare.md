# Researcher 2 — App-layer custom parser/scenario + Cloudflare bouncer

## 1. Custom parser + scenario (verified via docs.crowdsec.net fetch)

Local (non-hub) parser/scenario directory layout, referenced by path in acquisition config:
```
your-project/
├── parsers/
│   └── s01-parse/
│       └── your-org/
│           └── tmail-logs.yaml
├── scenarios/
│   └── your-org/
│       └── tmail-admin-bruteforce.yaml
└── acquis.yaml
```

Parser skeleton (`parsers/s01-parse/your-org/tmail-logs.yaml`):
```yaml
onsuccess: next_stage
filter: "evt.Parsed.program == 'tmail'"
name: your-org/tmail-logs
description: "Parse tmail JSON access log line"
grok:
  pattern: 'client_ip=%{IP:source_ip} path=%{DATA:path} status=%{NUMBER:status}'
  apply_on: message
statics:
  - meta: service
    value: tmail
  - meta: source_ip
    expression: "evt.Parsed.source_ip"
  - meta: log_type
    expression: "evt.Parsed.status == '401' ? 'auth_failure' : 'other'"
```
(For a JSON log line, use a JSON-parse node instead of grok — same node structure, different
extraction node.)

Scenario skeleton (leaky bucket, 5 failed admin logins/60s/IP):
```yaml
type: leaky
name: your-org/tmail-admin-bruteforce
description: "5 failed admin logins in 60s from one IP"
filter: "evt.Meta.log_type == 'auth_failure' && evt.Parsed.path in ['/admin/login','/admin/api/login']"
leakspeed: "60s"
capacity: 5
groupby: "evt.Meta.source_ip"
blackhole: 5m
labels:
  service: tmail
  type: bruteforce
  remediation: true
```

`acquis.yaml` wiring — journald vs file:
```yaml
# journald source
source: journald
journalctl_filter:
  - "_SYSTEMD_UNIT=tmail-api.service"
labels:
  type: tmail

---
# plain log file, alternative
filename: /var/log/tmail/access.log
labels:
  type: tmail
```
No hub install needed for local parsers/scenarios — point at them by path.

Docs: https://docs.crowdsec.net/docs/next/log_processor/parsers/create/ ,
https://docs.crowdsec.net/docs/next/log_processor/scenarios/create/ ,
https://discourse.crowdsec.net/t/acquis-yaml-and-journald/1706

## 2. Cloudflare bouncer (repo confirmed; mechanics from training knowledge — verify against live docs before finalizing)

- Repo: `crowdsecurity/cs-cloudflare-bouncer` — Go daemon, syncs CrowdSec decisions with
  Cloudflare's firewall; supports multi-user/account/zone, IP/Country/AS-scoped decisions.
  Workers-based variant also exists: `crowdsecurity/cs-cloudflare-worker-bouncer`.
- Mechanics: long-lived daemon, polls local LAPI's `/v1/decisions/stream` on an
  `update_frequency` interval, translates decisions into Cloudflare updates. Rather than one
  custom rule per banned IP (would blow through per-zone WAF custom-rule limits), it maintains
  a Cloudflare account-level **IP List** (`ip_list_prefix`) and a single WAF custom rule per
  zone like `ip.src in $crowdsec_<prefix>` with `action`: block/challenge/js_challenge.
- Token scope: API Token (not legacy Global Key) with Account "Account Filter Lists: Edit" +
  Zone "Firewall Services: Edit". Generation helper:
  `crowdsec-cloudflare-bouncer -g <TOKEN1>,<TOKEN2> -o /etc/crowdsec/bouncers/crowdsec-cloudflare-bouncer.yaml`.
- Config skeleton (`/etc/crowdsec/bouncers/crowdsec-cloudflare-bouncer.yaml`):
```yaml
crowdsec_lapi_url: http://localhost:8080/
crowdsec_lapi_key: <bouncer-api-key>
crowdsec_update_frequency: 10s

cloudflare_config:
  accounts:
    - id: <cf-account-id>
      token: <cf-api-token>
      ip_list_prefix: crowdsec
      default_action: challenge     # block | challenge | js_challenge
      zones:
        - zone_id: <cf-zone-id>
          actions:
            - block
          remediation: true
  update_frequency: 30s
```

## 3. Tunnel compatibility

Enforcement happens entirely at Cloudflare's edge (IP List + WAF custom rule evaluated on
inbound requests to the zone), independent of how traffic reaches the origin afterward
(Tunnel, direct, Spectrum). Correct fit for this topology precisely because a local firewall
bouncer would be a no-op — the tunnel only carries traffic Cloudflare already decided to
forward. No tunnel-specific caveat; the bouncer never touches `cloudflared` or the origin
firewall.

**Interaction with existing WAF/rate-limiting rules**: the bouncer's rule sits in the standard
evaluation chain alongside hand-written WAF custom rules and Rate Limiting rules. Order
matters — deconflict priorities so CrowdSec's reputation-based, longer-lived rule and any
existing short-window rate-limiting rule don't fight over the same request. WAF custom rule
counts are plan-tiered (far fewer on Free vs Business/Enterprise) — the bouncer's one-rule-plus-list
design is precisely what avoids exhausting that quota.

## 4. Lightweight alternative (cron-based, no daemon)

Cron job running `cscli decisions list -o json`, diffing against the current Cloudflare IP
List, calling the bulk Lists API (`PUT /accounts/{account_id}/rules/lists/{list_id}/items`) to
replace/patch it.
- Pros: no long-running process, easy to bolt onto this repo's existing systemd-timer pattern
  (`email_janitor`), lower operational surface.
- Cons: ban-propagation latency vs the daemon's near-real-time `update_frequency`; must
  hand-roll decision-expiry cleanup; no built-in multi-account/zone orchestration, retries, or
  metrics.

## 5. LAPI decision export & rate-limit gotchas

- `cscli decisions list -o json` — snapshot export, fine for cron-based push.
- LAPI `GET /v1/decisions/stream` — streaming endpoint bouncers are built around (`new`/`deleted`
  deltas); this is what the daemon's `update_frequency` drives.
- Cloudflare-side gotchas to flag in the design:
  - Global Cloudflare API rate limit ~1200 requests/5 minutes per token — bulk IP List updates
    (single PUT with many items) avoid this far better than one call per IP/rule.
  - Bulk Lists have a per-list item cap that varies by plan tier — capacity-check against
    expected ban volume.
  - Legacy per-zone "IP Access Rules" have much lower per-zone count limits — wrong target for
    anything beyond a handful of static blocks; confirm the design targets bulk IP Lists + one
    WAF custom rule, not per-IP Access Rules.

## Sources
- https://docs.crowdsec.net/docs/next/log_processor/parsers/create/
- https://docs.crowdsec.net/docs/next/log_processor/scenarios/create/
- https://discourse.crowdsec.net/t/acquis-yaml-and-journald/1706
- https://github.com/crowdsecurity/cs-cloudflare-bouncer
- https://github.com/crowdsecurity/cs-cloudflare-worker-bouncer
- https://docs.crowdsec.net/docs/bouncers/cloudflare/ (page confirmed via search; exact config
  keys/permissions not independently re-verified by fetch this session — re-check before
  finalizing)
