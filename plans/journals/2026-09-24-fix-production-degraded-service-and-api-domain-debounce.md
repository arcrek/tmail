---
title: Fix Production Degraded Service and API Domain Debounce
date: 2026-09-24
summary: "Diagnosed and resolved critical server degradation on production VPS (169.224.224.110): configured 2GB swapfile to prevent kernel OOM freezes, tuned Stalwart RocksDB memory buffers, disabled internal Stalwart rate limits causing Postfix queue backup, installed Fail2ban for SSH brute-force defense, implemented 60s debounce cache for GET /domains in admin_api.py, and verified 100% test suite and production health."
---

# Fix Production Degraded Service and API Domain Debounce

## Incident Summary
Production server (`169.224.224.110`) suffered severe degradation: response times spiked to tens of seconds, API became unresponsive (502 / 504 / 522 Cloudflare errors), admin dashboard could not log in, mail list failed to load, and SSH connections were intermittently refused or timed out.

## Root Cause Analysis

1. **Kernel OOM Freezes & Zero Swap**:
   - The production VPS is equipped with 954MB physical RAM and had **0 bytes of swap space**.
   - With baseline service consumption around ~600MB, bursts of activity (JMAP queries, incoming SMTP connections) pushed memory usage beyond 954MB.
   - Without swap, the Linux kernel entered severe memory pressure / thrashing, leading to kernel watchdog timeouts, systemd-journald 3-minute timeouts, DBus communication failures, and SSH pam_systemd session timeouts.
   - Stalwart Mail Server had previously been OOM-killed because its default RocksDB buffer and cache were set to 128MB each (256MB total).

2. **API Request Serialization via `admin_lock` & Missing Debounce**:
   - Every visitor loading the web frontend triggers a call to `GET /domains`.
   - In `src/admin_api.py`, `refresh_domains(request, require_auto=True)` acquired `request.app.state.admin_lock` and performed a synchronous JMAP query (`x:Domain/get`) to Stalwart Mail Server to fetch all 88 configured domains (~141KB JSON payload).
   - Under normal visitor traffic, all incoming requests serialized behind `admin_lock`.
   - Admin login (`/admin/api/login`), session verification, and message retrieval all require `admin_lock` or domain checks, causing complete pipeline blockage with 15s+ response times and timeouts.

3. **Stalwart Inbound Throttle Backlogging Postfix Queue**:
   - Postfix receives inbound emails from external MTAs on port 25 and relays them to Stalwart on `127.0.0.1:2525`.
   - Stalwart had default `MtaInboundThrottle` rules enabled (`jbvyhv3oabab` IP throttle and `jbvyhv3oabqb` address throttle), limiting connections to 5 req/s.
   - Because all forwarded mail originated from `127.0.0.1`, Stalwart treated Postfix as a single flooding client, rejecting deliveries with `452 4.4.5 Rate limit exceeded` or dropping greeting connections.
   - This caused ~900 legitimate emails to accumulate in Postfix's deferred mail queue.

4. **External SSH Brute-Force Exhaustion**:
   - Continuous brute-force attacks from external IPs against port 22 exhausted SSH `MaxStartups` connection slots, causing intermittent connection drops for legitimate admin SSH sessions.

## Remediations Applied

### 1. System Memory & Swapfile Configuration
- Created and activated a 2.0GB swapfile at `/swapfile`:
  ```bash
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  ```
- Persisted swap in `/etc/fstab` and configured kernel virtual memory parameters in `/etc/sysctl.d/99-swap.conf`:
  - `vm.swappiness = 10`
  - `vm.vfs_cache_pressure = 50`
- Available memory recovered to ~460MB with ~212MB non-critical pages paged out safely.

### 2. Stalwart RocksDB Memory Tuning
- Updated `/etc/stalwart/config.json`:
  - Reduced RocksDB `bufferSize` from 134217728 (128MB) to 33554432 (32MB).
  - Reduced RocksDB `cacheSize` from 134217728 (128MB) to 33554432 (32MB).
- Reloaded Stalwart server configuration.

### 3. Disabled Stalwart Inbound Throttle on Internal Relay
- Executed stalwart-cli commands to disable throttles:
  ```bash
  stalwart-cli update MtaInboundThrottle jbvyhv3oabab --field enable=false
  stalwart-cli update MtaInboundThrottle jbvyhv3oabqb --field enable=false
  ```
- Allowed Postfix on `127.0.0.1:2525` to drain the deferred queue without receiving `452 4.4.5 Rate limit exceeded`.

### 4. Installed and Configured Fail2ban
- Installed `fail2ban` and configured `/etc/fail2ban/jail.local`:
  ```ini
  [sshd]
  enabled = true
  backend = systemd
  maxretry = 5
  findtime = 600
  bantime = 3600
  ```
- Active attacker IPs were jailed immediately, eliminating SSH port exhaustion.

### 5. API Debounce Cache in `src/admin_api.py`
- Implemented a 60-second debounce mechanism in `refresh_domains(request, require_auto=True)`:
  - Added module constant `_AUTO_SYNC_DEBOUNCE_SECONDS = 60.0`.
  - When `require_auto=True` and `(time.monotonic() - _last_auto_sync_time) < 60.0`, the function immediately returns `_active_domains(request)` from in-memory cache (< 0.001s) without acquiring `admin_lock` or making remote JMAP HTTP calls.
  - Manual sync requests via Admin UI (`POST /admin/api/sync-domains` with `require_auto=False`) bypass debounce and perform immediate full synchronization.
  - Added unit test `test_auto_sync_domains_debounced` in `tests/test_admin_api.py`.
  - Rebuilt Docker image `ghcr.io/arcrek/tmail-api:latest` using `Dockerfile.api` on production and recreated `tmail-api-1` container.
  - Updated host policy daemon at `/opt/tmail-policy/src/admin_api.py` and restarted `tmail-policy.service`.

## Verification & Results
- **API Performance**:
  - `GET /domains` response time dropped from 15+ seconds (or timeout) to **< 0.05 seconds** (200x faster).
  - Admin login (`POST /admin/api/login`) returns immediately (200 OK).
  - Mail retrieval (`GET /messages`) completes in ~0.15s.
- **Server Health**:
  - Load average dropped from 15+ to **0.15 - 0.25**.
  - Memory: ~490MB used, ~460MB available, swap stable.
  - Postfix mail queue continuously draining into Stalwart mailbox accounts.
- **Test Suite**:
  - All 281 automated tests passed (100%) in local test run.
