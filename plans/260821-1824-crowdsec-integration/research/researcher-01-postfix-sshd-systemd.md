# Researcher 1 — CrowdSec core, Postfix/SSH, systemd, install method

## 1. Installation method (Debian/Ubuntu, 2026)

Recommended: native `.deb` via official APT repo — fits this repo's systemd/checkout deploy
model, not Docker.

```bash
curl -s https://install.crowdsec.net | sudo sh   # adds official APT repo
sudo apt install -y crowdsec
```

- Since Debian 12 / Ubuntu 22.04+, nftables is the default firewall backend — install
  `crowdsec-firewall-bouncer-nftables`; use `crowdsec-firewall-bouncer-iptables` on
  older/iptables-based hosts.
- `crowdsec` package installs + enables **`crowdsec.service`** (agent + local API/LAPI) and
  `cscli`. Config: `/etc/crowdsec/config.yaml`. Acquisition: `/etc/crowdsec/acquis.yaml`
  (or drop-ins under `acquis.d/`). Local DB: `/var/lib/crowdsec/data/crowdsec.db` (SQLite).
  LAPI listens on `127.0.0.1:8080` by default.
- Firewall bouncer package installs its own **`crowdsec-firewall-bouncer.service`** unit +
  config at `/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml`; must be separately
  `systemctl enable --now`'d.

## 2. Postfix + SSH log ingestion

**Postfix (confirmed via hub):**
- Collection: `crowdsecurity/postfix` ("Postfix - Bruteforce Protection Collection", v0.5).
- Parsers: `postfix-logs`, `postscreen-logs`. Scenarios: `postfix-spam`,
  `postfix-relay-denied`, `postfix-helo-rejected`, `postfix-non-smtp-command`.
- Expects `/var/log/mail.log` (syslog-style), `type: syslog`:
  ```yaml
  filenames:
    - /var/log/mail.log
  labels:
    type: syslog
  ```
- **Gotcha**: requires Postfix logging via rsyslog to a file. If the host is journald-only
  (common on minimal/hardened images), use instead:
  ```yaml
  source: journalctl
  journalctl_filter:
    - "_SYSTEMD_UNIT=postfix@-.service"
  labels:
    type: syslog
  ```
  **Must verify which logging path the actual target host uses before writing final acquis.yaml.**

**SSH (lower confidence, not re-verified live this session):**
- Collection: `crowdsecurity/sshd`. Parser `sshd-logs`; scenarios `ssh-bf` + slow-bruteforce
  variants.
- File-based: `/var/log/auth.log`, `type: syslog`. Journald equivalent:
  ```yaml
  source: journalctl
  journalctl_filter:
    - "_SYSTEMD_UNIT=ssh.service"
  labels:
    type: syslog
  ```
- Confirm exact current scenario names against `cscli hub list` at implementation time.

## 3. Firewall bouncer

Config: `/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml`
```yaml
mode: iptables        # or nftables
api_url: http://localhost:8080/
api_key: <generated-below>
disable_ipv6: false
deny_action: DROP
```
- `nftables` mode manages its own table/chain/set directly via `github.com/google/nftables`;
  `iptables` mode shells out to `iptables`/`ipset`.
- Registration:
  ```bash
  sudo cscli bouncers add firewall-bouncer
  # paste printed API key into api_key: in the bouncer's yaml
  sudo systemctl enable --now crowdsec-firewall-bouncer
  ```
- Verify: `cscli bouncers list`.

## 4. Community blocklist / CAPI / Console (not re-verified live, general knowledge)

- Fully optional — CrowdSec works standalone (local LAPI + local scenarios), zero cloud
  dependency.
- Enrolling (`cscli console enroll <enroll-key>`) buys: community blocklist consumption +
  a web dashboard. Also shares anonymized attack signals back by default — separately
  toggleable.
- For this repo's threat model (small mail VPS): nice-to-have, not required. Document as an
  opt-in decision, don't silently enable.

## 5. Resource footprint & maintenance

- Single Go binary, light: ~50–150MB RSS idle on a small VPS, low CPU except during log-parsing
  bursts.
- `cscli hub update && cscli hub upgrade` refreshes collections — **not automatic by default**.
  Add a systemd timer (mirrors this repo's existing `email_janitor`/`tmail-janitor.timer`
  pattern) if continuous updates wanted.
- `.deb` package installs `/etc/logrotate.d/crowdsec` for `/var/log/crowdsec.log` — confirm
  retention/compression matches repo conventions, don't assume defaults suffice.

## Mail-server-specific gotchas

- Whitelist admin SSH IP + any legitimate secondary-MX/relay IPs in
  `/etc/crowdsec/parsers/s02-enrich/whitelists.yaml` **before** enabling the firewall bouncer.
- Legit MTA delivery retries can trip `postfix-non-smtp-command`/bruteforce-style scenarios —
  validate tuning against real traffic before enforcement.
- `policy_daemon` (127.0.0.1:10030) needs no bouncer coverage — not internet-facing.
- Soak period recommended: install + collections first, watch `cscli alerts list` without the
  firewall bouncer enforcing, add the bouncer once false-positive rate looks acceptable.

## Sources
- https://github.com/crowdsecurity/crowdsec/issues/1093
- https://hostperl.com/kb/tutorials/install-and-configure-crowdsec-on-debian-13
- https://docs.vultr.com/how-to-install-crowdsec-on-debian-11
- https://app.crowdsec.net/hub/author/crowdsecurity/collections/postfix
- https://github.com/crowdsecurity/cs-firewall-bouncer/blob/main/config/crowdsec-firewall-bouncer.yaml
- https://docs.crowdsec.net/docs/bouncers/firewall/
- https://cubepath.com/docs/security-tools/crowdsec-console-and-bouncer-management

**Caveat**: sshd collection details and exact current `cscli console`/CAPI opt-out flag names
carried over from general knowledge, not a live 2026 doc fetch — re-verify against
`docs.crowdsec.net` and the sshd hub page before finalizing implementation.
