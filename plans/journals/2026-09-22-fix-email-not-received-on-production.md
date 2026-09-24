---
title: Fix Email Not Received on Production VPS
date: 2026-09-22
summary: "Diagnosed email delivery failure on production VPS (169.224.224.110): identified Cloudflare proxying mail.tm-mails.com (blocking port 25), fixed Postfix untrusted snakeoil TLS certificate with valid Let's Encrypt cert, resolved tmail-policy systemd dependency race, and verified end-to-end SMTP delivery."
---

# Fix Email Not Received on Production VPS

## Incident Summary
Users reported that emails were not being received on production (`ubuntu@169.224.224.110`).

## Root Cause Analysis
Two primary root causes were identified:

1. **Cloudflare Proxy on MX Host (`mail.tm-mails.com`) - External SMTP Blocker**:
   - All disposable recipient domains (`a7.nort4.name.ng`, `nu.yte.name.ng`, `*.santravin91.name.ng`, etc.) have their MX record pointing to `10 mail.tm-mails.com.`.
   - In Cloudflare DNS, the A record for `mail.tm-mails.com` was set to **Proxied (Orange Cloud)**, resolving to Cloudflare CDN edge IPs (`104.21.78.127`, `172.67.221.195`).
   - Cloudflare CDN **does not support or proxy TCP port 25 (SMTP)**.
   - Any external MTA attempting to connect to `mail.tm-mails.com:25` hit Cloudflare's edge and timed out (`Operation now in progress`), preventing any inbound emails from being received via that hostname.
   - Probed directly:
     - `104.21.78.127:25` -> TIMEOUT
     - `172.67.221.195:25` -> TIMEOUT
     - `169.224.224.110:25` (origin IP) -> SUCCESS

2. **Untrusted Snakeoil Certificate in Postfix - STARTTLS Handshake Abort**:
   - Postfix in `/etc/postfix/main.cf` was using `ssl-cert-snakeoil.pem` and `ssl-cert-snakeoil.key`.
   - External MTAs enforcing TLS certificate validation (e.g. Mailgun, Google) failed the TLS handshake with `SSL alert number 42: bad certificate`, causing dropped connections logged as:
     `warning: TLS library problem: error:0A000412:SSL routines::sslv3 alert bad certificate: SSL alert number 42:`
     `lost connection after STARTTLS`

3. **Systemd Startup Race Condition**:
   - `tmail-policy.service` only had `After=network.target`, causing it to start on boot before Stalwart finished loading RocksDB, triggering:
     `WARNING Could not pre-load domains from Stalwart; retaining cache`.

## Remediations Applied on Server
1. **Configured Postfix with Valid Let's Encrypt TLS**:
   - Pointed Postfix to `/etc/ssl/certs/mail.tm-mails.com.fullchain.pem` and `/etc/ssl/private/mail.tm-mails.com.privkey.pem`.
   - Set private key permissions to `0640`, group `ssl-cert`, and added `postfix` user to `ssl-cert` group.
   - Updated `/usr/local/bin/sync-stalwart-certs.py` to maintain `ssl-cert` group ownership, `0640` permissions, and reload both Nginx and Postfix automatically.
   - Reloaded Postfix.
   - Verified STARTTLS with Python `ssl` context matching `mail.tm-mails.com`: TLS handshake succeeded cleanly with 0 errors.

2. **Fixed Systemd Dependency for `tmail-policy`**:
   - Added `After=network.target stalwart.service` and `Wants=stalwart.service` to `/etc/systemd/system/tmail-policy.service`.
   - Restarted `tmail-policy` and confirmed it successfully pre-loaded all 65 domains from Stalwart.

3. **Required User Action in Cloudflare Dashboard**:
   - In Cloudflare DNS for `tm-mails.com`, change `mail.tm-mails.com` from **Proxied (Orange Cloud)** to **DNS only (Grey Cloud)** pointing to `169.224.224.110`.
   - Ensure the MX record for `tm-mails.com` points to `mail.tm-mails.com` with priority 10.

## Verification
- Sent test email directly to port 25 with STARTTLS to `hello99@s4.yte.name.ng`.
- Postfix received the message, policy daemon approved the recipient domain, Postfix relayed to Stalwart on port 2525, and Stalwart ingested the message.
- Queried TMail API `/token` and `/messages`, successfully receiving the email with full metadata and body.
