# Phase 2: Visual auto-refresh countdown indicator

## Context Links

- Plan: [plan.md](./plan.md)
- Inbox view component: `frontend/src/components/InboxView.vue`
- Global styles: `frontend/src/styles.css`
- Translation catalogs: `frontend/src/i18n.ts`
- Tests: `frontend/src/tests/InboxView.test.ts`

## Overview

- Priority: P2
- Status: Completed
- Add dynamic auto-refresh countdown indicator and progress ring/bar to `InboxView.vue` giving instant visual feedback on upcoming mail polls, pausing cleanly on inactive tabs, and collapse the inline create address form into a clean expandable accordion/disclosure to un-clutter the sidebar.

## Key Insights

- In `InboxView.vue`, auto-refresh currently runs on a `setInterval` or `setTimeout` driven by `fetchSeconds` (e.g. 20s or user setting). The only indicator is static text "Auto-refreshes every 20s" or a spinner only when actively fetching.
- Users have no indication of how many seconds remain before the next automatic check.
- Providing a visual progress / countdown (e.g., "Refreshes in 14s" with animated progress ring or pill bar) makes mailbox activity transparent and responsive.
- Must pause countdown and timer when document is hidden (`document.visibilityState === 'hidden'`) and immediately check/reset when page becomes visible again.
- Manual refresh click resets the countdown cycle smoothly.
- Section `#inbox-create-address` currently renders always-open, taking up massive vertical space on the sidebar / hero. Wrapping it in a collapsible disclosure (`createExpanded = ref(false)`) lets the user reveal it when needed while keeping the inbox view focused on the active address and message list.
## Requirements

### Functional

1. **Auto-refresh countdown state (`InboxView.vue`):**
   - Track seconds remaining until next auto-fetch (`remainingSeconds`).
   - Tick countdown every second when inbox polling is active.
   - When reaching 0, trigger refresh and reset `remainingSeconds` to configured interval.
2. **Visual countdown presentation:**
   - Display a compact, elegant countdown badge / pill next to the manual refresh button or in inbox meta.
   - Show dynamic label: e.g. "Auto-refresh in 18s" / "Tự làm mới sau 18s" or compact circular ring / progress pill.
3. **Visibility change handling:**
   - On `visibilitychange`, pause the interval if hidden to save battery / network.
   - On tab re-focus (`visible`), trigger an immediate refresh or sync countdown.
4. **Manual refresh reset:**
   - Clicking manual refresh resets `remainingSeconds` back to full duration.
5. **Collapsible "Create an address" disclosure:**
   - Add expand/collapse toggle for `#inbox-create-address` (e.g. `<button class="inbox-create-toggle">` or `<details>`).
   - When collapsed, only the "+ Create an address" toggle button is visible; when expanded, the full form renders and auto-loads domains if not yet loaded.
### Non-functional

- Smooth CSS transition without layout jitter or jumps.
- Proper accessibility `aria-live="polite"` or `aria-label` where appropriate.
- i18n keys for auto-refresh countdown in both `en` and `vi`.
- Vitest unit tests covering countdown ticking, manual reset, and lifecycle cleanup.

## Related Code Files

- Modify: `frontend/src/components/InboxView.vue`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/tests/InboxView.test.ts`

## Implementation Steps

1. In `frontend/src/i18n.ts`, add translation keys:
   - `inbox.refreshIn`: `Auto-refresh in {n}s` / `Tự làm mới sau {n}s`
   - `inbox.refreshing`: `Refreshing...` / `Đang làm mới...`
2. In `frontend/src/components/InboxView.vue`:
   - Add `remainingSeconds` reactive ref initialized to refresh interval.
   - Add 1-second interval ticker that decrements `remainingSeconds`.
   - On manual refresh, reset `remainingSeconds`.
   - On `onUnmounted`, clear all intervals cleanly.
   - Add countdown pill / indicator element next to manual refresh trigger.
   - Add `createExpanded = ref(false)` state. Toggle button switches `createExpanded`. Only load domains when expanded for the first time.
   - Style `.refresh-countdown-pill` with subtle badge styling, animated SVG ring or smooth width bar matching the palette.
4. Update unit tests in `frontend/src/tests/InboxView.test.ts` to test countdown interval ticking and manual reset.
5. Run full test suite to verify.

## Todo List

- [x] Add i18n keys for auto-refresh countdown in `en` and `vi`
- [x] Add `remainingSeconds` timer logic and visibility listener to `InboxView.vue`
- [x] Add collapsible toggle for the Create address section in `InboxView.vue`
- [x] Add countdown UI indicator in `InboxView.vue`
- [x] Update `InboxView.test.ts` with timer/countdown test cases
- [x] Verify test suite passes 100%

## Success Criteria

- Inbox shows clear, dynamic countdown indicator for next automatic poll.
- Countdown resets on manual refresh and unmounts cleanly without timer leaks.
- Pauses cleanly in background tab and resumes on focus.
- All unit tests pass cleanly.
