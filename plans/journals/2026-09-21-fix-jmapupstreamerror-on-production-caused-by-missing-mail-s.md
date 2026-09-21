---
title: Fix JmapUpstreamError on Production Caused by Missing Mail Subdomain SSL and Nginx Vhost
date: 2026-09-21
summary: "Resolved JmapUpstreamError 502 failures by configuring Nginx reverse proxy for mail.tm-mails.com, installing Stalwart's matching TLS certificate, and scheduling automated cert sync."
---

# Fix JmapUpstreamError on Production Caused by Missing Mail Subdomain SSL and Nginx Vhost

## What happened
- **Incident**:
  - At 2026-09-21 16:17 UTC (11:17 PM local time), requests to `/messages?page=1` and `POST /admin/api/sync-domains` returned HTTP 502 with unhandled exception:
    `httpx.ConnectError: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch, certificate is not valid for 'mail.tm-mails.com'.`
    raising `JmapUpstreamError: JMAP upstream request failed`.
  - **Root Cause**:
    1. During the earlier incident response, Stalwart's HTTPS listener was relocated from port 443 to port 8443 to resolve port 443 hijacking of the apex web domain `tm-mails.com`.
    2. Nginx was placed on port 443 with an SSL certificate issued via Certbot exclusively for `tm-mails.com`.
    3. No Nginx virtual host (`server` block) was created for `mail.tm-mails.com`.
    4. When `tmail-api` performs JMAP session discovery (`/.well-known/jmap`), Stalwart returns `"apiUrl": "https://mail.tm-mails.com/jmap/"`.
    5. `JmapClient` then makes all JMAP POST calls to `https://mail.tm-mails.com/jmap/` (port 443 on the VPS origin IP `169.224.224.110`).
    6. Because Nginx only had the certificate for `tm-mails.com`, Python's `httpx` client failed hostname verification against `mail.tm-mails.com`.
    7. Furthermore, Certbot HTTP-01 dry-run for `mail.tm-mails.com` was blocked by Stalwart's published CAA record pinning issuance to its own Let's Encrypt ACME account URI (`3673568655`).

## Key Changes & Actions Taken
1. **Certificate Extraction & Installation**:
   - Stalwart already held an active, valid Let's Encrypt certificate for `mail.tm-mails.com` and `*.mail.tm-mails.com` (`jbvy171tkuaa`, valid through 2026-11-25).
   - Extracted the full certificate chain and matching private key from Stalwart and installed them to `/etc/ssl/certs/mail.tm-mails.com.fullchain.pem` (mode 0644) and `/etc/ssl/private/mail.tm-mails.com.privkey.pem` (mode 0600).
2. **Nginx Reverse Proxy for `mail.tm-mails.com`**:
   - Added WebSocket upgrade mapping in `/etc/nginx/conf.d/websocket.conf`.
   - Created `/etc/nginx/sites-available/mail` listening on ports 80 and 443 SSL for `server_name mail.tm-mails.com;`.
   - Reverse-proxied all requests to Stalwart at `http://127.0.0.1:8080` with `proxy_buffering off;`, `client_max_body_size 50M;`, and WebSocket upgrade headers.
   - Enabled site via `/etc/nginx/sites-enabled/mail`, validated with `nginx -t`, and reloaded Nginx.
3. **Automated Certificate Synchronization**:
   - Deployed synchronization script at `/usr/local/bin/sync-stalwart-certs.py` to automatically detect renewed certificates in Stalwart, update Nginx SSL paths, and reload Nginx.
   - Created and enabled systemd service and timer `sync-stalwart-certs.timer` scheduled to run daily at 04:00:00.
4. **Stalwart CAA Record Policy Cleanup**:
   - Disabled CAA publishing on Stalwart Domain `c` (`mail.tm-mails.com`) via `stalwart-cli update Domain c --field dnsManagement/publishRecords/caa=false` to prevent Let's Encrypt account-pinning conflicts with external cert managers.

## Verification & Status
- Origin direct curl `curl -v --resolve mail.tm-mails.com:443:169.224.224.110 https://mail.tm-mails.com/` completes TLS handshake cleanly with subject `CN = *.mail.tm-mails.com`, SAN `mail.tm-mails.com`, and returns HTTP 200 from Stalwart.
- `tmail-api` container verified: JMAP session discovery successfully resolves `https://mail.tm-mails.com/jmap/`, authenticates, and executes `list_messages` and `list_domains` (total 65 domains) without errors.
- End-to-end API test: `POST /token` issued for `sample123@a7.nort4.name.ng` and subsequent `GET /messages?page=1` returned HTTP/2 200 with complete Hydra collection payload.
- Admin console test: Admin login and `POST /admin/api/sync-domains` returned HTTP 200 with all 65 domains successfully synced.

## Decision
- Route both `tm-mails.com` (TMail web frontend/API via Docker on 8081) and `mail.tm-mails.com` (Stalwart mail server on 8080) through host Nginx on port 443, separating concerns cleanly via SNI virtual hosts.
- Use the automated `sync-stalwart-certs.timer` to keep host Nginx TLS assets in lockstep with Stalwart's internal ACME certificate lifecycle.

## Next steps
- Monitor `sync-stalwart-certs.timer` around the next renewal window (late October 2026) to verify seamless automated cert rollover.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
