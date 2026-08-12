# Phase 2 — Manage whitelist and blacklist rules

## Overview

**Priority:** P2  
**Status:** Complete  
**Estimate:** 1.5h

Make the existing Domains & Inbox UI expose the policy without a new endpoint or a second form model.

## Related code files

- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/admin/DomainsTab.vue` — row actions and rule help text.
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/types.ts` only if the returned admin settings need a source marker for the UI.

## Implementation steps

1. Render each active-domain row with a compact Remove control, disabled with the existing pending/sync state.
2. For a manual domain, remove it from `props.site.manualDomains` and save via the existing `api.admin.updateSettings`; then use the returned settings to refresh the displayed list/status.
3. For a sync/frozen domain, make the action add its exact normalized name to the existing blacklist list and save through the same settings call. Label this as public-web removal so it does not imply MX/mail deletion.
4. Keep the blacklist textarea, but update its hint with supported grammar and precedence: `*.example.com` includes the base; a manual whitelist domain wins.
5. Do not add a confirmation modal, separate mutation endpoint, client-side domain matcher, or new component. Existing error/status/busy behavior covers this action.

## Success criteria

- Every whitelist row has one accessible Remove button.
- Removing a manual entry updates `manualDomains`; removing a synced/frozen entry saves an exact blacklist rule.
- A user can see how to create a wildcard rule and why a manual exception stays available.

## Todo

- [x] Add the per-domain remove action.
- [x] Reuse existing settings mutation and UI state handling.
- [x] Document expression and precedence semantics in the form.
