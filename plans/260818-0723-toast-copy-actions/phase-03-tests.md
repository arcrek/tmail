# Phase 3: Tests & i18n

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 1: [Toast core: action buttons](./phase-01-toast-actions-core.md)
- Phase 2: [InboxView new-mail toast with copy actions](./phase-02-inbox-new-mail-toast.md)
- Test precedent: `frontend/src/tests/toast.test.ts`, `frontend/src/tests/ToastStack.test.ts`, `frontend/src/tests/InboxView.test.ts`

## Overview

- Priority: P2
- Status: Done
- Add test coverage for the action-button mechanics and the InboxView integration; finalize i18n keys in both locales.

## Requirements

### Test coverage

- `toast.test.ts`: pushing a toast with actions sets the longer duration; actions array is carried on the entry; calling an action's `onClick` and then `dismiss` behaves as expected (mirror existing test structure for `success`/`error`).
- `ToastStack.test.ts`: renders action buttons when present, none when absent; clicking an action button calls its handler and removes the toast from the list.
- `InboxView.test.ts`: extend the existing new-message-detection test(s) to assert a toast fires with a Copy email action always present, and a Copy code action present only when the mocked new message's body contains an extractable code (mock `api.message` to return a body with/without a code across two cases). Assert first-load messages do **not** trigger a toast (same gate as the existing `Notification` assertion, if one exists — check current file).

### i18n

- New keys, both `en` and `vi` blocks in `frontend/src/i18n.ts`: `inbox.copyEmailAction`, `inbox.copyCodeAction`.

## Related Code Files

- Modify: `frontend/src/tests/toast.test.ts`
- Modify: `frontend/src/tests/ToastStack.test.ts`
- Modify: `frontend/src/tests/InboxView.test.ts`
- Modify: `frontend/src/i18n.ts`

## Implementation Steps

1. Extend `toast.test.ts` and `ToastStack.test.ts` per the requirements above.
2. Extend `InboxView.test.ts`'s new-message test(s) with the two code-present/code-absent cases and the first-load-no-toast case.
3. Add `inbox.copyEmailAction`/`inbox.copyCodeAction` to both locale blocks in `i18n.ts`.
4. Run `npm run build` and `npm run test` from `frontend/`; confirm no regressions in `MessageReader.test.ts` (untouched by this plan, but shares `verificationCode.ts` with `260818-0722-bulk-code-reader`) or existing toast/InboxView tests.

## Todo List

- [x] `toast.test.ts` covers action duration + entry shape
- [x] `ToastStack.test.ts` covers action rendering + click-to-dismiss
- [x] `InboxView.test.ts` covers code-present/code-absent/first-load-no-toast cases
- [x] New i18n keys present in both `en` and `vi`
- [x] `npm run build` and `npm run test` clean

## Success Criteria

- Full frontend test suite green.
- `npm run build` type-checks clean.

## Risk Assessment

- **Flaky async test for `announceToast`:** it's fire-and-forget (`void announceToast(item)`), so tests asserting the toast appeared need to `await` the microtask queue (e.g. `flushPromises` / `await nextTick()` twice, or wait on the mocked `api.message` promise) — follow whatever async-flushing convention `InboxView.test.ts` already uses elsewhere in the file for its polling assertions.

## Security Considerations

- None beyond Phases 1-2.

## Next Steps

- None — this closes out the plan.
