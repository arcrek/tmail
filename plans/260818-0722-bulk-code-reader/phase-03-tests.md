# Phase 3: Tests & accessibility polish

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 1: [Shared code-extraction util + BulkCodeView core](./phase-01-core-view.md)
- Phase 2: [Auto-poll, manual refresh, nav wiring](./phase-02-poll-and-nav.md)
- Test conventions: `frontend/src/tests/BulkGenerateView.test.ts`, `frontend/src/tests/InboxView.test.ts`, `frontend/src/tests/MessageReader.test.ts`

## Overview

- Priority: P2
- Status: Done
- Close out i18n keys (EN + VI, both required — see `frontend/src/i18n.ts`'s two-locale pattern), add test coverage, and do an accessibility pass on the new table/form.

## Key Insights

- `frontend/src/tests/i18n.test.ts` likely asserts key parity between locales (verify during implementation) — every new key needs both an `en` and `vi` entry or that test breaks.
- `BulkGenerateView.test.ts` is the closest existing precedent for testing this kind of view (domain loading states, generate action, copy action) — follow its mocking style for `api.domains`/`api.token`/etc.

## Requirements

### Functional test coverage

- `frontend/src/tests/verificationCode.test.ts` (new): move/duplicate the extraction-behavior assertions currently implicit in `MessageReader.test.ts` into direct unit tests of `extractVerificationCode()` — subject match, text match, HTML match, no-match case, the existing "prefers the subject" case from `MessageReader.test.ts:116`.
- `frontend/src/tests/BulkCodeView.test.ts` (new):
  - Parses/dedupes/caps pasted addresses at 10, shows truncation notice above 10.
  - Submit resolves rows independently — one address erroring (mock `api.token` reject) doesn't prevent others from resolving.
  - Row with no messages shows empty-state, not an error.
  - Copy code / Copy email call `copyText` and surface a toast (mock `../clipboard`, assert `toast.success` fired — same pattern as `BulkGenerateView.test.ts`'s copy test).
  - Poll tick calls `api.messages`/`api.message` but **not** a second `api.token` for an already-resolved row (this is the test that guards the rate-limit-safety design decision — treat it as required, not optional).
  - Manual refresh button works independent of the interval timer (use fake timers, same as `InboxView.test.ts` likely does for its polling — confirm pattern during implementation).
- `frontend/src/tests/AppHeader.test.ts` (new or extend if it already exists under a different name — check first): new tab renders, emits `bulkCode`, `aria-current` reflects `bulkCodeActive`.
- Extend whatever test currently covers `App.vue`'s view switching (check for an existing `App.test.ts`/`address-flow.test.ts` — `address-flow.test.ts` is the likely home) to cover navigating to/from the new `'bulkCode'` view.

### Accessibility

- Textarea has a `<label>` (not just placeholder).
- Results table: proper `<table>`/`<th>` semantics or an ARIA-equivalent list structure consistent with how `InboxView`'s message list already handles this (check whether the codebase prefers real `<table>` or the div/role="table" pattern used elsewhere — match existing convention, don't introduce a third pattern).
- Row loading state is `aria-live="polite"` announced, error rows use `role="alert"` on the row's error text (consistent with `AddressPanel`'s `domainError` panel and `InboxView`'s `list-error`).
- Copy buttons have accessible names distinguishing "copy code for x@y" vs "copy email x@y" (not just generic "Copy" ×20 for a screen reader user scanning a 10-row table) — use `aria-label` with the address interpolated, same pattern as `AddressPanel`'s `address.forget: 'Forget {address}'`.

## Related Code Files

- Create: `frontend/src/tests/verificationCode.test.ts`
- Create: `frontend/src/tests/BulkCodeView.test.ts`
- Create or extend: `frontend/src/tests/AppHeader.test.ts` (check for existing coverage first)
- Extend: `frontend/src/tests/address-flow.test.ts` (or equivalent `App.vue`-level test) for the new view
- Modify: `frontend/src/i18n.ts` — final `bulkCode.*` key set (EN + VI): title/lede, textarea label + placeholder, submit button + loading label, truncation notice, table headers, empty-code/empty-subject placeholders, copy-code/copy-email aria-labels, refresh/refreshing, per-row error fallback

## Implementation Steps

1. Write `verificationCode.test.ts` covering the cases listed above.
2. Write `BulkCodeView.test.ts` covering parse/cap/dedupe, independent row resolution, empty-state, copy actions, and — critically — the no-extra-`/token`-on-poll assertion.
3. Add/extend `AppHeader` and `App`-level view-switch test coverage for the new tab/view.
4. Finalize and audit all `bulkCode.*` / `nav.bulkCode` i18n keys exist in both `en` and `vi` blocks in `frontend/src/i18n.ts`.
5. Accessibility pass: labels, live regions, `aria-label`s on copy buttons, table semantics matching existing convention.
6. Run `npm run build` (type-check) and `npm run test` from `frontend/`; fix any fallout in `MessageReader.test.ts` from the Phase 1 refactor.

## Todo List

- [x] `verificationCode.test.ts` passes, covers subject/text/HTML/no-match cases
- [x] `BulkCodeView.test.ts` passes, including the no-extra-token-on-poll assertion
- [x] Nav/view-switch test coverage added for the new tab
- [x] `i18n.test.ts` (or equivalent key-parity check) passes with new keys in both locales
- [x] `npm run build` and `npm run test` clean

## Success Criteria

- Full frontend test suite green (`npm run test` from `frontend/`).
- `npm run build` type-checks clean (`vue-tsc --noEmit`).
- A screen reader pass (manual, via the `run-tmail` skill or local dev server) confirms row status changes and copy actions are announced.

## Risk Assessment

- **Silent i18n key drift:** a new key present in `en` but missing in `vi` (or vice versa) — catch via the existing key-parity test, don't rely on manual review alone.
- **Table semantics inconsistency:** check existing convention (real `<table>` vs. div-based) before picking one for this feature — a third pattern in the same codebase is a maintainability regression, not a neutral choice.

## Security Considerations

- None beyond what Phases 1-2 already covered — this phase is tests/a11y/i18n only, no new runtime surface.

## Next Steps

- None — this closes out the plan. `260818-0723-toast-copy-actions` (blocked by this plan) can start once `verificationCode.ts` exists (end of this plan's Phase 1, in practice available well before Phase 3 finishes).
