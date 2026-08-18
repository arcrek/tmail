# Phase 2: Tests & verification

## Context Links

- Plan: [plan.md](./plan.md)
- Prior phase: [Bulk generate feature](./phase-01-bulk-generate-feature.md)
- Existing test patterns: `frontend/src/tests/address-flow.test.ts`, `frontend/src/tests/InboxView.test.ts`
- Project test commands: see `CLAUDE.md` "Frontend" section (`npm run test`, `npx vitest run <file>`)

## Overview

- **Priority:** P2
- **Status:** Completed
- Cover the new util and component with unit tests, confirm no regression in the refactored `AddressPanel.vue`, and do one live manual pass via the `run-tmail` skill.

## Key Insights

- `frontend/src/tests/` uses Vitest + Vue Test Utils (confirm exact mounting helpers used in `address-flow.test.ts` and mirror them for consistency — same `api` mocking approach, same `useI18n`/toast provider setup if any).
- `crypto.getRandomValues` must be available in the Vitest/jsdom environment — `address-flow.test.ts`'s existing "randomize" coverage already depends on it working today, so no new environment setup should be needed; confirm by grepping that file for how it asserts on `randomize()` output (if it does) before writing new tests.

## Requirements

- Unit test `randomAddress.ts` in isolation (no DOM needed): uniqueness within a batch, respects `count`, `randomDomain` only returns domains from the given list.
- Component test for `BulkGenerateView.vue`: loading/error/empty states render, Generate produces the right number of rows, clicking a row's open button calls `window.open` with the expected `'/{encodeURIComponent(address)}'` path and `'_blank'` target (mock `window.open`), clicking copy calls the clipboard helper.
- Regression-check `AddressPanel.vue` after the `randomize()` refactor — existing `address-flow.test.ts` must pass unmodified (or with only the minimal changes needed if it asserts on internal implementation details rather than behavior).
- `AppHeader.vue` / `App.vue` wiring: at minimum, a test (new or added to an existing App-level test if one exists — check `frontend/src/tests/` for an `App.test.ts` before creating one) confirming clicking the header's bulk tab swaps the rendered view, and the brand/home link returns from it.
- `npm run build` (runs `vue-tsc --noEmit`) must pass — new component/util must be fully typed, no `any`.

## Architecture

No new architecture — this phase is test-only plus one manual verification pass.

## Related Code Files

**Create:**
- `frontend/src/tests/randomAddress.test.ts`
- `frontend/src/tests/BulkGenerateView.test.ts`

**Modify (only if needed after checking current coverage):**
- `frontend/src/tests/address-flow.test.ts` (only if it breaks or should gain a header-tab-navigation case)

## Implementation Steps

1. Read `frontend/src/tests/address-flow.test.ts` fully to learn the established mocking pattern for `api.domains`/`api.token` and any test-utils helpers before writing new tests (don't invent a second pattern).
2. Write `randomAddress.test.ts`: pure function tests, no mounting needed.
3. Write `BulkGenerateView.test.ts` following the same mount/mock conventions as `address-flow.test.ts`.
4. Run `npx vitest run frontend/src/tests/address-flow.test.ts` — confirm the `AddressPanel.vue` refactor didn't break it.
5. Run full `npm run test` and `npm run build` from `frontend/`.
6. Use the `run-tmail` skill for one live pass: start the app, open the bulk tab, generate a batch, click "open in new tab" on one row, screenshot confirming the destination tab shows a working inbox.

## Todo List

- [x] `randomAddress.test.ts` covers uniqueness, count bounds, domain restriction
- [x] `BulkGenerateView.test.ts` covers loading/error/empty/populated states, generate count, open-in-new-tab call, copy call
- [x] `address-flow.test.ts` passes unchanged (or updated only for genuinely new coverage, not to work around a broken refactor)
- [x] `npm run test` green
- [x] `npm run build` green (type-checks the new files)
- [x] `run-tmail` manual pass: generate → open in new tab → inbox loads, screenshot captured

## Success Criteria

- All new and existing frontend tests pass.
- Type-check passes with no new `any`/`@ts-ignore`.
- Manual `run-tmail` pass confirms end-to-end: header tab → generate → new tab opens a real, working inbox for a freshly-generated address.

## Risk Assessment

- **Mock drift:** if `address-flow.test.ts` mocks `window.crypto.getRandomValues` in a way that's file-scoped, the new util test file needs its own equivalent setup — check for a shared test-setup file (`vitest.config`/`setupFiles`) before duplicating.
- **`window.open` in jsdom:** jsdom implements `window.open` as a no-op returning `null` by default; tests should spy/mock it (`vi.spyOn(window, 'open')`) rather than relying on real navigation.

## Security Considerations

None beyond what phase 1 already covers — this phase is test/verification only.

## Next Steps

None — final phase of this plan.
