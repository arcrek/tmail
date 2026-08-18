# Phase 2: Tests, i18n, accessibility

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 1: [Inline create form + App.vue in-place switch](./phase-01-inline-create.md)
- Test precedent: `frontend/src/tests/InboxView.test.ts`, `frontend/src/tests/address-flow.test.ts`

## Overview

- Priority: P2
- Status: Done
- Test coverage for the inline create flow, finalize i18n keys (reusing `address.create` for the section title; new keys only for anything genuinely new), accessibility pass on the collapsible region.

## Requirements

### Test coverage

- `InboxView.test.ts`:
  - Section is collapsed by default; no `/domains` request fires until expanded.
  - Expanding loads domains; submitting with a valid local part + domain emits `create` with the expected `{ address, token }` payload (mock `api.token`).
  - Random shortcut fills fields and submits in one action.
  - Domain-load failure inside the section shows an inline error, doesn't affect the message list rendering elsewhere in the same test's DOM.
  - Submit failure (mock `api.token` reject) surfaces via `toast.error` (mock `../toast` per existing convention in this test file), form stays open/editable (doesn't silently vanish on error).
- `address-flow.test.ts` (or wherever `App.vue`'s end-to-end open/switch flow is covered): extend to cover the new `@create` path — from an open inbox, triggering the emit switches `current`/URL to the new session, same assertions the existing "open a new address" flow already makes for other entry points.

### i18n

- Reuse `address.create` for the section toggle/heading (already exists, both locales).
- New keys only if the implementation needs copy beyond what `address.*`/`inbox.*` already cover for local-part/domain fields, submit/loading states, and random button (check first — `address.name`, `address.domain`, `address.random`, `address.opening` likely all reuse directly; only add new keys for anything InboxView-specific, e.g. a toggle-button `aria-expanded` label or empty/error copy scoped to this section that doesn't already exist).

### Accessibility

- Toggle button has `aria-expanded` reflecting `createOpen`, and `aria-controls` pointing at the collapsible region's id.
- Collapsible region reachable/dismissable by keyboard (native `<details>`/`<summary>` gets this for free if that's the chosen implementation; a custom div region needs explicit focus management matching how `UnlockControl.vue` or another existing collapsible-ish component in this codebase handles it — check precedent).
- Form field labels present (not placeholder-only), same as every other address form in the app.

## Related Code Files

- Modify: `frontend/src/tests/InboxView.test.ts`
- Modify: `frontend/src/tests/address-flow.test.ts` (or the actual file covering `App.vue`'s navigation flows — confirm exact filename during implementation)
- Modify: `frontend/src/i18n.ts` — only if new keys are genuinely needed per the audit above

## Implementation Steps

1. Extend `InboxView.test.ts` with the collapsed-by-default / lazy-load / submit-success / submit-error / random-shortcut cases above.
2. Extend the `App.vue`-level navigation test with the new `@create` in-place-switch case.
3. Audit i18n key reuse vs. new-key need; add only what's missing to both `en` and `vi` blocks.
4. Accessibility pass on the toggle + collapsible region per the requirements above.
5. Run `npm run build` and `npm run test` from `frontend/`.

## Todo List

- [x] `InboxView.test.ts` covers collapsed-default, lazy-load, submit success/failure, random shortcut
- [x] App-level navigation test covers the new in-place `@create` switch
- [x] i18n key audit done — no missing/orphaned keys, both locales in sync
- [x] Toggle button has correct `aria-expanded`/`aria-controls`
- [x] `npm run build` and `npm run test` clean

## Success Criteria

- Full frontend test suite green.
- `npm run build` type-checks clean.
- Manual keyboard-only pass: tab to the toggle, expand, tab through the form, submit, land on the new inbox — no keyboard trap, no unreachable control.

## Risk Assessment

- **i18n key sprawl:** resist adding new keys for things `address.*` already covers just because the mount point differs — audit before adding, per the plan's design decision to reuse `address.create`.

## Security Considerations

- None beyond Phase 1's — this phase is tests/a11y/i18n only.

## Next Steps

- None — this closes out the plan.
