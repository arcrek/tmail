---
title: "Two-column inbox and web domain blacklist"
description: "Place the temporary address beside messages and let admins deny web access for selected receiving domains."
status: completed
progress: completed
priority: P2
effort: 5h
issue: null
branch: main
tags: [feature, frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-08-12
---

# Two-column inbox and web domain blacklist

## Overview

Make the inbox desktop layout two columns: address/actions on the left, messages or reader on the right. Add an admin-managed blacklist for domains that remain configured at MX/mail-server level but cannot be selected, opened, or read through the public web application.

## Scope challenge

- Existing code: `InboxView.vue` and its CSS already own the inbox layout. Settings are persisted as JSON key/value rows; `DomainsTab.vue` already edits newline/comma domain lists.
- Minimum change: one persisted `blacklisted_domains` setting, filtered only at public-web authorization/discovery boundaries, one admin textarea, and layout CSS/template changes.
- Complexity: 8 files, no dependency or DB migration. Preserve `active_domains()` as the mail-server source of truth so MX delivery is untouched.

## Decisions

- “Blacklist” means deny browser/API access, not mail delivery. A blacklisted domain remains visible in the admin receiving-domain list and continues to be handled by the mail server.
- Filter it from `/domains`, `/domains/{id}`, address creation, token issuance, and all bearer-token message routes. Previously issued tokens stop working because their shared `bearer_address` dependency revalidates the address.
- Use the existing admin settings endpoint and list normalization; do not add an endpoint, table, migration, or a second domain cache.
- Use two columns only at the existing desktop breakpoint; collapse back to one column on compact screens.

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Enforce web-domain blacklist](./phase-01-web-domain-blacklist.md) | Completed |
| 2 | [Expose blacklist in domain administration](./phase-02-admin-blacklist-control.md) | Completed |
| 3 | [Lay out the inbox in two columns](./phase-03-inbox-two-columns.md) | Completed |

## Dependencies

- Phase 2 depends on Phase 1's settings contract.
- Phase 3 is independent of the blacklist behavior, but run after Phase 2 for one frontend verification pass.

## Validation

- Backend: `pytest tests/test_api_auth.py tests/test_admin_api.py tests/test_public_api.py`
- Frontend: `npm test -- --run src/tests/AdminApp.test.ts src/tests/InboxView.test.ts`
- Build: `npm run build` from `frontend/`
