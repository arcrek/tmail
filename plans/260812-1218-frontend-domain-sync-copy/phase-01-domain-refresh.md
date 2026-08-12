# Phase 1 — Verify request-driven domain sync

## Files

- Verify: deployed `/admin/api/settings`, `/domains`, and browser network requests
- Verify: `/home/arcrek/workspace/tmail_add_domain/tests/test_public_api.py`
- Conditional modify: `/home/arcrek/workspace/tmail_add_domain/frontend/src/admin/DomainsTab.vue` only if existing sync failures need clearer operator-visible detail

## Root cause

`AddressPanel` calls `GET /domains` on mount. When `auto_sync_domains` is enabled, that endpoint calls `refresh_domains(require_auto=True)`; the manual admin endpoint calls the same function without the auto-enabled guard. This repository deliberately uses request-driven refresh, not a background or browser timer. Automatic failures are caught to preserve the last known cache, so a stale deployment, disabled setting, or upstream error can look like “it did not run.”

## Implementation

1. In the affected deployment, authenticate to the admin screen and check `autoSyncDomains`, `lastSync`, and `lastSyncError`; then load or reload the public address screen and confirm a `GET /domains` request occurs.
2. Confirm the response reflects the mail-server domains. If it does not, compare the deployed backend asset/version with this checkout and inspect the recorded sync error. Keep the cache-preserving error behavior.
3. Run the existing public API cases for enabled refresh, disabled auto-sync, failed refresh cache retention, and token retry. Add a regression only for a gap actually exposed by reproduction.
4. If the existing admin sync-history values do not make the failure actionable, display the already-returned last error alongside the domain picker/admin status. Do not add polling or a second sync implementation.

## Success criteria

- The deployed address screen issues `GET /domains`, and enabled auto-sync runs the shared refresh transaction.
- A failed automatic refresh preserves the last valid domain cache and leaves a visible, inspectable sync error.
- No browser timer or duplicate synchronization path is added.

## Result

Verified in this checkout: `AddressPanel` mounts `api.domains()`, `GET /domains` invokes the shared auto-sync transaction, and the existing public API tests cover enabled, disabled, and cache-preserving failure paths. `DomainsTab` already displays the recorded last sync error, so no code change is needed.

## Risks

If domains must refresh without a public request, that is a separately authorized server scheduler requirement; it is out of scope for this bug fix.
