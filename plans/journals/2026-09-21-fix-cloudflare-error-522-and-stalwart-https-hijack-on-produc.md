---
title: Fix Cloudflare Error 522 and Stalwart HTTPS Hijack on Production VPS
date: 2026-09-21
summary: "Resolved Cloudflare 522 timeouts by fixing MTU on Oracle Cloud VPS, moved Stalwart off port 443 to 8443, and configured Nginx with Let's Encrypt SSL on port 443."
---

# Fix Cloudflare Error 522 and Stalwart HTTPS Hijack on Production VPS

## What happened
- **Incident 1 (Cloudflare Error 522)**:
  - Users experienced Cloudflare Error 522 "Connection timed out" when accessing production (`https://tm-mails.com/`) on Oracle Cloud Melbourne VPS (`ubuntu@169.224.224.110`).
  - **Root Cause**: The network interface `ens3` had Oracle Cloud's default MTU of 9000 (Jumbo Frames). Oracle Cloud Internet Gateway only supports MTU 1500, creating a PMTUD black hole. Cloudflare edge nodes (specifically in HKG/APAC) sending TCP handshakes with standard MSS received SYN-ACK with MSS 8960. Transit dropped frames larger than 1500 bytes and ICMP Fragmentation Needed packets were dropped. Netplan had reverted MTU to 9000 after system package upgrades and reboot.

- **Incident 2 (Stalwart Hijacking HTTPS & Port 443 Conflicts)**:
  - When Cloudflare proxy was temporarily switched to DNS-only and back, accessing `https://tm-mails.com/` redirected to `/account` (Stalwart Mail Server WebUI) instead of the TMail Vue frontend.
  - **Root Cause**: Stalwart Mail Server had an HTTPS `NetworkListener` bound directly to `[::]:443`, while host Nginx was only listening on port 80. Any direct HTTPS connection to origin IP `169.224.224.110:443` (due to local client/router DNS cache) hit Stalwart directly.
  - Furthermore, once Stalwart was moved to port 8443, port 443 became completely closed, causing `ERR_CONNECTION_REFUSED` on clients with cached DNS.

## Key Changes & Actions Taken
1. **Network & MTU Fix**:
   - Set interface `ens3` MTU to 1500 immediately.
   - Persisted in `/etc/netplan/99-mtu.yaml` with `mtu: 1500` and `dhcp4-overrides: {use-mtu: false}`.
   - Disabled cloud-init network overwrite via `/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg`.
   - Applied sysctl network optimizations in `/etc/sysctl.d/99-networking.conf`: BBR congestion control (`tcp_congestion_control = bbr`, `default_qdisc = fq`), disabled TCP timestamps (`net.ipv4.tcp_timestamps = 0` to prevent Anycast ECMP PAWS drops), and expanded TCP buffers.
2. **Stalwart Listener Reconfiguration**:
   - Installed `stalwart-cli` at `/root/.cargo/bin/stalwart-cli`.
   - Updated Stalwart's HTTPS `NetworkListener` (`jbvyhwloahab`) bind address from `[::]:443` to `[::]:8443`.
   - Restarted `stalwart.service`. Verified ports 25, 465, 993, 995, 2525, 4190, 8080 (JMAP HTTP), and 8443 (HTTPS) remain active, with port 443 fully released.
3. **Nginx Port 443 & SSL Provisioning**:
   - Installed Certbot and obtained Let's Encrypt certificate for `tm-mails.com` (`/etc/letsencrypt/live/tm-mails.com/`).
   - Configured `/etc/nginx/sites-enabled/tmail` to listen on both port 80 and port 443 with SSL (`listen 443 ssl; listen [::]:443 ssl;`).
   - Temporarily relaxed `cloudflare-allow.conf` to avoid 403 blocks during DNS propagation so clients with cached origin IPs smoothly reach TMail.

## Verification & Status
- `curl -sI https://tm-mails.com/` via Cloudflare proxy returns `HTTP/2 200 OK` (server: cloudflare, content: TMail SPA).
- Direct origin curl `curl -sI -k --resolve tm-mails.com:443:169.224.224.110 https://tm-mails.com/` returns `HTTP/1.1 200 OK`.
- Access logs confirm active user sessions: frontend SPA, `/domains` API, and `/admin` login (`POST /admin/api/login -> 200 OK`).
- Stalwart mail operations and internal backend JMAP connection (`http://127.0.0.1:8080/jmap/`) remain intact.

## Decision
- Standardize origin Nginx to terminate SSL on port 443 and accept HTTP on port 80, allowing Cloudflare SSL mode to be either Flexible or Full/Full (strict) without origin port confusion.
- Keep Stalwart's web/management listener isolated to port 8443 to avoid any port conflicts with public web reverse proxies.

## Next steps
- Once DNS propagation has settled across all client networks, re-verify or re-apply `deploy/cloudflare-nginx-allowlist.sh` if strict Cloudflare origin-shielding is desired.
- Keep `/etc/netplan/99-mtu.yaml` in place to guarantee MTU 1500 across kernel/OS updates.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
