# Phase 2 — Keep manual domains alongside sync

Status: Complete.

## Overview

Let an administrator add or remove manually managed receiving domains while automatic synchronization stays enabled.

## Related Code

- Modify `/home/arcrek/workspace/tmail_add_domain/src/api_state.py` to persist a `manual_domains` settings value with the existing SQLite settings model.
- Modify `/home/arcrek/workspace/tmail_add_domain/src/admin_api.py` to validate, return, and merge manual entries.
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/types.ts`, `/home/arcrek/workspace/tmail_add_domain/frontend/src/admin/DomainsTab.vue`, and only the API typing needed for the existing settings update.

## Implementation

1. Add `manual_domains: []` to the default site settings. Include it in the existing `SITE_KEYS` allowlist and validate it with the existing `_list(..., _domain)` normalization path, which rejects malformed domains before persistence.
2. Change `_active_domains()` to return a sorted, deduplicated union of manual entries and the current source: the domain cache when auto-sync is enabled, or the frozen snapshot when it is disabled. Do not write manual entries during sync, toggle, or cache refresh.
3. Expose the setting through the existing authenticated `GET/PUT /admin/api/settings` contract. The public `/domains` endpoint and token validation already route through the active-domain resolver, so they inherit the union without a second API.
4. Add a “Manual receiving domains” textarea to `DomainsTab.vue`, one domain per line or comma-separated, beside the auto-sync control. Save it through the existing settings form, refresh the active-whitelist display from the response, and retain the existing busy/error behavior.

## Acceptance Criteria

- Adding a valid manual domain while auto-sync is enabled makes it selectable on the public address panel and acceptable to `/token`.
- Sync results remain available; sync never deletes a manual domain.
- Disabling auto-sync retains its frozen sync snapshot plus manual domains.
- Invalid, duplicate, or mixed-case inputs normalize or reject through the existing server validation; the admin endpoint remains CSRF-protected.

## Non-Goals

- No direct JMAP provisioning, DNS verification, per-domain metadata, or separate CRUD endpoint.
