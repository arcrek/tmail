# Phase 2 — Frontend: render domain stats + MX failures on Dashboard

## Overview

**Priority:** P1
**Status:** Done
**Estimate:** 1.5h
**Depends on:** Phase 1 (`recentMxFailures` must exist on the `/dashboard` response)

## Related code files

- Modify: `frontend/src/types.ts` — `DashboardResource.domains` gains
  `recentMxFailures: Array<{ kind: string; domain: string; detail: string | null; created_at: string }>`.
- Modify: `frontend/src/admin/DashboardTab.vue` — the type already includes `active`,
  `domainsToday`, `domainsSevenDays`, `recentDomains`, but the template currently renders none of
  them. This phase adds both the pre-existing-but-unrendered domain metrics and the new MX
  failures list in one pass, since they share the same "domains" section of the dashboard.
- Modify: `frontend/src/i18n.ts` — new `dashboard.domainsActive`, `dashboard.domainsToday`,
  `dashboard.domainsWeek`, `dashboard.mxFailures`, `dashboard.mxFailuresEmpty` (EN + VI).
- Add: `frontend/src/tests/DashboardTab.test.ts` (none exists today — confirmed during planning).

## Implementation steps

1. Add a second `<dl class="metric-grid">` (or extend the existing one) below the messages
   metrics, rendering `dashboard.domains.active`, `.domainsToday`, `.domainsSevenDays` the same
   way the messages metrics already do (`formatNumber(...)`) — this is display-only, the data is
   already returned by `/dashboard` today.
2. Add a "Recent MX failures" section: a list (`<ul>` or reuse whatever list pattern
   `recentDomains`-style data would use elsewhere in the admin UI — check `DomainsTab.vue` for an
   existing row/list component before inventing new markup) showing each `recentMxFailures` entry:
   domain, kind (`mx_mismatch` vs `mx_lookup_error` — map to human copy via i18n, don't render the
   raw kind string), and relative/formatted `created_at` (reuse `formatDate` if imported here, or
   the existing date formatter pattern from `InboxView.vue`/`useI18n()`).
3. Empty state: when `recentMxFailures` is empty, show `dashboard.mxFailuresEmpty` instead of an
   empty list — don't just render nothing (matches this app's existing empty-state conventions,
   e.g. `inbox.waiting`).
4. Add `DashboardTab.test.ts`:
   - renders domain metrics (`active`/today/seven-day) from a mocked `/dashboard` response.
   - renders MX failure entries with correct kind-to-copy mapping.
   - renders the empty state when `recentMxFailures` is `[]`.
   - existing loading/error states (skeleton, error message) still work — check they're not
     broken by the added markup.

## Success criteria

- Domain provisioning stats (`active`, today, seven-day count) that were already computed by the
  backend are now visible to the admin — this was a pre-existing dead-data gap, now closed.
- Admin can see the last 10 MX check failures (mismatch or DNS error) with domain + kind + when,
  without digging into server logs.
- No change to `/dashboard`'s existing `messages` rendering or loading/error handling.

## Todo

- [x] Add `recentMxFailures` to the `DashboardResource` type.
- [x] Render the already-returned `domains.active`/`domainsToday`/`domainsSevenDays`.
- [x] Render `recentMxFailures` with a kind-to-copy mapping and empty state.
- [x] Add the 5 new i18n keys (EN + VI).
- [x] Create `DashboardTab.test.ts` with the 4 cases above.
- [x] Run `npm test -- --run src/tests/DashboardTab.test.ts`.
