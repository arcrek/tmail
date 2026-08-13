# Phase 4: i18n keys, tests, dead-code cleanup

## Context Links

- Plan overview: [plan.md](./plan.md)
- Depends on: [Phase 1](./phase-01-toast-core.md), [Phase 2](./phase-02-migrate-address-panel.md), [Phase 3](./phase-03-migrate-admin-tabs.md) — this phase only makes sense once all migrations landed.
- Files: `frontend/src/i18n.ts`, `frontend/src/tests/*.test.ts`, `frontend/src/styles.css`

## Overview

- Priority: P2
- Status: Pending
- Closes the loop: confirm the one i18n key needed (`toast.dismiss`, likely already added in Phase 1), add direct tests for the new toast module/component, fix the one existing test assertion broken by the migration, and delete now-dead CSS.

## Key Insights

- Searching the full codebase for existing test coverage of transient messages found exactly **one** assertion that will break: `frontend/src/tests/address-flow.test.ts:284` — `expect(wrapper.get('.form-error').text()).toContain('The access credential is invalid.')`. Everything else in `AdminApp.test.ts`/`address-flow.test.ts` asserts on input values or emitted events, not on the removed `status`/`error` DOM, so no other test file needs changes for the migration itself — but new tests for the toast behavior are still worth adding since it's new, previously-untested logic.
- `.form-status`/`.form-error` CSS (`styles.css:245`, `:1343`, `:1351`) becomes fully dead once Phases 2 and 3 both land — confirm with a repo-wide grep for `form-status`/`form-error` class usage in `.vue` templates before deleting (should return zero matches in templates; the CSS rules themselves are the only remaining hits).
- `.status-error` (`styles.css:1281`, used by `DomainsTab.vue`'s sync-history table) is a **different** class — do not delete it.

## Requirements

- `toast.ts`: unit tests for `push`/`success`/`error`/`dismiss`/auto-dismiss timing (use Vitest fake timers — codebase already uses Vitest, check existing test files for the fake-timer pattern if one exists, e.g. `InboxView.test.ts` likely fake-times its polling interval).
- `ToastStack.vue`: mount test confirming a pushed toast renders with correct `role`, text, and that the dismiss button removes it.
- `address-flow.test.ts:284`: update to assert the toast renders the message instead of `.form-error` (selector becomes something like `.toast-error` or a `role="alert"` query — match whatever `ToastStack.vue` actually renders after Phase 1).
- Grep for `initial-error`/`initialError` and `form-error`/`form-status` across `frontend/src/tests/` — confirm no other test references either the removed prop or the removed classes; fix any found.
- Dead CSS removal only after confirming zero template references remain.

## Architecture

No new architecture — this is verification + one assertion fix + incremental test coverage for the genuinely new module (`toast.ts`/`ToastStack.vue` didn't exist before this plan, so they're the only pieces needing net-new tests; the 5+1 migrated files already have coverage for their surrounding behavior and only need their one broken assertion fixed).

## Related Code Files

- Modify: `frontend/src/i18n.ts` (confirm `toast.dismiss` present — should already be done in Phase 1; this is a checkpoint, not new work)
- Modify: `frontend/src/tests/address-flow.test.ts` (fix line ~284)
- Create: `frontend/src/tests/toast.test.ts`
- Create: `frontend/src/tests/ToastStack.test.ts`
- Modify: `frontend/src/styles.css` (delete dead `.form-status`/`.form-error` rules)

## Implementation Steps

1. Grep `frontend/src` for `form-error`/`form-status`/`initialError`/`initial-error` — enumerate every remaining hit.
2. Fix `address-flow.test.ts:284` to query the toast instead.
3. Write `toast.test.ts`: push a success and an error toast, assert both appear in `toasts.value`; call `dismiss`, assert removal; advance fake timers past 5000ms, assert auto-removal; push an empty-string message, assert no-op (no entry added).
4. Write `ToastStack.test.ts`: mount with a toast pushed via `useToast().success(...)`, assert rendered text + `role="status"`; push via `.error(...)`, assert `role="alert"`; click dismiss button, assert element removed from DOM.
5. Run full suite: `cd frontend && npm run test`.
6. Run `npm run build` (includes `vue-tsc --noEmit`) to catch any type drift from the deleted props/refs across all 4 phases.
7. Delete the now-dead `.form-status`/`.form-error` rules from `styles.css` (keep `.status-error` — different class, still used by `DomainsTab.vue`).
8. Re-run `npm run test` once more after the CSS deletion (CSS deletion shouldn't affect JS tests, but confirms nothing broke).

## Todo List

- [ ] `toast.dismiss` i18n key confirmed present (en + vi)
- [ ] `address-flow.test.ts:284` updated
- [ ] `toast.test.ts` created and passing
- [ ] `ToastStack.test.ts` created and passing
- [ ] Repo-wide grep for `form-error`/`form-status`/`initialError` in templates returns zero hits
- [ ] Dead `.form-status`/`.form-error` CSS removed (`.status-error` preserved)
- [ ] `npm run test` passes
- [ ] `npm run build` passes (`vue-tsc --noEmit` + `vite build`)

## Success Criteria

- Full frontend test suite green.
- Type-check clean.
- No dead CSS classes, no dead props, no dead refs left behind from the migration.

## Risk Assessment

- If any test file beyond the one identified turns out to assert on `.form-error`/`.form-status` text (missed by the initial grep), fix it in this phase rather than deferring — this phase is the designated checkpoint for exactly that.

## Security Considerations

- None beyond what's already covered in Phases 1-3 (plain-text rendering only).

## Next Steps

- None — this is the final phase. After merge, this plan is complete.
