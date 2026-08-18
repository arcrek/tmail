# Phase 2: Auto-poll, manual refresh, nav wiring

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 1: [Shared code-extraction util + BulkCodeView core](./phase-01-core-view.md)
- Polling/visibility pattern to mirror: `frontend/src/components/InboxView.vue` (`startPolling`/`stopPolling`/`handleVisibility`, `site.fetchSeconds`)
- Nav tab pattern to mirror: `frontend/src/components/AppHeader.vue` (`bulk-link`, `bulkActive` prop, `bulk` emit), `frontend/src/App.vue` (`view` union, `openBulk`)

## Overview

- Priority: P2
- Status: Pending
- Add interval-based auto-refresh of the results table (pausable when the tab is hidden), a manual "Refresh" button, and wire the new view into the header nav + `App.vue`'s view switch.

## Key Insights

- **Do not re-call `/token` on poll ticks.** Reuse the `Map<string, string>` token cache built in Phase 1's `resolveRow`. Poll ticks call only `api.messages`/`api.message` (not covered by the 10/60s fixed-window limiter on `/token`). Only re-issue a token if a cached one comes back 401/expired on a poll tick, and then only for that one row.
- `InboxView.vue` already has the exact pause-on-hidden pattern needed (`document.addEventListener('visibilitychange', handleVisibility)` + `window.clearInterval`) — copy the shape, not the address-specific logic.
- `site.fetchSeconds` (from `GET /site`, default 20s) is the existing app-wide polling cadence — reuse it for consistency rather than inventing a separate interval for this view. `BulkCodeView` needs access to it, so it must be passed down as a prop from `App.vue` the same way `InboxView` receives `fetch-seconds`.
- Existing `AppHeader.vue` has exactly one bulk-style tab (`bulk-link` / `nav.bulk` = "Bulk generate"). This phase adds a **second, separate** tab — do not repurpose or rename the existing one (avoid an unrelated i18n/key rename touching `BulkGenerateView`'s tests).

## Requirements

### Functional

- `BulkCodeView.vue` gains a `fetchSeconds` prop (same contract as `InboxView`'s).
- On mount (after first successful submit), start an interval that re-runs the fetch-latest-message step (steps 2-3 from Phase 1, skipping step 1 when a token is cached) for every row currently in the table. Stop/restart the interval on `visibilitychange`, same as `InboxView`.
- A manual "Refresh" button (`inbox.refresh`/`inbox.refreshing`-equivalent copy, new `bulkCode.refresh`/`bulkCode.refreshing` keys) re-runs the same cycle immediately, independent of the interval timer, disabled while a refresh is already in flight.
- If the address list itself hasn't been submitted yet (no rows), there's nothing to poll — interval only starts after the first successful submit.
- Editing the textarea and resubmitting resets rows and restarts polling against the new address list (old interval cleared first — mirror `InboxView`'s `resetSession`/`watch` pattern for the "switch session" cleanup, but triggered by submit here instead of a prop watch).
- `AppHeader.vue`: add a second nav link, prop `bulkCodeActive?: boolean` (default `false`), new emit `bulkCode: []`, new i18n key `nav.bulkCode`. Keep `bulk`/`bulkActive`/`nav.bulk` untouched.
- `App.vue`: extend `View` union to `'address' | 'inbox' | 'admin' | 'bulk' | 'bulkCode'`, add `openBulkCode()` (mirrors `openBulk()`), mount `<BulkCodeView v-else-if="view === 'bulkCode'" :access-token="accessToken" :fetch-seconds="site?.fetchSeconds ?? 20" />`, pass `:bulk-code-active="view === 'bulkCode'"` and `@bulk-code="openBulkCode"` to `AppHeader`.

### Non-functional

- Poll ticks must not spam `/token` — this is the one hard constraint carried over from Phase 1's design decision; verify manually (network tab) during implementation that a sustained poll issues zero additional `/token` calls once tokens are cached.

## Architecture

```
App.vue
  view: 'address' | 'inbox' | 'admin' | 'bulk' | 'bulkCode'
  openBulkCode() → navigationVersion += 1; view.value = 'bulkCode'
  <AppHeader :bulk-code-active="view === 'bulkCode'" @bulk-code="openBulkCode" ... />
  <BulkCodeView v-else-if="view === 'bulkCode'" :access-token :fetch-seconds />

AppHeader.vue
  nav: [docs] [bulk-link "Bulk generate"] [bulk-code-link "Bulk read"] [admin-link] ...

BulkCodeView.vue (extends Phase 1)
  + prop fetchSeconds: number
  + let interval: number | undefined
  + startPolling() / stopPolling() / handleVisibility()  — mirrors InboxView
  + refresh(): re-run fetch-latest-message for all rows, skip token re-issue when cached
  + manual "Refresh" button calls refresh() directly
  + onMounted/onBeforeUnmount: add/remove visibilitychange listener, clear interval
```

## Related Code Files

- Modify: `frontend/src/components/BulkCodeView.vue` (from Phase 1) — add polling/refresh
- Modify: `frontend/src/components/AppHeader.vue` — second nav tab
- Modify: `frontend/src/App.vue` — `View` union, `openBulkCode`, mount point, prop/emit wiring
- Modify: `frontend/src/i18n.ts` — `nav.bulkCode` (EN + VI), `bulkCode.refresh`/`bulkCode.refreshing` (full key list closed out in Phase 3)

## Implementation Steps

1. Add `fetchSeconds` prop to `BulkCodeView.vue`; extract the per-row "fetch latest message" logic from Phase 1's `resolveRow` into a reusable function that accepts "skip token fetch if cached" as implicit behavior (cache lookup first, fall back to issuing).
2. Implement `startPolling`/`stopPolling`/`handleVisibility`, copying `InboxView.vue`'s shape; start polling only after the first successful submit populates `rows`.
3. Add the manual "Refresh" button, disabled while any row is `loading` from either the interval or a manual click (single in-flight guard, same `refreshing` boolean pattern as `InboxView`).
4. Resubmitting (textarea changed, button clicked again) clears the old interval, resets `rows`, and restarts the flow against the new address list.
5. `AppHeader.vue`: add `bulkCodeActive` prop, `bulkCode` emit, second `<a>` nav link with its own `data-*`/class hook, `nav.bulkCode` i18n key.
6. `App.vue`: extend `View` union, add `openBulkCode`, mount `BulkCodeView` with `fetch-seconds`, wire `AppHeader` props/emit.

## Todo List

- [ ] Poll tick issues zero `/token` calls when all rows have cached tokens (manually verified)
- [ ] Polling pauses when tab hidden, resumes on visible (mirrors `InboxView` behavior)
- [ ] Manual Refresh button works independently of the interval, disabled while in flight
- [ ] Resubmitting the address list restarts polling cleanly (no duplicate intervals — check via a second `setInterval` not firing after resubmit)
- [ ] New "Bulk read" tab appears in header nav, navigates to the view, `aria-current` reflects active state like the existing "Bulk generate" tab

## Success Criteria

- Leaving the Bulk read tab open across several poll intervals shows updated codes for addresses that receive new mail, without any extra `/token` request beyond the initial batch.
- Switching browser tabs away and back resumes polling without a stale/frozen table.
- Header nav shows both "Bulk generate" and "Bulk read" as independent, correctly-highlighted tabs.

## Risk Assessment

- **Duplicate intervals:** always `stopPolling()`/clear before `startPolling()`/resubmit — same discipline `InboxView.vue` already follows; a missed clear would double the poll rate and silently double `/messages` traffic.
- **Interval outliving unmount:** must clear in `onBeforeUnmount`, same as `InboxView`, or navigating away from Bulk read while polling would leak a timer against an unmounted component's now-stale closures.

## Security Considerations

- No new surface beyond Phase 1's — this phase only changes call *cadence*, not *what* is called or *who* can call it.

## Next Steps

- Phase 3 covers tests (regex extraction, row resolution, polling behavior, nav wiring) and accessibility pass.
