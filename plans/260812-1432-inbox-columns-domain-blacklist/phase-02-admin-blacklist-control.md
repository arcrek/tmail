# Phase 2 — Expose blacklist in domain administration

## Overview

**Priority:** P2  
**Status:** Completed  
**Estimate:** 1h

Add the setting to the existing Domains & Inbox form using the established multi-line domain-list control.

## Related code files

- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/types.ts` — add `blacklistedDomains` to `AdminSiteSettings`.
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/admin/DomainsTab.vue` — hydrate, edit, submit, and describe the blacklist.
- Modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/tests/AdminApp.test.ts` — add the new fixture property and assert saved payload/UI behavior.

## Implementation steps

1. Extend the admin type with `blacklistedDomains: string[]`; no public `SiteResource` field is needed.
2. Add `draft.blacklistedDomains`, reset it in the existing props watcher, and include `list(draft.blacklistedDomains)` in the existing `updateSettings({ site })` save request.
3. Add one labeled textarea beside the existing domain list inputs: “Blacklisted web domains”, with concise help that mail is still received but the public website cannot create or open inboxes for those domains.
4. Reuse current busy/disabled, error, and status behavior. Do not create a separate save button/API call.
5. Update test fixtures and assert the setting round-trips in the save payload.

## Success criteria

- Admins can save a comma/newline list and see it after settings reload.
- The control cannot be edited during existing save/sync operations.
- No public page receives the blacklist value.

## Todo

- [x] Extend admin types and form draft.
- [x] Render and submit the blacklist textarea.
- [x] Cover the save contract in frontend tests.
