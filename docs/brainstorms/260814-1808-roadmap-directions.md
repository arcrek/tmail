---
title: "Further development directions"
date: 2026-08-14
status: agreed
scope: [ux, ops, security]
---

# Further development directions

## Problem statement

User asked for further development directions for TMail (temp-mail service: Postfix policy daemon
+ Stalwart JMAP provisioning, FastAPI backend, Vue3 public inbox + admin console). No specific
pain point reported — open brainstorm. User picked 3 focus areas: end-user inbox UX,
admin/ops, security/anti-abuse. Explicitly out of scope: public developer API / commercialization.

## Current state (scouted)

- Backend: `src/{api_server,admin_api,policy_daemon,jmap_client,domain_cache,mx_checker,
  email_janitor,config,api_auth,api_state,api_models}.py`, 2725 lines total.
- Frontend: Vue3 admin (`AccessTab`, `AdminApp`, `ContentTab`, `DashboardTab`, `DomainsTab`,
  `GeneralTab`, `MailServerTab`) + public inbox (`InboxView`, `MessageReader`, `AddressPanel`,
  `AppHeader`, toast system).
- Already shipped: toast notifications, i18n + locale picker, unlock/lock access-credential flow,
  domain blacklist (manual + sync), retention janitor, attachment download, message source
  download, sandboxed HTML render, fixed-window rate limiter on `/token`, `/unlock`,
  `/admin/login`, `/admin/api/login` (10 req/60s per IP).
- Inbox refresh is client `setInterval` polling (`InboxView.vue`), not push-based.
- `plans/260812-1455-domain-blacklist-patterns` phase 3 is **blocked** — frontend production
  build issue — despite phases 1-2 complete.
- Single shared `admin_password`; no multi-admin identity, no audit trail.
- `POST /accounts` (address creation) is **not** covered by the rate limiter — the only public
  write endpoint left unguarded.

## Evaluated approaches per area

### End-user inbox UX
- **SSE realtime push** (chosen direction) vs. **Web Push/PWA** (rejected: session lifetime for
  temp-mail is short, service-worker/VAPID infra cost doesn't pay off) vs. **keep polling, just
  shorten interval** (rejected: still wasteful, doesn't fix perceived lag).
- **Client-side search/filter** on already-loaded message list — cheap, no backend change.

### Admin & ops
- **Finish blocked wildcard-blacklist plan** vs. starting new admin work first — finishing wins:
  work is 2/3 done, blocking on a build issue, not a design issue.
- **Domain health monitoring** (surface last MX-check result/timestamp on Dashboard) vs. a
  **full audit log** — audit log rejected for now: no multi-admin identity exists yet, so every
  entry would just say "admin", low value until multi-admin ships.
- **Settings change history** (lightweight, no actor attribution needed) kept as a P2 fallback
  for the audit-log itch.

### Security & anti-abuse
- **Extend existing `_FixedWindowLimiter` to `POST /accounts`** (chosen) vs. **CAPTCHA/
  proof-of-work** (rejected: no observed abuse, premature per YAGNI) vs. **admin TOTP 2FA**
  (rejected by user: real security upgrade in principle, but not worth the effort right now).

## Agreed roadmap

**P0 — pay down existing debt / close a real gap, before any new feature work**
1. Unblock `plans/260812-1455-domain-blacklist-patterns` phase 3 — fix the frontend production
   build issue, ship the already-built wildcard blacklist + whitelist-removal work.
2. Extend `_FixedWindowLimiter` (src/api_server.py) to cover `POST /accounts` — closes the one
   unguarded public write endpoint that lets a bot mass-create addresses. Reuses existing
   mechanism, no new dependency.

**P1 — real UX/ops upgrades**
3. SSE realtime inbox push, replacing `setInterval` polling in `InboxView.vue`. Server polls JMAP
   internally, pushes diffs via `StreamingResponse`/SSE per open address session.
4. Client-side inbox search/filter by sender/subject.
5. Domain health monitoring: persist last MX-check timestamp + result in `domain_cache`/
   `mx_checker`, surface failing domains on `DashboardTab.vue`.

**P2 — defer until there's real demand, don't build speculatively**
6. QR code for address sharing on mobile.
7. Lightweight settings change history (no actor attribution).

**Explicitly rejected (YAGNI / insufficient value right now)**
- Full multi-admin audit log — needs multi-admin identity first.
- Web Push / PWA notifications — infra cost too high for typical short temp-mail sessions.
- CAPTCHA / proof-of-work — no observed abuse yet.
- Admin TOTP 2FA — user declined; revisit if admin console access ever becomes higher-stakes.
- Public developer API / SDK / monetization — out of the scope the user picked.

## Risks / dependencies

- SSE item depends on how Stalwart JMAP exposes change notification (need to confirm whether
  JMAP push/EventSource is usable, or whether server-side polling-then-SSE-fanout is the fallback
  — check `jmap_client.py` during planning).
- P0 item 1 unblock needs root-causing the frontend production build failure first (see
  `plans/260812-1455-domain-blacklist-patterns/phase-03-regression-tests.md`).

## Next steps

Run `/ck:plan` per item, starting with P0 (items 1-2), to produce phased implementation plans.
