# Phase 2 — Add manual domains to the active whitelist

Status: Complete.

## Overview

Let an administrator enter one receiving domain and add it to the active whitelist while automatic synchronization stays enabled.

## Related Code

- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/admin/DomainsTab.vue` to replace the free-form manual-domain textarea with the one-value Add control.
- Modify `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/AdminApp.test.ts` to cover the Add interaction and success/failure state.

## Implementation

1. Reuse the existing `manual_domains` setting, server-side `_list(..., _domain)` normalization, authenticated `GET/PUT /admin/api/settings`, and `active_domains()` union. These already make a saved manual domain part of public `/domains` and address-token validation; do not alter backend code or API types.
2. In `DomainsTab.vue`, replace `draft.manualDomains` and its textarea with a single domain input plus a button labelled “Add”. Keep the pending/error/status handling and disable the control while a request is active.
3. On Add, trim the input, return without a request when it is empty, and submit only `{ site: { manualDomains: [...props.site.manualDomains, enteredDomain] } }` to the existing `api.admin.updateSettings`. Do not mutate the displayed whitelist optimistically.
4. On success, clear the input, emit the returned settings, and call the existing `applySettings(settings, true)`. Its `settings.domains` value is already the normalized, deduplicated active whitelist, so the newly added domain appears immediately. On a 422/network failure, retain the typed value, show the existing error treatment, and leave the list unchanged.
5. Add a focused `DomainsTab` test: adding mixed-case/whitespace input sends the existing API call, waits for the mocked response, clears the input, and renders the returned whitelist. Add a failure assertion that input/list state is retained. Backend tests already prove persistence, normalization, deduplication, and active-domain resolution.

## Acceptance Criteria

- Clicking Add for a valid manual domain while auto-sync is enabled makes it appear in “Active whitelist”, selectable on the public address panel, and acceptable to `/token` after the existing settings response succeeds.
- Sync results remain available; sync never deletes a manual domain.
- Disabling auto-sync retains its frozen sync snapshot plus manual domains.
- Invalid, duplicate, or mixed-case inputs normalize or reject through the existing server validation; the admin endpoint remains CSRF-protected and the UI never shows an unsaved value as active.

## Non-Goals

- No direct JMAP provisioning, DNS verification, per-domain metadata, removal UI, separate CRUD endpoint, new state store, or dependency.

## Completion

- Replaced the free-form manual-domain textarea with a one-domain Add form in `DomainsTab.vue`.
- Reused the existing settings update response to refresh the active whitelist; failed saves retain the entered value and current list.
- Added focused frontend coverage for successful add and failed retry behavior.
